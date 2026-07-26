---
name: audit-logging
description: |
  Add a tenant-scoped audit log to a multi-tenant SaaS: a typed action taxonomy, a
  non-blocking write helper, and scoped + platform-wide list queries for a viewer UI.
  This skill should be used when implementing audit trails, activity history, compliance
  logging, or "who did what" tracking across orgs, users, and entities.
---

# Audit Logging (multi-tenant SaaS)

A durable, tenant-scoped record of significant actions: bot lifecycle, billing, client/member
management, settings, and system events. Built to **never break the primary flow**.

## Before Implementation

| Source | Gather |
|--------|--------|
| Codebase | `audit_logs` table (or add it), `createAuditLog`, the org/user/entity model, existing viewer page |
| Conversation | Which actions matter? Who reads the log (org admins, platform owner)? Retention needs? |

## Clarifications

**Required:**
1. Who reads the log — org admins (scoped) only, or also a platform owner (cross-org)?
2. Which actions must be recorded (the taxonomy below is a starting set)?

**Optional (infer if unstated):**
3. Retention / pruning policy (default: keep all, cap reads with `limit`)?
4. Should system events (no actor) be supported (default yes, `user_id` null)?

If unanswered, default to: org-scoped reads + a platform-owner cross-org view, the taxonomy below, no auto-pruning.

## Documentation & sources

| Resource | URL | Use for |
|----------|-----|---------|
| Drizzle ORM | https://orm.drizzle.team/docs/overview | Schema, jsonb, joins |
| OWASP Logging Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html | What to log / not log (no secrets/PII) |

## Schema (`audit_logs`)

```
id, org_id (FK, indexed), user_id (FK nullable — null = system event),
action varchar(100), entity_type varchar(50), entity_id text (nullable),
meta jsonb default '{}', created_at timestamptz default now()
```

Index `org_id` (every tenant query filters on it) and optionally `created_at` for time-range reads.

## Typed action taxonomy

Define a union type so callers can't invent ad-hoc action strings:

```ts
export type AuditAction =
  | 'bot.created' | 'bot.updated' | 'bot.deleted' | 'bot.toggled'
  | 'document.uploaded' | 'document.deleted' | 'document.url_added'
  | 'client.invited' | 'client.removed'
  | 'org_member.invited' | 'org_member.removed'
  | 'billing.plan_changed' | 'billing.credits_purchased'
  | 'settings.updated'
  | 'conversation.handoff' | 'conversation.limit_reached'
  | 'error.credit_exhausted' | 'error.ingestion_failed'   // userId = null for system events
```

Naming: `<entity>.<verb>` (lowercase, dot-separated). Keep it stable — it's queried and filtered.

## Write helper — non-blocking by design

```ts
export async function createAuditLog(entry: {
  orgId: string; userId?: string; action: AuditAction;
  entityType: string; entityId?: string; meta?: Record<string, unknown>
}): Promise<void> {
  await db.insert(schema.auditLogs).values({ ...entry, meta: entry.meta ?? {} })
    .catch((err) => {
      // NEVER throw — audit must not break the action it records. Log so it's debuggable.
      console.error('[audit] createAuditLog failed:', entry.action, err instanceof Error ? err.message : String(err))
    })
}
```

Call it **fire-and-forget** from the action site: `void createAuditLog({ ... })`. The action succeeds even if the log write fails.

## Read queries

- **Scoped** (`listAuditLogs(orgId, { limit, since })`) — tenant viewer; always filter `org_id`, left-join `users` for the actor name/email, order by `created_at desc`, cap `limit`.
- **Platform-wide** (`listAllAuditLogs({ limit, since })`) — owner-only; also join `organizations` for org name. Guard the route with a platform-owner check.

## Anti-patterns

- ❌ Throwing on a failed audit write → the user's action fails because logging failed.
- ❌ `await`-ing the audit write in the request hot path → adds latency; use `void`.
- ❌ Free-text action strings → unqueryable, inconsistent. Use the typed union.
- ❌ Forgetting `org_id` in read queries → cross-tenant leak.
- ❌ Storing secrets/PII in `meta` → it's a long-lived log; keep it to IDs and safe context.
- ❌ Exposing `listAllAuditLogs` without a platform-owner guard.

## Validation
- An action with the audit DB unavailable still succeeds (write fails silently, logged to console).
- Scoped query returns only the caller's org; platform query requires owner.
- Actor name resolves via the user join; system events (`user_id` null) render as "System".
