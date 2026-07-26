# Production Lessons Learned - RAG Pipeline Builder

## Overview

This document captures critical lessons learned from implementing a production RAG system for TeamFlow CRM, covering real-world issues encountered and their solutions.

## Critical Issues Encountered

### 1. Wrong Embedding Model Selection

**Issue:** Used `mistralai/devstral-2512:free` which is a **chat model**, not an embedding model.

**Error:**
```
Error code: 400 - {'error': {'message': 'Model does not support embeddings output modality'}}
```

**Solution:**
- Use correct embedding model: `openai/text-embedding-3-small` (1536 dimensions)
- Verify model supports embeddings before implementation
- Use OpenRouter's filter: `?output_modalities=embeddings`

**Cost:** $0.02 per 1M tokens (~$0.008 for 778 chunks / ~400K tokens)

### 2. Memory Error in Chunking Loop

**Issue:** Infinite loop in `_split_text()` when `split_point - overlap <= current_position`

**Error:**
```
MemoryError: Cannot allocate memory
```

**Root Cause:**
```python
# BAD: Can create infinite loop
current_position = split_point - self.overlap
# When overlap >= split_point, position never advances
```

**Solution:**
```python
# GOOD: Always make progress
new_position = split_point - self.overlap
if new_position <= current_position:
    new_position = split_point  # Skip overlap if can't move back
current_position = new_position

# Also add safety limit
max_chunks = 10000
iterations = 0
while current_position < len(text) and iterations < max_chunks:
    iterations += 1
    # ... chunking logic ...
```

### 3. Code Block Duplication in Chunks

**Issue:** All placeholders replaced in ALL chunks, causing memory bloat

**Root Cause:**
```python
# BAD: Replaces all placeholders in every chunk
def _restore_code_blocks(self, text: str, placeholders: dict[str, str]) -> str:
    for placeholder, code_block in placeholders.items():
        text = text.replace(placeholder, code_block)  # Replaces everywhere!
    return text
```

**Solution:**
```python
# GOOD: Only replace if present, once per occurrence
def _restore_code_blocks(self, text: str, placeholders: dict[str, str]) -> str:
    result = text
    for placeholder, code_block in placeholders.items():
        if placeholder in result:  # Check if present
            result = result.replace(placeholder, code_block, 1)  # Replace once
    return result
```

### 4. Qdrant Upsert Timeout

**Issue:** Sending all 778 points in one batch times out

**Error:**
```
httpx.WriteTimeout: The write operation timed out
qdrant_client.http.exceptions.ResponseHandlingException
```

**Root Cause:**
```python
# BAD: Single large batch
self.qdrant_client.upsert(
    collection_name=self.collection_name,
    points=all_points,  # 778 points at once
)
```

**Solution:**
```python
# GOOD: Batch in groups of 100
batch_size = 100
total_batches = (len(all_points) + batch_size - 1) // batch_size

for batch_num in range(total_batches):
    start_idx = batch_num * batch_size
    end_idx = min(start_idx + batch_size, len(all_points))
    batch = all_points[start_idx:end_idx]

    self.qdrant_client.upsert(
        collection_name=self.collection_name,
        points=batch,
    )
```

### 5. Cross-Platform Path Detection

**Issue:** Hardcoded paths don't work across Windows, WSL, Linux

**Error:**
```
Found 0 markdown documents (using /mnt/d/... on Windows)
```

**Solution:**
```python
# Try multiple possible base locations
possible_bases = [
    Path(__file__).parent.parent.parent.parent,  # Relative path
    Path("D:/GIAIC/Quarter 4/Hackathon II"),     # Windows path
    Path("/mnt/d/GIAIC/Quarter 4/Hackathon II"), # WSL/Linux path
]

base_dir = None
for path in possible_bases:
    if path.exists() and (path / "specs").exists():
        base_dir = path
        break
```

### 6. Collection Dimension Mismatch

**Issue:** Existing collection has wrong dimension after model change

**Solution:**
```python
# Check dimension on startup
collection_info = self.qdrant_client.get_collection(self.collection_name)
current_dim = collection_info.config.params.vectors.size

if current_dim != self.embedding_dim:
    print(f"⚠️  Collection exists with wrong dimension ({current_dim} vs {self.embedding_dim})")
    print(f"🗑️  Deleting and recreating collection...")
    self.qdrant_client.delete_collection(self.collection_name)
    # Recreate with correct dimension
```

