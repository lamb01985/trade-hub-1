// ─────────────────────────────────────────────────────────────────────────────
// MoversScanner.jsx — daily gainers / losers with quality filters.
//
// Defaults to filtering out penny stocks and low-volume noise so the list
// reads like institutional moves. Filter bar exposes:
//   - Min price, min market cap, min RVOL, min dollar volume, sector,
//     Include unfiltered toggle.
//
// Each surviving row carries: sparkline, price, % change for the selected
// timeframe, RVOL, dollar volume, RSI, dist-50EMA, market cap badge,
// sector tag, quality badge.
//
// Row actions: per-row Add-to-setup (writes through to any existing setup
// universe). Row expand: news, full ticker details.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { useLocalStorage } from '../hooks/useStore.js'
import { getTopMovers, getHistoricalBars, getTickerDetails, getRecentNews } from '../lib/massive.js'
import { lastEMA, lastRSI } from '../lib/indicators.js'
import { universeAppendTickers } from '../lib/universeResolver.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const TIMEFRAMES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'fiveday', label: '5-day', days: 5 },
  { id: 'week', label: '1-week', days: 5 },
  { id: 'month', label: '1-month', days: 21 },
]

const SORT_OPTIONS = [
  { id: 'change', label: '% Change' },
  { id: 'rvol', label: 'RVOL' },
  { id: 'dollarVol', label: 'Dollar Vol' },
  { id: 'rsi', label: 'RSI' },
]

const CAP_OPTIONS = [
  { v: null, label: 'Any cap' },
  { v: 500e6, label: '$500M+' },
  { v: 1e9, label: '$1B+' },
  { v: 5e9, label: '$5B+' },
  { v: 10e9, label: '$10B+' },
  { v: 100e9, label: '$100B+' },
]
const DV_OPTIONS = [
  { v: null, label: 'Any $ vol' },
  { v: 5e6, label: '$5M+' },
  { v: 10e6, label: '$10M+' },
  { v: 20e6, label: '$20M+' },
  { v: 50e6, label: '$50M+' },
  { v: 100e6, label: '$100M+' },
]

const DEFAULT_FILTERS = {
  minPrice: 10,
  minMarketCap: 1e9,
  minRvol: 1.0,
  minDollarVolume: 20e6,
  sector: '',
  includeUnfiltered: false,
}

function fmtPct(n, d = 2) { return n == null || isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}%` }
function fmtBigCap(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${Math.round(n).toLocaleString()}`
}
function fmtDollarVol(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${Math.round(n)}`
}
function capBadge(mc) {
  if (mc == null) return null
  if (mc >= 200e9) return { label: 'mega', color: LIME }
  if (mc >= 10e9) return { label: 'large', color: '#94a3b8' }
  if (mc >= 2e9) return { label: 'mid', color: YELLOW }
  return { label: 'small', color: '#94a3b8' }
}

function Sparkline({ closes, width = 60, height = 16 }) {
  if (!closes || closes.length < 2) return <span style={{ display: 'inline-block', width, height }} />
  const slice = closes.slice(-20)
  const min = Math.min(...slice)
  const max = Math.max(...slice)
  const range = max - min || 1
  const stepX = width / Math.max(1, slice.length - 1)
  const d = slice.map((c, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${(height - ((c - min) / range) * (height - 2) - 1).toFixed(1)}`).join(' ')
  const up = slice[slice.length - 1] >= slice[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'inline-block' }}>
      <path d={d} fill="none" stroke={up ? LIME : RED} strokeWidth="1" />
    </svg>
  )
}

function distance(price, ema) {
  if (price == null || ema == null) return null
  return ((price - ema) / ema) * 100
}

// Quality badge from RVOL + dollar volume.
function qualityBadge(rvol, dollarVol) {
  if (rvol != null && dollarVol != null && rvol > 1.5 && dollarVol > 25e6) {
    return { color: LIME, title: 'Institutional grade: RVOL > 1.5 AND $vol > $25M' }
  }
  if ((rvol != null && rvol > 1) || (dollarVol != null && dollarVol > 10e6)) {
    return { color: YELLOW, title: 'Mixed signal: elevated RVOL or $vol' }
  }
  return null
}

