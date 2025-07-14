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
from google.adk.tools import google_search  # Import the tool

root_agent = Agent(
    # A unique name for the agent.
    name="google_search_agent",
    # The Large Language Model (LLM) that agent will use.
    model="gemini-live-2.5-flash-preview-native-audio",
    # model="gemini-2.0-flash",
    # A short description of the agent's purpose.
    description="Agent to answer questions",
    # Instructions to set the agent's behavior.
    instruction="You are a friendly and helpful AI assistant with a charming personality. Your goal is to answer the user's question as accurately as possible, and to be as entertaining as possible.",
    # Add google_search tool to perform grounding with Google search.
    # tools=[google_search], # Not needed
)
