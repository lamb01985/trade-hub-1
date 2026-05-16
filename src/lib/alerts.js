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

// Browser notification
export async function notify(title, body, tag = 'trade-hub') {
  if (!('Notification' in window)) return
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
      requireInteraction: false,
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
  notify(title, body, id)
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
