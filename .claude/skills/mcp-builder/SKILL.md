---
name: mcp-builder
description: Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK).
license: Complete terms in LICENSE.txt
---

# MCP Server Development Guide

## Overview

Create MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks.

## ⚠️ Critical Lessons Learned (From Real-World Implementation)

### Production-Ready Deployment Architecture (NEW - Critical)

**❌ WRONG: Running MCP server as separate process**
```python
# Two separate processes - complex deployment
# Process 1: Main backend on port 8000
# Process 2: MCP server on port 8001
# Problems:
# - Need to manage two processes
# - Internal networking complexity
# - Separate lifecycle management
# - Harder scaling and monitoring
```

**✅ RIGHT: Mount MCP server in FastAPI (single-server architecture)**

Following the [official MCP Python SDK documentation](https://github.com/modelcontextprotocol/python-sdk):

**CRITICAL**: Set `streamable_http_path="/"` during `FastMCP()` initialization - NOT afterwards!

```python
# app/mcp/server.py - MCP server creation
from mcp.server.fastmcp import FastMCP

# CRITICAL: streamable_http_path MUST be set during initialization
# json_response=True enables proper JSON-RPC over HTTP
mcp = FastMCP(
    "TeamFlow",
    streamable_http_path="/",  # Critical: must be constructor parameter
    json_response=True,  # Enable JSON-RPC responses
)
```

```python
# app/main.py - FastAPI application
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.mcp.server import mcp

# Lifespan with session manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield

app = FastAPI(
    lifespan=lifespan,
)

# Mount MCP server directly using FastAPI's mount() method
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")
```

**Key Points:**
1. `streamable_http_path="/"` - **Must be set during `FastMCP()` initialization, not via `mcp.settings`**
2. No ASGI wrapper needed - FastMCP handles path translation internally
3. Use `app.mount()` method for proper sub-application registration
4. No manual route manipulation needed

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

### Complete Working Example: From Scratch (Production-Ready)

This is a complete, working example showing how to create an MCP server with FastMCP and mount it in FastAPI on the same port. This example incorporates all lessons learned from real-world production issues.

**Project Structure:**
```
myapp/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app with mounted MCP server
│   ├── mcp/
│   │   ├── __init__.py
│   │   └── server.py     # MCP server with tools
│   └── core/
│       ├── __init__.py
│       └── config.py     # Settings
├── requirements.txt
└── .env                  # Environment variables
```

---

#### Step 1: Create MCP Server (`app/mcp/server.py`)

```python
"""MCP server for MyApp using FastMCP.

CRITICAL CONFIGURATION NOTES:
- streamable_http_path MUST be set during FastMCP() initialization
- json_response=True enables proper JSON-RPC over HTTP
- These parameters CANNOT be set via mcp.settings after initialization
"""
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field
from typing import Optional, List

# Create MCP server instance
# CRITICAL: streamable_http_path="/" MUST be set during initialization
# json_response=True enables proper JSON-RPC over HTTP
mcp = FastMCP(
    "MyApp",
    streamable_http_path="/",  # Critical: must be constructor parameter
    json_response=True,         # Enable JSON-RPC responses
)


# =============================================================================
# Tool Input Models (Pydantic for validation)
# =============================================================================

class CreateTaskInput(BaseModel):
    """Input for creating a new task."""
    title: str = Field(
        min_length=1,
        max_length=200,
        description="Task title (clear and descriptive)"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Detailed task description"
    )
    priority: str = Field(
        default="MEDIUM",
        description="Task priority: LOW, MEDIUM, HIGH, URGENT"
    )


class ListTasksInput(BaseModel):
    """Input for listing tasks."""
    status: Optional[str] = Field(
        default=None,
        description="Filter by status: TODO, IN_PROGRESS, DONE"
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of tasks to return (1-100)"
    )


# =============================================================================
# MCP Tools
# =============================================================================

@mcp.tool()
async def create_task(input: CreateTaskInput) -> str:
    """
    Create a new task in the system.

    Usage Tips:
    - Use clear, descriptive titles (e.g., "Fix login bug" not "Issue")
    - Include relevant details in description for better context
    - Set priority based on business impact

    Args:
        input: Task details including title, description, and priority

    Returns:
        Confirmation message with task ID and details
    """
    # In production, this would interact with your database/service layer
    import uuid
    task_id = str(uuid.uuid4())

    return (
        f"Task created successfully!\n"
        f"- ID: {task_id}\n"
        f"- Title: {input.title}\n"
        f"- Description: {input.description or 'N/A'}\n"
        f"- Priority: {input.priority}\n"
        f"- Status: TODO"
    )


@mcp.tool()
async def list_tasks(input: ListTasksInput) -> str:
    """
    List all tasks in the system, optionally filtered by status.

    This tool returns tasks with their current status, priority, and
    assignment information. Use for overview and task discovery.

    Usage Tips:
    - Use status filter to focus on specific workflow stages
    - Combine with other tools for workflow automation

    Args:
        input: Filtering options including status and result limit

    Returns:
        Formatted list of tasks with details
    """
    # In production, this would query your database
    return (
        "Tasks found: 0\n"
        f"Filter: status={input.status or 'all'}, limit={input.limit}\n"
        "\n"
        "Tip: Connect to a database to return actual tasks."
    )


@mcp.tool()
async def get_task_by_id(task_id: str) -> str:
    """
    Get detailed information about a specific task.

    Use this when you need complete task details including:
    - Full description and acceptance criteria
    - Assignment and due date
    - Related tasks or dependencies
    - Activity history

    Args:
        task_id: Unique identifier of the task (UUID)

    Returns:
        Detailed task information or error if not found
    """
    # In production, this would query your database
    return (
        f"Task not found: {task_id}\n"
        "\n"
        "Tip: Connect to a database to return actual task data."
    )


# =============================================================================
# Server Info (for debugging)
# =============================================================================

def get_tool_count() -> int:
    """Return the number of registered tools."""
    return len(mcp._tool_manager._tools)
```

---

#### Step 2: Create Configuration (`app/core/config.py`)

```python
"""Application configuration using Pydantic Settings."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # API Configuration
    api_v1_prefix: str = "/api/v1"
    project_name: str = "MyApp API"

    # CORS Configuration
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # MCP Server Configuration
    # Development: http://127.0.0.1:8000/mcp
    # Production: https://api.myapp.com/mcp
    mcp_server_url: str = "http://127.0.0.1:8000/mcp"

    # AI/ML Configuration
    openrouter_api_key: str | None = None
    openai_api_key: str | None = None


# Global settings instance
settings = Settings()
```

---

#### Step 3: Create FastAPI Application (`app/main.py`)

```python
"""FastAPI application with mounted MCP server.

This application demonstrates the correct way to mount an MCP server
in FastAPI using the single-server architecture.

KEY POINTS:
1. MCP server is mounted at /mcp endpoint using app.mount()
2. Session manager runs in the lifespan context
3. All API routes work alongside the MCP endpoint
4. Single process, single port deployment
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import get_logger
from app.mcp.server import mcp

logger = get_logger(__name__)


# =============================================================================
# Lifespan Management
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager.

    This ensures the MCP session manager runs for the lifetime of the
    FastAPI application. This is CRITICAL for proper MCP server operation.

    Yields:
        Control back to FastAPI after startup
    """
    logger.info("[lifespan] Starting up application...")
    logger.info(f"[lifespan] MCP server available at: {settings.mcp_server_url}")

    # CRITICAL: Run MCP session manager for the lifetime of the app
    async with mcp.session_manager.run():
        yield  # Application runs here

    logger.info("[lifespan] Shutting down application...")


# =============================================================================
# FastAPI Application
# =============================================================================

# Create FastAPI application
app = FastAPI(
    title=settings.project_name,
    description="FastAPI application with integrated MCP server",
    version="1.0.0",
    lifespan=lifespan,
)

# =============================================================================
# Middleware
# =============================================================================

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# API Routes
# =============================================================================

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "MyApp API",
        "mcp_endpoint": settings.mcp_server_url,
        "mcp_tools": mcp.get_tool_count(),
        "docs_url": "/docs",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "mcp_server": "running",
        "mcp_endpoint": settings.mcp_server_url,
    }


# =============================================================================
# Mount MCP Server
# =============================================================================

# CRITICAL: Mount MCP server at /mcp endpoint
# This enables the MCP server to run on the same port as FastAPI
# The streamable_http_app() returns an ASGI application
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")


# =============================================================================
# Startup Event (for logging)
# =============================================================================

@app.get("/debug/mcp")
async def debug_mcp():
    """Debug endpoint to view MCP server configuration."""
    tools = []
    for tool_name, tool_def in mcp._tool_manager._tools.items():
        tools.append({
            "name": tool_name,
            "description": tool_def.description[:100] + "..." if len(tool_def.description) > 100 else tool_def.description
        })

    return {
        "mcp_server_url": settings.mcp_server_url,
        "total_tools": len(tools),
        "tools": tools,
    }
```

---

#### Step 4: Create Environment File (`.env`)

```bash
# .env file - Configuration for development

# MCP Server URL (auto-detected, but can override)
MCP_SERVER_URL=http://127.0.0.1:8000/mcp

# OpenRouter API Key (for using non-OpenAI models)
# OPENROUTER_API_KEY=sk-or-...

# OpenAI API Key (for direct OpenAI access)
# OPENAI_API_KEY=sk-...
```

---

#### Step 5: Create Requirements (`requirements.txt`)

```txt
# FastAPI and server
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.10.0
pydantic-settings==2.6.0

# MCP SDK
mcp==1.1.1

# OpenAI Agents SDK (optional, for using MCP tools with agents)
openai-agents==0.0.2
openai>=1.58.0

# Logging
python-json-logger==2.0.7
```

---

#### Step 6: Run and Test

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --reload --port 8000

# Or using Python
python -m uvicorn app.main:app --reload --port 8000
```

**Test the MCP endpoint:**
```bash
# Test MCP server is running
curl http://127.0.0.1:8000/mcp

# Test health endpoint
curl http://127.0.0.1:8000/health

# Test debug MCP endpoint
curl http://127.0.0.1:8000/debug/mcp
```

**Expected output from `/debug/mcp`:**
```json
{
  "mcp_server_url": "http://127.0.0.1:8000/mcp",
  "total_tools": 3,
  "tools": [
    {"name": "create_task", "description": "Create a new task in the system..."},
    {"name": "list_tasks", "description": "List all tasks in the system..."},
    {"name": "get_task_by_id", "description": "Get detailed information..."}
  ]
}
```

---

### Common Problems and Solutions

#### Problem 1: 404 Error at `/mcp` Endpoint

**Symptoms:**
```
POST /mcp HTTP/1.1" 404 Not Found
```

**Root Cause:** `streamable_http_path` was not set during `FastMCP()` initialization.

**Solution:**
```python
# ❌ WRONG - Setting via settings (doesn't work)
mcp = FastMCP("MyApp")
mcp.settings.streamable_http_path = "/"  # This is ignored!

# ✅ RIGHT - Setting during initialization
mcp = FastMCP(
    "MyApp",
    streamable_http_path="/",  # Must be constructor parameter
    json_response=True,
)
```

---

#### Problem 2: AssertionError - fastapi_middleware_astack not found

**Symptoms:**
```
AssertionError: fastapi_middleware_astack not found in request scope
```

**Root Cause:** Using Starlette app instead of FastAPI, or improper mounting.

**Solution:**
```python
# ❌ WRONG - Using Starlette directly
from starlette.applications import Starlette
app = Starlette()  # FastAPI routers won't work!

# ✅ RIGHT - Use FastAPI
from fastapi import FastAPI
app = FastAPI(lifespan=lifespan)
app.mount("/mcp", mcp.streamable_http_app())
```

---

#### Problem 3: 307 Temporary Redirect

**Symptoms:**
```
POST /mcp HTTP/1.1" 307 Temporary Redirect
POST /mcp/ HTTP/1.1" 200 OK
```

**Explanation:** This is **normal FastAPI behavior**. Requests to `/mcp` (without trailing slash) are redirected to `/mcp/` (with trailing slash) for path normalization. The redirect is instant and harmless.

**Solution:** No fix needed. If you want to avoid the redirect, configure your MCP client to use `/mcp/` (with trailing slash) directly.

---

#### Problem 4: Tools Not Discoverable

**Symptoms:** Agent can't see or use MCP tools.

**Root Cause:** MCP server not mounted or session manager not running.

**Solution:**
```python
# Ensure session manager runs in lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():  # CRITICAL!
        yield

app = FastAPI(lifespan=lifespan)
app.mount("/mcp", mcp.streamable_http_app())  # CRITICAL!
```

---

### Testing with OpenAI Agents SDK

Once your MCP server is running, you can test it with an agent:

```python
"""Test MCP server integration with OpenAI Agents SDK."""
import asyncio
from agents import Agent, Runner, MCPServerStreamableHttp, OpenAIChatCompletionsModel
from openai import AsyncOpenAI
from contextlib import asynccontextmanager


@asynccontextmanager
async def create_test_agent(mcp_server_url: str = "http://127.0.0.1:8000/mcp"):
    """Create test agent with MCP tools."""

    # Setup model (using OpenRouter as example)
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key="your-openrouter-api-key",
    )

    model = OpenAIChatCompletionsModel(
        openai_client=client,
        model="google/gemini-2.0-flash-exp:free",
    )

    # Connect to MCP server
    async with MCPServerStreamableHttp(
        name="MyApp MCP Server",
        params={"url": mcp_server_url},
        cache_tools_list=True,
    ) as mcp_server:
        agent = Agent(
            name="test-agent",
            instructions="You are a helpful task management assistant.",
            model=model,
            mcp_servers=[mcp_server],
        )
        yield agent


