---
name: openai-agents-sdk-gemini
version: 1.0.0
description: Comprehensive OpenAI Agents SDK integration with Gemini API, supporting tools, functions, handoffs, and session management
author: Claude Code Skill
license: MIT
tags:
  - openai-agents
  - gemini
  - ai-sdk
  - tools
  - functions
  - handoffs
  - sessions
  - multi-agent
requirements:
  - agents>=0.15.0
  - openai>=1.0.0
  - python-dotenv>=1.0.0
  - asyncio
  - pydantic>=2.0.0
...

# OpenAI Agents SDK with Gemini API Skill

A comprehensive skill that enables you to build powerful AI agents using OpenAI's Agents SDK with Google's Gemini models. This skill provides complete integration including tools, functions, handoffs, and session management.

## Features

- **Multi-Model Support**: Use Gemini 2.5 Flash, Pro, and other models through OpenAI-compatible interface
- **Tool Integration**: Create and use custom tools with your agents
- **Function Calling**: Leverage Gemini's native function calling capabilities
- **Handoffs**: Transfer conversations between specialized agents
- **Session Management**: Maintain conversation state across multiple interactions
- **Parallel Execution**: Run multiple tools and agents concurrently
- **Error Handling**: Robust error handling and retry mechanisms
- **Streaming**: Real-time response streaming for better UX

## Quick Setup

### 1. Install Dependencies

```bash
pip install openai-agents python-dotenv pydantic
```

### 2. Set Environment Variables

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Basic Usage

```python
from agents import Agent, Runner, OpenAIChatCompletionsModel, AsyncOpenAI
import os

# Initialize Gemini provider
provider = AsyncOpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_API_KEY"),
)

# Create model
model = OpenAIChatCompletionsModel(
    openai_client=provider,
    model="gemini-2.0-flash-lite",
)

# Create agent
agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant",
    model=model,
)

# Run agent
runner = Runner(agent=agent)
result = await runner.run("Hello, how are you?")
print(result.final_output)
```

## Core Components

### 1. Agent Creation

```python
from agents import Agent
from typing import List

# Simple agent
agent = Agent(
    name="Weather Assistant",
    instructions="You are a weather assistant. Provide weather information in a friendly way.",
    model=model,
)

# Agent with tools
agent_with_tools = Agent(
    name="Weather Agent",
    instructions="You are a weather expert. Use the get_weather tool to fetch current weather data.",
    model=model,
    tools=[get_weather_tool],
)

# Specialized agent with handoffs
specialized_agent = Agent(
    name="Weather Specialist",
    instructions="You specialize in weather analysis and forecasting.",
    model=model,
    tools=[get_weather_tool, analyze_weather_pattern],
    handoffs=[temperature_specialist, forecast_specialist],
)
```

### 2. Tool Creation

```python
from agents import function_tool
import requests
from typing import Optional

@function_tool
def get_weather(location: str, units: str = "metric") -> str:
    """
    Fetch current weather information for a given location.

    Args:
        location: The city or location name
        units: Temperature units (metric, imperial, or kelvin)
    """
    api_key = os.getenv("WEATHER_API_KEY")
    base_url = "http://api.weatherapi.com/v1/current.json"

    response = requests.get(
        f"{base_url}?key={api_key}&q={location}&aqi=no"
    )

    if response.status_code == 200:
        data = response.json()
        temp = data['current']['temp_c'] if units == "metric" else data['current']['temp_f']
        condition = data['current']['condition']['text']
        humidity = data['current']['humidity']
        wind_kph = data['current']['wind_kph']

        return f"""
        Weather in {location}:
        🌡️ Temperature: {temp}°{'C' if units == 'metric' else 'F'}
        ☁️ Condition: {condition}
        💧 Humidity: {humidity}%
        💨 Wind: {wind_kph} km/h
        """
    else:
        return f"Sorry, I couldn't fetch weather data for {location}."

@function_tool
async def search_web(query: str, num_results: int = 5) -> str:
    """
    Search the web for information.

    Args:
        query: Search query
        num_results: Number of results to return
    """
    # Implement web search using your preferred API
    # This is a placeholder implementation
    return f"Searching for: {query} (returning {num_results} results)"
```

### 3. Agent Handoffs

```python
from agents import handoff

# Create specialized agents
temperature_agent = Agent(
    name="Temperature Specialist",
    instructions="You specialize in temperature analysis and heat patterns.",
    model=model,
)

forecast_agent = Agent(
    name="Forecast Specialist",
    instructions="You specialize in weather forecasting and predictions.",
    model=model,
)

# Main agent with handoffs
main_agent = Agent(
    name="Weather Central",
    instructions="""
    You are a central weather assistant. For temperature-specific questions,
    hand off to the Temperature Specialist. For forecast questions,
    hand off to the Forecast Specialist.
    """,
    model=model,
    handoffs=[
        handoff(temperature_agent, "temperature_analysis"),
        handoff(forecast_agent, "weather_forecast"),
    ],
)

# Example usage with handoffs
runner = Runner(agent=main_agent)
result = await runner.run(
    "What's the temperature trend for next week?"
)
# Will automatically hand off to forecast_agent
```

