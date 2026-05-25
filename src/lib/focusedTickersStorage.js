// ─────────────────────────────────────────────────────────────────────────────
// focusedTickersStorage.js — load / save / seed for the Focus tab.
//
// A "focused ticker" is a per-ticker dashboard: a directional thesis (long /
// short / neutral), entry zones, targets, an invalidation level, a time
// horizon, freeform notes, and the list of Setup ids that watch this
// ticker.
//
// Storage:
//   th-focused-tickers-v1            array of FocusedTicker records
//   th-focused-tickers-seeded-v1     flag, set after first-run seeding
// ─────────────────────────────────────────────────────────────────────────────

export const FOCUSED_TICKERS_KEY = 'th-focused-tickers-v1'
export const FT_SEEDED_FLAG = 'th-focused-tickers-seeded-v1'

function uid(prefix = 'ft') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

// Normalize a zone or target row to the shape the UI expects.
function normalizeZone(z) {
  if (!z) return null
  return {
    id: z.id || uid('zone'),
    price: z.price != null ? Number(z.price) : null,
    label: z.label || '',
    notes: z.notes || '',
  }
}
function normalizeTarget(t) {
  if (!t) return null
  return {
    id: t.id || uid('tgt'),
    price: t.price != null ? Number(t.price) : null,
    type: t.type || '',
    notes: t.notes || '',
  }
}
function normalizeInvalidation(v) {
  if (!v) return null
  return { price: v.price != null ? Number(v.price) : null, notes: v.notes || '' }
}

// Build a fresh record with sensible defaults; merges partial in.
export function createFocusedTicker(partial = {}) {
  const now = new Date().toISOString()
  return {
    ticker: String(partial.ticker || '').toUpperCase(),
    thesisDirection: partial.thesisDirection || 'long',
    thesisDescription: partial.thesisDescription || '',
    entryZones: (partial.entryZones || []).map(normalizeZone).filter(Boolean),
    targets: (partial.targets || []).map(normalizeTarget).filter(Boolean),
    invalidationLevel: normalizeInvalidation(partial.invalidationLevel),
    timeHorizon: partial.timeHorizon || '',
    notes: partial.notes || '',
    attachedSetupIds: Array.isArray(partial.attachedSetupIds) ? [...partial.attachedSetupIds] : [],
    createdAt: partial.createdAt || now,
    updatedAt: now,
  }
}

export function loadFocusedTickers() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(FOCUSED_TICKERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(f => createFocusedTicker(f))
  } catch {
    return []
  }
}

export function saveFocusedTickers(list) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(FOCUSED_TICKERS_KEY, JSON.stringify(list || [])) } catch {}
}

// ── Seeds ───────────────────────────────────────────────────────────────────
//
// Returned by SEED_RECORDS so callers (bootstrap in App.jsx) can wire them
// into the setups storage via auto-attach.

export const SEED_RECORDS = [
  createFocusedTicker({
    ticker: 'CRWD',
    thesisDirection: 'short',
    thesisDescription: 'Post-parabolic exhaustion mean reversion. Stock ran from $400 to $663 in 6 weeks (65% gain), which is statistically extreme. Looking for systematic short entries on confirmed breakdown signals across 4-8 week horizon. Patient short on confirmation, not pre-emptive.',
    entryZones: [
      { price: 640, label: 'First support break', notes: 'Loss of recent consolidation low, first confirmation' },
      { price: 620, label: '50 EMA approach', notes: 'Major moving average test, often bounces here once before breaking' },
      { price: 580, label: 'Trend break', notes: 'Break of the rally trendline, structural shift confirmed' },
    ],
    targets: [
      { price: 540, type: 'target_1', notes: '200 EMA, first major target' },
      { price: 480, type: 'target_2', notes: 'Gap fill from April rally, secondary target' },
      { price: 420, type: 'target_3', notes: 'Pre-rally consolidation zone, extended target' },
    ],
    invalidationLevel: { price: 700, notes: 'Daily close above $700 = new ATH = thesis broken, exit any short positions' },
    timeHorizon: '4-8 weeks for primary move',
    notes: 'Parabolic exhaustion plays out 50-70% of the time on this magnitude of move (60%+ rally in under 8 weeks). Wait for the system to confirm via Parabolic Exhaustion Short setup or other short triggers. Do not pre-empt.',
  }),
  createFocusedTicker({
    ticker: 'ELF',
    thesisDirection: 'long',
    thesisDescription: 'Recovery play after fiscal 2027 guidance miss in late May 2026. Stock got crushed from highs to ~$50 range, but business fundamentals remain strong (Q4 revenue +35% YoY, analyst consensus 12-month target $78). Buying calls on confirmed bounce structure, 3-9 month thesis.',
    entryZones: [
      { price: 48, label: 'Recent low test', notes: 'First retest of the post-miss low, watch for higher low formation' },
      { price: 45, label: 'Capitulation zone', notes: 'If sellers exhaust here with volume spike, strong long entry' },
      { price: 52, label: 'Breakout confirmation', notes: 'Above current consolidation, momentum confirmed' },
    ],
    targets: [
      { price: 65, type: 'target_1', notes: 'Recovery to pre-miss levels, primary target' },
      { price: 78, type: 'target_2', notes: 'Analyst consensus 12-month target, secondary' },
      { price: 90, type: 'target_3', notes: 'High analyst target, extended scenario' },
    ],
    invalidationLevel: { price: 42, notes: 'Daily close below $42 suggests deeper breakdown, thesis on hold' },
    timeHorizon: '3-9 months for primary recovery move',
    notes: 'Got crushed on fiscal 2027 guidance miss, but Q4 revenue +35% YoY and analyst targets still bullish overall. Buying calls (35-60 DTE) on confirmed bounce signals via RSI Pullback Long, 50 EMA Bounce, or Episodic Pivot setups. Patient entry.',
  }),
]

// Called by App.jsx after both setups and focused-tickers are loaded. Adds
// the seed records, auto-attaches each to compatible-direction active setups,
// and writes back to both stores. Idempotent: only fires when the seeded
// flag is unset AND the focused-tickers list is empty.
//
// Returns { focusedTickers, setupsPatch } where setupsPatch is a list of
// { setupId, universeAdditions } the caller applies.
export function bootstrapFocusedTickers(setups = []) {
  if (typeof window === 'undefined') return { focusedTickers: loadFocusedTickers(), setupsPatch: [] }
  if (localStorage.getItem(FT_SEEDED_FLAG)) return { focusedTickers: loadFocusedTickers(), setupsPatch: [] }
  const existing = loadFocusedTickers()
  if (existing.length > 0) {
    localStorage.setItem(FT_SEEDED_FLAG, '1')
    return { focusedTickers: existing, setupsPatch: [] }
  }
  const setupsPatch = []
  const seeded = SEED_RECORDS.map(rec => {
    const dir = rec.thesisDirection
    // Match against active setups whose direction overlaps the thesis.
    const matching = (setups || []).filter(s => {
      if ((s.status || 'active') !== 'active') return false
      const sd = s.direction || 'either'
      if (dir === 'long') return sd === 'long' || sd === 'either'
      if (dir === 'short') return sd === 'short' || sd === 'either'
      return sd === 'either'
    })
    const attachedSetupIds = matching.map(s => s.id)
    for (const s of matching) {
      setupsPatch.push({ setupId: s.id, addTicker: rec.ticker })
    }
    return { ...rec, attachedSetupIds, updatedAt: new Date().toISOString() }
  })
  saveFocusedTickers(seeded)
  localStorage.setItem(FT_SEEDED_FLAG, '1')
  return { focusedTickers: seeded, setupsPatch }
}
