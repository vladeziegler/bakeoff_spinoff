# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import json
import asyncio
import base64
import warnings
import time
from collections import OrderedDict

from pathlib import Path
from dotenv import load_dotenv

from google.genai.types import (
    Part,
    Content,
    Blob,
    VoiceConfig,
    PrebuiltVoiceConfigDict,
    SpeechConfig,
)

from google.adk.runners import InMemoryRunner
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from starlette.websockets import WebSocketDisconnect
from google.adk.agents.run_config import StreamingMode
from google_search_agent.agent import root_agent

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

#
# ADK Streaming
#

# Load Gemini API Key
load_dotenv()

APP_NAME = "ADK Streaming example"


# Session management with limits and timeouts
MAX_SESSIONS = 10  # Maximum concurrent sessions
SESSION_TIMEOUT = 300  # 5 minutes in seconds
SESSIONS_CACHE = OrderedDict()  # LRU cache
SESSION_TIMEOUTS = {}  # user_id -> timeout_task


async def restart_agent_turn(runner, session, live_request_queue, run_config):
    """Restarts the agent's turn to enable multi-turn conversations."""
    # Pass the run_config to ensure the agent's behavior (like audio output) is consistent across turns.
    return runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )


async def cleanup_session(user_id: str):
    """Clean up a cached session and its resources."""
    if user_id in SESSIONS_CACHE:
        runner, session, run_config = SESSIONS_CACHE[user_id]
        try:
            await runner.session_service.delete_session(session.id)
        except Exception as e:
            print(f"Error deleting session {session.id}: {e}")

        # Remove from cache
        del SESSIONS_CACHE[user_id]
        print(f"Session for user {user_id} cleaned up")

    # Cancel timeout if exists
    if user_id in SESSION_TIMEOUTS:
        SESSION_TIMEOUTS[user_id].cancel()
        del SESSION_TIMEOUTS[user_id]


async def session_timeout_handler(user_id: str):
    """Handle session timeout by cleaning up the session."""
    await asyncio.sleep(SESSION_TIMEOUT)
    print(f"Session timeout for user {user_id}")
    await cleanup_session(user_id)


async def ensure_session_limit():
    """Ensure we don't exceed the maximum number of sessions."""
    while len(SESSIONS_CACHE) >= MAX_SESSIONS:
        # Remove the oldest session (LRU)
        oldest_user_id = next(iter(SESSIONS_CACHE))
        print(f"Session limit reached, removing oldest session: {oldest_user_id}")
        await cleanup_session(oldest_user_id)


async def start_agent_session(user_id, is_audio=False):
    """Starts an agent session"""

    # Create a Runner
    runner = InMemoryRunner(
        app_name=APP_NAME,
        agent=root_agent,
    )

    # Create a Session
    session = await runner.session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,  # Replace with actual user ID
    )

    # Set response modality
    modality = "AUDIO" if is_audio else "TEXT"

    voice_config = VoiceConfig(
        prebuilt_voice_config=PrebuiltVoiceConfigDict(voice_name="Aoede")
    )
    speech_config = SpeechConfig(voice_config=voice_config)
    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        speech_config=speech_config,
        enable_affective_dialog=True,
        proactivity={
            "proactive_audio": True
        },  # https://googleapis.github.io/python-genai/genai.html#genai.types.ProactivityConfigDict
        # output_audio_transcription={},
        # input_audio_transcription={},
        realtime_input_config={
            "automaticActivityDetection": {
                "disabled": True,
                "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                "endOfSpeechSensitivity": "END_SENSITIVITY_HIGH",
                "prefixPaddingMs": 20,
                "silenceDurationMs": 100,
            },
            "activityHandling": "NO_INTERRUPTION",
            "turnCoverage": "TURN_INCLUDES_ALL_INPUT",
        },
    )
    # run_config = RunConfig(response_modalities=[modality])

    return runner, session, run_config