### 4. Session Management

```python
from agents import Runner, Agent
import asyncio

# CORRECT: Using built-in session management
from agents import SQLiteSession

# Create a session
session = SQLiteSession("conversation_123")

# First turn
result = await Runner.run(
    agent,
    "What's the weather in London?",
    session=session
)
print(result.final_output)

# Second turn - agent automatically remembers context
result = await Runner.run(
    agent,
    "How about tomorrow?",
    session=session
)
print(result.final_output)
```

### 5. Multi-Agent Collaboration

```python
from agents import Agent, Runner, handoff
import asyncio

# Create specialized agents
research_agent = Agent(
    name="Research Specialist",
    instructions="You research and gather information from multiple sources.",
    model=model,
    tools=[search_web, fetch_document],
)

analysis_agent = Agent(
    name="Analysis Specialist",
    instructions="You analyze data and provide insights.",
    model=model,
    tools=[analyze_data, create_charts],
)

report_agent = Agent(
    name="Report Writer",
    instructions="You compile information into well-structured reports.",
    model=model,
    tools=[generate_report, export_to_pdf],
)

# Coordinator agent
coordinator = Agent(
    name="Project Coordinator",
    instructions="""
    You coordinate multi-agent workflows. Break down complex tasks
    and delegate to appropriate specialists.
    """,
    model=model,
    handoffs=[
        handoff(research_agent, "research"),
        handoff(analysis_agent, "analysis"),
        handoff(report_agent, "report"),
    ],
)

async def run_complex_task(task: str):
    """Execute a complex task using multiple agents"""
    # CORRECT: The coordinator will break down the task and hand off as needed
    result = await Runner.run(
        coordinator,
        f"Complete this task: {task}\n\n"
        "Break it down into research, analysis, and reporting phases."
    )
    return result
```

### 6. Streaming Responses

```python
from agents import Runner, Agent
import asyncio

async def stream_response(agent: Agent, message: str):
    """Stream agent responses in real-time"""
    print("Response: ", end="", flush=True)

    # CORRECT: Stream usage
    async for event in Runner.run_streamed(agent, message):
        if event.type == "agent_step_stream":
            for chunk in event.output:
                print(chunk.content, end="", flush=True)

    print()  # New line after completion

# Usage
await stream_response(weather_agent, "Tell me about today's weather forecast")
```

### 7. Error Handling and Retries

```python
from agents import Runner, Agent
from typing import Optional
import asyncio
import logging

logging.basicConfig(level=logging.INFO)

async def run_with_retry(agent: Agent, message: str, max_retries: int = 3):
    """Run agent with automatic retry on errors"""
    for attempt in range(max_retries):
        try:
            # CORRECT: Direct Runner.run usage
            result = await Runner.run(agent, message)
            return result.final_output
        except Exception as e:
            logging.warning(f"Attempt {attempt + 1} failed: {e}")
            if attempt == max_retries - 1:
                logging.error("All retry attempts failed")
                return f"Sorry, I encountered an error: {str(e)}"
            await asyncio.sleep(2 ** attempt)  # Exponential backoff

    return None

# Usage
response = await run_with_retry(weather_agent, "What's the weather in Paris?")
```

## Advanced Features

### 1. Custom Model Configuration

```python
from agents import OpenAIChatCompletionsModel, AsyncOpenAI

# Configure Gemini with custom settings
provider = AsyncOpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_API_KEY"),
    timeout=60.0,
    max_retries=3,
)

model = OpenAIChatCompletionsModel(
    openai_client=provider,
    model="gemini-2.0-flash-lite",  # Experimental model
    temperature=0.7,
    top_p=0.9,
    max_tokens=2048,
    presence_penalty=0.1,
    frequency_penalty=0.1,
)
```

### 2. Tool Result Caching

```python
from functools import lru_cache
from typing import Dict, Any
import hashlib
import json

class CachedTool:
    def __init__(self, ttl_seconds: int = 300):
        self.cache = {}
        self.ttl = ttl_seconds

    def _hash_key(self, args: Dict[str, Any]) -> str:
        """Create hash key from function arguments"""
        key_str = json.dumps(args, sort_keys=True)
        return hashlib.md5(key_str.encode()).hexdigest()

    def is_cached(self, key: str) -> bool:
        """Check if result is cached and not expired"""
        if key not in self.cache:
            return False

        import time
        if time.time() - self.cache[key]["timestamp"] > self.ttl:
            del self.cache[key]
            return False

        return True

    def get_cached(self, key: str) -> Any:
        """Get cached result"""
        return self.cache[key]["data"]

    def set_cache(self, key: str, data: Any):
        """Set cached result"""
        import time
        self.cache[key] = {
            "data": data,
            "timestamp": time.time(),
        }

# Usage with tools
cached_weather = CachedTool(ttl_seconds=600)  # 10 minute cache

@function_tool
def get_weather_cached(location: str) -> str:
    """Get weather with caching"""
    key = cached_weather._hash_key({"location": location})

    if cached_weather.is_cached(key):
        print("Returning cached weather data")
        return cached_weather.get_cached(key)

    # Fetch fresh data
    weather_data = get_weather(location)
    cached_weather.set_cache(key, weather_data)

    return weather_data
```

