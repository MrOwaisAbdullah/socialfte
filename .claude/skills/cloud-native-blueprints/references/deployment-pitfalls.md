# Deployment Pitfalls: Local Kubernetes (Minikube)

This document captures real-world implementation issues encountered during TeamFlow's Minikube deployment, including what worked, what didn't, and why.

## Table of Contents

1. [Critical Bug: Hardcoded Localhost URLs](#critical-bug-hardcoded-localhost-urls)
2. [Docker Build Caching Issues](#docker-build-caching-issues)
3. [Minikube Stability Problems](#minikube-stability-problems)
4. [Image Loading Cross-Platform Issues](#image-loading-cross-platform-issues)
5. [Browser Cache Hell](#browser-cache-hell)
6. [Environment Variable Gotchas](#environment-variable-gotchas)
7. [Next.js Rewrites and API Proxy Implementation](#nextjs-rewrites-and-api-proxy-implementation)
8. [Secrets Management in Helm Charts](#secrets-management-in-helm-charts)

---

## Critical Bug: Hardcoded Localhost URLs

### Problem

Frontend making API requests to `http://localhost:8000` instead of relative paths to the same origin.

### Symptoms

- Login fails in browser with network errors
- Browser DevTools shows: `POST http://localhost:8000/api/v1/auth/login`
- Backend API works via curl but not through browser
- Issue persists across different browsers and incognito mode

### Root Cause

**File: `src/lib/api.ts`**
```typescript
// WRONG - Falls back to localhost:8000 when env var is empty string
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  //                                    ^^^^^^^^^^^^^^^^^^^^^^
  //                                    Empty string is falsy, so fallback triggers
});
```

In JavaScript/TypeScript:
```javascript
"" || 'http://localhost:8000'  // Evaluates to 'http://localhost:8000'
```

When `NEXT_PUBLIC_API_URL=""` (empty string), the OR operator treats empty string as falsy and falls back to the localhost URL.

### Solutions That Worked

#### 1. Fix Fallback Logic (Code Change)
```typescript
// CORRECT - Empty string is valid for relative paths
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
});
```

#### 2. Update next.config.ts
```typescript
async rewrites() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";  // Changed from "http://localhost:8000"
  return [
    {
      source: "/v1/:path*",
      destination: `${apiUrl}/api/v1/:path*`,
    },
  ];
},
```

#### 3. Add Cache Busting
```typescript
generateBuildId: () => {
  return `build-${Date.now()}`;
},
```

### What We Tried That Didn't Work

| Attempt | Why It Failed |
|---------|---------------|
| `NEXT_PUBLIC_API_URL="/"` | Still had issues with path concatenation |
| Using rewrites only | Client-side axios still uses baseURL |
| Modifying only `next.config.ts` | JavaScript bundles already baked at build time |
| Deleting browser cache | Bundles served from server still had old code |

### Key Takeaway

**Empty string (`""`) is NOT the same as "not set" in JavaScript OR operators.** For relative paths, explicitly use empty string as the fallback.

---

## Docker Build Caching Issues

### Problem

Docker rebuilds with `--no-cache` flag still resulted in images with old code containing `localhost:8000`.

### Symptoms

- Code changes confirmed in source files
- Docker image timestamp shows it was rebuilt
- Container files still have old hardcoded URLs
- Issue persists after multiple rebuild attempts

### Root Causes

1. **Build cache layers** being reused despite `--no-cache` in some Docker versions
2. **Multi-stage builds** copying from cached intermediate layers
3. **Timestamp mismatch** - Image built BEFORE code changes

### Discovery Process

```bash
# Check when image was created
docker inspect teamflow/frontend:minikube | grep Created

# Check when source file was modified
stat src/lib/api.ts

# Verify actual content in running container
kubectl exec -n teamflow deployment/teamflow-frontend -- cat /app/.next/static/chunks/app/login/page-*.js | grep "localhost:8000"
```

Found that image was created at `18:47:55` but code was modified at `23:38:45`.

### Solutions That Worked

#### 1. Touch File to Invalidate Cache
```bash
touch src/lib/api.ts
```
This forces Docker to treat the file as modified and rebuild dependent layers.

#### 2. Use Windows Docker Instead of Minikube Docker
```bash
# Build with Windows Docker Desktop
docker.exe build --no-cache --build-arg NEXT_PUBLIC_API_URL="" -t teamflow/frontend:minikube

# Then load into Minikube
docker.exe save teamflow/frontend:minikube | (eval "$(minikube docker-env)" && docker load)
```

#### 3. Verify Build ID
```javascript
// next.config.ts
generateBuildId: () => `build-${Date.now()}`
```
Check in browser: `__NEXT_DATA__.buildId` to confirm you're running the new build.

### What We Tried That Didn't Work

| Attempt | Why It Failed |
|---------|---------------|
| `docker build --no-cache` alone | Some cache layers still reused |
| Building inside Minikube Docker env | WSL2 vs Windows Docker separation |
| Just rebuilding, no verification | Old image still referenced by deployment |
| `kubectl rollout restart` before loading image | Restarted pods with same old image |

### Key Takeaway

**Always verify your Docker image actually contains the code you think it does.** Use `docker exec` or `kubectl exec` to inspect actual container files, not just build logs.

---

## Minikube Stability Problems

### Problem

Minikube repeatedly stopped with kubelet and apiserver in "Stopped" state.

### Symptoms

```bash
$ minikube status
type: Control Plane
host: Running
kubelet: Stopped    # ❌
apiserver: Stopped  # ❌
kubeconfig: Configured
```

### Root Causes

1. **Memory allocation too high** - Requested 8192MB but system only had 7858MB
2. **Previous cluster state corruption** - Failed stops leaving inconsistent state
3. **WSL2 resource limits** - Windows WSL2 has tighter memory constraints

### Solutions That Worked

#### 1. Adjust Memory Limits
```bash
# First check available memory
free -h

# Start with appropriate limit
minikube start --driver=docker --cpus=4 --memory=6000
```

#### 2. Complete Cluster Reset
```bash
# Nuclear option - delete everything
minikube stop
minikube delete --all --purge

# Start fresh
minikube start --driver=docker --cpus=4 --memory=6000
```

#### 3. Wait for Full Startup
```bash
# Don't proceed until ALL components show "Running"
watch minikube status

# Should see:
type: Control Plane
host: Running
kubelet: Running    # ✅
apiserver: Running  # ✅
kubeconfig: Configured
```

### What We Tried That Didn't Work

| Attempt | Why It Failed |
|---------|---------------|
| `minikube start --force` | Skipped validations, led to broken cluster state |
| Restarting without delete | Corrupted state persisted |
| Multiple rapid starts | Made instability worse |
| `minikube start` without memory check | Hit system limits |

### Key Takeaway

**Minikube requires clean slate when encountering state issues.** Use `--purge` to completely reset rather than trying to recover from corrupted state.

---

## Image Loading Cross-Platform Issues

### Problem

Docker images built with Windows Docker Desktop not accessible in Minikube (WSL2) Docker environment.

### Symptoms

```bash
# Inside Minikube
$ docker images | grep teamflow/frontend
# (empty - image not found)

# Pods show:
Status:       ImagePullBackOff
Reason:       ErrImageNeverPull
```

### Root Causes

1. **Separate Docker daemons** - Windows Docker Desktop and Minikube Docker are different
2. **Image tag mismatch** - Helm values referenced `latest` but image was built as `minikube`
3. **ImagePullPolicy** - K8s trying to pull from registry instead of using local image

### Solutions That Worked

#### 1. Save and Load Between Docker Environments
```bash
# Build in Windows Docker
docker.exe build -t teamflow/frontend:minikube .
docker.exe save teamflow/frontend:minikube -o D:\\frontend.tar

# Load into Minikube Docker (WSL2)
eval "$(minikube docker-env)"
docker load -i /mnt/d/frontend.tar
```

#### 2. Match Image Tags in Helm Values
```yaml
# helm/teamflow/values.yaml
frontend:
  image:
    tag: minikube  # Must match built tag
```

#### 3. Use ImagePullPolicy: Never
```yaml
# helm/teamflow/values.yaml (optional if image exists locally)
frontend:
  image:
    pullPolicy: Never  # Use local image only
```

Or ensure image is in Minikube Docker before:
```yaml
pullPolicy: IfNotPresent
```

### What We Tried That Didn't Work

| Attempt | Why It Failed |
|---------|---------------|
| Building in Minikube Docker directly | WSL2 path issues, Windows Docker interop problems |
| `docker save | docker load` pipe | Path issues between Windows and WSL2 filesystems |
| Using tag `latest` everywhere | Old cached `latest` image used instead of new build |
| Setting `pullPolicy: Always` | Tried to pull from registry, image doesn't exist there |

### Key Takeaway

**Windows Docker Desktop and Minikube Docker are SEPARATE environments.** You must explicitly transfer images between them using `docker save | docker load`.

---

## Browser Cache Hell

### Problem

Even after fixing code and rebuilding, browser still made requests to old URLs due to aggressive caching.

### Symptoms

- Hard refresh (F5) doesn't help
- Incognito mode initially showed same issue
- Browser DevTools shows old JavaScript bundle names
- `__NEXT_DATA__.buildId` shows old timestamp

### Root Cause

Next.js serves static assets with very long cache headers:

```
Cache-Control: public, max-age=31536000, immutable
```

Browsers cache these for **1 year** and won't even check for updates.

### Solutions That Worked

#### 1. Hard Refresh (Ctrl+Shift+R)
Forces browser to bypass cache and reload everything.

#### 2. Clear Site Data
Chrome DevTools → Application → Clear storage → Clear site data

#### 3. Cache Busting in Build
```typescript
// next.config.ts
generateBuildId: () => {
  return `build-${Date.now()}`;
},
```
This changes all asset URLs on every build, forcing browser to fetch new files.

#### 4. Disable Caching for Development
```typescript
// next.config.ts
productionBrowserSourceMaps: false,
```

### What We Tried That Didn't Work

| Attempt | Why It Failed |
|---------|---------------|
| Normal refresh (F5) | Browser serves from disk cache |
| Closing and reopening browser | Cache persists across sessions |
| Incognito initially | Underlying server was still serving old code |
| Waiting for cache expiry | 1 year is too long to wait |

### Key Takeaway

**Next.js static assets are cached aggressively by design.** Always use cache-busting build IDs during development and test deployments.

---

## Environment Variable Gotchas

### Problem

Environment variables not behaving as expected in Docker/Kubernetes environment.

### Symptoms

- `NEXT_PUBLIC_API_URL` set in ConfigMap but not appearing in app
- Changes to env vars require full rebuild, not just restart
- Different behavior between `docker run` and Kubernetes

### Root Causes

1. **Build-time vs Runtime** - `NEXT_PUBLIC_*` vars are baked into JavaScript at build time
2. **Wrong Docker stage** - Setting env var in runner stage instead of builder stage
3. **Kubernetes env scope** - Pod env vars don't affect already-built static assets

### Solutions That Worked

#### 1. Pass Build Args in Dockerfile
```dockerfile
# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build
```

#### 2. Build with --build-arg
```bash
docker build --build-arg NEXT_PUBLIC_API_URL="" -t teamflow/frontend:minikube
```

#### 3. Set Empty String Explicitly in Helm
```yaml
# helm/teamflow/values.yaml
frontend:
  env:
    NEXT_PUBLIC_API_URL: ""  # Empty string, not omitted
```

### Understanding Next.js Env Variables

| Variable Type | When Available | Where Used | Example |
|---------------|----------------|------------|---------|
| `NEXT_PUBLIC_*` | Build time | Client + Server | `NEXT_PUBLIC_API_URL` |
| Regular env var | Runtime | Server only | `DATABASE_URL` |
| Build arg | Build time | Docker build | `--build-arg NEXT_PUBLIC_API_URL` |

### What We Tried That Didn't Work

| Attempt | Why It Failed |
|---------|---------------|
| Setting `NEXT_PUBLIC_*` in Helm env only | Already baked into static JS at build time |
| Setting env in runner stage | Build already completed, assets already generated |
| Changing values without rebuilding | JavaScript bundles already contain old values |
| Using `process.env` at runtime (for `NEXT_PUBLIC_*`) | Replaced with literal value at build time |

### Key Takeaway

**`NEXT_PUBLIC_*` variables are replaced with literal values at build time.** You must rebuild the Docker image to change them - restarting pods is not enough.

---

## Next.js Rewrites and API Proxy Implementation

### The Challenge

In Kubernetes, the frontend and backend run as separate services. The browser can only access the frontend service (via NodePort or Ingress), but needs to make API calls to the backend.

**Problem:** How to route browser API requests to the backend service without exposing the backend externally?

### Architecture

```
Browser (http://127.0.0.1:46615)
   │
   │ Axios request with baseURL=""
   │
   ▼
Frontend Service (Next.js)
   │
   ├──> /api/*      → Next.js API Route (catch-all proxy)
   │                  → Forwards to Backend Service
   │
   └──> /v1/*       → Next.js Rewrite (server-side)
                      → Also forwards to Backend Service
```

### Solution 1: Next.js Rewrites (Server-Side)

**File: `next.config.ts`**

```typescript
async rewrites() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  return [
    {
      source: "/v1/:path*",
      destination: `${apiUrl}/api/v1/:path*`,
    },
  ];
},
```

**How it works:**
- Browser requests `/v1/auth/login` (relative path, same origin)
- Next.js server rewrites to `/api/v1/auth/login` (internal)
- If `NEXT_PUBLIC_API_URL` is empty, rewrite is relative to current domain

**Pros:**
- Server-side, no additional client-side code needed
- Transparent to browser
- Works with static export

**Cons:**
- Only works for server-rendered pages
- Doesn't work for API routes that need to run on Edge

**Environment Configuration:**
```yaml
# helm/teamflow/values.yaml
frontend:
  env:
    # Empty string = relative paths (browser origin)
    NEXT_PUBLIC_API_URL: ""
    # Internal K8s service URL for Next.js rewrites
    BACKEND_URL: "http://teamflow-backend.teamflow.svc.cluster.local:8000"
```

### Solution 2: Next.js API Route Proxy (Recommended)

**File: `src/app/api/[...path]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://teamflow-backend.teamflow.svc.cluster.local:8000';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

// POST, PUT, PATCH, DELETE follow same pattern...

async function proxyRequest(
  request: NextRequest,
  path: string[]
): Promise<NextResponse> {
  // Reconstruct path: /api/v1/auth/login
  const fullPath = '/api/' + path.join('/');
  const url = new URL(fullPath, BACKEND_URL);
  url.search = request.nextUrl.search;

  // Forward auth token from cookie or header
  const token = request.cookies.get('access_token')?.value ||
                request.headers.get('authorization')?.replace('Bearer ', '');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Forward request to backend
  const response = await fetch(url.toString(), {
    method: request.method,
    headers,
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  // Return response with CORS headers
  const data = await response.text();
  const nextResponse = new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });

  return nextResponse;
}
```

**How it works:**
1. Browser makes request to `/api/v1/auth/login` (relative to frontend origin)
2. Next.js API route catches the request via `[...path]` catch-all
3. Route handler proxies to backend service using internal K8s DNS
4. Returns response with CORS headers

**Key Points:**
- `[...path]` is a catch-all route that matches `/api/*`
- `dynamic = 'force-dynamic'` disables caching (important for API routes)
- Auth token forwarded from cookie or Authorization header
- CORS headers added for cross-origin requests

**Pros:**
- Full control over request/response
- Can add custom headers, auth handling, logging
- Works with client-side navigation
- Can run on Edge runtime

**Cons:**
- More code to maintain
- Adds latency (extra hop)

### Solution 3: Axios Configuration (Client-Side)

**File: `src/lib/api.ts`**

```typescript
import axios from 'axios';

// Create axios instance with base URL
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',  // Empty = relative paths
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // Important for cookies
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
```

### Why We Used Both Solutions

We implemented **both** Next.js rewrites AND API route proxy:

1. **Next.js Rewrites** (`next.config.ts`):
   - Handles `/v1/*` paths
   - Server-side, no additional client code
   - Backup for when API route might have issues

2. **API Route Proxy** (`src/app/api/[...path]/route.ts`):
   - Handles `/api/*` paths
   - More control over auth, CORS, error handling
   - Works for client-side navigation

### Environment Variables Breakdown

| Variable | Scope | Purpose | Example Value |
|----------|-------|---------|---------------|
| `NEXT_PUBLIC_API_URL` | Client (browser) | Axios baseURL for API requests | `""` (empty) for relative paths |
| `BACKEND_URL` | Server (Next.js) | Internal K8s service URL for proxy | `http://teamflow-backend.teamflow.svc.cluster.local:8000` |

### Why Empty String for NEXT_PUBLIC_API_URL?

When `NEXT_PUBLIC_API_URL=""`:
- Axios makes requests to relative paths like `/api/v1/auth/login`
- Browser resolves relative path to current origin (e.g., `http://127.0.0.1:46615/api/v1/auth/login`)
- Next.js API route or rewrite forwards to backend
- No CORS issues (same origin)

### Common Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| `NEXT_PUBLIC_API_URL="http://localhost:8000"` | Browser tries to reach localhost (doesn't work in K8s) | Use empty string `""` |
| `NEXT_PUBLIC_API_URL="http://backend:8000"` | Internal DNS not resolvable from browser | Use empty string, proxy on server |
| Using rewrites only | Doesn't work for client-side nav | Also implement API route proxy |
| Forgetting `dynamic = 'force-dynamic'` | API responses get cached | Add to route file |
| Missing CORS headers | Browser blocks responses | Add CORS headers to proxy |

### Testing the Setup

```bash
# Test that frontend proxy works
curl -X POST "http://127.0.0.1:46615/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}'

# Should return JWT token (proxied to backend via Next.js)

# Test that backend is accessible from frontend pod
kubectl exec -n teamflow deployment/teamflow-frontend -- \
  curl http://teamflow-backend.teamflow.svc.cluster.local:8000/health
```

### Production Considerations

1. **Ingress Configuration:**
```yaml
ingress:
  enabled: true
  hosts:
    - host: teamflow.local
      paths:
        - path: /          # Frontend
          service: teamflow-frontend
        - path: /api       # API proxy
          service: teamflow-frontend
        - path: /v1        # Rewrites
          service: teamflow-frontend
```

2. **Backend NOT Exposed:**
- Backend service remains `ClusterIP` only
- No NodePort or Ingress for backend
- All traffic goes through frontend proxy

3. **Security:**
- Rate limiting at frontend
- Auth token validation
- CORS headers configured correctly

---

## Secrets Management in Helm Charts

### The Challenge

Helm charts need configuration values (database URLs, API keys, secrets) but these should never be committed to git in plaintext.

### Problem: GitHub Push Protection

When you commit actual secrets to values.yaml:

```
remote: error: GH013: Repository rule violations found
remote: - Push cannot contain secrets
remote:   - OpenAI API Key found in helm/teamflow/values.yaml:82
```

GitHub blocks the push to prevent leaking secrets.

### Solution: Example File Pattern

**File Structure:**
```
helm/teamflow/
├── values.yaml.example    # Committed to git (placeholders)
├── values.yaml            # Gitignored (actual secrets)
└── .gitignore             # Contains values.yaml
```

### Implementation

#### 1. Create Example File

**`helm/teamflow/values.yaml.example`** (committed to git):
```yaml
secrets:
  databaseUrl: "postgresql://user:password@host:port/database?sslmode=require"
  openaiApiKey: "sk-proj-your-openai-api-key-here"
  secretKey: "your-secret-key-here"
  betterAuthSecret: "your-betterauth-secret-here"
  geminiApiKey: ""
  openrouterApiKey: ""
  qdrantApiKey: ""
```

#### 2. Local Values File

**`helm/teamflow/values.yaml`** (gitignored, actual secrets):
```yaml
secrets:
  databaseUrl: "postgresql://user:password@host:port/database?sslmode=require"
  openaiApiKey: "sk-proj-your-actual-openai-api-key"
  secretKey: "your-actual-secret-key"
  betterAuthSecret: "your-actual-betterauth-secret"
  geminiApiKey: ""
  openrouterApiKey: ""
  qdrantApiKey: ""
```

#### 3. Update .gitignore

**`.gitignore`** (at repo root or in helm directory):
```
# Helm values with secrets
helm/teamflow/values.yaml
```

Or use pattern for all Helm charts:
```
# Helm values with secrets (keep .example files)
**/values.yaml
!**/values.yaml.example
```

### Team Workflow

#### For New Developers

```bash
# Clone repository
git clone https://github.com/org/repo.git
cd repo

# Copy example to local values
cp helm/teamflow/values.yaml.example helm/teamflow/values.yaml

# Edit with actual secrets
vim helm/teamflow/values.yaml

# Deploy
helm install teamflow ./helm/teamflow -f helm/teamflow/values.yaml
```

#### For Existing Projects

```bash
# If values.yaml already exists locally, it won't be affected
# New clones will need to create values.yaml from example

# Add to .gitignore if not already there
echo "helm/teamflow/values.yaml" >> .gitignore
git add .gitignore

# Create example file from current values (with placeholders)
sed 's/npg_[A-Za-z0-9_@.-]*/user:password@host:port/g' helm/teamflow/values.yaml | \
sed 's/sk-proj-[A-Za-z0-9_]*$/sk-proj-your-openai-api-key-here/g' | \
sed 's/"[a-f0-9]\{64\}"/"your-secret-key-here"/g' > helm/teamflow/values.yaml.example

# Commit the example file
git add helm/teamflow/values.yaml.example
git commit -m "chore: Add values.yaml.example for reference"
```

### Alternative: Using Kubernetes Secrets

For production, use Kubernetes Secrets instead of values.yaml:

```bash
# Create secret from literal values
kubectl create secret generic teamflow-secrets \
  --from-literal=database-url='postgresql://...' \
  --from-literal=openai-api-key='sk-proj-...' \
  -n teamflow

# Or from file
kubectl create secret generic teamflow-secrets \
  --from-env-file=secrets.env \
  -n teamflow
```

**Helm template reference:**
```yaml
# templates/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: teamflow-secrets
type: Opaque
stringData:
  databaseUrl: "{{ .Values.secrets.databaseUrl }}"
  openaiApiKey: "{{ .Values.secrets.openaiApiKey }}"
```

### Environment-Specific Values

For different environments, use multiple value files:

```
helm/teamflow/
├── values.yaml                 # Defaults (committed)
├── values.yaml.example         # Example with placeholders (committed)
├── values-dev.yaml             # Dev environment (gitignored)
├── values-staging.yaml         # Staging environment (gitignored)
└── values-prod.yaml            # Production environment (gitignored, use Secrets)
```

**Deploy with specific values:**
```bash
# Development (local values)
helm install teamflow ./helm/teamflow -f helm/teamflow/values-dev.yaml

# Production (use Kubernetes Secrets)
helm install teamflow ./helm/teamflow \
  --set secrets.databaseUrl=$(kubectl get secret teamflow-db -o jsonpath='{.data.url}' | base64 -d) \
  --set secrets.openaiApiKey=$(kubectl get secret teamflow-secrets -o jsonpath='{.data.openaiApiKey}' | base64 -d)
```

### Git Hooks for Safety

Add a pre-commit hook to prevent accidental secrets commit:

**`.git/hooks/pre-commit`:**
```bash
#!/bin/bash
# Check for potential secrets in values.yaml files
echo "Checking for secrets in Helm values files..."

if git diff --cached --name-only | grep -E 'values\.yaml$' | grep -v 'values\.yaml\.example$'; then
  echo "WARNING: values.yaml files detected in staging area!"
  echo "Ensure these don't contain actual secrets."
  echo "Use values.yaml.example for committed versions."
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
```

**Make executable:**
```bash
chmod +x .git/hooks/pre-commit
```

### What We Tried That Didn't Work

| Attempt | Why It Failed |
|---------|---------------|
| Committing values.yaml with secrets | GitHub push protection blocks it |
| Using `helm secret` plugin | Adds complexity, team members need plugin |
| Base64 encoding in git | Decodable, still a security risk |
| Separate private repo | Overcomplicated for small teams |
| Environment variables only | Hard to manage across different environments |

### Best Practice Summary

| File | Status | Contents | Usage |
|------|--------|----------|-------|
| `values.yaml.example` | ✅ Git | Placeholders | Reference for new setups |
| `values.yaml` | ❌ Gitignore | Actual secrets | Local development |
| `values-dev.yaml` | ❌ Gitignore | Dev secrets | Dev environment |
| `values-prod.yaml` | ❌ Gitignore | Prod secrets | Production (or use K8s Secrets) |

### Production Deployment

For production, NEVER commit secrets. Use one of these approaches:

1. **Kubernetes Secrets:**
```bash
kubectl create secret generic teamflow-secrets --from-literal=key=value -n prod
```

2. **External Secret Managers:**
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault
- Google Secret Manager

3. **Sealed Secrets:**
Encrypt secrets that can be safely committed to git.

4. **Helm Secrets Plugin:**
Encrypt values files with Mozilla SOPS.

### Key Takeaway

**Always separate configuration from secrets.** Commit example files with placeholders to git, keep actual secrets in gitignored local files or use Kubernetes Secrets for production.

---

## Summary Checklist

Before deploying to Minikube, verify:

- [ ] All `NEXT_PUBLIC_*` env vars passed via `--build-arg`
- [ ] Dockerfile sets `ENV` for build args in BUILDER stage
- [ ] Image tag matches Helm values.yaml
- [ ] Image loaded into Minikube Docker environment
- [ ] `minikube status` shows all components "Running"
- [ ] Pods are not in `ImagePullBackOff` or `ErrImageNeverPull`
- [ ] Browser cache cleared or build ID changed
- [ ] Tested with hard refresh (Ctrl+Shift+R)

---

## Commands Reference

```bash
# Check image timestamp vs source file timestamp
docker inspect teamflow/frontend:minikube | grep Created
stat src/lib/api.ts

# Verify content in running container
kubectl exec -n teamflow deployment/teamflow-frontend -- cat /app/.next/static/chunks/app/login/page-*.js | grep "localhost:8000"

# Check what image pods are using
kubectl get pods -n teamflow -o jsonpath='{.items[*].spec.containers[*].image}'

# Force image pull
kubectl delete pod -n teamflow -l app.kubernetes.io/component=frontend

# Complete Minikube reset
minikube stop
minikube delete --all --purge
minikube start --driver=docker --cpus=4 --memory=6000

# Transfer image between Docker environments
docker save teamflow/frontend:minikube | (eval "$(minikube docker-env)" && docker load)
```

---

## Related Resources

- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Kubernetes Image Pull Policy](https://kubernetes.io/docs/concepts/containers/images/#image-pull-policy)
- [Minikube Troubleshooting](https://minikube.sigs.k8s.io/docs/handbook/troubleshooting/)
