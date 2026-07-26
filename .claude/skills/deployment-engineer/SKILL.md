---
name: deployment-engineer
description: Expert deployment automation for cloud platforms. Handles CI/CD pipelines, container orchestration, infrastructure setup, and production deployments with battle-tested configurations. Specializes in GitHub Actions, Docker, HuggingFace Spaces, and GitHub Pages.
category: devops
version: 1.0.0
---

# Deployment Engineer Skill

## Purpose

Automate and manage production deployments across multiple platforms with zero-downtime, proper monitoring, and rollback capabilities. This skill encapsulates hard-won lessons from real-world deployment scenarios.

## When to Use This Skill

Use this skill when:
- Setting up CI/CD pipelines for web applications
- Deploying to HuggingFace Spaces, Vercel, Netlify, or GitHub Pages
- Configuring Docker containers and orchestration
- Implementing environment-specific configurations
- Troubleshooting deployment failures
- Setting up monitoring and health checks

> **VPS + Dokploy deployments** (Hetzner + Docker Swarm + Traefik): use the dedicated
> `.claude/skills/vps-dokploy-nextjs/` skill instead — it covers the full bootstrap,
> GitHub Actions → GHCR → Dokploy pipeline, Cloudflare SSL setup, and 22 documented
> pitfalls specific to that stack (including Ubuntu 26.04 quirks, ADVERTISE_ADDR, heredoc
> issues in SSH sessions, NEXT_PUBLIC_* build-arg patterns, and more).

## Core Deployment Patterns

### 1. Multi-Platform Deployment Strategy

**Lesson Learned**: Always verify platform-specific requirements before deployment.

```yaml
# .github/workflows/deploy-backend.yml
# Critical patterns discovered through painful debugging:

# 1. Branch Name Consistency
on:
  push:
    # NEVER assume 'main' - always verify actual branch name
    branches: [master]  # Fixed from 'main' after repo inspection

# 2. Authentication for External Services
- name: Deploy to HuggingFace
  env:
    HF_TOKEN: ${{ secrets.HF_TOKEN }}
  run: |
    # Pattern: Use credential helper for Git auth
    git config credential.helper store
    echo "https://hf:$HF_TOKEN@huggingface.co" > ~/.git-credentials
    git remote set-url origin https://hf:$HF_TOKEN@huggingface.co/spaces/${{ env.HF_SPACE_NAME }}

# 3. Error Handling and Verification
- name: Verify Deployment
  run: |
    # Always add post-deployment verification
    curl -f "${{ env.DEPLOY_URL }}/health" || echo "Health check failed - space might still be starting"
```

### 2. Docker Configuration Best Practices

**Lesson Learned**: Order of operations in Dockerfile is critical for build success.

```dockerfile
# backend/Dockerfile - Battle-tested pattern

# 1. Use specific Python version
FROM python:3.11-slim

# 2. Install system dependencies FIRST
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 3. Set working directory early
WORKDIR /app

# 4. Copy requirements BEFORE source code (leverages Docker cache)
COPY pyproject.toml requirements.txt README.md ./

# 5. Install Python dependencies
RUN pip install uv
RUN uv pip install --system -e .

# 6. Copy application code
COPY . .

# 7. Create non-root user AFTER installation
RUN useradd -m -u 1000 user && chown -R user:user /app
USER user

# 8. Expose port and health check
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:7860/health || exit 1

# 9. CMD must be last
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
```

### 3. Environment Variables Management

**Lesson Learned**: Different platforms require different environment variable strategies.

```python
# backend/main.py - Environment loading pattern

from dotenv import load_dotenv

# Load .env for local development
load_dotenv()

class Settings(BaseSettings):
    """Always provide defaults for critical settings"""

    # OpenAI Configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5-nano-2025-08-07")  # Default to stable model

    # Platform Detection
    is_hf_spaces: bool = os.getenv("SPACE_ID") is not None
    is_production: bool = os.getenv("NODE_ENV") == "production"

    @property
    def api_endpoint(self) -> str:
        """Auto-detect API endpoint based on platform"""
        if self.is_hf_spaces:
            # HuggingFace Spaces
            space_name = os.getenv("SPACE_ID", "")
            return f"https://{space_name.replace(' ', '-').lower()}.hf.space"
        elif self.is_production:
            # Production environment
            return os.getenv("API_URL", "")
        else:
            # Local development
            return "http://localhost:7860"
```

### 4. CORS Configuration for Cross-Origin Requests

**Lesson Learned**: Frontend and backend on different domains require explicit CORS setup.