### 3. Tool Input Validation

```python
from pydantic import BaseModel, Field
from typing import Literal
import re

class WeatherInput(BaseModel):
    location: str = Field(
        min_length=2,
        max_length=100,
        description="City or location name"
    )
    units: Literal["metric", "imperial", "kelvin"] = Field(
        default="metric",
        description="Temperature units"
    )

    def validate_location(cls, v):
        """Validate location format"""
        if not re.match(r'^[a-zA-Z\s,-]+$', v):
            raise ValueError("Location contains invalid characters")
        return v.title()

@function_tool
def get_weather_validated(input_data: WeatherInput) -> str:
    """Get weather with validated input"""
    return get_weather(input_data.location, input_data.units)
```

## Best Practices

### 1. Agent Instructions

- Be specific about the agent's role and capabilities
- Include examples of desired behavior
- Set clear boundaries for what the agent should and shouldn't do
- Include formatting instructions for consistent output

### 2. Tool Design

- Keep tools focused on single responsibilities
- Use clear, descriptive names
- Include comprehensive docstrings
- Validate inputs and handle errors gracefully
- Use appropriate return types

### 3. Session Management

- Store only necessary conversation history
- Implement context windows to manage memory
- Use session IDs for multi-user scenarios
- Clear sensitive data when appropriate

### 4. Error Handling

- Always handle API failures gracefully
- Implement exponential backoff for retries
- Provide helpful error messages to users
- Log errors for debugging

### 5. Performance

**CRITICAL: Model Selection for Chat Applications**
- **Never use slow free-tier models** like `mistralai/devstral-2512:free` for real-time chat
- Use **fast models** optimized for low latency:
  - `google/gemini-2.0-flash-exp:free` (5s response time)
  - `google/gemini-flash-1.5` (3s response time)
  - `openai/gpt-5-nano-2025-08-07` (2s response time)
- Target **< 2 seconds** for first token in streaming responses
- Test response times before deploying to production

**General Performance Tips:**
- Use streaming for long responses
- Cache expensive operations
- Implement rate limiting for API calls
- Consider parallel execution for independent tasks
- Use database connection pooling
- Implement query result caching

## Critical Pitfalls & Solutions (From Real-World Implementation)

### ❌ Pitfall #0: OpenAIModelWithFallback Not Compatible with Agent (CRITICAL - Fixed)

**Problem:**
```python
# WRONG - OpenAIModelWithFallback wrapper doesn't work with Agent class
class OpenAIModelWithFallback:
    def __init__(self, primary_model, fallback_model):
        self._primary = primary_model
        self._fallback = fallback_model

# When used with Agent:
agent = Agent(
    name="assistant",
    model=OpenAIModelWithFallback(primary, fallback),  # ❌ Error!
)
# Error: "Agent model must be a string, Model, or None, got OpenAIModelWithFallback"
```

**Solution: Implement Fallback at API Level (Not Model Wrapper)**
```python
from agents import OpenAIChatCompletionsModel, AsyncOpenAI, Agent, Runner
from app.core.config import settings

# ✅ CORRECT: Direct model selection based on provider
def get_model_by_name(model: str) -> OpenAIChatCompletionsModel:
    """Get model instance based on model name format.

    Models with "/" go to OpenRouter (e.g., "google/gemini-2.0-flash-exp:free")
    Models without "/" go to OpenAI direct (e.g., "gpt-5-nano-2025-08-07")
    """
    uses_openrouter = "/" in model

    if uses_openrouter:
        client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
            max_retries=0,
        )
        return OpenAIChatCompletionsModel(
            openai_client=client,
            model=model,
        )
    else:
        client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            max_retries=0,
        )
        return OpenAIChatCompletionsModel(
            openai_client=client,
            model=model,
        )

# ✅ CORRECT: Implement fallback in API layer, not model layer
async def run_with_fallback(agent: Agent, message: str):
    """Run agent with automatic fallback on 429 rate limit."""
    primary_model = "google/gemini-2.0-flash-exp:free"
    fallback_model = "gpt-5-nano-2025-08-07"

    # Try primary model first
    for attempt, model_name in enumerate([primary_model, fallback_model]):
        try:
            model_instance = get_model_by_name(model_name)
            agent_with_model = Agent(
                name=agent.name,
                instructions=agent.instructions,
                model=model_instance,
                mcp_servers=agent.mcp_servers,
            )
            result = await Runner.run(agent_with_model, message)
            logger.info(f"✅ Success with model: {model_name}")
            return result

        except Exception as e:
            error_str = str(e)
            is_rate_limit = (
                "429" in error_str or
                "rate.limited" in error_str.lower() or
                "RateLimitError" in type(e).__name__
            )

            if is_rate_limit and attempt < 1:
                logger.warning(f"⚠️ Rate limit on {model_name}, trying fallback...")
                continue
            else:
                raise

# Usage in API endpoint (app/chatkit/server.py):
async def respond(thread: ThreadMetadata, new_message: str, context):
    for attempt, model_name in enumerate([primary_model, fallback_model]):
        try:
            async with create_chatbot_agent_context(model=model_name) as agent:
                result = Runner.run_streamed(agent, input_items, context=agent_context)
                async for event in stream_agent_response(agent_context, result):
                    yield event
                break  # Success!
        except Exception as e:
            if is_rate_limit_error(e) and attempt < 1:
                continue  # Retry with fallback
            raise  # Re-raise if not rate limit or no more retries
```

