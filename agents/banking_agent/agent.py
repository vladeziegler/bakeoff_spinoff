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

from google.adk.agents import Agent
from google.adk.tools import AgentTool
# from google.adk.agents.remote_a_agent import AGENT_CARD_WELL_KNOWN_PATH
# from google.adk.agents.remote_a_agent import RemoteA2aAgent
import logging
from .sub_agents.agent import handling_agent


logger = logging.getLogger(__name__)


# class Config:   
#     """
#     Configuration class for the agent.
#     This class is used to store configuration settings for the agent.
#     """

#     def __init__(self):
#         self.root_agent_name = "vertex"
#         self.live_model_native = "gemini-live-2.5-flash-preview-native-audio"
#         self.live_model_standard = "gemini-live-2.5-flash"
#         self.general_model = "gemini-2.5-pro"


# config = Config()

main_agent_prompt = """
# YOUR PURPOSE:
You are a friendly and helpful AI assistant with a charming personality. 

Your goal is to answer the user's question as accurately as possible, and to be as entertaining as possible. Delegate to the available sub-agents to help you answer the user's question.

**Subagents guidelines**
You can call handling_agent if you need to gather financial data about user. 
In order to access this financial data, you need to ask the user his user_id.
You can then pass this user_id to the handling_agent to gather the financial data.
Otherwise, you can call the remote_agent to fetch the financial data.

## YOUR NAME:
Your name is "Financial Concierge". Disregard any other names you might be given.

## HOW TO RESPOND:
Respond to the user's question in a friendly, helpful, and entertaining manner.

## RESPONSE ETIQUETTE:
There is no need to be obsequious or ask follow-up questions. It's OK to simply respond and not request a follow-up such as "How else may I help you today? or What else do you want to know?

## BEFORE CALLING A TOOL OR FUNCTION:
Before calling a tool or function, briefly respond with a brief acknowledgement, such as "Let me look into that for you" or "Checking", or "Let me check for you...", or any other brief and appropriate response. Then proceed with invoking the function or tool.

# USER INFORMATION AND CONTEXT
The user's ID is: user-001 - You may use this for tool invocations or if the user asks.
The user's timezone is PDT, ensure you convert any date/time values to PDT.
"""


# remote_agent = RemoteA2aAgent(
#     name="cymbal_banking_agent",
#     description=(
#         "Helpful assistant that can roll dice and check if numbers are prime."
#     ),
#     agent_card=f"https://agent.ai-agent-bakeoff.com/.well-known/agent-card.json",
# )


root_agent = Agent(
    # A unique name for the agent.
    name="financial_concierge",
    # The Large Language Model (LLM) that agent will use.
    model="gemini-2.5-pro",
    # A short description of the agent's purpose.
    description="""Root agent that delegates to sub-agents when responding to user queries.""",
    # Instructions to set the agent's behavior.
    instruction="""
    You are a financial concierge. Your primary role is to assist users with their financial questions.

    **Step 1: Obtain User ID**
    Before proceeding with any financial inquiry, you must first ask the user for their user_id.

    **Step 2: Delegate to the Handling Agent**
    Once you have the user_id, you will delegate the user's request to the 'handling_agent'. The 'handling_agent' is responsible for all financial data retrieval and calculations. You should pass the user's request and the user_id to the 'handling_agent'.

    **Example Flow:**
    - **User:** "What is my current account balance?"
    - **You:** "Of course, I can help with that. What is your user_id?"
    - **User:** "It's 12345."
    - **You:** *Calls the 'handling_agent' with the request "What is my current account balance?" and user_id "12345".*
    """,
    sub_agents=[handling_agent]
    # Add google_search tool to perform grounding with Google search.
    # tools=[AgentTool(q_and_a_agent), AgentTool(weather_agent), AgentTool(remote_agent)],
)
