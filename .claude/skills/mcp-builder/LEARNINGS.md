# MCP Builder - Production Lessons Learned

This document captures critical lessons learned from implementing production MCP (Model Context Protocol) servers with OpenAI Agents SDK integration, covering real-world issues encountered and their solutions.

## Critical Issues Encountered

### 1. MCP Tool Calling with MCPServerStreamableHttp (CRITICAL)

**Issue:** When using `MCPServerStreamableHttp` with the ChatCompletions API, the OpenAI Agents SDK cannot directly handle MCP `Tool` objects passed explicitly via the `tools` parameter.

**Error:**
```
agents.exceptions.UserError: Hosted tools are not supported with the ChatCompletions API.
Got tool type: <class 'mcp.types.Tool'>, tool: name='search_documents' ...
```

**Root Cause:**
When using `MCPServerStreamableHttp` with the ChatCompletions API:
1. The OpenAI Agents SDK does **NOT** automatically extract tools from `mcp_servers` parameter when you explicitly pass `tools=[]`
2. Passing MCP `Tool` objects directly via the `tools` parameter causes conversion errors
3. The SDK expects tools to be auto-extracted from `mcp_servers`, not manually passed

**Solution:**
```python
from agents.mcp import MCPServerStreamableHttp
from agents import Agent, ModelSettings

# CORRECT - Let SDK auto-extract tools from mcp_servers
async with MCPServerStreamableHttp(
    name="OwFlex RAG Server",
    params={"url": settings.mcp_server_url},
    cache_tools_list=True,
    max_retry_attempts=3,
    client_session_timeout_seconds=15,  # Increase for slower tools (RAG: 10-15s)
) as mcp_server:
    # Create agent WITHOUT passing tools explicitly
    agent = Agent(
        name="owflex-assistant",
        instructions=instructions,
        model=model,
        mcp_servers=[mcp_server],  # ✅ SDK auto-extracts tools from this
        # DON'T pass tools=[] or tools=mcp_tools
        model_settings=ModelSettings(tool_choice="required"),  # Force tool usage
    )
    yield agent
```

**Key Points:**
1. **NEVER pass MCP Tool objects** to Agent's `tools` parameter when using ChatCompletions API
2. **Only pass `mcp_servers`** - the SDK auto-extracts tools internally
3. **Use `client_session_timeout_seconds`** to increase timeout for slower tools (default: 5s)
4. **Use `ModelSettings(tool_choice="required")`** to force the model to use tools

**Factory Function Pattern:**
```python
def create_openai_agent(
    instructions: str | None = None,
    mcp_servers: Optional[list] = None,
    force_tool_usage: bool = False
) -> Agent:
    """Create agent with MCP tool support."""
    model = get_openai_model()
    model_settings = ModelSettings(tool_choice="required") if force_tool_usage else None

    # CRITICAL: Only pass tools parameter if explicitly provided (non-None)
    agent_kwargs = {
        "name": "owflex-assistant",
        "instructions": instructions or OWFLEX_INSTRUCTIONS,
        "model": model,
        "mcp_servers": mcp_servers or [],
        "model_settings": model_settings,
    }
    # DON'T add "tools": tools or [] - this breaks ChatCompletions API
    if tools is not None:
        agent_kwargs["tools"] = tools

    return Agent(**agent_kwargs)
```

---

### 2. Client Session Timeout for Slow Tools

**Issue:** MCP tool calls timeout when the tool takes longer than 5 seconds (default timeout).

**Example:** RAG vector search with Qdrant + embedding generation takes ~4.3 seconds, leaving little margin before timeout.

**Error:**
```
Timeout error during tool execution
```

**Solution:**
```python
async with MCPServerStreamableHttp(
    name="OwFlex RAG Server",
    params={"url": settings.mcp_server_url},
    cache_tools_list=True,
    max_retry_attempts=3,
    client_session_timeout_seconds=15,  # Increase from 5s to 15s for RAG
) as mcp_server:
    # ... agent creation ...
```

**Timeout Guidelines:**
| Tool Type | Expected Duration | Recommended Timeout |
|-----------|------------------|---------------------|
| Simple CRUD | < 1s | 5s (default) |
| Database Query | 1-3s | 10s |
| RAG/Search | 3-8s | 15s |
| External API | Variable | Based on SLA |
| File Processing | 5-30s | 30-60s |

---

### 3. FastMCP `streamable_http_path` Configuration

**Issue:** MCP server returns 404 errors at `/mcp` endpoint when mounted in FastAPI.

**Error:**
```
POST /mcp HTTP/1.1" 404 Not Found
```

**Root Cause:** `streamable_http_path` was not set during `FastMCP()` initialization. Setting it via `mcp.settings` after initialization doesn't work.

**Solution:**
```python
# ❌ WRONG - Setting via settings (doesn't work)
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MyApp")
mcp.settings.streamable_http_path = "/"  # This is IGNORED!

# ✅ RIGHT - Setting during initialization
mcp = FastMCP(
    "MyApp",
    streamable_http_path="/",  # CRITICAL: must be constructor parameter
    json_response=True,         # Enable JSON-RPC responses
)
```