async def test_mcp_tools():
    """Test that MCP tools are working."""
    print("Testing MCP server integration...\n")

    async with create_test_agent() as agent:
        # Test 1: Create a task
        print("Test 1: Creating a task")
        result1 = await Runner.run(
            agent,
            "Create a high priority task called 'Fix login bug' with description 'Users cannot login on mobile devices'"
        )
        print(f"Result: {result1.final_output}\n")

        # Test 2: List tasks
        print("Test 2: Listing all tasks")
        result2 = await Runner.run(agent, "List all tasks")
        print(f"Result: {result2.final_output}\n")


if __name__ == "__main__":
    asyncio.run(test_mcp_tools())
```

---

### Summary: Production Checklist

Before deploying to production, verify:

- [ ] `streamable_http_path="/"` set during `FastMCP()` initialization
- [ ] `json_response=True` enabled
- [ ] MCP server mounted with `app.mount("/mcp", mcp.streamable_http_app())`
- [ ] Session manager running in lifespan: `async with mcp.session_manager.run()`
- [ ] Using FastAPI (not plain Starlette)
- [ ] All API routes still work after mounting MCP server
- [ ] MCP endpoint returns 200 (not 404)
- [ ] Tools are discoverable via `/debug/mcp` endpoint
- [ ] Environment variables configured for production
- [ ] CORS configured for frontend domain

---

### Integration with OpenAI Agents SDK (Production Pattern)

When integrating MCP tools with the OpenAI Agents SDK:

**1. Production Pattern: Use MCPServerStreamableHttp**

```python
from agents import Agent, Runner, MCPServerStreamableHttp
from contextlib import asynccontextmanager
from openai import AsyncOpenAI
from agents import OpenAIChatCompletionsModel

