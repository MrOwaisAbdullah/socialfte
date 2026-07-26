#!/usr/bin/env python3
"""
Test OpenRouter API connectivity and embedding model.

Run this before full ingestion to verify:
- API key is valid
- Model supports embeddings
- Dimension is correct
"""
import os
import sys


def test_openrouter():
    """Test OpenRouter API with embedding model."""
    # Get API key from environment
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("❌ OPENROUTER_API_KEY not set")
        print("\nSet it with:")
        print("  export OPENROUTER_API_KEY=sk-or-v1-...")
        return False

    try:
        from openai import OpenAI
    except ImportError:
        print("❌ openai package not installed")
        print("\nInstall with:")
        print("  pip install openai")
        return False

    print("="*60)
    print("OpenRouter API & Embedding Model Test")
    print("="*60)

    # Initialize client
    print("\n1. Initializing OpenRouter client...")
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )
    print("   ✅ Client initialized")

    # Test embeddings
    print("\n2. Testing openai/text-embedding-3-small embedding...")
    try:
        print("   🔢 Sending test request...")
        response = client.embeddings.create(
            model="openai/text-embedding-3-small",
            input=["Test sentence for embedding."],
        )

        print(f"   ✅ Embedding successful!")
        print(f"   Model: {response.model}")
        print(f"   Embedding dimension: {len(response.data[0].embedding)}")

        if len(response.data[0].embedding) == 1536:
            print(f"   ✅ Correct dimension (1536)")
        else:
            print(f"   ⚠️  Unexpected dimension: {len(response.data[0].embedding)}")

        print(f"   First 5 values: {response.data[0].embedding[:5]}")

    except Exception as e:
        print(f"   ❌ Embedding API error: {e}")
        print(f"   Error type: {type(e).__name__}")

        # Check for common errors
        error_str = str(e)
        if "400" in error_str or "does not support embeddings" in error_str:
            print("\n   💡 Common cause: Using a chat model instead of embedding model")
            print("   ✅ Solution: Use 'openai/text-embedding-3-small'")
        elif "401" in error_str:
            print("\n   💡 Common cause: Invalid API key")
            print("   ✅ Solution: Check your OPENROUTER_API_KEY")
        elif "402" in error_str:
            print("\n   💡 Common cause: Insufficient credits")
            print("   ✅ Solution: Add credits at https://openrouter.ai/credits")

        print("\n" + "="*60)
        return False

    # Test with multiple inputs
    print("\n3. Testing batch embeddings...")
    try:
        print("   🔢 Sending batch request (3 texts)...")
        response = client.embeddings.create(
            model="openai/text-embedding-3-small",
            input=[
                "First test sentence.",
                "Second test sentence.",
                "Third test sentence.",
            ],
        )

        print(f"   ✅ Batch embedding successful!")
        print(f"   Generated {len(response.data)} embeddings")
        print(f"   All dimensions match: {all(len(e.embedding) == 1536 for e in response.data)}")

    except Exception as e:
        print(f"   ❌ Batch embedding error: {e}")
        print("\n" + "="*60)
        return False

    print("\n" + "="*60)
    print("✅ All tests passed!")
    print("="*60)
    print("\n💡 You're ready to run the ingestion script:")
    print("   python scripts/ingest_documents_v2.py")
    print()

    return True


if __name__ == "__main__":
    success = test_openrouter()
    sys.exit(0 if success else 1)
