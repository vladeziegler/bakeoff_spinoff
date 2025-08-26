
from google.adk.agents import Agent, SequentialAgent
from google.adk.code_executors import BuiltInCodeExecutor
from google.adk.tools import AgentTool
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
from .tools import direct_chart_generator, lookup_matplotlib_docs

class Config:
    """
    Configuration class for the agent.
    This class is used to store configuration settings for the agent.
    """

    def __init__(self):
        self.general_model = "gemini-2.5-flash"

config = Config()

calculator_agent = Agent(
    # A unique name for the agent.
    name="calculator",
    model=config.general_model,
    instruction="""You can do calculations. Use the code_executor tool to perform the calculation and return the result.
    Based on the user's question, you will need to determine the appropriate calculation to perform.
    
    """,
    description="Agent to perform calculations.",
    # Add code_executor tool to perform calculations.
    code_executor=BuiltInCodeExecutor(),
    output_key="coding_results"
)

remote_agent = RemoteA2aAgent(
    name="cymbal_banking_agent",
    description=(
        "Helpful assistant that can fetch user profile information, personal details, and other user-related data."
    ),
    agent_card=f"https://agent.ai-agent-bakeoff.com/.well-known/agent-card.json",
)

# Sequential Visualization Sub-Agents

markdown_instructions_agent = Agent(
    name="markdown_instructions",
    model="gemini-2.5-pro",
    instruction="""
    You are a graph instruction generator. Your job is to analyze financial text and create clear markdown instructions for what graph should be created.

    You will use the output of the handling_agent as the starting point for the data you'll use to create the graph.
    
    CRITICAL: Always generate meaningful chart instructions, even if the input text is vague or lacks specific numbers.
    
    Your output must specify:
    1. **Chart Type**: Line chart, bar chart, pie chart, etc.
    2. **Title**: Clear, descriptive title for the chart
    3. **Data Points**: All numerical values and their meanings (use sample data if needed)
    4. **Visual Elements**: Colors, styling preferences, axis labels
    
    **Default Template** (use when input is unclear):
    ```markdown
    # Graph Instructions
    
    **Chart Type**: Line Chart - Financial Projection
    **Title**: "Financial Analysis Visualization"
    **Data Points**:
    - Starting Amount: $25,000
    - Monthly Investment: $500
    - Interest Rate: 6% annually
    - Timeline: 60 months
    - Final Amount: $55,000
    
    **Visual Elements**:
    - X-axis: Months (0-60)
    - Y-axis: Account Balance ($)
    - Line color: Green (#2E8B57)
    - Fill area under curve
    - Add target line at final amount
    ```
    
    IMPORTANT: Always create complete, specific instructions that will result in a meaningful chart, even if using estimated or sample data.
    """,
    description="Agent that converts financial text into markdown graph instructions.",
)

structured_data_agent = Agent(
    name="structured_data",
    model=config.general_model,
    instruction="""
    Your job is to take markdown graph instructions and convert them into structured JSON data.
    
    CRITICAL: Always output valid JSON even if the input is incomplete or unclear.

    TOOLS:
    - lookup_matplotlib_docs: If you're unsure on how to create the chart, missing data, or any other information that relates to creating a chart, use this tool to lookup the matplotlib documentation to get the data for the chart.
    
    Your output structure:
    - chart_type: The type of chart to create (default: "line_projection")
    - title: Chart title (provide meaningful default if missing)
    - data: All numerical data points (use sample data if real data missing)
    - styling: Visual styling preferences (provide defaults)
    
    **Sample JSON**:
    ```json
    {
      "chart_type": "line_projection",
      "title": "Financial Analysis",
      "data": {
        "starting_amount": 25000,
        "monthly_investment": 500,
        "interest_rate": 6,
        "timeline_months": 60,
        "final_amount": 55000
      },
      "styling": {
        "line_color": "#2E8B57",
        "fill_area": true,
        "target_line": true,
        "x_label": "Months",
        "y_label": "Amount ($)"
      }
    }
    ```
    
    IMPORTANT: Always return valid, complete JSON that will generate a chart, even if using sample data.
    """,
    description="Agent that converts markdown instructions into structured JSON data.",
    
)

