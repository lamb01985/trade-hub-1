// ─────────────────────────────────────────────────────────────────────────────
// UniverseBuilder.jsx — screen a base universe by multi-factor filters and
// optionally save the filter set + resulting ticker list as a named universe.
//
// Two uses:
//   1. Standalone Plan sub-tab (the user explores filters and saves results)
//   2. Modal opened from SetupBuilder (the user picks tickers for a setup)
//
// Data layer: a hardcoded liquid base universe (~30 tickers) is hydrated
// once per load via getHistoricalBars (252 daily bars per ticker) +
// getTickerDetails (market cap, sector). Hydration is cached in
// localStorage for 6 hours so reopening the tab is instant.
//
// Limits called out: fundamentals like P/S and P/E require getFinancials,
// which the user's Massive plan may not return for every ticker. Filters
// pass any row whose required data is missing (lenient mode) so the tool
// is still useful when fundamentals are sparse.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { useLocalStorage } from '../hooks/useStore.js'
import { getHistoricalBars, getTickerDetails } from '../lib/massive.js'
import { lastEMA, lastRSI } from '../lib/indicators.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const BASE_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'COST', 'JPM', 'V',
  'MA', 'TSLA', 'AMD', 'CRWD', 'NFLX', 'PLTR', 'SNOW', 'NET', 'DDOG', 'SHOP',
  'NOW', 'COIN', 'MSTR', 'SPY', 'QQQ', 'IWM', 'TQQQ', 'UBER', 'ABNB',
  'BABA', 'XOM', 'CVX', 'BAC', 'WFC', 'GS', 'JNJ', 'UNH', 'LLY',
  'HD', 'WMT', 'KO', 'PEP', 'DIS', 'F', 'GM',
]

const HYDRATION_CACHE_KEY = 'tradeHub.universeBuilder.cache.v1'
const HYDRATION_MAX_AGE_MS = 6 * 60 * 60 * 1000   // 6 hours

const DEFAULT_FILTERS = {
  marketCapMin: null,      // null = no floor
  marketCapMax: null,
  sector: '',              // empty = any
  psRatioMin: null,
  psRatioMax: null,
  peRatioMin: null,
  peRatioMax: null,
  includeNegativePE: true,
  rsiMin: null,
  rsiMax: null,
  rvolMin: null,
  dist50Min: null,         // -100..+100 (% from 50 EMA)
  dist50Max: null,
  fromHighMin: null,       // -100..0
  fromHighMax: null,
  aboveEma200: false,
}

