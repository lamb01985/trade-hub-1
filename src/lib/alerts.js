// Alert Engine — browser notifications + audio

let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

// Play a tone with given frequency, duration, and envelope
function playTone(freq, duration = 0.15, type = 'sine', volume = 0.3) {
  try {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch (e) {
    console.warn('Audio error:', e)
  }
}

// Alert sounds for different event types
export const Sounds = {
  levelTouch: () => {
    playTone(880, 0.1)
    setTimeout(() => playTone(1100, 0.15), 120)
  },
  levelBreak: () => {
    playTone(660, 0.1)
    setTimeout(() => playTone(880, 0.1), 100)
    setTimeout(() => playTone(1100, 0.2), 200)
  },
  orbBreakout: () => {
    playTone(440, 0.08)
    setTimeout(() => playTone(550, 0.08), 80)
    setTimeout(() => playTone(660, 0.08), 160)
    setTimeout(() => playTone(880, 0.25), 240)
  },
  confluence: () => {
    playTone(700, 0.1, 'triangle')
    setTimeout(() => playTone(900, 0.1, 'triangle'), 120)
    setTimeout(() => playTone(1100, 0.15, 'triangle'), 240)
  },
  warning: () => {
    playTone(330, 0.2, 'square', 0.15)
    setTimeout(() => playTone(330, 0.2, 'square', 0.15), 300)
  },
  clear: () => {
    playTone(523, 0.08)
    setTimeout(() => playTone(659, 0.08), 80)
    setTimeout(() => playTone(784, 0.2), 160)
  },
}

// Browser notification.
// Signature: notify(title, body, urgency = 'normal', tag = 'trade-hub')
// urgency 'high' sets requireInteraction:true so the notification persists
// until the user dismisses it. 'normal' and 'low' auto-dismiss after the
// browser default timeout.
export async function notify(title, body, urgency = 'normal', tag = 'trade-hub') {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'denied') return

  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
  }

  try {
    new Notification(title, {
      body,
      tag,
      icon: '/favicon.ico',
      requireInteraction: urgency === 'high',
      silent: urgency === 'low',
    })
  } catch (e) {
    console.warn('Notification error:', e)
  }
}

// Alert tracker — prevents duplicate alerts within a time window
const recentAlerts = new Map()

export function fireAlert(id, title, body, soundFn, cooldownMs = 30000) {
  const now = Date.now()
  const last = recentAlerts.get(id)
  if (last && now - last < cooldownMs) return false

  recentAlerts.set(id, now)
  notify(title, body, 'normal', id)
  soundFn?.()
  return true
}

// Request permission upfront
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}

// Level monitoring — call on every price update
let prevPrice = null

export function checkLevelAlerts(price, levels, settings = {}) {
  if (!price || !levels?.length || !settings.alertsEnabled) return []
  const fired = []

  for (const level of levels) {
    const dist = Math.abs(price - level.price)

    // Approaching alert (within $0.25)
    if (dist < 0.25 && dist > 0.02) {
      const side = price > level.price ? 'approaching from above' : 'approaching from below'
      const id = `approach-${level.label}-${Math.round(level.price * 100)}`
      const didFire = fireAlert(id, `QQQ Near ${level.label}`, `$${price.toFixed(2)} — ${side} $${level.price.toFixed(2)}`, Sounds.levelTouch, 60000)
      if (didFire) fired.push({ type: 'approach', level, price })
    }

    // Break alert — price crossed a level since last update
    if (prevPrice != null) {
      const crossed = (prevPrice < level.price && price >= level.price) || (prevPrice > level.price && price <= level.price)
      if (crossed) {
        const dir = price >= level.price ? '▲ BROKE ABOVE' : '▼ BROKE BELOW'
        const id = `break-${level.label}-${Math.round(level.price * 100)}-${Math.round(price * 10)}`
        const didFire = fireAlert(id, `${dir} ${level.label}`, `QQQ $${price.toFixed(2)} crossed ${level.label} at $${level.price.toFixed(2)}`, Sounds.levelBreak, 5000)
        if (didFire) fired.push({ type: 'break', direction: dir, level, price })
      }
    }

    // Confluence alert
    if (dist < 0.30 && level.confluence >= 2) {
      const id = `confluence-${level.label}`
      const didFire = fireAlert(id, `Confluence Zone: ${level.label}`, `${level.confluence + 1} levels stacked near $${level.price.toFixed(2)}`, Sounds.confluence, 120000)
      if (didFire) fired.push({ type: 'confluence', level, price })
    }
  }

  prevPrice = price
  return fired
}

// ─────────────────────────────────────────────────────────────────────────────
// Coach engine sound generators
//
// Each function below is a distinct audible cue mapped to a specific bot state
// transition. All synthesized via OscillatorNode in the existing audioCtx, no
// audio files required.
// ─────────────────────────────────────────────────────────────────────────────

