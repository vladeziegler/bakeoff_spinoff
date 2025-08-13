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
import logging
import traceback
from collections import OrderedDict
from contextlib import asynccontextmanager
import uvicorn

from pathlib import Path
from dotenv import load_dotenv

from fastapi.middleware.cors import CORSMiddleware

from google.genai.types import (
    Part,
    Content,
    Blob,
    VoiceConfig,
    PrebuiltVoiceConfigDict,
    SpeechConfig,
    AudioTranscriptionConfig,
    MediaResolution,
)

from google.adk.runners import InMemoryRunner
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from starlette.websockets import WebSocketDisconnect
from google.adk.agents.run_config import StreamingMode
from agents.live_api_agent.agent import root_agent

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")


class NoBlobFilter(logging.Filter):
    """A custom logging filter to exclude noisy blob messages."""

    def filter(self, record):
        # Check for the first type of message to exclude
        if (
            record.name == "google_adk.google.adk.models.gemini_llm_connection"
            and record.getMessage().startswith("Sending LLM Blob")
        ):
            return False  # Exclude this message

        # Check for the second type of message to exclude
        if (
            record.name == "google_adk.google.adk.flows.llm_flows.base_llm_flow"
            and record.getMessage().startswith("Sending live request")
        ):
            return False  # Exclude this message

        # Check for the third type of message to exclude
        if (
            record.name == "google_adk.google.adk.models.gemini_llm_connection"
            and record.getMessage().startswith("Got LLM Live message")
        ):
            return False  # Exclude this message

        # If neither of the above conditions are met, allow the message
        return True


def setup_logging():
    """Set up logging to both console and a timestamped file."""
    root_logger = logging.getLogger()
    # If handlers have already been added, do nothing.
    if root_logger.hasHandlers():
        return

    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    log_filename = log_dir / f"adk-app-{timestamp}.log"
    root_logger.setLevel(logging.DEBUG)  # Set the lowest level to capture all logs

    # Mute noisy loggers
    logging.getLogger("websockets.client").setLevel(logging.WARNING)
    logging.getLogger("google_adk.google.adk.flows.llm_flows.base_llm_flow").setLevel(
        logging.WARNING
    )

    # Create a formatter
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Create and add the file handler
    file_handler = logging.FileHandler(log_filename)
    file_handler.setLevel(logging.DEBUG)  # Log everything to the file
    file_handler.setFormatter(formatter)
    file_handler.addFilter(NoBlobFilter())  # Add our custom filter
    root_logger.addHandler(file_handler)

    # Create and add the stream handler for the console
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.WARNING)  # Log only warnings and above to console
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)


# Now, get the logger for this specific module
logger = logging.getLogger(__name__)


#
# ADK Streaming
#

# Load Gemini API Key
load_dotenv()

APP_NAME = "ADK Streaming example"


# Session management - now handled by ADK SessionService


# Global event to signal shutdown
shutdown_signal = asyncio.Event()


async def start_agent_session(user_id, force_new_session=False):
    """Starts a multimodal agent session with audio, video, and text support"""

    # Create a Runner
    runner = InMemoryRunner(
        app_name=APP_NAME,
        agent=root_agent,
    )

    # Ensure only one active session per user by cleaning up existing sessions
    try:
        sessions_response = await runner.session_service.list_sessions(
            app_name=APP_NAME, user_id=user_id
        )

        # If forcing new session or multiple sessions exist, clean up all existing sessions
        if force_new_session or len(sessions_response.sessions) > 1:
            for existing_session in sessions_response.sessions:
                try:
                    await runner.session_service.delete_session(
                        app_name=APP_NAME,
                        user_id=user_id,
                        session_id=existing_session.id,
                    )
                    logger.info(
                        f"Deleted existing session {existing_session.id} for user {user_id}"
                    )
                except Exception as e:
                    logger.warning(f"Error deleting session {existing_session.id}: {e}")

            # Create a fresh session
            session = await runner.session_service.create_session(
                app_name=APP_NAME,
                user_id=user_id,
            )
            logger.info(f"Created new session {session.id} for user {user_id}")

        elif len(sessions_response.sessions) == 1:
            # Use the single existing session
            session_id = sessions_response.sessions[0].id
            session = await runner.session_service.get_session(
                app_name=APP_NAME, user_id=user_id, session_id=session_id
            )
            logger.info(f"Reusing existing session {session_id} for user {user_id}")

        else:
            # No existing sessions, create a new one
            session = await runner.session_service.create_session(
                app_name=APP_NAME,
                user_id=user_id,
            )
            logger.info(f"Created new session {session.id} for user {user_id}")

    except Exception as e:
        logger.warning(f"Error managing sessions for user {user_id}: {e}")
        # Fallback: create a new session
        session = await runner.session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
        )
        logger.info(f"Created fallback session {session.id} for user {user_id}")

    # Configure multimodal session with audio, video, and text support
    voice_config = VoiceConfig(
        prebuilt_voice_config=PrebuiltVoiceConfigDict(voice_name="Aoede")
    )
    speech_config = SpeechConfig(voice_config=voice_config)
    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=["AUDIO"],  # AUDIO or TEXT
        speech_config=speech_config,
        enable_affective_dialog=True,
        proactivity={
            "proactive_audio": True
        },  # https://googleapis.github.io/python-genai/genai.html#genai.types.ProactivityConfigDict
        realtime_input_config={
            "automaticActivityDetection": {
                "disabled": False,
                "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                "endOfSpeechSensitivity": "END_SENSITIVITY_HIGH",
                "prefixPaddingMs": 20,
                "silenceDurationMs": 100,
            },
            "activityHandling": "NO_INTERRUPTION",
            "turnCoverage": "TURN_INCLUDES_ALL_INPUT",
        },
        output_audio_transcription=AudioTranscriptionConfig(),
        input_audio_transcription=AudioTranscriptionConfig(),
    )

    return runner, session, run_config


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan context manager."""
    # Startup
    setup_logging()
    logger.info("Application starting up...")
    yield
    # Shutdown
    logger.info("Application shutting down...")
    shutdown_signal.set()
    logger.info("Shutdown complete. Sessions managed by ADK.")


app = FastAPI(lifespan=lifespan)


# Configure CORS
origins = ["*"]  # Allow all origins for development

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


STATIC_DIR = Path("static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serves the main index.html."""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/basic", response_class=HTMLResponse)
async def basic_chat():
    """Serves the basic chat html."""
    return FileResponse(os.path.join(STATIC_DIR, "basic/index.html"))


