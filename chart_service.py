#!/usr/bin/env python3
"""
Chart Generation Microservice
Runs on port 8882 to serve chart generation requests independently
"""

import os
import json
import re
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend
import matplotlib.pyplot as plt
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Union, List, Dict, Any
import uvicorn

app = FastAPI(title="Chart Generation Service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

class ChartRequest(BaseModel):
    chart_data: Union[str, List[Dict[str, Any]], Dict[str, Any]]
    title: str = "Financial Analysis"

@app.post("/generate-chart")
async def generate_chart(request: ChartRequest):
    """
    Generate chart from data and return the URL
    """
    try:
        print(f"🎨 Chart service generating: {request.title}")
        print(f"📊 Data: {request.chart_data}")
        
        # Parse chart data - handle string, dict, and list inputs
        if isinstance(request.chart_data, str):
            try:
                data = json.loads(request.chart_data)
            except json.JSONDecodeError:
                # If it's not valid JSON, create default data
                data = {"chart_type": "line_projection", "title": request.chart_data}
        else:
            data = request.chart_data
            
        # Handle case where agent sends raw array instead of structured object
        if isinstance(data, list):
            print("📊 Received raw array data, converting to structured format...")
            # Convert raw array to structured format
            data = {
                "chart_type": "line_projection",
                "data": {"years": [], "values": []},
                "title": request.title
            }
            # Extract years and values from the array
            for item in request.chart_data if isinstance(request.chart_data, list) else []:
                if isinstance(item, dict):
                    if "Year" in item and "Net Worth" in item:
                        data["data"]["years"].append(item["Year"])
                        data["data"]["values"].append(item["Net Worth"])
                    elif "Year" in item and "Value" in item:
                        data["data"]["years"].append(item["Year"])
                        data["data"]["values"].append(item["Value"])
            
        # Handle Vega-Lite format vs simple format
        if "mark" in data and "encoding" in data:
            # This is Vega-Lite format - convert it
            print("📊 Detected Vega-Lite format, converting...")
            chart_type = "line_projection" if data.get("mark") == "line" else "line_projection"
            
            # Extract data from Vega-Lite format
            vega_data = data.get("data", [])
            if isinstance(vega_data, list) and len(vega_data) > 0:
                # Convert list of objects to years/values arrays
                years = []
                values = []
                for item in vega_data:
                    if "Year" in item:
                        years.append(item["Year"])
                    if "Net Worth ($k)" in item:
                        values.append(item["Net Worth ($k)"] * 1000)  # Convert k to actual values
                    elif "Value" in item:
                        values.append(item["Value"])
                
                chart_data_content = {"years": years, "values": values}
            else:
                # Fallback data
                chart_data_content = {"years": [2024, 2025, 2026, 2027, 2028], "values": [1000, 1200, 1400, 1600, 1800]}
        else:
            # Simple format
            chart_type = data.get("chart_type", "line_projection")
            chart_data_content = data.get("data", {})
        
        plt.ioff()
        fig = plt.figure(figsize=(12, 8))
        plt.clf()
        
        # Simple chart creation based on type
        if chart_type == "line_projection":
            years = chart_data_content.get("years", [2024, 2025, 2026, 2027, 2028])
            values = chart_data_content.get("values", [1000, 1200, 1400, 1600, 1800])
            plt.plot(years, values, marker='o', linewidth=3, markersize=10)
            plt.xlabel('Year', fontsize=14)
            plt.ylabel('Value ($)', fontsize=14)
        elif chart_type == "spending_pie":
            labels = chart_data_content.get("labels", ["Housing", "Food", "Transport", "Entertainment"])
            sizes = chart_data_content.get("sizes", [40, 25, 20, 15])
            plt.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
        else:
            # Default fallback
            years = [2024, 2025, 2026, 2027, 2028]
            values = [1000, 1200, 1400, 1600, 1800]
            plt.plot(years, values, marker='o', linewidth=3, markersize=10)
            plt.xlabel('Year', fontsize=14)
            plt.ylabel('Value ($)', fontsize=14)
        
        plt.title(request.title, fontsize=18, fontweight='bold', pad=20)
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        # Save to static directory
        safe_title = re.sub(r'[^\w\s-]', '', request.title).strip().replace(' ', '_')
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{safe_title}_{timestamp}.png"
        
        static_dir = os.path.join(os.path.dirname(__file__), "static", "images")
        os.makedirs(static_dir, exist_ok=True)
        filepath = os.path.join(static_dir, filename)
        
        plt.savefig(filepath, format='png', dpi=150, bbox_inches='tight')
        plt.close(fig)
        
        image_url = f"/static/images/{filename}"
        print(f"✅ Chart generated successfully: {image_url}")
        
        return {"success": True, "url": image_url, "title": request.title}
        
    except Exception as e:
        print(f"❌ Chart generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chart generation failed: {str(e)}")

@app.get("/")
async def health_check():
    return {"message": "Chart Generation Service is running", "status": "healthy"}

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "chart-generation"}

if __name__ == "__main__":
    print("🚀 Starting Chart Generation Service on port 8882...")
    uvicorn.run(app, host="0.0.0.0", port=8882, log_level="info")
