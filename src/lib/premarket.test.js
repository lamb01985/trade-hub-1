import { describe, it, expect } from 'vitest'
import { filterRegularSession } from './premarket.js'
import { calcVWAP } from './levels.js'

describe('regular-session indicator inputs', () => {
  it('excludes premarket and closing-bell earnings moves from regular VWAP', () => {
    const bar = (time, price, v) => ({ t: Date.parse(time), o: price, h: price, l: price, c: price, v })
    const bars = [
      bar('2026-10-29T13:25:00Z', 120, 10000),
      bar('2026-10-29T13:30:00Z', 100, 100),
      bar('2026-10-29T19:59:00Z', 102, 100),
      bar('2026-10-29T20:00:00Z', 80, 10000),
    ]
    const regular = filterRegularSession(bars)
    expect(regular).toHaveLength(2)
    expect(regular[0].o).toBe(100)
    expect(regular.reduce((sum, b) => sum + b.v, 0)).toBe(200)
    expect(calcVWAP(regular).vwap).toBe(101)
  })
})
