#!/usr/bin/env bash
# db-check.sh
#
# Fastest "is the DB even up" check for Octively. Read-only: SELECT COUNT(*)
# against the tables this skill documents, nothing else. Makes NO writes.
#
# Part of the octively-diagnostics-and-tooling skill.
#
# Usage (always from the repo root, quoting the path since it has spaces):
#   cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
#   bash .claude/skills/octively-diagnostics-and-tooling/scripts/db-check.sh
#
# This script shells out to `psql` if available; otherwise it falls back to a
# tiny inline Node script using @neondatabase/serverless (already a project
# dependency) so it works even without the postgres client installed.
# NOTE on the fallback: @neondatabase/serverless v1 only accepts the tagged-
# template form (sql`...`) or sql.query('...') for plain strings — calling
# sql('...') as a plain function throws. Table names cannot be bound as
# parameters, so sql.query() with the hardcoded whitelist below is correct.
#
# Exit status: 0 only if EVERY table check succeeded. Any errored check prints
# an explicit FAILURE summary and exits 1 — a closing "Done" banner is never
# printed over failed checks.
#
# Env: requires DATABASE_URL. This script reads DATABASE_URL from the
# environment OR from .env.local directly (grep, not `source` — .env.local may
# contain values with characters unsafe to `source` blindly).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$ENV_FILE" ]; then
    # Extract DATABASE_URL=... line, strip surrounding quotes if present.
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//')"
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[diagnostics] FAILURE: DATABASE_URL not set (checked environment and $ENV_FILE) — no checks were run." >&2
  exit 1
fi

export DATABASE_URL

TABLES="organizations bots conversations messages leads routing_decisions credit_transactions audit_logs short_links"

FAILED=0

if command -v psql >/dev/null 2>&1; then
  echo "─────────────────────────────────────────────────────────"
  echo "DB reachability + row counts (via psql)"
  echo "─────────────────────────────────────────────────────────"
  for t in $TABLES; do
    COUNT="$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM ${t};" 2>/dev/null || echo "ERROR")"
    if [ "$COUNT" = "ERROR" ]; then
      FAILED=$((FAILED + 1))
    fi
    printf '  %-20s %s\n' "$t" "$COUNT"
  done
else
  echo "[diagnostics] psql not found — falling back to Node/neon-http one-liner"
  echo "  (run from repo root so node_modules/@neondatabase/serverless resolves)"
  node -e "
    const { neon } = require('$REPO_ROOT/node_modules/@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const tables = '$TABLES'.split(' ');
    (async () => {
      console.log('─────────────────────────────────────────────────────────');
      console.log('DB reachability + row counts (via @neondatabase/serverless)');
      console.log('─────────────────────────────────────────────────────────');
      let errors = 0;
      for (const t of tables) {
        try {
          // v1 API: sql.query() for plain-string queries (table names cannot
          // be \$1-parameterized; t comes from the hardcoded whitelist above).
          const rows = await sql.query('SELECT COUNT(*)::int AS c FROM ' + t);
          console.log('  ' + t.padEnd(20) + ' ' + rows[0].c);
        } catch (err) {
          errors++;
          console.log('  ' + t.padEnd(20) + ' ERROR: ' + (err && err.message ? err.message : String(err)));
        }
      }
      if (errors > 0) {
        console.error('[diagnostics] ' + errors + ' of ' + tables.length + ' table checks errored.');
        process.exit(1);
      }
    })().catch((err) => {
      console.error('[diagnostics] db-check Node fallback failed:', err.message || err);
      process.exit(1);
    });
  " || FAILED=1
fi

echo "─────────────────────────────────────────────────────────"
if [ "$FAILED" -ne 0 ]; then
  echo "FAILURE: one or more table checks errored (see above). No rows were modified."
  echo "─────────────────────────────────────────────────────────"
  exit 1
fi
echo "Done. All table checks succeeded. No rows were modified."
echo "─────────────────────────────────────────────────────────"
