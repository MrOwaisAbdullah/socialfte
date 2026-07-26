# ChatKit Integration Implementation Guide

Complete step-by-step guide for implementing OpenAI ChatKit with a custom FastAPI backend and OpenAI Agents SDK.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Testing](#testing)
6. [Production Checklist](#production-checklist)

---

## Architecture Overview

```
┌─────────────────┐
│  Browser (React) │
│   @openai/      │
│   chatkit-react  │
└────────┬────────┘
         │ HTTP/SSE
         ▼
┌─────────────────┐
│  FastAPI Server │
│  /chatkit       │
│  endpoint       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  ChatKit Python SDK      │
│  - server.process()     │
│  - Store (threads/items) │
│  - AgentContext          │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  OpenAI Agents SDK       │
│  - Agent definition      │
│  - Runner.run_streamed() │
│  - Tool integration      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  LLM Provider            │
│  (OpenRouter/Gemini/     │
│   OpenAI/Ollama)         │
└─────────────────────────┘
```

---

## Project Structure

```
my-chatkit-app/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app & endpoints
│   │   ├── chatkit/
│   │   │   ├── __init__.py
│   │   │   ├── server.py           # ChatKitServer implementation
│   │   │   └── store.py            # Custom Store (MemoryStore/DBStore)
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── client.py           # LLM client configuration
│   │   │   └── chatbot.py          # Agent definition
│   │   └── core/
│   │       ├── config.py           # Settings & environment
│   │       └── logging.py          # Logging configuration
│   ├── .env.example                # Environment variables template
│   └── pyproject.toml              # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ChatWidget.tsx      # ChatKit React component
│   │   └── pages/
│   │       └── chat.tsx            # Chat page
│   └── package.json
└── README.md
```

---

## Backend Setup

### Step 1: Initialize Project

```bash
# Create backend directory
mkdir backend && cd backend

# Initialize uv project
uv init --python 3.13

# Create directory structure
mkdir -p app/{chatkit,agents,core}
```

### Step 2: Configure Dependencies

Create `pyproject.toml`:

```toml
[project]
name = "chatkit-backend"
version = "0.1.0"
description = "ChatKit backend with OpenAI Agents SDK"
requires-python = ">=3.13"
dependencies = [
    # Web Framework
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",

    # ChatKit SDK
    "openai-chatkit>=1.4.2",

    # OpenAI Agents SDK
    "openai-agents>=0.6.5",
    "openai>=1.57.0",  # AsyncOpenAI client

    # Data Validation
    "pydantic>=2.10.0",
    "pydantic-settings>=2.6.0",

    # Environment
    "python-dotenv>=1.0.0",
    "python-multipart>=0.0.20",

    # Optional: Database (if using persistent storage)
    # "sqlmodel>=0.0.22",
    # "asyncpg>=0.30.0",  # PostgreSQL async driver
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
dev-dependencies = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.28.0",  # For testing FastAPI
]
```

Install dependencies:

```bash
uv sync
```

### Step 3: Configure Environment

Create `.env.example`:

```bash
# LLM Provider Configuration
# Choose one: OPENROUTER_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY
OPENROUTER_API_KEY=your_openrouter_key_here
GEMINI_API_KEY=your_gemini_key_here
OPENAI_API_KEY=your_openai_key_here

# Model Selection
MODEL_NAME=mistralai/devstral-2512:free  # OpenRouter
# MODEL_NAME=gemini-2.0-flash-exp  # Gemini
# MODEL_NAME=gpt-5-nano-2025-08-07  # OpenAI

# Server Configuration
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Optional: Database (if using persistent storage)
# DATABASE_URL=postgresql+asyncpg://user:pass@localhost/chatkit
```

### Step 4: Create Configuration Module

Create `app/core/config.py`:

```python
"""Application configuration using Pydantic Settings."""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # LLM Provider
    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""

    # Model Configuration
    model_name: str = "gpt-5-nano-2025-08-07"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: List[str] = ["http://localhost:3000"]

    # Optional: Database
    # database_url: str = ""

    @property
    def llm_provider(self) -> str:
        """Determine which LLM provider to use."""
        if self.openrouter_api_key:
            return "openrouter"
        elif self.gemini_api_key:
            return "gemini"
        elif self.openai_api_key:
            return "openai"
        return "openai"  # Default

    @property
    def api_key(self) -> str:
        """Get the appropriate API key based on provider."""
        providers = {
            "openrouter": self.openrouter_api_key,
            "gemini": self.gemini_api_key,
            "openai": self.openai_api_key,
        }
        return providers.get(self.llm_provider, self.openai_api_key)


# Singleton instance
settings = Settings()
```

### Step 5: Create LLM Client

Create `app/agents/client.py`:

```python
"""LLM client configuration for different providers."""
from openai import AsyncOpenAI
from agents import OpenAIChatCompletionsModel, set_default_openai_api

from app.core.config import settings

# Global instances
_client: AsyncOpenAI | None = None
_model: OpenAIChatCompletionsModel | None = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create the AsyncOpenAI client."""
    global _client

    if _client is not None:
        return _client

    # Configure based on provider
    if settings.llm_provider == "openrouter":
        base_url = "https://openrouter.ai/api/v1"
        api_key = settings.openrouter_api_key
        set_default_openai_api("chat_completions")  # Required for OpenRouter
    elif settings.llm_provider == "gemini":
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        api_key = settings.gemini_api_key
        set_default_openai_api("chat_completions")
    else:  # OpenAI (default)
        base_url = None  # Use default
        api_key = settings.openai_api_key

    _client = AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
    )

    return _client


def get_model(model_name: str | None = None) -> OpenAIChatCompletionsModel:
    """Get or create the OpenAI Chat Completions Model wrapper."""
    global _model

    if _model is not None:
        return _model

    client = get_openai_client()
    _model = OpenAIChatCompletionsModel(
        openai_client=client,
        model=model_name or settings.model_name,
    )

    return _model
```

### Step 6: Create Agent Definition

Create `app/agents/chatbot.py`:

```python
"""Chatbot agent definition using OpenAI Agents SDK."""
from agents import Agent

from app.agents.client import get_model


# Agent System Instructions
AGENT_INSTRUCTIONS = """You are a helpful AI assistant.

Your role:
- Answer questions clearly and concisely
- If you don't know something, say so
- Be friendly and professional
- Keep responses relatively short unless asked for detail

When users ask for help, guide them through available capabilities."""


def create_assistant_agent(
    instructions: str | None = None,
    model_name: str | None = None,
) -> Agent:
    """Create the assistant agent.

    Args:
        instructions: Optional custom system instructions
        model_name: Optional model override

    Returns:
        Configured Agent instance
    """
    model = get_model(model_name)

    return Agent(
        name="assistant",
        instructions=instructions or AGENT_INSTRUCTIONS,
        model=model,
    )
```

### Step 7: Implement Custom Store

Create `app/chatkit/store.py`:

```python
"""In-memory Store implementation for ChatKit SDK."""
from typing import Dict, List
from datetime import datetime
from dataclasses import dataclass, field

from chatkit.store import Store, Page, ThreadItem
from chatkit.server import ThreadMetadata


@dataclass
class _ThreadState:
    """Internal state for a thread."""
    thread: ThreadMetadata
    items: List[ThreadItem] = field(default_factory=list)


class MemoryStore(Store[dict]):
    """In-memory implementation of ChatKit Store.

    Suitable for development and testing.
    For production, implement a persistent version with PostgreSQL/MongoDB.
    """

    def __init__(self) -> None:
        self._threads: Dict[str, _ThreadState] = {}
        self._items_map: Dict[str, ThreadItem] = {}

    async def save_thread(
        self,
        thread: ThreadMetadata,
        context: dict,
    ) -> None:
        """Save or update thread metadata."""
        state = self._threads.get(thread.id)
        if state:
            state.thread = thread.model_copy(deep=True)
        else:
            self._threads[thread.id] = _ThreadState(
                thread=thread.model_copy(deep=True),
                items=[],
            )

    async def add_thread_item(
        self,
        thread_id: str,
        item: ThreadItem,
        context: dict,
    ) -> None:
        """Add an item to a thread."""
        state = self._threads.get(thread_id)
        if state:
            state.items.append(item)
        self._items_map[item.id] = item

    async def save_item(
        self,
        item: ThreadItem,
        context: dict,
    ) -> None:
        """Save an item (for updates)."""
        self._items_map[item.id] = item

    async def load_thread(
        self,
        thread_id: str,
        context: dict,
    ) -> ThreadMetadata | None:
        """Load thread metadata by ID.

        Auto-creates thread if it doesn't exist (ChatKit SDK compatibility).
        """
        state = self._threads.get(thread_id)
        if state:
            return state.thread

        # Auto-create thread for ChatKit SDK compatibility
        new_thread = ThreadMetadata(
            id=thread_id,
            title="New Chat",
            created_at=datetime.utcnow(),
            metadata={
                "user_id": str(context.get("user_id", "unknown")),
            },
        )

        await self.save_thread(new_thread, context or {})
        return new_thread

    async def load_threads(
        self,
        context: dict,
        limit: int = 100,
        after: str | None = None,
        order: str = "desc",
    ) -> Page[ThreadMetadata]:
        """Load all threads with pagination."""
        threads = [state.thread for state in self._threads.values()]

        # Sort by created_at
        threads.sort(
            key=lambda t: getattr(t, "created_at", datetime.utcnow()),
            reverse=(order == "desc"),
        )

        # Handle pagination
        start = 0
        if after:
            index_map = {thread.id: idx for idx, thread in enumerate(threads)}
            start = index_map.get(after, -1) + 1

        slice_threads = threads[start : start + limit + 1]
        has_more = len(slice_threads) > limit

        return Page(
            data=slice_threads[:limit],
            has_more=has_more,
            after=slice_threads[-1].id if has_more else None,
        )

    async def load_thread_items(
        self,
        thread_id: str,
        after: str | None,
        limit: int,
        order: str,
        context: dict,
    ) -> Page[ThreadItem]:
        """Load thread items with pagination."""
        items = list(self._items(thread_id))
        items.sort(
            key=lambda i: getattr(i, "created_at", datetime.utcnow()),
            reverse=(order == "desc"),
        )

        start = 0
        if after:
            index_map = {item.id: idx for idx, item in enumerate(items)}
            start = index_map.get(after, -1) + 1

        slice_items = items[start : start + limit + 1]
        has_more = len(slice_items) > limit

        return Page(
            data=slice_items[:limit],
            has_more=has_more,
            after=slice_items[-1].id if has_more else None,
        )

    async def load_item(
        self,
        item_id: str,
        context: dict,
    ) -> ThreadItem | None:
        """Load an item by ID."""
        return self._items_map.get(item_id)

    async def delete_thread(
        self,
        thread_id: str,
        context: dict,
    ) -> None:
        """Delete a thread."""
        if thread_id in self._threads:
            del self._threads[thread_id]

    async def delete_thread_item(
        self,
        thread_id: str,
        item_id: str,
        context: dict,
    ) -> None:
        """Delete an item from a thread."""
        state = self._threads.get(thread_id)
        if state:
            state.items = [i for i in state.items if i.id != item_id]

    async def save_attachment(
        self,
        attachment,
        context: dict,
    ) -> None:
        """Save an attachment (not implemented)."""
        raise NotImplementedError("Attachments not supported")

    async def load_attachment(
        self,
        attachment_id: str,
        context: dict,
    ):
        """Load an attachment (not implemented)."""
        raise NotImplementedError("Attachments not supported")

    async def delete_attachment(
        self,
        attachment_id: str,
        context: dict,
    ) -> None:
        """Delete an attachment (not implemented)."""
        raise NotImplementedError("Attachments not supported")

    def generate_item_id(self, item_type: str, thread: ThreadMetadata, context) -> str:
        """Generate a unique item ID."""
        import uuid
        return f"{item_type}_{uuid.uuid4().hex[:16]}"

    def generate_thread_id(self, context) -> str:
        """Generate a unique thread ID."""
        import uuid
        return f"thread_{uuid.uuid4().hex[:16]}"

    def _items(self, thread_id: str) -> List[ThreadItem]:
        """Get all items for a thread."""
        state = self._threads.get(thread_id)
        return state.items if state else []
```

### Step 8: Implement ChatKit Server

Create `app/chatkit/server.py`:

```python
"""ChatKit server implementation with OpenAI Agents SDK integration."""
import logging
from typing import Any, AsyncIterator

from agents import Runner
from chatkit.server import (
    ChatKitServer,
    StreamingResult,
    ThreadMetadata,
    UserMessageItem,
    ClientToolCallItem,
    ThreadStreamEvent,
    ErrorEvent,
)
from chatkit.store import Store
from chatkit.agents import (
    simple_to_agent_input,
    stream_agent_response,
    AgentContext,
)

from app.agents.chatbot import create_assistant_agent
from app.chatkit.store import MemoryStore

logger = logging.getLogger(__name__)


class TeamFlowChatKitServer(ChatKitServer):
    """Custom ChatKit server implementation."""

    def __init__(
        self,
        data_store: Store,
    ):
        """Initialize the ChatKit server.

        Args:
            data_store: ChatKit Store for thread/message persistence
        """
        super().__init__(data_store)

        # Initialize agent
        self.assistant_agent = create_assistant_agent()

    async def respond(
        self,
        thread: ThreadMetadata,
        input: UserMessageItem | ClientToolCallItem,
        context: Any,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """Handle incoming user messages.

        Args:
            thread: ChatKit thread metadata
            input: User message or client tool output
            context: Request context (user_id, session, etc.)

        Yields:
            ThreadStreamEvent objects for ChatKit
        """
        try:
            # Extract user message content
            if isinstance(input, UserMessageItem):
                user_message = self._extract_message_content(input.content)
            elif isinstance(input, ClientToolCallItem):
                user_message = f"Tool output: {input.output}"
            else:
                yield ErrorEvent(
                    error_code="unknown_input_type",
                    message=f"Unknown input type: {type(input)}"
                )
                return

            # Load recent thread history for context
            items_page = await self.store.load_thread_items(
                thread.id,
                after=None,
                limit=20,
                order="asc",
                context=context or {},
            )

            # Convert thread items to agent input format
            input_items = await simple_to_agent_input(items_page.data)

            # Create agent context
            agent_context = AgentContext(
                thread=thread,
                store=self.store,
                request_context=context or {}
            )

            logger.info(
                f"Processing message: '{user_message}' "
                f"with {len(input_items)} history items"
            )

            # Run the agent with conversation history
            # CRITICAL: Pass input_items NOT user_message string
            result = Runner.run_streamed(
                self.assistant_agent,
                input_items,  # Full conversation context
                context=agent_context
            )

            # CRITICAL FIX: Generate unique message ID upfront to prevent overwriting
            # The stream_agent_response() helper uses __fake_id__ during streaming,
            # which causes the frontend to update the same message repeatedly.
            # We generate a unique ID now and ensure all events for this response use it.
            import uuid
            unique_message_id = f"assistant_message_{uuid.uuid4().hex[:16]}"
            logger.info(f"Generated unique message ID: {unique_message_id}")

            # Stream the agent response as ChatKit events
            async for event in stream_agent_response(agent_context, result):
                # CRITICAL: Replace __fake_id__ with our unique ID
                # This prevents the frontend from overwriting previous messages
                if hasattr(event, 'item'):
                    item = event.item
                    if hasattr(item, 'id') and item.id == "__fake_id__":
                        # Replace __fake_id__ with our unique ID
                        new_item = item.model_copy(update={"id": unique_message_id})
                        event = event.model_copy(update={"item": new_item})
                        logger.info(f"Replaced __fake_id__ with {unique_message_id} in {type(event).__name__}")

                yield event

            logger.info("Streaming complete")

        except Exception as e:
            logger.error(f"Error in respond: {type(e).__name__}: {str(e)}")
            yield ErrorEvent(
                error_code=type(e).__name__,
                message=str(e)
            )

    def _extract_message_content(self, content: Any) -> str:
        """Extract text content from ChatKit message content.

        Args:
            content: ChatKit message content (text, parts, etc.)

        Returns:
            Extracted text string
        """
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            # Handle multi-part content (text, images, files)
            text_parts = []
            for part in content:
                if isinstance(part, str):
                    text_parts.append(part)
                elif isinstance(part, dict):
                    if part.get("type") == "text":
                        text_parts.append(part.get("text", ""))
            return " ".join(text_parts)
        else:
            return str(content)


# Singleton instance
_chatkit_server: TeamFlowChatKitServer | None = None


def get_chatkit_server() -> TeamFlowChatKitServer:
    """Get or create the singleton ChatKit server instance.

    Returns:
        TeamFlowChatKitServer instance
    """
    global _chatkit_server

    if _chatkit_server is None:
        data_store = MemoryStore()
        _chatkit_server = TeamFlowChatKitServer(data_store=data_store)

    return _chatkit_server
```

#### ⚠️ CRITICAL: Message Overwriting Bug

**Problem**: If you skip the `__fake_id__` replacement step above, you'll encounter a critical bug where AI responses overwrite each other instead of appearing as separate messages.

**Symptoms**:
- First AI response appears correctly
- Second AI response **overwrites** the first instead of appearing below it
- Third AI response overwrites the second
- Chat history restore shows messages correctly (so it's a live streaming issue only)

**Root Cause**: The `stream_agent_response()` helper uses `__fake_id__` as a temporary placeholder during streaming. When multiple messages are sent, they all use the same `__fake_id__`, causing the frontend ChatKit client to update the same message component instead of creating new ones.

**Solution**: The fix shown above (lines 682-704):
1. Generate a unique message ID upfront: `unique_message_id = f"assistant_message_{uuid.uuid4().hex[:16]}"`
2. Intercept events and replace `__fake_id__` with the unique ID using `item.model_copy(update={"id": unique_message_id})`

**Verification**: Test by sending multiple messages and verify each response appears as a new message below previous ones.

### Step 9: Create FastAPI Endpoints

Create `app/main.py`:

```python
"""FastAPI application with ChatKit endpoint."""
from fastapi import FastAPI, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from contextlib import asynccontextmanager

from app.core.config import settings
from app.chatkit.server import get_chatkit_server
from chatkit.server import StreamingResult


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print(f"🚀 Starting ChatKit backend on {settings.host}:{settings.port}")
    print(f"📡 LLM Provider: {settings.llm_provider}")
    print(f"🤖 Model: {settings.model_name}")
    yield
    # Shutdown
    print("👋 Shutting down ChatKit backend")


# Create FastAPI app
app = FastAPI(
    title="ChatKit Backend",
    description="Custom ChatKit backend with OpenAI Agents SDK",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependencies
async def get_user_id(
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
) -> str:
    """Extract user_id from session token.

    In production, validate the JWT token with your auth system.
    For now, return a test user ID.
    """
    # TODO: Implement proper JWT validation
    return "test-user-" + (x_session_token or "default")


# Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "llm_provider": settings.llm_provider,
        "model": settings.model_name,
    }


@app.post("/chatkit")
async def chatkit_endpoint(
    request: Request,
    user_id: str = Depends(get_user_id),
):
    """ChatKit protocol endpoint.

    Handles all ChatKit operations (sessions, messages, actions, etc.)
    via the official ChatKit SDK server.process() method.

    Authentication: X-Session-Token header
    Response Format: application/x-ndjson (NDJSON)

    CRITICAL: ChatKit SDK yields bytes chunks that must be decoded to string.
    The SDK also outputs SSE format (data: {...}) which we transform to NDJSON ({...}).

    Official SDK Source:
    The ChatKit SDK's _process_streaming() method confirms this behavior:
    https://openai.github.io/chatkit-python/api/chatkit/server/

    ```python
    async def _process_streaming(...) -> AsyncGenerator[bytes, None]:
        async for event in self._process_streaming_impl(request, context):
            b = self._serialize(event)
            yield b"data: " + b + b"\n\n"  # ← Yields bytes in SSE format
    ```
    """
    # Get ChatKit server instance
    server = get_chatkit_server()

    # Get the request body as bytes (required by ChatKit SDK)
    payload = await request.body()

    # Pass context with user_id
    context = {
        "user_id": user_id,
        "request": request,
    }

    # Process the request through ChatKit server
    result = await server.process(payload, context)

    # Return appropriate response based on result type
    if isinstance(result, StreamingResult):
        # CRITICAL: Transform SSE format to NDJSON for custom frontend
        # ChatKit SDK yields bytes chunks and outputs SSE format
        async def sse_to_ndjson():
            """Transform ChatKit SSE format (data: {...}\n\n) to NDJSON ({...}\n)"""
            async for chunk in result:
                # CRITICAL: ChatKit SDK yields bytes, not str!
                # Must decode bytes to string before processing
                # Confirmed by official SDK: AsyncGenerator[bytes, None]
                if isinstance(chunk, bytes):
                    chunk = chunk.decode('utf-8')

                # ChatKit SDK outputs SSE format: "data: {...}\n\n"
                # Custom frontend expects NDJSON: "{...}\n"
                for line in chunk.split('\n'):
                    line = line.strip()
                    if not line:
                        continue

                    # Strip "data: " prefix from SSE format
                    if line.startswith('data: '):
                        json_str = line[6:]  # Remove "data: " prefix
                    else:
                        json_str = line

                    # Skip SSE control messages
                    if json_str in ('[DONE]', '', ':'):
                        continue

                    # Validate and output as NDJSON line
                    try:
                        import json
                        json.loads(json_str)  # Validate JSON
                        yield f"{json_str}\n"
                    except json.JSONDecodeError:
                        continue

        return StreamingResponse(
            sse_to_ndjson(),
            media_type="application/x-ndjson",  # NDJSON, not text/event-stream
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )

    # Handle non-streaming responses
    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")

    # Default JSON response
    from fastapi.responses import JSONResponse
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
```

### Step 10: Test the Backend

```bash
# Run the server
uv run uvicorn app.main:app --reload --port 8000

# In another terminal, test health endpoint
curl http://localhost:8000/health

# Expected response:
# {"status":"healthy","llm_provider":"openrouter","model":"mistralai/devstral-2512:free"}
```

---

## Frontend Setup

### Step 1: Install ChatKit React

```bash
cd frontend
npm install @openai/chatkit-react
```

### Step 2: Configure ChatKit Provider

Create `src/components/ChatWidget.tsx`:

```tsx
"use client";

import { ChatKitProvider, MainThread } from "@openai/chatkit-react";
import type { ThreadMetadata } from "@openai/chatkit-react";

const CHATKIT_API_URL = process.env.NEXT_PUBLIC_CHATKIT_URL || "http://localhost:8000";

export function ChatWidget() {
  return (
    <ChatKitProvider
      api={{
        url: CHATKIT_API_URL,
        // Custom headers for authentication
        headers: async () => {
          const token = localStorage.getItem("session_token") || "test-token";
          return {
            "X-Session-Token": token,
          };
        },
      }}
    >
      <MainThread />
    </ChatKitProvider>
  );
}
```

### Step 3: Create Chat Page

Create `src/app/chat/page.tsx` (Next.js App Router):

```tsx
import { ChatWidget } from "@/components/ChatWidget";

export default function ChatPage() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b p-4">
        <h1 className="text-2xl font-bold">AI Assistant</h1>
      </header>
      <main className="flex-1">
        <ChatWidget />
      </main>
    </div>
  );
}
```

---

## Testing

### Manual Testing

1. **Start Backend:**
   ```bash
   cd backend
   uv run uvicorn app.main:app --reload --port 8000
   ```

2. **Start Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test Chat:**
   - Open browser to `http://localhost:3000/chat`
   - Send a message like "Hello!"
   - Verify you get a response
   - Send a follow-up question
   - Verify context is maintained

### Expected Behavior

✅ **Working:**
- Messages send successfully
- Responses stream in real-time
- Conversation history is maintained
- Agent responds to all types of questions (not just greetings)
- **Each AI response appears as a NEW message (critical!)**
- Threads persist across page refreshes (if using persistent storage)

❌ **Not Working - Check Troubleshooting:**
- No response at all
- Only greetings work, not real questions
- Context is lost between messages
- **Messages overwriting each other (see "CRITICAL: Message Overwriting Bug" above)**
- Error messages in console

### Critical Test: Message Overwriting

**Test Steps:**
1. Send message "Hello!"
2. Wait for AI response
3. Send message "What can you do?"
4. Wait for AI response
5. Send message "Tell me a joke"
6. Wait for AI response

**Expected Result:**
```
[User] Hello!
[AI] Hi there! How can I help you today?
[User] What can you do?
[AI] I can help answer questions, provide information, and assist with various tasks.
[User] Tell me a joke
[AI] Why don't scientists trust atoms? Because they make up everything!
```

**If Bug Present:**
```
[User] Hello!
[User] What can you do?
[User] Tell me a joke
[AI] Why don't scientists trust atoms? Because they make up everything!  ← Only last message visible!
```

**Fix**: See "⚠️ CRITICAL: Message Overwriting Bug" section above (or `SKILL.md` Pitfall #9).

---

## Production Checklist

Before deploying to production:

### Security

- [ ] Implement proper JWT validation in `get_user_id()`
- [ ] Use environment variables for all secrets
- [ ] Enable HTTPS only
- [ ] Add rate limiting
- [ ] Sanitize user inputs
- [ ] Add request validation

### Reliability

- [ ] Replace `MemoryStore` with persistent storage (PostgreSQL/MongoDB)
- [ ] Add error logging and monitoring
- [ ] Implement health checks with dependency checks
- [ ] Add graceful shutdown handling
- [ ] Set up database connection pooling
- [ ] Configure retry logic for LLM API calls

### Performance

- [ ] Enable response caching where appropriate
- [ ] Add CDN for static assets
- [ ] Optimize database queries with indexes
- [ ] Add pagination limits
- [ ] Configure timeout values
- [ ] Add compression middleware

### Observability

- [ ] Add structured logging (JSON format)
- [ ] Implement distributed tracing
- [ ] Add metrics collection (Prometheus)
- [ ] Set up alerting for errors
- [ ] Add correlation IDs for request tracking

### Scalability

- [ ] Design for horizontal scaling
- [ ] Add load balancing
- [ ] Use managed database services
- [ ] Configure auto-scaling policies
- [ ] Add geographic redundancy if needed

---

## Next Steps

- **Add Tools**: Integrate MCP tools or custom functions
- **Add RAG**: Implement knowledge base retrieval
- **Add Guardrails**: Implement input/output safety checks
- **Add Analytics**: Track usage and performance
- **Add Multi-Agent**: Implement specialized agents with handoffs

---

## Need Help?

Check the main `SKILL.md` for:
- Common pitfalls and solutions
- Troubleshooting checklist
- Error message guide