@app.get("/live", response_class=HTMLResponse)
async def live_chat():
    """Serves the live multimodal chat html."""
    return FileResponse(os.path.join(STATIC_DIR, "live/index.html"))


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """Client websocket endpoint"""

    # Wait for client connection
    await websocket.accept()
    logger.info(f"Client #{user_id} connected for multimodal session")

    # Check for new_session query parameter
    query_params = websocket.query_params
    force_new_session = query_params.get("new_session") == "true"

    # Use ADK session management
    user_id_str = str(user_id)
    runner, session, run_config = await start_agent_session(
        user_id_str, force_new_session
    )

    # For each new connection, create a new queue and start a new live run.
    live_request_queue = LiveRequestQueue()
    live_events = runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )

    # Send session info to the client
    await websocket.send_text(
        json.dumps(
            {
                "mime_type": "application/json",
                "event": "session_info",
                "data": {
                    "user_id": user_id_str,
                    "session_id": session.id,
                },
            }
        )
    )

    async def handle_websocket_messages():
        try:
            while True:
                try:
                    message = await websocket.receive_text()
                    data = json.loads(message)
                    if data.get("mime_type").startswith("audio/pcm"):
                        # Decode base64 audio data
                        audio_bytes = base64.b64decode(data.get("data", ""))
                        # Put audio in queue for processing
                        live_request_queue.send_realtime(
                            Blob(data=audio_bytes, mime_type=data.get("mime_type"))
                        )
                    elif data.get("mime_type") == "image/jpeg":
                        # Decode base64 video frame
                        video_bytes = base64.b64decode(data.get("data", ""))
                        # Get video mode metadata if available
                        video_mode = data.get(
                            "mode", "webcam"
                        )  # Default to webcam if not specified
                        logger.info(f"Processing video frame from {video_mode}")
                        # Put video frame in queue for processing with metadata
                        live_request_queue.send_realtime(
                            Blob(data=video_bytes, mime_type="image/jpeg")
                        )
                    elif data.get("mime_type") == "text/plain":
                        # Handle text messages
                        live_request_queue.send_content(
                            Content(
                                role="user",
                                parts=[Part.from_text(text=data.get("data"))],
                            )
                        )
                        logger.info(f"Received text: {data.get('data')}")
                except WebSocketDisconnect:
                    logger.debug("WebSocket disconnected during message handling")
                    break
                except json.JSONDecodeError:
                    logger.error("Invalid JSON message received")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
        except WebSocketDisconnect:
            logger.debug("WebSocket disconnected during message handling")
        except Exception as e:
            logger.error(f"Error in message handler: {e}")

    async def receive_and_process_responses():
        async for event in live_events:
            if event.turn_complete or event.interrupted:
                message = {
                    "turn_complete": event.turn_complete,
                    "interrupted": event.interrupted,
                }
                await websocket.send_text(json.dumps(message))
                logger.debug(f"[AGENT TO CLIENT]: {message}")
                continue

            part: Part = (
                event.content and event.content.parts and event.content.parts[0]
            )

            role = event.content and event.content.role

            if not part:
                continue

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
                    continue

            if part.text and event.partial and role == "model":
                message = {
                    "mime_type": "text/plain",
                    "data": part.text,
                    "role": role,
                }
                await websocket.send_text(json.dumps(message))
            elif part.text and role == "user":
                message = {
                    "mime_type": "text/plain",
                    "data": part.text,
                    "role": role,
                }
                await websocket.send_text(json.dumps(message))

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(handle_websocket_messages(), name="MessageHandler")
            tg.create_task(receive_and_process_responses(), name="ResponseHandler")
    except WebSocketDisconnect:
        logger.debug(f"Client #{user_id} disconnected gracefully.")
    except Exception as e:
        logger.error(f"An error occurred: {e}")
        traceback.print_exc()
    finally:
        logger.info(f"Client #{user_id} disconnected.")


if __name__ == "__main__":
    try:
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8881,
            reload=True,
            reload_dirs=["./static", "./my_agent"],
        )
    except KeyboardInterrupt:
        logger.info("Server shutdown requested via KeyboardInterrupt")
    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        logger.info("Server shutdown complete")