// Schedule a tone with a custom attack and release envelope. Used by the
// coach sounds that need a softer fade than playTone's exponential ramp.
function scheduleTone({ freq, startOffset = 0, duration = 0.15, type = 'sine', volume = 0.3, attack = 0.005, release = null }) {
  try {
    const ctx = getAudioCtx()
    const t0 = ctx.currentTime + startOffset
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + attack)
    const releaseTime = release ?? Math.max(0.01, duration * 0.3)
    gain.gain.setValueAtTime(volume, t0 + duration - releaseTime)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.start(t0)
    osc.stop(t0 + duration + 0.01)
  } catch (e) {
    console.warn('Audio error:', e)
  }
}

// Schedule a frequency glide (sine ramp from f0 to f1 over duration).
function scheduleGlide({ f0, f1, startOffset = 0, duration = 0.4, type = 'sine', volume = 0.3 }) {
  try {
    const ctx = getAudioCtx()
    const t0 = ctx.currentTime + startOffset
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.linearRampToValueAtTime(f1, t0 + duration)
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01)
    gain.gain.setValueAtTime(volume, t0 + duration * 0.7)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.start(t0)
    osc.stop(t0 + duration + 0.01)
  } catch (e) {
    console.warn('Audio error:', e)
  }
}

// WAIT to WATCH transition. Gentle, single sine wave, easy to overhear.
export function playSetupForming() {
  scheduleTone({ freq: 440, duration: 0.2, type: 'sine', volume: 0.25, attack: 0.02, release: 0.12 })
}

// WATCH to GO transition. Three ascending square-wave tones, loud and
// distinct so it cuts through other tabs.
export function playGoLive() {
  scheduleTone({ freq: 660, startOffset: 0.00, duration: 0.15, type: 'square', volume: 0.45 })
  scheduleTone({ freq: 880, startOffset: 0.20, duration: 0.15, type: 'square', volume: 0.45 })
  scheduleTone({ freq: 1100, startOffset: 0.40, duration: 0.15, type: 'square', volume: 0.45 })
}

// GO to IN_TRADE transition. Single short click.
export function playPositionOpened() {
  scheduleTone({ freq: 660, duration: 0.08, type: 'sine', volume: 0.35, attack: 0.002, release: 0.04 })
}

// IN_TRADE to CLOSED (win). Four-note ascending arpeggio across 800ms total.
// Notes: C5 523, E5 659, G5 784, C6 1047.
export function playWin() {
  scheduleTone({ freq: 523, startOffset: 0.00, duration: 0.20, type: 'sine', volume: 0.35 })
  scheduleTone({ freq: 659, startOffset: 0.20, duration: 0.20, type: 'sine', volume: 0.35 })
  scheduleTone({ freq: 784, startOffset: 0.40, duration: 0.20, type: 'sine', volume: 0.35 })
  scheduleTone({ freq: 1047, startOffset: 0.60, duration: 0.20, type: 'sine', volume: 0.35 })
}

// IN_TRADE to CLOSED (loss). Single descending sine glide 400Hz to 220Hz
// over 400ms. Firm, not punitive.
export function playLoss() {
  scheduleGlide({ f0: 400, f1: 220, duration: 0.4, type: 'sine', volume: 0.3 })
}

// Position price within $X of stop. Two-tone ping at 550Hz.
export function playStopWarning() {
  scheduleTone({ freq: 550, startOffset: 0.00, duration: 0.10, type: 'square', volume: 0.35 })
  scheduleTone({ freq: 550, startOffset: 0.20, duration: 0.10, type: 'square', volume: 0.35 })
}

// any to LOCKED. Low sustained tone, signals the day is done.
export function playLockout() {
  scheduleTone({ freq: 200, duration: 0.6, type: 'sine', volume: 0.4, attack: 0.04, release: 0.25 })
}

// ─────────────────────────────────────────────────────────────────────────────
// Document title state indicator
//
// updateTabTitle(state, summary) prefixes document.title with a state-aware
// indicator so the user can see the bot state without focusing the tab.
// Restores the original title when state is WAIT or CLOSED.
// ─────────────────────────────────────────────────────────────────────────────

let _originalTitle = null

function ensureOriginalTitle() {
  if (typeof document === 'undefined') return null
  if (_originalTitle == null) _originalTitle = document.title || 'Trade Hub'
  return _originalTitle
}

export function updateTabTitle(state, summary = {}) {
  if (typeof document === 'undefined') return
  const original = ensureOriginalTitle()
  const ticker = (summary.ticker || 'QQQ').toUpperCase()
  const direction = (summary.direction || '').toUpperCase()
  const pl = summary.pl

  let next = original
  switch (state) {
    case 'WATCH':
      next = `[WATCH] ${ticker}`
      break
    case 'GO':
      next = `[GO ${direction || ''}] ${ticker}`.replace(/\s+/g, ' ').trim()
      break
    case 'IN_TRADE': {
      const sign = pl != null && pl >= 0 ? '+' : '-'
      const abs = pl != null ? Math.abs(pl).toFixed(0) : '?'
      next = `${sign}$${abs} ${ticker}`
      break
    }
    case 'LOCKED':
      next = `[LOCKED] ${original}`
      break
    case 'WAIT':
    case 'CLOSED':
    default:
      next = original
  }
  if (document.title !== next) document.title = next
}
