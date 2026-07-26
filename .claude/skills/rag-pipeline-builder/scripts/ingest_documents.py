#!/usr/bin/env python3
"""
Document Ingestion Script for RAG Systems

This script processes markdown files, chunks them, generates embeddings,
and stores them in Qdrant for retrieval in RAG systems.
"""

import asyncio
import os
import sys
from pathlib import Path
from typing import List, Dict, Any
import argparse
import json
from dataclasses import dataclass

# Add the current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from chunking_example import IntelligentChunker, DocumentChunk
import qdrant_client
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter
import openai
from openai import AsyncOpenAI


@dataclass
class RAGConfig:
    """Configuration for RAG pipeline."""
    openai_api_key: str
    qdrant_url: str
    qdrant_api_key: str
    collection_name: str = "document_chunks"
    embedding_model: str = "text-embedding-3-small"
    chunk_size: int = 1000
    chunk_overlap: int = 200


class EmbeddingGenerator:
    """Handles embedding generation with rate limiting and batching."""

    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def embed_batch(
        self,
        texts: List[str],
        batch_size: int = 100
    ) -> List[List[float]]:
        """
        Embed multiple texts with batching and rate limiting.

        Args:
            texts: List of texts to embed
            batch_size: Number of texts to process in each batch

        Returns:
            List of embedding vectors
        """
        all_embeddings = []
        total_batches = (len(texts) + batch_size - 1) // batch_size

        print(f"🔄 Generating embeddings for {len(texts)} texts in {total_batches} batches...")

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_num = i // batch_size + 1

            try:
                print(f"  📦 Processing batch {batch_num}/{total_batches} ({len(batch)} texts)...")

                response = await self.client.embeddings.create(
                    model=self.model,
                    input=batch,
                )

                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)

                # Rate limiting (3000 RPM for tier 1)
                await asyncio.sleep(0.02)

                print(f"  ✅ Batch {batch_num} completed")

            except Exception as e:
                print(f"  ❌ Batch {batch_num} failed: {e}")
                raise

        print(f"🎉 All embeddings generated successfully!")
        return all_embeddings


