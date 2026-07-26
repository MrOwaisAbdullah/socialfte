#!/usr/bin/env python3
"""
Test Script for RAG Pipeline

This script tests the complete RAG pipeline including:
- Query embedding
- Semantic search
- Response generation
- Performance metrics
"""

import asyncio
import time
import json
import argparse
from typing import List, Dict, Any, Optional
import numpy as np
from dataclasses import dataclass

# Import our RAG components
import openai
from openai import AsyncOpenAI
import qdrant_client
from qdrant_client import QdrantClient
from qdrant_client.models import Filter


@dataclass
class RAGTestConfig:
    """Configuration for RAG testing."""
    openai_api_key: str
    qdrant_url: str
    qdrant_api_key: Optional[str] = None
    collection_name: str = "document_chunks"
    embedding_model: str = "text-embedding-3-small"
    generation_model: str = "gpt-4.1-nano"


@dataclass
class TestResult:
    """Result of a single test query."""
    query: str
    retrieved_chunks: List[Dict[str, Any]]
    response: str
    retrieval_time: float
    generation_time: float
    total_time: float
    relevance_score: Optional[float] = None


class RAGTester:
    """Tests RAG pipeline functionality and performance."""

    def __init__(self, config: RAGTestConfig):
        self.config = config
        self.client = AsyncOpenAI(api_key=config.openai_api_key)
        self.qdrant = QdrantClient(url=config.qdrant_url, api_key=config.qdrant_api_key)

    async def embed_query(self, query: str) -> List[float]:
        """Embed a single query."""
        try:
            response = await self.client.embeddings.create(
                model=self.config.embedding_model,
                input=[query],
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"❌ Error embedding query: {e}")
            raise

    async def search_relevant_chunks(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        score_threshold: float = 0.7,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for relevant document chunks."""
        try:
            # Build filter if provided
            query_filter = None
            if filters:
                query_filter = Filter(
                    must=[{"key": k, "match": {"value": v}} for k, v in filters.items()]
                )

            results = self.client.search(
                collection_name=self.config.collection_name,
                query_vector=query_embedding,
                limit=top_k,
                score_threshold=score_threshold,
                query_filter=query_filter,
            )

            return [
                {
                    "text": hit.payload["text"],
                    "score": hit.score,
                    "file_name": hit.payload.get("file_name", ""),
                    "title": hit.payload.get("title", ""),
                    "chunk_index": hit.payload.get("chunk_index", 0),
                    "token_count": hit.payload.get("token_count", 0),
                }
                for hit in results
            ]

        except Exception as e:
            print(f"❌ Error searching chunks: {e}")
            raise

    async def generate_response(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        max_tokens: int = 500
    ) -> str:
        """Generate response using retrieved context."""
        try:
            # Build context from retrieved chunks
            context = "\n\n---\n\n".join([
                f"From {chunk['file_name']} (relevance: {chunk['score']:.3f}):\n{chunk['text']}"
                for chunk in context_chunks
            ])

            prompt = f"""Using the following context, answer the user's question. If the context doesn't contain enough information, say so.

Context:
{context}

Question: {query}

Answer:"""

            response = await self.client.chat.completions.create(
                model=self.config.generation_model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that answers questions based on the provided context."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=0.1,
            )

            return response.choices[0].message.content

        except Exception as e:
            print(f"❌ Error generating response: {e}")
            raise

    async def test_single_query(self, query: str, **kwargs) -> TestResult:
        """Test a single query through the complete pipeline."""
        start_time = time.time()

        # Step 1: Embed query
        embed_start = time.time()
        query_embedding = await self.embed_query(query)
        embed_time = time.time() - embed_start

        # Step 2: Retrieve relevant chunks
        search_start = time.time()
        retrieved_chunks = await self.search_relevant_chunks(query_embedding, **kwargs)
        search_time = time.time() - search_start

        # Step 3: Generate response
        generation_start = time.time()
        response = await self.generate_response(query, retrieved_chunks)
        generation_time = time.time() - generation_start

        total_time = time.time() - start_time

        return TestResult(
            query=query,
            retrieved_chunks=retrieved_chunks,
            response=response,
            retrieval_time=search_time,
            generation_time=generation_time,
            total_time=total_time,
        )

    async def evaluate_relevance(self, result: TestResult) -> float:
        """Evaluate relevance of retrieved chunks using LLM."""
        try:
            context_summary = "\n".join([
                f"Chunk {i+1}: {chunk['text'][:200]}..."
                for i, chunk in enumerate(result.retrieved_chunks)
            ])

            prompt = f"""Rate how relevant the following retrieved chunks are for answering the question.

Question: {result.query}

Retrieved chunks:
{context_summary}

Rate on a scale of 0.0 to 1.0 where:
- 1.0 = Perfectly relevant and sufficient
- 0.5 = Somewhat relevant, partially sufficient
- 0.0 = Not relevant at all

Respond with just the number (e.g., 0.85):"""

            response = await self.client.chat.completions.create(
                model=self.config.generation_model,
                messages=[
                    {"role": "system", "content": "You are an expert at evaluating document relevance for question answering."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=10,
                temperature=0.1,
            )

            score_text = response.choices[0].message.content.strip()
            try:
                return float(score_text)
            except ValueError:
                print(f"⚠️  Could not parse relevance score: {score_text}")
                return 0.5  # Default to middle score

        except Exception as e:
            print(f"❌ Error evaluating relevance: {e}")
            return 0.5

    async def run_test_suite(self, queries: List[str], evaluate: bool = False) -> List[TestResult]:
        """Run a test suite with multiple queries."""
        print(f"🧪 Running test suite with {len(queries)} queries...")

        results = []
        for i, query in enumerate(queries, 1):
            print(f"\n📝 Query {i}/{len(queries)}: {query}")

            try:
                result = await self.test_single_query(query)

                # Evaluate relevance if requested
                if evaluate:
                    print("🔍 Evaluating relevance...")
                    result.relevance_score = await self.evaluate_relevance(result)

                results.append(result)

                # Print summary
                print(f"  ⏱️  Total time: {result.total_time:.2f}s")
                print(f"  🔍 Retrieved {len(result.retrieved_chunks)} chunks")
                print(f"  📝 Response: {result.response[:100]}...")

                if result.relevance_score is not None:
                    print(f"  🎯 Relevance score: {result.relevance_score:.3f}")

            except Exception as e:
                print(f"  ❌ Error: {e}")

        return results

    def analyze_results(self, results: List[TestResult]) -> Dict[str, Any]:
        """Analyze test results and compute metrics."""
        if not results:
            return {"error": "No results to analyze"}

        # Time metrics
        retrieval_times = [r.retrieval_time for r in results]
        generation_times = [r.generation_time for r in results]
        total_times = [r.total_time for r in results]

        # Retrieval metrics
        chunk_counts = [len(r.retrieved_chunks) for r in results]

        # Relevance scores (if available)
        relevance_scores = [r.relevance_score for r in results if r.relevance_score is not None]

        analysis = {
            "total_queries": len(results),
            "time_metrics": {
                "avg_retrieval_time": np.mean(retrieval_times),
                "avg_generation_time": np.mean(generation_times),
                "avg_total_time": np.mean(total_times),
                "min_total_time": np.min(total_times),
                "max_total_time": np.max(total_times),
            },
            "retrieval_metrics": {
                "avg_chunks_retrieved": np.mean(chunk_counts),
                "min_chunks_retrieved": np.min(chunk_counts),
                "max_chunks_retrieved": np.max(chunk_counts),
            },
        }

        if relevance_scores:
            analysis["relevance_metrics"] = {
                "avg_relevance_score": np.mean(relevance_scores),
                "min_relevance_score": np.min(relevance_scores),
                "max_relevance_score": np.max(relevance_scores),
            }

        return analysis

    def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about the Qdrant collection."""
        try:
            info = self.client.get_collection(self.config.collection_name)
            return {
                "points_count": info.points_count,
                "vector_size": info.config.params.vectors.size,
                "distance": info.config.params.vectors.distance.value,
            }
        except Exception as e:
            return {"error": str(e)}


# Sample test queries
SAMPLE_QUERIES = [
    "What is Retrieval-Augmented Generation?",
    "How does chunking affect RAG performance?",
    "What are the best practices for document processing?",
    "How do I optimize vector similarity search?",
    "What is the role of embeddings in RAG systems?",
]


async def main():
    """Main function to run RAG tests."""
    parser = argparse.ArgumentParser(description="Test RAG pipeline")
    parser.add_argument("--openai-key", help="OpenAI API key", default=os.getenv("OPENAI_API_KEY"))
    parser.add_argument("--qdrant-url", help="Qdrant URL", default=os.getenv("QDRANT_URL", "http://localhost:6333"))
    parser.add_argument("--qdrant-key", help="Qdrant API key", default=os.getenv("QDRANT_API_KEY"))
    parser.add_argument("--collection", help="Collection name", default="document_chunks")
    parser.add_argument("--queries", nargs="+", help="Custom queries to test")
    parser.add_argument("--evaluate", action="store_true", help="Evaluate relevance using LLM")
    parser.add_argument("--top-k", type=int, default=5, help="Number of chunks to retrieve")

    args = parser.parse_args()

    if not args.openai_key:
        print("❌ OpenAI API key is required. Set OPENAI_API_KEY environment variable or use --openai-key")
        return

    # Use custom queries or sample queries
    queries = args.queries if args.queries else SAMPLE_QUERIES

    # Create configuration
    config = RAGTestConfig(
        openai_api_key=args.openai_key,
        qdrant_url=args.qdrant_url,
        qdrant_api_key=args.qdrant_key,
        collection_name=args.collection,
    )

    # Run tests
    tester = RAGTester(config)

    print("🚀 Starting RAG Pipeline Tests")
    print("="*50)

    # Get collection stats
    stats = tester.get_collection_stats()
    print(f"📊 Collection Stats:")
    if "error" in stats:
        print(f"  ❌ {stats['error']}")
    else:
        print(f"  Points: {stats.get('points_count', 'N/A')}")
        print(f"  Vector size: {stats.get('vector_size', 'N/A')}")
        print(f"  Distance: {stats.get('distance', 'N/A')}")

    print(f"\n🎯 Testing with {len(queries)} queries...")

    # Run test suite
    results = await tester.run_test_suite(queries, evaluate=args.evaluate)

    # Analyze results
    analysis = tester.analyze_results(results)

    # Print analysis
    print("\n" + "="*50)
    print("📊 TEST RESULTS ANALYSIS")
    print("="*50)

    if "error" in analysis:
        print(f"❌ {analysis['error']}")
    else:
        print(f"📈 Total queries: {analysis['total_queries']}")

        print(f"\n⏱️  Time Metrics:")
        time_metrics = analysis["time_metrics"]
        print(f"  Avg retrieval time: {time_metrics['avg_retrieval_time']:.3f}s")
        print(f"  Avg generation time: {time_metrics['avg_generation_time']:.3f}s")
        print(f"  Avg total time: {time_metrics['avg_total_time']:.3f}s")
        print(f"  Time range: {time_metrics['min_total_time']:.3f}s - {time_metrics['max_total_time']:.3f}s")

        print(f"\n🔍 Retrieval Metrics:")
        retrieval_metrics = analysis["retrieval_metrics"]
        print(f"  Avg chunks retrieved: {retrieval_metrics['avg_chunks_retrieved']:.1f}")
        print(f"  Chunk range: {retrieval_metrics['min_chunks_retrieved']} - {retrieval_metrics['max_chunks_retrieved']}")

        if "relevance_metrics" in analysis:
            print(f"\n🎯 Relevance Metrics:")
            relevance_metrics = analysis["relevance_metrics"]
            print(f"  Avg relevance score: {relevance_metrics['avg_relevance_score']:.3f}")
            print(f"  Score range: {relevance_metrics['min_relevance_score']:.3f} - {relevance_metrics['max_relevance_score']:.3f}")

    print("="*50)


if __name__ == "__main__":
    import os
    asyncio.run(main())