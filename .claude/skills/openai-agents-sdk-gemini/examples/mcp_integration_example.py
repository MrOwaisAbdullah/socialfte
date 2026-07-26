#!/usr/bin/env python
"""
Production-Ready MCP Integration Example for OpenAI Agents SDK

This example demonstrates:
1. Creating MCP server with FastMCP (Python)
2. Mounting MCP server in FastAPI (single-server architecture)
3. Connecting agent via MCPServerStreamableHttp
4. Implementing automatic fallback for rate limits at API level
5. Proper context manager pattern for lifecycle

IMPORTANT: Fallback is implemented at the API/request level, NOT as a model wrapper.
The OpenAIModelWithFallback wrapper class is NOT compatible with the Agent class.

Usage:
    # Terminal 1: Start the FastAPI server (includes MCP at /mcp)
    python mcp_integration_example.py

    # Terminal 2: Test the integration
    python test_mcp_integration.py
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from openai import AsyncOpenAI, APIError, APIStatusError
from pydantic import BaseModel

# MCP imports
from mcp.server.fastmcp import FastMCP

# OpenAI Agents SDK imports
from agents import (
    Agent,
    Runner,
    OpenAIChatCompletionsModel,
    set_default_openai_api,
    set_tracing_disabled,
    MCPServerStreamableHttp,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# PART 1: MCP Server Implementation (FastMCP)
# =============================================================================

# Create MCP server instance
mcp = FastMCP("Example Tools Server")


class TaskInput(BaseModel):
    """Input for creating a task."""
    title: str
    description: Optional[str] = None
    priority: str = "MEDIUM"


class TaskUpdateInput(BaseModel):
    """Input for updating a task."""
    task_id: str
    title: Optional[str] = None
    priority: Optional[str] = None


# In-memory storage (replace with actual database in production)
tasks_db = {}


@mcp.tool()
async def create_task(input: TaskInput) -> str:
    """
    Create a new task in the system.

    Args:
        input: Task details including title, description, and priority

    Returns:
        Confirmation message with task ID
    """
    import uuid
    task_id = str(uuid.uuid4())

    tasks_db[task_id] = {
        "id": task_id,
        "title": input.title,
        "description": input.description,
        "priority": input.priority,
        "status": "TODO",
    }

    return f"Task '{input.title}' created with ID: {task_id}"


@mcp.tool()
async def list_tasks(status: Optional[str] = None) -> str:
    """
    List all tasks in the system, optionally filtered by status.

    Args:
        status: Optional status filter (TODO, IN_PROGRESS, DONE)

    Returns:
        Formatted list of tasks
    """
    if not tasks_db:
        return "No tasks found in the system."

    filtered_tasks = tasks_db.values()
    if status:
        filtered_tasks = [t for t in filtered_tasks if t["status"] == status]

    result = []
    for task in filtered_tasks:
        result.append(
            f"- [{task['id']}] {task['title']} "
            f"(Priority: {task['priority']}, Status: {task['status']})"
        )

    return "\n".join(result) if result else "No tasks found matching criteria."


@mcp.tool()
async def update_task(input: TaskUpdateInput) -> str:
    """
    Update an existing task.

    Args:
        input: Task update including task_id and fields to update

    Returns:
        Confirmation message
    """
    task_id = input.task_id

    if task_id not in tasks_db:
        return f"Task with ID {task_id} not found."

    if input.title:
        tasks_db[task_id]["title"] = input.title
    if input.priority:
        tasks_db[task_id]["priority"] = input.priority

    return f"Task {task_id} updated successfully."


@mcp.tool()
async def complete_task(task_id: str) -> str:
    """
    Mark a task as complete.

    Args:
        task_id: ID of the task to complete

    Returns:
        Confirmation message
    """
    if task_id not in tasks_db:
        return f"Task with ID {task_id} not found."

    tasks_db[task_id]["status"] = "DONE"
    return f"Task '{tasks_db[task_id]['title']}' marked as complete!"


# =============================================================================
# PART 2: Agent Creation with Context Manager Pattern
# =============================================================================

TEAMFLOW_AGENT_INSTRUCTIONS = """
You are TeamFlow AI, an intelligent assistant for agency project management.

