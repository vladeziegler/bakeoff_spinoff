import asyncio
import logging
import matplotlib
matplotlib.use('Agg')  # MUST be done before pyplot is imported anywhere
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

# --- Vertex AI Configuration ---
# This MUST be set before any other google modules are imported.
# It tells the google.genai client to use Vertex AI for authentication.
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
os.environ["GOOGLE_CLOUD_PROJECT"] = "agent-bake-off"
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part
from agents.banking_agent.agent import root_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

origins = ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_files_path = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(os.path.join(static_files_path, "images"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_files_path), name="static")

# Following the user's provided script:
# 1. Create the session service first.
session_service = InMemorySessionService()

# 2. Create the base Runner, providing the agent and the session service.
runner = Runner(
    agent=root_agent,
    app_name="banking_agent",
    session_service=session_service,
)

@app.get("/apps/{app_name}/users/{user_id}/sessions")
async def list_sessions(app_name: str, user_id: str):
    try:
        sessions_response = await session_service.list_sessions(
            app_name=app_name, user_id=user_id
        )
        return {"sessions": [s.model_dump() for s in sessions_response.sessions]}
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list sessions")

@app.post("/apps/{app_name}/users/{user_id}/sessions")
async def create_session(app_name: str, user_id: str):
    try:
        session = await session_service.create_session(
            app_name=app_name, user_id=user_id
        )
        logger.info(f"Created new session {session.id} for user {user_id}")
        return session.model_dump()
    except Exception as e:
        logger.error(f"Error creating session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create session")

@app.post("/apps/{app_name}/users/{user_id}/sessions/{session_id}:run")
async def run_agent(
    app_name: str, user_id: str, session_id: str, request: Request
):
    try:
        request_data = await request.json()
        new_message_dict = request_data.get("newMessage")
        
        new_message = None
        if new_message_dict and new_message_dict.get("parts"):
            part_objects = [Part(**p) for p in new_message_dict["parts"]]
            new_message = Content(
                role=new_message_dict.get("role", "user"),
                parts=part_objects
            )
        
        response_events = []
        try:
            for event in runner.run(
                user_id=user_id, session_id=session_id, new_message=new_message
            ):
                logger.info(f"Processing event: turn_complete={event.turn_complete}")
                
                # Manually construct a JSON-safe dictionary to avoid serialization errors
                # with raw binary data in the event object.
                event_dict = {
                    "turn_complete": event.turn_complete,
                    "interrupted": event.interrupted,
                }
                
                if event.content and event.content.parts:
                    logger.info(f"Event has {len(event.content.parts)} parts")
                    clean_parts = []
                    for i, part in enumerate(event.content.parts):
                        try:
                            # Only include parts that have actual text content.
                            # This filters out binary metadata like 'thought_signature'.
                            if hasattr(part, "text") and part.text is not None:
                                clean_parts.append({"text": part.text})
                                logger.info(f"Added text part {i}: {len(part.text)} chars")
                        except Exception as part_error:
                            logger.warning(f"Error processing part {i}: {part_error}")
                            continue
                    
                    if clean_parts:
                        event_dict["content"] = {
                            "role": event.content.role,
                            "parts": clean_parts
                        }
                
                response_events.append(event_dict)
                logger.info(f"Added event to response: {len(response_events)} total events")
                
        except Exception as runner_error:
            logger.error(f"Error in runner.run() loop: {runner_error}")
            import traceback
            logger.error(f"Runner traceback: {traceback.format_exc()}")
            # Don't re-raise, try to return what we have so far
            if response_events:
                logger.info(f"Returning partial response with {len(response_events)} events")
        
        return response_events
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error running agent: {e}")
        logger.error(f"Full traceback: {error_details}")
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {str(e)}")

@app.get("/")
async def read_root():
    return {"message": "ADK Backend Server is running."}

@app.post("/api/generate-chart")
async def generate_chart(request: Request):
    """
    Dedicated chart generation endpoint using proven chart generation logic
    """
    try:
        import json
        import numpy as np
        import matplotlib.pyplot as plt
        from datetime import datetime
        import re
        
        chart_request = await request.json()
        
        # Generate chart using the proven logic from simple_chart_server.py
        chart_data = chart_request.get("data", {})
        title = chart_request.get("title", "Financial Analysis")
        chart_type = chart_request.get("chart_type", "line_projection")
        
        plt.ioff()
        fig = plt.figure(figsize=(12, 8))
        plt.clf()
        
        # Simple chart creation based on type
        if chart_type == "line_projection":
            years = chart_data.get("years", [2024, 2025, 2026, 2027, 2028])
            values = chart_data.get("values", [1000, 1200, 1400, 1600, 1800])
            plt.plot(years, values, marker='o', linewidth=3, markersize=10)
            plt.xlabel('Year', fontsize=14)
            plt.ylabel('Value ($)', fontsize=14)
        elif chart_type == "spending_pie":
            labels = chart_data.get("labels", ["Housing", "Food", "Transport", "Entertainment"])
            sizes = chart_data.get("sizes", [40, 25, 20, 15])
            plt.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
        else:
            # Default fallback
            years = [2024, 2025, 2026, 2027, 2028]
            values = [1000, 1200, 1400, 1600, 1800]
            plt.plot(years, values, marker='o', linewidth=3, markersize=10)
            plt.xlabel('Year', fontsize=14)
            plt.ylabel('Value ($)', fontsize=14)
        
        plt.title(title, fontsize=18, fontweight='bold', pad=20)
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        # Save to static directory
        safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{safe_title}_{timestamp}.png"
        
        static_dir = os.path.join(os.path.dirname(__file__), "static", "images")
        os.makedirs(static_dir, exist_ok=True)
        filepath = os.path.join(static_dir, filename)
        
        plt.savefig(filepath, format='png', dpi=150, bbox_inches='tight')
        plt.close(fig)
        
        image_url = f"/static/images/{filename}"
        logger.info(f"Chart generated successfully: {image_url}")
        
        return {"success": True, "url": image_url, "title": title}
        
    except Exception as e:
        logger.error(f"Chart generation failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

@app.get("/test-chart")
async def test_chart():
    """Debug endpoint to test chart generation without agents"""
    try:
        from agents.banking_agent.sub_agents.tools import render_chart_and_get_url
        
        # Simple test data
        test_data = {
            "chart_type": "line_projection",
            "title": "Test Chart",
            "data": {
                "years": [2024, 2025, 2026, 2027, 2028],
                "values": [1000, 1200, 1400, 1600, 1800]
            }
        }
        
        # Generate chart
        image_url = render_chart_and_get_url(test_data, "Test Chart")
        
        if image_url.startswith("ERROR_"):
            return {"error": image_url}
        
        # Return simple HTML
        html = f"""
        <html>
        <body>
            <h2>Test Chart</h2>
            <img src="{image_url}" alt="Test Chart" style="max-width: 100%; height: auto;">
            <p>Image URL: {image_url}</p>
        </body>
        </html>
        """
        
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html)
        
    except Exception as e:
        return {"error": f"Chart generation failed: {str(e)}"}

if __name__ == "__main__":
    logger.info("Starting ADK Backend Server...")
    uvicorn.run(app, host="0.0.0.0", port=8881)
