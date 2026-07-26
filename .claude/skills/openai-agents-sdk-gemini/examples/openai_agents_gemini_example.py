"""
Complete example of using OpenAI Agents SDK with Gemini API
This demonstrates proper usage with correct Runner API
"""

import asyncio
import os
from dotenv import load_dotenv
from agents import (
    Agent, AsyncOpenAI, Runner, function_tool, handoff,
    OpenAIChatCompletionsModel,
    SQLiteSession, set_tracing_disabled
)
import requests
import json
from datetime import datetime

# Load environment variables
load_dotenv()
set_tracing_disabled(True)

# Initialize Gemini provider
provider = AsyncOpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_API_KEY"),
)

# Create model
model = OpenAIChatCompletionsModel(
    openai_client=provider,
    model="gemini-2.0-flash-lite",
    temperature=0.7,
)

# Tools
@function_tool
async def get_weather(location: str, units: str = "metric") -> str:
    """
    Fetch current weather for a location

    Args:
        location: City or location name
        units: Temperature units (metric, imperial, or kelvin)
    """
    api_key = os.getenv("WEATHER_API_KEY")
    if not api_key:
        return "Weather API key not configured"

    url = f"http://api.weatherapi.com/v1/current.json?key={api_key}&q={location}"

    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            current = data["current"]
            location_name = data["location"]["name"]

            temp = current["temp_c"] if units == "metric" else current["temp_f"]
            unit_symbol = "°C" if units == "metric" else "°F"

            return f"""
📍 Location: {location_name}
🌡️ Temperature: {temp}{unit_symbol}
☁️ Condition: {current['condition']['text']}
💧 Humidity: {current['humidity']}%
💨 Wind: {current['wind_kph']} km/h
📊 Pressure: {current['pressure_mb']} mb
            """
        else:
            return f"Error fetching weather data: {response.status_code}"
    except Exception as e:
        return f"Error: {str(e)}"

@function_tool
async def get_forecast(location: str, days: int = 3) -> str:
    """
    Get weather forecast for upcoming days

    Args:
        location: City or location name
        days: Number of days to forecast (1-10)
    """
    api_key = os.getenv("WEATHER_API_KEY")
    url = f"http://api.weatherapi.com/v1/forecast.json?key={api_key}&q={location}&days={days}"

    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            location_name = data["location"]["name"]
            forecast_days = data["forecast"]["forecastday"]

            forecast_text = f"📍 {location_name} - {days}-Day Forecast:\n\n"

            for day in forecast_days:
                date = day["date"]
                max_temp = day["day"]["maxtemp_c"]
                min_temp = day["day"]["mintemp_c"]
                condition = day["day"]["condition"]["text"]
                rain_chance = day["day"]["daily_chance_of_rain"]

                forecast_text += f"📅 {date}\n"
                forecast_text += f"🌡️ {min_temp}°C - {max_temp}°C\n"
                forecast_text += f"☁️ {condition}\n"
                forecast_text += f"🌧️ {rain_chance}% chance of rain\n\n"

            return forecast_text
        else:
            return f"Error fetching forecast: {response.status_code}"
    except Exception as e:
        return f"Error: {str(e)}"

@function_tool
async def search_web(query: str, num_results: int = 5) -> str:
    """
    Search the web for information (placeholder implementation)

    Args:
        query: Search query
        num_results: Number of results to return
    """
    # In a real implementation, you would use a search API
    return f"Searching for: {query} (returning {num_results} results)"

# Specialized agents
temperature_agent = Agent(
    name="Temperature Specialist",
    instructions="You specialize in temperature data and heat patterns. Provide detailed temperature analysis.",
    model=model,
)

forecast_agent = Agent(
    name="Forecast Specialist",
    instructions="You specialize in weather forecasting and predictions. Analyze forecast trends.",
    model=model,
)

# Main weather agent
weather_agent = Agent(
    name="Weather Assistant",
    instructions="""
    You are a helpful weather assistant. Provide weather information in a clear,
    friendly format with emojis for better readability.

    - Use the get_weather tool for current conditions
    - Use the get_forecast tool for predictions
    - Hand off to Temperature Specialist for detailed temperature analysis
    - Hand off to Forecast Specialist for advanced forecasting questions

    Always include relevant emojis and format your responses for easy reading.
    """,
    model=model,
    tools=[get_weather, get_forecast],
    handoffs=[
        handoff(temperature_agent, "temp_analysis"),
        handoff(forecast_agent, "forecast_analysis"),
    ],
)

# Examples of proper Runner usage

async def example_basic_usage():
    """Basic agent usage example"""
    print("=== Basic Usage Example ===")

    # Simple agent run
    result = await Runner.run(
        weather_agent,
        "What's the weather like in Tokyo?"
    )
    print(result.final_output)
    print()

async def example_with_session():
    """Example with session management"""
    print("=== Session Management Example ===")

    # Create a session
    session = SQLiteSession("weather_chat_123")

    # First interaction
    result1 = await Runner.run(
        weather_agent,
        "What's the weather in London?",
        session=session
    )
    print("Q: What's the weather in London?")
    print(f"A: {result1.final_output}\n")

    # Second interaction - agent remembers context
    result2 = await Runner.run(
        weather_agent,
        "How about tomorrow?",
        session=session
    )
    print("Q: How about tomorrow?")
    print(f"A: {result2.final_output}\n")

async def example_with_handoffs():
    """Example with agent handoffs"""
    print("=== Handoffs Example ===")

    # Triage agent
    triage_agent = Agent(
        name="Weather Triage",
        instructions="Direct to appropriate specialist based on the request.",
        model=model,
        handoffs=[
            handoff(temperature_agent, "temp_analysis"),
            handoff(forecast_agent, "forecast_analysis"),
        ],
    )

    # This will handoff to forecast specialist
    result = await Runner.run(
        triage_agent,
        "Can you analyze the temperature trends for next week in New York?"
    )
    print(f"Result: {result.final_output}\n")

async def example_sync_runner():
    """Example using synchronous runner"""
    print("=== Synchronous Runner Example ===")

    result = Runner.run_sync(
        weather_agent,
        "Give me a quick weather update for Paris"
    )
    print(f"Sync result: {result.final_output}\n")

async def example_streaming():
    """Example of streaming responses"""
    print("=== Streaming Example ===")

    print("Streaming response: ", end="", flush=True)

    # Stream the response
    async for event in Runner.run_streamed(
        weather_agent,
        "Tell me about the weather in Sydney"
    ):
        if event.type == "agent_step_stream":
            for chunk in event.output:
                print(chunk.content, end="", flush=True)

    print("\n")

async def example_with_max_turns():
    """Example with max_turns limit"""
    print("=== Max Turns Example ===")

    result = await Runner.run(
        weather_agent,
        "Analyze the weather patterns in Tokyo, then get the forecast, then check temperature",
        max_turns=5  # Limit to 5 turns
    )
    print(f"Result with max_turns=5: {result.final_output}\n")

# Main demo
async def main():
    """Run all examples"""
    print("OpenAI Agents SDK with Gemini - Complete Examples\n")
    print("=" * 50)

    # Check API keys
    if not os.getenv("GEMINI_API_KEY"):
        print("ERROR: GEMINI_API_KEY not found in environment")
        return

    if not os.getenv("WEATHER_API_KEY"):
        print("WARNING: WEATHER_API_KEY not found, weather tools will fail")

    try:
        await example_basic_usage()
        await example_with_session()
        await example_with_handoffs()
        await example_sync_runner()
        await example_streaming()
        await example_with_max_turns()

    except Exception as e:
        print(f"Error running examples: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())