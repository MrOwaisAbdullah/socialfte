# RAG variant: Next.js + Drizzle + Neon pgvector

For apps already on Next.js + Drizzle ORM + Neon Postgres. Vectors live in Postgres (pgvector),
no separate vector DB. This is the production pattern, not the FastAPI/Qdrant one.

## Stack

| Concern | Choice |
|---------|--------|
| Vector store | Neon Postgres + `pgvector` extension, `vector(N)` column + **HNSW** index |
| ORM | Drizzle (schema + migrations) — but vector search uses **raw SQL** |
| Embeddings | **Provider-pluggable** (see below) — all must output the SAME dimension |
| Retrieval | cosine distance via the `<=>` operator |
| Ingestion queue | Upstash QStash / BullMQ (long jobs off the request path) |

## Embedding providers (pluggable, one dimension)

Select by env var; **every provider must output the same dimension** as the column.

| Provider | When | Dim | Notes |
|----------|------|-----|-------|
| **Jina v5 text-small** (default) | Serverless (Vercel/Netlify) | 1024 | Works without a long-running process; free tier is rate-limited → handle quota |
| **ONNX BGE-M3** (`EMBEDDING_PROVIDER=onnx`) | VPS / Docker host | 1024 | Local, unlimited, multilingual (English + Urdu + Roman Urdu); ~570 MB q8 model |
| **Gemini text-embedding-004** | If standardizing on Google | 768 | Original plan; requires a column at 768 dims |

```ts
const PROVIDER = process.env.EMBEDDING_PROVIDER === 'onnx' ? 'onnx' : 'jina'
const DIMENSIONS = 1024
// ONNX uses a DYNAMIC import so serverless (jina) deployments never load native onnxruntime
// binaries; singleton so the model loads once per process.
let onnxExtractor: Promise<...> | null = null
```

> **Switching providers/dimensions is a migration.** Changing dim (e.g. 768 → 1024) means a new
> `vector(N)` column + re-embed everything. The project did this in migration `0014_bge_m3_1024dim`.

## Schema (`document_chunks`)

```ts
export const documentChunks = pgTable('document_chunks', {
  id, documentId, botId,            // tenant + parent FK (cascade delete)
  content: text(),
  embedding: vector('embedding', { dimensions: 1024 }),
  version: integer().notNull().default(1),   // bumped on re-index; retrieval reads MAX(version)
  // ...
})
// HNSW index for fast ANN search (cosine — matches the <=> queries below):
// CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops)
//   WITH (m = 16, ef_construction = 64);
```

## HNSW tuning (pgvector)

**Build params** (`m`, `ef_construction`) by table size — bigger = better recall, slower build, larger index:

| Rows | `WITH (...)` |
|------|--------------|
| < 100k | `m = 8, ef_construction = 32` |
| 100k–1M | `m = 16, ef_construction = 64` (defaults) |
| > 1M | `m = 16, ef_construction = 128` |
| high precision | `m = 32, ef_construction = 256` |

**Query-time recall** — raise `hnsw.ef_search` (default 40) per session/transaction for better recall at some latency cost:
```sql
SET hnsw.ef_search = 100;
```

**Filtered queries need iterative scan.** When you filter (`WHERE bot_id = ... AND version = ...`),
plain HNSW can return fewer than `LIMIT` rows because the filter prunes the ANN candidate set.
Enable iterative scan so pgvector keeps searching until it has enough matches:
```sql
SET hnsw.iterative_scan = 'strict_order';  -- exact-order results for filtered queries
```
This is the project's exact case (every retrieval filters `bot_id` + `MAX(version)`) — set it, or
your `topK` can silently come back short on bots with many documents.

Operator class: use `vector_cosine_ops` with the `<=>` operator (cosine distance). `vector_ip_ops`
= inner product, `vector_l2_ops` = L2 — pick the one matching your distance metric and queries.

**Versioning matters:** re-ingesting a document inserts new chunks with `version+1`; retrieval
filters to `MAX(version)` per document so old and new chunks never mix mid-reindex.

## Retrieval (raw SQL — Drizzle doesn't model `<=>`)

```ts
export async function retrieveContext(botId, query, opts) {
  if (shouldSkipRag(query)) return []          // skip greetings/short small-talk — saves an embed call
  const topK = opts?.topK ?? DEFAULT_TOP_K
  const queryVector = await embedQuery(query)

  const rows = await db.execute(sql`
    SELECT content, 1 - (embedding <=> ${JSON.stringify(queryVector)}::vector) AS score
    FROM document_chunks
    WHERE bot_id = ${botId}
      AND version = (SELECT MAX(version) FROM document_chunks dc2 WHERE dc2.document_id = document_chunks.document_id)
    ORDER BY embedding <=> ${JSON.stringify(queryVector)}::vector
    LIMIT ${topK * 2}
  `)
  // over-fetch (topK*2), threshold-filter on score, then slice(topK)
}
```

- `<=>` = cosine distance; `1 - distance` = similarity score.
- **Over-fetch then filter**: pull `topK*2`, drop anything below a score threshold, slice to `topK`. Avoids returning weak matches just to fill the count.
- **Always filter `bot_id`** (tenant isolation) — every RAG query is scoped to one tenant.
- `shouldSkipRag()` short-circuits greetings so you don't embed "hi".

## Ingestion pipeline

`upload/scrape → parse → clean → chunk → embed (batched) → insert chunks (version+1)`, run in a
**background job** (QStash/BullMQ), not in the request. Handle `QuotaExhaustedError` from the free
embedding tier by retrying the job later, not failing the upload.

## Anti-patterns (this variant)

- ❌ Adding Qdrant/Pinecone when Neon pgvector already covers it — extra infra for nothing.
- ❌ Mixing embedding dimensions/providers in one column — every vector must match the column dim.
- ❌ Trying to express `<=>` through the Drizzle query builder — use `sql\`\``.
- ❌ Embedding in the request path — long, rate-limited; queue it.
- ❌ Forgetting the `MAX(version)` filter — stale + fresh chunks blend during re-index.
- ❌ Loading ONNX native binaries on serverless — dynamic-import only on the VPS provider.
- ❌ Dropping `bot_id` from the retrieval query — cross-tenant context leak.
