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
    Uses a global variable to store chart data since tool context access is complex.
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
            
        # Generate chart using existing render function
        print(f"🔍 Parsed data before chart generation: {data}")
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
            data = _generate_sample_chart_data()
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
        elif chart_type == "comparison_bar": 
            chart_created = _create_comparison_chart_robust(chart_data, styling)
        elif chart_type == "savings_opportunities": 
            chart_created = _create_savings_chart_robust(chart_data, styling)
        else: 
            chart_created = _create_projection_chart_robust(chart_data, styling)
            
        if not chart_created: 
            _create_emergency_fallback_chart()
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

def render_chart_and_get_url(data_json: str, title: str = "Financial Analysis") -> str:
    """
    Simple chart generation that saves to file and returns URL.
    Args:
        data_json: JSON string of chart specifications.
        title: Title for the chart.
    Returns:
        URL path to the saved image or an error message.
    """
    print(f"🎨 Generating chart, saving to file: {title}")
    fig = None
    try:
        data = json.loads(data_json) if isinstance(data_json, str) else data_json
        if not isinstance(data, dict): data = _generate_sample_chart_data()
        chart_title = _safe_get(data, "title", title)
        
        plt.ioff()
        fig = plt.figure(figsize=(12, 8))
        plt.clf()

        # Chart creation logic...
        chart_type = _safe_get(data, "chart_type", "line_projection")
        chart_data = _safe_get(data, "data", {})
        styling = _safe_get(data, "styling", {})
        chart_created = False
        if chart_type == "line_projection": chart_created = _create_projection_chart_robust(chart_data, styling)
        elif chart_type == "spending_pie": chart_created = _create_pie_chart_robust(chart_data, styling)
        elif chart_type == "comparison_bar": chart_created = _create_comparison_chart_robust(chart_data, styling)
        elif chart_type == "savings_opportunities": chart_created = _create_savings_chart_robust(chart_data, styling)
        else: chart_created = _create_projection_chart_robust(chart_data, styling)
        if not chart_created: _create_emergency_fallback_chart()
        plt.title(chart_title, fontsize=18, fontweight='bold', pad=20)
        
        # Save to file in static directory (use absolute path to project root)
        safe_title = re.sub(r'[^\w\s-]', '', chart_title).strip().replace(' ', '_')
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{safe_title}_{timestamp}.png"
        
        # Get the project root directory (3 levels up from this file)
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        save_dir = os.path.join(project_root, "static", "images")
        os.makedirs(save_dir, exist_ok=True)
        filepath = os.path.join(save_dir, filename)
        
        plt.savefig(filepath, format='png', dpi=150, bbox_inches='tight')
        print(f"✅ Chart saved to: {filepath}")
        
        # Return the URL path that FastAPI will serve
        return f"/static/images/{filename}"
    except Exception as e:
        print(f"❌ Chart generation failed: {e}")
        return f"ERROR_CHART_GENERATION_FAILED: {e}"
    finally:
        if fig: plt.close(fig)

def _safe_get(data: Dict[str, Any], key: str, default: Any) -> Any:
    """Safely get value from dict with type checking."""
    try:
        value = data.get(key, default)
        return value if value is not None else default
    except (AttributeError, KeyError):
        return default

def _extract_chart_data_from_text(text: str) -> Dict[str, Any]:
    """Extract chart data from text description when JSON parsing fails."""
    print("🔧 Attempting to extract chart data from text description")
    
    # Basic text analysis to determine chart type
    text_lower = text.lower()
    if "pie" in text_lower or "breakdown" in text_lower:
        chart_type = "spending_pie"
    elif "bar" in text_lower or "comparison" in text_lower:
        chart_type = "comparison_bar"
    elif "savings" in text_lower or "opportunities" in text_lower:
        chart_type = "savings_opportunities"
    else:
        chart_type = "line_projection"
    
    # Generate appropriate sample data based on detected type
    sample_data = _generate_sample_chart_data()
    sample_data["chart_type"] = chart_type
    sample_data["title"] = f"Generated from Text: {text[:50]}..."
    
    return sample_data

