from google.adk.agents import Agent
from google.adk.tools import AgentTool
import logging
from .sub_agents.agent import handling_agent
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
from .sub_agents.agent import remote_agent


logger = logging.getLogger(__name__)

# This root_agent is not currently used by the main application's runner,
# which uses the agent defined in `main.py`.
# It is being simplified to remove the import error and avoid confusion.
# The primary `root_agent` for the application is in `main.py`.

root_agent = Agent(
    name="banking_agent_root",
    model="gemini-2.5-pro",
    description="A root agent for the banking demo.",
    sub_agents=[handling_agent],
    tools=[AgentTool(remote_agent)]
)