@asynccontextmanager
async def create_agent_with_mcp(mcp_server_url: str = "http://127.0.0.1:8000/mcp"):
    """Create agent with proper MCP server lifecycle management."""

    # Setup model
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
    )

    model = OpenAIChatCompletionsModel(
        openai_client=client,
        model="google/gemini-2.0-flash-exp:free",
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
            model=model,
            mcp_servers=[mcp_server],
        )
        yield agent

# Usage:
async with create_agent_with_mcp() as agent:
    result = await Runner.run(agent, "List all high priority tasks")
    print(result.final_output)
# MCP connection automatically cleaned up
```

**2. MCP Server with FastMCP (Python)**

```python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel

# Create MCP server
mcp = FastMCP("teamflow-tools")

@mcp.tool()
async def search_knowledge_base(query: str, limit: int = 5) -> str:
    """
    Search the knowledge base for relevant information.

    Args:
        query: Search query string
        limit: Maximum number of results to return (default: 5)

    Returns:
        Formatted search results with sources
    """
    # Implementation here
    return f"Found results for: {query}"
```

**3. Mount MCP Server in FastAPI**

```python
# app/main.py - Single FastAPI application
from fastapi import FastAPI
from app.mcp.server import mcp

app = FastAPI()

# Mount MCP server at /mcp endpoint
app.mount("/mcp", mcp.streamable_http_app(), name="mcp")

