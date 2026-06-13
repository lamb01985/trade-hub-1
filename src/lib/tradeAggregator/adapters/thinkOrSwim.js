// ─────────────────────────────────────────────────────────────────────────────
// Adapter: thinkorswim account statement CSV → normalized Fill[].
//
// Status: scaffold. Column mapping is not yet finalized because the exact
// thinkorswim export format depends on which section of the statement is
// included (Account Statement vs Trade History vs Filled Orders) and on the
// account type. Will be filled in after a sample CSV is reviewed.
//
// Contract for any adapter, including future Schwab API and IBKR FlexQuery:
//
//   parse(input) -> Fill[]
//
// where each Fill is:
//
//   { id, timestamp (ISO 8601), symbol, side ('buy'|'sell'),
//     qty (positive number), price (positive number) }
//
// Conventions the engine expects:
//   - side is always 'buy' or 'sell', not 'BTO'/'STC'/etc. Translate at the
//     adapter boundary so the engine stays broker-agnostic.
//   - qty is a strictly positive number. Direction comes from side.
//   - symbol is whatever string identifies the instrument uniquely within
//     this dataset. Future symbols like /MNQ should be passed through as is.
//     Options multi-leg orders should resolve to one fill per leg, with the
//     option symbol carrying enough detail to make each leg unique.
//   - timestamp must sort lexicographically into chronological order, which
//     ISO 8601 with a fixed offset (or UTC Z) guarantees.
//
// The aggregator in ../tradeAggregator.js consumes Fill[] and emits Trade[].
// All accounting (avg entry, scale tracking, flip splitting, P&L) lives in
// the engine. Adapters do parsing only.
// ─────────────────────────────────────────────────────────────────────────────

export function parseThinkOrSwimCSV(/* csvText */) {
  throw new Error(
    'parseThinkOrSwimCSV: column mapping pending. Provide a sample CSV (one row '
    + 'of each execution type if possible: stock buy, stock sell, futures /MNQ '
    + 'buy + sell, single-leg option open + close) and the column mapping will '
    + 'be filled in here. The adapter contract above is stable.',
  )
}

// Future adapter slot, intentionally not implemented yet. Schwab order history
// will land via /api/schwab/orders and a sanitizer that conforms to the same
// Fill contract.
export function parseSchwabOrders(/* schwabOrdersJson */) {
  throw new Error('parseSchwabOrders: not implemented in this phase.')
}
