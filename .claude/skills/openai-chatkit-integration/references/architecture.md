# Custom ChatKit Architecture

This document explains the architecture for running OpenAI ChatKit with a custom backend, bypassing OpenAI's hosted inference services to use alternative LLMs (like Gemini) and custom RAG pipelines.

## High-Level Overview

```mermaid
graph LR
    User[User (Browser)] -- ChatKit JS --> Backend[FastAPI Server]
    Backend -- Search --> VectorDB[Qdrant Cloud]
    Backend -- Prompt + Context --> LLM[Gemini / OpenRouter]
    LLM -- Stream Response --> Backend
    Backend -- SSE Stream --> User
```

## Components

### 1. Frontend (ChatKit JS)
*   **Library**: `@openai/chatkit-react`
*   **Configuration**: Configured in "Advanced Mode" by setting `api.url` to your custom backend URL instead of using a `clientSecret` from OpenAI.
*   **Role**: Handles UI rendering, message history display, and user input. It acts as a dumb terminal that syncs state with your backend.

### 2. Backend (FastAPI + ChatKit Python)
*   **Library**: `openai-chatkit` (Python SDK)
*   **Role**:
    *   **Session Management**: Creates and validates user sessions.
    *   **Orchestration**: Receives user messages, orchestrates the RAG process, and calls the LLM.
    *   **Streaming**: Converts LLM output into ChatKit-compatible Server-Sent Events (SSE).
*   **Endpoint**: `/chatkit/respond` - The main entry point for message processing.

### 3. Logic Layer (OpenAI Agents SDK)
*   **Library**: `agents` (OpenAI Agents SDK)
*   **Role**: Defines the agent's behavior, instructions, and tools.
*   **Adaptation**: Uses `AsyncOpenAI` client with a custom `base_url` to direct requests to non-OpenAI providers (like Google Gemini or OpenRouter) while maintaining the Agents SDK's convenient abstraction.

### 4. Knowledge Base (Qdrant)
*   **Role**: Stores vector embeddings of your domain documents.
*   **Integration**: Accessed by the Backend during the `respond` phase to retrieve relevant context before invoking the Agent.

## Data Flow (Request/Response)

1.  **Init**: Frontend requests a session token from `POST /chatkit/sessions`.
2.  **Connect**: Frontend initializes `ChatKitProvider` with the token and custom API URL.
3.  **Message**: User types a message. Frontend sends `POST /chatkit/respond` with the message content.
4.  **Process**:
    *   Backend receives message.
    *   Backend embeds message text.
    *   Backend searches Qdrant for top-k matches.
    *   Backend constructs a prompt with Context + Query.
    *   Backend initializes an Agent with the Gemini model.
5.  **Stream**:
    *   Backend runs the Agent.
    *   Agent yields chunks of text.
    *   Backend wraps chunks in ChatKit protocol events.
    *   Frontend receives events and updates the UI in real-time.

## Key Advantages

*   **Privacy**: Data never hits OpenAI servers (if using local/other LLMs).
*   **Cost**: Use cheaper or specialized models (Gemini Flash, Llama 3).
*   **Control**: Full control over the retrieval logic and prompt construction.
*   **UI/UX**: Benefit from ChatKit's polished UI without being locked into the backend ecosystem.
