import json
import matplotlib.pyplot as plt
import numpy as np
from io import BytesIO
import io
import base64
from typing import Dict, Any
import os
import re
from datetime import datetime
from google import genai
from google.genai.types import Tool, GenerateContentConfig, HttpOptions, UrlContext, GoogleSearch


def lookup_matplotlib_docs(query: str) -> str:
    """
    Looks up information in the Matplotlib documentation using Google Search and a specific URL for context.

    Args:
        query: The question to ask about Matplotlib.

    Returns:
        The answer from the documentation, or an error message.
    """
    print(f"🔎 Looking up Matplotlib docs for: '{query}'")
    try:
        # Configure for Vertex AI for this test script.
        # The UrlContext tool is a Vertex AI feature.
        # This ensures the test script sends the request to the correct API endpoint.
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
        os.environ["GOOGLE_CLOUD_PROJECT"] = "agent-bake-off"
        os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"

        # The client will now use Vertex AI and authenticate via Application Default Credentials.
        # Make sure you have run 'gcloud auth application-default login' in your terminal.
        client = genai.Client(http_options=HttpOptions(api_version="v1beta1"))
        model_id = "gemini-2.5-flash"

        # Define the tools the model can use, as per the user's example.
        tools = [
            Tool(url_context=UrlContext),
            Tool(google_search=GoogleSearch)
        ]

        matplotlib_docs_url = "https://matplotlib.org/stable/api/index.html"
        
        # The prompt includes the URL and the user's query. The model's UrlContext tool
        # should automatically use the URL from the prompt for grounding.
        prompt = (
            f"Give me a detailed answer based on the official Matplotlib documentation at {matplotlib_docs_url}. "
            f"My question is: {query}"
        )

        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=GenerateContentConfig(
                tools=tools,
                response_modalities=["TEXT"],
            )
        )

        result_text = ""
        for part in response.candidates[0].content.parts:
            result_text += part.text
        
        result_text = result_text.strip()

        # Log URLs retrieved for context if available
        if hasattr(response.candidates[0], 'url_context_metadata') and response.candidates[0].url_context_metadata:
            print("URLs retrieved for context:")
            # Correctly access the url_metadata list within the object
            if hasattr(response.candidates[0].url_context_metadata, 'url_metadata'):
                for metadata in response.candidates[0].url_context_metadata.url_metadata:
                    # The attribute is 'retrieved_url', not 'url'.
                    print(f"- {metadata.retrieved_url}")
        
        if not result_text:
            return "I could not find a specific answer in the documentation. Please try again with a different query."

        return result_text

    except Exception as e:
        print(f"❌ Error in lookup_matplotlib_docs: {e}")
        return f"Failed to search Matplotlib documentation. Error: {str(e)}"


