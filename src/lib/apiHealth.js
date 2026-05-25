// ─────────────────────────────────────────────────────────────────────────────
// apiHealth.js — tiny in-memory tracker of recent Polygon API outcomes.
//
// Massive's HTTP client records each request via recordSuccess / recordFailure
// (no-op when the call is served from cache). Components subscribe via
// subscribe(fn) and read the rolling-5-minute counters to draw the header
// indicator and the detail modal.
//
// All state lives in module memory; nothing persists across reloads.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 5 * 60 * 1000
const MAX_ERRORS_REMEMBERED = 30

let events = []          // [{ ts, kind: 'success' | 'failure' | 'rate_limit' | 'unavailable', detail }]
let subscribers = []

// Permanently-unavailable endpoint patterns (Polygon 403, plan tier). Tracked
// here as a flat list — the live truth lives in massive.js. apiHealth keeps a
// mirror so the header indicator modal can render it without depending on the
// API client module load order.
let unavailableEndpoints = []   // [{ pattern, firstSeenTs, hint? }]

function prune() {
  const cutoff = Date.now() - WINDOW_MS
  // Drop expired events from the front. Array is roughly time-ordered, so
  // a linear scan from the front is fine for the volumes we expect.
  let cutIdx = 0
  while (cutIdx < events.length && events[cutIdx].ts < cutoff) cutIdx++
  if (cutIdx > 0) events = events.slice(cutIdx)
}

function notify() {
  prune()
  const snap = snapshot()
  for (const fn of subscribers) {
    try { fn(snap) } catch {}
  }
}

export function recordSuccess(detail = null) {
  events.push({ ts: Date.now(), kind: 'success', detail })
  notify()
}
export function recordFailure(detail = null) {
  events.push({ ts: Date.now(), kind: 'failure', detail })
  if (errorBufferCount() > MAX_ERRORS_REMEMBERED) {
    // Trim earliest failures, keep successes intact for the success ratio.
    const removed = []
    const next = []
    for (const e of events) {
      if (e.kind === 'failure' && removed.length < 5) {
        removed.push(e); continue
      }
      next.push(e)
    }
    events = next
  }
  notify()
}
export function recordRateLimit(detail = null) {
  events.push({ ts: Date.now(), kind: 'rate_limit', detail })
  notify()
}

// Records a NEW unavailable endpoint (first time we saw the 403). Idempotent:
// the second 403 for the same pattern is a no-op so we don't double-notify or
// inflate the recent-error list.
export function recordUnavailable(pattern, hint = null) {
  if (!pattern) return
  if (unavailableEndpoints.some(e => e.pattern === pattern)) return
  unavailableEndpoints.push({ pattern, firstSeenTs: Date.now(), hint })
  events.push({ ts: Date.now(), kind: 'unavailable', detail: { url: pattern, hint } })
  notify()
}

export function getUnavailableEndpoints() {
  return unavailableEndpoints.slice()
}

function errorBufferCount() {
  let n = 0
  for (const e of events) if (e.kind !== 'success') n++
  return n
}

export function snapshot() {
  prune()
  const successes = events.filter(e => e.kind === 'success').length
  const failures = events.filter(e => e.kind === 'failure').length
  const rateLimits = events.filter(e => e.kind === 'rate_limit').length
  const total = successes + failures + rateLimits
  const errorRate = total > 0 ? (failures + rateLimits) / total : 0
  // Color: lime when no recent errors. Yellow when any errors but ratio
  // below 25%. Red when ratio at or above 25% (and at least 3 errors so we
  // don't flip red on a single isolated failure).
  let status = 'green'
  if (failures + rateLimits >= 3 && errorRate >= 0.25) status = 'red'
  else if (failures + rateLimits > 0) status = 'yellow'
  const recentErrors = events
    .filter(e => e.kind !== 'success')
    .slice(-10)
    .reverse()
  return {
    status,
    successes,
    failures,
    rateLimits,
    total,
    errorRate,
    windowMs: WINDOW_MS,
    recentErrors,
    unavailableEndpoints: unavailableEndpoints.slice(),
  }
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {}
  subscribers.push(fn)
  try { fn(snapshot()) } catch {}
  return () => { subscribers = subscribers.filter(s => s !== fn) }
}

export function clear() {
  events = []
  unavailableEndpoints = []
  notify()
}
