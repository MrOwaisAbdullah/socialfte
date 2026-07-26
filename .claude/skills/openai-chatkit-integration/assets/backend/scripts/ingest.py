import os
import asyncio
import argparse
from qdrant_client import QdrantClient
from qdrant_client.http import models
from dotenv import load_dotenv

# Import from our local utils derived from rag-pipeline-builder
from rag_utils import IntelligentChunker, EmbeddingGenerator

load_dotenv()

async def ingest_documents(collection_name: str, documents: list[str]):
    url = os.getenv("QDRANT_URL")
    api_key = os.getenv("QDRANT_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY") # Needed for embeddings
    
    if not url or not api_key:
        print("Error: QDRANT_URL and QDRANT_API_KEY required.")
        return
    if not openai_key:
        print("Error: OPENAI_API_KEY required for embedding generation.")
        return

    # Initialize Components
    qdrant = QdrantClient(url=url, api_key=api_key)
    chunker = IntelligentChunker(chunk_size=500, overlap=50)
    embedder = EmbeddingGenerator(api_key=openai_key)

    # 1. Chunking
    print("Chunking documents...")
    all_chunks = []
    for i, doc in enumerate(documents):
        metadata = {"source": f"doc_{i}", "file_name": "sample.txt"}
        chunks = chunker.chunk_document(doc, metadata)
        all_chunks.extend(chunks)

    # 2. Embedding
    print(f"Generating embeddings for {len(all_chunks)} chunks...")
    texts = [c.text for c in all_chunks]
    embeddings = await embedder.embed_batch(texts)

    # 3. Storage
    print(f"Uploading to Qdrant collection: {collection_name}...")
    qdrant.recreate_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(
            size=1536, # text-embedding-3-small dimension
            distance=models.Distance.COSINE
        )
    )
    
    points = [
        models.PointStruct(
            id=idx,
            vector=vector,
            payload={
                "text": chunk.text,
                "token_count": chunk.token_count,
                **chunk.metadata
            }
        )
        for idx, (chunk, vector) in enumerate(zip(all_chunks, embeddings))
    ]

    qdrant.upsert(
        collection_name=collection_name,
        points=points
    )
    print("Ingestion complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default="document_chunks")
    args = parser.parse_args()

    sample_docs = [
        "OpenAI ChatKit is a UI framework for building chat apps.",
        "RAG (Retrieval-Augmented Generation) improves LLM accuracy by providing context.",
        "Qdrant is a high-performance vector database optimized for AI applications."
    ]
    
    asyncio.run(ingest_documents(args.collection, sample_docs))