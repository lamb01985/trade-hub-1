// ─────────────────────────────────────────────────────────────────────────────
// Adapter: Schwab Trader API response → normalized Fill[].
//
// Status: scaffold. Field mapping is intentionally not implemented until a
// real Schwab response payload is reviewed. The Schwab Trader API exposes
// completed activity through two adjacent surfaces:
//
//   /trader/v1/accounts/{hash}/transactions?types=TRADE&startDate=...&endDate=...
//   /trader/v1/accounts/{hash}/orders?status=FILLED&fromEnteredTime=...&toEnteredTime=...
//
// Open question to confirm against a real sample: whether each partial fill
// on an order shows up as a distinct transaction row, or whether all fills
// for one order collapse into a single transaction (in which case we have to
// drop down into orderActivityCollection[].executionLegs[] on the orders
// endpoint to get per-execution price and quantity). The aggregator
// downstream wants one Fill per execution, so we have to land on whichever
// endpoint actually exposes that granularity.
//
// Once the sample lands, this file fills in:
//
//   normalizeSchwabTransaction(rawTransaction): Fill
//   normalizeSchwabOrder(rawOrder): Fill[]
//
// Both targeting the Fill contract documented in ./thinkOrSwim.js.
//
// Symbol normalization rules (these will be implemented when the mapping
// lands so the engine sees consistent symbol strings):
//
//   Equities and ETFs: bare ticker, eg "QQQ", "SPY".
//   Futures: leading slash + root symbol with month/year, eg "/MNQU6". This
//     keeps each contract its own symbol so the aggregator never merges
//     positions across rolls.
//   Options: OCC/OSI standard, 21 chars: 6-char padded ticker + YYMMDD +
//     C/P + 8-digit strike (price * 1000). This matches what schwabClient.js
//     occSymbol() already produces for the UI side, so options groupable
//     across both sources.
// ─────────────────────────────────────────────────────────────────────────────

const NEED_SAMPLE = (
  'Schwab adapter field mapping is pending. Paste one real /transactions or '
  + '/orders response that covers an equity buy + sell, a futures /MNQ '
  + 'buy + sell, and one single-leg option open + close. Then this adapter '
  + 'will fill in normalizeSchwabTransaction and/or normalizeSchwabOrder.'
)

export function normalizeSchwabTransaction(/* rawTransaction */) {
  throw new Error(NEED_SAMPLE)
}

export function normalizeSchwabOrder(/* rawOrder */) {
  throw new Error(NEED_SAMPLE)
}

// Batch entry point. Once the per-record normalizers are implemented this is
// where the sync endpoint and tests will plug in. Until then it throws so
// the cron and the manual button surface a clear "needs configuration"
// message instead of silently returning zero fills.
export function normalizeSchwabBatch(/* rawResponse */) {
  throw new Error(NEED_SAMPLE)
}
