// Drizzle client — Week 2, Story 3. Connects to the same Neon DATABASE_URL
// the schema (apps/worker/db/schema.sql, Story 1) targets.
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
