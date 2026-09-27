export type RangeKey = 'today' | 'month' | 'year' | 'custom'
export type Granularity = 'hour' | 'day' | 'month'

export interface Period {
  range: RangeKey
  from: string // YYYY-MM-DD, inclusive, in APP_TIMEZONE
  to: string // YYYY-MM-DD, inclusive
  granularity: Granularity
  compare: { from: string; to: string }
}

const DAY_MS = 86_400_000
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function todayIn(timezone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const toUtc = (iso: string) => Date.parse(iso + 'T00:00:00Z')
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => fromUtc(toUtc(iso) + n * DAY_MS)
const diffDays = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
const ymd = (y: number, m: number, d: number) => fromUtc(Date.UTC(y, m, d))
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && ISO_RE.test(s) && !Number.isNaN(toUtc(s))
}

export function resolvePeriod(range: RangeKey, today: string, from?: string, to?: string): Period {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const mi = m - 1

  if (range === 'today') {
    const yesterday = addDays(today, -1)
    return { range, from: today, to: today, granularity: 'hour', compare: { from: yesterday, to: yesterday } }
  }

  if (range === 'month') {
    const pmY = mi === 0 ? y - 1 : y
    const pmM = mi === 0 ? 11 : mi - 1
    const pmEnd = Math.min(d, daysInMonth(pmY, pmM))
    return {
      range,
      from: ymd(y, mi, 1),
      to: today,
      granularity: 'day',
      compare: { from: ymd(pmY, pmM, 1), to: ymd(pmY, pmM, pmEnd) },
    }
  }

  if (range === 'year') {
    const pyEnd = Math.min(d, daysInMonth(y - 1, mi))
    return {
      range,
      from: ymd(y, 0, 1),
      to: today,
      granularity: 'month',
      compare: { from: ymd(y - 1, 0, 1), to: ymd(y - 1, mi, pyEnd) },
    }
  }

  let a = isIsoDate(from) ? from : addDays(today, -13)
  let b = isIsoDate(to) ? to : today
  if (a > b) [a, b] = [b, a]
  if (b > today) b = today
  if (a > b) a = b
  const len = diffDays(a, b)
  return {
    range: 'custom',
    from: a,
    to: b,
    granularity: len <= 62 ? 'day' : 'month',
    compare: { from: addDays(a, -len - 1), to: addDays(a, -1) },
  }
}

/** Every bucket key the chart should show for the period, so empty buckets render as 0. */
export function bucketKeys(p: Period): string[] {
  const keys: string[] = []
  if (p.granularity === 'hour') {
    for (let h = 0; h < 24; h++) keys.push(String(h).padStart(2, '0'))
  } else if (p.granularity === 'day') {
    for (let cur = p.from; cur <= p.to; cur = addDays(cur, 1)) keys.push(cur)
  } else {
    const [fy, fm] = p.from.split('-').map(Number) as [number, number]
    const [ty, tm] = p.to.split('-').map(Number) as [number, number]
    for (let k = fy * 12 + fm - 1; k <= ty * 12 + tm - 1; k++) {
      keys.push(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`)
    }
  }
  return keys
}
