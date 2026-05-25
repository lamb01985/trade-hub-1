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
