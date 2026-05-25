// ─────────────────────────────────────────────────────────────────────────────
// notify.js — tiny in-app toast queue + best-effort browser notifications.
//
// notify({ id?, title, body, kind?, action?, ttlMs? })
//   id      string — dedupe key. If omitted, an auto id is generated.
//   title   string — required, shown bold at top of the toast.
//   body    string — optional second line.
//   kind    'info' | 'success' | 'warn' | 'trigger'
//   action  { label, onClick } — optional button on the toast.
//   ttlMs   number — auto-dismiss after this many ms. 0 = sticky.
//
// Toasts render via a global subscriber list. The App-level overlay component
// subscribes and renders them; nothing here touches the DOM directly.
// ─────────────────────────────────────────────────────────────────────────────

let TOASTS = []
let SUBS = []

function emit() {
  const snap = TOASTS.slice()
  for (const fn of SUBS) {
    try { fn(snap) } catch {}
  }
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {}
  SUBS.push(fn)
  // Hand the new subscriber the current state.
  try { fn(TOASTS.slice()) } catch {}
  return () => { SUBS = SUBS.filter(s => s !== fn) }
}

export function notify({ id, title, body, kind = 'info', action = null, ttlMs = 0 } = {}) {
  if (!title) return null
  const toastId = id || `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  // Dedupe: replace any existing toast with the same id.
  TOASTS = [
    { id: toastId, title, body, kind, action, createdAt: Date.now() },
    ...TOASTS.filter(t => t.id !== toastId),
  ].slice(0, 12)
  emit()
  if (ttlMs > 0) {
    setTimeout(() => dismiss(toastId), ttlMs)
  }
  // Best-effort native notification when the page is hidden or backgrounded.
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body: body || '' })
    }
  } catch {}
  return toastId
}

export function dismiss(id) {
  TOASTS = TOASTS.filter(t => t.id !== id)
  emit()
}

export function clearAll() {
  TOASTS = []
  emit()
}

// Request permission once. Browsers ignore re-prompts after a denial, so this
// is best-effort and silent on failure.
export function requestNotificationPermission() {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  } catch {}
}

// ── Off-app channel formatting + dispatch ─────────────────────────────────

function fmtNum(n, d = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(d)
}

function plainTrade(plan, ticker) {
  if (!plan) return ''
  if (plan.optionType) {
    return `${plan.side} ${ticker} ${plan.expiration} $${plan.strike} ${plan.optionType.toUpperCase()}, ~${plan.contracts} contracts, est premium $${fmtNum(plan.estPremium)}`
  }
  return `${plan.side} ${ticker} ${plan.shares} shares @ ~$${fmtNum(plan.price)}`
}

// Markdown for Telegram. Uses Telegram's safe-ish Markdown dialect.
export function formatTriggerTelegram(setup, ticker, snapshot, stagedTrade, conditionResults = []) {
  const lines = []
  lines.push(`*${setup.name} triggered on ${ticker}*`)
  lines.push(`Direction: ${(setup.direction || 'either').toUpperCase()}`)
  if (snapshot?.price != null) lines.push(`Price: $${fmtNum(snapshot.price)}`)
  if (stagedTrade) lines.push(`Plan: ${plainTrade(stagedTrade, ticker)}`)
  const met = (conditionResults || []).filter(c => c.met)
  if (met.length) {
    lines.push('')
    lines.push('Conditions met:')
    for (const c of met) lines.push(`- ${c.label || c.type}`)
  }
  if (setup.alerts?.priority === 'urgent') lines.push('')
  if (setup.alerts?.priority === 'urgent') lines.push('_priority: urgent_')
  return lines.join('\n')
}

// HTML for email. Plain, readable, no inline CSS dependencies.
export function formatTriggerEmail(setup, ticker, snapshot, stagedTrade, conditionResults = []) {
  const met = (conditionResults || []).filter(c => c.met)
  const condList = met.length
    ? `<ul>${met.map(c => `<li>${(c.label || c.type)}</li>`).join('')}</ul>`
    : ''
  const planLine = stagedTrade
    ? `<p><strong>Plan:</strong> ${plainTrade(stagedTrade, ticker)}</p>`
    : ''
  return `<div style="font-family: ui-monospace, monospace; color: #111">
    <h2 style="margin:0 0 8px 0">${setup.name} triggered on ${ticker}</h2>
    <p style="margin:0 0 4px 0">Direction: <strong>${(setup.direction || 'either').toUpperCase()}</strong></p>
    <p style="margin:0 0 4px 0">Price: <strong>$${fmtNum(snapshot?.price)}</strong></p>
    ${planLine}
    ${condList ? `<p style="margin:12px 0 4px 0"><strong>Conditions met:</strong></p>${condList}` : ''}
    ${setup.alerts?.priority === 'urgent' ? '<p style="color:#a00"><em>priority: urgent</em></p>' : ''}
  </div>`
}

// Fire-and-forget POST to a serverless notification endpoint. Logs errors
// to console; never throws into the caller.
async function postJson(url, body) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      console.warn(`[notify] ${url} returned ${r.status}: ${text.slice(0, 160)}`)
    }
  } catch (e) {
    console.warn(`[notify] ${url} failed:`, e?.message || e)
  }
}

// Main dispatcher used by the trigger detection effect. Fires the in-app
// toast unconditionally, then routes to Telegram + email per the setup's
// alerts.channels flags. All off-app sends are fire-and-forget.
//
// args:
//   { setup, ticker, snapshot, stagedTrade, conditionResults, action }
export function notifyTriggered({ setup, ticker, snapshot, stagedTrade, conditionResults, action } = {}) {
  if (!setup || !ticker) return null
  const channels = setup.alerts?.channels || {}
  const priority = setup.alerts?.priority === 'urgent' ? 'trigger' : 'trigger'

  // In-app toast (always on, unless the alert is fully disabled).
  let toastId = null
  if (channels.inApp !== false) {
    toastId = notify({
      id: `setup-${setup.id}-${ticker}`,
      title: `${setup.name}: triggered on ${ticker}`,
      body: stagedTrade
        ? `${stagedTrade.side}${stagedTrade.optionType ? ` $${stagedTrade.strike} ${stagedTrade.optionType.toUpperCase()} ${stagedTrade.expiration}` : ''} · Price $${fmtNum(snapshot?.price)}`
        : `Price $${fmtNum(snapshot?.price)} · open Setups for the staged trade.`,
      kind: priority,
      action: action || null,
      ttlMs: 0,
    })
  }

  if (channels.telegram) {
    postJson('/api/notify-telegram', {
      message: formatTriggerTelegram(setup, ticker, snapshot, stagedTrade, conditionResults),
      parseMode: 'Markdown',
    })
  }
  if (channels.email) {
    postJson('/api/notify-email', {
      subject: `[Trade Hub] ${setup.name} triggered on ${ticker}`,
      html: formatTriggerEmail(setup, ticker, snapshot, stagedTrade, conditionResults),
    })
  }
  return toastId
}
