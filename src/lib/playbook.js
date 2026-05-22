// ─────────────────────────────────────────────────────────────────────────────
// playbook.js — Trade Hub bot coach playbook
//
// Pure logic, no React. Each export is a setup definition with a `detect(ctx)`
// function that returns either null or a setup signal object. The bot engine
// (bot.js) iterates the playbook every tick, picks the highest-confluence
// signal, and drives the state machine from there.
//
// Market context shape, built by useBot.js and passed to detect():
//
//   {
//     ticker:       string                       ('QQQ', 'TQQQ', etc.)
//     currentPrice: number
//     lastPrice:    number | null                (one tick ago, for cross detection)
//     bars5m:       Array<{ t, o, h, l, c, v }>  (most recent first or asc; engine uses last few)
//     levels:       { VWAP, P, R1, R2, R3, S1, S2, S3, PDH, PDL, PDC }   (any missing = null)
//     alignment:    { '1h', '15m', '5m', '1m' }  (each 'ranging' | 'trending_up' | 'trending_down' | 'transition')
//     etMinutes:    number                       (minutes from midnight ET)
//     rvol:         number | null                (relative volume, 1.0 = average)
//     prevSignals:  Array<{ setupId, levelName, outcome, atMinute }>     (today's history for cooldown / proven-level bonus)
//     orb:          { high, low, mid } | null    (today's opening range, populated after 9:45 ET)
//   }
//
// Setup signal shape returned by detect():
//
//   {
//     setupId, setupName, direction,
//     confidence:        number 1-10,
//     entry:             number (underlying price level to enter at),
//     stop:              number (underlying stop level),
//     target:            number (underlying target level),
//     why:               string (human readable reasoning),
//     level:             { name, price },
//     optionDirection:   'call' | 'put',
//     optionStrikeRule:  'atm' | 'atm_plus_1' | 'atm_minus_1',
//   }
// ─────────────────────────────────────────────────────────────────────────────

// ── Tunable thresholds, all named so they can be adjusted without spelunking ─

export const CONFLUENCE_DEFAULT_THRESHOLD = 6     // minimum confluence to surface
export const TOUCH_TOLERANCE = 0.30               // dollars from level counts as touch
export const CONFLUENCE_STACK_RADIUS = 0.30       // levels within this distance stack
export const STOP_OFFSET_LEVEL = 0.40             // dollars beyond pivot levels
export const STOP_OFFSET_VWAP = 0.30              // dollars beyond VWAP for reclaim/lose
export const REVERSAL_MIN_BODY_PCT = 0.35         // body/range ratio for a real reversal candle
export const COOLDOWN_MINUTES = 25                // do not refire same level within this window
export const RVOL_BONUS_THRESHOLD = 1.5           // RVOL above this earns confluence bonus

// ── Time windows in ET minutes from midnight ────────────────────────────────
// Market open 9:30 ET = 570. Chop 10:30 to 13:30 = 630 to 810. Close 16:00 = 960.

const TIME_RANGE_SETUPS = [[570, 630], [810, 900]]   // skip the chop window
const TIME_VWAP_SETUPS  = [[570, 960]]               // anytime in session
const TIME_ORB_SETUPS   = [[585, 720]]               // 9:45 to 12:00 ET

function timeAllowed(etMinutes, windows) {
  for (const [a, b] of windows) {
    if (etMinutes >= a && etMinutes < b) return true
  }
  return false
}

// ── Helpers shared across setups ─────────────────────────────────────────────

// Returns most recent N bars in chronological order (oldest first). Engine
// is expected to pass bars5m already sorted asc; we tolerate both directions
// by reading the most recent values defensively.
function recent(bars, n = 3) {
  if (!bars?.length) return []
  return bars.slice(-n)
}