def _create_projection_chart_robust(data: Dict[str, Any], styling: Dict[str, Any]) -> bool:
    """Robust version of projection chart creation."""
    try:
        print(f"🔍 Creating projection chart with data: {data}")
        starting_amount = float(_safe_get(data, "starting_amount", 25000))
        monthly_investment = float(_safe_get(data, "monthly_investment", 500))
        interest_rate = float(_safe_get(data, "interest_rate", 6)) / 100 / 12
        timeline_months = int(_safe_get(data, "timeline_months", 24))
        
        print(f"🔍 Chart parameters: start=${starting_amount}, monthly=${monthly_investment}, rate={interest_rate*12*100}%, months={timeline_months}")
        
        if timeline_months <= 0 or timeline_months > 120:
            timeline_months = 24
            
        months = np.arange(0, timeline_months + 1)
        amounts = []
        current = starting_amount
        
        for month in months:
            if month == 0:
                amounts.append(current)
            else:
                current = current * (1 + interest_rate) + monthly_investment
                amounts.append(current)
        
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
    """Robust version of pie chart creation."""
    try:
        categories = _safe_get(data, "categories", {})
        
        if not categories:
            # Create sample categories if none provided
            categories = {"Housing": 1500, "Food": 600, "Transport": 400, "Entertainment": 300}
        
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
    """Robust version of comparison chart creation."""
    try:
        # Handle various data formats
        chart_data = data
        if not chart_data:
            chart_data = {"Budget": 1500, "Actual": 1650, "Target": 1400}
        
        categories = []
        values = []
        for key, value in chart_data.items():
            if key in ["chart_type", "title", "data", "styling"]:
                continue
            try:
                categories.append(str(key).replace('_', ' ').title())
                values.append(float(value))
            except (ValueError, TypeError):
                continue
        
        if not categories or not values:
            raise ValueError("No valid data for comparison chart")
        
        colors = _safe_get(styling, "colors", ['#E74C3C', '#27AE60', '#3498DB', '#F39C12'])
        colors = colors[:len(categories)]
        
        bars = plt.bar(categories, values, color=colors, alpha=0.8)
        
        for bar in bars:
            height = bar.get_height()
            plt.text(bar.get_x() + bar.get_width()/2., height + height*0.01,
                    f'${height:,.0f}', ha='center', va='bottom', fontweight='bold')
        
        plt.xlabel(_safe_get(styling, "x_label", "Categories"), fontsize=14)
        plt.ylabel(_safe_get(styling, "y_label", "Amount ($)"), fontsize=14)
        plt.xticks(rotation=45, ha='right')
        plt.grid(True, alpha=0.3, axis='y')
        plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
        
        return True
    except Exception as e:
        print(f"❌ Comparison chart creation failed: {e}")
        return False

