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
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Config:
    """
    Configuration class for the agent.
    This class is used to store configuration settings for the agent.
    """

    def __init__(self):
        self.root_agent_name = "budi"
        self.live_model = "gemini-live-2.5-flash-preview-native-audio"
        self.general_model = "gemini-2.5-flash"


config = Config()


def get_weather(city: str, state: str) -> dict:
    """
    Returns a randomly selected weather forecast for a US city. Only US cities are supported.

    Args:
        city: The name of the city
        state: The US state abbreviation

    Returns:
        A dictionary containing weather information
    """
    import random

    weather_conditions = [
        "Sunny",
        "Partly Cloudy",
        "Cloudy",
        "Rainy",
        "Thunderstorms",
        "Snowy",
        "Windy",
        "Foggy",
    ]
    temperatures = range(20, 105)
    humidity_levels = range(10, 100)
    wind_speeds = range(0, 30)

    weather = {
        "location": f"{city}, {state}",
        "condition": random.choice(weather_conditions),
        "temperature": random.choice(temperatures),
        "humidity": random.choice(humidity_levels),
        "wind_speed": random.choice(wind_speeds),
    }

    logger.info(f"Weather for {city}, {state}: {weather}")

    return weather


q_and_a_agent = Agent(
    # A unique name for the agent.
    name="q_and_a",
    model=config.live_model,
    instruction="You can answer questions about various topics. If you don't know the answer, you can use the google_search tool to find information.",
    description="Agent to answer questions",
    # Add google_search tool to perform grounding with Google search.
    tools=[google_search],
)

weather_agent = Agent(
    # A unique name for the agent.
    name="weather",
    model=config.general_model,
    instruction="Get the weather for the user's requested city and state",
    description="Agent to get the weather",
    tools=[get_weather],
)

root_agent = Agent(
    # A unique name for the agent.
    name=config.root_agent_name,
    # The Large Language Model (LLM) that agent will use.
    model="gemini-live-2.5-flash-preview-native-audio",
    # A short description of the agent's purpose.
    description="Root agent that delegates to sub-agents when responding to user queries.",
    # Instructions to set the agent's behavior.
    instruction="You are a friendly and helpful AI assistant with a charming personality. Your goal is to answer the user's question as accurately as possible, and to be as entertaining as possible. Delegate to the available sub-agents to help you answer the user's question",
    # Add google_search tool to perform grounding with Google search.
    sub_agents=[q_and_a_agent, weather_agent],
)