function fmtBigCap(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${Math.round(n).toLocaleString()}`
}

async function hydrateOne(apiKey, ticker) {
  const out = { ticker, hydratedAt: Date.now() }
  try {
    const bars = await getHistoricalBars(apiKey, ticker, 252)
    if (bars?.length) {
      const closes = bars.map(b => b?.c).filter(v => v != null && v > 0)
      out.closes = closes.slice(-60)        // keep just enough for the sparkline + filters
      out.price = closes[closes.length - 1]
      out.ema50 = lastEMA(closes, 50)
      out.ema200 = lastEMA(closes, 200)
      out.rsi14 = lastRSI(closes, 14)
      const wk52High = Math.max(...closes.slice(-Math.min(252, closes.length)))
      const wk52Low = Math.min(...closes.slice(-Math.min(252, closes.length)))
      out.wk52High = wk52High
      out.wk52Low = wk52Low
      out.fromHighPct = wk52High ? ((out.price - wk52High) / wk52High) * 100 : null
      out.dist50 = out.price && out.ema50 ? ((out.price - out.ema50) / out.ema50) * 100 : null
      out.dist200 = out.price && out.ema200 ? ((out.price - out.ema200) / out.ema200) * 100 : null
      // Approximate RVOL = today's volume vs trailing-20-day average.
      if (bars.length >= 21 && bars[bars.length - 1]?.v != null) {
        const recent = bars.slice(-21, -1)
        const sum = recent.reduce((s, b) => s + (b?.v || 0), 0)
        const avg = sum / 20
        if (avg > 0) out.rvol = bars[bars.length - 1].v / avg
      }
    }
  } catch {}
  try {
    const d = await getTickerDetails(apiKey, ticker)
    if (d) {
      out.marketCap = d.market_cap ?? null
      out.sector = d.sic_description ? d.sic_description.split(/[ -]/).slice(0, 3).join(' ') : null
      out.name = d.name || null
    }
  } catch {}
  return out
}

function loadCache() {
  try {
    const raw = localStorage.getItem(HYDRATION_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}
function saveCache(map) {
  try { localStorage.setItem(HYDRATION_CACHE_KEY, JSON.stringify(map)) } catch {}
}

function passFilters(row, f) {
  if (!row) return false
  // Market cap (skip if missing)
  if (row.marketCap != null) {
    if (f.marketCapMin != null && row.marketCap < f.marketCapMin) return false
    if (f.marketCapMax != null && row.marketCap > f.marketCapMax) return false
  }
  if (f.sector?.trim()) {
    const want = f.sector.trim().toLowerCase()
    if (!row.sector || !row.sector.toLowerCase().includes(want)) return false
  }
  // P/S, P/E (currently can be null if fundamentals weren't fetched; row passes when null)
  if (row.psRatio != null) {
    if (f.psRatioMin != null && row.psRatio < f.psRatioMin) return false
    if (f.psRatioMax != null && row.psRatio > f.psRatioMax) return false
  }
  if (row.peRatio != null) {
    if (!f.includeNegativePE && row.peRatio < 0) return false
    if (f.peRatioMin != null && row.peRatio < f.peRatioMin) return false
    if (f.peRatioMax != null && row.peRatio > f.peRatioMax) return false
  } else if (!f.includeNegativePE) {
    // No P/E data — be lenient and let it through.
  }
  if (row.rsi14 != null) {
    if (f.rsiMin != null && row.rsi14 < f.rsiMin) return false
    if (f.rsiMax != null && row.rsi14 > f.rsiMax) return false
  }
  if (row.rvol != null && f.rvolMin != null && row.rvol < f.rvolMin) return false
  if (row.dist50 != null) {
    if (f.dist50Min != null && row.dist50 < f.dist50Min) return false
    if (f.dist50Max != null && row.dist50 > f.dist50Max) return false
  }
  if (row.fromHighPct != null) {
    if (f.fromHighMin != null && row.fromHighPct < f.fromHighMin) return false
    if (f.fromHighMax != null && row.fromHighPct > f.fromHighMax) return false
  }
  if (f.aboveEma200 && row.ema200 != null && row.price != null && row.price <= row.ema200) return false
  return true
}

function NumInput({ value, onChange, placeholder = '', width = 70 }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      style={{
        background: DARK, border: `1px solid ${BORDER}`, borderRadius: 3,
        color: FG, fontFamily: MONO, fontSize: 11, padding: '5px 7px',
        outline: 'none', width,
      }}
    />
  )
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

function RangeRow({ valueMin, valueMax, onMin, onMax, suffix = '' }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <NumInput value={valueMin} onChange={onMin} placeholder="min" />
      <span style={{ color: MUTED, fontSize: 10 }}>—</span>
      <NumInput value={valueMax} onChange={onMax} placeholder="max" />
      {suffix && <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>{suffix}</span>}
    </div>
  )
}

// ── Result row (compact) ──────────────────────────────────────────────────

function Row({ row, selected, onToggleSelect }) {
  return (
    <div onClick={onToggleSelect} style={{
      display: 'grid',
      gridTemplateColumns: '24px 70px 70px 65px 70px 70px 1fr',
      gap: 8, padding: '7px 10px', cursor: 'pointer',
      background: selected ? '#0c1408' : 'transparent',
      borderBottom: `1px solid ${BORDER}`,
      fontFamily: MONO, fontSize: 11, alignItems: 'center',
    }}>
      <input type="checkbox" checked={selected} readOnly style={{ accentColor: LIME, cursor: 'pointer' }} />
      <span style={{ color: FG, fontWeight: 800, letterSpacing: '0.04em' }}>{row.ticker}</span>
      <span style={{ color: FG }}>${f2(row.price)}</span>
      <span style={{ color: row.rsi14 == null ? MUTED : row.rsi14 >= 70 ? RED : row.rsi14 <= 30 ? LIME : '#aaa' }}>{row.rsi14 == null ? '—' : `RSI ${row.rsi14.toFixed(0)}`}</span>
      <span style={{ color: row.dist50 == null ? MUTED : '#aaa' }}>{row.dist50 == null ? '50 —' : `50 ${row.dist50 >= 0 ? '+' : ''}${row.dist50.toFixed(1)}%`}</span>
      <span style={{ color: row.dist200 == null ? MUTED : '#aaa' }}>{row.dist200 == null ? '200 —' : `200 ${row.dist200 >= 0 ? '+' : ''}${row.dist200.toFixed(1)}%`}</span>
      <span style={{ color: '#aaa', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{fmtBigCap(row.marketCap)}</span>
        {row.sector && <span style={{ fontSize: 10, color: MUTED }}>{row.sector}</span>}
      </span>
    </div>
  )
}

// ── Top-level component ──────────────────────────────────────────────────
// Two modes:
//   mode='standalone'  full page, includes Save controls
//   mode='picker'      compact, "Use these tickers →" handoff for SetupBuilder
//
// Props:
//   apiKey, savedUniverses, onSavedUniversesChange, onUseTickers? (picker)

export default function UniverseBuilder({
  apiKey,
  savedUniverses = {},
  onSavedUniversesChange,
  onUseTickers = null,
  mode = 'standalone',
  initialFilters = null,
}) {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, ...(initialFilters || {}) })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [saveName, setSaveName] = useState('')
  const cacheRef = useRef(loadCache())

  function patch(p) { setFilters(prev => ({ ...prev, ...p })) }

  async function loadOrHydrate() {
    if (!apiKey) { setError('Add a Massive API key in Command first.'); return }
    setLoading(true); setError(null); setProgress({ done: 0, total: BASE_UNIVERSE.length })
    const cache = cacheRef.current
    const out = []
    let done = 0
    // Run a bounded-concurrency pool (5 in flight) to avoid REST flooding.
    const queue = [...BASE_UNIVERSE]
    const inFlight = []
    async function next() {
      if (!queue.length) return
      const t = queue.shift()
      const cached = cache[t]
      const fresh = cached && (Date.now() - (cached.hydratedAt || 0)) < HYDRATION_MAX_AGE_MS
      const row = fresh ? cached : await hydrateOne(apiKey, t)
      cache[t] = row
      out.push(row)
      done += 1
      setProgress({ done, total: BASE_UNIVERSE.length })
      await next()
    }
    for (let i = 0; i < 5; i++) inFlight.push(next())
    await Promise.all(inFlight)
    saveCache(cache)
    setRows(out)
    setLoading(false)
  }

  const filtered = useMemo(() => rows.filter(r => passFilters(r, filters)), [rows, filters])

  function toggleSelect(ticker) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker)
      return next
    })
  }
  function selectAllFiltered() { setSelected(new Set(filtered.map(r => r.ticker))) }
  function clearSelection() { setSelected(new Set()) }

  function handleSaveUniverse() {
    if (!saveName.trim()) return
    if (!onSavedUniversesChange) return
    const tickers = selected.size > 0 ? [...selected] : filtered.map(r => r.ticker)
    const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const record = {
      id,
      name: saveName.trim(),
      filters: { ...filters },
      tickers,
      savedAt: Date.now(),
    }
    onSavedUniversesChange({ ...(savedUniverses || {}), [id]: record })
    setSaveName('')
  }

  function handleUsePicker() {
    if (!onUseTickers) return
    const tickers = selected.size > 0 ? [...selected] : filtered.map(r => r.ticker)
    onUseTickers(tickers)
  }

  function handleDeleteSaved(id) {
    if (!onSavedUniversesChange) return
    const next = { ...(savedUniverses || {}) }
    delete next[id]
    onSavedUniversesChange(next)
  }

  function handleLoadSaved(u) {
    setFilters({ ...DEFAULT_FILTERS, ...(u.filters || {}) })
    setSelected(new Set(u.tickers || []))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Screener</div>
          <div style={{ fontSize: 22, color: FG, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Universe<span style={{ color: LIME }}>.</span>
          </div>
        </div>
        <button onClick={loadOrHydrate} disabled={loading || !apiKey} title={!apiKey ? 'Add Massive API key' : ''} style={{
          background: loading || !apiKey ? '#1a1a1a' : LIME, color: loading || !apiKey ? '#666' : '#000',
          border: 'none', padding: '8px 14px', borderRadius: 3,
          fontFamily: MONO, fontSize: 11, fontWeight: 800,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          cursor: loading || !apiKey ? 'not-allowed' : 'pointer',
        }}>{loading ? `Hydrating ${progress.done}/${progress.total}` : rows.length ? 'Reload universe' : 'Load universe'}</button>
      </div>

      {error && <div style={{ background: '#150505', border: `1px solid ${RED}55`, color: RED, padding: '8px 12px', borderRadius: 4, fontSize: 11, fontFamily: MONO }}>{error}</div>}

      {mode === 'standalone' && Object.keys(savedUniverses || {}).length > 0 && (
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 10 }}>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Saved universes</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.values(savedUniverses).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3, padding: '4px 8px' }}>
                <button onClick={() => handleLoadSaved(u)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontFamily: MONO, fontSize: 10, cursor: 'pointer' }}>
                  <strong style={{ color: FG }}>{u.name}</strong> <span style={{ color: MUTED }}>{u.tickers?.length || 0}</span>
                </button>
                <button onClick={() => handleDeleteSaved(u.id)} style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 12 }}>
        {/* Filter sidebar */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FilterGroup label="Market cap range ($)">
            <RangeRow valueMin={filters.marketCapMin} valueMax={filters.marketCapMax}
              onMin={v => patch({ marketCapMin: v })} onMax={v => patch({ marketCapMax: v })} />
          </FilterGroup>
          <FilterGroup label="Sector contains">
            <input value={filters.sector} onChange={e => patch({ sector: e.target.value })}
              placeholder="e.g. technology" style={{
                background: DARK, border: `1px solid ${BORDER}`, borderRadius: 3,
                color: FG, fontFamily: MONO, fontSize: 11, padding: '5px 8px', outline: 'none',
              }} />
          </FilterGroup>
          <FilterGroup label="P/S ratio range">
            <RangeRow valueMin={filters.psRatioMin} valueMax={filters.psRatioMax}
              onMin={v => patch({ psRatioMin: v })} onMax={v => patch({ psRatioMax: v })} />
          </FilterGroup>
          <FilterGroup label="P/E ratio range">
            <RangeRow valueMin={filters.peRatioMin} valueMax={filters.peRatioMax}
              onMin={v => patch({ peRatioMin: v })} onMax={v => patch({ peRatioMax: v })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.includeNegativePE} onChange={e => patch({ includeNegativePE: e.target.checked })} />
              <span style={{ fontSize: 10, color: '#aaa', fontFamily: MONO }}>Include negative P/E</span>
            </label>
          </FilterGroup>
          <FilterGroup label="RSI range">
            <RangeRow valueMin={filters.rsiMin} valueMax={filters.rsiMax}
              onMin={v => patch({ rsiMin: v })} onMax={v => patch({ rsiMax: v })} />
          </FilterGroup>
          <FilterGroup label="RVOL minimum">
            <NumInput value={filters.rvolMin} onChange={v => patch({ rvolMin: v })} placeholder="1.5" />
          </FilterGroup>
          <FilterGroup label="Dist from 50 EMA (%)">
            <RangeRow valueMin={filters.dist50Min} valueMax={filters.dist50Max}
              onMin={v => patch({ dist50Min: v })} onMax={v => patch({ dist50Max: v })} />
          </FilterGroup>
          <FilterGroup label="From 52W high (%)">
            <RangeRow valueMin={filters.fromHighMin} valueMax={filters.fromHighMax}
              onMin={v => patch({ fromHighMin: v })} onMax={v => patch({ fromHighMax: v })} />
          </FilterGroup>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.aboveEma200} onChange={e => patch({ aboveEma200: e.target.checked })} />
            <span style={{ fontSize: 11, color: FG, fontFamily: MONO }}>Price above 200 EMA</span>
          </label>
          <button onClick={() => setFilters({ ...DEFAULT_FILTERS })} style={{
            background: 'transparent', border: `1px dashed ${BORDER}`, color: '#aaa',
            padding: '6px 10px', borderRadius: 3, cursor: 'pointer',
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Reset filters</button>
        </div>

        {/* Results */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: FG, fontFamily: MONO, fontWeight: 700 }}>{filtered.length}</span>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>matches</span>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>· {selected.size} selected</span>
            <div style={{ flex: 1 }} />
            <button onClick={selectAllFiltered} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa', padding: '4px 10px', borderRadius: 3, fontFamily: MONO, fontSize: 10, cursor: 'pointer', letterSpacing: '0.12em' }}>SELECT ALL</button>
            <button onClick={clearSelection} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa', padding: '4px 10px', borderRadius: 3, fontFamily: MONO, fontSize: 10, cursor: 'pointer', letterSpacing: '0.12em' }}>CLEAR</button>
          </div>

          {rows.length === 0 && !loading && (
            <div style={{ padding: 20, fontSize: 11, color: MUTED, fontFamily: MONO, textAlign: 'center' }}>
              Hit "Load universe" to hydrate the base list ({BASE_UNIVERSE.length} tickers) with technicals + fundamentals. Cached locally for 6 hours.
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '24px 70px 70px 65px 70px 70px 1fr',
                gap: 8, padding: '6px 10px',
                background: '#0a0606', borderBottom: `1px solid ${BORDER}`,
                fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                <span></span><span>Ticker</span><span>Price</span><span>RSI</span><span>Dist 50</span><span>Dist 200</span><span>Cap · Sector</span>
              </div>
              {filtered.map(row => (
                <Row key={row.ticker} row={row} selected={selected.has(row.ticker)} onToggleSelect={() => toggleSelect(row.ticker)} />
              ))}
            </div>
          )}

          {/* Save / Use bar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6 }}>
            {mode === 'standalone' && onSavedUniversesChange && (
              <>
                <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Name this universe" style={{
                  flex: 1, minWidth: 180, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 3,
                  color: FG, fontFamily: MONO, fontSize: 11, padding: '7px 10px', outline: 'none',
                }} />
                <button onClick={handleSaveUniverse} disabled={!saveName.trim() || filtered.length === 0} style={{
                  background: saveName.trim() && filtered.length ? LIME : '#1a1a1a',
                  color: saveName.trim() && filtered.length ? '#000' : '#666',
                  border: 'none', padding: '7px 14px', borderRadius: 3,
                  fontFamily: MONO, fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: saveName.trim() && filtered.length ? 'pointer' : 'not-allowed',
                }}>Save universe</button>
              </>
            )}
            {mode === 'picker' && onUseTickers && (
              <>
                <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>{selected.size > 0 ? `${selected.size} selected tickers` : `Use all ${filtered.length} matching tickers`}</div>
                <div style={{ flex: 1 }} />
                <button onClick={handleUsePicker} disabled={filtered.length === 0} style={{
                  background: filtered.length ? LIME : '#1a1a1a',
                  color: filtered.length ? '#000' : '#666',
                  border: 'none', padding: '7px 14px', borderRadius: 3,
                  fontFamily: MONO, fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: filtered.length ? 'pointer' : 'not-allowed',
                }}>Use these tickers →</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
