# ChatKit Protocol Reference

Complete reference for the ChatKit SDK protocol between frontend and backend.

## Overview

The ChatKit Python SDK handles all protocol details internally. You use `server.process()` to handle requests, and the SDK manages routing, event streaming, and state management.

## Single Endpoint Pattern

**Important:** ChatKit uses a **single endpoint** (`/chatkit`) for ALL operations:
- Session creation
- Message sending
- Thread management
- Actions/commands
- State synchronization

The SDK's `server.process()` method routes everything internally based on the request payload.

## Request Format

### Raw Request Body

The ChatKit SDK expects the **raw request body as bytes**, not parsed JSON:

```python
# CORRECT - Get raw bytes
payload = await request.body()

# WRONG - Don't parse as JSON first
body = await request.json()  # ❌ This breaks the SDK
```

### Context Object

Pass a context dict with user information:

```python
context = {
    "user_id": "user-123",
    "session": session_data,
    "request": request,  # Optional: FastAPI request object
}
```

## Response Format

### StreamingResponse (SSE)

Most responses use Server-Sent Events:

```python
from fastapi.responses import StreamingResponse
from chatkit.server import StreamingResult

result = await server.process(payload, context)

if isinstance(result, StreamingResult):
    return StreamingResponse(
        result,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
```

### JSON Response

Some operations return JSON:

```python
if hasattr(result, "json"):
    return Response(content=result.json, media_type="application/json")
```

## Store Protocol

Your custom Store must implement these methods:

### Thread Methods

```python
async def save_thread(self, thread: ThreadMetadata, context: dict) -> None:
    """Save or update thread metadata."""

async def load_thread(
    self,
    thread_id: str,
    context: dict,
) -> ThreadMetadata | None:
    """
    Load thread by ID.

    CRITICAL: Auto-create thread if it doesn't exist.
    ChatKit SDK expects this behavior.
    """

async def load_threads(
    self,
    context: dict,
    limit: int = 100,
    after: str | None = None,  # REQUIRED
    order: str = "desc",       # REQUIRED
) -> Page[ThreadMetadata]:
    """
    List threads with pagination.

    CRITICAL: Must return Page object, not list.
    """

async def delete_thread(self, thread_id: str, context: dict) -> None:
    """Delete a thread."""
```

### Item (Message) Methods

```python
async def add_thread_item(
    self,
    thread_id: str,
    item: ThreadItem,
    context: dict,
) -> None:
    """Add an item to a thread."""

async def save_item(self, item: ThreadItem, context: dict) -> None:
    """Update an existing item."""

async def load_thread_items(
    self,
    thread_id: str,
    after: str | None,
    limit: int,
    order: str,
    context: dict,
) -> Page[ThreadItem]:
    """Load items for a thread with pagination."""

async def load_item(
    self,
    item_id: str,
    context: dict,
) -> ThreadItem | None:
    """Load an item by ID."""

async def delete_thread_item(
    self,
    thread_id: str,
    item_id: str,
    context: dict,
) -> None:
    """Delete an item from a thread."""
```

### ID Generation Methods

```python
def generate_item_id(
    self,
    item_type: str,
    thread: ThreadMetadata,
    context: dict,
) -> str:
    """Generate a unique item ID."""

def generate_thread_id(self, context: dict) -> str:
    """Generate a unique thread ID."""
```

### Attachment Methods (Optional)

```python
async def save_attachment(self, attachment, context: dict) -> None:
    """Save an attachment (optional)."""

async def load_attachment(
    self,
    attachment_id: str,
    context: dict,
):
    """Load an attachment (optional)."""

async def delete_attachment(
    self,
    attachment_id: str,
    context: dict,
) -> None:
    """Delete an attachment (optional)."""
```

## Server Protocol

Your ChatKitServer subclass must implement:

