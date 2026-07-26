// Drop-in tenant-scoped audit log: typed taxonomy + non-blocking writer + read queries.
// Adapt schema imports (auditLogs, users, organizations) to your project.

import { and, desc, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export type AuditAction =
  | 'bot.created' | 'bot.updated' | 'bot.deleted' | 'bot.toggled'
  | 'document.uploaded' | 'document.deleted' | 'document.url_added' | 'document.reindexed'
  | 'client.invited' | 'client.removed'
  | 'org_member.invited' | 'org_member.removed'
  | 'billing.plan_changed' | 'billing.credits_purchased'
  | 'settings.updated'
  | 'conversation.handoff' | 'conversation.limit_reached'
  | 'error.credit_exhausted' | 'error.ingestion_failed' // userId = null for system events

// Fire-and-forget at call sites: `void createAuditLog({ ... })`.
export async function createAuditLog(entry: {
  orgId: string
  userId?: string
  action: AuditAction
  entityType: string
  entityId?: string
  meta?: Record<string, unknown>
}): Promise<void> {
  await db
    .insert(schema.auditLogs)
    .values({ ...entry, meta: entry.meta ?? {} })
    .catch((err) => {
      // NEVER throw — audit must not break the action it records.
      console.error('[audit] failed:', entry.action, err instanceof Error ? err.message : String(err))
    })
}

// Tenant-scoped viewer — ALWAYS filter org_id.
export async function listAuditLogs(orgId: string, opts: { limit?: number; since?: Date } = {}) {
  const { limit = 100, since } = opts
  const conds = [eq(schema.auditLogs.orgId, orgId)]
  if (since) conds.push(gte(schema.auditLogs.createdAt, since))
  return db
    .select({
      id: schema.auditLogs.id, action: schema.auditLogs.action,
      entityType: schema.auditLogs.entityType, entityId: schema.auditLogs.entityId,
      meta: schema.auditLogs.meta, createdAt: schema.auditLogs.createdAt,
      userName: schema.users.name, userEmail: schema.users.email,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .where(and(...conds))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit)
}

// Platform-owner only — guard the calling route.
export async function listAllAuditLogs(opts: { limit?: number; since?: Date } = {}) {
  const { limit = 200, since } = opts
  const conds = since ? [gte(schema.auditLogs.createdAt, since)] : []
  return db
    .select({
      id: schema.auditLogs.id, orgId: schema.auditLogs.orgId, action: schema.auditLogs.action,
      entityType: schema.auditLogs.entityType, entityId: schema.auditLogs.entityId,
      meta: schema.auditLogs.meta, createdAt: schema.auditLogs.createdAt,
      userName: schema.users.name, userEmail: schema.users.email, orgName: schema.organizations.name,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .leftJoin(schema.organizations, eq(schema.auditLogs.orgId, schema.organizations.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit)
}

/* Drizzle schema (pgTable):
export const auditLogs = pgTable('audit_logs', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId:      text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId:     text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action:     varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId:   text('entity_id'),
  meta:       jsonb('meta').notNull().default({}),
  createdAt:  timestamptz('created_at').defaultNow().notNull(),
}, (t) => [index('audit_logs_org_id_idx').on(t.orgId)])
*/