# Configuration
# MCP_SERVER_URL=http://127.0.0.1:8000/mcp (default)
# MCP_SERVER_URL=https://api.teamflow.com/mcp (production)
```

**4. Tool Design Best Practices**

- **Clear Descriptions**: Help agents understand when to use each tool
- **Structured Inputs**: Use Pydantic models for complex parameters
- **Actionable Errors**: Guide agents toward solutions with specific error messages
- **Pagination**: For large result sets, return paginated responses

**Example of Good Tool Design:**

```python
from pydantic import BaseModel, Field
from typing import List, Literal

class SearchInput(BaseModel):
    """Input for knowledge base search."""
    query: str = Field(
        min_length=2,
        max_length=500,
        description="Search query (prefer specific keywords over natural language)"
    )
    limit: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of results (1-20)"
    )
    scope: Literal["all", "docs", "code", "issues"] = Field(
        default="all",
        description="Search scope to narrow down results"
    )

@mcp.tool()
async def search_knowledge_base_v2(input: SearchInput) -> str:
    """
    Search the knowledge base for relevant information.

    This tool performs semantic search across indexed documents
    and returns the most relevant chunks with source citations.

    Usage Tips:
    - Use specific technical terms for better results
    - Search for code snippets with function names
    - For API docs, search for endpoint names

    Args:
        input: Search parameters including query and filters

    Returns:
        Formatted results with each chunk including:
        - Content text
        - Source document
        - Relevance score
        - Metadata (type, path, etc.)
    """
    try:
        results = await rag_service.search(
            query=input.query,
            limit=input.limit,
            filter_scope=input.scope
        )

        if not results:
            return f"No results found for query: '{input.query}'. "
                   f"Try different keywords or check spelling."

        formatted = []
        for r in results:
            formatted.append(f"- {r['content']}\n  Source: {r['source']}")

        return "\n\n".join(formatted)

    except Exception as e:
        # Actionable error message
        return f"Search failed: {str(e)}. "
               f"Suggestion: Verify Qdrant connection and collection exists."
