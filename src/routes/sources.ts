import { eq, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { authPlugin } from '../auth'
import { db, schema } from '../db'
import { byOrder, isLastActive, nameTaken, nextSortOrder } from '../lib/catalog'

const { sources, responseSources } = schema

// "Other" stays last in the survey, so new sources are inserted just before it.
const OTHER_ICON = 'ellipsis'

const body = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  icon: t.String({ minLength: 1, maxLength: 40 }),
  active: t.Optional(t.Boolean()),
})

export const sourceRoutes = new Elysia({ prefix: '/sources' })
  .use(authPlugin)
  .guard({ requireRole: 'manager' })
  .get('/', async () => {
    const counts = db
      .select({ sourceId: responseSources.sourceId, n: sql<number>`count(*)::int`.as('n') })
      .from(responseSources)
      .groupBy(responseSources.sourceId)
      .as('c')
    return db
      .select({
        id: sources.id,
        name: sources.name,
        icon: sources.icon,
        active: sources.active,
        sortOrder: sources.sortOrder,
        selectionCount: sql<number>`coalesce(${counts.n}, 0)`,
      })
      .from(sources)
      .leftJoin(counts, eq(counts.sourceId, sources.id))
      .orderBy(...byOrder(sources))
  })
  .post(
    '/',
    async ({ body, status }) => {
      const name = body.name.trim()
      if (!name) return status(422, { error: 'name_required' })
      if (await nameTaken(sources, name)) return status(409, { error: 'name_taken' })

      const row = await db.transaction(async (tx) => {
        const [other] = await tx
          .select({ id: sources.id, sortOrder: sources.sortOrder })
          .from(sources)
          .where(eq(sources.icon, OTHER_ICON))
          .orderBy(...byOrder(sources))
          .limit(1)
        let sortOrder: number
        if (other) {
          sortOrder = other.sortOrder
          await tx
            .update(sources)
            .set({ sortOrder: sql`${sources.sortOrder} + 1` })
            .where(sql`${sources.sortOrder} >= ${other.sortOrder}`)
        } else {
          sortOrder = await nextSortOrder(sources)
        }
        const [created] = await tx
          .insert(sources)
          .values({ name, icon: body.icon, active: body.active ?? true, sortOrder })
          .returning()
        return created!
      })
      return status(201, row)
    },
    { body },
  )
  .patch(
    '/:id',
    async ({ params, body, status }) => {
      const [current] = await db.select().from(sources).where(eq(sources.id, params.id))
      if (!current) return status(404, { error: 'not_found' })

      const patch: Partial<typeof sources.$inferInsert> = {}
      if (body.name !== undefined) {
        const name = body.name.trim()
        if (!name) return status(422, { error: 'name_required' })
        if (await nameTaken(sources, name, current.id)) return status(409, { error: 'name_taken' })
        patch.name = name
      }
      if (body.icon !== undefined) patch.icon = body.icon
      if (body.active !== undefined) {
        if (!body.active && current.active && (await isLastActive(sources, current.id))) {
          return status(422, { error: 'last_active' })
        }
        patch.active = body.active
      }
      const [row] = await db.update(sources).set(patch).where(eq(sources.id, current.id)).returning()
      return row!
    },
    { params: t.Object({ id: t.Integer() }), body: t.Partial(body) },
  )
  .delete(
    '/:id',
    async ({ params, status }) => {
      const [current] = await db.select().from(sources).where(eq(sources.id, params.id))
      if (!current) return status(404, { error: 'not_found' })
      // Sources with responses must stay so historical reports remain intact; disable those instead.
      const [used] = await db
        .select({ id: responseSources.responseId })
        .from(responseSources)
        .where(eq(responseSources.sourceId, current.id))
        .limit(1)
      if (used) return status(409, { error: 'has_responses' })
      if (current.active && (await isLastActive(sources, current.id))) return status(422, { error: 'last_active' })
      await db.delete(sources).where(eq(sources.id, current.id))
      return { ok: true }
    },
    { params: t.Object({ id: t.Integer() }) },
  )
  .put(
    '/order',
    async ({ body, status }) => {
      const all = await db.select({ id: sources.id }).from(sources)
      const ids = [...new Set(body.ids)]
      if (ids.length !== all.length || !all.every((s) => ids.includes(s.id))) {
        return status(422, { error: 'order_must_include_all_sources' })
      }
      await db.transaction(async (tx) => {
        for (const [i, id] of ids.entries()) {
          await tx.update(sources).set({ sortOrder: i + 1 }).where(eq(sources.id, id))
        }
      })
      return { ok: true }
    },
    { body: t.Object({ ids: t.Array(t.Integer()) }) },
  )
