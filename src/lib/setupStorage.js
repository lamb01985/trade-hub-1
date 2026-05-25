// ─────────────────────────────────────────────────────────────────────────────
// setupStorage.js — load + save + legacy-migration helpers for Setups.
//
// Storage:
//   tradeHub.setups.v1                  array of Setup records
//   tradeHub.setups.migrated.v1         flag, set after legacy migration runs
//   tradeHub.setups.seeded.v1           flag, set after example seeds are added
//   tradeHub.setups.alerts.v1           triggered-event log (dedupe + audit)
//
// Legacy source:
//   th-short-theses                     old putTheses object, keyed by ticker
//
// Migration is one-way and idempotent: legacy records become short setups
// with a single price_below condition (or whatever the old `trigger` was).
// Original putTheses data is NOT deleted, so the Chart / Levels / Calendar
// integrations that still read it keep working until they are updated.
// ─────────────────────────────────────────────────────────────────────────────

export const SETUPS_KEY = 'tradeHub.setups.v1'
export const MIGRATED_FLAG = 'tradeHub.setups.migrated.v1'
export const SEEDED_FLAG = 'tradeHub.setups.seeded.v1'
export const ALERT_LOG_KEY = 'tradeHub.setups.alerts.v1'
export const LEGACY_KEY = 'th-short-theses'

// Normalize a universe value into the discriminated { type: 'list', tickers }
// or { type: 'saved', universeId } form. Legacy flat arrays become 'list'.
function normalizeUniverseValue(u) {
  if (!u) return { type: 'list', tickers: [] }
  if (Array.isArray(u)) return { type: 'list', tickers: u.map(t => String(t || '').toUpperCase()).filter(Boolean) }
  if (typeof u === 'object' && u.type === 'list') return { type: 'list', tickers: (u.tickers || []).map(t => String(t || '').toUpperCase()).filter(Boolean) }
  if (typeof u === 'object' && u.type === 'saved') return { type: 'saved', universeId: String(u.universeId || '') }
  return { type: 'list', tickers: [] }
}