```

**4. Common Pitfalls**

- **❌ Vague Tool Descriptions**: "Search stuff" → **✅** "Search knowledge base for technical documentation"
- **❌ No Input Validation**: Accept any string → **✅** Use Pydantic with constraints
- **❌ Generic Errors**: "Error occurred" → **✅** "Qdrant connection failed. Check QDRANT_URL env var."
- **❌ No Usage Examples**: Just parameter list → **✅** Include "Usage Tips" in docstring
- **❌ Separate MCP Server Process**: Running MCP on separate port → **✅** Mount at `/mcp` in FastAPI
- **❌ No MCP Lifecycle Management**: Direct agent creation → **✅** Use async context manager pattern
- **❌ Hardcoded MCP URLs**: `http://127.0.0.1:8001/mcp` → **✅** Use `settings.mcp_server_url` with env override
- **❌ Setting streamable_http_path via settings**: `mcp.settings.streamable_http_path="/"` → **✅** Must be set during `FastMCP()` initialization
- **❌ Missing session manager**: Not running `mcp.session_manager.run()` → **✅** Use `async with mcp.session_manager.run():` in lifespan
- **❌ Manual route insertion**: `Mount("/mcp", app=...); app.routes.insert(0, mount)` doesn't work reliably → **✅** Use `app.mount("/mcp", mcp.streamable_http_app())`
- **❌ Custom ASGI wrapper**: Creating custom path translation wrapper → **✅** Not needed when `streamable_http_path="/"` is set during init

