export const MINUTE_MS = 60_000
export const BAR_MS = 5 * MINUTE_MS
export const MAX_DATA_AGE_MS = 2 * MINUTE_MS
export const MIN_REWARD_RISK = 2
export const MIN_VWAP_SLOPE = 0.01
export const STOP_BUFFER = 0.01
export const SWING_BARS = 3

const et = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
export function sessionClock(now) {
  const p = Object.fromEntries(et.formatToParts(new Date(now)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute), weekend: ['Sat', 'Sun'].includes(p.weekday) }
}

// Only complete, continuous current-session minute bars may create a signal.
export function evaluateSimpleStrategy(input, now = Date.now()) {
  const clock = sessionClock(now)
  const base = { ticker: 'QQQ', date: clock.date, state: 'WAIT', reason: 'Wait until 9:30 a.m. Central.', signal: null, range: null, vwap: null, asOf: null }
  if (clock.weekend || clock.minute < 570 || clock.minute >= 960) return { ...base, state: 'CLOSED', reason: 'Outside regular trading hours.' }
  const rows = [...new Map((input || []).filter(b => Number.isFinite(b.t) && b.t % MINUTE_MS === 0 && b.t + MINUTE_MS <= now && sessionClock(b.t).date === clock.date && sessionClock(b.t).minute >= 570 && sessionClock(b.t).minute < 960).map(b => [b.t, b])).values()].sort((a, b) => a.t - b.t)
  if (!rows.length) return { ...base, state: 'NO_DATA', reason: 'No completed current-session data. Alerts paused.' }
  base.asOf = rows.at(-1).t + MINUTE_MS
  if (now - base.asOf > MAX_DATA_AGE_MS) return { ...base, state: 'STALE', reason: 'Minute data is delayed or stale. Alerts paused.' }
  const open = rows[0].t
  if (sessionClock(open).minute !== 570 || rows.some((b, i) => b.t !== open + i * MINUTE_MS || ![b.o, b.h, b.l, b.c, b.v].every(Number.isFinite) || b.v <= 0 || b.h < Math.max(b.o, b.c) || b.l > Math.min(b.o, b.c) || b.l <= 0)) return { ...base, state: 'NO_DATA', reason: 'Incomplete or invalid session bars. Alerts paused.' }
  if (clock.minute < 630 || rows.length < 60) return base
  const firstHour = rows.slice(0, 60)
  const high = Math.max(...firstHour.map(b => b.h)), low = Math.min(...firstHour.map(b => b.l))
  base.range = { high, low, mid: (high + low) / 2 }
  let pv = 0, volume = 0
  const five = []
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i]
    pv += (Number.isFinite(b.vw) ? b.vw : (b.h + b.l + b.c) / 3) * b.v
    volume += b.v
    if ((i + 1) % 5 === 0) {
      const group = rows.slice(i - 4, i + 1)
      five.push({ t: group[0].t, o: group[0].o, h: Math.max(...group.map(x => x.h)), l: Math.min(...group.map(x => x.l)), c: b.c, vwap: pv / volume })
    }
  }
  const b = five.at(-1), previous = five.at(-2)
  base.vwap = b?.vwap ?? null
  if (!b || b.t < open + 60 * MINUTE_MS) return { ...base, reason: 'First hour set. Waiting for a completed pullback candle.' }
  const mid = base.range.mid
  const long = mid > b.vwap && b.c > mid && b.c > b.vwap && b.vwap - previous.vwap >= MIN_VWAP_SLOPE
  const short = mid < b.vwap && b.c < mid && b.c < b.vwap && previous.vwap - b.vwap >= MIN_VWAP_SLOPE
  if (!long && !short) return { ...base, state: 'SKIP', reason: 'No clear direction at the midpoint. Wait.' }
  const direction = long ? 'LONG' : 'SHORT'
  const watch = { ...base, state: 'WATCH', direction, reason: `Watch for a ${direction.toLowerCase()} pullback to $${mid.toFixed(2)}.` }
  if (!(b.l <= mid && b.h >= mid) || (long ? previous.c <= mid : previous.c >= mid)) {
    const latest = rows.at(-1)
    if (latest.t >= b.t + BAR_MS && latest.l <= mid && latest.h >= mid) watch.watchAlert = { id: `${clock.date}:LEVEL:${direction}`, direction }
    return watch
  }
  const swing = five.slice(-SWING_BARS)
  const entry = long ? b.h + STOP_BUFFER : b.l - STOP_BUFFER
  const stop = long ? Math.min(...swing.map(x => x.l)) - STOP_BUFFER : Math.max(...swing.map(x => x.h)) + STOP_BUFFER
  const target = long ? high : low
  const risk = long ? entry - stop : stop - entry
  const reward = long ? target - entry : entry - target
  const rr = reward / risk
  if (!(risk > 0 && rr >= MIN_REWARD_RISK)) return { ...base, state: 'SKIP', direction, reason: 'Pullback confirmed, but less than 2:1 to the target. Skip.' }
  const expiresAt = b.t + 2 * BAR_MS
  if (now >= expiresAt) return { ...watch, reason: 'Confirmation expired. Wait for a fresh setup.' }
  // Do not send an entry plan after the next candle already crossed or invalidated it.
  const following = rows.filter(x => x.t >= b.t + BAR_MS)
  if (following.some(x => long ? x.h >= entry || x.l <= stop : x.l <= entry || x.h >= stop)) return { ...base, state: 'SKIP', direction, reason: 'Entry already passed or setup invalidated. Do not chase.' }
  return { ...base, state: 'CONFIRMED', direction, reason: 'Pullback confirmed. Review the plan; enter only on the trigger.', signal: { id: `${clock.date}:${direction}:${b.t}`, direction, entry, stop, target, rr, confirmedAt: b.t + BAR_MS, expiresAt } }
}

export function strategyMessage(result) {
  const s = result.signal
  if (!s) return `QQQ: ${result.reason}`
  const time = new Date(s.expiresAt).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
  return `QQQ ${s.direction}: pullback confirmed\nTrigger ${s.direction === 'LONG' ? 'above' : 'below'} $${s.entry.toFixed(2)} | stop $${s.stop.toFixed(2)} | target $${s.target.toFixed(2)}\n${s.rr.toFixed(1)}:1 potential reward/risk. Expires ${time} Central.\nCheck live price. Skip if entry passed. Underlying-price plan, no automatic order.`
}