```python
# backend/main.py - CORS configuration

app = FastAPI()

# Dynamic CORS origins based on environment
cors_origins = []
if os.getenv("NODE_ENV") == "production":
    cors_origins = [
        "https://yourusername.github.io",
        "https://yourdomain.com"
    ]
else:
    cors_origins = ["http://localhost:3000", "http://localhost:7860"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 5. Frontend Configuration Pattern

**Lesson Learned**: Frontend must adapt to different deployment environments.

```typescript
// src/theme/Root.tsx - Dynamic API endpoint detection
const getChatkitEndpoint = () => {
  // Check environment variable first
  if (process.env.REACT_APP_CHAT_API_URL) {
    return process.env.REACT_APP_CHAT_API_URL;
  }

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:7860/chat';
  }

  // Production URLs
  if (hostname.includes('github.io')) {
    // GitHub Pages
    return 'https://your-space.hf.space/chat';
  } else if (hostname.includes('hf.space')) {
    // HuggingFace Spaces
    return `https://${hostname}/chat`;
  }

  return '/chat'; // Same domain deployment
};
```

## Common Pitfalls & Solutions

### 1. Branch Name Mismatch
**Problem**: GitHub Actions configured for 'main' but repo uses 'master'
```yaml
# NEVER hard-code branch names
branches: [master]  # Verify with `git branch` first
```

### 2. Docker Build Failures
**Problem**: Permission errors during package installation
```dockerfile
# Install dependencies BEFORE switching to non-root user
RUN uv pip install --system -e .  # As root
USER user  # Switch AFTER installation
```

### 3. Model Compatibility Issues
**Problem**: Using models that require different APIs
```python
# Wrong: gpt-5-nano requires Responses API, not Chat Completions
# Correct: Use compatible models
openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5-nano-2025-08-07")
```

### 4. Query Validation Errors
**Problem**: Backend crashes on short queries like "hi"
```python
# Allow single character queries
if not query or len(query.strip()) < 1:
    raise ValueError("Query must be at least 1 character long")