// ── Hydration ─────────────────────────────────────────────────────────────

async function hydrateRow(row, timeframeDays, cache) {
  if (cache[row.ticker] && Date.now() - cache[row.ticker].hydratedAt < 30 * 60 * 1000) {
    return { ...row, ...cache[row.ticker] }
  }
  const enriched = { ticker: row.ticker, hydratedAt: Date.now() }
  try {
    const [bars, details] = await Promise.all([
      getHistoricalBars(row.ticker, 252).catch(() => []),
      getTickerDetails(row.ticker).catch(() => null),
    ])
    if (bars?.length) {
      const closes = bars.map(b => b?.c).filter(v => v != null && v > 0)
      enriched.closes = closes.slice(-60)
      enriched.fullCloses = closes
      enriched.ema50 = lastEMA(closes, 50)
      enriched.ema200 = lastEMA(closes, 200)
      enriched.rsi = lastRSI(closes, 14)
      enriched.wk52High = closes.length ? Math.max(...closes.slice(-Math.min(252, closes.length))) : null
      enriched.wk52Low = closes.length ? Math.min(...closes.slice(-Math.min(252, closes.length))) : null
      enriched.dist50 = distance(row.price, enriched.ema50)
      enriched.dist200 = distance(row.price, enriched.ema200)
      let changePctForTimeframe = row.todaysChangePerc
      if (timeframeDays > 0 && closes.length > timeframeDays) {
        const past = closes[closes.length - 1 - timeframeDays]
        if (past > 0) changePctForTimeframe = ((closes[closes.length - 1] - past) / past) * 100
      }
      enriched.changePctForTimeframe = changePctForTimeframe
      if (bars.length >= 21 && bars[bars.length - 1]?.v != null) {
        const recent = bars.slice(-21, -1)
        const sum = recent.reduce((s, b) => s + (b?.v || 0), 0)
        const avg = sum / 20
        if (avg > 0) enriched.rvol = bars[bars.length - 1].v / avg
        enriched.todayVolume = bars[bars.length - 1].v
      }
      if (enriched.todayVolume != null && row.price != null) {
        enriched.dollarVolume = enriched.todayVolume * row.price
      }
    }
    if (details) {
      enriched.marketCap = details.market_cap ?? null
      enriched.sector = details.sic_description ? details.sic_description.split(/[ -]/).slice(0, 3).join(' ') : null
      enriched.companyName = details.name || row.ticker
      enriched.details = details
    }
  } catch {}
  cache[row.ticker] = enriched
  return { ...row, ...enriched }
}

// ── Filter + sort ────────────────────────────────────────────────────────

function passQualityFilters(row, f) {
  if (f.includeUnfiltered) return true
  if (f.minPrice != null && (row.price == null || row.price < f.minPrice)) return false
  if (f.minMarketCap != null && (row.marketCap == null || row.marketCap < f.minMarketCap)) return false
  if (f.minRvol != null && (row.rvol == null || row.rvol < f.minRvol)) return false
  if (f.minDollarVolume != null && (row.dollarVolume == null || row.dollarVolume < f.minDollarVolume)) return false
  if (f.sector?.trim()) {
    const want = f.sector.trim().toLowerCase()
    if (!row.sector || !row.sector.toLowerCase().includes(want)) return false
  }
  return true
}

function sortRows(rows, sortBy, direction = 'desc') {
  const sorted = [...rows]
  const getter = ({
    change: r => r.changePctForTimeframe ?? r.todaysChangePerc ?? 0,
    rvol: r => r.rvol ?? 0,
    dollarVol: r => r.dollarVolume ?? 0,
    rsi: r => r.rsi ?? 50,
  })[sortBy] || (r => 0)
  sorted.sort((a, b) => {
    const av = getter(a)
    const bv = getter(b)
    return direction === 'asc' ? av - bv : bv - av
  })
  return sorted
}

// ── Row / column ──────────────────────────────────────────────────────────

