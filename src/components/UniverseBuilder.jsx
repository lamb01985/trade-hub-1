// ─────────────────────────────────────────────────────────────────────────────
// UniverseBuilder.jsx — screen a base universe and act on the result.
//
// Three header actions complete the research workflow:
//   - SAVE UNIVERSE: name the selection and persist filterDefinition +
//     tickers to 'th-universes-v1' (array shape).
//   - CREATE SETUP: hand the selected tickers to App.jsx, which seeds the
//     SetupBuilder and navigates to Plan / Setups.
//   - SUGGEST TEMPLATES: score the selection against the template library
//     (templateSuggestions.js), open a side panel with the top matches and
//     one-click "Clone with this universe" buttons.
//
// Above the screener, a chip row lists saved universes; click a chip to
// load both the filterDefinition and the saved ticker selection.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { useLocalStorage } from '../hooks/useStore.js'
import { getHistoricalBars, getTickerDetails } from '../lib/massive.js'
import { lastEMA, lastRSI } from '../lib/indicators.js'
import { notify } from '../lib/notify.js'
import { suggestTemplates } from '../lib/templateSuggestions.js'
import { CONDITIONS_BY_ID } from '../lib/conditionLibrary.js'

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
const HYDRATION_MAX_AGE_MS = 6 * 60 * 60 * 1000

