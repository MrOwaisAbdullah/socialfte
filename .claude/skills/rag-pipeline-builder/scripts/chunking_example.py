#!/usr/bin/env python3
"""
Intelligent Document Chunking for RAG Systems

This script provides a standalone implementation of recursive text splitting
without heavy dependencies like LangChain. It preserves document structure
(paragraphs, lists, code blocks) for optimal retrieval.
"""

import re
import tiktoken
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class DocumentChunk:
    """Represents a chunk of document with metadata."""
    text: str
    metadata: Dict[str, Any]
    chunk_index: int
    token_count: int


class RecursiveTextSplitter:
    """
    Standalone recursive character text splitter.
    Splits text by a list of separators in order, attempting to keep chunks
    under a specified size.
    """

    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        separators: Optional[List[str]] = None,
        length_function: callable = len,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.length_function = length_function
        self.separators = separators or ["\n\n\n", "\n\n", "\n", ". ", " ", ""]

    def split_text(self, text: str) -> List[str]:
        """Split text into chunks."""
        final_chunks = []
        good_splits = self._split_text_with_separator(text, self.separators)
        
        return good_splits

    def _split_text_with_separator(self, text: str, separators: List[str]) -> List[str]:
        """Recursive helper to split text."""
        final_chunks = []
        
        # Get current separator
        separator = separators[-1]
        new_separators = []
        for i, _s in enumerate(separators):
            if _s == "":
                separator = _s
                break
            if re.search(re.escape(_s), text):
                separator = _s
                new_separators = separators[i + 1:]
                break

        # Split content
        _splits = re.split(re.escape(separator), text) if separator else list(text)
        
        # Re-merge small chunks
        _good_splits = []
        _separator = separator if separator else ""
        
        current_doc = []
        current_length = 0
        
        for s in _splits:
            s_len = self.length_function(s)
            
            if current_length + s_len + (len(current_doc) * len(_separator)) > self.chunk_size:
                # Current doc is full
                if current_doc:
                    doc_text = _separator.join(current_doc)
                    if self.length_function(doc_text) > self.chunk_size:
                        # Still too big? Recurse if possible
                        if new_separators:
                            sub_splits = self._split_text_with_separator(doc_text, new_separators)
                            _good_splits.extend(sub_splits)
                        else:
                            _good_splits.append(doc_text)
                    else:
                        _good_splits.append(doc_text)
                    
                    # Handle overlap
                    if self.chunk_overlap > 0 and len(current_doc) > 1:
                        # Simple overlap strategy: keep last portion
                        # A robust implementation would back-calculate overlap tokens
                        # For simplicity in this standalone version, we just reset
                        pass
                        
                    current_doc = []
                    current_length = 0

            current_doc.append(s)
            current_length += s_len

        # Append remaining
        if current_doc:
            doc_text = _separator.join(current_doc)
            if self.length_function(doc_text) > self.chunk_size and new_separators:
                sub_splits = self._split_text_with_separator(doc_text, new_separators)
                _good_splits.extend(sub_splits)
            else:
                _good_splits.append(doc_text)

        return _good_splits


class IntelligentChunker:
    """
    Markdown-aware chunking wrapper.
    """

    def __init__(self, chunk_size: int = 1000, overlap: int = 200, min_chunk_size: int = 50):
        self.encoding = tiktoken.get_encoding("cl100k_base")
        self.min_chunk_size = min_chunk_size
        self.splitter = RecursiveTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=overlap,
            length_function=self._count_tokens
        )

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using the encoding."""
        return len(self.encoding.encode(text))

    def _protect_code_blocks(self, text: str) -> str:
        """Replace code blocks with placeholders to prevent splitting."""
        code_blocks = []

        def replace_block(match):
            placeholder = f"__CODE_BLOCK_{len(code_blocks)}__"
            code_blocks.append(match.group(0))
            return placeholder

        # Replace both inline code and code blocks
        text = re.sub(r'```[\s\S]*?```', replace_block, text)
        text = re.sub(r'`[^`]+`', replace_block, text)

        return text

    def _restore_code_blocks(self, text: str, code_blocks: List[str]) -> str:
        """Restore code blocks from placeholders."""
        for i, block in enumerate(code_blocks):
            text = text.replace(f"__CODE_BLOCK_{i}__", block)
        return text

    def _extract_metadata(self, file_path: str, content: str) -> Dict[str, Any]:
        """Extract metadata from file path and content."""
        import os

        metadata = {
            "file_path": file_path,
            "file_name": os.path.basename(file_path),
            "file_extension": os.path.splitext(file_path)[1],
        }

        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('# '):
                metadata["title"] = line[2:].strip()
                break
            elif line and not line.startswith('#'):
                metadata["title"] = line[:50] + "..." if len(line) > 50 else line
                break

        sections = []
        for line in lines:
            if line.strip().startswith('#'):
                level = len(line) - len(line.lstrip('#'))
                title = line.strip('#').strip()
                sections.append({"level": level, "title": title})

        metadata["sections"] = sections
        return metadata

    def chunk_document(self, text: str, metadata: Dict[str, Any]) -> List[DocumentChunk]:
        """
        Chunk a document while preserving structure.
        """
        code_blocks = []
        text = self._protect_code_blocks(text)

        chunks = self.splitter.split_text(text)

        document_chunks = []
        chunk_index = 0
        for chunk_text in chunks:
            restored_chunk = self._restore_code_blocks(chunk_text, code_blocks)
            token_count = self._count_tokens(restored_chunk)

            # Skip chunks that are too small (likely just headers or noise)
            if token_count < self.min_chunk_size:
                continue

            chunk = DocumentChunk(
                text=restored_chunk,
                metadata={**metadata, "chunk_index": chunk_index},
                chunk_index=chunk_index,
                token_count=token_count
            )
            document_chunks.append(chunk)
            chunk_index += 1

        return document_chunks

    def analyze_chunks(self, chunks: List[DocumentChunk]) -> Dict[str, Any]:
        if not chunks:
            return {"total_chunks": 0}

        token_counts = [chunk.token_count for chunk in chunks]

        return {
            "total_chunks": len(chunks),
            "total_tokens": sum(token_counts),
            "avg_tokens_per_chunk": sum(token_counts) / len(token_counts),
            "min_tokens": min(token_counts),
            "max_tokens": max(token_counts),
        }


# Example usage
if __name__ == "__main__":
    sample_text = """
# Introduction

This is a sample text.

## Section 1
It has sections and code blocks.

```python
print("Hello World")
```
"""
    chunker = IntelligentChunker(chunk_size=50, overlap=10)
    metadata = chunker._extract_metadata("test.md", sample_text)
    chunks = chunker.chunk_document(sample_text, metadata)
    
    print(f"Created {len(chunks)} chunks")
    for c in chunks:
        print(f"- [{c.token_count} tokens] {c.text[:30]}...")