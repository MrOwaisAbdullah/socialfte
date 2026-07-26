# Local ONNX Embeddings (Provider Switch Pattern)

## Why local ONNX, and why only on VPS

API embedding providers (Jina, OpenAI, etc.) have rate limits and cost money at scale.
Local ONNX is unlimited and free after the model is downloaded.

**But ONNX cannot run on serverless.** A serverless function (Vercel, Netlify) spins up a
fresh process per request, which would re-download ~110 MB on every cold start and time out.
The solution is a **provider switch** controlled by an env var so the codebase works on both
platforms:

```
EMBEDDING_PROVIDER=jina   → serverless (Vercel, Netlify previews) — default
EMBEDDING_PROVIDER=onnx   → long-running container (VPS / Docker) only
```

## Provider switch implementation (BGE-M3 / jina-embeddings-v3)

```ts
// lib/knowledge/embedder.ts
const PROVIDER: 'jina' | 'onnx' = process.env.EMBEDDING_PROVIDER === 'onnx' ? 'onnx' : 'jina'
const DIMENSIONS = 1024

console.log(`[embedder] provider=${PROVIDER} dimensions=${DIMENSIONS}`)

// Dynamic import: serverless never loads the ONNX native runtime.
// Singleton: the pipeline is initialised once per process, not per request.
type OnnxExtractor = (
  texts: string[],
  opts: { pooling: 'cls'; normalize: boolean }
) => Promise<{ tolist(): number[][] }>

let onnxExtractor: Promise<OnnxExtractor> | null = null
function getOnnxExtractor(): Promise<OnnxExtractor> {
  if (!onnxExtractor) {
    console.log('[embedder] loading Xenova/bge-m3 (q8) — first call, may take a moment if not cached')
    onnxExtractor = import('@huggingface/transformers').then(({ pipeline }) => {
      const p = pipeline('feature-extraction', 'Xenova/bge-m3', { dtype: 'q8' })
      void p.then(() => console.log('[embedder] Xenova/bge-m3 loaded and ready'))
      return p
    }) as unknown as Promise<OnnxExtractor>
  }
  return onnxExtractor
}

export async function embedQuery(text: string): Promise<number[]> {
  if (PROVIDER === 'onnx') {
    const extractor = await getOnnxExtractor()
    // BGE-M3: CLS pooling, no query prefix needed
    const output = await extractor([text], { pooling: 'cls', normalize: true })
    return output.tolist()[0]
  }
  // jina path (jina-embeddings-v3, also 1024-dim)...
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (PROVIDER === 'onnx') {
    const results: number[][] = []
    for (let i = 0; i < texts.length; i += 32) {
      const extractor = await getOnnxExtractor()
      const output = await extractor(texts.slice(i, i + 32), { pooling: 'cls', normalize: true })
      results.push(...output.tolist())
    }
    return results
  }
  // jina path...
}
```

## Model choice

### Current production model: Xenova/bge-m3 (1024-dim, multilingual)

| Property | Value |
|---|---|
| Dimensions | **1024** — schema must be `vector(1024)` |
| Model size (q8) | ~570 MB |
| Languages | English, Urdu, Roman Urdu, 100+ others |
| Pooling | **CLS** (not mean) |
| Query prefix | None needed |
| HuggingFace downloads | ~2M/month |

**No query prefix.** Unlike bge-base-en-v1.5, BGE-M3 does not require an instruction
prefix on the query side:
```ts
// embedQuery — no prefix
embedOnnx([text])  // NOT: "Represent this sentence for searching..." + text

// embedTexts — same as always
embedOnnx(chunks)
```

**Pooling is CLS, not mean:**
```ts
// BGE-M3: pooling: 'cls'
await extractor(texts, { pooling: 'cls', normalize: true })
// bge-base-en-v1.5 used: pooling: 'mean'
```

**Jina fallback must also be 1024-dim.** If `EMBEDDING_PROVIDER` is not `onnx`, the Jina
provider must also output 1024-dim to match the schema. Use `jina-embeddings-v3` (natively
1024-dim) — NOT `jina-embeddings-v5-text-small` (768-dim):
```ts
const MODEL_NAME = 'jina-embeddings-v3'  // 1024-dim native
```

**Schema migration required when upgrading from 768 → 1024:**
```sql
-- migration 0014 pattern
DROP INDEX IF EXISTS "document_chunks_embedding_hnsw_idx";
DELETE FROM "document_chunks";  -- all old vectors incompatible
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" TYPE vector(1024);
CREATE INDEX "document_chunks_embedding_hnsw_idx"
  ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### Previous model (English only): Xenova/bge-base-en-v1.5

| Property | Value |
|---|---|
| Dimensions | 768 |
| Pooling | mean |
| Query prefix | Required (`"Represent this sentence for searching relevant passages: "`) |
| Model size (q8) | ~110 MB |

Only use this if you need English-only and want the smaller model size.

## Installation

```bash
npm install @huggingface/transformers
```

This pulls `onnxruntime-node` with native binaries for the current platform. Build the image
on `linux/amd64` (GitHub Actions ubuntu-latest) so the binaries match the Intel CX33.

**Node version required:** `@huggingface/transformers` v4 requires Node `^22.22 || ^24.15 || >=26`.
The Dockerfile must use `node:22-slim` or newer. Node 20 = EBADENGINE at install time,
runtime crash.

## Persistent model cache (Docker volume)

The model downloads to `TRANSFORMERS_CACHE` on first use (~110 MB). Mount a Docker volume
there so a container restart or re-deploy does not re-download:

**In Dokploy** (app → Mounts):
- Container path: `/app/.cache/transformers`
- Type: Volume (give it a name like `octively-model-cache`)

**In the Dockerfile:**
```dockerfile
ENV TRANSFORMERS_CACHE=/app/.cache/transformers
RUN mkdir -p /app/.cache/transformers && chown -R node:node /app/.cache
```

## Memory budget

| Component | RSS estimate |
|---|---|
| Next.js server + app | ~250-400 MB |
| ONNX model (q8 loaded) | ~150-200 MB |
| Peak inference | +50-100 MB |
| **Total peak** | **~500-700 MB** |

The CX33's 8 GB handles this comfortably. The CX23 (4 GB) would be borderline.

## Operational notes

- **Ingest embeddings** run in the QStash job handler (background) — never block chat.
- **Query-time embeddings** (chat retrieval) run in-process per request. At low traffic
  (~10 RPS) the inference adds ~20-50 ms. If it becomes a bottleneck, move to a worker
  thread or a small sidecar.
- **Pre-warm:** call `embedQuery('warmup')` at server startup to load the model before the
  first real request.
- **Switch back:** if the VPS is ever shut down, flip `EMBEDDING_PROVIDER` back to `jina`
  in Dokploy env (no code change, no redeploy of the image).