**Why This Matters:**
- The `streamable_http_path` parameter configures internal routing during FastMCP initialization
- Setting it after initialization via `mcp.settings` has no effect
- This is required for mounting the MCP server in FastAPI using `app.mount()`

**Complete Setup:**
```python
# app/mcp/server.py
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "MyApp",
    streamable_http_path="/",  # Must be set during init
    json_response=True,
)

@mcp.tool()
async def my_tool(input: str) -> str:
    """Tool description."""
    return f"Processed: {input}"
```

```python
# app/main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.mcp.server import mcp

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield

app = FastAPI(lifespan=lifespan)
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")
```

---

### 4. Forcing Tool Usage with ModelSettings

**Issue:** Agent doesn't call available tools even when they should be used.

**Example:** User asks "What's in the document?" and agent responds from general knowledge instead of calling `search_documents`.

**Solution:**
```python
from agents import ModelSettings

# Create agent with forced tool usage
agent = Agent(
    name="owflex-assistant",
    instructions=instructions,
    model=model,
    mcp_servers=[mcp_server],
    model_settings=ModelSettings(tool_choice="required"),  # Force tool usage
)
```

**How It Works:**
- `tool_choice="required"` tells the model it MUST call at least one tool before responding
- Useful for RAG systems where you want to ensure document search is always attempted
- Model will still decide which tool to call based on the query

**Trade-offs:**
| Setting | Pros | Cons |
|---------|------|------|
| `tool_choice="required"` | Ensures tools are used | Forces tool call even for greetings |
| `tool_choice="auto"` (default) | Flexible, efficient | May skip tools when needed |
| `tool_choice="none"` | No tool overhead | Tools never called |

**Best Practice:**
- Use `tool_choice="required"` for task-specific agents (e.g., "document search assistant")
- Use `tool_choice="auto"` for general-purpose assistants
- Use clear instructions to guide when tools should be used

---

### 5. Agent Instructions for Tool Guidance

**Issue:** Agent gives up too easily when tools return no results, or doesn't try alternative search terms.

**Example:**
```
User: "What is this doc about?"
Agent: "I searched but couldn't find anything." (gives up immediately)
```

**Solution:** Include comprehensive instructions in the agent prompt:

```python
base_instructions = """You are OwFlex, an AI assistant created to help users with questions based on uploaded documents.

## Available Tools

You have access to the following tool:
- search_documents: Search uploaded documents for relevant information using semantic vector search

## CRITICAL: Tool Usage

MUST use the search_documents tool for ALL questions about uploaded documents:
- When users ask questions about the document - call search_documents with relevant keywords
- Try using specific keywords from the user's question as search terms
- For "what is this about" questions, try searching for: "overview", "purpose", "strategy", "main topic", or key terms from the document name
- ALWAYS call the tool BEFORE answering with your own knowledge

## When search_documents returns no results:

If the search returns no results, suggest trying more specific queries:
- "Let me try searching with more specific keywords..."
- Try extracting key terms from the document name or context
- Suggest the user ask about specific topics, people, or concepts

## Answer Guidelines

1. ALWAYS call search_documents tool first for document-related questions
2. Use the tool results to provide accurate answers with citations
3. If initial search returns no results, try alternative search terms before giving up
4. Do not make up information or use outside knowledge beyond the tool results
"""
```

**Key Instruction Elements:**
1. **Tool declaration** - List available tools explicitly
2. **Usage guidance** - Tell the model WHEN to use each tool
3. **Example queries** - Show what types of queries need tools
4. **Fallback behavior** - What to do when tools return no results
5. **Constraint reminder** - Don't use outside knowledge

---

### 6. Single-Server Architecture (Production Pattern)

**Issue:** Running MCP server as separate process adds deployment complexity.

**Problems:**
- Two processes to manage (main app + MCP server)
- Internal networking between services
- Separate lifecycle management
- Harder scaling and monitoring

**Solution:** Mount MCP server in FastAPI (single-server architecture):

```python
# app/main.py - Single FastAPI application
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.mcp.server import mcp

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield

app = FastAPI(lifespan=lifespan)
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")
```

**Benefits:**
- Single process deployment
- Single port exposure (no internal networking)
- Shared lifecycle management
- Simplified monitoring and logging
- Easier horizontal scaling

**Configuration:**
```bash
# Development (default)
MCP_SERVER_URL=http://127.0.0.1:8000/mcp

# Production (override via environment variable)
MCP_SERVER_URL=https://api.teamflow.com/mcp
```

---

## Testing MCP Integration

### Verification Script

