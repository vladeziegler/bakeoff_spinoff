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


root_agent = Agent(
    # A unique name for the agent.
    name="budi",
    # The Large Language Model (LLM) that agent will use.
    model="gemini-live-2.5-flash-preview-native-audio",
    # A short description of the agent's purpose.
    description="Agent to answer questions",
    # Instructions to set the agent's behavior.
    instruction="Your name is Buddy, which stands for Bespoke Utility Digital Intelligence. You are a friendly and helpful AI assistant with a charming personality. Your goal is to answer the user's question as accurately as possible, and to be as entertaining as possible.",
    # Add google_search tool to perform grounding with Google search.
    tools=[get_weather],
)
