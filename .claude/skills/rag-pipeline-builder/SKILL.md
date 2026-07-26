---
name: rag-pipeline-builder
description: Complete RAG (Retrieval-Augmented Generation) pipeline implementation with document ingestion, vector storage, semantic search, and response generation. Two stacks supported — (A) FastAPI + OpenRouter/OpenAI + Qdrant, and (B) Next.js + Drizzle + Neon pgvector + pluggable embeddings (Jina serverless / ONNX BGE-M3 on a VPS / Gemini). LangChain-free.
category: backend
version: 2.2.0
---

# RAG Pipeline Builder Skill

## Stack variants — pick one first

- **Next.js / Drizzle / Neon pgvector** (recommended when the app is already Next.js + Postgres):
  read [references/nextjs-drizzle-pgvector.md](./references/nextjs-drizzle-pgvector.md). Vectors live
  in Postgres (`vector(N)` + HNSW), retrieval is raw SQL via the `<=>` operator, embeddings are
  provider-pluggable. **Use this variant if your stack is Next.js + Drizzle + Neon.**
- **FastAPI / Qdrant / OpenAI** (this skill's original body, below): standalone Python RAG service.

The FastAPI body below does NOT apply to the Next.js variant — do not introduce Python/Qdrant into a Next.js + Drizzle app.

## ⚠️ Production Lessons Learned (UPDATED)

**CRITICAL:** Read [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) before implementing. Key issues:

1. **Embedding Model Selection**: Use `openai/text-embedding-3-small` (NOT chat models)
   - Free models like `mistralai/devstral-2512:free` do NOT support embeddings
   - Always use dedicated embedding models via OpenRouter

2. **Memory Safety**: Add infinite loop protection in chunking
   - Add `max_iterations` limit to prevent infinite loops
   - Log progress during chunking for debugging

3. **Batch Upserts**: Limit to 100 points per batch for Qdrant
   - Larger batches may cause timeout errors
   - Implement retry logic with exponential backoff

4. **Cross-Platform Paths**: Try Windows, WSL, Linux paths
   - Use `pathlib.Path` for cross-platform compatibility
   - Handle both `/mnt/d/` (WSL) and `D:\` (Windows) formats

5. **Agent SDK Integration**: When using RAG with OpenAI Agents SDK
   - Use `OpenAIChatCompletionsModel` wrapper for OpenRouter
   - Call `set_default_openai_api("chat_completions")` for compatibility
   - Call `set_tracing_disabled(True)` when not using OpenAI

6. **OpenRouter Configuration**:
   ```python
   from openai import AsyncOpenAI
   from agents import OpenAIChatCompletionsModel, set_default_openai_api, set_tracing_disabled

   # Configure for OpenRouter
   set_tracing_disabled(True)
   set_default_openai_api("chat_completions")

   client = AsyncOpenAI(
       base_url="https://openrouter.ai/api/v1",
       api_key=settings.openrouter_api_key,
   )

   # For embeddings - use dedicated embedding model
   response = await client.embeddings.create(
       model="openai/text-embedding-3-small",
       input=texts,
   )
   ```

## Purpose

Quickly scaffold and implement production-ready RAG systems with a **pure, lightweight stack** (No LangChain):
- Intelligent document chunking (Recursive + Markdown aware)
- Vector embeddings generation via OpenRouter (OpenAI-compatible)
- Vector storage and retrieval (Qdrant Client)
- Context-aware response generation
- Streaming API endpoints (FastAPI)

## When to Use This Skill

Use this skill when:
- Building high-performance RAG systems without framework overhead
- Needing full control over the ingestion and retrieval logic
- Implementing semantic search for technical documentation
- Want to use OpenRouter for flexible model access

## Core Capabilities

### 1. Lightweight Document Chunking

Uses a custom `RecursiveTextSplitter` implementation that mimics LangChain's logic but without the dependency bloat.

**Strategy:**
1.  **Protect Code Blocks:** Regex replacement ensures code blocks aren't split in the middle.
2.  **Recursive Splitting:** Splits by paragraphs (`\n\n`), then lines (`\n`), then sentences (`. `) to respect document structure.
3.  **Token Counting:** Uses `tiktoken` for accurate sizing compatible with OpenAI models.

**Implementation Template:**
```python
# See scripts/chunking_example.py for complete implementation

class IntelligentChunker:
    """
    Markdown-aware chunking that preserves structure (LangChain-free)
    """
    def __init__(self, chunk_size=1000, overlap=200):
        # ... (uses standalone RecursiveTextSplitter)
```

### 2. Embedding Generation (OpenRouter + OpenAI SDK)

**IMPORTANT:** Use OpenRouter for flexible model access with OpenAI-compatible API.

```python
from openai import OpenAI

class EmbeddingGenerator:
    def __init__(self, api_key: str):
        # Use OpenRouter as OpenAI-compatible endpoint
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        # Use openai/text-embedding-3-small (1536 dim, $0.02/1M)
        response = await self.client.embeddings.create(
            model="openai/text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]
```

**Model Options:**
- `openai/text-embedding-3-small` - 1536 dim, $0.02/1M (RECOMMENDED)
- `openai/text-embedding-3-large` - 3072 dim, $0.13/1M
- `openai/text-embedding-ada-002` - 1536 dim, $0.10/1M

**Note:** Free models (e.g., `mistralai/devstral-2512:free`) do NOT support embeddings.

### 3. Qdrant Integration (Native Client)

Direct integration with `qdrant-client` for vector operations.

```python
from qdrant_client import QdrantClient

class QdrantManager:
    def upsert_documents(self, documents: list[dict]):
        # Batch upsert logic
        self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )
```

### 4. FastAPI Streaming Endpoints

Native FastAPI streaming response handling.

```python
from fastapi.responses import StreamingResponse

@app.post("/api/v1/chat")
async def chat_endpoint(request: ChatRequest):
    # ... retrieval logic ...
    
    return StreamingResponse(generate(), media_type="text/plain")
```

## Usage Instructions

### 1. Install Dependencies

```bash
pip install openai qdrant-client fastapi uvicorn
```

*(Note: `langchain` is NOT required)*

### 2. Environment Configuration

```bash
# .env file
OPENROUTER_API_KEY=sk-or-v1-...
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-api-key
```

### 3. Ingest Documents

**Recommended:** Use production-tested v2 script
```bash
# With environment variables
export OPENROUTER_API_KEY=sk-or-v1-...
export QDRANT_URL=https://your-cluster.qdrant.io
export QDRANT_API_KEY=your-api-key

python scripts/ingest_documents_v2.py
```

**Original:**
```bash
# Ingest markdown files using the pure-python ingestor
python scripts/ingest_documents.py docs/ --openai-key $OPENAI_API_KEY
```

### 4. Start API Server

```bash
uvicorn templates.fastapi-endpoint-template:app --reload
```

## Performance Benefits

Removing LangChain provides:
- **Faster Startup:** Reduced import overhead.
- **Smaller Docker Image:** Significantly fewer dependencies.
- **Easier Debugging:** No complex abstraction layers or "Chains" to trace through.
- **Stable API:** You own the logic, immune to framework breaking changes.

## Output Format

When this skill is invoked, provide:
1. **Production Lessons**: Reference [LESSONS_LEARNED.md](./LESSONS_LEARNED.md)
2. **Complete Pipeline Code** (LangChain-free, with safety checks)
3. **Configuration File** (.env.example with OPENROUTER_API_KEY)
4. **Ingestion Script** (scripts/ingest_documents_v2.py recommended)
5. **FastAPI Endpoints** (templates/fastapi-endpoint-template.py)
6. **Testing Script** (scripts/test_rag.py)

## Time Savings

**With this skill:** ~30 minutes to generate a production-ready, battle-tested RAG pipeline without framework lock-in.

## Production Checklist

- [ ] Read [LESSONS_LEARNED.md](./LESSONS_LEARNED.md)
- [ ] Set up OpenRouter API key
- [ ] Configure Qdrant Cloud credentials
- [ ] Test embedding model with single request
- [ ] Use ingest_documents_v2.py for ingestion
- [ ] Verify chunk counts and dimensions
- [ ] Test semantic search with sample queries