You have access to the following tools:
- create_task: Create new tasks with title, description, and priority
- list_tasks: List all tasks, optionally filtered by status
- update_task: Update existing task details
- complete_task: Mark a task as complete

Guidelines:
- Be proactive in suggesting task priorities
- Ask clarifying questions when task details are incomplete
- Provide clear confirmation after each action
- Use emojis to make responses engaging ✨
"""


# Environment variables (replace with actual config in production)
OPENROUTER_API_KEY = "your-openrouter-api-key"
OPENAI_API_KEY = "your-openai-api-key"


def get_model_by_name(model: str, openrouter_api_key: str, openai_api_key: str) -> OpenAIChatCompletionsModel:
    """
    Get model instance based on model name format.

    Models with "/" go to OpenRouter (e.g., "google/gemini-2.0-flash-exp:free")
    Models without "/" go to OpenAI direct (e.g., "gpt-5-nano-2025-08-07")

    Args:
        model: Model identifier string
        openrouter_api_key: OpenRouter API key
        openai_api_key: OpenAI API key

    Returns:
        Configured OpenAIChatCompletionsModel instance
    """
    # Detect model provider based on model name format
    uses_openrouter = "/" in model

    if uses_openrouter:
        # Use OpenRouter
        client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=openrouter_api_key,
            max_retries=0,
        )
        logger.info(f"Using OpenRouter for model: {model}")
    else:
        # Use direct OpenAI API
        client = AsyncOpenAI(
            api_key=openai_api_key,
            max_retries=0,
        )
        logger.info(f"Using OpenAI direct API for model: {model}")

    return OpenAIChatCompletionsModel(
        openai_client=client,
        model=model,
    )


@asynccontextmanager
async def create_chatbot_agent_context(
    instructions: str | None = TEAMFLOW_AGENT_INSTRUCTIONS,
    model: str = "google/gemini-2.0-flash-exp:free",
    mcp_server_url: str = "http://127.0.0.1:8000/mcp",
):
    """
    Create a TeamFlow chatbot agent with MCP tools using MCPServerStreamableHttp.

    This async context manager ensures proper MCP server lifecycle management.

    NOTE: Fallback should be implemented at the API/request level (see run_with_fallback),
    not as a model wrapper. The OpenAIModelWithFallback wrapper class is NOT compatible
    with the Agent class.

    Args:
        instructions: Custom agent instructions
        model: Model identifier (with "/" = OpenRouter, without "/" = OpenAI direct)
        mcp_server_url: URL of the MCP server

    Yields:
        Configured Agent instance with connected MCP server
    """
    # Configure OpenAI Agents SDK for non-OpenAI providers
    set_tracing_disabled(True)
    set_default_openai_api("chat_completions")

    # Get model instance based on model name format
    model_instance = get_model_by_name(model, OPENROUTER_API_KEY, OPENAI_API_KEY)

    # Connect MCP server with proper lifecycle
    logger.info(f"Connecting to MCP server at: {mcp_server_url}")

    async with MCPServerStreamableHttp(
        name="Example MCP Server",
        params={"url": mcp_server_url},
        cache_tools_list=True,
    ) as mcp_server:
        agent = Agent(
            name="teamflow-ai",
            instructions=instructions,
            model=model_instance,
            mcp_servers=[mcp_server],
        )
        yield agent

    logger.info("MCP server connection closed")


async def run_with_fallback(
    message: str,
    instructions: str | None = TEAMFLOW_AGENT_INSTRUCTIONS,
    mcp_server_url: str = "http://127.0.0.1:8000/mcp",
    primary_model: str = "google/gemini-2.0-flash-exp:free",
    fallback_model: str = "gpt-5-nano-2025-08-07",
) -> str:
    """
    Run agent with automatic fallback on 429 rate limit errors.

    This is the CORRECT way to implement fallback - at the API/request level,
    NOT as a model wrapper (OpenAIModelWithFallback is NOT compatible with Agent).

    Args:
        message: User message to process
        instructions: Custom agent instructions
        mcp_server_url: URL of the MCP server
        primary_model: Primary model to try first (with "/" = OpenRouter)
        fallback_model: Fallback model on 429 error (without "/" = OpenAI direct)

    Returns:
        Agent's final response

    Example:
        result = await run_with_fallback(
            message="Create a task called 'Fix bug'",
            primary_model="google/gemini-2.0-flash-exp:free",  # OpenRouter
            fallback_model="gpt-5-nano-2025-08-07"  # OpenAI direct
        )
    """
    last_error = None

    # Try primary model first, fall back to OpenAI on 429 rate limit
    for attempt, model_to_use in enumerate([primary_model, fallback_model]):
        try:
            logger.info(f"[Fallback] Attempt {attempt + 1} using model: {model_to_use}")

            # Create agent context for this model
            async with create_chatbot_agent_context(
                instructions=instructions,
                model=model_to_use,
                mcp_server_url=mcp_server_url,
            ) as agent:
                result = await Runner.run(agent, input=message)

                # Success! Return the result
                logger.info(f"[Fallback] ✓ Successfully completed with model: {model_to_use}")
                return result.final_output

        except Exception as e:
            last_error = e
            error_str = str(e)

            # Check if this is a rate limit error (429)
            is_rate_limit = (
                "429" in error_str or
                "rate.limited" in error_str.lower() or
                "RateLimitError" in type(e).__name__ or
                "too many requests" in error_str.lower()
            )

            if is_rate_limit and attempt < 1:  # Only retry if we have fallback attempts left
                logger.warning(f"[Fallback] ⚠️ Rate limit detected with {model_to_use}, retrying with fallback: {fallback_model}")
                continue
            else:
                # Not a rate limit error, or no more retries - raise
                logger.error(f"[Fallback] ✗ Error with {model_to_use}: {error_str}")
                raise

    # Should never reach here, but handle it
    if last_error:
        raise last_error


# =============================================================================
# PART 3: FastAPI Application with Mounted MCP Server
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting application...")
    logger.info("MCP server available at /mcp endpoint")

    yield

    logger.info("Shutting down application...")


# Create FastAPI application
app = FastAPI(
    title="TeamFlow AI Chatbot",
    description="Production-ready MCP integration example",
    lifespan=lifespan,
)

# Mount MCP server at /mcp endpoint (single-server architecture)
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "mcp_endpoint": "/mcp",
        "agent_context_manager": "create_chatbot_agent_context"
    }


@app.get("/")
async def root():
    """Root endpoint with usage information."""
    return {
        "message": "TeamFlow AI Chatbot with MCP Integration",
        "mcp_tools": len(mcp._tool_manager._tools),
        "endpoints": {
            "health": "/health",
            "mcp": "/mcp",
            "chat": "/chat (example - add implementation)"
        }
    }


# =============================================================================
# PART 4: Interactive Chat Loop (for testing)
# =============================================================================

async def interactive_chat():
    """
    Interactive chat loop for testing the agent with MCP tools.

    This demonstrates the complete flow:
    1. Create agent with MCP connection
    2. Process user messages
    3. Execute tools as needed
    4. Clean up MCP connection
    """
    print("\n" + "=" * 60)
    print("TeamFlow AI Chatbot - Interactive Mode")
    print("=" * 60)
    print("\nAvailable commands:")
    print("  'quit' - Exit the chat")
    print("  'tasks' - List all tasks")
    print("  'create <title>' - Create a new task")
    print("  Or just ask questions naturally!")
    print()

    while True:
        try:
            user_input = input("You: ").strip()

            if not user_input:
                continue

            if user_input.lower() in ['quit', 'exit', 'bye']:
                print("Goodbye! 👋")
                break

            # Process with agent
            async with create_chatbot_agent_context() as agent:
                result = await Runner.run(agent, user_input)

            print(f"\nAgent: {result.final_output}\n")

        except KeyboardInterrupt:
            print("\nGoodbye! 👋")
            break
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            print(f"\nSorry, I encountered an error: {str(e)}\n")


# =============================================================================
# PART 5: Test Functions
# =============================================================================

async def test_tool_discovery():
    """Test that MCP tools are discoverable by the agent."""
    print("\n" + "=" * 60)
    print("Test: Tool Discovery")
    print("=" * 60)

    async with create_chatbot_agent_context() as agent:
        mcp_server = agent.mcp_servers[0]

        # List tools from MCP server
        tools = await mcp_server.list_tools()

        print(f"\n✅ Discovered {len(tools)} tools:")
        for i, tool in enumerate(tools, 1):
            print(f"   {i}. {tool.name}: {tool.description[:60]}...")

    return len(tools) > 0


async def test_tool_usage():
    """Test that the agent can actually use an MCP tool."""
    print("\n" + "=" * 60)
    print("Test: Tool Usage")
    print("=" * 60)

    async with create_chatbot_agent_context() as agent:
        print("\n⏳ Asking agent to create a task...")
        result = await Runner.run(
            agent,
            "Create a high priority task called 'Fix the navbar bug' with description 'The navbar is not responsive on mobile devices'"
        )

        print(f"\n✅ Agent responded:")
        print(f"   {result.final_output[:200]}...")

    return True


async def test_multi_turn_conversation():
    """Test multi-turn conversation with context."""
    print("\n" + "=" * 60)
    print("Test: Multi-Turn Conversation")
    print("=" * 60)

    async with create_chatbot_agent_context() as agent:
        # Turn 1: Create task
        print("\n⏳ Turn 1: Creating task...")
        result1 = await Runner.run(agent, "Create a task to review the PR")
        print(f"✅ {result1.final_output[:100]}...")

        # Turn 2: Follow-up (agent should remember context)
        print("\n⏳ Turn 2: Asking about tasks...")
        result2 = await Runner.run(agent, "What tasks do we have?")
        print(f"✅ {result2.final_output[:100]}...")

    return True


async def run_all_tests():
    """Run all integration tests."""
    print("\n" + "=" * 60)
    print("MCP Integration Test Suite")
    print("=" * 60)

    results = []

    # Test 1: Tool discovery
    results.append(await test_tool_discovery())

    # Test 2: Tool usage
    results.append(await test_tool_usage())

    # Test 3: Multi-turn conversation
    results.append(await test_multi_turn_conversation())

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    total = len(results)
    passed = sum(results)
    failed = total - passed

    print(f"Total tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")

    if all(results):
        print("\n🎉 All tests passed!")
        return 0
    else:
        print("\n⚠️  Some tests failed")
        return 1


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    import sys

    # Check command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()

        if command == "test":
            # Run automated tests
            exit_code = asyncio.run(run_all_tests())
            sys.exit(exit_code)

        elif command == "chat":
            # Run interactive chat
            asyncio.run(interactive_chat())

        else:
            print(f"Unknown command: {command}")
            print("Usage:")
            print("  python mcp_integration_example.py test  - Run automated tests")
            print("  python mcp_integration_example.py chat  - Run interactive chat")
            print("  python mcp_integration_example.py       - Start FastAPI server")
            sys.exit(1)

    else:
        # Start FastAPI server (default)
        import uvicorn

        print("\n" + "=" * 60)
        print("Starting FastAPI Server with MCP Integration")
        print("=" * 60)
        print("\nServer Configuration:")
        print("  - Main API: http://127.0.0.1:8000")
        print("  - MCP Endpoint: http://127.0.0.1:8000/mcp")
        print("  - Health Check: http://127.0.0.1:8000/health")
        print("\nPress Ctrl+C to stop the server")
        print("=" * 60 + "\n")

        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="info"
        )
