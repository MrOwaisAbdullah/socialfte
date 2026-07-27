"""Database session management — Week 3, Step 1.

Provides async SQLAlchemy engine and session factory for the worker.
Mirrors apps/dashboard/lib/db/schema.ts — schema.sql is the source of truth.
"""
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from config import settings

# Use the async driver for PostgreSQL (asyncpg).
# Falls back to a syntactically-valid placeholder when unset so importing this
# module (and anything that transitively imports it — every publisher/job) never
# crashes in environments without a real DATABASE_URL, e.g. running unit tests
# that mock SessionLocal and never touch the engine. create_async_engine doesn't
# connect at construction time, only when a session is actually used.
DATABASE_URL = settings.DATABASE_URL or "postgresql+asyncpg://user:pass@localhost/socialfte"

# Convert postgresql:// to postgresql+asyncpg:// for async driver
if not DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Neon connection strings (and most managed-Postgres examples) append
# `?sslmode=require` — a libpq/psycopg convention. asyncpg's connect() doesn't
# accept `sslmode` as a URL query param at all and raises a TypeError, so it
# has to be stripped from the URL and translated into asyncpg's own `ssl`
# connect arg instead.
connect_args = {}
parts = urlsplit(DATABASE_URL)
query = dict(parse_qsl(parts.query))
if query.pop("sslmode", None) in ("require", "verify-ca", "verify-full"):
    connect_args["ssl"] = "require"
query.pop("channel_binding", None)  # another libpq-only param asyncpg doesn't accept
DATABASE_URL = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args=connect_args,
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncSession:
    """Get a database session for dependency injection."""
    async with SessionLocal() as session:
        yield session