```

### 5. Missing Health Checks
**Problem**: No way to verify deployment success
```python
@app.get("/health")
async def health_check():
    """Always implement health endpoints"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": await check_database(),
            "openai": bool(os.getenv("OPENAI_API_KEY"))
        }
    }
```

### 6. Hatchling README.md Not Found Error
**Problem**: `pip install -e .` fails with `OSError: Readme file does not exist: README.md`
```dockerfile
# ❌ Wrong - README.md not copied before pip install
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

# ✅ Correct - Copy README.md with pyproject.toml
COPY pyproject.toml README.md ./
RUN pip install --no-cache-dir -e .
```
**Root Cause**: `pyproject.toml` has `readme = "README.md"` but hatchling can't find it during install.
**Files Affected**: `Dockerfile`, `Dockerfile.hf`

### 7. Multiple Dockerfiles Confusion
**Problem**: HuggingFace Spaces uses `Dockerfile` by default, not `Dockerfile.hf`
```bash
# You have TWO files:
Dockerfile       # Used by HF Spaces by default
Dockerfile.hf     # IGNORED by HF Spaces unless specified

# Solution: Keep BOTH files in sync or use one file
# Or specify in README.md frontmatter:
# sdk: docker
# dockerfile: Dockerfile.hf  # Optional override
```
**Lesson Learned**: When you have multiple Dockerfiles, HuggingFace uses `Dockerfile` by default. Either keep them synchronized or explicitly specify which one to use.

### 8. Docusaurus SSR Build Errors
**Problem**: `ReferenceError: window is not defined` or `localStorage is not defined` during build
```typescript
// ❌ Wrong - Runs during SSR build
function setupAPIConfig() {
  window.__API_BASE_URL__ = 'http://localhost:7860';
}
setupAPIConfig(); // Runs immediately at module load

// ✅ Correct - SSR guard
function setupAPIConfig() {
  window.__API_BASE_URL__ = 'http://localhost:7860';
}
if (typeof window !== 'undefined') {
  setupAPIConfig(); // Only runs in browser
}
```

**For AuthContext with localStorage:**
```typescript
// ❌ Wrong - getInitialState accesses localStorage during SSR
const getInitialState = (): AuthState => {
  const tokens = tokenManager.getTokens(); // Uses localStorage
  return { token: tokens.token, ... };
};

// ✅ Correct - SSR guard in init function
const getInitialState = (): AuthState => {
  // Return default state during SSR
  if (typeof window === 'undefined') {
    return {
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    };
  }

  const tokens = tokenManager.getTokens();
  return { token: tokens.token, ... };
};
```
**Files Affected**: `src/clientModules/apiConfig.ts`, `src/context/AuthContext.tsx`

### 9. HuggingFace Spaces Missing Configuration
**Problem**: "Missing configuration in README" error
```yaml
# ❌ Wrong - README.md missing YAML frontmatter
# My Backend

FastAPI backend...

# ✅ Correct - YAML frontmatter at TOP of README.md
---
title: AI Book Backend
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: docker
sdk_version: "3.11"
app_file: main.py
pinned: false
license: mit
---

# AI Book Backend

FastAPI backend...
```
**Root Cause**: HuggingFace Spaces requires YAML configuration in README.md at the ROOT of the repository.
**Files Affected**: `backend/README.md`

### 10. Client Module SSR Execution
**Problem**: Client modules execute during SSR build in Docusaurus
```typescript
// ❌ Wrong - Immediately executes code that needs browser APIs
// src/clientModules/apiConfig.ts
const config = window.location.hostname; // FAILS during build

// ✅ Correct - Lazy execution with guard
// src/clientModules/apiConfig.ts
function setupAPIConfig() {
  if (typeof window !== 'undefined') {
    window.__API_BASE_URL__ = 'http://localhost:7860';
  }
}
// Only call if in browser
if (typeof window !== 'undefined') {
  setupAPIConfig();
}
export default {};
```
**Key Insight**: Docusaurus client modules are bundled server-side. Always check `typeof window !== 'undefined'` before accessing browser APIs.

### 11. Outdated Import Paths After Code Refactoring
**Problem**: Module import errors after code reorganization
```python
# ❌ Old import paths from refactored code
from database.config import get_db, SessionLocal, create_tables
from auth.auth import verify_token

# ✅ Fix: Update to new module structure
from src.core.database import get_async_db, SessionLocal, create_all_tables
from src.core.security import verify_token

# For sync operations in tests/migrations:
from src.core.database import get_sync_db
```
**Common Patterns**:
- `get_db` → `get_async_db` (async) or `get_sync_db` (sync)
- `Session` → `AsyncSession` (async type hints)
- `create_tables` → `create_all_tables`
- `database.config` → `src.core.database`

**Files Affected**: All files referencing old database modules after refactoring

### 12. Missing Configuration Attributes
**Problem**: `AttributeError: 'Settings' object has no attribute 'X'`
```python
# ❌ Settings class missing required attributes
class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    # Missing: openai_api_key, qdrant_url, etc.

# ✅ Fix: Add all required attributes with defaults
class Settings(BaseSettings):
    # Core
    database_url: str = "sqlite:///./database/auth.db"
    jwt_secret_key: str = "your-secret-key"

    # OpenAI (for RAG features)
    openai_api_key: Optional[str] = Field(default=None)
    openai_model: str = "gpt-5-nano-2025-08-07"
    openai_embedding_model: str = "text-embedding-3-small"

    # Qdrant (for vector search)
    qdrant_url: Optional[str] = Field(default=None)
    qdrant_api_key: Optional[str] = Field(default=None)

    # RAG settings
    chunk_size: int = 512
    chunk_overlap: int = 50
    batch_size: int = 32
    max_context_messages: int = 10
```
**Root Cause**: Settings class refactored but main.py still references old attributes.

**Files Affected**: `src/core/config.py`, `main.py`

### 13. Undefined Global Variables in Scripts
**Problem**: `NameError: name 'DATABASE_URL' is not defined` in init scripts
```python
# ❌ Using undefined global variable
print(f"Initializing database at: {DATABASE_URL}")

# ✅ Fix: Use Settings object
from src.core.config import settings
print(f"Initializing database at: {settings.database_url_sync}")
```
**Files Affected**: `init_database.py`, startup scripts

### 14. HuggingFace Spaces Docker Build Issues
**Problem**: Docker build fails with various errors on HuggingFace Spaces

| Error | Cause | Solution |
|-------|--------|----------|
| `OSError: Readme file does not exist: README.md` | pyproject.toml references README.md but Dockerfile doesn't copy it | `COPY pyproject.toml README.md ./` before `pip install -e .` |
| `ModuleNotFoundError: No module named 'X'` | Outdated import paths after refactoring | Update all imports to new module structure |
| `AttributeError: 'Settings' object has no attribute 'X'` | Settings class missing attributes | Add all required attributes to Settings class |
| `NameError: name 'VAR' is not defined` | Using undefined global variables | Use `from src.core.config import settings` and access via settings object |
| `Config file '.env' not found` | Missing .env file (warning only) | Ensure all required env vars set in HF Space secrets |
| `AttributeError: 'AsyncSession' object has no attribute 'query'` | Using sync query() with AsyncSession | Use `await db.execute(select(Model))` instead of `db.query(Model)` |
| `asyncpg.exceptions._base.InterfaceError: connection is closed` | Database connection pool giving stale connections | Add `pool_pre_ping=True` and reduce `pool_recycle` to 1800 for Neon |

### 15. Database Initialization in Async Context
**Problem**: Trying to use async functions in sync context during startup
```python
# ❌ Wrong: Calling async function without await
async def create_all_tables():
    await conn.run_sync(Base.metadata.create_all)

# In startup sync context:
create_all_tables()  # Doesn't actually create tables!

# ✅ Fix: Use sync engine for startup
from src.core.database import sync_engine, Base
Base.metadata.create_all(sync_engine)

# OR use async properly:
import asyncio
asyncio.create_task(create_all_tables())  # Fire and forget
```
**Files Affected**: `main.py` lifespan function, `init_database.py`

### 16. AsyncSession Query Method Error (Runtime)
**Problem**: `AttributeError: 'AsyncSession' object has no attribute 'query'`
```python
# ❌ Wrong: Using sync query() method with AsyncSession
@router.get("/users")
async def get_users(db: AsyncSession = Depends(get_async_db)):
    users = db.query(User).all()  # Error: AsyncSession has no 'query'
    return users

# ✅ Fix: Use select() with execute() for async
from sqlalchemy import select

@router.get("/users")
async def get_users(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users

# For single record:
result = await db.execute(select(User).filter(User.id == user_id))
user = result.scalar_one_or_none()

# For filtering:
result = await db.execute(
    select(User).filter(User.email == email)
)
user = result.scalar_one_or_none()
```
**Common Async Patterns:**
- `db.query(Model).filter(...).first()` → `result = await db.execute(select(Model).filter(...)); user = result.scalar_one_or_none()`
- `db.query(Model).all()` → `result = await db.execute(select(Model)); users = result.scalars().all()`
- `db.commit()` → `await db.commit()`
- `db.refresh(obj)` → `await db.refresh(obj)`
- `db.add(obj)` → `db.add(obj)` (no await needed)
- `db.delete(obj)` → `await db.delete(obj)` (if iterating) or use delete statement

**Files Affected**: All files using AsyncSession (routes, services, auth modules)

**Critical**: When converting from sync to async SQLAlchemy, ALL database operations must use the async pattern.

### 17. Database Connection Closed Error (Runtime)
**Problem**: `asyncpg.exceptions._base.InterfaceError: connection is closed`
```
Database session error: (sqlalchemy.dialects.postgresql.asyncpg.InterfaceError)
<class 'asyncpg.exceptions._base.InterfaceError'>: connection is closed
```
**Cause**: Database connection pool giving stale/closed connections, especially after idle periods.

**Fix**: Configure async engine with proper pool settings:
```python
# ❌ Wrong: Missing pool_pre_ping and incorrect pool settings
async_engine = create_async_engine(
    settings.database_url_async,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,  # Too long for Neon's 5-min idle timeout
    # Missing pool_pre_ping
)

# ✅ Fix: Add pool_pre_ping and optimize settings for async
async_engine = create_async_engine(
    settings.database_url_async,
    echo=settings.debug,
    pool_size=3,  # Reduced from 5 for async
    max_overflow=5,  # Reduced from 10
    pool_timeout=30,
    pool_recycle=1800,  # 30 min (reduced from 3600 for Neon's idle timeout)
    pool_pre_ping=True,  # CRITICAL: Verify connections before use
    connect_args={
        "server_settings": {
            "application_name": "ai_book_backend",
            "timezone": "utc"
        },
        "command_timeout": 60,
        # Note: SSL configured via DATABASE_URL (sslmode=require)
    },
    pool_use_lifo=True,  # Use LIFO to reduce stale connections
    pool_drop_on_rollback=False,
)
```

**Common Issues:**
1. **Neon PostgreSQL idle timeout**: Free tier closes connections after 5 minutes of inactivity
2. **Missing pool_pre_ping**: Connections become stale but pool reuses them
3. **SSL misconfiguration**: Setting `ssl` directly in connect_args doesn't work with asyncpg
4. **Pool too large**: Async connections use more resources, keep pool smaller

**Files Affected**: `src/core/database.py`

**Critical for Neon PostgreSQL**: Reduce `pool_recycle` to 1800 (30 min) or less, and always use `pool_pre_ping=True`.

### 18. Vercel Monorepo Build Configuration
**Problem**: Vercel build fails with infinite loop or module resolution errors when building from subdirectory

**Issue A: Infinite npm install loop**
```json
// ❌ Wrong: Root package.json with install script
{
  "name": "monorepo",
  "scripts": {
    "install": "cd frontend && npm install"  // INFINITE LOOP!
  }
}
```
**Cause**: When Vercel builds from `frontend/` subdirectory (set via Root Directory setting), it runs `npm install` which triggers the root's install script, which runs `npm install` again, creating infinite loop.

**Solution**: Either remove root `package.json` entirely OR remove the `install` script:
```json
// ✅ Correct: No install script at root
{
  "name": "monorepo",
  "scripts": {
    "build": "cd frontend && npm run build",
    "vercel-build": "cd frontend && npm run build"
    // NO "install" script!
  }
}
```

**Issue B: Module resolution failures**
```
Module not found: Can't resolve '@/lib/api'
Import map: aliased to relative './src/lib/api' inside of [project]/teamflow-web/frontend
```
**Cause**: Root `.gitignore` has `lib/` pattern that ignores ALL `lib/` directories, including `frontend/src/lib/`. Files not tracked in git = not available during Vercel build.

**Solution**: Add exceptions for required lib directories:
```gitignore
# Root .gitignore

# Python lib directories
lib/
lib64/

# But keep specific package lib directories
!teamflow_console/lib/
!teamflow-web/frontend/src/lib/  # ADD THIS EXCEPTION
```

Then force-add the ignored files:
```bash
git add -f teamflow-web/frontend/src/lib/
git commit -m "Add lib files to git"
```

**Issue C: Workspace configuration conflicts**
```json
// ❌ Wrong: Workspace config conflicts with Vercel root directory setting
{
  "workspaces": ["teamflow-web/frontend"]
}
```
**Cause**: When Vercel Root Directory is set to `teamflow-web/frontend`, having workspace config at root creates conflicts in how dependencies are resolved.

**Solution**: When using Vercel with manual root directory setting, avoid workspace configuration at root. Let Vercel build the subdirectory independently.

**Best Practice for Vercel Monorepo Deployment:**
1. Set "Root Directory" in Vercel project settings to your app subdirectory (e.g., `teamflow-web/frontend`)
2. Do NOT create root `package.json` with install scripts or workspace configuration
3. Ensure all required files are tracked in git (check with `git ls-files`)
4. Use the subdirectory's own `package.json` for all build configuration

**Files Affected**: Root `package.json`, root `.gitignore`, Vercel project settings

**Verification Commands:**
```bash
# Check if files are tracked in git
git ls-files path/to/lib/

# Test build locally from subdirectory
cd teamflow-web/frontend
npm install
npm run build
```

### 19. HuggingFace Spaces Auto-Rebuild Issue
**Problem**: Files are successfully pushed to HuggingFace Space via git, but the Space doesn't automatically rebuild. Requires manual restart.

**Error Pattern:**
```
Git push succeeds: "To https://huggingface.co/spaces/xxx/main"
Space status: "Running" (old code)
Must click: "Factory restart" or "Restart" button
```

**Cause**: HuggingFace Spaces don't automatically detect new commits when pushed via GitHub Actions. The files exist but the build isn't triggered.

**Solution**: Use HuggingFace Hub API to trigger restart after pushing files:
```python
from huggingface_hub import HfApi

api = HfApi(token=HF_TOKEN)
api.restart_space(repo_id=SPACE_NAME, repo_type="space", token=HF_TOKEN)
```

**GitHub Actions Step:**
```yaml
- name: Trigger HuggingFace Space Rebuild
  env:
    HF_TOKEN: ${{ secrets.HF_TOKEN }}
    HF_SPACE_NAME: ${{ secrets.HF_SPACE_NAME }}
  run: |
    pip install huggingface_hub --quiet

    python3 << 'EOF'
    from huggingface_hub import HfApi
    import os

    api = HfApi(token=os.environ["HF_TOKEN"])

    # Trigger restart (this forces rebuild)
    api.restart_space(
        repo_id=os.environ["HF_SPACE_NAME"],
        repo_type="space",
        token=os.environ["HF_TOKEN"]
    )
    print("✅ Space restart triggered successfully!")
    EOF
```

**Files Affected**: `.github/workflows/deploy.yml`

**Key Points:**
- Files are pushed via git (traditional method)
- Then restart is triggered via API (modern method)
- This ensures Space rebuilds automatically
- No manual intervention needed

---

### 20. Next.js Standalone Output for Docker/VPS (not Vercel/Netlify)
**Problem**: `node server.js` fails (`Cannot find module`) because the image doesn't contain the standalone server, OR Vercel/Netlify deploys break because `output: 'standalone'` was forced on for everyone.

**Cause**: Next.js only emits `.next/standalone/server.js` when `output: 'standalone'` is set, but that mode is only wanted for the self-hosted Docker/VPS build. Vercel and Netlify use their own output and should be left untouched.

```ts
// ❌ Wrong - forces standalone everywhere, breaks managed platforms
const nextConfig = { output: 'standalone' }

// ✅ Correct - conditional on a Docker-only build flag
const nextConfig = {
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
}
```
**Dockerfile sets the flag and copies the three standalone artifacts:**
```dockerfile
ENV DOCKER_BUILD=1            # builder stage, before `next build`
# runner stage:
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
CMD ["node", "server.js"]
```
**Key**: standalone traces only the modules it detects via static analysis. Set `HOSTNAME=0.0.0.0` so the server binds outside the container.
**Files Affected**: `next.config.ts`, `Dockerfile`

### 21. Native Packages Not Traced into the Standalone Bundle
**Problem**: Runtime `Cannot find module 'onnxruntime-node'` (or any package with `.node` binaries) even though it's in `package.json`. Next.js standalone tracing does not reliably include native addons.

**Fix (two parts):**
```ts
// 1. Keep native, server-only packages OUT of the compiler bundle
const nextConfig = {
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
}
```
```dockerfile
# 2. Copy the native modules explicitly into the runner (belt-and-suspenders)
COPY --from=builder /app/node_modules/@huggingface ./node_modules/@huggingface
COPY --from=builder /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=builder /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
# Fallback if a transitive native dep still goes missing: copy the whole node_modules.
```
**Key**: `serverExternalPackages` stops bundling/mangling; the explicit `COPY` guarantees the `.node` binaries physically exist in the image. Use a dynamic `import()` in code so platforms that don't use the native path never load it.
**Files Affected**: `next.config.ts`, `Dockerfile`, the module doing the dynamic import

### 22. Node Engine Mismatch (EBADENGINE) for ONNX/Transformers
**Problem**: `npm install` warns `EBADENGINE` and the runtime later crashes. `@huggingface/transformers` v4 requires Node `^22.22 || ^24.15 || >=26`.

```dockerfile
# ❌ Wrong - Node 20 base, transformers v4 silently incompatible
ARG NODE_VERSION=20-slim

# ✅ Correct - match the package's engines field
ARG NODE_VERSION=22-slim
```
**Lesson**: When adding any heavy native dependency, check its `engines` field FIRST and bump the Docker base image to match. EBADENGINE is a warning, not an error, so it's easy to miss until runtime.
**Files Affected**: `Dockerfile`

### 23. NEXT_PUBLIC_* Are Build-Time, Server Secrets Are Runtime
**Problem**: Either `NEXT_PUBLIC_*` values come out `undefined` in the browser, OR server secrets get baked into the image (a leak).

**Rule**: `NEXT_PUBLIC_*` are inlined into the client bundle **at build time** — they must be present as Docker `ARG`/`ENV` during `next build`. Everything else (DB URL, auth secret, API keys) is read **at runtime** and must be injected by the host (Dokploy/K8s env), never copied into the image.
```dockerfile
# builder stage - public vars become real values at build
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build
# runner stage - NO server secrets here; set them in the platform's env panel
```
```yaml
# CI passes only public vars as build-args (from GH secrets)
build-args: |
  NEXT_PUBLIC_APP_URL=${{ secrets.NEXT_PUBLIC_APP_URL }}
```
Add server secrets to `.dockerignore` (`.env`, `.env.*`) so they can't sneak into the build context.
**Files Affected**: `Dockerfile`, `.dockerignore`, CI workflow

### 24. npm Workspaces Break `npm ci` in Docker
**Problem**: `npm ci` fails in the deps stage with a missing-workspace error because only the root `package.json` was copied.

**Cause**: `npm ci` resolves every workspace listed in the root `package.json` `workspaces` array; their `package.json` files must exist in the build context.
```dockerfile
# ❌ Wrong - workspace package.json missing
COPY package.json package-lock.json ./
RUN npm ci

# ✅ Correct - copy each workspace's manifest before ci
COPY package.json package-lock.json ./
COPY embed/package.json ./embed/package.json
RUN npm ci --no-audit --no-fund
```
**Files Affected**: `Dockerfile`

### 25. Dokploy Deploy: Build Off-Box, Trigger via API
**Problem**: Building the Docker image on a small VPS (e.g. Hetzner CX33, 4 vCPU) is slow and can OOM. And pushing code alone doesn't redeploy.

**Pattern**: Build the image in GitHub Actions, push to GHCR, then call Dokploy's API to pull + deploy. Match the image platform to the VPS CPU arch.
```yaml
- uses: docker/build-push-action@v6
  with:
    platforms: linux/amd64        # Intel/AMD VPS; use arm64 for Ampere/Graviton
    push: true
    tags: ghcr.io/${{ github.repository_owner }}/app:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
- name: Trigger Dokploy deploy
  run: |
    curl -fsSL -X POST "${{ secrets.DOKPLOY_URL }}/api/application.deploy" \
      -H "x-api-key: ${{ secrets.DOKPLOY_API_KEY }}" \
      -H "Content-Type: application/json" \
      -d '{"applicationId":"${{ secrets.DOKPLOY_APP_ID }}"}'
```
**Chicken-and-egg**: `DOKPLOY_URL` / `DOKPLOY_API_KEY` / `DOKPLOY_APP_ID` can't be set as CI secrets until Dokploy is installed on the VPS and the app is created. Order: provision VPS → install Dokploy → create app → grab IDs → set GH secrets → push the release branch. GHCR auth uses the built-in `GITHUB_TOKEN` (`packages: write` permission), no extra secret.
**Files Affected**: `.github/workflows/deploy.yml`

### 26. Self-Hosted ONNX Embeddings: Cache Volume + Schema-Matched Dimensions
**Problem**: The embedding model re-downloads (~110 MB) on every container restart, and/or switching from an API embedder to a local one breaks the vector DB because the dimension changed.

**Fixes:**
- Mount a **persistent volume** at the model cache path so the download survives restarts:
  ```dockerfile
  ENV TRANSFORMERS_CACHE=/app/.cache/transformers   # mount a volume here in Dokploy/K8s
  ```
- **Pick a model whose dimension matches the existing `vector(N)` column** to avoid a migration. `bge-base-en-v1.5` is 768-dim (drop-in for a 768 schema); `bge-large` is 1024 and `bge-small` is 384, both of which force a pgvector column + HNSW index rebuild.
- Use a **provider switch** (env var) so serverless deploys keep the API embedder and only the long-running VPS uses ONNX — ONNX's native runtime cannot run on a serverless function:
  ```ts
  const PROVIDER = process.env.EMBEDDING_PROVIDER === 'onnx' ? 'onnx' : 'api'
  ```
- BGE models want a query instruction prefix on the **query side only** (`"Represent this sentence for searching relevant passages: "`); passages are embedded as-is.
**Files Affected**: embedder module, `Dockerfile`, `.env.example`, host volume config

---

### 27. GHCR Push Fails: "repository name must be lowercase"
**Problem**: GitHub Actions fails instantly with:
```
invalid tag "ghcr.io/YourName/app:latest": repository name must be lowercase
```

**Root cause**: `${{ github.repository_owner }}` preserves the original GitHub username casing (e.g. `MrOwaisAbdullah`). Docker/GHCR requires all-lowercase image names.

**Fix**: Hardcode the lowercase image name in the workflow env:
```yaml
env:
  # Do NOT use github.repository_owner — it preserves casing (e.g. MrOwaisAbdullah)
  IMAGE: ghcr.io/yourusername/your-app   # always lowercase
```

---

### 28. `npm ci` Fails: "Missing: @package@x.y.z from lock file" (cross-platform optional deps)
**Problem**: Docker build fails at `npm ci` with:
```
npm error Missing: @some-package@x.y.z from lock file
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync
```
...even though the package IS visually present in `package-lock.json`.

**Root cause**: A cpu-specific optional package (e.g. `@rolldown/binding-wasm32-wasi`, cpu: wasm32) is in the lock file and pins a dependency to an exact version. On a linux-x64 machine, `npm install` never downloads wasm32 packages, so their nested exact-version entries are never written to the lock file. `npm ci` on linux/amd64 CI then can't find those exact versions and fails. Upgrading npm (10→11) does not fix this — the lock file is genuinely incomplete for cross-platform optional entries.

**Fix**: Use `npm install` instead of `npm ci` in the Dockerfile deps stage:
```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
# Upgrade npm to match local version (node:22-slim ships with npm 10).
RUN npm install -g npm@11 --quiet
COPY package.json package-lock.json* ./
COPY embed/package.json ./embed/package.json
# npm install (not npm ci) — cross-platform optional packages pin exact dep versions
# that are never written to the lock file on linux-x64, causing npm ci to fail.
RUN npm install --no-audit --no-fund
```

**Prevention**: Docker layer caching means `npm install` is just as fast as `npm ci` after the first run — the install layer only re-executes when `package.json` or `package-lock.json` changes.

---

### 29. `next build` Fails: SDK Throws "Missing API key" During Page Data Collection
**Problem**: Build passes TypeScript but fails at "Collecting page data" with:
```
Error: Missing API key. Pass it to the constructor `new Resend("re_123")`
Error: Failed to collect page data for /api/auth/[...all]
```

**Root cause**: An SDK (Resend, Stripe, Twilio, etc.) is instantiated at module level and its constructor throws when the env var is `undefined`. Runtime secrets are intentionally absent from the Docker builder stage — they live in the deployment platform's env panel (Dokploy, Railway, etc.) and are injected at container startup. `next build` evaluates all route modules to extract static params, which triggers module-level SDK instantiation and the throw.

**Fix**: Add a non-empty fallback so the constructor doesn't throw at build time:
```ts
// Before — throws at build time when RESEND_API_KEY is not set
export const resend = new Resend(process.env.RESEND_API_KEY)

// After — loads cleanly at build time; fails gracefully at runtime if key missing
export const resend = new Resend(process.env.RESEND_API_KEY ?? 'not-configured')
```

Apply to any SDK that throws on a missing key in its constructor: Resend, Stripe, SendGrid, Twilio, etc.

**Key distinction:**
- `NEXT_PUBLIC_*` vars → pass as Docker `ARG`/`ENV` build args, present at `next build` ✓
- Server secrets (`RESEND_API_KEY`, `DATABASE_URL`, etc.) → injected at runtime by platform, NOT present at build time — must handle gracefully ✓

---

### 30. Dokploy Deploy Webhook Returns 404
**Problem**: CI deploy job fails with:
```
curl: (22) The requested URL returned error: 404
```

**Root cause**: The `DOKPLOY_APP_ID` secret points to an application that doesn't exist in the Dokploy panel — either it was never created, or the wrong ID was copied. A 404 (not a connection error) confirms that `DOKPLOY_URL` and `DOKPLOY_API_KEY` are correct — only the application lookup fails.

**Fix**:
1. Open the Dokploy panel → create a new Application (Source: Docker Image)
2. Get the Application ID from the URL: `.../project/xxx/application/APP_ID_HERE`
3. Update the `DOKPLOY_APP_ID` GitHub secret
4. Re-run the failed deploy job from the Actions tab — no code push needed

---

### 31. GitHub Actions Node.js 24 Deprecation Warning
**Problem**: Every CI run shows:
```
Node.js 20 actions are deprecated. Actions will be forced to run with Node.js 24
by default starting June 16th, 2026.
```

**Root cause**: `actions/checkout@v4`, `docker/login-action@v3`, etc. run on Node.js 20 internally. GitHub forced the switch to Node.js 24 on June 16, 2026.

**Fix**: Add one env var to the workflow to opt in explicitly and silence the warning:
```yaml
env:
  IMAGE: ghcr.io/yourname/app
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
```

---

## HuggingFace Spaces Deployment: Complete Guide

### Critical Requirements

**1. README.md with YAML Frontmatter (REQUIRED)**
```yaml
---
title: AI Book Backend
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: docker
sdk_version: "3.11"
app_file: main.py
pinned: false
license: mit
---
```
Must be at ROOT of repository with YAML at the TOP.

**2. Dockerfile Requirements**
```dockerfile
# MUST copy README.md before pip install
COPY pyproject.toml README.md ./
RUN pip install --no-cache-dir -e .

# Not just:
COPY pyproject.toml ./  # ❌ Will fail if pyproject.toml has readme field
```

**3. Environment Variables (Set in Space Settings)**
```
JWT_SECRET_KEY=your-super-secret-jwt-key-at-least-32-chars
DATABASE_URL=sqlite:///./database/auth.db
ALLOWED_ORIGINS=https://your-frontend.github.io,https://huggingface.co
```

**4. Import Path Consistency**
All Python imports must use the new module structure:
```python
# Old (broken):
from database.config import get_db
from auth.auth import verify_token

# New (working):
from src.core.database import get_async_db
from src.core.security import verify_token
```

**5. Database Session Types**
```python
# For async endpoints (most FastAPI routes):
from src.core.database import get_async_db
from sqlalchemy.ext.asyncio import AsyncSession

@router.get("/users")
async def get_users(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(User))
    return result.scalars().all()

# For sync operations (migrations, scripts):
from src.core.database import get_sync_db, sync_engine
from sqlalchemy.orm import Session

def run_migration():
    Base.metadata.create_all(sync_engine)
```

### Common Startup Sequence Failures

**Pattern 1: Import Errors**
```
File "/app/main.py", line 56, in <module>
    from routes import auth
File "/app/routes/auth.py", line 9, in <module>
    from database.config import get_db
ModuleNotFoundError: No module named 'database.config'
```
**Solution**: Update ALL import paths across the codebase.

**Pattern 2: Attribute Errors**
```
AttributeError: 'Settings' object has no attribute 'openai_api_key'
```
**Solution**: Add missing attributes to `src/core/config.py` Settings class.

**Pattern 3: Database Initialization Errors**
```
NameError: name 'DATABASE_URL' is not defined
```
**Solution**: Import settings and use `settings.database_url_sync`.

**Pattern 4: AsyncSession Query Errors (Runtime)**
```
AttributeError: 'AsyncSession' object has no attribute 'query'
```
**Solution**: Convert all database queries to async pattern using `select()`:
```python
# Replace db.query() with:
from sqlalchemy import select
result = await db.execute(select(Model).filter(...))
item = result.scalar_one_or_none()
```

**Pattern 5: Database Connection Closed (Runtime)**
```
asyncpg.exceptions._base.InterfaceError: connection is closed
```
**Solution**: Add `pool_pre_ping=True` to async engine and reduce `pool_recycle`:
```python
async_engine = create_async_engine(
    settings.database_url_async,
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=1800,   # 30 min (for Neon's idle timeout)
    pool_use_lifo=True,  # Use most recent connections first
)
```

### Production Deployment Checklist for HuggingFace Spaces

**Before Pushing:**
- [ ] README.md has YAML frontmatter at ROOT
- [ ] Dockerfile copies README.md before pip install
- [ ] All import paths updated to new structure
- [ ] Settings class has all required attributes
- [ ] Environment variables documented in `.env.hf-template`

**In HuggingFace Space Settings:**
- [ ] Set JWT_SECRET_KEY (required)
- [ ] Set DATABASE_URL (defaults to sqlite if not set)
- [ ] Set ALLOWED_ORIGINS (your frontend domain)
- [ ] Set OPENAI_API_KEY (if using RAG features)
- [ ] Set QDRANT_URL and QDRANT_API_KEY (if using vector search)

**After Deployment:**
- [ ] Check logs for startup errors
- [ ] Test `/health` endpoint
- [ ] Visit `/docs` for Swagger UI
- [ ] Test authentication endpoints
- [ ] Verify CORS with frontend requests

### Troubleshooting HuggingFace Spaces

**Issue**: "Config error" in Space UI
- **Fix**: Add YAML frontmatter to README.md

**Issue**: Build fails at pip install
- **Fix**: Ensure Dockerfile copies README.md with pyproject.toml

**Issue**: Module import errors
- **Fix**: Update all import paths from old structure to new `src.core.*` structure

**Issue**: AttributeError on startup
- **Fix**: Add missing configuration to Settings class

**Issue**: Database initialization fails
- **Fix**: Use sync operations in init scripts, ensure proper imports

## Deployment Checklist

### Pre-Deployment
- [ ] Verify branch names in workflows match actual branches
- [ ] Test Docker build locally: `docker build -t test .`
- [ ] Run container locally: `docker run -p 7860:7860 test`
- [ ] Check all environment variables are documented
- [ ] Validate API endpoints with health checks
- [ ] Test CORS configuration in browser dev tools

**For Vercel Monorepo Deployments:**
- [ ] Verify no root `package.json` with `install` script (causes infinite loop)
- [ ] Check `.gitignore` doesn't ignore required `src/lib/` directories
- [ ] Verify all source files are tracked in git: `git ls-files src/`
- [ ] Test build from subdirectory locally: `cd frontend && npm install && npm run build`
- [ ] Confirm Vercel Root Directory setting matches app location (e.g., `teamflow-web/frontend`)

### Deployment
- [ ] Ensure secrets are configured in GitHub
- [ ] Monitor build logs for errors
- [ ] Verify deployment URL accessibility
- [ ] Test critical user flows
- [ ] Check error logs in production

### Post-Deployment
- [ ] Set up monitoring/alerting
- [ ] Document rollback procedure
- [ ] Update API documentation
- [ ] Notify stakeholders of deployment

## Platform-Specific Configurations

### HuggingFace Spaces
```yaml
# README.md frontmatter for HF Spaces
---
title: Your App Title
emoji: 🤖
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---
```

### GitHub Pages
```yaml
# docusaurus.config.ts for GitHub Pages
baseUrl: '/your-repo-name/',
organizationName: 'your-username',
projectName: 'your-repo',
deploymentBranch: 'gh-pages',
```

### Environment Variables
Create `.env.example`:
```env
# Required
OPENAI_API_KEY=your_key_here
QDRANT_URL=your_qdrant_url

# Optional
OPENAI_MODEL=gpt-5-nano-2025-08-07
NODE_ENV=production
```

## Troubleshooting Guide

### "HF_TOKEN not provided"
1. Check GitHub repository settings > Secrets
2. Verify secret name matches exactly: `HF_TOKEN`
3. Ensure workflow has permissions to access secrets

### Docker "Permission denied"
1. Install packages before creating non-root user
2. Use `--system` flag with uv/pip
3. Set proper file ownership: `chown -R user:user /app`

### CORS Errors
1. Add frontend domain to CORS origins
2. Check browser network tab for preflight requests
3. Verify API endpoint URLs are correct

### Application won't start
1. Check health endpoint: `curl /health`
2. Verify all environment variables
3. Check application logs for startup errors

## Scripts Directory

Include deployment helper scripts:
```bash
# scripts/deploy.sh
#!/bin/bash
set -e

echo "Starting deployment..."

# Build and test locally
docker build -t app .
docker run -d -p 7860:7860 --name test-app app
sleep 5
curl -f http://localhost:7860/health || exit 1
docker stop test-app

# Push to registry
echo "Deployment test passed!"
```

## Monitoring Setup

Always include basic monitoring:
```python
# Add to main.py
import structlog

logger = structlog.get_logger()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time

    logger.info(
        "request_processed",
        method=request.method,
        url=str(request.url),
        status_code=response.status_code,
        process_time=process_time
    )

    return response
```

## Security Considerations

1. **Never commit secrets**: Use environment variables
2. **Use HTTPS in production**: Configure SSL certificates
3. **Implement rate limiting**: Prevent abuse
4. **Validate inputs**: Sanitize all user inputs
5. **Regular updates**: Keep dependencies updated

## Rolling Back Deployments

```bash
# Git rollback
git revert <commit-hash>
git push origin master

# Or if using tags
git checkout previous-tag
git push -f origin master
```

Remember: The goal is not just to deploy, but to deploy reliably and maintainably. Test thoroughly, monitor continuously, and always have a rollback plan.