## OpenRouter Integration

### Why OpenRouter?

- **Unified API**: Access multiple AI providers with single API key
- **Cost Control**: Set spending limits, monitor usage
- **Model Flexibility**: Easy to switch between models
- **Free Tiers**: Access to free models for testing

### Implementation

```python
from openai import OpenAI

# Use OpenRouter as OpenAI-compatible endpoint
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key,
)

# Use OpenAI model via OpenRouter
response = client.embeddings.create(
    model="openai/text-embedding-3-small",
    input=chunk,
)
```

### Finding Free Embedding Models

**Warning:** As of January 2025, OpenRouter has **no free embedding models**. Free models are chat-only.

**To verify:**
```python
import urllib.request
import json

req = urllib.request.Request(
    "https://openrouter.ai/api/v1/models",
    headers={"Authorization": f"Bearer {api_key}"}
)
with urllib.request.urlopen(req) as response:
    models = json.loads(response.read().decode())

# Filter for embedding models
embedding_models = [
    m for m in models["data"]
    if "embeddings" in m.get("architecture", {}).get("output_modalities", [])
]
```

### Cost Calculation

```
Total chunks: 778
Avg tokens/chunk: ~500
Total tokens: 389,000 (~0.4M)

Cost: 0.4M × $0.02/1M = $0.008
```

## Embedding Model Reference

| Model | Dimensions | Cost | Context |
|-------|-----------|------|---------|
| `openai/text-embedding-3-small` | 1536 | $0.02/1M | 8,192 tokens |
| `openai/text-embedding-3-large` | 3072 | $0.13/1M | 8,192 tokens |
| `openai/text-embedding-ada-002` | 1536 | $0.10/1M | 8,191 tokens |

**Recommendation:** Use `text-embedding-3-small` for most cases. Best value for quality.

## Environment Configuration

### Required Variables

```bash
# .env
# AI Services
GEMINI_API_KEY=your_gemini_key_here
OPENROUTER_API_KEY=your_openrouter_key_here

# Vector Database
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key_here
```

### Verification Script

```python
# test_openrouter.py
from openai import OpenAI

api_key = "sk-or-v1-..."
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)

# Test embedding model
response = client.embeddings.create(
    model="openai/text-embedding-3-small",
    input=["Test sentence."],
)
print(f"✅ Dimension: {len(response.data[0].embedding)}")
```

## Chunking Best Practices

### Configuration

```python
chunk_size = 1000    # Characters (not tokens)
overlap = 200        # Overlap for context preservation
```

### Strategy

1. **Protect Code Blocks**: Never split code blocks
2. **Respect Structure**: Split at paragraphs → lines → sentences
3. **Prevent Loops**: Always advance position
4. **Limit Size**: Cap at 10,000 chunks per document

### Example Output

```
[1/37] 📄 data-model → 11 chunks
    🔢 Calling OpenRouter API for 11 chunks...
    ✅ Got embeddings for 11 chunks
```

## Qdrant Best Practices

### Connection

```python
from qdrant_client import QdrantClient

# Cloud
client = QdrantClient(
    url=settings.qdrant_url,
    api_key=settings.qdrant_api_key,
)

# Local
client = QdrantClient(url="http://localhost:6333")
```

### Collection Setup

```python
from qdrant_client.models import VectorParams, Distance

client.create_collection(
    collection_name="teamflow_kb",
    vectors_config=VectorParams(
        size=1536,  # Match embedding dimension
        distance=Distance.COSINE,
    ),
)
```

### Batch Upsert Pattern

```python
batch_size = 100
for i in range(0, len(points), batch_size):
    batch = points[i:i + batch_size]
    client.upsert(collection_name=collection_name, points=batch)
```

### Search Pattern

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue

