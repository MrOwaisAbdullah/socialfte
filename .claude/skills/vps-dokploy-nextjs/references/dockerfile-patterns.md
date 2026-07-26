# Dockerfile + next.config.ts Patterns

## next.config.ts — two mandatory additions

```ts
const nextConfig: NextConfig = {
  // Gate standalone on a Docker-only build flag.
  // Vercel/Netlify use their own output; forcing standalone there breaks them.
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,

  // Native packages (.node binaries) cannot be bundled by the compiler.
  // They are required from node_modules at runtime only (VPS / Docker).
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],

  // ... rest of your config
}
```

## Dockerfile — full battle-tested pattern

```dockerfile
# syntax=docker/dockerfile:1
# Node 22: @huggingface/transformers v4 requires node >=22.22.
# (Node 20 gives EBADENGINE at install time and crashes at runtime.)
ARG NODE_VERSION=22-slim

# ── deps ─────────────────────────────────────────────────────────────────────
# npm workspaces: every workspace listed in root package.json "workspaces"
# must have its package.json present before `npm ci`, or the resolution fails.
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Add one COPY line per workspace listed in the root package.json "workspaces" array.
# Adapt these lines to match YOUR workspace names (check "workspaces" in package.json):
COPY embed/package.json ./embed/package.json
# COPY packages/ui/package.json ./packages/ui/package.json
RUN npm ci --no-audit --no-fund

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# DOCKER_BUILD=1 → next.config.ts emits output: 'standalone'
ENV NODE_ENV=production DOCKER_BUILD=1

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD TIME.
# They must be present here as build-args (passed from CI).
# Server-only secrets (DATABASE_URL, AUTH_SECRET, API keys) are NOT here;
# they are set in Dokploy's env panel at runtime — never baked into the image.
#
# Add one ARG + matching ENV line for every NEXT_PUBLIC_* var in YOUR project.
# Run: grep -r "NEXT_PUBLIC_" .env.example | cut -d= -f1 | sort -u
# to get the full list.
ARG NEXT_PUBLIC_APP_URL
# ARG NEXT_PUBLIC_PORTAL_URL
# ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
# ... add all your NEXT_PUBLIC_* vars here
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# ENV NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL
# ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID

# If your project has a pre-build step (e.g. a widget minification script),
# run it BEFORE `next build` so the build traces the compiled output:
# RUN npm run build:embed && npm run build
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# HOSTNAME=0.0.0.0 makes node server.js bind outside the container.
# EMBEDDING_PROVIDER=onnx → switch local model on (VPS only).
# TRANSFORMERS_CACHE → persist model download across restarts (mount a volume here).
# Set EMBEDDING_PROVIDER=onnx if using local ONNX embeddings.
# Omit (or set to your API provider) if not using ONNX.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# ENV EMBEDDING_PROVIDER=onnx
# ENV TRANSFORMERS_CACHE=/app/.cache/transformers

# The three standalone artifacts:
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Native packages are NOT reliably traced into the standalone bundle.
# Copy them explicitly so the .node binaries physically exist in the image.
# If a transitive native dep still fails, fall back to copying the whole node_modules.
COPY --from=builder --chown=node:node /app/node_modules/@huggingface  ./node_modules/@huggingface
COPY --from=builder --chown=node:node /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=builder --chown=node:node /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common
COPY --from=builder --chown=node:node /app/node_modules/sharp ./node_modules/sharp

# Pre-create the model cache dir and give node user ownership.
RUN mkdir -p /app/.cache/transformers && chown -R node:node /app/.cache

USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

## .dockerignore — keep the build context lean

```
node_modules
.next
.env
.env.*
.env.local
.git
.github
.claude
docs
social-media-posts
video
specs
history
```

Excluding `.env*` prevents secrets from entering the build context even by accident.

## Key decisions explained

| Decision | Why |
|---|---|
| `ARG NODE_VERSION=22-slim` | Transformers.js v4 `engines: "node >=22.22"`. Node 20 = EBADENGINE + runtime crash. |
| Deps stage separate from builder | Docker layer cache: `npm ci` only re-runs when `package*.json` changes. |
| Copy workspace manifests before `npm ci` | npm resolves every workspace path; missing manifests = install failure. |
| `build:embed` before `build` | Next.js build traces `public/embed.js` (the minified file), not the source. |
| NEXT_PUBLIC_* as ARG→ENV | They are inlined at build time; absent = `undefined` in the browser. |
| Explicit native COPY in runner | Standalone tracing doesn't follow `.node` binary imports reliably. |
| `USER node` | Non-root container; principle of least privilege. |
| `HOSTNAME=0.0.0.0` | `node server.js` defaults to localhost (127.0.0.1); won't accept external connections without this. |
