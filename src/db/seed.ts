/**
 * Seeds default branches and discovery sources when the tables are empty.
 * `--demo` also generates ~20 months of fake survey responses for trying out the dashboard.
 */
import { sql } from 'drizzle-orm'
import { client, db, schema } from '.'
import { env } from '../env'
import { addDays, todayIn } from '../lib/period'

const { branches, sources, responses, responseSources } = schema

const DEFAULT_BRANCHES = ['สาขา A', 'สาขา B', 'สาขา C']
const DEFAULT_SOURCES: { name: string; icon: string }[] = [
  { name: 'Facebook', icon: 'facebook' },
  { name: 'TikTok', icon: 'tiktok' },
  { name: 'LINE', icon: 'line' },
  { name: 'Google', icon: 'google' },
  { name: 'Instagram', icon: 'instagram' },
  { name: 'เพื่อนแนะนำ', icon: 'users' },
  { name: 'อื่น ๆ', icon: 'ellipsis' },
]

const [{ n: branchCount }] = (await db.execute(sql`SELECT count(*)::int AS n FROM branches`)) as unknown as [{ n: number }]
if (branchCount === 0) {
  await db.insert(branches).values(DEFAULT_BRANCHES.map((name, i) => ({ name, sortOrder: i + 1 })))
  console.log(`Seeded ${DEFAULT_BRANCHES.length} branches`)
}

const [{ n: sourceCount }] = (await db.execute(sql`SELECT count(*)::int AS n FROM sources`)) as unknown as [{ n: number }]
if (sourceCount === 0) {
  await db.insert(sources).values(DEFAULT_SOURCES.map((s, i) => ({ ...s, sortOrder: i + 1 })))
  console.log(`Seeded ${DEFAULT_SOURCES.length} sources`)
}

if (process.argv.includes('--demo')) {
  const [{ n: responseCount }] = (await db.execute(sql`SELECT count(*)::int AS n FROM responses`)) as unknown as [{ n: number }]
  if (responseCount > 0) {
    console.log('Responses already exist, skipping demo data')
  } else {
    await seedDemoResponses()
  }
}

await client.end()

async function seedDemoResponses() {
  const bs = await db.select().from(branches).orderBy(branches.sortOrder)
  const ss = await db.select().from(sources).orderBy(sources.sortOrder)

  // Deterministic PRNG so demo data is stable between runs
  let a = 20260926
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const poisson = (lambda: number) => {
    const L = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= rand()
    } while (p > L)
    return k - 1
  }

  const weights = ss.map((_, i) => [40, 22, 14, 9, 8, 9, 3][i] ?? 3)
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const pick = () => {
    let u = rand() * totalWeight
    for (let i = 0; i < weights.length; i++) if ((u -= weights[i]!) <= 0) return ss[i]!.id
    return ss[0]!.id
  }

  const today = todayIn(env.timezone)
  const start = `${Number(today.slice(0, 4)) - 1}-01-01`
  const tzOffsetHours = 7 // Demo only: assumes Asia/Bangkok (UTC+7)
  const rows: { branchId: number; createdAt: Date; sourceIds: number[] }[] = []

  let dayIndex = 0
  const totalDays = Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000)
  for (let day = start; day <= today; day = addDays(day, 1), dayIndex++) {
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay()
    const weekend = weekday === 0 || weekday === 6 ? 1.45 : 1
    const growth = 0.7 + (0.55 * dayIndex) / totalDays
    bs.forEach((b, bi) => {
      const base = [1.7, 1.35, 1.1][bi] ?? 1
      const k = poisson(base * weekend * growth * (0.8 + rand() * 0.4))
      for (let j = 0; j < k; j++) {
        const set = new Set([pick()])
        if (rand() < 0.35) set.add(pick())
        if (rand() < 0.1) set.add(pick())
        const hour = 9 + Math.floor(rand() * 12)
        const minute = Math.floor(rand() * 60)
        const createdAt = new Date(Date.parse(`${day}T00:00:00Z`) + ((hour - tzOffsetHours) * 60 + minute) * 60_000)
        if (createdAt > new Date()) continue
        rows.push({ branchId: b.id, createdAt, sourceIds: [...set] })
      }
    })
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const inserted = await tx
        .insert(responses)
        .values(chunk.map((r) => ({ branchId: r.branchId, createdAt: r.createdAt })))
        .returning({ id: responses.id })
      await tx
        .insert(responseSources)
        .values(inserted.flatMap((r, j) => chunk[j]!.sourceIds.map((sourceId) => ({ responseId: r.id, sourceId }))))
    }
  })
  console.log(`Seeded ${rows.length} demo responses`)
}
