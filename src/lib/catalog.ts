import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { db, schema } from '../db'

type CatalogTable = typeof schema.branches | typeof schema.sources

/** Names are unique per table, ignoring case and surrounding whitespace. */
export async function nameTaken(table: CatalogTable, name: string, exceptId?: number) {
  const cond = sql`lower(trim(${table.name})) = lower(${name.trim()})`
  const rows = await db
    .select({ id: table.id })
    .from(table as PgTable)
    .where(exceptId ? and(cond, ne(table.id, exceptId)) : cond)
    .limit(1)
  return rows.length > 0
}

/** True when `id` is the last active row, so deactivating it would leave the survey empty. */
export async function isLastActive(table: CatalogTable, id: number) {
  const rows = await db
    .select({ id: table.id })
    .from(table as PgTable)
    .where(and(eq(table.active, true), ne(table.id, id)))
    .limit(1)
  return rows.length === 0
}

export async function nextSortOrder(table: CatalogTable) {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${table.sortOrder}), 0)` })
    .from(table as PgTable)
  return Number(row?.max ?? 0) + 1
}

export const byOrder = (table: CatalogTable) => [asc(table.sortOrder), asc(table.id)]