**5. Testing MCP Tools with Agents**

```python
import asyncio
from agents import Runner

async def test_tool():
    agent = Agent(
        name="Test Agent",
        instructions="Use the search_knowledge_base tool to answer questions.",
        tools=[search_knowledge_base],
    )

    result = await Runner.run(
        agent,
        "How do I create a task in TeamFlow?"
    )

    print(result.final_output)

asyncio.run(test_tool())
```

---

# Process

## 🚀 High-Level Workflow

Creating a high-quality MCP server involves four main phases:

### Phase 1: Deep Research and Planning

#### 1.1 Understand Modern MCP Design

**API Coverage vs. Workflow Tools:**
Balance comprehensive API endpoint coverage with specialized workflow tools. Workflow tools can be more convenient for specific tasks, while comprehensive coverage gives agents flexibility to compose operations. Performance varies by client—some clients benefit from code execution that combines basic tools, while others work better with higher-level workflows. When uncertain, prioritize comprehensive API coverage.

**Tool Naming and Discoverability:**
Clear, descriptive tool names help agents find the right tools quickly. Use consistent prefixes (e.g., `github_create_issue`, `github_list_repos`) and action-oriented naming.

**Context Management:**
Agents benefit from concise tool descriptions and the ability to filter/paginate results. Design tools that return focused, relevant data. Some clients support code execution which can help agents filter and process data efficiently.

**Actionable Error Messages:**
Error messages should guide agents toward solutions with specific suggestions and next steps.

#### 1.2 Study MCP Protocol Documentation

**Navigate the MCP specification:**

Start with the sitemap to find relevant pages: `https://modelcontextprotocol.io/sitemap.xml`

Then fetch specific pages with `.md` suffix for markdown format (e.g., `https://modelcontextprotocol.io/specification/draft.md`).

Key pages to review:
- Specification overview and architecture
- Transport mechanisms (streamable HTTP, stdio)
- Tool, resource, and prompt definitions

#### 1.3 Study Framework Documentation

**Recommended stack:**
- **Language**: TypeScript (high-quality SDK support and good compatibility in many execution environments e.g. MCPB. Plus AI models are good at generating TypeScript code, benefiting from its broad usage, static typing and good linting tools)
- **Transport**: Streamable HTTP for remote servers, using stateless JSON (simpler to scale and maintain, as opposed to stateful sessions and streaming responses). stdio for local servers.

**Load framework documentation:**

- **MCP Best Practices**: [📋 View Best Practices](./reference/mcp_best_practices.md) - Core guidelines

**For TypeScript (recommended):**
- **TypeScript SDK**: Use WebFetch to load `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- [⚡ TypeScript Guide](./reference/node_mcp_server.md) - TypeScript patterns and examples

**For Python:**
- **Python SDK**: Use WebFetch to load `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- [🐍 Python Guide](./reference/python_mcp_server.md) - Python patterns and examples

#### 1.4 Plan Your Implementation

**Understand the API:**
Review the service's API documentation to identify key endpoints, authentication requirements, and data models. Use web search and WebFetch as needed.

**Tool Selection:**
Prioritize comprehensive API coverage. List endpoints to implement, starting with the most common operations.

---

### Phase 2: Implementation

#### 2.1 Set Up Project Structure

See language-specific guides for project setup:
- [⚡ TypeScript Guide](./reference/node_mcp_server.md) - Project structure, package.json, tsconfig.json
- [🐍 Python Guide](./reference/python_mcp_server.md) - Module organization, dependencies

#### 2.2 Implement Core Infrastructure

Create shared utilities:
- API client with authentication
- Error handling helpers
- Response formatting (JSON/Markdown)
- Pagination support

#### 2.3 Implement Tools

For each tool:

