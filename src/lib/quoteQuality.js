export const STALE_TRADE_MS = 60_000
export const REST_QUOTE_REFRESH_MS = 30_000
const MAX_FUTURE_SKEW_MS = 30_000

export function normalizeTradeTimestamp(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n >= 1e17 ? n / 1e6 : n >= 1e14 ? n / 1e3 : n >= 1e11 ? n : n * 1000)
}

export function selectLatestTrade(previous, incoming, now = Date.now()) {
  if (!incoming || !Number.isFinite(incoming.price) || incoming.price <= 0) return previous
  const timestamp = normalizeTradeTimestamp(incoming.timestamp)
  if (timestamp != null && timestamp > now + MAX_FUTURE_SKEW_MS) return previous
  if (previous?.timestamp != null && (timestamp == null || timestamp < previous.timestamp)) return previous
  return { ...incoming, timestamp }
}

export function tradeSession(timestamp) {
  const stamp = normalizeTradeTimestamp(timestamp)
  if (stamp == null) return 'Session unverified'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(stamp))
  const minute = Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value)
  if (minute >= 240 && minute < 570) return 'Premarket trade'
  if (minute >= 570 && minute < 960) return 'Regular-session trade'
  if (minute >= 960 && minute < 1200) return 'After-hours trade'
  return 'Outside standard feed hours'
}

export function tradeFreshness(timestamp, now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(now))
  const part = name => parts.find(p => p.type === name)?.value
  const minute = Number(part('hour')) * 60 + Number(part('minute'))
  const stamp = normalizeTradeTimestamp(timestamp)
  const ageMs = stamp == null ? null : now - stamp
  if (minute >= 1200 || minute < 240) return { fresh: false, label: 'OVERNIGHT NOT COVERED', ageMs }
  if (part('weekday') === 'Sat' || part('weekday') === 'Sun') return { fresh: false, label: 'FEED CLOSED', ageMs }
  if (ageMs == null || ageMs < -MAX_FUTURE_SKEW_MS) return { fresh: false, label: 'TIME UNVERIFIED', ageMs }
  if (ageMs > STALE_TRADE_MS) return { fresh: false, label: 'STALE LAST TRADE', ageMs }
  return { fresh: true, label: 'RECENT LAST TRADE', ageMs }
}
