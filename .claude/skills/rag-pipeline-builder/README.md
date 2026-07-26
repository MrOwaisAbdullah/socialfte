# RAG Pipeline Builder Skill

A comprehensive Claude Agent skill for building production-ready Retrieval-Augmented Generation (RAG) systems with FastAPI backends, OpenAI embeddings (via OpenRouter), and Qdrant vector storage.

## 📚 Production Experience

**⚠️ IMPORTANT:** Before implementing, read **[LESSONS_LEARNED.md](./LESSONS_LEARNED.md)** for critical issues encountered in production including:
- Wrong embedding model selection (chat vs embedding models)
- Memory errors in chunking loops
- Qdrant upsert timeouts with large batches
- Cross-platform path issues

**Key Takeaway:** Use `openai/text-embedding-3-small` (1536 dim) via OpenRouter at $0.02/1M tokens. **Free models do NOT support embeddings.**

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install Python 3.11+
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r templates/requirements.txt
```

### 2. Environment Setup

```bash
# Copy environment template
cp templates/env-example .env

# Edit with your values
# OPENAI_API_KEY=your_key_here
# QDRANT_URL=http://localhost:6333
```

### 3. Start Vector Database

```bash
# Using Docker (recommended)
docker run -p 6333:6333 qdrant/qdrant:latest

# Or use the provided docker-compose
docker-compose -f templates/docker-compose.yml up -d qdrant
```

### 3. Verify API Configuration

```bash
# Test OpenRouter API and embedding model
export OPENROUTER_API_KEY=sk-or-v1-...
python scripts/test_openrouter.py
```

Expected output:
```
✅ All tests passed!
   Model: openai/text-embedding-3-small
   Embedding dimension: 1536
```

### 4. Ingest Documents

**Recommended:** Use production-tested v2 script with all fixes
```bash
# Set environment variables
export OPENROUTER_API_KEY=sk-or-v1-...
export QDRANT_URL=https://your-cluster.qdrant.io
export QDRANT_API_KEY=your-api-key

# Run ingestion
python scripts/ingest_documents_v2.py
```

**Alternative:** Original script
```bash
# Ingest markdown files from a directory
python scripts/ingest_documents.py docs/ --openai-key $OPENAI_API_KEY
```

### 5. Test the System

```bash
# Run test suite
python scripts/test_rag.py --openai-key $OPENAI_API_KEY

# Or test custom queries
python scripts/test_rag.py --queries "What is RAG?" "How does chunking work?"
```

### 6. Start API Server

```bash
# Start FastAPI server
uvicorn templates.fastapi-endpoint-template:app --reload

# Or use Docker Compose
docker-compose -f templates/docker-compose.yml up
```

## 📁 Project Structure

```
rag-pipeline-builder/
├── SKILL.md                           # Main skill documentation
├── LESSONS_LEARNED.md                 # ⚠️ Production issues and fixes (READ THIS!)
├── scripts/
│   ├── chunking_example.py            # Advanced document chunking
│   ├── ingest_documents.py            # Document ingestion pipeline (original)
│   ├── ingest_documents_v2.py         # ⭐ Production-tested with all fixes
│   ├── test_openrouter.py             # Verify API key and model
│   └── test_rag.py                   # Comprehensive testing suite
├── templates/
│   ├── fastapi-endpoint-template.py   # Production FastAPI endpoints
│   ├── env-example                    # Environment configuration
│   ├── requirements.txt               # Python dependencies
│   ├── docker-compose.yml             # Docker deployment
│   └── Dockerfile                    # Container build file
└── README.md                          # This file
```

## 🎯 Core Features

### Document Chunking
- **Intelligent chunking** that preserves document structure
- **Markdown-aware** splitting to protect code blocks
- **Configurable** chunk sizes and overlap
- **Metadata extraction** for better retrieval

### Vector Storage
- **Qdrant integration** for high-performance vector search
- **Optimized collection** setup with proper indexing
- **Batch processing** for efficient ingestion
- **Filtering support** for targeted searches

### FastAPI Endpoints
- **Streaming chat** with real-time responses
- **Health checks** and monitoring
- **Error handling** and logging
- **CORS support** for web applications

### Testing & Quality
- **Automated testing** with performance metrics
- **Relevance evaluation** using LLM judgments
- **Benchmarking** for latency and throughput
- **Quality metrics** tracking

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Required | OpenRouter API key (for embeddings) |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant instance URL |
| `QDRANT_API_KEY` | Optional | Qdrant Cloud API key |
| `CHUNK_SIZE` | `1000` | Character count per chunk |
| `CHUNK_OVERLAP` | `200` | Overlap between chunks |
| `TOP_K_CHUNKS` | `5` | Chunks to retrieve |
| `SIMILARITY_THRESHOLD` | `0.7` | Minimum similarity score |

**Note:** `OPENROUTER_API_KEY` replaces `OPENAI_API_KEY` for flexible model access. Get your key at [openrouter.ai](https://openrouter.ai).

### RAG Pipeline Settings

```python
# Customize chunking strategy
chunker = IntelligentChunker(
    chunk_size=1000,    # Target tokens per chunk
    overlap=200,        # Overlap between chunks
)

