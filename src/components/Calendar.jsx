import { useMemo, useState, useEffect } from 'react'
import { Card, SLabel, Heading, Pill, Btn } from './ui.jsx'
import { useLocalStorage } from '../hooks/useStore.js'
import { LIME, RED, YELLOW, BLUE, ORANGE, PURPLE, MONO, BORDER, PANEL } from '../constants.js'
import { getAllEvents, eventsOn, ymd, parseYmd, startOfWeek, colorForEvent, fetchNasdaqEarnings, MAJOR_TICKERS } from '../lib/calendar.js'

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

export default function CalendarTab() {
  const [view, setView] = useState('week')
  const [selectedDate, setSelectedDate] = useState(null)
  const [edu, setEdu] = useLocalStorage('th-opex-edu-dismissed', false)
  const [nasdaqEarnings, setNasdaqEarnings] = useState([])
  const [nasdaqStatus, setNasdaqStatus] = useState('idle') // idle | loading | ok | blocked

  const baseEvents = useMemo(() => getAllEvents(new Date(), 14), [])

  // Best-effort Nasdaq earnings fetch — likely CORS blocked from browser
  useEffect(() => {
    let alive = true
    async function load() {
      setNasdaqStatus('loading')
      const dates = []
      const start = new Date()
      for (let i = 0; i < 14; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i)
        if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(ymd(d))
      }
      const results = await Promise.allSettled(dates.map(d => fetchNasdaqEarnings(d)))
      if (!alive) return
      const flat = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      if (flat.length === 0) {
        setNasdaqStatus('blocked')
      } else {
        setNasdaqEarnings(flat)
        setNasdaqStatus('ok')
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // Merge Nasdaq earnings with hardcoded fallback (dedupe by date+ticker)
  const events = useMemo(() => {
    if (!nasdaqEarnings.length) return baseEvents
    const seen = new Set(baseEvents.filter(e => e.type === 'earnings').map(e => `${e.date}-${e.ticker}`))
    const merged = [...baseEvents]
    for (const e of nasdaqEarnings) {
      const key = `${e.date}-${e.ticker}`
      if (!seen.has(key)) { merged.push(e); seen.add(key) }
    }
    merged.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.time || '').localeCompare(b.time || ''))
    return merged
  }, [baseEvents, nasdaqEarnings])

  const dayDetail = selectedDate ? eventsOn(events, selectedDate) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div><SLabel>Events & Catalysts</SLabel><Heading>Calendar</Heading></div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {VIEWS.map(v => <Pill key={v.id} label={v.label} active={view === v.id} onClick={() => setView(v.id)} />)}
        </div>
      </div>

      <SmartWarnings events={events} />

      {!edu && <OpexEducation onDismiss={() => setEdu(true)} />}

      {nasdaqStatus === 'blocked' && (
        <div style={{ fontSize: 10, fontFamily: MONO, color: '#666', background: '#0c0c0c', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '8px 12px' }}>
          Live earnings feed unavailable (CORS blocked from browser). Showing hardcoded major-ticker schedule only. Tracking: {MAJOR_TICKERS.join(', ')}.
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
    </div>
  )
}