results = client.search(
    collection_name="teamflow_kb",
    query_vector=embedding,
    limit=5,
    score_threshold=0.7,  # Cosine similarity threshold
)
```

## Troubleshooting Checklist

### Before Running Ingestion

- [ ] Verify API keys are set (check `.env`)
- [ ] Test embedding model with single request
- [ ] Confirm Qdrant cluster is accessible
- [ ] Check collection dimension matches embedding model
- [ ] Verify repository path is correct

### During Ingestion

- [ ] Watch for API errors (400, 401, 402, 429)
- [ ] Monitor memory usage
- [ ] Check batch processing logs
- [ ] Verify embeddings are generated

### After Ingestion

- [ ] Confirm point count in Qdrant
- [ ] Test semantic search with sample queries
- [ ] Verify relevance scores are acceptable
- [ ] Check chunk quality and size distribution

## Performance Metrics

### Ingestion Performance

```
Documents: 37 markdown files
Chunks: 778 total
Avg chunks/doc: 21

Embedding Generation:
- Time: ~2 minutes total
- Rate: ~13 chunks/second

Qdrant Upsert:
- Time: ~30 seconds (8 batches of 100)
- Rate: ~26 chunks/second

Total Cost: $0.008 (OpenRouter)
```

### Query Performance

```
Retrieval Latency: < 100ms for top 5 results
Generation Latency: ~1-2s (depending on model)
```

## Common Errors Summary

| Error | Cause | Fix |
|-------|-------|-----|
| `400 - does not support embeddings` | Wrong model (chat not embedding) | Use `openai/text-embedding-3-small` |
| `MemoryError` | Infinite loop in chunker | Add progress checks |
| `WriteTimeout` | Too many points in one batch | Batch in groups of 100 |
| `Found 0 documents` | Wrong path format | Try multiple path formats |
| `dimension mismatch` | Old collection, new model | Delete and recreate collection |

---

### 7. Similarity Threshold Tuning for Vague Queries 🆕

**Issue:** Vector search returns 0 results for vague user queries like "what is this document about?" or "overview"

**Example Scenario:**
```python
# User query: "what is this doc about?"
# Vector search with threshold=0.5: 0 results
# Vector search with threshold=0.3: 2 results
```

**Why This Happens:**
- Semantic embeddings capture meaning, not exact keywords
- Vague queries ("what is this about", "overview") have low similarity to specific content
- The query "what is this doc about" doesn't match the actual document keywords like "blog strategy", "AI SaaS", etc.

**Solution - Tunable Threshold:**

**Configuration (.env):**
```bash
# Lower threshold for more lenient matching
VECTOR_SIMILARITY_THRESHOLD=0.3  # Default 0.5 is too strict

# Threshold Guidelines:
# 0.5 - Strict: Only highly relevant matches (precise queries)
# 0.4 - Moderate: Good balance (most specific queries)
# 0.3 - Lenient: Includes related concepts (vague queries work)
# 0.2 - Very lenient: May include irrelevant content
```

**Environment Variable Integration:**
```python
from pydantic import BaseSettings, Field

class Settings(BaseSettings):
    vector_similarity_threshold: float = Field(
        default=0.3,  # More lenient default for better UX
        description="Minimum similarity for vector search results"
    )

# In search function:
chunks = await search_chunks(
    query_embedding,
    limit=5,
    threshold=settings.vector_similarity_threshold,
)
```

**Query Results by Threshold:**
```
Query: "what is this doc about?"
- threshold=0.5: 0 results ❌
- threshold=0.4: 0 results ❌
- threshold=0.3: 2 results ✅ (similarity: 0.31)
- threshold=0.2: 10+ results (too many, low quality)

Query: "blog strategy" (specific)
- threshold=0.5: 3 results ✅ (similarity: 0.52)
- threshold=0.3: 5 results ✅ (includes more matches)
```

**Agent Instructions for No Results:**
```python
instructions = """
You are OwFlex, an AI assistant for document Q&A.

When search_documents returns no results:
1. Suggest trying more specific keywords from the document name
2. Try alternative search terms like "overview", "strategy", "main topic"
3. Guide the user to ask questions about specific concepts

Example responses:
- "I couldn't find that with the current search. Let me try searching for 'overview'..."
- "The document seems to be about [topic]. Try asking about [specific aspects]..."
- "Could you be more specific? What aspect of [topic] interests you?"
"""
```

**Testing Threshold Impact:**
```python
async def test_threshold_impact():
    queries = [
        "what is this doc about",  # Vague
        "overview",                # Medium vagueness
        "blog strategy",           # Specific
        "freelancer automation",   # Very specific
    ]

    for query in queries:
        embedding = await generate_embedding(query)

        # Test with different thresholds
        for threshold in [0.5, 0.4, 0.3, 0.2]:
            chunks = await search_chunks(embedding, limit=5, threshold=threshold)
            print(f"Query: '{query}' | threshold={threshold} | results={len(chunks)}")
