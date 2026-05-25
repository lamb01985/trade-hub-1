// ─────────────────────────────────────────────────────────────────────────────
// MoversScanner.jsx — daily top gainers / losers with quick add-to-setup.
//
// Loads today's top movers via massive.getTopMovers, then fetches 252-day
// daily bars per ticker in parallel to populate the sparkline + RSI + EMA
// distance + RVOL columns. Click a row to expand: full price line chart,
// recent news headlines, fundamentals snapshot (lazy-fetched on first open).
//
// Timeframe toggle (Today / 5-day / Week) only changes the % change column;
// the list itself is always today's biggest snapshot moves.
//
// "Add to setup" per row appends the ticker to an existing setup's universe.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { getTopMovers, getHistoricalBars, getTickerDetails, getRecentNews } from '../lib/massive.js'
import { lastEMA, lastRSI } from '../lib/indicators.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const TIMEFRAMES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'fiveday', label: '5-day', days: 5 },
  { id: 'week', label: '1-week', days: 5 },   // alias for trading-week
  { id: 'month', label: '1-month', days: 21 },
]

function fmtPct(n, d = 2) { return n == null || isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}%` }
function fmtBigCap(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${Math.round(n).toLocaleString()}`
}
function capBadge(mc) {
  if (mc == null) return null
  if (mc >= 200e9) return { label: 'mega', color: LIME }
  if (mc >= 10e9) return { label: 'large', color: '#94a3b8' }
  if (mc >= 2e9) return { label: 'mid', color: YELLOW }
  return { label: 'small', color: '#94a3b8' }
}