**Key Point:**
- `OpenAIModelWithFallback` wrapper does NOT work with Agent class
- Implement fallback at the API/request level, not as a model wrapper
- Use direct model selection based on model name format
- Retry with different model on 429 errors

---

### ❌ Pitfall #1: Not Using OpenAIChatCompletionsModel Wrapper

**Problem:**
```python
# WRONG - Direct model string without wrapper
agent = Agent(
    name="assistant",
    instructions="You are a helpful assistant",
    model="mistralai/devstral-2512:free",  # ❌ Direct string
)
# Error: "Unknown prefix: mistralai" or similar
```

**Solution:**
```python
from agents import OpenAIChatCompletionsModel, set_default_openai_api
from openai import AsyncOpenAI

# Step 1: Configure API type for non-OpenAI providers
set_default_openai_api("chat_completions")

# Step 2: Create custom OpenAI client
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key,
)

# Step 3: Wrap with OpenAIChatCompletionsModel
model = OpenAIChatCompletionsModel(
    openai_client=client,
    model="mistralai/devstral-2512:free",
)

agent = Agent(
    name="assistant",
    instructions="You are a helpful assistant",
    model=model,  # ✅ Pass wrapped model
)
```

**Key Point:** Always wrap your `AsyncOpenAI` client with `OpenAIChatCompletionsModel` when using non-OpenAI providers (OpenRouter, Gemini, etc.).

---

### ❌ Pitfall #2: Forgetting to Set API Type

**Problem:**
```python
# Default uses Responses API (not supported by OpenRouter)
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key,
)
# Error: 404 Not Found or "method not supported"
```

**Solution:**
```python
from agents import set_default_openai_api

# For OpenRouter, Gemini, and other non-OpenAI providers:
set_default_openai_api("chat_completions")  # ✅ Must call before creating agent
```

---

### ❌ Pitfall #3: Not Disabling Tracing

**Problem:**
```python
# Default tries to connect to OpenAI for tracing
# Error: Authentication error or timeout when not using OpenAI
```

**Solution:**
```python
from agents import set_tracing_disabled

# Disable tracing when not using OpenAI
set_tracing_disabled(True)
```

---

### ❌ Pitfall #4: Wrong Model Type for Embeddings

**Problem:**
```python
# WRONG - Using chat models for embeddings
response = await client.embeddings.create(
    model="mistralai/devstral-2512:free",  # ❌ Chat model
    input=texts,
)
# Error: "Model does not support embeddings"
```

**Solution:**
```python
# Use dedicated embedding models
response = await client.embeddings.create(
    model="openai/text-embedding-3-small",  # ✅ Embedding model
    input=texts,
)
```

**Available Embedding Models via OpenRouter:**
- `openai/text-embedding-3-small` - 1536 dim, $0.02/1M (RECOMMENDED)
- `openai/text-embedding-3-large` - 3072 dim, $0.13/1M
- `openai/text-embedding-ada-002` - 1536 dim, $0.10/1M

**Note:** Free chat models (e.g., `mistralai/devstral-2512:free`) do NOT support embeddings.

---

### ❌ Pitfall #5: Using Slow Free-Tier Models (Performance Killer)

**Problem:**
```python
# WRONG - Using slow free-tier model causes unacceptable latency
model = OpenAIChatCompletionsModel(
    openai_client=client,
    model="mistralai/devstral-2512:free",  # ❌ 29+ seconds response time
)
# User experience suffers: chat responses take 29 seconds
```

**Symptoms:**
- Chat responses taking 20-30+ seconds
- Poor user experience
- Abandoned conversations
- API timeouts

**Solution:**
```python
# RIGHT - Use fast models optimized for low latency
model = OpenAIChatCompletionsModel(
    openai_client=client,
    model="google/gemini-2.0-flash-exp:free",  # ✅ 2-5 seconds response time
)
```

**Performance Comparison (Real-World Testing):**
| Model | Response Time | Improvement |
|-------|--------------|-------------|
| `mistralai/devstral-2512:free` | ~29 seconds | Baseline (slow) |
| `google/gemini-2.0-flash-exp:free` | ~5 seconds | **83% faster** |
| `google/gemini-flash-1.5` | ~3 seconds | **90% faster** |
| `openai/gpt-5-nano-2025-08-07` | ~2 seconds | **93% faster** |

**Recommended Free-Tier Models (in order of preference):**
1. **`google/gemini-2.0-flash-exp:free`** - Best balance of speed and quality
2. **`google/gemini-flash-1.5`** - Fastest option
3. **`openai/gpt-5-nano-2025-08-07`** - Excellent quality, very fast (if available free)