def _create_savings_chart_robust(data: Dict[str, Any], styling: Dict[str, Any]) -> bool:
    """Robust version of savings opportunities chart creation."""
    try:
        opportunities = _safe_get(data, "opportunities", data)
        
        if not opportunities:
            opportunities = {"Dining Out": 150, "Subscriptions": 75, "Energy": 50}
        
        labels = []
        amounts = []
        for key, value in opportunities.items():
            if key in ["chart_type", "title", "data", "styling"]:
                continue
            try:
                labels.append(str(key).replace('_', ' ').title())
                amounts.append(float(value))
            except (ValueError, TypeError):
                continue
        
        if not labels or not amounts:
            raise ValueError("No valid data for savings chart")
        
        colors = ['#27AE60', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6'][:len(labels)]
        bars = plt.bar(labels, amounts, color=colors)
        
        for bar in bars:
            height = bar.get_height()
            plt.text(bar.get_x() + bar.get_width()/2., height + height*0.01,
                    f'${height:,.0f}', ha='center', va='bottom', fontweight='bold')
        
        plt.xlabel("Categories", fontsize=14)
        plt.ylabel("Potential Savings ($)", fontsize=14)
        plt.xticks(rotation=45, ha='right')
        plt.grid(True, alpha=0.3, axis='y')
        
        total_savings = sum(amounts)
        plt.figtext(0.5, 0.02, f'Total Potential Savings: ${total_savings:,.2f}', 
                   ha='center', fontsize=14, fontweight='bold',
                   bbox=dict(boxstyle="round,pad=0.3", facecolor="#27AE60", alpha=0.8))
        
        plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
        
        return True
    except Exception as e:
        print(f"❌ Savings chart creation failed: {e}")
        return False

def _create_emergency_fallback_chart():
    """Create a simple emergency chart when all else fails."""
    print("🚨 Creating emergency fallback chart")
    x = [1, 2, 3, 4, 5]
    y = [1000, 2000, 1500, 3000, 2500]
    plt.plot(x, y, 'b-o', linewidth=2, markersize=6)
    plt.xlabel("Time Period", fontsize=12)
    plt.ylabel("Amount ($)", fontsize=12)
    plt.title("Emergency Financial Chart", fontsize=14)
    plt.grid(True, alpha=0.3)

def _create_projection_chart(data: Dict[str, Any], styling: Dict[str, Any]) -> None:
    """Create a projection/growth line chart."""
    starting_amount = data.get("starting_amount", 0)
    monthly_investment = data.get("monthly_investment", 0)
    interest_rate = data.get("interest_rate", 0) / 100 / 12  # Monthly rate
    timeline_months = data.get("timeline_months", 12)
    
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
    
    # Plot the line
    line_color = styling.get("line_color", "#2E8B57")
    plt.plot(months, amounts, linewidth=3, color=line_color, marker='o', 
             markersize=6, markevery=max(1, len(months)//10))
    
    if styling.get("fill_area", True):
        plt.fill_between(months, amounts, alpha=0.3, color=line_color)
    
    if styling.get("target_line", True) and "final_amount" in data:
        target = data["final_amount"]
        plt.axhline(y=target, color='#FF6B6B', linestyle='--', linewidth=2, 
                   label=f'Target: ${target:,.0f}')
        plt.legend(fontsize=12)
    
    plt.xlabel(styling.get("x_label", "Months"), fontsize=14)
    plt.ylabel(styling.get("y_label", "Amount ($)"), fontsize=14)
    plt.grid(True, alpha=0.3)
    plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))

def _create_pie_chart(data: Dict[str, Any], styling: Dict[str, Any]) -> None:
    """Create a pie chart for spending categories."""
    categories = data.get("categories", {})
    
    labels = []
    amounts = []
    for category, amount in categories.items():
        if isinstance(amount, dict):
            amount = amount.get("actual", amount.get("amount", 0))
        labels.append(category.replace('_', ' ').title())
        amounts.append(float(amount))
    
    # Create color palette
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
    colors = colors[:len(labels)]
    
    # Create pie chart
    wedges, texts, autotexts = plt.pie(amounts, labels=labels, colors=colors, 
                                      autopct='%1.1f%%', startangle=90, 
                                      explode=[0.05]*len(labels))
    
    # Enhance text appearance
    for text in texts:
        text.set_fontsize(12)
        text.set_fontweight('bold')
    
    for autotext in autotexts:
        autotext.set_color('white')
        autotext.set_fontsize(11)
        autotext.set_fontweight('bold')
    
    plt.axis('equal')
    
    # Add total annotation
    total = sum(amounts)
    plt.figtext(0.5, 0.02, f'Total: ${total:,.2f}', 
               ha='center', fontsize=14, fontweight='bold')

def _create_comparison_chart(data: Dict[str, Any], styling: Dict[str, Any]) -> None:
    """Create a comparison bar chart."""
    categories = list(data.keys())
    values = [float(data[cat]) for cat in categories]
    
    colors = styling.get("colors", ['#E74C3C', '#27AE60', '#3498DB', '#F39C12'])
    colors = colors[:len(categories)]
    
    bars = plt.bar(categories, values, color=colors, alpha=0.8)
    
    # Add value labels on bars
    for bar in bars:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + height*0.01,
                f'${height:,.0f}', ha='center', va='bottom', fontweight='bold')
    
    plt.xlabel(styling.get("x_label", "Categories"), fontsize=14)
    plt.ylabel(styling.get("y_label", "Amount ($)"), fontsize=14)
    plt.xticks(rotation=45, ha='right')
    plt.grid(True, alpha=0.3, axis='y')
    plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))