// Detect a reversal candle: a bar that touched a level (low/high within
// TOUCH_TOLERANCE) and closed back across it. Direction 'long' means the
// candle wicked DOWN to support and closed ABOVE it. Direction 'short' means
// the candle wicked UP to resistance and closed BELOW it.
function reversalCandle(bar, levelPrice, direction) {
  if (!bar || levelPrice == null) return null
  const range = Math.max(0.01, bar.h - bar.l)
  const body = Math.abs(bar.c - bar.o)
  const bodyOk = body / range >= REVERSAL_MIN_BODY_PCT
  if (!bodyOk) return null
  if (direction === 'long') {
    const touched = bar.l <= levelPrice + TOUCH_TOLERANCE && bar.l >= levelPrice - TOUCH_TOLERANCE
    const closedAbove = bar.c > levelPrice
    if (touched && closedAbove) return { touched: bar.l, closed: bar.c, body }
    return null
  }
  // short: wicked up to level, closed below
  const touched = bar.h >= levelPrice - TOUCH_TOLERANCE && bar.h <= levelPrice + TOUCH_TOLERANCE
  const closedBelow = bar.c < levelPrice
  if (touched && closedBelow) return { touched: bar.h, closed: bar.c, body }
  return null
}

// Detect a VWAP reclaim from below (or "lose" from above).
function vwapCross(bars, vwap, direction) {
  if (!vwap || bars.length < 2) return null
  const last = bars[bars.length - 1]
  const prev = bars[bars.length - 2]
  if (direction === 'long') {
    if (prev.c < vwap && last.c > vwap) {
      const body = Math.abs(last.c - last.o)
      const range = Math.max(0.01, last.h - last.l)
      if (body / range >= REVERSAL_MIN_BODY_PCT && last.c > last.o) return { from: prev.c, to: last.c }
    }
    return null
  }
  if (prev.c > vwap && last.c < vwap) {
    const body = Math.abs(last.c - last.o)
    const range = Math.max(0.01, last.h - last.l)
    if (body / range >= REVERSAL_MIN_BODY_PCT && last.c < last.o) return { from: prev.c, to: last.c }
  }
  return null
}

function recentlySignaled(prevSignals, setupId, levelName, etMinutes) {
  if (!prevSignals?.length) return false
  for (const s of prevSignals) {
    if (s.setupId !== setupId) continue
    if (s.levelName !== levelName) continue
    if (etMinutes - s.atMinute < COOLDOWN_MINUTES) return true
  }
  return false
}

// Find the next level above (or below) currentPrice from the levels map.
// Excludes the trigger level itself so we don't pick the same name.
function nextLevelAbove(levels, currentPrice, excludeName) {
  const candidates = []
  for (const [name, price] of Object.entries(levels)) {
    if (price == null || isNaN(price)) continue
    if (name === excludeName) continue
    if (price > currentPrice) candidates.push({ name, price })
  }
  candidates.sort((a, b) => a.price - b.price)
  return candidates[0] || null
}

function nextLevelBelow(levels, currentPrice, excludeName) {
  const candidates = []
  for (const [name, price] of Object.entries(levels)) {
    if (price == null || isNaN(price)) continue
    if (name === excludeName) continue
    if (price < currentPrice) candidates.push({ name, price })
  }
  candidates.sort((a, b) => b.price - a.price)
  return candidates[0] || null
}

// ── Confluence scoring ──────────────────────────────────────────────────────
//
// Returns an integer 1 to 10. Base score is 4 for any valid candidate; bonuses
// stack for additional touching levels, VWAP confluence, strong regime, RVOL,
// and a "proven" level (a setup at this level already succeeded today).

function scoreConfluence({ levels, triggerPrice, triggerLevelName, vwap, alignment, regimeRequired, rvol, prevSignals }) {
  let score = 4

  // Additional levels within stack radius of the trigger
  let stacked = 0
  for (const [name, price] of Object.entries(levels)) {
    if (name === triggerLevelName) continue
    if (price == null || isNaN(price)) continue
    if (Math.abs(price - triggerPrice) <= CONFLUENCE_STACK_RADIUS) stacked++
  }
  score += Math.min(2, stacked)

  // VWAP confluence (separately, if not already counted in stacked because
  // VWAP IS a level entry)
  if (triggerLevelName !== 'VWAP' && vwap != null && Math.abs(vwap - triggerPrice) <= CONFLUENCE_STACK_RADIUS) {
    score += 1
  }

  // Regime strength bonus: 1H AND 15M both align
  if (regimeRequired === 'ranging') {
    if (alignment['1h'] === 'ranging' && alignment['15m'] === 'ranging') score += 1
  } else if (regimeRequired === 'trending_up') {
    if (alignment['1h'] === 'trending_up' && alignment['15m'] === 'trending_up') score += 1
  } else if (regimeRequired === 'trending_down') {
    if (alignment['1h'] === 'trending_down' && alignment['15m'] === 'trending_down') score += 1
  }

  // RVOL bonus
  if (rvol != null && rvol >= RVOL_BONUS_THRESHOLD) score += 1

  // Proven level bonus: a setup at this same level already closed as a win today
  if (prevSignals?.some(s => s.levelName === triggerLevelName && s.outcome === 'win')) {
    score += 1
  }

  return Math.max(1, Math.min(10, score))
}

