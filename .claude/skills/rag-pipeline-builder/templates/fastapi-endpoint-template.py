#!/usr/bin/env python3
"""
FastAPI RAG Endpoint Template

This template provides production-ready FastAPI endpoints for RAG systems
with streaming responses, error handling, and performance monitoring.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, AsyncGenerator
import asyncio
import time
import json
import logging
from contextlib import asynccontextmanager

# Import RAG components (adjust imports as needed)
import openai
from openai import AsyncOpenAI
import qdrant_client
from qdrant_client import QdrantClient
from qdrant_client.models import Filter


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Request/Response Models
class ChatRequest(BaseModel):
    message: str = Field(..., description="User message to process")
    context: Dict[str, Any] = Field(default_factory=dict, description="Additional context")
    selected_text: Optional[str] = Field(None, description="Text selected by user")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of chunks to retrieve")
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0, description="Minimum similarity score")
    filters: Optional[Dict[str, Any]] = Field(None, description="Search filters")


class ChatChunk(BaseModel):
    content: str
    done: bool = False
    metadata: Optional[Dict[str, Any]] = None


class IngestRequest(BaseModel):
    file_paths: List[str] = Field(..., description="Paths to files to ingest")
    chunk_size: int = Field(default=1000, ge=100, le=4000, description="Chunk size in tokens")
    chunk_overlap: int = Field(default=200, ge=0, le=1000, description="Overlap between chunks")


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    components: Dict[str, str]


# Global variables for RAG components
class RAGComponents:
    def __init__(self):
        self.embedder: Optional[AsyncOpenAI] = None
        self.qdrant: Optional[QdrantClient] = None
        self.generator: Optional[AsyncOpenAI] = None
        self.collection_name: str = "document_chunks"


rag_components = RAGComponents()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for FastAPI app."""
    # Startup
    logger.info("🚀 Starting RAG API server...")
    await initialize_rag_components()
    logger.info("✅ RAG components initialized")

    yield

    # Shutdown
    logger.info("🛑 Shutting down RAG API server...")