```

**Production Recommendation:**
- **Start with 0.3** - Good balance for UX vs relevance
- Monitor user queries that return 0 results
- If many specific queries return 0 results, consider lowering to 0.25
- If many vague queries return irrelevant content, consider raising to 0.35

---

---

### 8. ONNX Model Dimension Upgrade (768 → 1024) Requires Schema Migration

**Issue:** Upgrading from `Xenova/bge-base-en-v1.5` (768-dim) to `Xenova/bge-m3` (1024-dim) causes `NeonDbError: expected 1024 dimensions, not 768` on every ingest after the code deploys but before the DB schema is migrated.

**Root cause:** pgvector column is typed `vector(768)`. New model outputs 1024-dim. The mismatch is caught by Postgres on INSERT.

**Migration pattern (pgvector + HNSW):**
```sql
-- Drop HNSW index first (can't ALTER TYPE with index present)
DROP INDEX IF EXISTS "document_chunks_embedding_hnsw_idx";
-- Clear all existing chunks (old vectors are incompatible; don't try to mix)
DELETE FROM "document_chunks";
-- Widen the column
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" TYPE vector(1024);
-- Recreate index
CREATE INDEX "document_chunks_embedding_hnsw_idx"
  ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```
Run the migration SQL in Neon console BEFORE deploying the new code. After the deploy, re-index all documents manually.

**BGE-M3 differences from bge-base-en-v1.5:**
- Dimensions: 1024 (not 768)
- Pooling: `cls` (not `mean`)
- No query prefix needed (BGE-M3 handles retrieval without instruction tuning)
- Jina fallback must also be 1024-dim: use `jina-embeddings-v3` not v5-text-small

---

### 9. Never Expose Raw ORM/SQL Errors in the UI

**Issue:** `classifyError()` in the ingest pipeline was passing raw Drizzle error messages
(`"Failed query: insert into \"document_chunks\"..."`) directly to `errorMsg`, which was
then displayed in the dashboard UI.

**Why it's bad:** Exposes internal table names, column names, and query structure to users.

**Pattern — sanitize at the error classification layer, never at the display layer:**
```ts
function classifyError(err: unknown): { errorCode: string; errorMsg: string } {
  // ... specific error types first (ParseError, QuotaExhaustedError) ...

  const msg = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error && (err as Error & { cause?: unknown }).cause
  const causeMsg = cause instanceof Error ? cause.message : ''

  // Dimension mismatch (pgvector) — give actionable message
  if (causeMsg.includes('expected') && causeMsg.includes('dimensions')) {
    return { errorCode: 'DIMENSION_MISMATCH', errorMsg: 'Vector dimension mismatch. Re-index after model upgrade.' }
  }
  // Any raw DB/SQL message — sanitize completely
  if (msg.startsWith('Failed query:') || msg.includes('insert into') || msg.includes('NeonDbError')) {
    return { errorCode: 'DB_ERROR', errorMsg: 'Database error while saving chunks. Try re-indexing.' }
  }

  return { errorCode: 'INGEST_FAILED', errorMsg: msg }
}
```

The UI then handles specific `errorCode` values to show appropriate messages/CTAs.

---

## Next Steps

1. **Add Caching**: Cache embeddings to avoid re-generation
2. **Incremental Updates**: Only process changed files
3. **Metadata Filtering**: Add filters for source, tags, dates
4. **Hybrid Search**: Combine semantic + keyword search
5. **Re-ranking**: Add re-ranking for better relevance

## Resources

- [OpenRouter Docs](https://openrouter.ai/docs)
- [Qdrant Python Client](https://python-client.qdrant.tech/)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [text-embedding-3-small](https://openrouter.ai/openai/text-embedding-3-small)