# Configure retrieval
results = await search_relevant_chunks(
    query_embedding,
    top_k=5,                    # Number of results
    similarity_threshold=0.7,    # Minimum score
    filters={"file_name": "guide.md"}  # Optional filters
)
```

## 📊 Performance Metrics

### Expected Performance
- **Embedding latency**: ~50ms per batch of 100 texts
- **Retrieval latency**: < 500ms for top 5 results
- **Generation latency**: ~1s to first token
- **Streaming latency**: < 100ms per token

### Quality Benchmarks
- **Precision@5**: > 80% for relevant documents
- **Relevance scores**: > 0.7 for good queries
- **Groundedness**: > 90% claims supported by context

## 🧪 Testing

### Running Tests

```bash
# Basic test suite
python scripts/test_rag.py

# With relevance evaluation
python scripts/test_rag.py --evaluate

# Custom queries
python scripts/test_rag.py --queries "Your question here"

# Performance testing
python scripts/test_rag.py --queries $(printf "Question %d\n" {1..100})
```

### Test Results Analysis

The test script provides comprehensive metrics:

```
📊 TEST RESULTS ANALYSIS
==================================================
📈 Total queries: 5

⏱️  Time Metrics:
  Avg retrieval time: 0.234s
  Avg generation time: 1.456s
  Avg total time: 1.690s

🔍 Retrieval Metrics:
  Avg chunks retrieved: 4.2
  Chunk range: 3 - 5

🎯 Relevance Metrics:
  Avg relevance score: 0.842
  Score range: 0.734 - 0.923
```

## 🐳 Docker Deployment

### Development

```bash
# Start all services
docker-compose -f templates/docker-compose.yml up

# Background mode
docker-compose -f templates/docker-compose.yml up -d

# View logs
docker-compose -f templates/docker-compose.yml logs -f rag-api
```

### Production

```bash
# Build and deploy
docker-compose -f templates/docker-compose.yml -f docker-compose.prod.yml up -d

# Scale API
docker-compose -f templates/docker-compose.yml up -d --scale rag-api=3
```

## 🚨 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| **400 - does not support embeddings** | Used chat model instead of embedding model | Use `openai/text-embedding-3-small` |
| **MemoryError during chunking** | Infinite loop when overlap causes backward movement | Add progress checks, skip overlap if needed |
| **Qdrant WriteTimeout** | Too many points in single upsert batch | Batch in groups of 100 points |
| **Found 0 documents** | Hardcoded path doesn't match platform | Try multiple path formats (Windows/WSL/Linux) |
| **Dimension mismatch** | Collection created with different model | Delete and recreate collection |
| **Low relevance scores** | Poor chunking strategy | Adjust `CHUNK_SIZE` and `CHUNK_OVERLAP` |
| **Slow retrieval** | Too many vectors | Add filters, reduce `TOP_K_CHUNKS` |
| **API rate limits** | Too many OpenAI calls | Use batching, increase `RATE_LIMIT_DELAY` |
| **Connection errors** | Qdrant not running | Check `QDRANT_URL`, start Qdrant service |

## 🔍 API Usage

### Chat Endpoint (Streaming)

```bash
curl -X POST "http://localhost:8000/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is RAG?",
    "top_k": 5,
    "similarity_threshold": 0.7
  }'
```

### Search Endpoint

```bash
curl -X GET "http://localhost:8000/api/v1/search?query=chunking&top_k=3"
```

### Health Check

```bash
curl -X GET "http://localhost:8000/health"
```

## 📚 Integration with Other Skills

This skill works seamlessly with other Claude Agent Skills:

- **📖 book-structure-generator**: Generate book structures and ingest them
- **✍️ content-writer**: Create content and immediately make it searchable
- **🚀 deployment-engineer**: Deploy the complete RAG system to production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This skill is part of the Claude Agent Skills framework and follows the same licensing terms.

## 🔗 Additional Resources

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [LangChain Documentation](https://python.langchain.com/docs/)