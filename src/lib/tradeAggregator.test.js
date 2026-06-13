// vitest run
//
// Coverage:
//   simple round trip, scale in then exit, single entry then scale out,
//   underwater scale in (true), strength scale in (false), single fill
//   position flip, two separate round trips in one symbol/session,
//   multi-symbol independence, short side analogues of the long cases.

import { describe, it, expect, beforeEach } from 'vitest'
import { aggregateFills, _resetTradeIdsForTests } from './tradeAggregator.js'

function fill(id, ts, symbol, side, qty, price) {
  return { id, timestamp: ts, symbol, side, qty, price }
}

beforeEach(() => {
  _resetTradeIdsForTests()
})

describe('aggregateFills, simple round trip', () => {
  it('emits one closed trade for one buy then one sell of the same qty', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 2, 20000),
      fill('f2', '2026-06-13T09:15:00Z', '/MNQ', 'sell', 2, 20050),
    ]
    const trades = aggregateFills(fills)
    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.symbol).toBe('/MNQ')
    expect(t.direction).toBe('long')
    expect(t.avgEntryPrice).toBe(20000)
    expect(t.avgExitPrice).toBe(20050)
    expect(t.maxSize).toBe(2)
    expect(t.totalEntryQty).toBe(2)
    expect(t.realizedPnl).toBe(100) // 50 * 2, ignoring contract multiplier
    expect(t.fillCount).toBe(2)
    expect(t.scaledIn).toBe(false)
    expect(t.scaledOut).toBe(false)
    expect(t.addedWhileUnderwater).toBe(false)
    expect(t.maxAdds).toBe(0)
  })
})

describe('aggregateFills, scale in then single exit', () => {
  it('updates average entry across two opening adds and exits in one go', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000),
      fill('f2', '2026-06-13T09:05:00Z', '/MNQ', 'buy', 3, 20040), // strength add
      fill('f3', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 4, 20100),
    ]
    const trades = aggregateFills(fills)
    expect(trades).toHaveLength(1)
    const t = trades[0]
    // weighted avg entry: (20000*1 + 20040*3) / 4 = 20030
    expect(t.avgEntryPrice).toBe(20030)
    expect(t.avgExitPrice).toBe(20100)
    expect(t.maxSize).toBe(4)
    expect(t.totalEntryQty).toBe(4)
    expect(t.realizedPnl).toBe((20100 - 20030) * 4) // 280
    expect(t.scaledIn).toBe(true)
    expect(t.scaledOut).toBe(false)
    expect(t.addedWhileUnderwater).toBe(false) // 20040 > 20000, adding on strength
    expect(t.maxAdds).toBe(1)
  })
})

describe('aggregateFills, single entry then scale out', () => {
  it('exits in two pieces and reports scaledOut', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 4, 20000),
      fill('f2', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 2, 20050),
      fill('f3', '2026-06-13T10:00:00Z', '/MNQ', 'sell', 2, 20080),
    ]
    const trades = aggregateFills(fills)
    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.avgEntryPrice).toBe(20000)
    // weighted avg exit: (20050*2 + 20080*2) / 4 = 20065
    expect(t.avgExitPrice).toBe(20065)
    expect(t.realizedPnl).toBe((20050 - 20000) * 2 + (20080 - 20000) * 2) // 100 + 160 = 260
    expect(t.maxSize).toBe(4)
    expect(t.scaledIn).toBe(false)
    expect(t.scaledOut).toBe(true)
    expect(t.exitTime).toBe('2026-06-13T10:00:00Z')
  })
})

describe('aggregateFills, addedWhileUnderwater behavior', () => {
  it('flags true when a long adds below its running average', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000),
      fill('f2', '2026-06-13T09:05:00Z', '/MNQ', 'buy', 1, 19960), // averaging down
      fill('f3', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 2, 20000),
    ]
    const trades = aggregateFills(fills)
    const t = trades[0]
    expect(t.avgEntryPrice).toBe(19980)
    expect(t.addedWhileUnderwater).toBe(true)
    expect(t.scaledIn).toBe(true)
    expect(t.maxAdds).toBe(1)
  })

  it('flags false when a long adds above its running average', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000),
      fill('f2', '2026-06-13T09:05:00Z', '/MNQ', 'buy', 1, 20040), // adding on strength
      fill('f3', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 2, 20100),
    ]
    const trades = aggregateFills(fills)
    const t = trades[0]
    expect(t.avgEntryPrice).toBe(20020)
    expect(t.addedWhileUnderwater).toBe(false)
    expect(t.scaledIn).toBe(true)
  })

  it('flags against the running average at the moment of the add, not the final average', () => {
    // First add is OK (above start). Second add looks fine vs the very first
    // fill but is below the running average after the first add. The flag
    // must trip on the second add.
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000),
      fill('f2', '2026-06-13T09:05:00Z', '/MNQ', 'buy', 1, 20100), // running avg now 20050
      fill('f3', '2026-06-13T09:10:00Z', '/MNQ', 'buy', 1, 20040), // 20040 < 20050, underwater
      fill('f4', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 3, 20200),
    ]
    const trades = aggregateFills(fills)
    const t = trades[0]
    expect(t.addedWhileUnderwater).toBe(true)
    expect(t.maxAdds).toBe(2)
  })

  it('flags true for a short that adds above its average, the short side underwater case', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'sell', 1, 20000),
      fill('f2', '2026-06-13T09:05:00Z', '/MNQ', 'sell', 1, 20040), // price went up against short
      fill('f3', '2026-06-13T09:30:00Z', '/MNQ', 'buy', 2, 19980),
    ]
    const trades = aggregateFills(fills)
    const t = trades[0]
    expect(t.direction).toBe('short')
    expect(t.addedWhileUnderwater).toBe(true)
  })
})