// ── Regime matcher ──────────────────────────────────────────────────────────

function regimeMatches(required, alignment) {
  if (required === 'any') return true
  if (!alignment) return false
  // Use 5M as the primary regime read; 15M and 1H feed the confluence bonus.
  const m5 = alignment['5m']
  if (required === 'ranging') return m5 === 'ranging' || m5 === 'transition' || alignment['15m'] === 'ranging'
  if (required === 'trending_up') return m5 === 'trending_up' || alignment['15m'] === 'trending_up'
  if (required === 'trending_down') return m5 === 'trending_down' || alignment['15m'] === 'trending_down'
  if (required === 'mixed') {
    return m5 === 'transition' || alignment['15m'] === 'transition' || alignment['1m'] === 'transition'
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUPS
// ─────────────────────────────────────────────────────────────────────────────

const pdl_bounce = {
  id: 'pdl_bounce',
  name: 'PDL bounce',
  direction: 'long',
  description: 'Price wicked to prior-day low and closed back above. Long bounce toward S1.',
  regime_required: 'ranging',
  time_of_day_allowed: TIME_RANGE_SETUPS,
  option_direction: 'call',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    const pdl = ctx.levels.PDL
    if (pdl == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'PDL', ctx.etMinutes)) return null
    const last = recent(ctx.bars5m, 1)[0]
    const rev = reversalCandle(last, pdl, 'long')
    if (!rev) return null
    const target = ctx.levels.S1 ?? ctx.levels.P ?? (pdl + 1.5)
    const stop = pdl - STOP_OFFSET_LEVEL
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: pdl, triggerLevelName: 'PDL',
        vwap: ctx.levels.VWAP, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: pdl, stop, target,
      why: `5M reversal candle off PDL ($${pdl.toFixed(2)}), close $${rev.closed.toFixed(2)} above support. Range regime favors mean reversion to S1 or pivot.`,
      level: { name: 'PDL', price: pdl },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

const pdh_fade = {
  id: 'pdh_fade',
  name: 'PDH fade',
  direction: 'short',
  description: 'Price wicked to prior-day high and closed back below. Short fade toward pivot.',
  regime_required: 'ranging',
  time_of_day_allowed: TIME_RANGE_SETUPS,
  option_direction: 'put',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    const pdh = ctx.levels.PDH
    if (pdh == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'PDH', ctx.etMinutes)) return null
    const last = recent(ctx.bars5m, 1)[0]
    const rej = reversalCandle(last, pdh, 'short')
    if (!rej) return null
    const target = ctx.levels.P ?? ctx.levels.R1 ?? (pdh - 1.5)
    const stop = pdh + STOP_OFFSET_LEVEL
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: pdh, triggerLevelName: 'PDH',
        vwap: ctx.levels.VWAP, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: pdh, stop, target,
      why: `5M rejection candle at PDH ($${pdh.toFixed(2)}), close $${rej.closed.toFixed(2)} back below. Range regime favors fade to pivot.`,
      level: { name: 'PDH', price: pdh },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

const s1_bounce = {
  id: 's1_bounce',
  name: 'S1 bounce',
  direction: 'long',
  description: 'Price tested S1 support and reversed. Long toward pivot.',
  regime_required: 'ranging',
  time_of_day_allowed: TIME_RANGE_SETUPS,
  option_direction: 'call',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    const s1 = ctx.levels.S1
    if (s1 == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'S1', ctx.etMinutes)) return null
    const last = recent(ctx.bars5m, 1)[0]
    const rev = reversalCandle(last, s1, 'long')
    if (!rev) return null
    const target = ctx.levels.P ?? (s1 + 1.5)
    const stop = s1 - STOP_OFFSET_LEVEL
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: s1, triggerLevelName: 'S1',
        vwap: ctx.levels.VWAP, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: s1, stop, target,
      why: `5M reversal candle at S1 ($${s1.toFixed(2)}), close $${rev.closed.toFixed(2)}. Range regime, target pivot.`,
      level: { name: 'S1', price: s1 },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

const r1_fade = {
  id: 'r1_fade',
  name: 'R1 fade',
  direction: 'short',
  description: 'Price tested R1 resistance and rejected. Short toward pivot.',
  regime_required: 'ranging',
  time_of_day_allowed: TIME_RANGE_SETUPS,
  option_direction: 'put',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    const r1 = ctx.levels.R1
    if (r1 == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'R1', ctx.etMinutes)) return null
    const last = recent(ctx.bars5m, 1)[0]
    const rej = reversalCandle(last, r1, 'short')
    if (!rej) return null
    const target = ctx.levels.P ?? (r1 - 1.5)
    const stop = r1 + STOP_OFFSET_LEVEL
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: r1, triggerLevelName: 'R1',
        vwap: ctx.levels.VWAP, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: r1, stop, target,
      why: `5M rejection candle at R1 ($${r1.toFixed(2)}), close $${rej.closed.toFixed(2)}. Range regime, target pivot.`,
      level: { name: 'R1', price: r1 },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

const vwap_reclaim = {
  id: 'vwap_reclaim',
  name: 'VWAP reclaim',
  direction: 'long',
  description: 'Price closed back above VWAP from below with momentum. Long toward next level up.',
  regime_required: 'mixed',
  time_of_day_allowed: TIME_VWAP_SETUPS,
  option_direction: 'call',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    const vwap = ctx.levels.VWAP
    if (vwap == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'VWAP', ctx.etMinutes)) return null
    const cross = vwapCross(ctx.bars5m, vwap, 'long')
    if (!cross) return null
    const above = nextLevelAbove(ctx.levels, ctx.currentPrice, 'VWAP')
    const target = above?.price ?? (vwap + 1.5)
    const stop = vwap - STOP_OFFSET_VWAP
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: vwap, triggerLevelName: 'VWAP',
        vwap, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: vwap, stop, target,
      why: `5M close reclaimed VWAP from below ($${cross.from.toFixed(2)} to $${cross.to.toFixed(2)}). Target next level up, ${above ? above.name + ' $' + above.price.toFixed(2) : 'open'}.`,
      level: { name: 'VWAP', price: vwap },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

const vwap_lose = {
  id: 'vwap_lose',
  name: 'VWAP lose',
  direction: 'short',
  description: 'Price closed back below VWAP from above with momentum. Short toward next level down.',
  regime_required: 'mixed',
  time_of_day_allowed: TIME_VWAP_SETUPS,
  option_direction: 'put',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    const vwap = ctx.levels.VWAP
    if (vwap == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'VWAP', ctx.etMinutes)) return null
    const cross = vwapCross(ctx.bars5m, vwap, 'short')
    if (!cross) return null
    const below = nextLevelBelow(ctx.levels, ctx.currentPrice, 'VWAP')
    const target = below?.price ?? (vwap - 1.5)
    const stop = vwap + STOP_OFFSET_VWAP
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: vwap, triggerLevelName: 'VWAP',
        vwap, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: vwap, stop, target,
      why: `5M close lost VWAP from above ($${cross.from.toFixed(2)} to $${cross.to.toFixed(2)}). Target next level down, ${below ? below.name + ' $' + below.price.toFixed(2) : 'open'}.`,
      level: { name: 'VWAP', price: vwap },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

const orb_break_up = {
  id: 'orb_break_up',
  name: 'ORB break up',
  direction: 'long',
  description: 'Price broke above opening 15-minute range with volume. Long continuation.',
  regime_required: 'trending_up',
  time_of_day_allowed: TIME_ORB_SETUPS,
  option_direction: 'call',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    if (!ctx.orb || ctx.orb.high == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'ORB_HIGH', ctx.etMinutes)) return null
    const last = recent(ctx.bars5m, 1)[0]
    if (!last) return null
    // Trigger: bar closes above ORB high with body, and current price is still above.
    const breakOk = last.c > ctx.orb.high && (last.c - last.o) > 0
    const stillBreak = ctx.currentPrice > ctx.orb.high
    if (!breakOk || !stillBreak) return null
    // Require volume confirmation: RVOL above 1.0 minimum on a breakout.
    if (ctx.rvol != null && ctx.rvol < 1.0) return null
    const range = ctx.orb.high - ctx.orb.low
    const target = ctx.orb.mid + range
    const stop = ctx.orb.mid
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: ctx.orb.high, triggerLevelName: 'ORB_HIGH',
        vwap: ctx.levels.VWAP, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: ctx.orb.high, stop, target,
      why: `5M close above ORB high ($${ctx.orb.high.toFixed(2)}) with volume. Range size ${range.toFixed(2)}, target ${target.toFixed(2)}.`,
      level: { name: 'ORB_HIGH', price: ctx.orb.high },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

const orb_break_down = {
  id: 'orb_break_down',
  name: 'ORB break down',
  direction: 'short',
  description: 'Price broke below opening 15-minute range with volume. Short continuation.',
  regime_required: 'trending_down',
  time_of_day_allowed: TIME_ORB_SETUPS,
  option_direction: 'put',
  option_strike_rule: 'atm',
  detect(ctx) {
    if (!timeAllowed(ctx.etMinutes, this.time_of_day_allowed)) return null
    if (!regimeMatches(this.regime_required, ctx.alignment)) return null
    if (!ctx.orb || ctx.orb.low == null) return null
    if (recentlySignaled(ctx.prevSignals, this.id, 'ORB_LOW', ctx.etMinutes)) return null
    const last = recent(ctx.bars5m, 1)[0]
    if (!last) return null
    const breakOk = last.c < ctx.orb.low && (last.o - last.c) > 0
    const stillBreak = ctx.currentPrice < ctx.orb.low
    if (!breakOk || !stillBreak) return null
    if (ctx.rvol != null && ctx.rvol < 1.0) return null
    const range = ctx.orb.high - ctx.orb.low
    const target = ctx.orb.mid - range
    const stop = ctx.orb.mid
    return {
      setupId: this.id, setupName: this.name, direction: this.direction,
      confidence: scoreConfluence({
        levels: ctx.levels, triggerPrice: ctx.orb.low, triggerLevelName: 'ORB_LOW',
        vwap: ctx.levels.VWAP, alignment: ctx.alignment, regimeRequired: this.regime_required,
        rvol: ctx.rvol, prevSignals: ctx.prevSignals,
      }),
      entry: ctx.orb.low, stop, target,
      why: `5M close below ORB low ($${ctx.orb.low.toFixed(2)}) with volume. Range size ${range.toFixed(2)}, target ${target.toFixed(2)}.`,
      level: { name: 'ORB_LOW', price: ctx.orb.low },
      optionDirection: this.option_direction,
      optionStrikeRule: this.option_strike_rule,
    }
  },
}

// ── Playbook export ─────────────────────────────────────────────────────────

export const PLAYBOOK = [
  pdl_bounce,
  pdh_fade,
  s1_bounce,
  r1_fade,
  vwap_reclaim,
  vwap_lose,
  orb_break_up,
  orb_break_down,
]

export const PLAYBOOK_BY_ID = Object.fromEntries(PLAYBOOK.map(s => [s.id, s]))

// ── Evaluate the whole playbook against a context ───────────────────────────
// Returns all signals (could be empty), sorted highest confidence first.
// The bot engine picks the top one if it clears the confluence threshold.

export function evaluatePlaybook(ctx, threshold = CONFLUENCE_DEFAULT_THRESHOLD) {
  const signals = []
  for (const setup of PLAYBOOK) {
    try {
      const sig = setup.detect(ctx)
      if (sig && sig.confidence >= threshold) signals.push(sig)
    } catch (e) {
      // Setup eval should never throw, but if it does, log and skip.
      // eslint-disable-next-line no-console
      console.warn(`Setup ${setup.id} detect() threw:`, e)
    }
  }
  signals.sort((a, b) => b.confidence - a.confidence)
  return signals
}