function uid() {
  return `setup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// Sane defaults for the trade plan when none is provided.
function defaultTradePlanForDirection(direction) {
  const isShort = direction === 'short'
  return {
    instrumentType: 'option',
    optionType: isShort ? 'put' : 'call',
    strikeOffset: isShort ? -0.07 : 0.05,
    dte: 35,
    sizingValue: 0.015,        // 1.5% of account
    targetExitPct: 100,
    stopExitPct: 50,
    stopExitPrice: null,
    timeExitDte: 14,
  }
}

// Build a fresh Setup record with sensible defaults. Callers override fields.
export function createSetup(partial = {}) {
  const now = new Date().toISOString()
  const direction = partial.direction || 'short'
  return {
    id: partial.id || uid(),
    name: partial.name || 'Untitled setup',
    description: partial.description || '',
    direction,
    status: partial.status || 'active',
    createdAt: partial.createdAt || now,
    updatedAt: now,
    universe: normalizeUniverseValue(partial.universe),
    conditions: partial.conditions || [],
    operator: partial.operator || 'all',
    tradePlan: { ...defaultTradePlanForDirection(direction), ...(partial.tradePlan || {}) },
    alerts: {
      enabled: partial.alerts?.enabled ?? true,
      cooldownMinutes: partial.alerts?.cooldownMinutes ?? 60,
      lastTriggeredAt: partial.alerts?.lastTriggeredAt || {},
      channels: {
        inApp: partial.alerts?.channels?.inApp ?? true,
        telegram: partial.alerts?.channels?.telegram ?? false,
        email: partial.alerts?.channels?.email ?? false,
      },
      priority: partial.alerts?.priority || 'normal',
    },
    triggeredEvents: partial.triggeredEvents || [],
    backtest: partial.backtest || null,
  }
}

// ── Load / Save ────────────────────────────────────────────────────────────

export function loadSetups() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SETUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Normalize universe shape across existing records (legacy array -> list form).
    return parsed.map(s => ({ ...s, universe: normalizeUniverseValue(s.universe) }))
  } catch {
    return []
  }
}

export function saveSetups(setups) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETUPS_KEY, JSON.stringify(setups || []))
  } catch {}
}

export function loadAlertLog() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ALERT_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAlertLog(log) {
  if (typeof window === 'undefined') return
  try {
    // Cap to most recent 500 events.
    const trimmed = (log || []).slice(0, 500)
    localStorage.setItem(ALERT_LOG_KEY, JSON.stringify(trimmed))
  } catch {}
}

// ── Migration: legacy putTheses -> Setups ──────────────────────────────────

// Convert one legacy thesis entry into a Setup record.
// Legacy shape: { trigger, text, stop, createdAt, score, price }, plus the
// ticker key from the parent map.
function migrateOne(ticker, legacy) {
  const T = String(ticker || '').toUpperCase()
  if (!T) return null
  const trigger = legacy?.trigger != null && !isNaN(legacy.trigger) ? Number(legacy.trigger) : null
  const conditions = []
  if (trigger != null) {
    conditions.push({ id: uid(), type: 'price_below', params: { value: trigger } })
  }
  // No conditions = nothing to evaluate. Skip these.
  if (conditions.length === 0) return null
  return createSetup({
    id: `migrated_${T.toLowerCase()}_${Date.now().toString(36)}`,
    name: `${T} put thesis (migrated)`,
    description: legacy?.text ? String(legacy.text).slice(0, 280) : `Migrated from the legacy Short Thesis tracker.`,
    direction: 'short',
    status: 'active',
    createdAt: legacy?.createdAt || new Date().toISOString(),
    universe: [T],
    conditions,
    operator: 'all',
    tradePlan: { ...defaultTradePlanForDirection('short'), stopExitPrice: legacy?.stop ?? null },
  })
}

// Runs at most once (idempotent via MIGRATED_FLAG). Reads th-short-theses,
// produces Setups, merges with whatever already exists in SETUPS_KEY.
// Returns the combined array of setups.
export function migrateLegacyIfNeeded() {
  if (typeof window === 'undefined') return loadSetups()
  if (localStorage.getItem(MIGRATED_FLAG)) return loadSetups()
  const current = loadSetups()
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) {
      localStorage.setItem(MIGRATED_FLAG, '1')
      return current
    }
    const legacyMap = JSON.parse(raw)
    if (!legacyMap || typeof legacyMap !== 'object') {
      localStorage.setItem(MIGRATED_FLAG, '1')
      return current
    }
    const migrated = []
    for (const [ticker, legacy] of Object.entries(legacyMap)) {
      const s = migrateOne(ticker, legacy)
      if (s) migrated.push(s)
    }
    const combined = [...migrated, ...current]
    saveSetups(combined)
    localStorage.setItem(MIGRATED_FLAG, '1')
    return combined
  } catch {
    localStorage.setItem(MIGRATED_FLAG, '1')
    return current
  }
}

// ── Seeds ───────────────────────────────────────────────────────────────────

// Four example setups added the first time storage is empty (after migration).
// Idempotent: only runs if SETUPS_KEY has zero records AND SEEDED_FLAG unset.
export function seedExamplesIfEmpty() {
  if (typeof window === 'undefined') return loadSetups()
  if (localStorage.getItem(SEEDED_FLAG)) return loadSetups()
  const current = loadSetups()
  if (current.length > 0) {
    // Already have setups (likely from migration). Don't pile on seeds.
    localStorage.setItem(SEEDED_FLAG, '1')
    return current
  }
  // All seeds ship with status='paused' so the user reviews and activates them
  // intentionally. The activation gate in SetupBuilder requires a passing
  // backtest before promotion (or an explicit override).
  const seeds = [
    createSetup({
      name: 'Multiple compression short',
      description: 'High P/S growth name already 15% off the highs, with the breakdown line broken on elevated volume. Edit the price_close_below value to set your breakdown trigger price. ps_ratio_above will report "not ready" until fundamentals are wired into the snapshot.',
      direction: 'short',
      status: 'paused',
      universe: ['NET', 'CRWD', 'DDOG', 'NOW'],
      conditions: [
        { id: uid(), type: 'ps_ratio_above', params: { value: 20 } },
        { id: uid(), type: 'down_from_high_pct', params: { pct: 15 } },
        { id: uid(), type: 'price_close_below', params: { value: 0 } },   // user edits to set the breakdown line
        { id: uid(), type: 'volume_above_avg', params: { multiple: 1.5 } },
      ],
      operator: 'all',
      tradePlan: { instrumentType: 'option', optionType: 'put', strikeOffset: -0.07, dte: 35, sizingValue: 0.015, targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 14 },
    }),
    createSetup({
      name: 'EMAs stacked + RSI pullback long',
      description: 'Trend-following long on quality names: established uptrend (9>21>50>200) with a short-term RSI dip below 35.',
      direction: 'long',
      status: 'paused',
      universe: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL'],
      conditions: [
        { id: uid(), type: 'emas_stacked_bullish', params: {} },
        { id: uid(), type: 'rsi_below', params: { period: 14, value: 35 } },
        { id: uid(), type: 'price_above_ema', params: { period: 200 } },
      ],
      operator: 'all',
      tradePlan: { instrumentType: 'option', optionType: 'call', strikeOffset: 0.02, dte: 35, sizingValue: 0.015, targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 14 },
    }),
    createSetup({
      name: 'Failed breakout fade short',
      description: 'Recent breakout failed and price has lost VWAP on heavier volume. Fade the trapped buyers.',
      direction: 'short',
      status: 'paused',
      universe: ['SPY', 'QQQ', 'IWM'],
      conditions: [
        { id: uid(), type: 'failed_breakout', params: { days: 5 } },
        { id: uid(), type: 'price_below_vwap', params: {} },
        { id: uid(), type: 'volume_above_avg', params: { multiple: 1.5 } },
      ],
      operator: 'all',
      tradePlan: { instrumentType: 'option', optionType: 'put', strikeOffset: -0.05, dte: 21, sizingValue: 0.01, targetExitPct: 75, stopExitPct: 60, stopExitPrice: null, timeExitDte: 7 },
    }),
    createSetup({
      name: 'Oversold bounce at S1',
      description: 'Mean-reversion long: price tagged the S1 pivot while RSI is oversold and volume is elevated.',
      direction: 'long',
      status: 'paused',
      universe: ['QQQ', 'SPY', 'TQQQ'],
      conditions: [
        { id: uid(), type: 'price_at_pivot', params: { pivot: 's1', pct: 0.5 } },
        { id: uid(), type: 'rsi_below', params: { period: 14, value: 35 } },
        { id: uid(), type: 'volume_above_avg', params: { multiple: 1.2 } },
      ],
      operator: 'all',
      tradePlan: { instrumentType: 'option', optionType: 'call', strikeOffset: 0.02, dte: 14, sizingValue: 0.01, targetExitPct: 50, stopExitPct: 50, stopExitPrice: null, timeExitDte: 5 },
    }),
  ]
  saveSetups(seeds)
  localStorage.setItem(SEEDED_FLAG, '1')
  return seeds
}

// Convenience: ensure both migration + seeds are applied, return current.
export function bootstrapSetups() {
  migrateLegacyIfNeeded()
  return seedExamplesIfEmpty()
}