const DEFAULT_FILTERS = {
  marketCapMin: null,
  marketCapMax: null,
  sector: '',
  psRatioMin: null,
  psRatioMax: null,
  peRatioMin: null,
  peRatioMax: null,
  includeNegativePE: true,
  rsiMin: null,
  rsiMax: null,
  rvolMin: null,
  dist50Min: null,
  dist50Max: null,
  fromHighMin: null,
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

function uid() {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

async function hydrateOne(apiKey, ticker) {
  const out = { ticker, hydratedAt: Date.now() }
  try {
    const bars = await getHistoricalBars(apiKey, ticker, 252)
    if (bars?.length) {
      const closes = bars.map(b => b?.c).filter(v => v != null && v > 0)
      out.closes = closes.slice(-60)
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
  if (row.marketCap != null) {
    if (f.marketCapMin != null && row.marketCap < f.marketCapMin) return false
    if (f.marketCapMax != null && row.marketCap > f.marketCapMax) return false
  }
  if (f.sector?.trim()) {
    const want = f.sector.trim().toLowerCase()
    if (!row.sector || !row.sector.toLowerCase().includes(want)) return false
  }
  if (row.psRatio != null) {
    if (f.psRatioMin != null && row.psRatio < f.psRatioMin) return false
    if (f.psRatioMax != null && row.psRatio > f.psRatioMax) return false
  }
  if (row.peRatio != null) {
    if (!f.includeNegativePE && row.peRatio < 0) return false
    if (f.peRatioMin != null && row.peRatio < f.peRatioMin) return false
    if (f.peRatioMax != null && row.peRatio > f.peRatioMax) return false
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

function suggestNameFromFilters(f) {
  const parts = []
  if (f.sector?.trim()) parts.push(f.sector.trim())
  if (f.marketCapMin != null && f.marketCapMin >= 200e9) parts.push('mega-cap')
  else if (f.marketCapMin != null && f.marketCapMin >= 10e9) parts.push('large-cap')
  else if (f.marketCapMin != null && f.marketCapMin >= 2e9) parts.push('mid-cap')
  if (f.rsiMin != null || f.rsiMax != null) {
    parts.push(`RSI ${f.rsiMin ?? '?'}-${f.rsiMax ?? '?'}`)
  }
  if (f.aboveEma200) parts.push('above 200 EMA')
  if (f.psRatioMin != null) parts.push(`P/S>${f.psRatioMin}`)
  if (parts.length === 0) parts.push('Custom universe')
  return parts.join(' ')
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

// ── Suggestion side panel ─────────────────────────────────────────────────

function SuggestionPanel({ rows, onClone, onClose }) {
  const suggestions = useMemo(() => suggestTemplates(rows), [rows])
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      padding: 0, zIndex: 240,
    }}>
      <div style={{
        background: '#0a0a0a', border: `1px solid ${BORDER}`,
        width: '100%', maxWidth: 520, height: '100%', overflowY: 'auto',
        padding: 18, fontFamily: MONO, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Template suggestions</div>
            <div style={{ fontSize: 16, color: FG, fontWeight: 800 }}>Best fits for your selection</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {suggestions.length === 0 && (
          <div style={{ background: PANEL, border: `1px dashed ${BORDER}`, borderRadius: 5, padding: 18, fontSize: 11, color: MUTED, fontFamily: MONO, lineHeight: 1.6 }}>
            No templates score above the match threshold for this selection. Try a different filter or add more tickers; the scorer needs at least RSI / EMA-distance / 52W data per row.
          </div>
        )}

        {suggestions.map(s => {
          const dir = s.template.direction
          const dirColor = dir === 'short' ? RED : dir === 'either' ? YELLOW : LIME
          return (
            <div key={s.template.id} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${dirColor}`, borderRadius: 5, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: FG, fontWeight: 800 }}>{s.template.name}</span>
                <span style={{ fontSize: 9, color: dirColor, fontFamily: MONO, fontWeight: 700, border: `1px solid ${dirColor}55`, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{dir}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.matchScore}%`, background: LIME }} />
                </div>
                <span style={{ fontSize: 10, color: LIME, fontFamily: MONO, fontWeight: 700, minWidth: 60, textAlign: 'right' }}>{s.matchScore}% match</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.06em' }}>{s.template.source}</div>
              <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.5 }}>{s.reasoning}</div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>
                Conditions:{' '}
                {(s.template.defaultConditions || []).map(c => CONDITIONS_BY_ID[c.type]?.label || c.type).join(' · ')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button onClick={() => onClone(s.template)} style={{
                  background: LIME, color: '#000', border: 'none', padding: '7px 14px', borderRadius: 3,
                  fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}>Clone with this universe →</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Save modal ───────────────────────────────────────────────────────────

function SaveModal({ initialName, count, onSave, onCancel }) {
  const [name, setName] = useState(initialName || '')
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250,
    }}>
      <div style={{
        background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 6,
        width: '100%', maxWidth: 440, padding: 18, fontFamily: MONO,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Save universe</div>
          <div style={{ fontSize: 14, color: FG, fontWeight: 800 }}>{count} ticker{count === 1 ? '' : 's'}</div>
        </div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()) }}
          placeholder="Universe name"
          style={{
            background: DARK, border: `1px solid ${BORDER}`, borderRadius: 3,
            color: FG, fontFamily: MONO, fontSize: 12, padding: '8px 10px', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
            padding: '7px 14px', borderRadius: 3, cursor: 'pointer',
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Cancel</button>
          <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()} style={{
            background: name.trim() ? LIME : '#1a1a1a', color: name.trim() ? '#000' : '#666',
            border: 'none', padding: '7px 14px', borderRadius: 3,
            fontFamily: MONO, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: name.trim() ? 'pointer' : 'not-allowed',
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Saved-universes chip row ─────────────────────────────────────────────

function SavedUniversesChips({ list, onLoad, onRename, onDelete }) {
  if (!list?.length) {
    return (
      <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, padding: '6px 0' }}>
        No saved universes yet. Use SAVE UNIVERSE after filtering to save your first.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {list.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3, padding: '4px 8px', fontFamily: MONO, fontSize: 10 }}>
          <button onClick={() => onLoad(u)} title={`Load ${u.name}`} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>
            <strong style={{ color: FG }}>{u.name}</strong> <span style={{ color: MUTED }}>{u.tickers?.length || 0}</span>
          </button>
          <button onClick={() => onRename(u)} title="Rename" style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 0, fontSize: 11 }}>✎</button>
          <button onClick={() => onDelete(u)} title="Delete" style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 0 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ── Top-level ─────────────────────────────────────────────────────────────

export default function UniverseBuilder({
  apiKey,
  savedUniverses = [],
  onSavedUniversesChange,
  onCreateSetupFromTickers = null,
  onCloneTemplateWithTickers = null,
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [saveOpen, setSaveOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const cacheRef = useRef(loadCache())

  function patch(p) { setFilters(prev => ({ ...prev, ...p })) }

  async function loadOrHydrate() {
    if (!apiKey) { setError('Add a Massive API key in Command first.'); return }
    setLoading(true); setError(null); setProgress({ done: 0, total: BASE_UNIVERSE.length })
    const cache = cacheRef.current
    const out = []
    let done = 0
    const queue = [...BASE_UNIVERSE]
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
    const inFlight = []
    for (let i = 0; i < 5; i++) inFlight.push(next())
    await Promise.all(inFlight)
    saveCache(cache)
    setRows(out)
    setLoading(false)
  }

  const filtered = useMemo(() => rows.filter(r => passFilters(r, filters)), [rows, filters])
  const selectedRows = useMemo(() => filtered.filter(r => selected.has(r.ticker)), [filtered, selected])

  function toggleSelect(ticker) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker)
      return next
    })
  }
  function selectAllFiltered() { setSelected(new Set(filtered.map(r => r.ticker))) }
  function clearSelection() { setSelected(new Set()) }

  // Effective tickers used for actions: explicit selection if any, else all filtered.
  const effectiveTickers = useMemo(() => (
    selected.size > 0 ? [...selected] : filtered.map(r => r.ticker)
  ), [selected, filtered])

  const effectiveRows = useMemo(() => (
    selected.size > 0 ? filtered.filter(r => selected.has(r.ticker)) : filtered
  ), [selected, filtered])

  function handleSaveCommit(name) {
    if (!onSavedUniversesChange) return
    const record = {
      id: uid(),
      name,
      tickers: effectiveTickers,
      filterDefinition: { ...filters },
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    onSavedUniversesChange(prev => [record, ...(prev || [])])
    setSaveOpen(false)
    notify({ title: `Universe "${name}" saved`, body: `${effectiveTickers.length} ticker${effectiveTickers.length === 1 ? '' : 's'} stored. Reference from any SetupBuilder.`, kind: 'info', ttlMs: 4500 })
  }

  function handleLoadSaved(u) {
    setFilters({ ...DEFAULT_FILTERS, ...(u.filterDefinition || {}) })
    setSelected(new Set(u.tickers || []))
    // Bump lastUsedAt.
    if (onSavedUniversesChange) {
      onSavedUniversesChange(prev => (prev || []).map(x => x.id === u.id ? { ...x, lastUsedAt: Date.now() } : x))
    }
    notify({ title: `Loaded "${u.name}"`, body: `${(u.tickers || []).length} ticker${(u.tickers || []).length === 1 ? '' : 's'} restored from saved filters.`, kind: 'info', ttlMs: 3000 })
  }

  function handleRenameSaved(u) {
    if (typeof window === 'undefined' || !onSavedUniversesChange) return
    const next = window.prompt('Rename universe', u.name)
    if (next == null || !next.trim()) return
    onSavedUniversesChange(prev => (prev || []).map(x => x.id === u.id ? { ...x, name: next.trim() } : x))
  }

  function handleDeleteSaved(u) {
    if (typeof window === 'undefined' || !onSavedUniversesChange) return
    if (!window.confirm(`Delete saved universe "${u.name}"?`)) return
    onSavedUniversesChange(prev => (prev || []).filter(x => x.id !== u.id))
  }

  function handleCreateSetup() {
    if (!onCreateSetupFromTickers || effectiveTickers.length === 0) return
    onCreateSetupFromTickers(effectiveTickers)
  }

  function handleSuggestClone(template) {
    setSuggestOpen(false)
    if (!onCloneTemplateWithTickers) return
    // Pass the template's createSetup-compatible partial alongside the tickers.
    const partial = {
      name: template.name,
      description: template.description,
      direction: template.direction,
      operator: template.defaultOperator || 'all',
      conditions: (template.defaultConditions || []).map(c => ({
        id: `cond_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: c.type,
        params: { ...(c.params || {}) },
      })),
      tradePlan: { ...(template.defaultTradePlan || {}) },
    }
    onCloneTemplateWithTickers(partial, effectiveTickers)
  }

  const canAct = effectiveTickers.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Screener</div>
          <div style={{ fontSize: 22, color: FG, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Universe<span style={{ color: LIME }}>.</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={loadOrHydrate} disabled={loading || !apiKey} title={!apiKey ? 'Add Massive API key' : ''} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: loading || !apiKey ? '#666' : '#aaa',
            padding: '7px 12px', borderRadius: 3,
            fontFamily: MONO, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: loading || !apiKey ? 'not-allowed' : 'pointer',
          }}>{loading ? `Hydrating ${progress.done}/${progress.total}` : rows.length ? 'Reload universe' : 'Load universe'}</button>
          <button onClick={() => setSuggestOpen(true)} disabled={!canAct} title={canAct ? 'Match templates to this selection' : 'Pick tickers first'} style={{
            background: 'transparent', border: `1px solid ${canAct ? '#aaa' : BORDER}`, color: canAct ? '#aaa' : '#666',
            padding: '7px 12px', borderRadius: 3,
            fontFamily: MONO, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: canAct ? 'pointer' : 'not-allowed',
          }}>Suggest templates</button>
          <button onClick={handleCreateSetup} disabled={!canAct || !onCreateSetupFromTickers} title={canAct ? 'Open SetupBuilder with these tickers' : 'Pick tickers first'} style={{
            background: 'transparent', color: canAct ? LIME : '#666',
            border: `1px solid ${canAct ? LIME : BORDER}`,
            padding: '7px 12px', borderRadius: 3,
            fontFamily: MONO, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: canAct ? 'pointer' : 'not-allowed',
          }}>Create setup →</button>
          <button onClick={() => setSaveOpen(true)} disabled={!canAct || !onSavedUniversesChange} title={canAct ? 'Save this filter + selection' : 'Pick tickers first'} style={{
            background: canAct ? LIME : '#1a1a1a', color: canAct ? '#000' : '#666',
            border: 'none', padding: '8px 14px', borderRadius: 3,
            fontFamily: MONO, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            cursor: canAct ? 'pointer' : 'not-allowed',
          }}>Save universe</button>
        </div>
      </div>

      {error && <div style={{ background: '#150505', border: `1px solid ${RED}55`, color: RED, padding: '8px 12px', borderRadius: 4, fontSize: 11, fontFamily: MONO }}>{error}</div>}

      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 10 }}>
        <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Saved universes</div>
        <SavedUniversesChips list={[...(savedUniverses || [])].sort((a, b) => (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0))} onLoad={handleLoadSaved} onRename={handleRenameSaved} onDelete={handleDeleteSaved} />
      </div>

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
        </div>
      </div>

      {saveOpen && (
        <SaveModal
          initialName={suggestNameFromFilters(filters)}
          count={effectiveTickers.length}
          onSave={handleSaveCommit}
          onCancel={() => setSaveOpen(false)}
        />
      )}

      {suggestOpen && (
        <SuggestionPanel
          rows={effectiveRows}
          onClone={handleSuggestClone}
          onClose={() => setSuggestOpen(false)}
        />
      )}
    </div>
  )
}