**Input Schema:**
- Use Zod (TypeScript) or Pydantic (Python)
- Include constraints and clear descriptions
- Add examples in field descriptions

**Output Schema:**
- Define `outputSchema` where possible for structured data
- Use `structuredContent` in tool responses (TypeScript SDK feature)
- Helps clients understand and process tool outputs

**Tool Description:**
- Concise summary of functionality
- Parameter descriptions
- Return type schema

**Implementation:**
- Async/await for I/O operations
- Proper error handling with actionable messages
- Support pagination where applicable
- Return both text content and structured data when using modern SDKs

**Annotations:**
- `readOnlyHint`: true/false
- `destructiveHint`: true/false
- `idempotentHint`: true/false
- `openWorldHint`: true/false

---

### Phase 3: Review and Test

#### 3.1 Code Quality

Review for:
- No duplicated code (DRY principle)
- Consistent error handling
- Full type coverage
- Clear tool descriptions

#### 3.2 Build and Test

**TypeScript:**
- Run `npm run build` to verify compilation
- Test with MCP Inspector: `npx @modelcontextprotocol/inspector`

**Python:**
- Verify syntax: `python -m py_compile your_server.py`
- Test with MCP Inspector

See language-specific guides for detailed testing approaches and quality checklists.

---

### Phase 4: Create Evaluations

After implementing your MCP server, create comprehensive evaluations to test its effectiveness.

**Load [✅ Evaluation Guide](./reference/evaluation.md) for complete evaluation guidelines.**

#### 4.1 Understand Evaluation Purpose

Use evaluations to test whether LLMs can effectively use your MCP server to answer realistic, complex questions.

#### 4.2 Create 10 Evaluation Questions

To create effective evaluations, follow the process outlined in the evaluation guide:

1. **Tool Inspection**: List available tools and understand their capabilities
2. **Content Exploration**: Use READ-ONLY operations to explore available data
3. **Question Generation**: Create 10 complex, realistic questions
4. **Answer Verification**: Solve each question yourself to verify answers

#### 4.3 Evaluation Requirements

Ensure each question is:
- **Independent**: Not dependent on other questions
- **Read-only**: Only non-destructive operations required
- **Complex**: Requiring multiple tool calls and deep exploration
- **Realistic**: Based on real use cases humans would care about
- **Verifiable**: Single, clear answer that can be verified by string comparison
- **Stable**: Answer won't change over time

#### 4.4 Output Format

Create an XML file with this structure:

```xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation that uses the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
<!-- More qa_pairs... -->
</evaluation>
```

---

# Reference Files

## 📚 Documentation Library

Load these resources as needed during development:

### Core MCP Documentation (Load First)
- **MCP Protocol**: Start with sitemap at `https://modelcontextprotocol.io/sitemap.xml`, then fetch specific pages with `.md` suffix
- [📋 MCP Best Practices](./reference/mcp_best_practices.md) - Universal MCP guidelines including:
  - Server and tool naming conventions
  - Response format guidelines (JSON vs Markdown)
  - Pagination best practices
  - Transport selection (streamable HTTP vs stdio)
  - Security and error handling standards

### SDK Documentation (Load During Phase 1/2)
- **Python SDK**: Fetch from `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- **TypeScript SDK**: Fetch from `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`

### Language-Specific Implementation Guides (Load During Phase 2)
- [🐍 Python Implementation Guide](./reference/python_mcp_server.md) - Complete Python/FastMCP guide with:
  - Server initialization patterns
  - Pydantic model examples
  - Tool registration with `@mcp.tool`
  - Complete working examples
  - Quality checklist

- [⚡ TypeScript Implementation Guide](./reference/node_mcp_server.md) - Complete TypeScript guide with:
  - Project structure
  - Zod schema patterns
  - Tool registration with `server.registerTool`
  - Complete working examples
  - Quality checklist

### Evaluation Guide (Load During Phase 4)
- [✅ Evaluation Guide](./reference/evaluation.md) - Complete evaluation creation guide with:
  - Question creation guidelines
  - Answer verification strategies
  - XML format specifications
  - Example questions and answers
  - Running an evaluation with the provided scripts