function Sparkline({ closes, color = '#aaa', width = 60, height = 16 }) {
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

function near52(price, hi, lo, tol = 0.05) {
  if (price == null || hi == null || lo == null) return null
  if (hi > 0 && (hi - price) / hi <= tol) return 'high'
  if (lo > 0 && (price - lo) / lo <= tol) return 'low'
  return null
}

function MoverRow({ row, isExpanded, onToggle, onAddToSetup, setupsForMenu, apiKey }) {
  const pct = row.changePctForTimeframe ?? row.todaysChangePerc
  const near = near52(row.price, row.wk52High, row.wk52Low)
  const cap = capBadge(row.marketCap)
  return (
    <div style={{
      background: PANEL, border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${(pct ?? 0) >= 0 ? LIME : RED}`,
      borderRadius: 4, marginBottom: 6, fontFamily: MONO,
    }}>
      <div onClick={onToggle} style={{
        display: 'grid',
        gridTemplateColumns: '70px 70px 65px 70px 65px 65px 60px auto 18px',
        gap: 8, padding: '8px 10px', alignItems: 'center', cursor: 'pointer', fontSize: 11,
      }}>
        <span style={{ color: FG, fontWeight: 800, letterSpacing: '0.04em' }}>{row.ticker}</span>
        <span style={{ color: FG }}>${f2(row.price)}</span>
        <span style={{ color: (pct ?? 0) >= 0 ? LIME : RED, fontWeight: 700 }}>{fmtPct(pct)}</span>
        <Sparkline closes={row.closes || []} />
        <span style={{ color: row.rsi == null ? MUTED : row.rsi >= 70 ? RED : row.rsi <= 30 ? LIME : '#aaa' }}>
          {row.rsi == null ? '—' : `RSI ${row.rsi.toFixed(0)}`}
        </span>
        <span style={{ color: row.dist50 == null ? MUTED : '#aaa' }}>
          {row.dist50 == null ? '50 —' : `50 ${row.dist50 >= 0 ? '+' : ''}${row.dist50.toFixed(1)}%`}
        </span>
        <span style={{ color: row.rvol == null ? MUTED : row.rvol >= 2 ? LIME : '#aaa' }}>
          {row.rvol == null ? '—' : `RVOL ${row.rvol.toFixed(2)}`}
        </span>
        <span style={{ color: '#aaa', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {cap && <span style={{ fontSize: 9, color: cap.color, border: `1px solid ${cap.color}44`, padding: '2px 5px', borderRadius: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{cap.label}</span>}
          {near && <span style={{ fontSize: 9, color: near === 'high' ? LIME : RED, border: `1px solid ${(near === 'high' ? LIME : RED)}55`, padding: '2px 5px', borderRadius: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>near 52W {near}</span>}
          {row.companyName && <span style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.companyName}</span>}
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
  const [details, setDetails] = useState(row.details || null)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!apiKey) return
    let alive = true
    setLoading(true)
    Promise.all([
      getRecentNews(apiKey, row.ticker, 5).catch(() => []),
      details ? Promise.resolve(details) : getTickerDetails(apiKey, row.ticker).catch(() => null),
    ]).then(([n, d]) => {
      if (!alive) return
      setNews(n || [])
      if (d) setDetails(d)
      setLoading(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.ticker, apiKey])

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Sparkline closes={row.closes} width={520} height={70} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Stat label="P/S" value={details?.market_cap && row.ttmRev ? (details.market_cap / row.ttmRev).toFixed(1) : '—'} />
        <Stat label="Market cap" value={fmtBigCap(details?.market_cap)} />
        <Stat label="Sector" value={details?.sic_description ? details.sic_description.split(/[ -]/).slice(0, 2).join(' ') : '—'} />
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

// ── Hydration: pull 252-day bars per ticker and enrich rows in place ──────

async function hydrateRow(apiKey, row, timeframeDays) {
  try {
    const bars = await getHistoricalBars(apiKey, row.ticker, 252)
    if (!bars?.length) return row
    const closes = bars.map(b => b?.c).filter(v => v != null && v > 0)
    const ema50 = lastEMA(closes, 50)
    const ema200 = lastEMA(closes, 200)
    const rsi = lastRSI(closes, 14)
    const wk52High = closes.length ? Math.max(...closes.slice(-Math.min(252, closes.length))) : null
    const wk52Low = closes.length ? Math.min(...closes.slice(-Math.min(252, closes.length))) : null
    // Period change: today's close vs N trading days ago.
    let changePctForTimeframe = row.todaysChangePerc
    if (timeframeDays > 0 && closes.length > timeframeDays) {
      const past = closes[closes.length - 1 - timeframeDays]
      if (past > 0) changePctForTimeframe = ((closes[closes.length - 1] - past) / past) * 100
    }
    // Approximate RVOL: today's volume vs trailing 20-day avg.
    let rvol = null
    if (bars.length >= 21 && bars[bars.length - 1]?.v != null) {
      const recent = bars.slice(-21, -1)
      const sum = recent.reduce((s, b) => s + (b?.v || 0), 0)
      const avg = sum / 20
      if (avg > 0) rvol = bars[bars.length - 1].v / avg
    }
    return {
      ...row,
      closes,
      rsi,
      ema50, ema200,
      dist50: distance(row.price, ema50),
      dist200: distance(row.price, ema200),
      wk52High, wk52Low,
      rvol,
      changePctForTimeframe,
    }
  } catch {
    return row
  }
}

// ── Top-level ──────────────────────────────────────────────────────────────

export default function MoversScanner({ apiKey, setups = [], onSetupsChange }) {
  const [movers, setMovers] = useState({ gainers: [], losers: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [timeframe, setTimeframe] = useState('today')
  const [expanded, setExpanded] = useState(null)
  const hydrationCacheRef = useRef({})  // { ticker: hydratedRow }

  const tfDef = TIMEFRAMES.find(t => t.id === timeframe) || TIMEFRAMES[0]

  async function loadMovers() {
    if (!apiKey) { setError('Add a Massive API key in Command first.'); return }
    setLoading(true); setError(null)
    try {
      const all = await getTopMovers(apiKey)
      // getTopMovers returns mixed gainers + losers; split by sign of day change.
      const split = { gainers: [], losers: [] }
      for (const s of all) {
        const chg = s?.todaysChangePerc ?? s?.day?.todaysChangePerc ?? 0
        const row = {
          ticker: s.ticker,
          price: s?.day?.c ?? s?.lastTrade?.p ?? null,
          todaysChangePerc: chg,
          companyName: s?.ticker, // placeholder; tickerDetails fills it lazily
        }
        if (chg >= 0) split.gainers.push(row)
        else split.losers.push(row)
      }
      split.gainers.sort((a, b) => (b.todaysChangePerc || 0) - (a.todaysChangePerc || 0))
      split.losers.sort((a, b) => (a.todaysChangePerc || 0) - (b.todaysChangePerc || 0))
      split.gainers = split.gainers.slice(0, 20)
      split.losers = split.losers.slice(0, 20)
      setMovers(split)
      // Background-hydrate each row with bars-derived indicators.
      const all20 = [...split.gainers, ...split.losers]
      for (const row of all20) {
        hydrateRow(apiKey, row, tfDef.days).then(h => {
          hydrationCacheRef.current[row.ticker] = h
          // Bump state so rows re-render with the cached values.
          setMovers(prev => ({
            gainers: prev.gainers.map(r => r.ticker === row.ticker ? { ...r, ...h } : r),
            losers: prev.losers.map(r => r.ticker === row.ticker ? { ...r, ...h } : r),
          }))
        })
      }
    } catch (e) {
      setError(e?.message || 'Movers fetch failed')
    }
    setLoading(false)
  }

  // Re-derive the timeframe % when the toggle changes by reading from the
  // hydrationCacheRef (which has the closes). Skips an extra fetch.
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
      const cur = new Set((s.universe || []).map(t => String(t).toUpperCase()))
      if (cur.has(T)) return s
      return { ...s, universe: [...(s.universe || []), T], updatedAt: new Date().toISOString() }
    }))
  }

  // Non-archived setups feed the per-row Add-to-setup dropdown.
  const setupsForMenu = useMemo(
    () => (setups || []).filter(s => s.status !== 'archived').map(s => ({ id: s.id, name: s.name })),
    [setups]
  )

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
          }}>{loading ? 'Loading…' : 'Load movers'}</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#150505', border: `1px solid ${RED}55`, color: RED, padding: '8px 12px', borderRadius: 4, fontSize: 11, fontFamily: MONO }}>{error}</div>
      )}

      {movers.gainers.length === 0 && movers.losers.length === 0 && !loading && (
        <div style={{ background: PANEL, border: `1px dashed ${BORDER}`, borderRadius: 5, padding: 28, textAlign: 'center', color: MUTED, fontSize: 11, fontFamily: MONO }}>
          Hit "Load movers" to pull today's top moves. List sourced from Massive's snapshot endpoint.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
        <Column title="Top gainers" rows={movers.gainers} accent={LIME} expanded={expanded} setExpanded={setExpanded} onAddToSetup={addTickerToSetup} setupsForMenu={setupsForMenu} apiKey={apiKey} />
        <Column title="Top losers" rows={movers.losers} accent={RED} expanded={expanded} setExpanded={setExpanded} onAddToSetup={addTickerToSetup} setupsForMenu={setupsForMenu} apiKey={apiKey} />
      </div>
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
        <div style={{ fontSize: 11, color: MUTED, padding: 14, fontFamily: MONO, textAlign: 'center' }}>None today.</div>
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
  if (!row?.closes || days <= 0 || row.closes.length <= days) return { ...row, changePctForTimeframe: row.todaysChangePerc }
  const past = row.closes[row.closes.length - 1 - days]
  if (!past || past <= 0) return row
  const cur = row.closes[row.closes.length - 1]
  return { ...row, changePctForTimeframe: ((cur - past) / past) * 100 }
}
