import { describe, it, expect } from 'vitest'
import {
  calcPivots,
  buildLevelMap,
  scoreSetupQuality,
  SQ_MARKET_CLOSED,
} from './levels.js'

describe('calcPivots', () => {
  it('exposes lowercase aliases that match the uppercase keys', () => {
    const p = calcPivots(749.79, 744.85, 746.0)
    expect(p.pp).toBeCloseTo((749.79 + 744.85 + 746.0) / 3, 6)
    for (const k of ['PP', 'R1', 'R2', 'R3', 'S1', 'S2', 'S3']) {
      expect(p[k.toLowerCase()]).toBe(p[k])
    }
  })
})

describe('scoreSetupQuality', () => {
  const lvl = price => ({ price })

  it('scales thresholds by ATR', () => {
    // $0.20 from a level: ON LEVEL on a $9-ATR name (0.03 * 9 = 0.27),
    // but only APPROACHING on a $3-ATR name (0.03 * 3 = 0.09, 0.08 * 3 = 0.24).
    const above = [lvl(110), lvl(100.2)]
    const below = [lvl(95)]
    expect(scoreSetupQuality(100, above, below, { atr: 9, session: 'open' })).toBe('ON LEVEL')
    expect(scoreSetupQuality(100, above, below, { atr: 3, session: 'open' })).toBe('APPROACHING')
  })

  it('returns BETWEEN LEVELS when far from everything', () => {
    expect(scoreSetupQuality(100, [lvl(105)], [lvl(95)], { atr: 2, session: 'open' })).toBe('BETWEEN LEVELS')
  })

  it('returns MARKET CLOSED outside the regular session', () => {
    for (const session of ['pre-market', 'after-hours', 'weekend', 'holiday']) {
      expect(scoreSetupQuality(100, [lvl(100.01)], [lvl(99.99)], { atr: 9, session })).toBe(SQ_MARKET_CLOSED)
    }
  })

  it('treats a missing session as live for older callers', () => {
    expect(scoreSetupQuality(100, [lvl(100.1)], [lvl(95)], { atr: 9 })).toBe('ON LEVEL')
  })
})

describe('buildLevelMap setup quality', () => {
  it('ignores whole-dollar round levels so QQQ is not permanently ON LEVEL', () => {
    // Price sits $0.05 from $743, but the nearest structural levels are far.
    const map = buildLevelMap(743.05, {
      prevDay: { high: 749.79, low: 735.0, close: 744.0 },
      atr: 9,
      session: 'open',
    })
    expect(map.levels.some(l => l.type === 'round' && l.price === 743)).toBe(true)
    expect(map.setupQuality).not.toBe('ON LEVEL')
  })
})