def direct_chart_generator(chart_data: str, title: str = "Financial Analysis") -> str:
    """
    Chart generator that creates matplotlib charts and stores chart data for artifact callback.
    
    Supported chart types and data formats:
    
    1. LINE CHARTS (chart_type: "line_projection"):
       - Array format: {"data": {"labels": [0,1,2,3], "values": [1000,1100,1200,1300]}}
       - Projection format: {"data": {"starting_amount": 1000, "monthly_investment": 100, "interest_rate": 6, "timeline_months": 12}}
    
    2. PIE CHARTS (chart_type: "spending_pie"):
       - {"data": {"categories": {"Housing": 1500, "Food": 600, "Transport": 400}}}
    
    3. BAR CHARTS (chart_type: "comparison_bar" or "savings_opportunities"):
       - {"data": {"Budget": 1500, "Actual": 1650}} OR
       - {"data": {"opportunities": {"Dining": 150, "Subscriptions": 75}}}
    
    Args:
        chart_data: JSON string or dict of chart specifications.
        title: Title for the chart.
    Returns:
        Success/error message (chart data stored globally for callback).
    """
    import json as json_lib
    import matplotlib.pyplot as plt
    import io
    
    print(f"🎨 Generating chart directly: {title}")
    print(f"📊 Chart data: {chart_data}")
    print(f"📊 Chart data type: {type(chart_data)}")
    
    try:
        # Parse chart data
        if isinstance(chart_data, str):
            data = json_lib.loads(chart_data)
        else:
            data = chart_data
            
        # Validate data structure
        if not isinstance(data, dict):
            raise ValueError("Chart data must be a dictionary")
            
        chart_type = data.get("chart_type", "line_projection")
        chart_data_section = data.get("data", {})
        
        # Validate data format based on chart type
        if chart_type == "line_projection":
            if not ("labels" in chart_data_section and "values" in chart_data_section) and \
               not ("starting_amount" in chart_data_section and "monthly_investment" in chart_data_section and "interest_rate" in chart_data_section):
                raise ValueError("Line chart requires either (labels + values) or (starting_amount + monthly_investment + interest_rate)")
        elif chart_type == "spending_pie":
            if "categories" not in chart_data_section:
                raise ValueError("Pie chart requires 'categories' data with category names and amounts")
        elif chart_type in ["comparison_bar", "savings_opportunities"]:
            if not chart_data_section and "opportunities" not in chart_data_section:
                raise ValueError("Bar chart requires data with category names and values")
                
        print(f"🔍 Parsed and validated data before chart generation: {data}")
        chart_result = render_chart_and_get_bytes(data, title)
        
        if chart_result.get("success"):
            image_bytes = chart_result.get("image_bytes")
            chart_info = {
                "image_bytes": image_bytes,
                "title": title,
                "chart_data": data,
                "mime_type": "image/png"
            }
            
            # Store globally for callback to access
            # This is a simple approach - in production, you'd use proper context management
            global _last_chart_info
            _last_chart_info = chart_info
            print(f"✅ Chart generated and stored globally for artifact creation")
            
            return f"Chart '{title}' generated successfully"
        else:
            error_msg = chart_result.get("error", "Unknown error")
            print(f"❌ Chart generation error: {error_msg}")
            return f"ERROR_CHART_FAILED: {error_msg}"
            
    except Exception as e:
        print(f"❌ Chart generation failed: {e}")
        return f"ERROR_CHART_FAILED: {str(e)}"

# Global variable to store chart info for callback access
_last_chart_info = None