describe('aggregateFills, position flip on a single fill', () => {
  it('splits the fill, finalizes the existing trade, and opens a new one in the opposite direction', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 2, 20000),
      // one sell for 5 contracts: 2 close the long, 3 open a short
      fill('f2', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 5, 20050),
      fill('f3', '2026-06-13T10:00:00Z', '/MNQ', 'buy', 3, 20010),
    ]
    const trades = aggregateFills(fills)
    expect(trades).toHaveLength(2)

    const [first, second] = trades
    expect(first.direction).toBe('long')
    expect(first.avgEntryPrice).toBe(20000)
    expect(first.avgExitPrice).toBe(20050)
    expect(first.realizedPnl).toBe(100)
    expect(first.maxSize).toBe(2)
    expect(first.fillCount).toBe(2)
    // the closing slice should be the split piece with the #close suffix
    const closingSlice = first.fills[first.fills.length - 1]
    expect(closingSlice.id).toBe('f2#close')
    expect(closingSlice.qty).toBe(2)
    expect(closingSlice._sourceFillId).toBe('f2')

    expect(second.direction).toBe('short')
    expect(second.avgEntryPrice).toBe(20050)
    expect(second.avgExitPrice).toBe(20010)
    expect(second.realizedPnl).toBe((20050 - 20010) * 3) // 120
    expect(second.maxSize).toBe(3)
    const openingSlice = second.fills[0]
    expect(openingSlice.id).toBe('f2#open')
    expect(openingSlice.qty).toBe(3)
    expect(openingSlice._sourceFillId).toBe('f2')
  })
})

describe('aggregateFills, two separate round trips in the same symbol', () => {
  it('emits two distinct trades, second one is not tagged from first one', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000),
      fill('f2', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 1, 20050),
      fill('f3', '2026-06-13T11:00:00Z', '/MNQ', 'sell', 2, 20100), // new short
      fill('f4', '2026-06-13T11:30:00Z', '/MNQ', 'buy', 2, 20070),
    ]
    const trades = aggregateFills(fills)
    expect(trades).toHaveLength(2)
    expect(trades[0].direction).toBe('long')
    expect(trades[0].realizedPnl).toBe(50)
    expect(trades[1].direction).toBe('short')
    expect(trades[1].realizedPnl).toBe((20100 - 20070) * 2) // 60
    expect(trades[0].id).not.toBe(trades[1].id)
  })
})

describe('aggregateFills, multi-symbol independence', () => {
  it('aggregates each symbol on its own, the order of fills across symbols does not matter', () => {
    const fills = [
      fill('a1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 1, 20000),
      fill('b1', '2026-06-13T09:05:00Z', 'SPY', 'buy', 100, 560),
      fill('a2', '2026-06-13T09:30:00Z', '/MNQ', 'sell', 1, 20050),
      fill('b2', '2026-06-13T10:00:00Z', 'SPY', 'sell', 100, 562),
    ]
    const trades = aggregateFills(fills)
    expect(trades).toHaveLength(2)
    const mnq = trades.find(t => t.symbol === '/MNQ')
    const spy = trades.find(t => t.symbol === 'SPY')
    expect(mnq.realizedPnl).toBe(50)
    expect(spy.realizedPnl).toBe(200)
  })
})

describe('aggregateFills, open position at end of input', () => {
  it('does not emit a trade for a position that has not closed', () => {
    const fills = [
      fill('f1', '2026-06-13T09:00:00Z', '/MNQ', 'buy', 2, 20000),
      // no closing fill
    ]
    const trades = aggregateFills(fills)
    expect(trades).toHaveLength(0)
  })
})