**Key Point:** Always prioritize **speed** for real-time chat applications. The difference between 29 seconds and 5 seconds is the difference between a usable and unusable chatbot.

---

### ❌ Pitfall #6: Passing String to Runner Without Context

**Problem:**
```python
# WRONG - Agent doesn't have conversation context
result = Runner.run_streamed(
    agent,
    "What can you do?",  # ❌ Just current message
)
# Agent responds poorly or not at all
```

**Solution:**
```python
from chatkit.agents import simple_to_agent_input  # If using ChatKit
# OR manually build context

# Load conversation history
items_page = await store.load_thread_items(thread.id, ...)

# Convert to agent input format
input_items = await simple_to_agent_input(items_page.data)

# Pass conversation history
result = Runner.run_streamed(
    agent,
    input_items,  # ✅ Full conversation context
)
```

---

### ❌ Pitfall #7: MCP Server 404 Error (Critical - streamable_http_path Configuration)

**Problem:**
```python
# WRONG - streamable_http_path not set during initialization
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MyApp")  # ❌ Missing critical parameters!
# Later in code...
mcp.settings.streamable_http_path = "/"  # ❌ This is IGNORED!

# When agent tries to connect:
# POST /mcp HTTP/1.1" 404 Not Found
# Error: MCP server not found at endpoint
```

**Root Cause:** `streamable_http_path` and `json_response` MUST be set during `FastMCP()` initialization. Setting them via `mcp.settings` afterwards has no effect.

**Solution:**
```python
# ✅ RIGHT - Set during FastMCP() initialization
from mcp.server.fastmcp import FastMCP

# CRITICAL: streamable_http_path MUST be set during initialization
# json_response=True enables proper JSON-RPC over HTTP
mcp = FastMCP(
    "MyApp",
    streamable_http_path="/",  # Critical: must be constructor parameter
    json_response=True,         # Enable JSON-RPC responses
)

# Then mount in FastAPI
from fastapi import FastAPI
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield

app = FastAPI(lifespan=lifespan)
app.mount("/mcp", mcp.streamable_http_app())  # Returns 200 OK
```

**Reference:** See `.claude/skills/mcp-builder/SKILL.md` for complete MCP server setup.

---

### ❌ Pitfall #8: FastAPI Endpoints Broken After Using Starlette (Critical)

**Problem:**
```python
# WRONG - Using Starlette app breaks FastAPI routers
from starlette.applications import Starlette
from starlette.routing import Mount
from fastapi import APIRouter

# Based on GitHub issue #1367, some guides suggest Starlette
app = Starlette(routes=[
    Mount("/mcp", mcp.streamable_http_app(), name="mcp"),
])

# FastAPI routers stop working!
# Error: AssertionError: fastapi_middleware_astack not found in request scope
# All API endpoints return 500 Internal Server Error
```

**Root Cause:** FastAPI routers require special middleware context that isn't available in a plain Starlette app. The `app.mount()` method in FastAPI is different from Starlette's `Mount`.

**Solution:**
```python
# ✅ RIGHT - Use FastAPI's mount() method
from fastapi import FastAPI
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield

app = FastAPI(lifespan=lifespan)

# FastAPI's mount() handles the middleware context correctly
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")

# Now FastAPI routers work fine
from fastapi import APIRouter
router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "healthy"}

app.include_router(router)  # ✅ Works!
```

**Key Point:** Always use `FastAPI` with `app.mount()`, never `Starlette` with `Mount`.

---

### ❌ Pitfall #9: 307 Temporary Redirect (Not Actually a Problem)

**Symptoms:**
```bash
# Logs show redirect
INFO: 127.0.0.1:50466 - "POST /mcp HTTP/1.1" 307 Temporary Redirect
INFO: 127.0.0.1:50466 - "POST /mcp/ HTTP/1.1" 200 OK
```

**Question:** "Is this a problem? Why do we need the redirect?"

**Answer:** This is **normal FastAPI behavior**, not a problem!

**Explanation:**
- FastAPI redirects `/mcp` (without trailing slash) to `/mcp/` (with trailing slash)
- This is path normalization - FastAPI's standard behavior
- The redirect is instant and harmless
- The MCP SDK expects requests at `/mcp/` (with trailing slash)

**Solution:** No fix needed. If you want to avoid the redirect log entry, configure your MCP client to use `/mcp/` directly:
```python
# Instead of this (causes 307 redirect):
mcp_server_url = "http://127.0.0.1:8000/mcp"

# Use this (no redirect):
mcp_server_url = "http://127.0.0.1:8000/mcp/"
```

**Note:** This is purely cosmetic - the redirect doesn't affect functionality.

---

### ❌ Pitfall #10: Incorrectly Awaiting Runner.run_streamed() (CRITICAL - Common Mistake)

**Problem:**
```python
# WRONG - Runner.run_streamed() is SYNCHRONOUS, do NOT await!
async def stream_response(agent: Agent, message: str):
    result = await Runner.run_streamed(agent, message)  # ❌ WRONG!
    async for event in result.stream_events():
        yield event
```