def render_chart_and_get_bytes(data: dict, title: str = "Financial Analysis") -> dict:
    """
    Generate chart and return image bytes instead of saving to file.
    Args:
        data: Chart specifications as dict.
        title: Title for the chart.
    Returns:
        Dict with success status, image_bytes if successful, error if failed.
    """
    print(f"🎨 Generating chart bytes: {title}")
    fig = None
    try:
        if not isinstance(data, dict):
            raise ValueError("Chart data must be a valid dictionary")
        chart_title = _safe_get(data, "title", title)
        
        plt.ioff()
        fig = plt.figure(figsize=(12, 8))
        plt.clf()

        # Chart creation logic...
        chart_type = _safe_get(data, "chart_type", "line_projection")
        chart_data = _safe_get(data, "data", {})
        styling = _safe_get(data, "styling", {})
        chart_created = False
        
        if chart_type == "line_projection": 
            chart_created = _create_projection_chart_robust(chart_data, styling)
        elif chart_type == "spending_pie": 
            chart_created = _create_pie_chart_robust(chart_data, styling)
        elif chart_type == "comparison_bar" or chart_type == "savings_opportunities": 
            chart_created = _create_comparison_chart_robust(chart_data, styling)
        else: 
            chart_created = _create_projection_chart_robust(chart_data, styling)
            
        if not chart_created:
            raise ValueError("Failed to create chart - no valid data provided")
        plt.title(chart_title, fontsize=18, fontweight='bold', pad=20)
        
        # Convert to bytes instead of saving to file
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        buffer.seek(0)
        image_bytes = buffer.getvalue()
        
        print(f"✅ Chart bytes generated successfully: {len(image_bytes)} bytes")
        return {
            "success": True,
            "image_bytes": image_bytes,
            "title": chart_title
        }
        
    except Exception as e:
        print(f"❌ Chart bytes generation failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        if fig: 
            plt.close(fig)



def _safe_get(data: Dict[str, Any], key: str, default: Any) -> Any:
    """Safely get value from dict with type checking."""
    try:
        value = data.get(key, default)
        return value if value is not None else default
    except (AttributeError, KeyError):
        return default



def _create_projection_chart_robust(data: Dict[str, Any], styling: Dict[str, Any]) -> bool:
    """Robust version of projection chart creation.
    
    Supports two data formats:
    1. Array format: {'labels': [0,1,2...], 'values': [1000,1100,1200...]}
    2. Projection format: {'starting_amount': 1000, 'monthly_investment': 100, 'interest_rate': 6, 'timeline_months': 12}
    """
    try:
        print(f"🔍 Creating projection chart with data: {data}")
        
        # Check if data is in array format (labels + values)
        if "labels" in data and "values" in data:
            print("📊 Using array-based data format (labels + values)")
            labels = data["labels"]
            values = data["values"]
            
            if len(labels) != len(values):
                raise ValueError("Labels and values arrays must have the same length")
            if not labels or not values:
                raise ValueError("Labels and values arrays cannot be empty")
                
            months = np.array(labels)
            amounts = np.array(values)
            
        # Check if data is in projection format
        elif "starting_amount" in data and "monthly_investment" in data and "interest_rate" in data:
            print("📊 Using projection-based data format (starting_amount + monthly_investment + interest_rate)")
            starting_amount = float(data["starting_amount"])
            monthly_investment = float(data["monthly_investment"])
            interest_rate = float(data["interest_rate"]) / 100 / 12
            timeline_months = int(_safe_get(data, "timeline_months", 12))
            
            # Generate projection data
            months = np.arange(0, timeline_months + 1)
            amounts = []
            current = starting_amount
            
            for month in months:
                if month == 0:
                    amounts.append(current)
                else:
                    current = current * (1 + interest_rate) + monthly_investment
                    amounts.append(current)
            amounts = np.array(amounts)
            
        else:
            raise ValueError("Data must contain either (labels + values) or (starting_amount + monthly_investment + interest_rate)")
        
        print(f"🔍 Chart will plot {len(months)} data points from {min(amounts):,.2f} to {max(amounts):,.2f}")
        
        line_color = _safe_get(styling, "line_color", "#2E8B57")
        plt.plot(months, amounts, linewidth=3, color=line_color, marker='o', 
                 markersize=6, markevery=max(1, len(months)//10))
        
        if _safe_get(styling, "fill_area", True):
            plt.fill_between(months, amounts, alpha=0.3, color=line_color)
        
        if _safe_get(styling, "target_line", True) and "final_amount" in data:
            target = float(_safe_get(data, "final_amount", max(amounts)))
            plt.axhline(y=target, color='#FF6B6B', linestyle='--', linewidth=2, 
                       label=f'Target: ${target:,.0f}')
            plt.legend(fontsize=12)
        
        plt.xlabel(_safe_get(styling, "x_label", "Months"), fontsize=14)
        plt.ylabel(_safe_get(styling, "y_label", "Amount ($)"), fontsize=14)
        plt.grid(True, alpha=0.3)
        plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
        
        return True
    except Exception as e:
        print(f"❌ Projection chart creation failed: {e}")
        return False

def _create_pie_chart_robust(data: Dict[str, Any], styling: Dict[str, Any]) -> bool:
    """Robust version of pie chart creation.
    
    Expected data format:
    {
        "categories": {
            "Housing": 1500,
            "Food": 600,
            "Transport": 400,
            "Entertainment": 300
        }
    }
    """
    try:
        categories = _safe_get(data, "categories", {})
        
        if not categories:
            raise ValueError("Pie chart requires 'categories' data with category names and amounts")
        
        print(f"🥧 Creating pie chart with {len(categories)} categories: {list(categories.keys())[:5]}...")
        
        labels = []
        amounts = []
        for category, amount in categories.items():
            try:
                if isinstance(amount, dict):
                    amount = amount.get("actual", amount.get("amount", 0))
                labels.append(str(category).replace('_', ' ').title())
                amounts.append(float(amount))
            except (ValueError, TypeError):
                continue
        
        if not labels or not amounts:
            raise ValueError("No valid data for pie chart")
        
        colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
        colors = colors[:len(labels)]
        
        wedges, texts, autotexts = plt.pie(amounts, labels=labels, colors=colors, 
                                          autopct='%1.1f%%', startangle=90, 
                                          explode=[0.05]*len(labels))
        
        for text in texts:
            text.set_fontsize(12)
            text.set_fontweight('bold')
        
        for autotext in autotexts:
            autotext.set_color('white')
            autotext.set_fontsize(11)
            autotext.set_fontweight('bold')
        
        plt.axis('equal')
        total = sum(amounts)
        plt.figtext(0.5, 0.02, f'Total: ${total:,.2f}', 
                   ha='center', fontsize=14, fontweight='bold')
        
        return True
    except Exception as e:
        print(f"❌ Pie chart creation failed: {e}")
        return False

def _create_comparison_chart_robust(data: Dict[str, Any], styling: Dict[str, Any]) -> bool:
    """Robust version of comparison/bar chart creation (handles both comparison and savings charts).
    
    Expected data formats:
    1. Direct comparison: {"Budget": 1500, "Actual": 1650, "Target": 1400}
    2. Savings opportunities: {"opportunities": {"Dining": 150, "Subscriptions": 75}}
    """
    try:
        # Handle various data formats - support both direct data and nested 'opportunities'
        chart_data = data
        if "opportunities" in data:
            chart_data = data["opportunities"]
            print(f"📊 Using opportunities data format with {len(chart_data)} categories")
        else:
            print(f"📊 Using direct comparison data format with {len(chart_data)} categories")
        
        if not chart_data:
            raise ValueError("Bar chart requires data with category names and values")
        
        categories = []
        values = []
        for key, value in chart_data.items():
            if key in ["chart_type", "title", "data", "styling", "opportunities"]:
                continue
            try:
                categories.append(str(key).replace('_', ' ').title())
                values.append(float(value))
            except (ValueError, TypeError):
                continue
        
        if not categories or not values:
            raise ValueError("No valid data for bar chart")
        
        # Use green colors for savings opportunities, normal colors for comparisons
        is_savings = "opportunities" in data or any("saving" in str(k).lower() for k in chart_data.keys())
        if is_savings:
            colors = _safe_get(styling, "colors", ['#27AE60', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6'])
        else:
            colors = _safe_get(styling, "colors", ['#E74C3C', '#27AE60', '#3498DB', '#F39C12'])
        colors = colors[:len(categories)]
        
        bars = plt.bar(categories, values, color=colors, alpha=0.8)
        
        for bar in bars:
            height = bar.get_height()
            plt.text(bar.get_x() + bar.get_width()/2., height + height*0.01,
                    f'${height:,.0f}', ha='center', va='bottom', fontweight='bold')
        
        plt.xlabel(_safe_get(styling, "x_label", "Categories"), fontsize=14)
        ylabel = "Potential Savings ($)" if is_savings else "Amount ($)"
        plt.ylabel(_safe_get(styling, "y_label", ylabel), fontsize=14)
        plt.xticks(rotation=45, ha='right')
        plt.grid(True, alpha=0.3, axis='y')
        plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
        
        # Add total for savings charts
        if is_savings:
            total = sum(values)
            plt.figtext(0.5, 0.02, f'Total Potential Savings: ${total:,.2f}', 
                       ha='center', fontsize=14, fontweight='bold',
                       bbox=dict(boxstyle="round,pad=0.3", facecolor="#27AE60", alpha=0.8))
        
        return True
    except Exception as e:
        print(f"❌ Bar chart creation failed: {e}")
        return False















