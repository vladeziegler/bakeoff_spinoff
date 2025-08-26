
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
    Here is the data from the handling_agent:
    {handling_results}
    
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
    You are a chart URL generator. Your job is to take JSON data, use a tool to generate a chart, and return a response with the chart URL in the exact required format.

    **PROCESS**:
    1.  Receive JSON data with chart specifications. Extract the `title`.
    2.  Call the `direct_chart_generator` tool with the JSON data and title. This will generate the chart and return the URL.
    3.  Return a response that includes the chart URL in the EXACT format specified below.
    
    **CRITICAL OUTPUT FORMAT**:
    You MUST return the URL in this EXACT format:
    "CHART_URL:[URL]"
    
    Where [URL] is the URL returned by the tool.
    
    **EXAMPLE**:
    If the tool returns "/static/images/chart_123.png", you must respond:
    "CHART_URL:/static/images/chart_123.png"
    
    **ERROR HANDLING**:
    - If the `direct_chart_generator` tool returns text starting with "ERROR_", return: "I'm sorry, I was unable to generate the chart at this time."
    
    **DO NOT** add extra text before or after the CHART_URL format. The frontend depends on this exact format.
    """,
    description="Agent that generates charts via HTTP endpoint and returns URLs.",
    tools=[direct_chart_generator]
)

# Sequential Agent Pipeline
visualization_pipeline = Agent(
    name="visualization_pipeline",
    model=config.general_model,
    instruction="""
    You are a visualization pipeline that takes financial data and creates a chart using the html_graph_agent.
    
    **CRITICAL INSTRUCTION:**
    You MUST call the html_graph_agent tool with the chart data, then return EXACTLY what the html_graph_agent returns.
    
    The html_graph_agent returns data in the format "CHART_URL:[URL]" - you MUST pass this through unchanged.
    
    **DO NOT** modify, wrap, or add extra text to the html_graph_agent's response.
    **DO NOT** create HTML tags yourself.
    
    Simply call the tool and return its exact output.
    """,
    tools=[
        AgentTool(html_graph_agent)
    ]
)

# Main Visualization Agent that uses the pipeline
# This is now simplified as the pipeline is too complex and fragile.
# We will use a more direct approach.

# Updated handling agent to include visualization
handling_agent = Agent(
    name="handling",
    model=config.general_model,
    instruction="""
    You're an agent that collects financial data, performs calculations, and creates visualizations.

    **Workflow:**
    1. Gather financial data using `remote_agent` if needed.
    2. Perform calculations using `calculator_agent`.
    3. If a visualization is requested, use the `html_graph_agent` to generate the chart URL.
    4. Include the chart URL from html_graph_agent in your final response.

    Your capabilities:
    1. **Data Collection**: Use `remote_agent` to gather financial data from bank accounts.
    2. **Calculations**: Use `calculator_agent` to perform financial calculations and analysis.
    3. **Documentation Lookup**: Use `lookup_matplotlib_docs` to find answers to complex charting questions.
    4. **Visualization**: Use `html_graph_agent` to create chart URLs.
    
    Always provide both textual analysis AND visual representation to give users comprehensive understanding.
    """,
    description="Agent to handle financial requests with data collection, calculations, and visualization.",
    tools=[AgentTool(calculator_agent), AgentTool(remote_agent), AgentTool(html_graph_agent), lookup_matplotlib_docs],
    output_key="handling_results"
)