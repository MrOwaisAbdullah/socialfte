# Example usage of OpenAIAgentsClient with Gemini model
from dotenv import load_dotenv
import os
from agents import AsyncOpenAI, OpenAIChatCompletionsModel

# Load environment variables from .env file
load_dotenv()

# Load Gemini API key from environment variable
API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize AsyncOpenAI client for Gemini
provider = AsyncOpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=API_KEY,
)

# Define the chat completions model using Gemini
model = OpenAIChatCompletionsModel(
    openai_client=provider,
    model="gemini-2.0-flash-lite",
)