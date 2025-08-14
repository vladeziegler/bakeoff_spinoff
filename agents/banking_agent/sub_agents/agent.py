
from google.adk.agents import Agent, SequentialAgent
from google.adk.code_executors import BuiltInCodeExecutor
from google.adk.tools import AgentTool
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
from .tools import render_chart_to_html

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
        "Helpful assistant that can roll dice and check if numbers are prime."
    ),
    agent_card=f"https://agent.ai-agent-bakeoff.com/.well-known/agent-card.json",
)

# Sequential Visualization Sub-Agents

markdown_instructions_agent = Agent(
    name="markdown_instructions",
    model=config.general_model,
    instruction="""
    You are a graph instruction generator. Your job is to analyze financial text and create clear markdown instructions for what graph should be created.
    
    You will receive financial analysis text (from coding_results) and must generate markdown instructions that specify:
    1. **Chart Type**: Line chart, bar chart, pie chart, etc.
    2. **Title**: Clear, descriptive title for the chart
    3. **Data Points**: All numerical values and their meanings
    4. **Visual Elements**: Colors, styling preferences, axis labels
    
    **Example Input**: "Your current net worth is $21,000. Assuming you invest $100 per month for the next 5 years at 5% interest, your net worth will be approximately $27,800.61 in 5 years."
    
    **Example Output**:
    ```markdown
    # Graph Instructions
    
    **Chart Type**: Line Chart - Investment Projection
    **Title**: "Investment Growth Over 5 Years"
    **Data Points**:
    - Starting Amount: $21,000
    - Monthly Investment: $100
    - Interest Rate: 5% annually
    - Timeline: 60 months
    - Final Amount: $27,800.61
    
    **Visual Elements**:
    - X-axis: Months (0-60)
    - Y-axis: Account Balance ($)
    - Line color: Green (#2E8B57)
    - Fill area under curve
    - Add target line at final amount
    ```
    
    Always create clear, specific instructions that the next agent can easily convert to structured data.
    """,
    description="Agent that converts financial text into markdown graph instructions.",
)

structured_data_agent = Agent(
    name="structured_data",
    model=config.general_model,
    instruction="""
    You are a data structure converter. Your job is to take markdown graph instructions and convert them into structured JSON data.
    
    You will receive markdown instructions and must output a JSON structure with:
    - chart_type: The type of chart to create
    - title: Chart title
    - data: All numerical data points
    - styling: Visual styling preferences
    
    **Example Input**: Markdown instructions about investment projection
    
    **Example Output**:
    ```json
    {
      "chart_type": "line_projection",
      "title": "Investment Growth Over 5 Years",
      "data": {
        "starting_amount": 21000,
        "monthly_investment": 100,
        "interest_rate": 5,
        "timeline_months": 60,
        "final_amount": 27800.61
      },
      "styling": {
        "line_color": "#2E8B57",
        "fill_area": true,
        "target_line": true,
        "x_label": "Months",
        "y_label": "Account Balance ($)"
      }
    }
    ```
    
    Always output valid JSON that contains all the information needed to create the chart.
    """,
    description="Agent that converts markdown instructions into structured JSON data.",
)

html_graph_agent = Agent(
    name="html_graph",
    model=config.general_model,
    instruction="""
    You are an HTML graph generator. Your job is to take structured JSON data and create a complete HTML visualization.
    
    You will receive JSON data with chart specifications and must:
    1. Generate appropriate matplotlib code based on the data structure
    2. Execute the code to create the chart
    3. Convert to HTML with professional styling
    
    Use the render_chart_to_html tool to handle the matplotlib execution and HTML generation.
    
    **Supported Chart Types**:
    - line_projection: For financial projections over time
    - spending_pie: For spending category breakdowns
    - comparison_bar: For comparing financial options
    - savings_opportunities: For showing potential savings
    
    Always create professional, mobile-responsive HTML with the chart in a div with id="graph".
    """,
    description="Agent that generates HTML charts from structured data.",
    tools=[render_chart_to_html]
)

# Sequential Agent Pipeline
visualization_pipeline = SequentialAgent(
    name="VisualizationPipeline",
    sub_agents=[markdown_instructions_agent, structured_data_agent, html_graph_agent],
    description="A pipeline that converts financial text into markdown instructions, then structured data, then HTML charts",
)

# Main Visualization Agent that uses the pipeline
visualisation_agent = Agent(
    name="visualisation",
    model=config.general_model,
    instruction="""
    You are a visualization coordinator that creates charts from financial analysis results.
    
    You will receive financial text (often from coding_results) and use the visualization pipeline to create HTML charts.
    
    Your process:
    1. Take the financial text input
    2. Use the visualization pipeline to convert it through the 3-step process
    3. Return the final HTML chart
    
    The pipeline will handle:
    - Converting text to markdown instructions
    - Converting markdown to structured data
    - Converting structured data to HTML charts
    
    Always aim to create clear, professional visualizations that help users understand their financial situation.
    """,
    description="Main visualization agent that coordinates the chart creation pipeline.",
    tools=[AgentTool(visualization_pipeline)],
    output_key="visualisation_results"
)

# Updated handling agent to include visualization

handling_agent = Agent(
    name="handling",
    model=config.general_model,
    instruction="""
    You're an agent that collects financial data to perform calculations and create visualizations.

    If asked by the user for financial data, you need to call the remote_agent to gather the data.
    If asked by the user for calculations, you need to call the calculator_agent to perform the calculations.
    If asked by the user for visualizations, you need to call the visualization_agent to create the visualizations.

    You can also call the visualization_agent to create visualizations from the data that has been returned by the remote_agent.

    You can also call the visualization_agent to create visualizations from the data that has been returned by the calculator_agent.
    
    Your capabilities:
    1. **Data Collection**: Use remote_agent to gather financial data from bank accounts
    2. **Calculations**: Use calculator_agent to perform financial calculations and analysis
    3. **Visualizations**: Use visualization_agent to create charts and graphs from analysis results
    
    **Workflow:**
    1. First, gather financial data using remote_agent if needed
    2. Perform calculations using calculator_agent
    3. If the user wants to see charts or graphs, or if the analysis would benefit from visualization, call visualization_agent
    
    **When to Use Visualization:**
    - User explicitly asks for charts, graphs, or visual analysis
    - Analysis involves trends over time (savings growth, spending patterns)
    - Comparing different financial options (house prices, budget categories)
    - Showing spending breakdowns or savings opportunities
    - Any complex financial analysis that would be clearer with visual representation
    
    Always provide both textual analysis and visual representation when appropriate to give users the most comprehensive understanding of their financial situation.
    """,
    description="Agent to handle financial requests with data collection, calculations, and visualization.",
    tools=[AgentTool(calculator_agent), AgentTool(remote_agent), AgentTool(visualisation_agent)]
)