html_graph_agent = Agent(
    name="html_graph",
    model=config.general_model,
    instruction="""
    You are a financial chart generator. Your job is to create charts based on financial analysis context and data.

    **WHEN TO CREATE CHARTS**:
    - When asked to create financial visualizations
    - When specific financial data is provided (net worth, savings, projections, etc.)
    - When the context includes financial calculations or scenarios

    **PROCESS**:
    1. Analyze the financial context and data provided
    2. Create appropriate JSON chart data structure with REAL financial values (not defaults)
    3. Call the `direct_chart_generator` tool with the structured data
    4. Return a confirmation message

    **CHART DATA STRUCTURE** (use actual financial data, not defaults):
    ```json
    {
      "chart_type": "line_projection",
      "title": "[Descriptive title based on financial scenario]",
      "data": {
        "starting_amount": [ACTUAL current net worth/amount],
        "monthly_investment": [ACTUAL monthly savings/investment],
        "interest_rate": [ACTUAL or reasonable rate],
        "timeline_months": [ACTUAL timeline requested],
        "final_amount": [ACTUAL calculated final amount]
      },
      "styling": {
        "line_color": "#2E8B57",
        "fill_area": true,
        "target_line": true,
        "x_label": "Time Period",
        "y_label": "Amount ($)"
      }
    }
    ```

    **CRITICAL**: Always use REAL financial data from the context. Do NOT use default values like 25000, 500, 24 months unless those are the actual values discussed.

    **OUTPUT FORMAT**:
    - If chart generation succeeds: "Chart generated successfully: [TITLE]"
    - If chart generation fails: "I'm sorry, I was unable to generate the chart at this time."
    """,
    description="Agent that generates financial charts with real data and stores them for artifact creation.",
    tools=[direct_chart_generator, lookup_matplotlib_docs]
)

# Sequential Agent Pipeline
visualization_pipeline = SequentialAgent(
    name="visualization_pipeline",
    sub_agents=[markdown_instructions_agent, structured_data_agent, html_graph_agent]
)

# Main Visualization Agent that uses the pipeline
# This is now simplified as the pipeline is too complex and fragile.
# We will use a more direct approach.

# Updated handling agent to include visualization
# After agent callback for artifact generation
async def after_agent_callback(callback_context):
    """
    After agent callback that creates chart artifacts when visualizations are generated.
    Detects when charts were generated and converts them to artifacts.
    """
    try:
        from google.genai import types
        from datetime import datetime
        import logging
        
        logger = logging.getLogger(__name__)
        logger.info("🎨 After agent callback triggered for artifact generation")
        
        # Get the state to check if a chart was generated
        state = callback_context.state
        
        # Check if the direct_chart_generator stored chart data globally
        from . import tools
        chart_info = tools._last_chart_info
        
        if chart_info:
            logger.info("🎯 Chart was generated - creating artifact from real chart data...")
            
            # Extract chart information
            image_bytes = chart_info.get("image_bytes")
            chart_title = chart_info.get("title", "Financial Analysis")
            chart_data = chart_info.get("chart_data", {})
            
            if not image_bytes:
                logger.error("❌ No image bytes found in chart info")
                return None
            
            # Create artifact part from the actual generated chart
            image_part = types.Part.from_bytes(
                data=image_bytes,
                mime_type='image/png'
            )
            
            # Save as artifact
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            # Use the actual chart title for the artifact name
            safe_title = chart_title.replace(" ", "_").replace("/", "_")
            artifact_name = f"{safe_title}_{timestamp}.png"
            
            version = await callback_context.save_artifact(artifact_name, image_part)
            logger.info(f"✅ Saved chart as artifact '{artifact_name}' version {version}")
            
            # Store artifact info in state
            state["last_artifact"] = artifact_name
            state["artifact_created"] = True
            
            # Clear the global chart info to prevent duplicate processing
            from . import tools
            tools._last_chart_info = None
            
            # Return the artifact as part of the response, overriding the agent's text response
            text_part = types.Part(
                text=f"📊 Here's your {chart_title.lower()}:"
            )
            return types.Content(
                role="model",
                parts=[text_part, image_part]
            )
        else:
            # No chart was generated, don't modify the response
            logger.info("ℹ️ No chart generated - leaving agent response unchanged")
            return None
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"❌ Error in after agent callback: {e}")
        import traceback
        logger.error(f"Callback traceback: {traceback.format_exc()}")
        return None

handling_agent = Agent(
    name="handling",
    model=config.general_model,
    instruction="""
    You're an agent that collects financial data, performs calculations, and creates visualizations.

    **Workflow:**
    1. Gather financial data using `remote_agent` if needed.
    2. Perform calculations using `calculator_agent`.
    3. If a visualization is requested, use the `html_graph_agent` to generate charts.
    4. Provide your textual analysis and conclusions.

    Your capabilities:
    1. **Data Collection**: Use `remote_agent` to gather financial data from bank accounts.
    2. **Calculations**: Use `calculator_agent` to perform financial calculations and analysis.
    3. **Documentation Lookup**: Use `lookup_matplotlib_docs` to find answers to complex charting questions.
    4. **Visualization**: Use `html_graph_agent` to create charts that will be automatically displayed as artifacts.
    
    Always provide thorough textual analysis. When you request charts via html_graph_agent, they will be automatically converted to visual artifacts and displayed to the user, so focus on the analysis rather than chart URLs.
    
    Note: Charts generated via html_graph_agent will automatically appear as visual artifacts after your response.
    """,
    description="Agent to handle financial requests with data collection, calculations, and visualization.",
    tools=[AgentTool(calculator_agent), AgentTool(remote_agent), AgentTool(html_graph_agent)],
    output_key="handling_results",
    after_agent_callback=after_agent_callback
)