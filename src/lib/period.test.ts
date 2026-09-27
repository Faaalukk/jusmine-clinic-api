import { describe, expect, test } from 'bun:test'
import { bucketKeys, resolvePeriod, todayIn } from './period'

describe('resolvePeriod', () => {
  test('month compares against the same span of the previous month', () => {
    const p = resolvePeriod('month', '2026-03-31')
    expect(p).toMatchObject({ from: '2026-03-01', to: '2026-03-31', granularity: 'day' })
    expect(p.compare).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  test('month in January compares against December of the previous year', () => {
    expect(resolvePeriod('month', '2026-01-10').compare).toEqual({ from: '2025-12-01', to: '2025-12-10' })
  })

  test('year uses monthly buckets', () => {
    const p = resolvePeriod('year', '2026-09-26')
    expect(p.granularity).toBe('month')
    expect(p.compare).toEqual({ from: '2025-01-01', to: '2025-09-26' })
    expect(bucketKeys(p)).toHaveLength(9)
  })

  test('custom swaps reversed dates, clamps to today and picks granularity', () => {
    const p = resolvePeriod('custom', '2026-09-26', '2026-10-05', '2026-09-20')
    expect(p).toMatchObject({ from: '2026-09-20', to: '2026-09-26', granularity: 'day' })
    expect(p.compare).toEqual({ from: '2026-09-13', to: '2026-09-19' })
    expect(resolvePeriod('custom', '2026-09-26', '2026-01-01', '2026-09-01').granularity).toBe('month')
  })

  test('today uses 24 hourly buckets', () => {
    expect(bucketKeys(resolvePeriod('today', '2026-09-26'))).toHaveLength(24)
  })
})

test('todayIn respects the timezone', () => {
  const lateUtc = new Date('2026-09-26T20:00:00Z')
  expect(todayIn('Asia/Bangkok', lateUtc)).toBe('2026-09-27')
  expect(todayIn('UTC', lateUtc)).toBe('2026-09-26')
})
