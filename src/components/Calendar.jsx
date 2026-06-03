import { useMemo, useState, useEffect } from 'react'
import { Card, SLabel, Heading, Pill, Btn } from './ui.jsx'
import { useLocalStorage } from '../hooks/useStore.js'
import { LIME, RED, YELLOW, BLUE, ORANGE, PURPLE, MONO, BORDER, PANEL } from '../constants.js'
import { getAllEvents, eventsOn, ymd, parseYmd, startOfWeek, colorForEvent, fetchNasdaqEarnings, MAJOR_TICKERS } from '../lib/calendar.js'
import { getRotationSnapshot, flowLabel, tierColor, trendArrow, SECTORS, writeSectorCache, readSectorCache } from '../lib/sectors.js'

const VIEWS = [
  { id: 'week', label: 'This Week' },
  { id: 'list', label: 'Next 14 Days' },
  { id: 'month', label: 'Month' },
]

function fmtDateHeader(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtDateLong(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
function todayYmd() { return ymd(new Date()) }
function isToday(dateStr) { return dateStr === todayYmd() }
function isPast(dateStr) { return dateStr < todayYmd() }

function EventBadge({ event, compact = false }) {
  const color = colorForEvent(event)
  const text = event.ticker
    ? `${event.ticker} ${event.bmo || ''}`.trim()
    : event.name
  return (
    <div style={{ background: `${color}15`, border: `1px solid ${color}55`, borderRadius: 3, padding: compact ? '4px 6px' : '6px 9px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 9, fontFamily: MONO, color, fontWeight: 700, letterSpacing: '0.04em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{text}</div>
      {!compact && (
        <div style={{ fontSize: 8, fontFamily: MONO, color: '#666' }}>
          {event.time ? `${event.time} CT` : ''}
          {event.est ? ` · est ${event.est}` : ''}
        </div>
      )}
    </div>
  )
}

function WeekView({ events }) {
  const start = startOfWeek(new Date())
  const days = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    days.push(d)
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
      {days.map(d => {
        const dateStr = ymd(d)
        const dayEvents = eventsOn(events, dateStr)
        const today = isToday(dateStr)
        const past = isPast(dateStr)
        return (
          <div key={dateStr} style={{
            background: today ? '#0a1208' : PANEL,
            border: `1px solid ${today ? LIME + '55' : BORDER}`,
            borderRadius: 5, padding: '12px 12px', minHeight: 220,
            opacity: past ? 0.45 : 1,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 10 }}>
              <span style={{ fontSize: 9, fontFamily: MONO, color: today ? LIME : '#555', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span style={{ fontSize: 18, fontFamily: MONO, fontWeight: 900, color: today ? LIME : '#aaa' }}>
                {d.getDate()}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {dayEvents.length === 0 ? (
                <span style={{ fontSize: 9, fontFamily: MONO, color: '#2a2a2a' }}>—</span>
              ) : (
                dayEvents.map((e, i) => <EventBadge key={i} event={e} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ events }) {
  const grouped = useMemo(() => {
    const m = new Map()
    for (const e of events) {
      if (!m.has(e.date)) m.set(e.date, [])
      m.get(e.date).push(e)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [events])

  if (!grouped.length) return <div style={{ fontSize: 11, fontFamily: MONO, color: '#444' }}>No events in the next 14 days.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {grouped.map(([dateStr, dayEvents]) => {
        const d = parseYmd(dateStr)
        const today = isToday(dateStr)
        return (
          <div key={dateStr} style={{ background: PANEL, border: `1px solid ${today ? LIME + '44' : BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: today ? '#0a1208' : '#0a0a0a', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: today ? LIME : '#aaa', letterSpacing: '0.04em' }}>{fmtDateLong(d)}</span>
              {today && <span style={{ fontSize: 8, color: LIME, fontFamily: MONO, letterSpacing: '0.14em', border: `1px solid ${LIME}55`, borderRadius: 3, padding: '1px 6px' }}>TODAY</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {dayEvents.map((e, i) => {
                const color = colorForEvent(e)
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 90px 1fr 130px', gap: 12, padding: '11px 16px', borderTop: i > 0 ? '1px solid #0d0d0d' : 'none', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontFamily: MONO, color: '#888', fontWeight: 700 }}>{e.time || '—'} CT</span>
                    <span style={{ fontSize: 9, fontFamily: MONO, color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {e.type === 'opex' && e.tripleWitching ? 'TRIPLE WITCH' : e.type === 'opex' ? 'OPEX' : e.type === 'fomc' ? 'FOMC' : e.type === 'earnings' ? 'EARNINGS' : e.impact?.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: MONO, color: '#e8e8e8' }}>{e.name}</span>
                    <span style={{ fontSize: 10, fontFamily: MONO, color: '#666', textAlign: 'right' }}>
                      {e.ticker && e.bmo ? e.bmo : ''}{e.est ? ` · est ${e.est}` : ''}{e.details ? e.details : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MonthView({ events, selectedDate, onSelectDate }) {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} style={{ fontSize: 9, fontFamily: MONO, color: '#444', textAlign: 'center', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} style={{ minHeight: 64, background: '#070707', borderRadius: 3 }} />
          const dateStr = ymd(d)
          const dayEvents = eventsOn(events, dateStr)
          const dots = [...new Set(dayEvents.map(e => colorForEvent(e)))].slice(0, 5)
          const today = isToday(dateStr)
          const selected = selectedDate === dateStr
          const isWeekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <button key={i} onClick={() => onSelectDate(dateStr === selectedDate ? null : dateStr)} style={{
              background: selected ? '#0d1408' : today ? '#0a1208' : isWeekend ? '#080808' : PANEL,
              border: `1px solid ${selected ? LIME : today ? LIME + '55' : BORDER}`,
              borderRadius: 3, padding: '8px 8px', minHeight: 64, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              fontFamily: MONO, textAlign: 'left',
            }}>
              <span style={{ fontSize: 11, fontWeight: today ? 900 : 600, color: today ? LIME : isWeekend ? '#444' : '#aaa' }}>{d.getDate()}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {dots.map((c, j) => <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: c }} />)}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SmartWarnings({ events }) {
  const warnings = useMemo(() => {
    const out = []
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const tomorrowStr = ymd(tomorrow)
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)

    // Tomorrow high-impact
    const tHigh = events.filter(e => e.date === tomorrowStr && e.impact === 'high')
    for (const e of tHigh) {
      out.push({ icon: '⚠', color: YELLOW, text: `Tomorrow: ${e.name} at ${e.time || '—'} CT — consider reducing size or standing aside.` })
    }

    // OPEX this week
    const opexThisWeek = events.find(e => e.type === 'opex' && parseYmd(e.date) <= weekEnd && parseYmd(e.date) >= today && !e.tripleWitching)
    if (opexThisWeek) {
      const friLabel = parseYmd(opexThisWeek.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      out.push({ icon: '📅', color: LIME, text: `${opexThisWeek.name} ${friLabel} — elevated gamma, expect pinning near round numbers and increased volatility into close.` })
    }

    // Triple witching this week
    const tw = events.find(e => e.type === 'opex' && e.tripleWitching && parseYmd(e.date) <= weekEnd && parseYmd(e.date) >= today)
    if (tw) {
      out.push({ icon: '🔥', color: ORANGE, text: `TRIPLE WITCHING ${parseYmd(tw.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} — highest volatility week of the quarter. Wider stops, smaller size all week.` })
    }

    // FOMC this week
    const fomc = events.find(e => e.type === 'fomc' && parseYmd(e.date) <= weekEnd && parseYmd(e.date) >= today)
    if (fomc) {
      out.push({ icon: '🏦', color: ORANGE, text: `FOMC decision ${parseYmd(fomc.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at 1:00 CT — markets may be quiet before, explosive after. No new positions within 30 min of announcement.` })
    }

    // Earnings on tracked tickers this week
    const earningsThisWeek = events.filter(e => e.type === 'earnings' && parseYmd(e.date) <= weekEnd && parseYmd(e.date) >= today)
    for (const e of earningsThisWeek) {
      out.push({ icon: '🚨', color: BLUE, text: `${e.ticker} reports ${e.bmo || ''} ${parseYmd(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — do not hold options overnight. IV will spike then crush immediately after.` })
    }

    return out
  }, [events])

  if (!warnings.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {warnings.map((w, i) => (
        <div key={i} style={{ background: `${w.color}11`, border: `1px solid ${w.color}44`, borderRadius: 4, padding: '11px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.2 }}>{w.icon}</span>
          <span style={{ fontSize: 12, fontFamily: MONO, color: w.color, lineHeight: 1.55 }}>{w.text}</span>
        </div>
      ))}
    </div>
  )
}

function OpexEducation({ onDismiss }) {
  return (
    <div style={{ background: '#0a0d12', border: `1px solid ${BLUE}33`, borderRadius: 5, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SLabel style={{ marginBottom: 0 }}>What is OPEX?</SLabel>
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em' }}>DISMISS ✕</button>
      </div>
      <div style={{ fontSize: 11, fontFamily: MONO, color: '#888', lineHeight: 1.8 }}>
        Options Expiration (OPEX) occurs every Friday. <strong style={{ color: '#aaa' }}>Weekly OPEX</strong> affects 0DTE options directly — your contracts expire today.
        <br /><br />
        <strong style={{ color: '#aaa' }}>Monthly OPEX</strong> (3rd Friday) is larger — more contracts expire, more hedging activity, higher volatility.
        <br /><br />
        <strong style={{ color: ORANGE }}>Triple Witching</strong> (quarterly) = stocks, index futures, AND options all expire simultaneously. Highest volume and most volatile day of the quarter.
        <br /><br />
        <strong style={{ color: LIME }}>OPEX Pinning</strong>: market makers hedge by keeping price near high open interest strikes. Price often gets "pinned" near a round number on OPEX Friday.
      </div>
    </div>
  )
}

// ── Sector Rotation view ─────────────────────────────────────────────────────

function SectorHeatTile({ row, onClick }) {
  const c = tierColor(row.tier)
  const isStrong = row.tier === 'strong-in' || row.tier === 'strong-out'
  const bg = row.tier === 'strong-in' ? '#0a1408' : row.tier === 'mod-in' ? '#0a0e08' : row.tier === 'strong-out' ? '#150505' : row.tier === 'mod-out' ? '#110808' : '#0a0a0a'
  const todayPct = row.metrics?.todayChangePct
  return (
    <div onClick={onClick} style={{ background: bg, border: `1px solid ${c}55`, borderRadius: 4, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', minHeight: 86 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 900, color: '#e8e8e8', letterSpacing: '0.04em' }}>{row.short}</span>
        <span style={{ fontSize: 9, fontFamily: MONO, color: '#555' }}>{row.etf}</span>
      </div>
      <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: todayPct == null ? '#666' : todayPct >= 0 ? LIME : RED }}>
        {todayPct == null ? '—' : `${todayPct >= 0 ? '+' : ''}${todayPct.toFixed(2)}%`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontFamily: MONO, color: c, fontWeight: 700, letterSpacing: '0.08em' }}>{trendArrow(row.metrics?.fiveDayReturn)}</span>
        <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 900, color: c }}>{row.score >= 0 ? '+' : ''}{row.score}</span>
      </div>
    </div>
  )
}

function SectorRotationView({ apiKey }) {
  const [data, setData] = useState(() => {
    const cached = readSectorCache()
    return cached?.rows ? cached : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const snap = await getRotationSnapshot()
      setData(snap)
      writeSectorCache(snap)
    } catch (e) {
      setError(e.message || 'Sector fetch failed')
    }
    setLoading(false)
  }

  useEffect(() => {
    // Skip the immediate fetch if we already loaded fresh cached data
    if (!data || (Date.now() - (data.fetchedAt || 0)) > 30 * 60 * 1000) load()
    // Auto-refresh every 30 min during weekday market hours (8:30-15:00 CT)
    const id = setInterval(() => {
      const day = new Date().getDay()
      if (day === 0 || day === 6) return
      const h = new Date().getHours()
      if (h >= 8 && h < 15) load()
    }, 30 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  const isWeekend = (() => { const d = new Date().getDay(); return d === 0 || d === 6 })()
  const top = data?.rows?.slice(0, 2) || []
  const bottom = data?.rows ? [...data.rows].slice(-2).reverse() : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <SLabel style={{ marginBottom: 0 }}>Sector Rotation Heat Map</SLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {data?.fetchedAt && (
            <span style={{ fontSize: 10, fontFamily: MONO, color: '#444' }}>
              {isWeekend ? 'Weekend — showing Friday close · ' : ''}Updated {new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Btn small variant="ghost" onClick={load} disabled={loading || !apiKey}>{loading ? 'Refreshing...' : 'Refresh'}</Btn>
        </div>
      </div>

      {error && <div style={{ background: '#150505', border: `1px solid ${RED}55`, borderRadius: 4, padding: '12px 16px', fontSize: 11, fontFamily: MONO, color: RED }}>{error}</div>}

      {data?.rows?.length ? (
        <>
          {/* 4×3 heat map (11 sectors + last cell shows SPY benchmark) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {data.rows.map(r => <SectorHeatTile key={r.etf} row={r} onClick={() => {}} />)}
            {data.spy && (() => {
              const pct = data.spy.todayChangePct
              const c = pct == null ? '#666' : pct >= 0 ? LIME : RED
              return (
                <div style={{ background: '#0a0a0a', border: '1px solid #1a2a1a', borderRadius: 4, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 86 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 900, color: '#aaa', letterSpacing: '0.04em' }}>SPY</span>
                    <span style={{ fontSize: 9, fontFamily: MONO, color: '#444' }}>BENCH</span>
                  </div>
                  <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: c }}>{pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: '#444' }}>5d {data.spy.fiveDayReturn != null ? `${data.spy.fiveDayReturn >= 0 ? '+' : ''}${data.spy.fiveDayReturn.toFixed(1)}%` : '—'}</div>
                </div>
              )
            })()}
          </div>

          {/* Ranked table */}
          <div style={{ background: '#090909', border: `1px solid ${BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 60px 70px 70px 80px 60px 60px 80px', gap: 8, padding: '9px 14px', borderBottom: '1px solid #111', background: '#0a0a0a' }}>
              {['Sector', 'ETF', 'Today', '5-Day', 'RS / SPY', 'RVOL', 'Score', 'Flow'].map(h => <span key={h} style={{ fontSize: 9, letterSpacing: '0.1em', color: '#333', textTransform: 'uppercase', fontFamily: MONO }}>{h}</span>)}
            </div>
            {data.rows.map(r => {
              const m = r.metrics
              const c = tierColor(r.tier)
              return (
                <div key={r.etf} style={{ display: 'grid', gridTemplateColumns: '1.4fr 60px 70px 70px 80px 60px 60px 80px', gap: 8, padding: '10px 14px', alignItems: 'center', fontFamily: MONO, fontSize: 11, borderBottom: '1px solid #0d0d0d', borderLeft: `3px solid ${c}` }}>
                  <span style={{ color: '#e8e8e8', fontWeight: 700 }}>{r.name}</span>
                  <span style={{ color: '#888' }}>{r.etf}</span>
                  <span style={{ color: m?.todayChangePct == null ? '#444' : m.todayChangePct >= 0 ? LIME : RED, fontWeight: 700 }}>{m?.todayChangePct == null ? '—' : `${m.todayChangePct >= 0 ? '+' : ''}${m.todayChangePct.toFixed(2)}%`}</span>
                  <span style={{ color: m?.fiveDayReturn == null ? '#444' : m.fiveDayReturn >= 0 ? LIME : RED }}>{m?.fiveDayReturn == null ? '—' : `${m.fiveDayReturn >= 0 ? '+' : ''}${m.fiveDayReturn.toFixed(1)}%`}</span>
                  <span style={{ color: m?.rsToday == null ? '#444' : m.rsToday > 1 ? LIME : RED }}>{m?.rsToday == null ? '—' : m.rsToday.toFixed(2)}</span>
                  <span style={{ color: m?.rvol == null ? '#444' : m.rvol > 1.5 ? LIME : m.rvol > 1 ? YELLOW : '#888' }}>{m?.rvol == null ? '—' : `${m.rvol.toFixed(2)}x`}</span>
                  <span style={{ color: c, fontWeight: 900 }}>{r.score >= 0 ? '+' : ''}{r.score}</span>
                  <span style={{ color: c, fontWeight: 700, letterSpacing: '0.08em' }}>{r.arrow}</span>
                </div>
              )
            })}
          </div>

          {/* Rotation intelligence */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SLabel style={{ marginBottom: 0 }}>Rotation Intelligence</SLabel>
            {top.length === 2 && (
              <div style={{ fontSize: 11, fontFamily: MONO, color: LIME, lineHeight: 1.7 }}>
                <strong style={{ color: LIME }}>MONEY FLOWING INTO:</strong> {top.map(t => t.name).join(', ')}<br />
                <span style={{ color: '#7a9a6a' }}>Bias: long setups have tailwind in these names. Tickers: {SECTORS.filter(s => top.map(t => t.etf).includes(s.etf)).map(s => s.etf).join(', ')}.</span>
              </div>
            )}
            {bottom.length === 2 && bottom[0].score < 0 && (
              <div style={{ fontSize: 11, fontFamily: MONO, color: RED, lineHeight: 1.7 }}>
                <strong style={{ color: RED }}>MONEY FLOWING OUT OF:</strong> {bottom.map(t => t.name).join(', ')}<br />
                <span style={{ color: '#9a6a6a' }}>Bias: put setups favored. Check Short Thesis tab for candidates.</span>
              </div>
            )}
          </div>
        </>
      ) : (
        !loading && !error && (
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#444', padding: '20px 0' }}>No data loaded yet.</div>
        )
      )}
    </div>
  )
}

// ── Calendar root ────────────────────────────────────────────────────────────

export default function CalendarTab({ putTheses = {}, apiKey }) {
  const [topTab, setTopTab] = useState('rotation')
  const [view, setView] = useState('week')
  const [selectedDate, setSelectedDate] = useState(null)
  const [edu, setEdu] = useLocalStorage('th-opex-edu-dismissed', false)
  const [nasdaqEarnings, setNasdaqEarnings] = useState([])
  const [nasdaqStatus, setNasdaqStatus] = useState('idle') // idle | loading | ok | empty | error
  const [nasdaqError, setNasdaqError] = useState('')

  const baseEvents = useMemo(() => getAllEvents(new Date(), 14), [])

  // Live earnings fetch via /api/calendar-earnings (same-origin Vercel proxy).
  // The proxy bypasses CORS; we treat a total failure as 'error' (not silent
  // fallback) and an empty rowset across all dates as 'empty'.
  useEffect(() => {
    let alive = true
    async function load() {
      setNasdaqStatus('loading')
      setNasdaqError('')
      const dates = []
      const start = new Date()
      for (let i = 0; i < 14; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i)
        if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(ymd(d))
      }
      const results = await Promise.allSettled(dates.map(d => fetchNasdaqEarnings(d)))
      if (!alive) return
      const successes = results.filter(r => r.status === 'fulfilled' && !r.value?.error)
      const failures = results.filter(r => r.status === 'rejected' || r.value?.error)
      const flat = successes.flatMap(r => r.value.rows || [])
      if (successes.length === 0) {
        const firstErr = failures[0]?.value?.error || failures[0]?.reason?.message || 'proxy unreachable'
        setNasdaqError(firstErr)
        setNasdaqStatus('error')
        setNasdaqEarnings([])
      } else if (flat.length === 0) {
        setNasdaqStatus('empty')
        setNasdaqEarnings([])
      } else {
        setNasdaqEarnings(flat)
        setNasdaqStatus('ok')
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // Merge live Nasdaq earnings with the rest of the calendar (no hardcoded
  // earnings to dedupe against any more).
  const events = useMemo(() => {
    if (!nasdaqEarnings.length) return baseEvents
    const merged = [...baseEvents, ...nasdaqEarnings]
    merged.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.time || '').localeCompare(b.time || ''))
    return merged
  }, [baseEvents, nasdaqEarnings])

  const dayDetail = selectedDate ? eventsOn(events, selectedDate) : []

  const earningsOnly = events.filter(e => e.type === 'earnings')
  const TOP_TABS = [
    { id: 'rotation', label: 'ROTATION' },
    { id: 'events', label: 'EVENTS' },
    { id: 'earnings', label: 'EARNINGS' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div><SLabel>Events & Catalysts</SLabel><Heading>Calendar</Heading></div>
      </div>

      {/* Top-level sub-tab switcher */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #161616' }}>
        {TOP_TABS.map(t => {
          const active = topTab === t.id
          return (
            <button key={t.id} onClick={() => setTopTab(t.id)} style={{
              background: 'transparent', border: 'none',
              borderBottom: active ? `2px solid ${LIME}` : '2px solid transparent',
              color: active ? LIME : '#555',
              fontFamily: MONO, fontSize: 11, fontWeight: active ? 700 : 500,
              letterSpacing: '0.18em', padding: '10px 18px', cursor: 'pointer',
              marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
            }}>{t.label}</button>
          )
        })}
      </div>

      {/* ── ROTATION sub-tab ─────────────────────────────────────────────── */}
      {topTab === 'rotation' && <SectorRotationView apiKey={apiKey} />}

      {/* ── EARNINGS sub-tab ─────────────────────────────────────────────── */}
      {topTab === 'earnings' && (
        earningsOnly.length === 0
          ? <div style={{ fontSize: 11, fontFamily: MONO, color: '#444', padding: '20px 0' }}>No earnings in the next 14 days.</div>
          : <ListView events={earningsOnly} />
      )}

      {/* ── EVENTS sub-tab ───────────────────────────────────────────────── */}
      {topTab === 'events' && (<>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
        {VIEWS.map(v => <Pill key={v.id} label={v.label} active={view === v.id} onClick={() => setView(v.id)} />)}
      </div>

      <SmartWarnings events={events} />

      {/* Put thesis earnings flags */}
      {(() => {
        const thesisTickers = Object.keys(putTheses || {})
        if (!thesisTickers.length) return null
        const flagged = events.filter(e => e.type === 'earnings' && thesisTickers.includes(e.ticker?.toUpperCase()))
        if (!flagged.length) return null
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flagged.map((e, i) => (
              <div key={i} style={{ background: '#150505', border: `1px solid ${RED}55`, borderRadius: 4, padding: '10px 14px', fontSize: 11, fontFamily: MONO, color: '#cc7a7a', lineHeight: 1.55 }}>
                ⚠ <strong style={{ color: RED }}>{e.ticker}</strong> earnings {parseYmd(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} {e.bmo || ''} — active put thesis. IV spike incoming. Buy puts BEFORE if thesis confirmed.
              </div>
            ))}
          </div>
        )
      })()}

      {!edu && <OpexEducation onDismiss={() => setEdu(true)} />}

      {nasdaqStatus === 'error' && (
        <div style={{ fontSize: 10, fontFamily: MONO, color: YELLOW, background: '#1a1208', border: `1px solid ${YELLOW}44`, borderRadius: 4, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>Earnings feed unavailable: {nasdaqError || 'proxy error'}. Other calendar events still shown. Tracking: {MAJOR_TICKERS.join(', ')}.</span>
          <Btn small variant="ghost" onClick={() => { setNasdaqStatus('idle'); setTimeout(() => window.location.reload(), 0) }}>Retry</Btn>
        </div>
      )}
      {nasdaqStatus === 'empty' && (
        <div style={{ fontSize: 10, fontFamily: MONO, color: '#666', background: '#0c0c0c', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '8px 12px' }}>
          No tracked-ticker earnings in the next 14 days. Tracking: {MAJOR_TICKERS.join(', ')}.
        </div>
      )}

      {view === 'week' && <WeekView events={events} />}
      {view === 'list' && <ListView events={events} />}
      {view === 'month' && (
        <>
          <MonthView events={events} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          {selectedDate && dayDetail.length > 0 && (
            <Card>
              <SLabel>{fmtDateLong(parseYmd(selectedDate))}</SLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayDetail.map((e, i) => {
                  const color = colorForEvent(e)
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px', gap: 10, padding: '8px 12px', background: '#0a0a0a', border: `1px solid ${color}33`, borderRadius: 3 }}>
                      <span style={{ fontSize: 11, fontFamily: MONO, color: '#aaa' }}>{e.time || '—'} CT</span>
                      <span style={{ fontSize: 12, fontFamily: MONO, color: '#e8e8e8' }}>{e.name}</span>
                      <span style={{ fontSize: 10, fontFamily: MONO, color, textAlign: 'right', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{e.type}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </>
      )}
      </>)}
    </div>
  )
}