# Create FastAPI app
app = FastAPI(
    title="RAG API",
    description="Retrieval-Augmented Generation API with streaming responses",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def initialize_rag_components():
    """Initialize RAG components with configuration from environment."""
    import os

    # Initialize OpenAI clients
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise ValueError("OPENAI_API_KEY environment variable is required")

    rag_components.embedder = AsyncOpenAI(api_key=openai_key)
    rag_components.generator = AsyncOpenAI(api_key=openai_key)

    # Initialize Qdrant client
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    qdrant_key = os.getenv("QDRANT_API_KEY")

    rag_components.qdrant = QdrantClient(url=qdrant_url, api_key=qdrant_key)
    rag_components.collection_name = os.getenv("QDRANT_COLLECTION", "document_chunks")

    logger.info(f"📊 Connected to Qdrant at {qdrant_url}")
    logger.info(f"📚 Using collection: {rag_components.collection_name}")


async def embed_query(query: str) -> List[float]:
    """Embed a query using OpenAI."""
    if not rag_components.embedder:
        raise HTTPException(status_code=503, detail="Embedding service not initialized")

    try:
        response = await rag_components.embedder.embeddings.create(
            model=os.getenv("OPENAI_MODEL", "text-embedding-3-small"),
            input=[query],
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"❌ Error embedding query: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")


async def search_relevant_chunks(
    query_embedding: List[float],
    top_k: int = 5,
    similarity_threshold: float = 0.7,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Search for relevant chunks in Qdrant."""
    if not rag_components.qdrant:
        raise HTTPException(status_code=503, detail="Search service not initialized")

    try:
        # Build filter if provided
        query_filter = None
        if filters:
            query_filter = Filter(
                must=[{"key": k, "match": {"value": v}} for k, v in filters.items()]
            )

        results = rag_components.qdrant.search(
            collection_name=rag_components.collection_name,
            query_vector=query_embedding,
            limit=top_k * 2,  # Fetch more to allow for deduplication
            score_threshold=similarity_threshold,
            query_filter=query_filter,
        )

        # Deduplicate results based on text content
        seen_texts = set()
        unique_results = []
        for hit in results:
            if hit.payload["text"] not in seen_texts:
                seen_texts.add(hit.payload["text"])
                unique_results.append({
                    "text": hit.payload["text"],
                    "score": hit.score,
                    "file_name": hit.payload.get("file_name", ""),
                    "title": hit.payload.get("title", ""),
                    "chunk_index": hit.payload.get("chunk_index", 0),
                })
                
                if len(unique_results) >= top_k:
                    break

        return unique_results

    except Exception as e:
        logger.error(f"❌ Error searching chunks: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


async def generate_streaming_response(
    query: str,
    context_chunks: List[Dict[str, Any]],
    selected_text: Optional[str] = None,
    max_tokens: int = 500
) -> AsyncGenerator[str, None]:
    """Generate a streaming response using OpenAI."""
    if not rag_components.generator:
        raise HTTPException(status_code=503, detail="Generation service not initialized")

    try:
        # Build context
        context = "\n\n---\n\n".join([
            f"From {chunk['file_name']} (relevance: {chunk['score']:.3f}):\n{chunk['text']}"
            for chunk in context_chunks
        ])

        # Add selected text if provided
        if selected_text:
            context = f"User selected text: {selected_text}\n\n---\n\n{context}"

        prompt = f"""Using the following context, answer the user's question. Be helpful and concise. If the context doesn't contain enough information, say so.

Context:
{context}

Question: {query}

Answer:"""

        response = await rag_components.generator.chat.completions.create(
            model=os.getenv("OPENAI_GENERATION_MODEL", "gpt-4.1-nano"),
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that answers questions based on the provided context. Be accurate and cite your sources when possible."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=max_tokens,
            temperature=0.1,
            stream=True,
        )

        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        logger.error(f"❌ Error generating response: {e}")
        yield f"\n\nError generating response: {str(e)}"


# API Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    from datetime import datetime

    components = {
        "embedder": "ready" if rag_components.embedder else "not initialized",
        "qdrant": "ready" if rag_components.qdrant else "not initialized",
        "generator": "ready" if rag_components.generator else "not initialized",
    }

    try:
        if rag_components.qdrant:
            rag_components.qdrant.get_collection(rag_components.collection_name)
            components["qdrant_collection"] = "found"
        else:
            components["qdrant_collection"] = "client not ready"
    except Exception as e:
        components["qdrant_collection"] = f"error: {str(e)}"

    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow().isoformat(),
        components=components
    )


@app.post("/api/v1/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Streaming chat endpoint with RAG.

    This endpoint:
    1. Embeds the user's query
    2. Retrieves relevant document chunks
    3. Generates a streaming response using the context
    """
    try:
        logger.info(f"📝 Processing query: {request.message[:100]}...")

        start_time = time.time()

        # Step 1: Embed query
        query_embedding = await embed_query(request.message)

        # Step 2: Retrieve relevant chunks
        retrieved_chunks = await search_relevant_chunks(
            query_embedding=query_embedding,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold,
            filters=request.filters
        )

        retrieval_time = time.time() - start_time
        logger.info(f"🔍 Retrieved {len(retrieved_chunks)} chunks in {retrieval_time:.3f}s")

        # Step 3: Generate streaming response
        async def generate():
            metadata = {
                "retrieved_chunks": len(retrieved_chunks),
                "retrieval_time": retrieval_time,
                "chunks": [
                    {
                        "file_name": chunk["file_name"],
                        "score": chunk["score"],
                        "preview": chunk["text"][:100] + "..."
                    }
                    for chunk in retrieved_chunks
                ]
            }

            # Send metadata as first chunk
            yield f"data: {json.dumps({'metadata': metadata, 'content': '', 'done': False})}\n\n"

            # Stream response
            async for content in generate_streaming_response(
                query=request.message,
                context_chunks=retrieved_chunks,
                selected_text=request.selected_text
            ):
                chunk_data = {
                    'content': content,
                    'done': False,
                    'metadata': None
                }
                yield f"data: {json.dumps(chunk_data)}\n\n"

            # Send completion signal
            total_time = time.time() - start_time
            completion_data = {
                'content': '',
                'done': True,
                'metadata': {'total_time': total_time}
            }
            yield f"data: {json.dumps(completion_data)}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Content-Type": "text/event-stream",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/v1/search")
async def search_endpoint(
    query: str,
    top_k: int = 5,
    similarity_threshold: float = 0.7,
    filters: Optional[Dict[str, Any]] = None
):
    """
    Search endpoint for retrieving relevant chunks without generation.
    Useful for testing retrieval performance.
    """
    try:
        # Embed query
        query_embedding = await embed_query(query)

        # Search for chunks
        chunks = await search_relevant_chunks(
            query_embedding=query_embedding,
            top_k=top_k,
            similarity_threshold=similarity_threshold,
            filters=filters
        )

        return {
            "query": query,
            "retrieved_chunks": chunks,
            "total_chunks": len(chunks)
        }

    except Exception as e:
        logger.error(f"❌ Error in search endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/api/v1/stats")
async def stats_endpoint():
    """Get statistics about the RAG system."""
    try:
        if not rag_components.qdrant:
            raise HTTPException(status_code=503, detail="Qdrant client not initialized")

        # Get collection info
        collection_info = rag_components.qdrant.get_collection(rag_components.collection_name)

        return {
            "collection_name": rag_components.collection_name,
            "points_count": collection_info.points_count,
            "vector_size": collection_info.config.params.vectors.size,
            "distance": collection_info.config.params.vectors.distance.value,
        }

    except Exception as e:
        logger.error(f"❌ Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=f"Stats failed: {str(e)}")


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    logger.error(f"HTTP {exc.status_code}: {exc.detail}")
    return {
        "error": True,
        "status_code": exc.status_code,
        "detail": exc.detail
    }


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return {
        "error": True,
        "status_code": 500,
        "detail": "Internal server error"
    }


# Main execution
if __name__ == "__main__":
    import uvicorn

    # Run the server
    uvicorn.run(
        "fastapi-endpoint-template:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )