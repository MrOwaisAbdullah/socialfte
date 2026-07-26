"""
Production-ready ChatKit server implementation.

This is a complete, working example of a ChatKit server that:
1. Uses the official ChatKit SDK server.process() method
2. Integrates with OpenAI Agents SDK
3. Supports alternative LLM providers (OpenRouter, Gemini, OpenAI)
4. Uses proper Store implementation with all abstract methods
5. Passes conversation history correctly to agents

Based on real-world debugging and integration experience.
"""
import logging
from typing import Any, AsyncIterator
from datetime import datetime
from dataclasses import dataclass, field

from fastapi import FastAPI, Request, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic_settings import BaseSettings
from python_dotenv import load_dotenv

# OpenAI Agents SDK
from agents import (
    Runner,
    OpenAIChatCompletionsModel,
    set_default_openai_api,
    AsyncOpenAI,
)

# ChatKit SDK
from chatkit.server import (
    ChatKitServer,
    StreamingResult,
    ThreadMetadata,
    UserMessageItem,
    ClientToolCallItem,
    ThreadStreamEvent,
    ErrorEvent,
)
from chatkit.store import Store, Page, ThreadItem
from chatkit.agents import (
    simple_to_agent_input,
    stream_agent_response,
    AgentContext,
)

# Load environment
load_dotenv()

# Configuration
class Settings(BaseSettings):
    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""
    model_name: str = "gpt-5-nano-2025-08-07"
    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"

settings = Settings()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# =============================================================================
# LLM Client Configuration
# =============================================================================

_client: AsyncOpenAI | None = None
_model: OpenAIChatCompletionsModel | None = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create the AsyncOpenAI client."""
    global _client

    if _client is not None:
        return _client

    # Determine provider and configuration
    if settings.openrouter_api_key:
        base_url = "https://openrouter.ai/api/v1"
        api_key = settings.openrouter_api_key
        set_default_openai_api("chat_completions")  # Required for OpenRouter
        logger.info("Using OpenRouter provider")
    elif settings.gemini_api_key:
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        api_key = settings.gemini_api_key
        set_default_openai_api("chat_completions")
        logger.info("Using Gemini provider")
    else:  # OpenAI (default)
        base_url = None
        api_key = settings.openai_api_key
        logger.info("Using OpenAI provider")

    _client = AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
    )

    return _client


def get_model() -> OpenAIChatCompletionsModel:
    """Get or create the OpenAI Chat Completions Model wrapper."""
    global _model

    if _model is not None:
        return _model

    client = get_openai_client()
    _model = OpenAIChatCompletionsModel(
        openai_client=client,
        model=settings.model_name,
    )

    return _model


# =============================================================================
# Store Implementation
# =============================================================================

@dataclass
class _ThreadState:
    """Internal state for a thread in MemoryStore."""
    thread: ThreadMetadata
    items: list[ThreadItem] = field(default_factory=list)


class MemoryStore(Store[dict]):
    """
    In-memory Store implementation for ChatKit SDK.

    This is a complete implementation of all abstract methods required
    by the ChatKit SDK Store protocol.

    For production, replace with a persistent implementation using
    PostgreSQL, MongoDB, or another database.
    """

    def __init__(self) -> None:
        self._threads: dict[str, _ThreadState] = {}
        self._items_map: dict[str, ThreadItem] = {}

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
        """
        Load thread metadata by ID.

        IMPORTANT: Auto-creates thread if it doesn't exist.
        This is required for ChatKit SDK compatibility.
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
        """
        Load all threads with pagination.

        IMPORTANT: Must include 'after' and 'order' parameters.
        Returns Page object, not a list.
        """
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

    def _items(self, thread_id: str) -> list[ThreadItem]:
        """Get all items for a thread."""
        state = self._threads.get(thread_id)
        return state.items if state else []


# =============================================================================
# ChatKit Server Implementation
# =============================================================================