```python
"""Test MCP server integration with OpenAI Agents SDK."""
import asyncio
from agents import Agent, Runner, MCPServerStreamableHttp
from openai import AsyncOpenAI
from agents import OpenAIChatCompletionsModel
from contextlib import asynccontextmanager


@asynccontextmanager
async def create_test_agent(mcp_server_url: str = "http://127.0.0.1:8000/mcp"):
    """Create test agent with MCP tools."""

    # Setup model
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    model = OpenAIChatCompletionsModel(
        openai_client=client,
        model="gpt-4o-mini",
    )

    # Connect to MCP server
    async with MCPServerStreamableHttp(
        name="Test MCP Server",
        params={"url": mcp_server_url},
        cache_tools_list=True,
        client_session_timeout_seconds=15,
    ) as mcp_server:
        # Check tools are available
        tools = await mcp_server.list_tools()
        print(f"✅ Connected to MCP server")
        print(f"✅ Found {len(tools)} tools: {[t.name for t in tools]}")

        # Create agent (don't pass tools explicitly)
        agent = Agent(
            name="test-agent",
            instructions="You are a helpful assistant with access to MCP tools.",
            model=model,
            mcp_servers=[mcp_server],
            model_settings=ModelSettings(tool_choice="required"),
        )
        yield agent


async def test_mcp_tools():
    """Test that MCP tools are working."""
    print("Testing MCP server integration...\n")

    async with create_test_agent() as agent:
        # Test tool calling
        print("Test: Calling MCP tool")
        result = await Runner.run(
            agent,
            "Search the uploaded documents for information about the main topic"
        )
        print(f"Result: {result.final_output}\n")


if __name__ == "__main__":
    asyncio.run(test_mcp_tools())
```

---

## Common Errors and Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `Hosted tools are not supported` | Passing MCP Tool objects to `tools` parameter | Only pass `mcp_servers`, let SDK auto-extract |
| `404 Not Found` at `/mcp` | `streamable_http_path` not set during FastMCP init | Set `streamable_http_path="/"` in `FastMCP()` constructor |
| Timeout during tool call | Tool execution exceeds 5s default | Increase `client_session_timeout_seconds` |
| Agent doesn't call tools | `tool_choice` not set or instructions unclear | Use `ModelSettings(tool_choice="required")` |
| `session_manager not running` | MCP session not started in lifespan | Use `async with mcp.session_manager.run()` |

---

## Production Checklist

Before deploying MCP server to production:

- [ ] `streamable_http_path="/"` set during `FastMCP()` initialization
- [ ] `json_response=True` enabled
- [ ] MCP server mounted with `app.mount("/mcp", mcp.streamable_http_app())`
- [ ] Session manager running in lifespan
- [ ] Using `MCPServerStreamableHttp` with appropriate timeout
- [ ] NOT passing `tools` parameter explicitly (let SDK auto-extract)
- [ ] Using `ModelSettings(tool_choice="required")` if forcing tool usage
- [ ] Agent includes clear tool usage instructions
- [ ] Environment variables configured for production
- [ ] CORS configured for frontend domain
- [ ] Tested with MCP Inspector or verification script

---

## Related Documentation

- **OpenAI ChatKit Integration**: See `.claude/skills/openai-chatkit-integration/LEARNINGS.md` for ChatKit-specific MCP integration issues
- **RAG Pipeline**: See `.claude/skills/rag-pipeline-builder/LESSONS_LEARNED.md` for RAG-specific issues (threshold tuning, vector search)
- **MCP Best Practices**: See `.claude/skills/mcp-builder/reference/mcp_best_practices.md` for universal MCP guidelines

---

## Timeline of Our Debugging Journey

1. **Initial Setup**: Created MCP server with FastMCP and search_documents tool
2. **Integration Issue**: Agent tools list was empty even with MCP servers connected
3. **First Attempt**: Tried passing `mcp_tools` explicitly to agent - caused "Hosted tools" error
4. **Solution**: Discovered SDK auto-extracts tools from `mcp_servers` when `tools` parameter is omitted
5. **Timeout Issue**: RAG searches timing out with default 5s timeout
6. **Timeout Fix**: Increased `client_session_timeout_seconds` to 15s for slower RAG operations
7. **Tool Usage**: Agent not calling tools for document questions
8. **Force Tool Fix**: Added `ModelSettings(tool_choice="required")` and improved instructions
9. **Success**: Agent successfully calls search_documents and retrieves relevant content

---

## Conclusion

Building production MCP servers with OpenAI Agents SDK requires attention to several critical details:

1. **Never pass MCP Tool objects explicitly** - let the SDK auto-extract from `mcp_servers`
2. **Configure timeouts appropriately** - slower tools (RAG, external APIs) need increased `client_session_timeout_seconds`
3. **Set FastMCP parameters during initialization** - `streamable_http_path` must be set in `FastMCP()` constructor
4. **Force tool usage when needed** - use `ModelSettings(tool_choice="required")` for task-specific agents
5. **Provide clear instructions** - guide the model on when and how to use tools
6. **Use single-server architecture** - mount MCP server in FastAPI for simplified deployment

Use the templates in this skill as a starting point - they've been battle-tested and incorporate all the lessons learned.