class QdrantManager:
    """Manages Qdrant collections and operations."""

    def __init__(self, url: str, api_key: str, collection_name: str):
        self.client = QdrantClient(url=url, api_key=api_key)
        self.collection_name = collection_name

    def create_collection(self, vector_size: int = 1536):
        """
        Create Qdrant collection with optimal settings.

        Args:
            vector_size: Dimension of embedding vectors
        """
        print(f"🔧 Creating collection '{self.collection_name}'...")

        try:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=Distance.COSINE,
                ),
                optimizers_config={
                    "default_segment_number": 2,
                },
                payload_schema={
                    "file_path": {"type": "keyword"},
                    "file_name": {"type": "keyword"},
                    "title": {"type": "text"},
                    "sections": {"type": "keyword"},
                }
            )
            print(f"✅ Collection '{self.collection_name}' created successfully")
        except Exception as e:
            if "already exists" in str(e):
                print(f"ℹ️  Collection '{self.collection_name}' already exists")
            else:
                raise

    def upsert_chunks(self, chunks: List[DocumentChunk], embeddings: List[List[float]]):
        """
        Store document chunks with their embeddings.

        Args:
            chunks: List of DocumentChunk objects
            embeddings: List of embedding vectors
        """
        print(f"💾 Storing {len(chunks)} chunks in Qdrant...")

        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point = PointStruct(
                id=i,
                vector=embedding,
                payload={
                    "text": chunk.text,
                    "file_path": chunk.metadata.get("file_path", ""),
                    "file_name": chunk.metadata.get("file_name", ""),
                    "title": chunk.metadata.get("title", ""),
                    "sections": chunk.metadata.get("sections", []),
                    "chunk_index": chunk.chunk_index,
                    "token_count": chunk.token_count,
                },
            )
            points.append(point)

        # Batch upsert
        batch_size = 100
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            self.client.upsert(
                collection_name=self.collection_name,
                points=batch,
            )

        print(f"✅ Successfully stored {len(points)} chunks in Qdrant")

    def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the collection."""
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                "points_count": info.points_count,
                "vector_size": info.config.params.vectors.size,
                "distance": info.config.params.vectors.distance.value,
            }
        except Exception as e:
            return {"error": str(e)}


class DocumentIngestor:
    """Orchestrates the complete document ingestion process."""

    def __init__(self, config: RAGConfig):
        self.config = config
        self.chunker = IntelligentChunker(config.chunk_size, config.chunk_overlap)
        self.embedder = EmbeddingGenerator(config.openai_api_key, config.embedding_model)
        self.qdrant = QdrantManager(config.qdrant_url, config.qdrant_api_key, config.collection_name)

    def find_markdown_files(self, directory: str) -> List[str]:
        """
        Find all markdown files in directory recursively, excluding build/system directories.
        """
        exclude_dirs = {
            "node_modules", ".git", "build", "dist", "site", 
            ".docusaurus", "__pycache__", ".venv", "venv"
        }
        
        md_files = []
        for root, dirs, files in os.walk(directory):
            # Modify dirs in-place to skip excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                if file.endswith(".md") or file.endswith(".mdx"):
                    md_files.append(os.path.join(root, file))
                    
        return md_files

    async def ingest_directory(self, directory: str) -> Dict[str, Any]:
        """
        Ingest all markdown files from a directory.

        Args:
            directory: Path to directory containing markdown files

        Returns:
            Dictionary with ingestion statistics
        """
        print(f"🚀 Starting ingestion from directory: {directory}")

        # Find markdown files
        file_paths = self.find_markdown_files(directory)
        if not file_paths:
            print("❌ No markdown files found")
            return {"error": "No markdown files found"}

        print(f"📄 Found {len(file_paths)} markdown files")

        # Process all files
        all_chunks = []
        for file_path in file_paths:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Extract metadata
                metadata = self.chunker._extract_metadata(file_path, content)

                # Chunk document
                chunks = self.chunker.chunk_document(content, metadata)
                all_chunks.extend(chunks)

                print(f"  ✅ {file_path}: {len(chunks)} chunks")

            except Exception as e:
                print(f"  ❌ Error processing {file_path}: {e}")

        if not all_chunks:
            return {"error": "No chunks created"}

        print(f"📊 Total chunks created: {len(all_chunks)}")

        # Create Qdrant collection
        self.qdrant.create_collection()

        # Generate embeddings
        texts = [chunk.text for chunk in all_chunks]
        embeddings = await self.embedder.embed_batch(texts)

        # Store in Qdrant
        self.qdrant.upsert_chunks(all_chunks, embeddings)

        # Get collection info
        collection_info = self.qdrant.get_collection_info()

        # Analyze chunks
        chunk_analysis = self.chunker.analyze_chunks(all_chunks)

        return {
            "files_processed": len(file_paths),
            "chunks_created": len(all_chunks),
            "embeddings_generated": len(embeddings),
            "collection_info": collection_info,
            "chunk_analysis": chunk_analysis,
            "status": "success"
        }


async def main():
    """Main function to run document ingestion."""
    parser = argparse.ArgumentParser(description="Ingest documents into RAG system")
    parser.add_argument("directory", help="Directory containing markdown files")
    parser.add_argument("--openai-key", help="OpenAI API key", default=os.getenv("OPENAI_API_KEY"))
    parser.add_argument("--qdrant-url", help="Qdrant URL", default=os.getenv("QDRANT_URL", "http://localhost:6333"))
    parser.add_argument("--qdrant-key", help="Qdrant API key", default=os.getenv("QDRANT_API_KEY"))
    parser.add_argument("--collection", help="Collection name", default="document_chunks")
    parser.add_argument("--chunk-size", type=int, default=1000, help="Chunk size in tokens")
    parser.add_argument("--overlap", type=int, default=200, help="Overlap between chunks in tokens")

    args = parser.parse_args()

    if not args.openai_key:
        print("❌ OpenAI API key is required. Set OPENAI_API_KEY environment variable or use --openai-key")
        return

    # Create configuration
    config = RAGConfig(
        openai_api_key=args.openai_key,
        qdrant_url=args.qdrant_url,
        qdrant_api_key=args.qdrant_key,
        collection_name=args.collection,
        chunk_size=args.chunk_size,
        chunk_overlap=args.overlap,
    )

    # Run ingestion
    ingestor = DocumentIngestor(config)
    result = await ingestor.ingest_directory(args.directory)

    # Print results
    print("\n" + "="*50)
    print("📊 INGESTION RESULTS")
    print("="*50)

    if result.get("error"):
        print(f"❌ Error: {result['error']}")
    else:
        print(f"✅ Status: {result['status']}")
        print(f"📄 Files processed: {result['files_processed']}")
        print(f"🧩 Chunks created: {result['chunks_created']}")
        print(f"🔢 Embeddings generated: {result['embeddings_generated']}")

        if result.get("collection_info"):
            info = result["collection_info"]
            print(f"\n📊 Collection Info:")
            print(f"  Points: {info.get('points_count', 'N/A')}")
            print(f"  Vector size: {info.get('vector_size', 'N/A')}")
            print(f"  Distance: {info.get('distance', 'N/A')}")

        if result.get("chunk_analysis"):
            analysis = result["chunk_analysis"]
            print(f"\n📏 Chunk Analysis:")
            print(f"  Total chunks: {analysis.get('total_chunks', 'N/A')}")
            print(f"  Total tokens: {analysis.get('total_tokens', 'N/A')}")
            print(f"  Avg tokens/chunk: {analysis.get('avg_tokens_per_chunk', 'N/A'):.1f}")
            print(f"  Min/Max tokens: {analysis.get('min_tokens', 'N/A')}/{analysis.get('max_tokens', 'N/A')}")

    print("="*50)


if __name__ == "__main__":
    asyncio.run(main())