async def agent_to_client_messaging(
    websocket, live_events, shutdown_signal: asyncio.Event
):
    """Agent to client communication"""
    try:
        get_next_event_task = asyncio.create_task(anext(live_events))
    except StopAsyncIteration:
        print("[AGENT TO CLIENT] Live events finished at start.")
        return

    shutdown_task = asyncio.create_task(shutdown_signal.wait())

    while not shutdown_signal.is_set():
        done, pending = await asyncio.wait(
            [get_next_event_task, shutdown_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        if shutdown_task in done:
            print("[AGENT TO CLIENT] Shutdown signal received, exiting.")
            get_next_event_task.cancel()
            break

        try:
            event = get_next_event_task.result()
        except StopAsyncIteration:
            print("[AGENT TO CLIENT] Live events finished.")
            break

        # Schedule the next event read before processing the current one
        get_next_event_task = asyncio.create_task(anext(live_events))

        # If the turn complete or interrupted, send it
        if event.turn_complete or event.interrupted:
            message = {
                "turn_complete": event.turn_complete,
                "interrupted": event.interrupted,
            }
            await websocket.send_text(json.dumps(message))
            print(f"[AGENT TO CLIENT]: {message}")
            continue

        # Read the Content and its first Part
        part: Part = event.content and event.content.parts and event.content.parts[0]
        if not part:
            continue

        # If it's audio, send Base64 encoded audio data
        is_audio = part.inline_data and part.inline_data.mime_type.startswith(
            "audio/pcm"
        )
        if is_audio:
            audio_data = part.inline_data and part.inline_data.data
            if audio_data:
                message = {
                    "mime_type": "audio/pcm",
                    "data": base64.b64encode(audio_data).decode("ascii"),
                }
                await websocket.send_text(json.dumps(message))
                print(f"[AGENT TO CLIENT]: audio/pcm: {len(audio_data)} bytes.")
                continue

        # If it's text and a parial text, send it
        if part.text and event.partial:
            message = {"mime_type": "text/plain", "data": part.text}
            await websocket.send_text(json.dumps(message))
            print(f"[AGENT TO CLIENT]: text/plain: {message}")


async def client_to_agent_messaging(
    websocket,
    live_request_queue,
    shutdown_signal: asyncio.Event,
):
    """Client to agent communication"""
    receive_task = asyncio.create_task(websocket.receive_text())
    shutdown_task = asyncio.create_task(shutdown_signal.wait())

    while not shutdown_signal.is_set():
        done, pending = await asyncio.wait(
            [receive_task, shutdown_task], return_when=asyncio.FIRST_COMPLETED
        )

        if shutdown_task in done:
            print("[CLIENT TO AGENT] Shutdown signal received, exiting.")
            receive_task.cancel()
            break

        try:
            message_json = receive_task.result()
        except WebSocketDisconnect:
            print("[CLIENT TO AGENT] WebSocket disconnected.")
            break

        # Schedule the next receive before processing
        receive_task = asyncio.create_task(websocket.receive_text())
        message = json.loads(message_json)
        mime_type = message["mime_type"]
        data = message["data"]
        print(f"[CLIENT TO AGENT] Received message: {mime_type}")

        # Send the message to the agent
        if mime_type == "text/plain":
            # Send a text message
            content = Content(role="user", parts=[Part.from_text(text=data)])
            live_request_queue.send_content(content=content)
            print(f"[CLIENT TO AGENT]: {data}")
        elif mime_type == "audio/pcm":
            print(f"[CLIENT TO AGENT]: {mime_type}: {len(data)} bytes.")
            decoded_data = base64.b64decode(data)
            live_request_queue.send_realtime(
                Blob(data=decoded_data, mime_type=mime_type)
            )
        else:
            raise ValueError(f"Mime type not supported: {mime_type}")


#
# FastAPI web app
#

app = FastAPI()

# Global event to signal shutdown
shutdown_signal = asyncio.Event()


@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully clean up all active sessions on shutdown."""
    print("Application shutting down...")
    shutdown_signal.set()
    user_ids = list(SESSIONS_CACHE.keys())
    cleanup_tasks = [cleanup_session(user_id) for user_id in user_ids]
    if cleanup_tasks:
        # Add a timeout to session cleanup to prevent hanging
        await asyncio.wait_for(asyncio.gather(*cleanup_tasks), timeout=10)
    print("All active sessions cleaned up. Goodbye!")


STATIC_DIR = Path("static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serves the index.html with a cache-busting timestamp."""
    with open(os.path.join(STATIC_DIR, "index.html")) as f:
        html_content = f.read()

    # Replace the placeholder with the current timestamp
    timestamp = str(int(time.time()))
    html_content = html_content.replace("__TIMESTAMP__", timestamp)

    return HTMLResponse(content=html_content)


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, is_audio: str):
    """Client websocket endpoint"""

    # Wait for client connection
    await websocket.accept()
    print(f"Client #{user_id} connected, audio mode: {is_audio}")

    # Start agent session
    user_id_str = str(user_id)
    if user_id_str in SESSIONS_CACHE:
        # If session exists, restart the agent turn to get a new stream of live events
        print(f"Reusing session for user {user_id_str}")
        runner, session, run_config = SESSIONS_CACHE[user_id_str]

        # Move to end (most recently used)
        SESSIONS_CACHE.move_to_end(user_id_str)

        # Reset timeout
        if user_id_str in SESSION_TIMEOUTS:
            SESSION_TIMEOUTS[user_id_str].cancel()
        SESSION_TIMEOUTS[user_id_str] = asyncio.create_task(
            session_timeout_handler(user_id_str)
        )

        live_request_queue = LiveRequestQueue()
        live_events = await restart_agent_turn(
            runner, session, live_request_queue, run_config
        )
    else:
        # Ensure we don't exceed session limit
        await ensure_session_limit()

        # If session does not exist, create a new one and cache it
        print(f"Creating new session for user {user_id_str}")
        runner, session, run_config = await start_agent_session(
            user_id_str, is_audio == "true"
        )
        SESSIONS_CACHE[user_id_str] = (runner, session, run_config)

        # Set timeout for this session
        SESSION_TIMEOUTS[user_id_str] = asyncio.create_task(
            session_timeout_handler(user_id_str)
        )

        # Start the agent session for the first time
        live_request_queue = LiveRequestQueue()
        live_events = runner.run_live(
            session=session,
            live_request_queue=live_request_queue,
            run_config=run_config,
        )

    agent_to_client_task = None
    client_to_agent_task = None
    try:
        # Start tasks
        agent_to_client_task = asyncio.create_task(
            agent_to_client_messaging(websocket, live_events, shutdown_signal)
        )
        client_to_agent_task = asyncio.create_task(
            client_to_agent_messaging(websocket, live_request_queue, shutdown_signal)
        )

        # Wait until the websocket is disconnected or an error occurs
        done, pending = await asyncio.wait(
            [agent_to_client_task, client_to_agent_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Check for exceptions in completed tasks
        for task in done:
            try:
                if task.exception() is not None:
                    # This will raise the exception and trigger the finally block
                    task.result()
            except WebSocketDisconnect:
                # This is an expected exception when the client disconnects.
                print(f"Client #{user_id} disconnected gracefully.")
                # We can just break the loop and proceed to the finally block for cleanup.
                break

    finally:
        # Cancel tasks
        if agent_to_client_task:
            agent_to_client_task.cancel()
        if client_to_agent_task:
            client_to_agent_task.cancel()

        # Wait for tasks to finish cancelling
        if agent_to_client_task and client_to_agent_task:
            await asyncio.gather(
                agent_to_client_task, client_to_agent_task, return_exceptions=True
            )

        # Note: We don't close the session here since it's cached for reuse
        # The session will be cleaned up by timeout or when the cache is full
        pass

    # Disconnected
    print(f"Client #{user_id} disconnected")