def _create_savings_chart(data: Dict[str, Any], styling: Dict[str, Any]) -> None:
    """Create a savings opportunities bar chart."""
    opportunities = data.get("opportunities", data)
    
    labels = [cat.replace('_', ' ').title() for cat in opportunities.keys()]
    amounts = [float(val) for val in opportunities.values()]
    
    colors = ['#27AE60', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6'][:len(labels)]
    bars = plt.bar(labels, amounts, color=colors)
    
    # Add value labels
    for bar in bars:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + height*0.01,
                f'${height:,.0f}', ha='center', va='bottom', fontweight='bold')
    
    plt.xlabel("Categories", fontsize=14)
    plt.ylabel("Potential Savings ($)", fontsize=14)
    plt.xticks(rotation=45, ha='right')
    plt.grid(True, alpha=0.3, axis='y')
    
    # Add total savings annotation
    total_savings = sum(amounts)
    plt.figtext(0.5, 0.02, f'Total Potential Savings: ${total_savings:,.2f}', 
               ha='center', fontsize=14, fontweight='bold',
               bbox=dict(boxstyle="round,pad=0.3", facecolor="#27AE60", alpha=0.8))
    
    plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))

def _generate_sample_chart_data() -> Dict[str, Any]:
    """Generate sample chart data for when real data is unavailable."""
    return {
        "chart_type": "line_projection",
        "title": "Sample Net Worth Progression",
        "data": {
            "starting_amount": 25000,
            "monthly_investment": 500,
            "interest_rate": 6,
            "timeline_months": 60,
            "final_amount": 55000
        },
        "styling": {
            "line_color": "#2E8B57",
            "fill_area": True,
            "target_line": True,
            "x_label": "Months",
            "y_label": "Net Worth ($)"
        }
    }

