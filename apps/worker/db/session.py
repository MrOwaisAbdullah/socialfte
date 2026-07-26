"""Database session management — Week 3, Step 1.

Provides async SQLAlchemy engine and session factory for the worker.
Mirrors apps/dashboard/lib/db/schema.ts — schema.sql is the source of truth.
"""
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

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
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