**Correct Pattern:**
```python
# ✅ RIGHT - Runner.run_streamed() is synchronous, stream_events() is async
async def stream_response(agent: Agent, message: str):
    # Step 1: Call run_streamed() SYNCHRONOUSLY (no await)
    result = Runner.run_streamed(agent, message)

    # Step 2: Iterate over stream_events() ASYNCHRONOUSLY
    async for event in result.stream_events():
        if event.type == "run_item_stream_event" and event.item.type == "message_output_item":
            message_text = ItemHelpers.text_message_output(event.item)
            print(message_text)
```

**Key Point:**
- `Runner.run_streamed()` is SYNCHRONOUS - returns `RunResultStreaming` immediately
- `result.stream_events()` is ASYNC GENERATOR - must use `async for` to iterate
- Do NOT await `Runner.run_streamed()`

**Reference:** See `OPENAI_AGENTS_STREAMING_FIX.md` for complete streaming implementation guide.

---

### ❌ Pitfall #11: ChatKit AssistantMessageItem Missing Required Fields (CRITICAL)

**Problem:**
```python
# WRONG - Missing thread_id and created_at
assistant_item = AssistantMessageItem(
    id=unique_message_id,
    content=[AssistantMessageContent(type="output_text", text=message_text)],
)
# ValidationError: Field required - thread_id, created_at
```

**Solution:**
```python
from datetime import datetime, timezone

# ✅ RIGHT - Include all required fields
assistant_item = AssistantMessageItem(
    id=unique_message_id,
    thread_id=thread.id,  # REQUIRED - thread metadata
    created_at=datetime.now(timezone.utc),  # REQUIRED - timestamp
    content=[AssistantMessageContent(type="output_text", text=message_text)],
)
```

**Key Point:** `AssistantMessageItem` requires 4 fields:
- `id` - unique message identifier
- `thread_id` - thread metadata (from ThreadMetadata object)
- `created_at` - timestamp (use UTC timezone for consistency)
- `content` - list of AssistantMessageContent objects with `type="output_text"`

**Reference:** ChatKit Python SDK documentation - AssistantMessageItem schema.

---

### ❌ Pitfall #12: MCP Server URL in HuggingFace Spaces Production

**Problem:**
```python
# WRONG - Hardcoded port 8000 doesn't work in HuggingFace Spaces
mcp_server_url = "http://127.0.0.1:8000/mcp"  # ❌ Port 8000 doesn't exist in HF Spaces
```

**Solution:**
```python
import os

# ✅ RIGHT - Detect environment and use correct port
is_production = os.getenv("SPACE_ID") is not None or os.getenv("HUGGINGFACE_SPACE_ID") is not None

if is_production:
    # In HuggingFace Spaces, backend runs on port 7860 (or PORT env var)
    port = os.getenv("PORT", "7860")
    mcp_server_url = f"http://localhost:{port}/mcp"
else:
    mcp_server_url = "http://127.0.0.1:8000/mcp"  # Local development
```

**Key Point:**
- HuggingFace Spaces runs your app on port 7860 (not 8000)
- Use `PORT` environment variable to detect the actual port
- Both backend and MCP server are on the SAME port in production

**Environment Variables in HuggingFace Spaces:**
- `SPACE_ID` - Set when running in HuggingFace Spaces
- `PORT` - The port your app should listen on (default: 7860)
- `HUGGINGFACE_SPACE_ID` - Alternative to SPACE_ID

---

## Quick Setup Pattern (Correct)

Here's the complete correct pattern for using OpenRouter with OpenAI Agents SDK:

```python
from agents import (
    Agent,
    Runner,
    OpenAIChatCompletionsModel,
    set_default_openai_api,
    set_tracing_disabled,
)
from openai import AsyncOpenAI

# Step 1: Disable tracing (not using OpenAI)
set_tracing_disabled(True)

# Step 2: Set API type for OpenRouter compatibility
set_default_openai_api("chat_completions")

# Step 3: Create custom OpenAI client
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key,
)

# Step 4: Wrap with OpenAIChatCompletionsModel
# IMPORTANT: Use fast models for real-time chat (avoid mistralai/devstral-2512:free - 29s response time)
# RECOMMENDED: google/gemini-2.0-flash-exp:free (5s response time)
model = OpenAIChatCompletionsModel(
    openai_client=client,
    model="google/gemini-2.0-flash-exp:free",
)

# Step 5: Create agent
agent = Agent(
    name="assistant",
    instructions="You are a helpful assistant.",
    model=model,
)

# Step 6: Run agent
result = await Runner.run(agent, "Hello!")
print(result.final_output)
```

---

## MCP Server Integration (Production-Ready Pattern)

### Overview

Integrate MCP (Model Context Protocol) servers with OpenAI Agents SDK using `MCPServerStreamableHttp`. This enables your agents to use external tools exposed via MCP protocol.

### Critical: Context Manager Pattern for MCP Lifecycle

