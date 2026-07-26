# RAG Setup with Qdrant

This guide explains how to set up Qdrant for Retrieval-Augmented Generation (RAG) within the ChatKit integration.

## Official Documentation

| Resource | URL |
|----------|-----|
| Quick Start | https://qdrant.tech/documentation/quick-start/ |
| Python Client | https://github.com/qdrant/qdrant-client |
| Cloud Console | https://cloud.qdrant.io/ |

## Prerequisites

1.  **Qdrant Cloud Account**: Sign up at [cloud.qdrant.io](https://cloud.qdrant.io/).
2.  **API Key & URL**: Obtain your cluster URL and API Key.
3.  **Python Environment**: Ensure `qdrant-client` and `sentence-transformers` are installed.

## 1. Installation

```bash
pip install qdrant-client sentence-transformers
```

## 2. Ingestion Script (indexer.py)

Create a script to load your documents, generate embeddings, and upload them to Qdrant.

```python
import os
from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

# Configuration
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
COLLECTION_NAME = "documents"

# Initialize Client
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

# Initialize Model (Must match the one used in server.py)
model = SentenceTransformer('all-MiniLM-L6-v2')

# Create Collection if it doesn't exist
client.recreate_collection(
    collection_name=COLLECTION_NAME,
    vectors_config=models.VectorParams(
        size=384,  # Dimension for all-MiniLM-L6-v2
        distance=models.Distance.COSINE
    )
)

# Sample Data
docs = [
    "OpenAI ChatKit is a UI framework for building chat apps.",
    "Gemini 1.5 Pro is a large language model from Google.",
    "Qdrant is a vector database for high-performance search.",
    "FastAPI is a modern web framework for building APIs with Python."
]

# Embed and Upsert
vectors = model.encode(docs)
points = [
    models.PointStruct(
        id=idx,
        vector=vector.tolist(),
        payload={"text": doc}
    )
    for idx, (doc, vector) in enumerate(zip(docs, vectors))
]

client.upsert(
    collection_name=COLLECTION_NAME,
    points=points
)

print(f"Successfully indexed {len(docs)} documents.")
```

## 3. Integration in Server

In your `server.py`, ensure you use the same embedding model to encode the user's query before searching Qdrant.

```python
# In server.py's respond method:

embedder = SentenceTransformer('all-MiniLM-L6-v2')
query_vector = embedder.encode(user_query).tolist()

search_results = qdrant_client.search(
    collection_name="documents",
    query_vector=query_vector,
    limit=3
)
```

## 4. Best Practices

*   **Chunking**: For large documents, split text into smaller overlapping chunks (e.g., 500 characters) before embedding to improve retrieval accuracy.
*   **Async**: Use `QdrantClient(..., prefer_grpc=True)` or the async client methods for better performance in the FastAPI app.
*   **Metadata**: Store source URLs, page numbers, or timestamps in the payload to provide citations in the chat interface.