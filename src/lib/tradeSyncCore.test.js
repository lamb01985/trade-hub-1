// vitest run
//
// Coverage:
//   first sync of N fills produces N stored fills and the expected trades.
//   second sync of the same batch produces zero new fills and zero new trades.
//   partial overlap: half the batch already stored, half new, only the new
//     half is added and the trade count updates correctly.
//   out-of-order arrival: incoming fills timestamped before existing fills
//     still merge and re-aggregation reorders chronologically.
//   incoming entries without a string id are skipped, not added.

import { describe, it, expect, beforeEach } from 'vitest'
import { mergeFills, applySyncBatch } from './tradeSyncCore.js'
import { _resetTradeIdsForTests } from './tradeAggregator.js'

function fill(id, ts, symbol, side, qty, price) {
  return { id, timestamp: ts, symbol, side, qty, price }
}

beforeEach(() => {
  _resetTradeIdsForTests()
})

describe('mergeFills', () => {
  it('adds all incoming fills when the existing list is empty', () => {
    const a = fill('a', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000)
    const b = fill('b', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 1, 20050)
    const { merged, added, skipped } = mergeFills([], [a, b])
    expect(added).toBe(2)
    expect(skipped).toBe(0)
    expect(merged.map(f => f.id)).toEqual(['a', 'b'])
  })

  it('skips fills whose id already exists', () => {
    const a = fill('a', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000)
    const b = fill('b', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 1, 20050)
    const { merged, added, skipped } = mergeFills([a, b], [a, b])
    expect(added).toBe(0)
    expect(skipped).toBe(2)
    expect(merged).toHaveLength(2)
  })

  it('adds only the new ones on a partial overlap', () => {
    const a = fill('a', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000)
    const b = fill('b', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 1, 20050)
    const c = fill('c', '2026-06-13T10:00:00Z', '/MNQ', 'buy', 1, 20020)
    const { merged, added, skipped } = mergeFills([a, b], [b, c])
    expect(added).toBe(1)
    expect(skipped).toBe(1)
    expect(merged.map(f => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('skips incoming entries without a string id', () => {
    const a = fill('a', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000)
    const bad1 = { ...fill('x', '2026-06-13T09:01:00Z', '/MNQ', 'buy', 1, 20001), id: undefined }
    const bad2 = { ...fill('y', '2026-06-13T09:02:00Z', '/MNQ', 'buy', 1, 20002), id: 12345 }
    const good = fill('z', '2026-06-13T09:03:00Z', '/MNQ', 'buy', 1, 20003)
    const { merged, added, skipped } = mergeFills([a], [bad1, bad2, good])
    expect(added).toBe(1)
    expect(skipped).toBe(2)
    expect(merged.map(f => f.id)).toEqual(['a', 'z'])
  })

  it('returns the merged set sorted chronologically regardless of input order', () => {
    const later = fill('b', '2026-06-13T11:00:00Z', '/MNQ', 'sell', 1, 20050)
    const earlier = fill('a', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000)
    const { merged } = mergeFills([], [later, earlier])
    expect(merged.map(f => f.id)).toEqual(['a', 'b'])
  })
})

describe('applySyncBatch idempotency', () => {
  it('first sync produces the expected trades, second sync of the same batch is a no-op', () => {
    const batch = [
      fill('e1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 2, 20000),
      fill('e2', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 2, 20050),
    ]
    const first = applySyncBatch([], batch)
    expect(first.summary.fillsAdded).toBe(2)
    expect(first.summary.fillsSkipped).toBe(0)
    expect(first.summary.tradesBefore).toBe(0)
    expect(first.summary.tradesTotal).toBe(1)
    expect(first.summary.tradesDelta).toBe(1)
    expect(first.trades[0].realizedPnl).toBe(100)

    // Re-run with the same batch over the same stored fills.
    _resetTradeIdsForTests()
    const second = applySyncBatch(first.mergedFills, batch)
    expect(second.summary.fillsAdded).toBe(0)
    expect(second.summary.fillsSkipped).toBe(2)
    expect(second.summary.tradesBefore).toBe(1)
    expect(second.summary.tradesTotal).toBe(1)
    expect(second.summary.tradesDelta).toBe(0)
    expect(second.mergedFills).toHaveLength(2)
  })

  it('partial overlap adds only the new fills and updates trades accordingly', () => {
    const day1 = [
      fill('d1a', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 2, 20000),
      fill('d1b', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 2, 20050),
    ]
    const day2 = [
      fill('d1b', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 2, 20050), // overlap
      fill('d2a', '2026-06-14T09:00:00Z', '/MNQ', 'sell', 1, 21000),
      fill('d2b', '2026-06-14T09:30:00Z', '/MNQ', 'buy', 1, 20950),
    ]
    const first = applySyncBatch([], day1)
    _resetTradeIdsForTests()
    const second = applySyncBatch(first.mergedFills, day2)
    expect(second.summary.fillsAdded).toBe(2)
    expect(second.summary.fillsSkipped).toBe(1)
    expect(second.summary.tradesBefore).toBe(1)
    expect(second.summary.tradesTotal).toBe(2)
    expect(second.summary.tradesDelta).toBe(1)
    const symbols = second.trades.map(t => t.direction)
    expect(symbols).toContain('long')
    expect(symbols).toContain('short')
  })

  it('out-of-order arrival: a late-arriving earlier fill merges and re-aggregates correctly', () => {
    const stored = [
      fill('late', '2026-06-13T10:00:00Z', '/MNQ', 'sell', 1, 20050),
    ]
    const incoming = [
      fill('early', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000),
    ]
    const { mergedFills, trades, summary } = applySyncBatch(stored, incoming)
    expect(mergedFills.map(f => f.id)).toEqual(['early', 'late'])
    expect(summary.tradesTotal).toBe(1)
    expect(trades[0].realizedPnl).toBe(50)
  })
})
