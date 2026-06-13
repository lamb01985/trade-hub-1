// ─────────────────────────────────────────────────────────────────────────────
// tradeSyncCore.js
//
// Pure, framework-agnostic orchestration for trade sync. Takes the existing
// stored fills and a batch of newly-fetched fills, dedupes by stable fill id,
// re-runs the aggregator over the full union, and returns:
//
//   { mergedFills, trades, summary: { fillsPulled, fillsAdded, fillsSkipped,
//     tradesTotal, tradesBefore } }
//
// No KV, no Schwab, no HTTP. The caller (api/_lib/tradeSync.js) handles
// persistence and IO. This file is what the unit tests exercise to prove
// idempotency: running the same batch twice changes nothing.
//
// Dedupe rule: a fill is "new" iff its id is not present in the existing
// fills list. Schwab transaction/execution ids are stable, so this is a hard
// equality check, not a content hash. If the adapter ever emits split flip
// pieces (id#close, id#open) those are treated as distinct ids by design,
// which is correct since they represent different aggregator-visible slices.
//
// Re-aggregation rule: each sync re-runs aggregateFills() over the full
// merged history. The aggregator is pure and deterministic, so this produces
// the same trade list every time the underlying fills are the same. The
// alternative (incremental state in KV) is faster but adds a class of bugs
// we are not signing up for in a single-operator app.
// ─────────────────────────────────────────────────────────────────────────────

import { aggregateFills } from './tradeAggregator.js'

function chronological(a, b) {
  return a.timestamp.localeCompare(b.timestamp)
}

// Merge two fill lists by id. Existing fills win on conflict, which preserves
// any backfill metadata that may have been attached after the fact (notes,
// strategy tags) without re-fetching from Schwab. Returns:
//   { merged: Fill[], added: number, skipped: number }
export function mergeFills(existingFills, incomingFills) {
  const existing = Array.isArray(existingFills) ? existingFills : []
  const incoming = Array.isArray(incomingFills) ? incomingFills : []
  const seen = new Map()
  for (const f of existing) seen.set(f.id, f)
  let added = 0
  let skipped = 0
  for (const f of incoming) {
    if (!f || typeof f.id !== 'string') {
      skipped += 1
      continue
    }
    if (seen.has(f.id)) {
      skipped += 1
      continue
    }
    seen.set(f.id, f)
    added += 1
  }
  const merged = [...seen.values()].sort(chronological)
  return { merged, added, skipped }
}

// Full sync step: given the existing stored fills (Fill[]) and a fresh batch
// pulled from the adapter, return the new fills set, the regenerated trades,
// and a sync summary. Caller persists merged + trades to KV (or wherever).
export function applySyncBatch(existingFills, incomingFills) {
  const existingTradeCount = aggregateFills(existingFills || []).length
  const { merged, added, skipped } = mergeFills(existingFills, incomingFills)
  const trades = aggregateFills(merged)
  return {
    mergedFills: merged,
    trades,
    summary: {
      fillsPulled: (incomingFills || []).length,
      fillsAdded: added,
      fillsSkipped: skipped,
      tradesTotal: trades.length,
      tradesBefore: existingTradeCount,
      tradesDelta: trades.length - existingTradeCount,
    },
  }
}
