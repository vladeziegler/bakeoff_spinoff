#!/usr/bin/env python3
"""
Simple chart generation server for prototype
No agents, no complexity - just chart generation and serving
"""

import matplotlib
matplotlib.use('Agg')  # Must be before pyplot import

import matplotlib.pyplot as plt
import json
import os
from datetime import datetime
import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

# CORS for frontend
origins = ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving
static_dir = "static/images"
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

def create_simple_chart(title="Sample Chart"):
    """Create a simple test chart"""
    plt.ioff()
    fig = plt.figure(figsize=(10, 6))
    plt.clf()
    
    # Simple data
    years = [2024, 2025, 2026, 2027, 2028]
    values = [1000, 1200, 1400, 1600, 1800]
    
    plt.plot(years, values, marker='o', linewidth=2, markersize=8)
    plt.title(title, fontsize=16, fontweight='bold')
    plt.xlabel('Year')
    plt.ylabel('Value ($)')
    plt.grid(True, alpha=0.3)
    
    # Save to file
    safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"{safe_title}_{timestamp}.png"
    filepath = os.path.join(static_dir, filename)
    
    plt.savefig(filepath, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    
    return f"/static/images/{filename}"

@app.get("/")
async def root():
    return {"message": "Simple Chart Server Running"}

@app.get("/test_static.html")
async def test_static():
    """Serve the test static HTML page"""
    with open("test_static.html", "r") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

@app.get("/chart")
async def generate_chart():
    """Generate a simple chart and return HTML with the image"""
    try:
        image_url = create_simple_chart("Financial Projection")
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Chart Display</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                .chart-container {{ text-align: center; }}
                img {{ max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }}
            </style>
        </head>
        <body>
            <div class="chart-container">
                <h2>Generated Chart</h2>
                <img src="{image_url}" alt="Financial Chart">
                <p>Image URL: {image_url}</p>
                <p>Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            </div>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html)
        
    except Exception as e:
        return {"error": f"Chart generation failed: {str(e)}"}

@app.post("/chat")
async def simple_chat():
    """Simple endpoint that returns a chart for any message"""
    try:
        image_url = create_simple_chart("Your Financial Analysis")
        
        response = {
            "content": "Here's your financial analysis chart:",
            "hasVisualization": True,
            "visualizationHtml": f'''
            <div class="chart-container">
                <h3>Your Financial Analysis</h3>
                <img src="{image_url}" alt="Financial Chart" style="max-width: 100%; height: auto;">
            </div>
            '''
        }
        
        return response
        
    except Exception as e:
        return {"error": f"Chart generation failed: {str(e)}"}

if __name__ == "__main__":
    print("Starting Simple Chart Server on http://localhost:8881")
    uvicorn.run(app, host="0.0.0.0", port=8881)