**❌ WRONG: Creating agent without proper MCP cleanup**
```python
# MCP connection never cleaned up - resource leak!
agent = Agent(
    name="assistant",
    instructions="You are helpful",
    mcp_servers=[mcp_server],
)
result = await Runner.run(agent, "Hello")  # Works but leaks resources
```

**✅ RIGHT: Using async context manager**
```python
from agents import Agent, Runner, MCPServerStreamableHttp, OpenAIChatCompletionsModel
from agents import set_default_openai_api, set_tracing_disabled
from contextlib import asynccontextmanager

set_tracing_disabled(True)
set_default_openai_api("chat_completions")

@asynccontextmanager
async def create_agent_with_mcp(
    model: str = "google/gemini-2.0-flash-exp:free",
    mcp_server_url: str = "http://127.0.0.1:8000/mcp",
):
    """Create agent with proper MCP server lifecycle management.

    Note: Fallback for rate limits should be implemented at the API/request level,
    not as a model wrapper. See run_with_fallback() example in this skill.
    """
    from openai import AsyncOpenAI
    from app.core.config import settings

    # Detect model provider by model name format
    uses_openrouter = "/" in model

    if uses_openrouter:
        client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
            max_retries=0,
        )
    else:
        client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            max_retries=0,
        )

    model_instance = OpenAIChatCompletionsModel(
        openai_client=client,
        model=model,
    )

    # Connect MCP server with proper lifecycle
    async with MCPServerStreamableHttp(
        name="TeamFlow MCP Server",
        params={"url": mcp_server_url},
        cache_tools_list=True,
    ) as mcp_server:
        agent = Agent(
            name="teamflow-ai",
            instructions=TEAMFLOW_AGENT_INSTRUCTIONS,
            model=model_instance,
            mcp_servers=[mcp_server],
        )
        yield agent

# Usage:
async with create_agent_with_mcp() as agent:
    result = await Runner.run(agent, "List all high priority tasks")
    print(result.final_output)
# MCP connection automatically cleaned up
```

### Production-Ready: Single-Server Architecture

**Mount MCP server in FastAPI** instead of running separate process:

```python
# app/main.py - Single FastAPI application
from fastapi import FastAPI
from app.mcp.server import mcp

app = FastAPI()

# Mount MCP server at /mcp endpoint
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")

# Main API endpoints
@app.get("/health")
async def health():
    return {"status": "healthy"}

# Configuration
# MCP_SERVER_URL=http://127.0.0.1:8000/mcp (default)
# MCP_SERVER_URL=https://api.teamflow.com/mcp (production)
```

**Benefits:**
- Single process deployment
- Single port exposure
- Shared lifecycle management
- Simplified monitoring

### MCP Tools Discovery and Usage

```python
async def test_mcp_tools():
    """Test that MCP tools are discoverable and usable."""
    async with create_agent_with_mcp() as agent:
        # Get MCP server
        mcp_server = agent.mcp_servers[0]

        # List all available tools
        tools = await mcp_server.list_tools()
        print(f"Discovered {len(tools)} tools:")
        for tool in tools:
            print(f"  - {tool.name}: {tool.description[:50]}...")

        # Test tool usage
        result = await Runner.run(
            agent,
            "Please list all projects in the system. Use the list_projects tool."
        )
        print(result.final_output)
```

### Complete MCP Integration Example

See `examples/mcp_integration_example.py` for a complete working example of:
- Creating MCP server with FastMCP
- Mounting in FastAPI
- Connecting via MCPServerStreamableHttp
- Using tools from agent
- Proper lifecycle management

---

## Troubleshooting

### Common Issues

1. **API Key Errors**

   ```python
   # Verify your API key is set correctly
   import os
   api_key = os.getenv("OPENROUTER_API_KEY")
   if not api_key:
       raise ValueError("OPENROUTER_API_KEY not found in environment")
   ```

2. **Rate Limiting**

   ```python
   # Implement rate limiting
   import time
   from typing import Dict

   class RateLimiter:
       def __init__(self, calls_per_minute: int = 60):
           self.calls_per_minute = calls_per_minute
           self.calls = []

       def wait_if_needed(self):
           now = time.time()
           # Remove calls older than 1 minute
           self.calls = [c for c in self.calls if now - c < 60]

           if len(self.calls) >= self.calls_per_minute:
               sleep_time = 60 - (now - self.calls[0])
               time.sleep(sleep_time)

           self.calls.append(now)
   ```

3. **Model Not Available**
   ```python
   # Check model availability
   async def check_model_availability(model_name: str):
       try:
           response = await provider.models.retrieve(model_name)
           return True
       except:
           return False
   ```