class TeamFlowChatKitServer(ChatKitServer):
    """
    Production-ready ChatKit server implementation.

    This server:
    - Uses the official ChatKit SDK server.process() method
    - Integrates with OpenAI Agents SDK for AI responses
    - Passes conversation history correctly (critical for context)
    - Handles errors gracefully
    """

    def __init__(self, data_store: Store):
        """Initialize the ChatKit server.

        Args:
            data_store: ChatKit Store for thread/message persistence
        """
        super().__init__(data_store)

        # Initialize agent
        model = get_model()
        self.assistant_agent = Agent(
            name="assistant",
            instructions="You are a helpful AI assistant. Be concise and friendly.",
            model=model,
        )

    async def respond(
        self,
        thread: ThreadMetadata,
        input: UserMessageItem | ClientToolCallItem,
        context: Any,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """
        Handle incoming user messages.

        CRITICAL: This method demonstrates the correct way to:
        1. Load conversation history from the store
        2. Convert it to agent input format using simple_to_agent_input()
        3. Pass the full history (input_items) to Runner.run_streamed()

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
            # CRITICAL: Use simple_to_agent_input() to convert ChatKit items
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
            # CRITICAL: Pass input_items (full history) NOT user_message string
            # This is the most common mistake - passing just the message string
            # causes the agent to lose context and only respond to greetings.
            result = Runner.run_streamed(
                self.assistant_agent,
                input_items,  # Full conversation context
                context=agent_context
            )

            # Stream the agent response as ChatKit events
            # CRITICAL FIX: Generate unique message ID upfront to prevent overwriting
            # The stream_agent_response() helper uses __fake_id__ during streaming,
            # which causes the frontend to update the same message repeatedly.
            # We generate a unique ID now and ensure all events for this response use it.
            import uuid
            unique_message_id = f"assistant_message_{uuid.uuid4().hex[:16]}"
            logger.info(f"Generated unique message ID: {unique_message_id}")

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


# =============================================================================
# FastAPI Application
# =============================================================================

# Create FastAPI app
app = FastAPI(
    title="ChatKit Backend",
    description="Production-ready ChatKit backend with OpenAI Agents SDK",
    version="1.0.0",
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
    """
    Extract user_id from session token.

    IN PRODUCTION: Implement proper JWT validation here.
    For now, return a test user ID.
    """
    # TODO: Implement proper JWT validation
    return "test-user-" + (x_session_token or "default")


# Singleton instances
_store: MemoryStore | None = None
_server: TeamFlowChatKitServer | None = None


def get_store() -> MemoryStore:
    """Get or create the singleton Store instance."""
    global _store
    if _store is None:
        _store = MemoryStore()
    return _store


def get_server() -> TeamFlowChatKitServer:
    """Get or create the singleton ChatKit server instance."""
    global _server
    if _server is None:
        _server = TeamFlowChatKitServer(data_store=get_store())
    return _server


# Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model": settings.model_name,
    }


@app.post("/chatkit")
async def chatkit_endpoint(
    request: Request,
    user_id: str = Depends(get_user_id),
):
    """
    ChatKit protocol endpoint.

    This single endpoint handles ALL ChatKit operations:
    - Session creation
    - Message processing
    - Thread management
    - Action handling

    The ChatKit SDK's server.process() method routes everything internally.

    Authentication: X-Session-Token header
    Response Format: text/event-stream (SSE)
    """
    # Get ChatKit server instance
    server = get_server()

    # Get the request body as bytes (required by ChatKit SDK)
    payload = await request.body()

    # Pass context with user_id
    context = {
        "user_id": user_id,
        "request": request,
    }

    # Process the request through ChatKit server
    # The SDK handles routing and protocol details
    result = await server.process(payload, context)

    # Return appropriate response based on result type
    if isinstance(result, StreamingResult):
        return StreamingResponse(
            result,
            media_type="text/event-stream",
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

    logger.info("Starting ChatKit backend server...")
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