function MoverRow({ row, isExpanded, onToggle, onAddToSetup, setupsForMenu, apiKey }) {
  const pct = row.changePctForTimeframe ?? row.todaysChangePerc
  const cap = capBadge(row.marketCap)
  const quality = qualityBadge(row.rvol, row.dollarVolume)
  return (
    <div style={{
      background: PANEL, border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${(pct ?? 0) >= 0 ? LIME : RED}`,
      borderRadius: 4, marginBottom: 6, fontFamily: MONO,
    }}>
      <div onClick={onToggle} style={{
        display: 'grid',
        gridTemplateColumns: '14px 70px 70px 65px 70px 75px 75px 60px 65px auto 18px',
        gap: 8, padding: '8px 10px', alignItems: 'center', cursor: 'pointer', fontSize: 11,
      }}>
        {quality
          ? <span title={quality.title} style={{ width: 8, height: 8, borderRadius: 4, background: quality.color }} />
          : <span style={{ width: 8, height: 8 }} />}
        <span style={{ color: FG, fontWeight: 800, letterSpacing: '0.04em' }}>{row.ticker}</span>
        <span style={{ color: FG }}>${f2(row.price)}</span>
        <span style={{ color: (pct ?? 0) >= 0 ? LIME : RED, fontWeight: 700 }}>{fmtPct(pct)}</span>
        <Sparkline closes={row.closes || []} />
        <span style={{ color: row.rvol == null ? MUTED : row.rvol >= 1.5 ? LIME : row.rvol >= 1 ? YELLOW : RED }}>
          {row.rvol == null ? 'RVOL —' : `RVOL ${row.rvol.toFixed(2)}`}
        </span>
        <span style={{ color: row.dollarVolume == null ? MUTED : '#aaa' }}>{fmtDollarVol(row.dollarVolume)}</span>
        <span style={{ color: row.rsi == null ? MUTED : row.rsi >= 70 ? RED : row.rsi <= 30 ? LIME : '#aaa' }}>
          {row.rsi == null ? '—' : `RSI ${row.rsi.toFixed(0)}`}
        </span>
        <span style={{ color: row.dist50 == null ? MUTED : '#aaa' }}>
          {row.dist50 == null ? '50 —' : `50 ${row.dist50 >= 0 ? '+' : ''}${row.dist50.toFixed(1)}%`}
        </span>
        <span style={{ color: '#aaa', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {cap && <span style={{ fontSize: 9, color: cap.color, border: `1px solid ${cap.color}44`, padding: '2px 5px', borderRadius: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{cap.label}</span>}
          <span style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fmtBigCap(row.marketCap)}{row.sector ? ` · ${row.sector}` : ''}
          </span>
        </span>
        <span style={{ color: '#444', fontSize: 12 }}>{isExpanded ? '−' : '+'}</span>
      </div>

      {isExpanded && (
        <ExpandedRow row={row} onAddToSetup={onAddToSetup} setupsForMenu={setupsForMenu} apiKey={apiKey} />
      )}
    </div>
  )
}

function ExpandedRow({ row, onAddToSetup, setupsForMenu, apiKey }) {
  const [news, setNews] = useState(null)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!apiKey) return
    let alive = true
    setLoading(true)
    getRecentNews(row.ticker, 5).catch(() => []).then(n => {
      if (!alive) return
      setNews(n || [])
      setLoading(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.ticker, apiKey])

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Sparkline closes={row.closes} width={520} height={70} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Stat label="Market cap" value={fmtBigCap(row.marketCap)} />
        <Stat label="Dollar vol" value={fmtDollarVol(row.dollarVolume)} />
        <Stat label="Sector" value={row.sector || '—'} />
        <Stat label="200 EMA" value={row.dist200 == null ? '—' : `${row.dist200 >= 0 ? '+' : ''}${row.dist200.toFixed(1)}%`} color={row.dist200 == null ? MUTED : row.dist200 >= 0 ? LIME : RED} />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Recent news</div>
          {loading && <div style={{ fontSize: 10, color: MUTED }}>Loading…</div>}
          {news && news.length === 0 && <div style={{ fontSize: 10, color: MUTED }}>No recent news.</div>}
          {news && news.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {news.slice(0, 4).map((n, i) => (
                <a key={i} href={n.article_url} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 11, color: '#aaa', textDecoration: 'none', fontFamily: MONO,
                  borderLeft: `2px solid ${BORDER}`, paddingLeft: 8, lineHeight: 1.5,
                }}>
                  {n.title} <span style={{ color: MUTED }}>— {new Date(n.published_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} disabled={setupsForMenu.length === 0} style={{
            background: setupsForMenu.length ? LIME : '#1a1a1a',
            color: setupsForMenu.length ? '#000' : '#666',
            border: 'none', padding: '7px 14px', borderRadius: 3,
            fontFamily: MONO, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: setupsForMenu.length ? 'pointer' : 'not-allowed',
          }}>Add to setup ▾</button>
          {menuOpen && setupsForMenu.length > 0 && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4,
              background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4,
              minWidth: 220, maxHeight: 260, overflowY: 'auto', zIndex: 10,
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            }}>
              {setupsForMenu.map(s => (
                <button key={s.id} onClick={() => { onAddToSetup(s.id, row.ticker); setMenuOpen(false) }} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none', color: '#aaa',
                  padding: '8px 12px', fontFamily: MONO, fontSize: 11,
                  cursor: 'pointer', borderBottom: `1px solid #131313`,
                }}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color = FG }) {
  return (
    <div style={{ padding: 7, background: DARK, borderRadius: 3 }}>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color, fontFamily: MONO, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

// ── Top-level ──────────────────────────────────────────────────────────────

export default function MoversScanner({ apiKey, setups = [], onSetupsChange, savedUniverses = [] }) {
  const [movers, setMovers] = useState({ gainers: [], losers: [] })
  const [loading, setLoading] = useState(false)
  const [hydrating, setHydrating] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)
  const [timeframe, setTimeframe] = useState('today')
  const [expanded, setExpanded] = useState(null)
  const [filters, setFilters] = useLocalStorage('th-mover-filters-v1', DEFAULT_FILTERS)
  const [sortBy, setSortBy] = useState('change')
  const hydrationCacheRef = useRef({})

  const tfDef = TIMEFRAMES.find(t => t.id === timeframe) || TIMEFRAMES[0]

  function patchFilters(p) { setFilters(prev => ({ ...prev, ...p })) }
  function resetFilters() { setFilters(DEFAULT_FILTERS) }

  async function loadMovers() {
    if (!apiKey) { setError('Add a Massive API key in Command first.'); return }
    setLoading(true); setError(null); setHydrating({ done: 0, total: 0 })
    try {
      const all = await getTopMovers()
      const split = { gainers: [], losers: [] }
      for (const s of all) {
        const chg = s?.todaysChangePerc ?? s?.day?.todaysChangePerc ?? 0
        const row = {
          ticker: s.ticker,
          price: s?.day?.c ?? s?.lastTrade?.p ?? null,
          todaysChangePerc: chg,
          companyName: s?.ticker,
        }
        if (chg >= 0) split.gainers.push(row)
        else split.losers.push(row)
      }
      split.gainers.sort((a, b) => (b.todaysChangePerc || 0) - (a.todaysChangePerc || 0))
      split.losers.sort((a, b) => (a.todaysChangePerc || 0) - (b.todaysChangePerc || 0))
      split.gainers = split.gainers.slice(0, 30)
      split.losers = split.losers.slice(0, 30)
      setMovers(split)

      const all30 = [...split.gainers, ...split.losers]
      setHydrating({ done: 0, total: all30.length })
      let done = 0
      await Promise.all(all30.map(async (row) => {
        const enriched = await hydrateRow(row, tfDef.days, hydrationCacheRef.current)
        setMovers(prev => ({
          gainers: prev.gainers.map(r => r.ticker === row.ticker ? { ...r, ...enriched } : r),
          losers: prev.losers.map(r => r.ticker === row.ticker ? { ...r, ...enriched } : r),
        }))
        done += 1
        setHydrating({ done, total: all30.length })
      }))
    } catch (e) {
      setError(e?.message || 'Movers fetch failed')
    }
    setLoading(false)
  }

  // Re-derive timeframe change column from cached closes when timeframe changes.
  useEffect(() => {
    if (!movers.gainers.length && !movers.losers.length) return
    setMovers(prev => ({
      gainers: prev.gainers.map(r => recomputeTfChange(r, tfDef.days)),
      losers: prev.losers.map(r => recomputeTfChange(r, tfDef.days)),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tfDef.days])

  function addTickerToSetup(setupId, ticker) {
    if (!onSetupsChange) return
    const T = String(ticker || '').toUpperCase()
    onSetupsChange(prev => prev.map(s => {
      if (s.id !== setupId) return s
      return { ...s, universe: universeAppendTickers(s.universe, [T], savedUniverses || []), updatedAt: new Date().toISOString() }
    }))
  }

  const setupsForMenu = useMemo(
    () => (setups || []).filter(s => s.status !== 'archived').map(s => ({ id: s.id, name: s.name })),
    [setups]
  )

  const filteredGainers = useMemo(
    () => sortRows(movers.gainers.filter(r => passQualityFilters(r, filters)), sortBy),
    [movers.gainers, filters, sortBy]
  )
  const filteredLosers = useMemo(
    () => sortRows(movers.losers.filter(r => passQualityFilters(r, filters)), sortBy === 'change' ? 'change' : sortBy),
    [movers.losers, filters, sortBy]
  )

  const totalRaw = movers.gainers.length + movers.losers.length
  const totalFiltered = filteredGainers.length + filteredLosers.length
  const filtersActive = !filters.includeUnfiltered && (filters.minPrice || filters.minMarketCap || filters.minRvol || filters.minDollarVolume || filters.sector?.trim())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Research</div>
          <div style={{ fontSize: 22, color: FG, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Movers<span style={{ color: LIME }}>.</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.id} onClick={() => setTimeframe(tf.id)} style={{
              background: timeframe === tf.id ? LIME : 'transparent',
              color: timeframe === tf.id ? '#000' : '#aaa',
              border: `1px solid ${timeframe === tf.id ? LIME : BORDER}`,
              padding: '5px 10px', borderRadius: 3, fontFamily: MONO,
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer', fontWeight: timeframe === tf.id ? 700 : 500,
            }}>{tf.label}</button>
          ))}
          <span style={{ width: 6 }} />
          <button onClick={loadMovers} disabled={loading || !apiKey} title={!apiKey ? 'Add Massive API key' : ''} style={{
            background: loading || !apiKey ? '#1a1a1a' : LIME, color: loading || !apiKey ? '#666' : '#000',
            border: 'none', padding: '7px 14px', borderRadius: 3,
            fontFamily: MONO, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            cursor: loading || !apiKey ? 'not-allowed' : 'pointer',
          }}>{loading ? `Loading… ${hydrating.done}/${hydrating.total}` : 'Load movers'}</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#150505', border: `1px solid ${RED}55`, color: RED, padding: '8px 12px', borderRadius: 4, fontSize: 11, fontFamily: MONO }}>{error}</div>
      )}

      {/* Quality filter bar */}
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <FilterField label="Min price ($)">
          <input type="number" value={filters.minPrice ?? ''} onChange={e => patchFilters({ minPrice: e.target.value === '' ? null : Number(e.target.value) })} style={inputBase(70)} placeholder="10" />
        </FilterField>
        <FilterField label="Min market cap">
          <select value={filters.minMarketCap ?? ''} onChange={e => patchFilters({ minMarketCap: e.target.value === '' ? null : Number(e.target.value) })} style={inputBase(110)}>
            {CAP_OPTIONS.map(o => <option key={String(o.v)} value={o.v == null ? '' : o.v}>{o.label}</option>)}
          </select>
        </FilterField>
        <FilterField label="Min RVOL">
          <input type="number" step="0.1" value={filters.minRvol ?? ''} onChange={e => patchFilters({ minRvol: e.target.value === '' ? null : Number(e.target.value) })} style={inputBase(70)} placeholder="1.0" />
        </FilterField>
        <FilterField label="Min dollar vol">
          <select value={filters.minDollarVolume ?? ''} onChange={e => patchFilters({ minDollarVolume: e.target.value === '' ? null : Number(e.target.value) })} style={inputBase(110)}>
            {DV_OPTIONS.map(o => <option key={String(o.v)} value={o.v == null ? '' : o.v}>{o.label}</option>)}
          </select>
        </FilterField>
        <FilterField label="Sector contains">
          <input type="text" value={filters.sector} onChange={e => patchFilters({ sector: e.target.value })} style={inputBase(140)} placeholder="e.g. technology" />
        </FilterField>
        <FilterField label="Sort by">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputBase(120)}>
            {SORT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </FilterField>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 6 }}>
          <input type="checkbox" checked={!!filters.includeUnfiltered} onChange={e => patchFilters({ includeUnfiltered: e.target.checked })} />
          <span style={{ fontSize: 10, color: FG, fontFamily: MONO, letterSpacing: '0.06em' }}>Include unfiltered</span>
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={resetFilters} style={{ background: 'transparent', border: `1px dashed ${BORDER}`, color: '#aaa', padding: '6px 10px', borderRadius: 3, fontFamily: MONO, fontSize: 10, cursor: 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Reset defaults</button>
      </div>
      {totalRaw > 0 && (
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.06em' }}>
          Showing <span style={{ color: FG, fontWeight: 700 }}>{totalFiltered}</span> quality movers ({totalRaw - totalFiltered} filtered out)
          {filtersActive && <span style={{ color: LIME, marginLeft: 8 }}>· default quality filters applied</span>}
        </div>
      )}

      {movers.gainers.length === 0 && movers.losers.length === 0 && !loading && (
        <div style={{ background: PANEL, border: `1px dashed ${BORDER}`, borderRadius: 5, padding: 28, textAlign: 'center', color: MUTED, fontSize: 11, fontFamily: MONO }}>
          Hit "Load movers" to pull today's biggest moves. Default filters strip penny stocks, low-cap names, and thin-volume noise.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(540px, 1fr))', gap: 12 }}>
        <Column title="Top gainers" rows={filteredGainers} accent={LIME} expanded={expanded} setExpanded={setExpanded} onAddToSetup={addTickerToSetup} setupsForMenu={setupsForMenu} apiKey={apiKey} />
        <Column title="Top losers" rows={filteredLosers} accent={RED} expanded={expanded} setExpanded={setExpanded} onAddToSetup={addTickerToSetup} setupsForMenu={setupsForMenu} apiKey={apiKey} />
      </div>
    </div>
  )
}