4. **Agent Can't Use Tools Due to Poor UX Design**

   **Problem:** Tools that require technical IDs instead of user-friendly identifiers.

   ```python
   # ❌ WRONG - Tool requires UUID that users don't have
   @mcp.tool()
   async def complete_task(task_id: str) -> str:
       """Mark a task as complete.

       Args:
           task_id: UUID of the task (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
       """
       # ...

   # User says: "Complete the landing page redesign task"
   # Agent doesn't have the UUID and fails!
   ```

   **Solution:** Provide user-friendly alternatives with partial matching.

   ```python
   # ✅ RIGHT - Provide both ID-based and name-based tools
   @mcp.tool()
   async def complete_task(task_id: str) -> str:
       """Complete a task by its exact ID."""
       # For programmatic access

   @mcp.tool()
   async def complete_task_by_title(task_title: str) -> str:
       """Find a task by title and mark it as complete.

       This tool searches for a task by its title (partial matching supported)
       and marks it as complete. Use this when the user provides a task title
       instead of a task ID.

       Args:
           task_title: Title of the task to complete (partial matching supported)

       Returns:
           Confirmation message with task details
       """
       # Search with partial matching (case-insensitive)
       statement = select(Task).where(
           Task.title.ilike(f"%{task_title}%")
       ).order_by(Task.created_at.desc())

       results = session.exec(statement).all()

       if not results:
           return f"No task found matching: '{task_title}'"

       # Use first (most recent) match
       task = results[0]
       task.status = TaskStatus.DONE

       return f"Task completed: {task.title}"
   ```

   **Agent Instructions Update:**
   ```python
   # Tell the agent to use the user-friendly tools
   AGENT_INSTRUCTIONS = """
   **IMPORTANT: Use the dedicated "by title" tools when user provides task names:**
   - `complete_task_by_title(task_title)` - Complete by title (partial matching)
   - `delete_task_by_title(task_title)` - Delete by title (partial matching)
   - `archive_task_by_title(task_title)` - Archive by title (partial matching)

   These tools are more user-friendly than requiring task IDs. Use them when
   the user refers to a task by name.

   Example:
   - User: "Complete the landing page redesign task"
   - Agent calls: `complete_task_by_title("landing page redesign")`
   """
   ```

## Complete Example

Here's a complete weather assistant implementation using all the features:

```python
import asyncio
import os
from datetime import datetime
from typing import Optional, List, Dict, Any
from agents import (
    Agent, Runner, function_tool, handoff,
    AsyncOpenAI, OpenAIChatCompletionsModel, set_tracing_disabled
)
from pydantic import BaseModel
import requests
import json
import logging

# Configuration
set_tracing_disabled(True)
logging.basicConfig(level=logging.INFO)

# Initialize Gemini provider
provider = AsyncOpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_API_KEY"),
)

model = OpenAIChatCompletionsModel(
    openai_client=provider,
    model="gemini-2.0-flash-lite",
    temperature=0.7,
)

# Tool schemas
class WeatherInput(BaseModel):
    location: str = Field(min_length=2, max_length=100)
    units: str = Field(default="metric", regex="^(metric|imperial|kelvin)$")

# Tools
@function_tool
async def get_weather(location: str, units: str = "metric") -> str:
    """Fetch current weather for a location"""
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
    """Get weather forecast for upcoming days"""
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

# CORRECT: Using built-in session management
async def main():
    # Create a session for conversation history
    session = SQLiteSession("weather_chat_123")

    print("Weather Assistant Chat (type 'quit' to exit)")
    print("=" * 50)

    while True:
        user_input = input("\nYou: ").strip()

        if user_input.lower() in ['quit', 'exit', 'bye']:
            print("Goodbye! 👋")
            break

        print("\nAssistant: ", end="", flush=True)

        # CORRECT: Direct Runner.run with session
        result = await Runner.run(
            weather_agent,
            user_input,
            session=session
        )
        print(result.final_output)

if __name__ == "__main__":
    asyncio.run(main())
```

## Contributing

This skill is open for contributions. Please feel free to:

- Report bugs and issues
- Suggest new features
- Submit pull requests
- Improve documentation

## Migration Guide

### From Old (Incorrect) API to New (Correct) API

| OLD (Incorrect)                | NEW (Correct)                         |
| ------------------------------ | ------------------------------------- |
| `runner = Runner(agent=agent)` | Use `Runner.run()` directly           |
| `await runner.run(message)`    | `await Runner.run(agent, message)`    |
| `Runner.run(agent, input)`     | `await Runner.run(agent, message)`    |
| `runner.run_stream()`          | `Runner.run_streamed(agent, message)` |

### Quick Migration

```python
# OLD CODE - DON'T USE
runner = Runner(agent=agent)
result = await runner.run("Hello")

# NEW CODE - USE THIS
result = await Runner.run(agent, "Hello")
```

## Quick Reference Card

```python
# Basic Usage
result = await Runner.run(agent, "message")
result = Runner.run_sync(agent, "message")

# With Options
result = await Runner.run(agent, "message", max_turns=5, session=session)

# Streaming
async for event in Runner.run_streamed(agent, "message"):
    # Handle events

# Sessions
session = SQLiteSession("session_id")
result = await Runner.run(agent, "message", session=session)
```

## License

MIT License - feel free to use this skill in your projects!

## Support

For issues or questions:

1. Check this documentation
2. Review the OpenAI Agents SDK documentation: https://openai.github.io/openai-agents-python/
3. Check Gemini API documentation: https://ai.google.dev/gemini-api/docs
4. Create an issue in the repository
