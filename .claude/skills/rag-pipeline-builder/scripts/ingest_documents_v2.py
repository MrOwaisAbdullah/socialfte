#!/usr/bin/env python3
"""
Production-Ready Document Ingestion for RAG Systems

Lessons learned incorporated:
- OpenRouter integration for embeddings
- Memory-safe chunking with progress checks
- Batched Qdrant upserts (100 points/batch)
- Cross-platform path detection
- Auto dimension mismatch handling

Cost estimate: ~$0.02 per 1M tokens (openai/text-embedding-3-small)
"""
import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Any, Tuple
from uuid import uuid4

# Required dependencies
try:
    from openai import OpenAI
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, PointStruct, VectorParams
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("Install with: pip install openai qdrant-client")
    sys.exit(1)


class IntelligentChunker:
    """Markdown-aware text chunker with infinite loop protection."""

    def __init__(self, chunk_size: int = 1000, overlap: int = 200):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def _protect_code_blocks(self, text: str) -> Tuple[str, Dict[str, str]]:
        """Protect code blocks from splitting with placeholders."""
        placeholders = {}
        pattern = r'```[\s\S]*?```'

        def replace_with_placeholder(match):
            placeholder = f"__CODE_BLOCK_{len(placeholders)}__"
            placeholders[placeholder] = match.group(0)
            return placeholder

        protected_text = re.sub(pattern, replace_with_placeholder, text)
        return protected_text, placeholders

    def _restore_code_blocks(self, text: str, placeholders: Dict[str, str]) -> str:
        """
        Restore protected code blocks in a single chunk.

        FIX: Only replace if present, once per occurrence to prevent duplication.
        """
        result = text
        for placeholder, code_block in placeholders.items():
            if placeholder in result:  # Only replace if present
                result = result.replace(placeholder, code_block, 1)  # Replace only once
        return result

    def _split_text(self, text: str) -> List[str]:
        """
        Split text recursively by paragraphs, lines, sentences.

        FIX: Added infinite loop protection with max_chunks and progress checks.
        """
        if len(text) <= self.chunk_size:
            return [text]

        chunks = []
        current_position = 0
        max_chunks = 10000  # Safety limit to prevent memory issues
        iterations = 0

        while current_position < len(text) and iterations < max_chunks:
            iterations += 1
            end = min(current_position + self.chunk_size, len(text))

            # Try paragraph split
            paragraph_split = text.rfind('\n\n', current_position, end)
            if paragraph_split > current_position:
                split_point = paragraph_split + 2
            else:
                # Try line split
                line_split = text.rfind('\n', current_position, end)
                if line_split > current_position:
                    split_point = line_split + 1
                else:
                    # Try sentence split
                    sentence_split = text.rfind('. ', current_position, end)
                    if sentence_split > current_position:
                        split_point = sentence_split + 2
                    else:
                        split_point = end

            # FIX: Ensure we always make progress
            if split_point <= current_position:
                split_point = min(current_position + 100, len(text))

            chunk = text[current_position:split_point].strip()
            if chunk:
                chunks.append(chunk)

            # FIX: Move forward with overlap, but ensure progress
            new_position = split_point - self.overlap
            if new_position <= current_position:
                new_position = split_point  # No overlap if we can't move back
            current_position = new_position

        if iterations >= max_chunks:
            print(f"    ⚠️  Reached maximum chunk limit ({max_chunks}), truncating...")

        return chunks

    def chunk_document(self, text: str) -> List[str]:
        """Chunk a document while preserving code blocks."""
        protected_text, placeholders = self._protect_code_blocks(text)
        chunks = self._split_text(protected_text)
        restored_chunks = [self._restore_code_blocks(chunk, placeholders) for chunk in chunks]
        return restored_chunks


