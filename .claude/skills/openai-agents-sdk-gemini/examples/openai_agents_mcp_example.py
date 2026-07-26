"""
Example of using OpenAI Agents SDK with Model Context Protocol (MCP)
Requires: pip install openai-agents-mcp

This example demonstrates how to give your agents access to MCP servers,
allowing them to interact with external systems like filesystems, databases,
or API services like Fetch.
"""

import asyncio
import os
from dotenv import load_dotenv

# Standard agents imports
from agents import Runner, function_tool, OpenAIChatCompletionsModel, AsyncOpenAI

# MCP integration imports
try:
    from agents_mcp import Agent, RunnerContext
    from mcp_agent.config import MCPSettings, MCPServerSettings
except ImportError:
    print("Error: 'openai-agents-mcp' not installed.")
    print("Please install it with: pip install openai-agents-mcp")
    exit(1)

# Load environment
load_dotenv()

# Initialize basic provider (same as standard example)
provider = AsyncOpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_API_KEY"),
)

model = OpenAIChatCompletionsModel(
    openai_client=provider,
    model="gemini-2.0-flash-lite",
)

@function_tool
def get_user_name() -> str:
    """Get the current user's name (Local tool example)"""
    return "Alice"

async def main():
    print("=== OpenAI Agents + MCP Integration Example ===\n")

    # 1. Define MCP Configuration Programmatically
    # In a real app, you might use 'mcp_agent.config.yaml'
    # Here we define a 'fetch' server using 'uvx' (requires uv installed)
    # and a 'filesystem' server (requires npx installed)
    
    # Note: These commands require the respective tools (uv, npx) to be available
    # in your system PATH.
    mcp_config = MCPSettings(
        servers={
            "fetch": MCPServerSettings(
                command="uvx",
                args=["mcp-server-fetch"]
            ),
            # Uncomment to use filesystem (CAREFUL: gives agent file access)
            # "filesystem": MCPServerSettings(
            #     command="npx",
            #     args=["-y", "@modelcontextprotocol/server-filesystem", "."]
            # )
        }
    )

    # 2. Create the Context with our config
    context = RunnerContext(mcp_config=mcp_config)

    # 3. Create the Agent with MCP capabilities
    # We use the Agent class from agents_mcp, not the standard agents.Agent
    agent = Agent(
        name="MCP Assistant",
        instructions="""
        You are a helpful assistant with access to:
        1. A local tool 'get_user_name'
        2. An MCP server 'fetch' to browse the web
        
        Use the fetch tool to get content from URLs when asked.
        """,
        model=model,
        # Standard local tools
        tools=[get_user_name], 
        # MCP servers to enable for this agent
        mcp_servers=["fetch"], 
    )

    print(f"Agent '{agent.name}' initialized with MCP support.")
    print("Note: This example attempts to use 'uvx' to run the fetch server.")
    print("If 'uvx' is not installed, the tool call will fail.\n")

    user_query = "Who is the user, and can you fetch the title of https://example.com?"
    print(f"Query: {user_query}\n")

    try:
        # 4. Run the agent with the MCP context
        result = await Runner.run(
            agent,
            user_query,
            context=context
        )
        
        print("Response:")
        print(result.final_output)

    except Exception as e:
        print(f"\nExecution failed: {e}")
        print("Tip: Ensure you have 'uv' installed for 'uvx' command.")

if __name__ == "__main__":
    asyncio.run(main())
