import { and, eq, inArray } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { authPlugin } from '../auth'
import { db, schema } from '../db'
import { byOrder } from '../lib/catalog'

const { branches, sources, responses, responseSources } = schema

export const surveyRoutes = new Elysia({ prefix: '/survey' })
  .use(authPlugin)
  .get(
    '/options',
    async () => {
      const [b, s] = await Promise.all([
        db
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(eq(branches.active, true))
          .orderBy(...byOrder(branches)),
        db
          .select({ id: sources.id, name: sources.name, icon: sources.icon })
          .from(sources)
          .where(eq(sources.active, true))
          .orderBy(...byOrder(sources)),
      ])
      return { branches: b, sources: s }
    },
    { requireRole: 'any' },
  )
  .post(
    '/responses',
    async ({ body, status }) => {
      const sourceIds = [...new Set(body.sourceIds)]

      const [branch] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.id, body.branchId), eq(branches.active, true)))
      if (!branch) return status(422, { error: 'invalid_branch' })

      const valid = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(inArray(sources.id, sourceIds), eq(sources.active, true)))
      if (valid.length !== sourceIds.length) return status(422, { error: 'invalid_source' })

      const id = await db.transaction(async (tx) => {
        const [row] = await tx.insert(responses).values({ branchId: branch.id }).returning({ id: responses.id })
        await tx.insert(responseSources).values(sourceIds.map((sourceId) => ({ responseId: row!.id, sourceId })))
        return row!.id
      })
      return status(201, { id })
    },
    {
      requireRole: 'any',
      body: t.Object({
        branchId: t.Integer(),
        sourceIds: t.Array(t.Integer(), { minItems: 1, maxItems: 50 }),
      }),
    },
  )
