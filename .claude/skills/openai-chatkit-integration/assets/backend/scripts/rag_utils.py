# rag_utils.py
# Derived from rag-pipeline-builder skill

import re
import tiktoken
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from openai import AsyncOpenAI

@dataclass
class DocumentChunk:
    text: str
    metadata: Dict[str, Any]
    token_count: int

class IntelligentChunker:
    """Markdown-aware chunking from rag-pipeline-builder"""
    def __init__(self, chunk_size: int = 1000, overlap: int = 200):
        self.encoding = tiktoken.get_encoding("cl100k_base")
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk_document(self, text: str, metadata: Dict[str, Any]) -> List[DocumentChunk]:
        # Simplified Recursive Splitter Logic for demo
        # In production use the full RecursiveTextSplitter from the skill
        chunks = []
        words = text.split()
        current_chunk = []
        current_size = 0
        
        for word in words:
            token_len = len(self.encoding.encode(word))
            if current_size + token_len > self.chunk_size:
                chunk_text = " ".join(current_chunk)
                chunks.append(DocumentChunk(
                    text=chunk_text,
                    metadata=metadata,
                    token_count=current_size
                ))
                # Simple overlap: keep last N words
                overlap_size = int(self.overlap / 5) # rough approx
                current_chunk = current_chunk[-overlap_size:]
                current_size = sum(len(self.encoding.encode(w)) for w in current_chunk)
            
            current_chunk.append(word)
            current_size += token_len
            
        if current_chunk:
             chunks.append(DocumentChunk(
                    text=" ".join(current_chunk),
                    metadata=metadata,
                    token_count=current_size
                ))
        return chunks

class EmbeddingGenerator:
    """Embedding generator using OpenAI SDK"""
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        # Using text-embedding-3-small as recommended
        response = await self.client.embeddings.create(
            model="text-embedding-3-small",
            input=texts
        )
        return [data.embedding for data in response.data]