function inputBase(width) {
  return {
    background: DARK, border: `1px solid ${BORDER}`, borderRadius: 3,
    color: FG, fontFamily: MONO, fontSize: 11, padding: '6px 8px',
    outline: 'none', width,
  }
}

function FilterField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </div>
  )
}

function Column({ title, rows, accent, expanded, setExpanded, onAddToSetup, setupsForMenu, apiKey }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 9, color: accent, fontFamily: MONO, fontWeight: 700,
          border: `1px solid ${accent}55`, padding: '3px 8px', borderRadius: 3,
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{title}</span>
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>{rows.length}</span>
      </div>
      {rows.length === 0 && (
        <div style={{ fontSize: 11, color: MUTED, padding: 14, fontFamily: MONO, textAlign: 'center' }}>None matching the current filters.</div>
      )}
      {rows.map(row => (
        <MoverRow
          key={row.ticker}
          row={row}
          isExpanded={expanded === `${title}|${row.ticker}`}
          onToggle={() => setExpanded(prev => prev === `${title}|${row.ticker}` ? null : `${title}|${row.ticker}`)}
          onAddToSetup={onAddToSetup}
          setupsForMenu={setupsForMenu}
          apiKey={apiKey}
        />
      ))}
    </div>
  )
}

function recomputeTfChange(row, days) {
  if (!row?.fullCloses || days <= 0 || row.fullCloses.length <= days) return { ...row, changePctForTimeframe: row.todaysChangePerc }
  const past = row.fullCloses[row.fullCloses.length - 1 - days]
  if (!past || past <= 0) return row
  const cur = row.fullCloses[row.fullCloses.length - 1]
  return { ...row, changePctForTimeframe: ((cur - past) / past) * 100 }
}
