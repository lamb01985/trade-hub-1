import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import schema from '../../contracts/market-data-envelope-v1.schema.json' with { type: 'json' }
const ajv = new Ajv({ allErrors: true, strictNumbers: true })
addFormats(ajv)
const check = ajv.compile(schema)
export function assertMarketDataEnvelope(value, { resource, symbol, profile } = {}) {
  if (!check(value)) throw new Error('INVALID_MARKET_DATA_ENVELOPE')
  const instrument = value.instrument
  if (instrument && instrument.canonical_id !== `ETF:US:${instrument.provider_symbol}`) throw new Error('INSTRUMENT_MISMATCH')
  if (symbol && instrument?.provider_symbol !== symbol) throw new Error('INSTRUMENT_MISMATCH')
  if (profile && value.deployment_profile !== profile) throw new Error('PROFILE_MISMATCH')
  if (resource && value.source.endpoint_family !== resource) throw new Error('ENDPOINT_MISMATCH')
  const family = value.source.endpoint_family
  if (value.data !== null && ((family === 'snapshot' && !('last_trade' in value.data)) || (family === 'bars' && !('bars' in value.data)) || (family === 'capabilities' && !('records' in value.data)))) throw new Error('RESOURCE_SHAPE')
  if (value.data !== null && family !== 'capabilities' && !instrument) throw new Error('MISSING_INSTRUMENT')
  if (value.error && value.data !== null) throw new Error('ERROR_WITH_DATA')
  if (value.data?.records && instrument !== null) throw new Error('CAPABILITY_IDENTITY')
  for (const key of ['bid', 'ask', 'last_trade']) {
    const field = value.data?.[key]
    if (field && (field.instrument_id !== instrument?.canonical_id || field.endpoint_family !== value.source.endpoint_family || field.price_kind !== ({bid:'BID',ask:'ASK',last_trade:'TRADE'})[key])) throw new Error('FIELD_IDENTITY')
  }
  let previous = null
  for (const bar of value.data?.bars || []) {
    if (bar.instrument_id !== instrument?.canonical_id || Date.parse(bar.end) - Date.parse(bar.start) !== 60000 || (previous !== null && Date.parse(bar.start) <= previous) || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) || bar.low > bar.high || (bar.completed && Date.parse(bar.end) > Date.parse(value.generated_at))) throw new Error('INVALID_BAR')
    previous = Date.parse(bar.start)
  }
  if (value.quality.freshness === 'CURRENT' && (value.availability !== 'AVAILABLE' || value.quality.source_age_seconds === null || value.quality.source_age_seconds < 0)) throw new Error('INVALID_CURRENT_QUALITY')
  if (value.quality.freshness === 'CURRENT') {
    const maxAge = family === 'bars' ? 90 : 30
    if (value.quality.source_age_seconds > maxAge || value.coverage_details.pagination_complete !== true) throw new Error('INVALID_CURRENT_AGE_OR_PAGINATION')
    if (family === 'bars') {
      const coverage = value.coverage_details
      const bars = value.data?.bars || []
      const latest = bars.at(-1)
      const window = coverage.requested_window
      if (value.quality.coverage !== 'COMPLETE' || coverage.missing_intervals.length || !window || !latest || !latest.completed || bars.length < (coverage.minimum_required ?? Infinity) || bars.some(bar => !bar.completed || Date.parse(bar.start) < Date.parse(window.from) || Date.parse(bar.end) > Date.parse(window.to))) throw new Error('INCOMPLETE_CURRENT_BARS')
      const age = (Date.parse(value.generated_at) - Date.parse(latest.end)) / 1000
      if (age < 0 || age > 90 || Math.abs(age - value.quality.source_age_seconds) > 0.002) throw new Error('INVALID_CURRENT_BAR_AGE')
    }
  }
  if (value.quality.freshness === 'CURRENT' && value.data && 'bid' in value.data) {
    const optional = ['last_trade', 'bid_size', 'ask_size']
    if (value.quality.coverage === 'UNKNOWN' || [...value.quality.missing_fields,...value.quality.invalid_fields].some(field => !optional.includes(field))) throw new Error('INCOMPLETE_CURRENT_QUOTE')
    const {bid, ask} = value.data
    const olderAge = Math.max(...[bid,ask].map(field => field?.source_time ? (Date.parse(value.generated_at)-Date.parse(field.source_time))/1000 : Infinity))
    if (Math.abs(olderAge - value.quality.source_age_seconds) > 0.002) throw new Error('INVALID_CURRENT_QUOTE_AGE')
    if (!bid || !ask || bid.value <= 0 || ask.value < bid.value || [bid,ask].some(f => !f.field_quality.valid || f.field_quality.freshness !== 'CURRENT' || f.feed_timeframe !== 'REAL_TIME' || !f.source_time || Date.parse(value.generated_at) - Date.parse(f.source_time) < 0 || Date.parse(value.generated_at) - Date.parse(f.source_time) > 30000) || Math.abs(Date.parse(bid.source_time)-Date.parse(ask.source_time)) > 5000) throw new Error('INVALID_CURRENT_QUOTE')
  }
  return value
}
export function validateMarketDataEnvelope(value) { try { assertMarketDataEnvelope(value); return true } catch { return false } }
export function marketDataEnvelopeErrors(value) { try { assertMarketDataEnvelope(value); return [] } catch (error) { return check.errors || [error.message] } }
// Display-time aging never promotes a server quality state or resets source time.
export function displayFreshness(envelope, elapsedSeconds = 0) {
  const freshness = envelope?.quality.freshness || 'UNKNOWN'
  if (freshness === 'CURRENT' && envelope.quality.source_age_seconds + elapsedSeconds > (envelope.data?.bars ? 90 : 30)) return 'STALE'
  return freshness
}