def main():
    """
    Test function to demonstrate the various chart generation capabilities.
    This function creates different types of charts and saves them as HTML files.
    """
    print("🚀 Starting chart generation tests...\n")
    
    # Test cases for different chart types
    test_cases = [
        {
            "name": "Line Projection Chart",
            "data": {
                "chart_type": "line_projection",
                "title": "Investment Growth Projection",
                "data": {
                    "starting_amount": 10000,
                    "monthly_investment": 1000,
                    "interest_rate": 7.5,
                    "timeline_months": 24,
                    "final_amount": 45000
                },
                "styling": {
                    "line_color": "#2E8B57",
                    "fill_area": True,
                    "target_line": True,
                    "x_label": "Months",
                    "y_label": "Portfolio Value ($)"
                }
            }
        },
        {
            "name": "Spending Pie Chart",
            "data": {
                "chart_type": "spending_pie",
                "title": "Monthly Spending Breakdown",
                "data": {
                    "categories": {
                        "housing": 1500,
                        "food": 600,
                        "transportation": 400,
                        "entertainment": 300,
                        "utilities": 200,
                        "savings": 1000
                    }
                },
                "styling": {
                    "colors": ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"]
                }
            }
        },
        {
            "name": "Comparison Bar Chart",
            "data": {
                "chart_type": "comparison_bar",
                "title": "Budget vs Actual Spending",
                "data": {
                    "Housing_Budget": 1500,
                    "Housing_Actual": 1650,
                    "Food_Budget": 600,
                    "Food_Actual": 575,
                    "Transport_Budget": 400,
                    "Transport_Actual": 425
                },
                "styling": {
                    "colors": ["#E74C3C", "#27AE60", "#3498DB", "#F39C12", "#9B59B6", "#E67E22"],
                    "x_label": "Categories",
                    "y_label": "Amount ($)"
                }
            }
        },
        {
            "name": "Savings Opportunities Chart",
            "data": {
                "chart_type": "savings_opportunities",
                "title": "Monthly Savings Opportunities",
                "data": {
                    "opportunities": {
                        "dining_out": 150,
                        "subscriptions": 75,
                        "impulse_purchases": 200,
                        "energy_efficiency": 50,
                        "insurance_optimization": 100
                    }
                },
                "styling": {
                    "colors": ["#27AE60", "#E74C3C", "#3498DB", "#F39C12", "#9B59B6"]
                }
            }
        }
    ]
    
    # Run tests for each chart type
    for i, test_case in enumerate(test_cases, 1):
        print(f"--- Test {i}: {test_case['name']} ---")
        
        try:
            # Convert data to JSON string
            data_json = json.dumps(test_case['data'])
            
            # Generate chart and get its filename
            result_url = render_chart_and_get_url(data_json, test_case['data']['title'])
            
            if result_url.startswith("ERROR_CHART_GENERATION_FAILED"):
                print(f"❌ {test_case['name']} failed to generate chart: {result_url}")
            else:
                print(f"✅ {test_case['name']} generated successfully")
                print(f"✨ Chart URL generated: {result_url}")
                
                # Create HTML file for visual inspection
                html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>{test_case['name']} - Test Result</title>
    <style>
        body {{ 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 20px; 
            background-color: #f5f7fa;
        }}
        .chart-container {{
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 15px;
            padding: 25px;
            margin: 20px auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            max-width: 1000px;
        }}
        .chart-title {{
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            text-align: center;
            margin-bottom: 20px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }}
        .chart-image {{
            width: 100%;
            height: auto;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.15);
        }}
        .chart-footer {{
            text-align: center;
            margin-top: 15px;
            font-size: 12px;
            color: #7f8c8d;
            font-style: italic;
        }}
    </style>
</head>
<body>
    <div class="chart-container">
        <div class="chart-title">{test_case['data']['title']}</div>
        <img src="{result_url}" alt="Financial Chart" class="chart-image">
        <div class="chart-footer">Generated by Financial Visualization Tool - Test {i}</div>
    </div>
    
    <div style="margin-top: 20px; padding: 15px; background: white; border-radius: 10px;">
        <h3>Test Data:</h3>
        <pre style="background: #f8f9fa; padding: 10px; border-radius: 5px; overflow-x: auto;">
{json.dumps(test_case['data'], indent=2)}
        </pre>
    </div>
</body>
</html>
"""
                
                # Save HTML file
                filename = f"test_chart_{i}_{test_case['name'].lower().replace(' ', '_')}.html"
                with open(filename, 'w') as f:
                    f.write(html_content)
                print(f"💾 Saved test result to: {filename}")
                
        except Exception as e:
            print(f"❌ {test_case['name']} failed with exception: {str(e)}")
        
        print()  # Add spacing between tests

    # --- New Test for Matplotlib Docs Lookup ---
    print("--- Test {}: Matplotlib Docs Lookup ---".format(len(test_cases) + 1))
    try:
        doc_query = "How do I change the color of a line in a plot?"
        print(f"🤔 Querying Matplotlib docs: \"{doc_query}\"")
        doc_result = lookup_matplotlib_docs(doc_query)
        if doc_result.startswith("Failed"):
            print(f"❌ Docs lookup failed: {doc_result}")
        else:
            print(f"✅ Docs lookup successful!")
            print("--- Response ---")
            print(doc_result)
            print("----------------")
    except Exception as e:
        print(f"❌ Docs lookup failed with exception: {e}")
    print()
    
    print("🎉 All chart generation tests completed!")
    print("📁 Check the generated HTML files to visually inspect the charts.")
    print("🔍 You can open them in a web browser to see the results.")

# Run the main function if this script is executed directly
if __name__ == "__main__":
    main()