class RAGIngestor:
    """Production-ready RAG ingestion with OpenRouter + Qdrant."""

    # Embedding model configuration
    EMBEDDING_MODEL = "openai/text-embedding-3-small"  # 1536 dimensions, $0.02/1M tokens
    EMBEDDING_DIM = 1536
    BATCH_SIZE = 100  # Qdrant upsert batch size

    def __init__(
        self,
        openrouter_api_key: str,
        qdrant_url: str,
        qdrant_api_key: str,
        collection_name: str = "knowledge_base",
    ):
        """Initialize ingestor with API clients."""
        # OpenRouter client (OpenAI-compatible)
        self.openai_client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=openrouter_api_key,
        )

        # Qdrant client
        self.qdrant_client = QdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key,
        )

        self.collection_name = collection_name
        self.chunker = IntelligentChunker(chunk_size=1000, overlap=200)

    def _setup_collection(self):
        """
        Create Qdrant collection or recreate if dimension mismatch.

        FIX: Auto-detect dimension mismatch and recreate.
        """
        collections = self.qdrant_client.get_collections()
        collection_names = [c.name for c in collections.collections]

        if self.collection_name in collection_names:
            # Check dimension
            collection_info = self.qdrant_client.get_collection(self.collection_name)
            current_dim = collection_info.config.params.vectors.size
            if current_dim != self.EMBEDDING_DIM:
                print(f"⚠️  Collection exists with wrong dimension ({current_dim} vs {self.EMBEDDING_DIM})")
                print(f"🗑️  Deleting and recreating collection...")
                self.qdrant_client.delete_collection(self.collection_name)
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=self.EMBEDDING_DIM, distance=Distance.COSINE),
                )
                print(f"✅ Recreated collection: {self.collection_name} with dimension {self.EMBEDDING_DIM}")
            else:
                print(f"✅ Collection exists: {self.collection_name} (dimension: {self.EMBEDDING_DIM})")
        else:
            self.qdrant_client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=self.EMBEDDING_DIM, distance=Distance.COSINE),
            )
            print(f"✅ Created collection: {self.collection_name} with dimension {self.EMBEDDING_DIM}")

    def _find_markdown_files(self, base_dir: Path) -> List[Dict[str, str]]:
        """
        Find all markdown files recursively.

        FIX: Cross-platform path detection with fallbacks.
        """
        exclude_dirs = {
            "node_modules", ".git", "build", "dist", "site",
            ".docusaurus", "__pycache__", ".venv", "venv", ".pytest_cache"
        }

        documents = []
        for root, dirs, files in os.walk(base_dir):
            # Modify dirs in-place to skip excluded
            dirs[:] = [d for d in dirs if d not in exclude_dirs]

            for file in files:
                if file.endswith((".md", ".mdx")):
                    file_path = Path(root) / file
                    # Get relative path from base_dir
                    rel_path = file_path.relative_to(base_dir)
                    source = str(rel_path).replace("\\", "/")  # Normalize to forward slashes

                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    documents.append({
                        "source": source,
                        "title": file_path.stem,
                        "content": content,
                    })

        return documents

    def _generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using OpenRouter API."""
        print(f"    🔢 Calling OpenRouter API for {len(texts)} chunks...")
        try:
            response = self.openai_client.embeddings.create(
                model=self.EMBEDDING_MODEL,
                input=texts,
            )
            print(f"    ✅ Got embeddings for {len(texts)} chunks")
            return [item.embedding for item in response.data]
        except Exception as e:
            print(f"    ❌ Embedding API error: {e}")
            raise

    def ingest(self, base_dir: Path) -> Dict[str, Any]:
        """Main ingestion pipeline."""
        print(f"\n{'='*60}")
        print(f"RAG Ingestion - Production Ready")
        print(f"{'='*60}\n")

        # Setup collection
        self._setup_collection()

        # Find documents
        documents = self._find_markdown_files(base_dir)
        if not documents:
            print("❌ No documents found. Exiting.")
            return {"status": "error", "message": "No documents found"}

        print(f"📚 Found {len(documents)} markdown documents\n")

        # Process documents
        all_points = []
        chunk_id = 0
        doc_count = 0

        print(f"🔄 Processing {len(documents)} documents...\n")

        for doc in documents:
            doc_count += 1
            print(f"[{doc_count}/{len(documents)}] 📄 {doc['title']}", end="")

            # Chunk document
            chunks = self.chunker.chunk_document(doc["content"])
            print(f" → {len(chunks)} chunks")

            # Generate embeddings
            embeddings = self._generate_embeddings(chunks)

            # Create points
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                point = PointStruct(
                    id=str(uuid4()),
                    vector=embedding,
                    payload={
                        "text": chunk,
                        "source": doc["source"],
                        "title": doc["title"],
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                    },
                )
                all_points.append(point)
                chunk_id += 1

        # Batch upsert to Qdrant
        print(f"\n{'='*60}")
        print(f"💾 Storing {len(all_points)} chunks in Qdrant...")
        print(f"{'='*60}")

        total_batches = (len(all_points) + self.BATCH_SIZE - 1) // self.BATCH_SIZE

        for batch_num in range(total_batches):
            start_idx = batch_num * self.BATCH_SIZE
            end_idx = min(start_idx + self.BATCH_SIZE, len(all_points))
            batch = all_points[start_idx:end_idx]

            print(f"   Batch {batch_num + 1}/{total_batches} ({len(batch)} points)...", end="")
            try:
                self.qdrant_client.upsert(
                    collection_name=self.collection_name,
                    points=batch,
                )
                print(f" ✅")
            except Exception as e:
                print(f" ❌ Failed: {e}")
                continue

        print(f"✅ All batches processed!")

        # Verify
        collection_info = self.qdrant_client.get_collection(self.collection_name)
        print(f"\n{'='*60}")
        print(f"✅ Ingestion Complete!")
        print(f"{'='*60}")
        print(f"📊 Collection: {self.collection_name}")
        print(f"📦 Total vectors: {collection_info.points_count}")
        print(f"📐 Vector dimension: {collection_info.config.params.vectors.size}")
        print(f"{'='*60}\n")

        return {
            "status": "success",
            "documents_processed": len(documents),
            "chunks_created": len(all_points),
            "collection_name": self.collection_name,
            "vectors_count": collection_info.points_count,
        }


def find_repository_root() -> Path:
    """
    Find repository root with cross-platform support.

    FIX: Try multiple possible base locations for Windows, WSL, Linux.
    """
    possible_bases = [
        Path.cwd(),  # Current directory
        Path(__file__).parent.parent.parent,  # From scripts/ to repo root
        Path("D:/GIAIC/Quarter 4/Hackathon II"),  # Windows path
        Path("/mnt/d/GIAIC/Quarter 4/Hackathon II"),  # WSL/Linux path
    ]

    for path in possible_bases:
        if path.exists() and (path / "specs" if path.name == "specs" else True):
            # For hackathon-specific structure
            if (path / "specs").exists() or (path / ".git").exists():
                return path

    raise ValueError(
        f"Cannot find repository root. Searched: {[str(p) for p in possible_bases]}"
    )


def main():
    """Run ingestion with environment configuration."""
    # Environment variables
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    qdrant_url = os.getenv("QDRANT_URL")
    qdrant_key = os.getenv("QDRANT_API_KEY")

    if not openrouter_key:
        print("❌ OPENROUTER_API_KEY not set")
        sys.exit(1)

    if not qdrant_url:
        print("❌ QDRANT_URL not set")
        sys.exit(1)

    # Find repository root
    try:
        base_dir = find_repository_root()
        print(f"📁 Repository root: {base_dir}")
    except ValueError as e:
        print(f"❌ {e}")
        sys.exit(1)

    # Run ingestion
    ingestor = RAGIngestor(
        openrouter_api_key=openrouter_key,
        qdrant_url=qdrant_url,
        qdrant_api_key=qdrant_key or "",
        collection_name="knowledge_base",
    )

    result = ingestor.ingest(base_dir)

    if result["status"] == "success":
        print(f"✅ Processed {result['documents_processed']} documents")
        print(f"✅ Created {result['chunks_created']} chunks")
        sys.exit(0)
    else:
        print(f"❌ Failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
