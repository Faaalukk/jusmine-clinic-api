import { sql, type SQL } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { authPlugin } from '../auth'
import { db } from '../db'
import { env } from '../env'
import { bucketKeys, resolvePeriod, todayIn } from '../lib/period'

const TREND_FORMAT = { hour: 'HH24', day: 'YYYY-MM-DD', month: 'YYYY-MM' } as const

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[]
}

export const reportRoutes = new Elysia({ prefix: '/reports' })
  .use(authPlugin)
  .get(
    '/dashboard',
    async ({ query }) => {
      const tz = env.timezone
      const today = todayIn(tz)
      const period = resolvePeriod(query.range ?? 'month', today, query.from, query.to)
      const branchId = query.branch && query.branch !== 'all' ? Number(query.branch) : null

      const inRange = (from: string, to: string) =>
        sql`r.created_at >= ((${from}::date)::timestamp AT TIME ZONE ${tz})
            AND r.created_at < (((${to}::date) + 1)::timestamp AT TIME ZONE ${tz})`
      const cur = inRange(period.from, period.to)
      const prev = inRange(period.compare.from, period.compare.to)
      const inBranch = branchId ? sql`r.branch_id = ${branchId}` : sql`true`
      const fmt = TREND_FORMAT[period.granularity]

      const [totals, sourceCounts, trend, matrixRespondents, matrixCounts] = await Promise.all([
        rows<{ total: number; prev_total: number; all_time: number; first_at: string | null }>(sql`
          SELECT
            count(*) FILTER (WHERE ${cur})::int  AS total,
            count(*) FILTER (WHERE ${prev})::int AS prev_total,
            count(*)::int AS all_time,
            to_char(min(r.created_at) AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS first_at
          FROM responses r WHERE ${inBranch}`),
        rows<{ source_id: number; n: number }>(sql`
          SELECT rs.source_id, count(*)::int AS n
          FROM responses r JOIN response_sources rs ON rs.response_id = r.id
          WHERE ${cur} AND ${inBranch}
          GROUP BY rs.source_id`),
        rows<{ k: string; n: number }>(sql`
          SELECT to_char(r.created_at AT TIME ZONE ${tz}, ${fmt}) AS k, count(*)::int AS n
          FROM responses r
          WHERE ${cur} AND ${inBranch}
          GROUP BY 1`),
        // Branch x source matrix always covers every branch so managers can compare them.
        rows<{ branch_id: number; n: number }>(sql`
          SELECT r.branch_id, count(*)::int AS n FROM responses r WHERE ${cur} GROUP BY 1`),
        rows<{ branch_id: number; source_id: number; n: number }>(sql`
          SELECT r.branch_id, rs.source_id, count(*)::int AS n
          FROM responses r JOIN response_sources rs ON rs.response_id = r.id
          WHERE ${cur}
          GROUP BY 1, 2`),
      ])

      const t0 = totals[0]!
      const trendMap = new Map(trend.map((r) => [r.k, r.n]))
      const selections = sourceCounts.reduce((s, r) => s + r.n, 0)

      const matrix: Record<number, { respondents: number; selections: number; sources: Record<number, number> }> = {}
      for (const r of matrixRespondents) matrix[r.branch_id] = { respondents: r.n, selections: 0, sources: {} }
      for (const r of matrixCounts) {
        const m = (matrix[r.branch_id] ??= { respondents: 0, selections: 0, sources: {} })
        m.sources[r.source_id] = r.n
        m.selections += r.n
      }

      return {
        period,
        today,
        branchId,
        total: t0.total,
        prevTotal: t0.prev_total,
        allTime: t0.all_time,
        firstResponseDate: t0.first_at,
        selections,
        sources: Object.fromEntries(sourceCounts.map((r) => [r.source_id, r.n])) as Record<number, number>,
        trend: bucketKeys(period).map((key) => ({ key, value: trendMap.get(key) ?? 0 })),
        matrix,
      }
    },
    {
      requireRole: 'manager',
      query: t.Object({
        range: t.Optional(t.Union([t.Literal('today'), t.Literal('month'), t.Literal('year'), t.Literal('custom')])),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        branch: t.Optional(t.Union([t.Literal('all'), t.Numeric()])),
      }),
    },
  )
