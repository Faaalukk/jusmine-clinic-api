import { eq, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { authPlugin } from '../auth'
import { db, schema } from '../db'
import { byOrder, isLastActive, nameTaken, nextSortOrder } from '../lib/catalog'

const { branches, responses } = schema

const body = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  active: t.Optional(t.Boolean()),
})

export const branchRoutes = new Elysia({ prefix: '/branches' })
  .use(authPlugin)
  .guard({ requireRole: 'manager' })
  .get('/', async () => {
    const counts = db
      .select({ branchId: responses.branchId, n: sql<number>`count(*)::int`.as('n') })
      .from(responses)
      .groupBy(responses.branchId)
      .as('c')
    return db
      .select({
        id: branches.id,
        name: branches.name,
        active: branches.active,
        sortOrder: branches.sortOrder,
        responseCount: sql<number>`coalesce(${counts.n}, 0)`,
      })
      .from(branches)
      .leftJoin(counts, eq(counts.branchId, branches.id))
      .orderBy(...byOrder(branches))
  })
  .post(
    '/',
    async ({ body, status }) => {
      const name = body.name.trim()
      if (!name) return status(422, { error: 'name_required' })
      if (await nameTaken(branches, name)) return status(409, { error: 'name_taken' })
      const [row] = await db
        .insert(branches)
        .values({ name, active: body.active ?? true, sortOrder: await nextSortOrder(branches) })
        .returning()
      return status(201, row!)
    },
    { body },
  )
  .patch(
    '/:id',
    async ({ params, body, status }) => {
      const [current] = await db.select().from(branches).where(eq(branches.id, params.id))
      if (!current) return status(404, { error: 'not_found' })

      const patch: Partial<typeof branches.$inferInsert> = {}
      if (body.name !== undefined) {
        const name = body.name.trim()
        if (!name) return status(422, { error: 'name_required' })
        if (await nameTaken(branches, name, current.id)) return status(409, { error: 'name_taken' })
        patch.name = name
      }
      if (body.active !== undefined) {
        if (!body.active && current.active && (await isLastActive(branches, current.id))) {
          return status(422, { error: 'last_active' })
        }
        patch.active = body.active
      }
      const [row] = await db.update(branches).set(patch).where(eq(branches.id, current.id)).returning()
      return row!
    },
    { params: t.Object({ id: t.Integer() }), body: t.Partial(body) },
  )