```python
from chatkit.server import ChatKitServer
from chatkit.agents import AgentContext, stream_agent_response, simple_to_agent_input

class MyServer(ChatKitServer):
    async def respond(
        self,
        thread: ThreadMetadata,
        input: UserMessageItem | ClientToolCallItem,
        context: Any,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """
        Handle user messages.

        CRITICAL Implementation Pattern:
        1. Load conversation history from store
        2. Convert to agent input with simple_to_agent_input()
        3. Pass input_items (NOT user_message) to Runner.run_streamed()
        4. Stream events with stream_agent_response()
        """
        # Load history
        items_page = await self.store.load_thread_items(
            thread.id,
            after=None,
            limit=20,
            order="asc",
            context=context or {},
        )

        # Convert to agent input
        input_items = await simple_to_agent_input(items_page.data)

        # Create agent context
        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context or {}
        )

        # Run agent with history
        result = Runner.run_streamed(
            self.assistant_agent,
            input_items,  # ✅ Full conversation context
            context=agent_context
        )

        # Stream events
        async for event in stream_agent_response(agent_context, result):
            yield event
```

## Event Types

The ChatKit SDK handles these event types automatically:

- **ResponseTextItem**: Streamed text chunks
- **ErrorEvent**: Error messages
- **SourceEvent**: Citation sources (for RAG)

You don't manually create these - `stream_agent_response()` handles it.

## Authentication

### Frontend Configuration

```tsx
<ChatKitProvider
  api={{
    url: "http://localhost:8000/chatkit",
    headers: async () => {
      const token = localStorage.getItem("session_token");
      return {
        "X-Session-Token": token || "default",
      };
    },
  }}
>
  <MainThread />
</ChatKitProvider>
```

### Backend Validation

```python
from fastapi import Header

async def get_user_id(
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
) -> str:
    """Extract and validate user_id from session token."""
    # TODO: Implement proper JWT validation
    return "user-" + (x_session_token or "default")
```

## Common Mistakes

### ❌ Parsing JSON before passing to SDK

```python
# WRONG
body = await request.json()
result = await server.process(body, context)
```

**Solution:**
```python
# CORRECT
payload = await request.body()  # Raw bytes
result = await server.process(payload, context)
```

### ❌ Returning wrong response type

```python
# WRONG
return JSONResponse({"result": result})
```

**Solution:**
```python
# CORRECT
if isinstance(result, StreamingResult):
    return StreamingResponse(result, media_type="text/event-stream")
```

### ❌ Missing pagination parameters

```python
# WRONG
async def load_threads(self, context, limit) -> Page:
    ...
```

**Solution:**
```python
# CORRECT
async def load_threads(
    self,
    context,
    limit,
    after: str | None = None,  # REQUIRED
    order: str = "desc",       # REQUIRED
) -> Page:
    ...
```

## FastAPI Integration Example

Complete working endpoint:

```python
from fastapi import FastAPI, Request, Depends
from fastapi.responses import StreamingResponse, Response
from chatkit.server import StreamingResult

app = FastAPI()

@app.post("/chatkit")
async def chatkit_endpoint(
    request: Request,
    user_id: str = Depends(get_user_id),
):
    """Single ChatKit endpoint for all operations."""
    # Get server instance
    server = get_chatkit_server()

    # Get raw request body
    payload = await request.body()

    # Prepare context
    context = {
        "user_id": user_id,
        "request": request,
    }

    # Process request
    result = await server.process(payload, context)

    # Return appropriate response
    if isinstance(result, StreamingResult):
        return StreamingResponse(
            result,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )

    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")

    return JSONResponse(result)
```

## Data Models

### ThreadMetadata

```python
from chatkit.server import ThreadMetadata
from datetime import datetime

thread = ThreadMetadata(
    id="thread_abc123",
    title="My Chat",
    created_at=datetime.utcnow(),
    metadata={
        "user_id": "user-123",
        "custom_field": "value",
    },
)
```

### ThreadItem

```python
from chatkit.store import ThreadItem
from datetime import datetime

item = ThreadItem(
    id="item_xyz789",
    role="user",  # or "assistant", "system"
    content=[{"type": "text", "text": "Hello!"}],
    created_at=datetime.utcnow(),
)
```

### Page

```python
from chatkit.store import Page

page = Page(
    data=[thread1, thread2, thread3],
    has_more=True,
    after=thread3.id,
)
```

## Next Steps

- See **IMPLEMENTATION_GUIDE.md** for complete setup
- See **LEARNINGS.md** for common pitfalls
- See **SKILL.md** for troubleshooting checklist
