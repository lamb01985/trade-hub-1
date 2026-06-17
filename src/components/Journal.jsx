import { useState, useEffect, useMemo } from 'react'
import { useLocalStorage } from '../hooks/useStore.js'
import { Card, SLabel, Heading, Btn, Pill } from './ui.jsx'
import { LIME, RED, YELLOW, ORANGE, MONO, BORDER, PANEL, todayStr, localDateStr, f2, fmtD, fmtU } from '../constants.js'
import { ordersToTrades, SCHWAB_BLUE } from '../lib/schwabClient.js'

function fmtTime(date) {
  if (!date) return '—'
  const d = new Date(date)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function minutesAgo(dateIso) {
  if (!dateIso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(dateIso).getTime()) / 60000))
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildCsv(trades, gradeByDate) {
  const head = ['Trade Date', 'Time', 'Ticker', 'Strike', 'Expiry', 'Type', 'Contracts', 'Entry', 'Exit', 'P&L', 'R:R', 'Setup', 'Notes', 'Grade']
  const rows = trades.map(t => {
    const day = t.tradeDate || t.date?.slice(0, 10) || ''
    return [
      day,
      t.entryTime || (t.date ? fmtTime(t.date) : ''),
      t.ticker || '',
      t.strike != null ? t.strike : '',
      t.expiry || '',
      (t.optType || '').toUpperCase(),
      t.contracts || 1,
      t.entry != null ? f2(t.entry) : '',
      t.exitPrice != null ? f2(t.exitPrice) : '',
      t.pnl != null ? t.pnl.toFixed(2) : '',
      t.rr != null ? t.rr.toFixed(2) : '',
      t.setupType || '',
      (t.notes || '').replace(/[,\n\r]/g, ' '),
      gradeByDate[day] || '',
    ]
  })
  return [head, ...rows].map(r => r.map(c => {
    const s = String(c == null ? '' : c)
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
}

// ── Open Trade Card ──────────────────────────────────────────────────────────

function OpenTradeCard({ trade, onUpdateCurrent, onCloseTrade, onEdit }) {
  const [priceInput, setPriceInput] = useState(trade.currentPrice != null ? String(trade.currentPrice) : '')
  useEffect(() => { setPriceInput(trade.currentPrice != null ? String(trade.currentPrice) : '') }, [trade.currentPrice])

  const current = parseFloat(priceInput)
  const hasCurrent = !isNaN(current) && current > 0
  const contracts = trade.contracts || 1
  const livePnl = hasCurrent ? (current - trade.entry) * contracts * 100 : null
  const pctMove = hasCurrent ? ((current - trade.entry) / trade.entry) * 100 : null
  const mins = minutesAgo(trade.date)
  const stopHit = hasCurrent && trade.stop != null && current <= trade.stop
  const targetReached = hasCurrent && trade.target != null && current >= trade.target

  const stop = trade.stop, target = trade.target
  const range = stop != null && target != null && target > stop ? target - stop : null
  const pos = range && hasCurrent ? Math.max(0, Math.min(1, (current - stop) / range)) : null

  const borderC = stopHit ? RED : targetReached ? LIME : '#1e2a1e'
  const bgC = stopHit ? '#150505' : targetReached ? '#0a1408' : '#0a0d08'

  return (
    <div style={{ background: bgC, border: `1.5px solid ${borderC}`, borderRadius: 6, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, animation: stopHit || targetReached ? 'hdrpulse 1.5s infinite' : 'none' }}>
      {(stopHit || targetReached) && (
        <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 900, color: stopHit ? RED : LIME, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {stopHit ? '⚠ STOP HIT — EXIT NOW' : '🎯 TARGET REACHED'}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 900, color: '#e8e8e8', letterSpacing: '0.04em' }}>
            {trade.ticker} {trade.strike ? `$${trade.strike}` : ''} {(trade.optType || '').toUpperCase()}
          </div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#555', marginTop: 3 }}>
            Exp {trade.expiry || '—'} · Entry {fmtTime(trade.date)} CT · {mins} min ago · {trade.contracts || 1}c
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontFamily: MONO, fontWeight: 900, color: livePnl == null ? '#444' : livePnl >= 0 ? LIME : RED, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {livePnl == null ? '— P&L' : fmtD(livePnl)}
          </div>
          {pctMove != null && (
            <div style={{ fontSize: 10, fontFamily: MONO, color: pctMove >= 0 ? LIME : RED, marginTop: 4 }}>
              {pctMove >= 0 ? '+' : ''}{pctMove.toFixed(1)}% from entry
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontFamily: MONO, fontSize: 11 }}>
        <div><span style={{ color: '#555' }}>Entry</span> <strong style={{ color: '#e8e8e8' }}>${f2(trade.entry)}</strong></div>
        <div><span style={{ color: '#555' }}>Stop</span> <strong style={{ color: RED }}>${f2(stop)}</strong></div>
        <div><span style={{ color: '#555' }}>Target</span> <strong style={{ color: LIME }}>${f2(target)}</strong></div>
      </div>

      {range && (
        <div>
          <div style={{ position: 'relative', height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: `linear-gradient(to right, ${RED}33 0%, #1a1a1a 50%, ${LIME}33 100%)` }} />
            {pos != null && (
              <div style={{ position: 'absolute', left: `${pos * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, borderRadius: '50%', background: livePnl >= 0 ? LIME : RED, boxShadow: `0 0 6px ${livePnl >= 0 ? LIME : RED}88` }} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#444', fontFamily: MONO, marginTop: 4 }}>
            <span>STOP ${f2(stop)}</span><span>TARGET ${f2(target)}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number" step="0.01" value={priceInput}
          onChange={e => setPriceInput(e.target.value)}
          placeholder="Current $"
          style={{ flex: 1, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#e8e8e8', fontFamily: MONO, fontSize: 13, padding: '9px 12px', outline: 'none' }}
        />
        <button onClick={() => onUpdateCurrent(trade.id, parseFloat(priceInput))} style={{ background: '#1a1a1a', border: `1px solid ${BORDER}`, color: '#aaa', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: '9px 12px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>UPDATE</button>
        <button onClick={() => onCloseTrade(trade)} style={{ background: LIME, border: 'none', color: '#000', fontFamily: MONO, fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', padding: '9px 14px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>CLOSE →</button>
        <button onClick={() => onEdit(trade)} title="Edit" style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#888', padding: '8px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: MONO, fontSize: 12 }}>✎</button>
      </div>
    </div>
  )
}

// ── Closed Trade Row ─────────────────────────────────────────────────────────

function TradeRow({ trade, onUpdate, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const [whatWell, setWhatWell] = useState(trade.whatWell || '')
  const [whatImprove, setWhatImprove] = useState(trade.whatImprove || '')
  const [notes, setNotes] = useState(trade.notes || '')

  function saveExpanded() {
    onUpdate({ ...trade, whatWell, whatImprove, notes })
    setOpen(false)
  }

  const sideColor = trade.status === 'win' ? LIME : trade.status === 'loss' ? RED : '#555'
  const time = trade.entryTime || (trade.date ? fmtTime(trade.date) : '—')
  const tradeDate = trade.tradeDate || trade.date?.slice(0, 10) || ''
  const dateLabel = tradeDate === localDateStr()
    ? 'Today'
    : tradeDate ? `${tradeDate.slice(5, 7)}/${tradeDate.slice(8, 10)}` : '—'

  return (
    <div style={{ borderLeft: `3px solid ${sideColor}`, background: '#0a0a0a', borderBottom: '1px solid #111' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: '50px 50px 56px 56px 50px 50px 70px 70px 78px 60px 1fr 30px', gap: 8, padding: '10px 14px', cursor: 'pointer', alignItems: 'center', fontFamily: MONO, fontSize: 11 }}>
        <span style={{ color: '#666' }}>{time}</span>
        <span style={{ color: '#888' }} title={tradeDate}>{dateLabel}</span>
        <span style={{ color: LIME, fontWeight: 700 }}>{trade.ticker || '—'}</span>
        <span style={{ color: '#666' }}>{trade.strike ? `$${trade.strike}` : '—'}</span>
        <span style={{ color: trade.optType === 'call' ? LIME : trade.optType === 'put' ? RED : '#666', fontWeight: 700, fontSize: 10 }}>{(trade.optType || '—').toUpperCase()}</span>
        <span style={{ color: trade.dte == null ? '#444' : trade.dte === 0 ? YELLOW : trade.dte >= 3 ? '#60A5FA' : '#aaa', fontSize: 10, fontWeight: 700 }}>{trade.dte != null ? `${trade.dte}DTE` : '—'}</span>
        <span style={{ color: '#aaa' }}>${f2(trade.entry)}</span>
        <span style={{ color: '#aaa' }}>{trade.exitPrice != null ? `$${f2(trade.exitPrice)}` : '—'}</span>
        <span style={{ color: trade.pnl != null ? (trade.pnl >= 0 ? LIME : RED) : '#666', fontWeight: 700 }}>{trade.pnl != null ? fmtD(trade.pnl) : '—'}</span>
        <span style={{ color: '#666', fontSize: 10 }}>{trade.rr ? `1:${f2(trade.rr)}` : '—'}</span>
        <span style={{ color: '#555', fontSize: 10, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
          {trade.paper && <span title="Bot coach paper trade" style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 2, background: '#1d1230', color: '#C084FC', fontSize: 8, fontWeight: 800, letterSpacing: '0.12em' }}>PAPER</span>}
          <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{trade.setupType || '—'}</span>
        </span>
        <button onClick={e => { e.stopPropagation(); onEdit(trade) }} style={{ background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontFamily: MONO, fontSize: 14 }}>✎</button>
      </div>
      {open && (
        <div style={{ background: '#080808', padding: '14px 18px 16px', borderTop: '1px solid #111', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 11, fontFamily: MONO }}>
            <div><div style={{ color: '#444', fontSize: 9, letterSpacing: '0.1em', marginBottom: 3 }}>STOP</div><div style={{ color: RED }}>${f2(trade.stop)}</div></div>
            <div><div style={{ color: '#444', fontSize: 9, letterSpacing: '0.1em', marginBottom: 3 }}>TARGET</div><div style={{ color: LIME }}>${f2(trade.target)}</div></div>
            <div><div style={{ color: '#444', fontSize: 9, letterSpacing: '0.1em', marginBottom: 3 }}>CONTRACTS</div><div style={{ color: '#aaa' }}>{trade.contracts || 1}</div></div>
            <div><div style={{ color: '#444', fontSize: 9, letterSpacing: '0.1em', marginBottom: 3 }}>EXIT TIME</div><div style={{ color: '#aaa' }}>{trade.exitTime || '—'}</div></div>
          </div>

          {/* Holding period — only meaningful on closed multi-bar trades */}
          {trade.date && trade.closedAt && (() => {
            const ms = new Date(trade.closedAt).getTime() - new Date(trade.date).getTime()
            if (ms < 60_000) return null
            const days = Math.floor(ms / 86400000)
            const hours = Math.floor((ms % 86400000) / 3600000)
            const mins = Math.floor((ms % 3600000) / 60000)
            const label = days > 0 ? `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}` : hours > 0 ? `${hours} hour${hours !== 1 ? 's' : ''}, ${mins} min` : `${mins} min`
            return (
              <div style={{ fontSize: 10, fontFamily: MONO, color: '#666' }}>
                <span style={{ color: '#444', letterSpacing: '0.1em' }}>HELD</span> {label}
              </div>
            )
          })()}
          <div>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em', fontFamily: MONO, marginBottom: 4 }}>NOTES</div>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#aaa', fontFamily: MONO, fontSize: 11, padding: '8px 10px', outline: 'none' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: LIME, letterSpacing: '0.1em', fontFamily: MONO, marginBottom: 4 }}>WHAT WENT WELL</div>
              <input type="text" value={whatWell} onChange={e => setWhatWell(e.target.value)} placeholder="One sentence" style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#aaa', fontFamily: MONO, fontSize: 11, padding: '8px 10px', outline: 'none' }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: YELLOW, letterSpacing: '0.1em', fontFamily: MONO, marginBottom: 4 }}>WHAT TO IMPROVE</div>
              <input type="text" value={whatImprove} onChange={e => setWhatImprove(e.target.value)} placeholder="One sentence" style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#aaa', fontFamily: MONO, fontSize: 11, padding: '8px 10px', outline: 'none' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small onClick={saveExpanded}>Save</Btn>
            <Btn small variant="ghost" onClick={() => onEdit(trade)}>Full Edit</Btn>
            <Btn small variant="danger" onClick={() => { if (confirm('Delete this trade?')) onDelete(trade.id) }}>Delete</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Journal component ───────────────────────────────────────────────────

export default function Journal({ trades, onUpdate, onDelete, onEdit, onOpenQuickLog, prep, schwab, onAddTrades }) {
  const [_, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 30000); return () => clearInterval(id) }, [])

  const [period, setPeriod] = useState('today') // today | week | month | all
  const [tickerFilter, setTickerFilter] = useState('all')
  const [setupFilter, setSetupFilter] = useState('all')
  const [resultFilter, setResultFilter] = useState('all')

  const [eodNotes, setEodNotes] = useLocalStorage('th-eod-notes', {})
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState('')
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', msg: '', at: null })

  const schwabConnected = !!schwab?.isConnected

  async function syncFromSchwab() {
    if (!schwabConnected || !onAddTrades) return
    setSyncStatus({ state: 'loading', msg: 'Fetching from Schwab...', at: null })
    try {
      const orders = await schwab.getOrdersToday()
      const newTrades = ordersToTrades(orders, trades)
      if (newTrades.length === 0) {
        setSyncStatus({ state: 'ok', msg: 'No new filled orders to sync.', at: Date.now() })
      } else {
        onAddTrades(newTrades)
        setSyncStatus({ state: 'ok', msg: `Synced ${newTrades.length} new trade${newTrades.length !== 1 ? 's' : ''}.`, at: Date.now() })
      }
    } catch (e) {
      setSyncStatus({ state: 'err', msg: e.message || 'Schwab sync failed', at: Date.now() })
    }
  }

  const today = localDateStr()
  const openTrades = trades.filter(t => t.status === 'open')

  // ── Period filter ──────────────────────────────────────────────────────────
  // ISO week starts Monday. We compare tradeDate strings (YYYY-MM-DD) directly
  // since they sort lexicographically the same as chronologically.
  const periodTrades = useMemo(() => {
    if (period === 'all') return trades
    const tradeDateOf = t => t.tradeDate || t.date?.slice(0, 10) || ''
    if (period === 'today') return trades.filter(t => tradeDateOf(t) === today)
    if (period === 'month') {
      const monthPrefix = today.slice(0, 7)
      return trades.filter(t => tradeDateOf(t).startsWith(monthPrefix))
    }
    if (period === 'week') {
      const d = new Date(today)
      const dow = d.getDay() || 7  // Sun=0 → 7
      d.setDate(d.getDate() - (dow - 1))
      const weekStart = localDateStr(d)
      return trades.filter(t => {
        const td = tradeDateOf(t)
        return td >= weekStart && td <= today
      })
    }
    return trades
  }, [trades, period, today])

  const tickers = useMemo(() => [...new Set(periodTrades.map(t => t.ticker).filter(Boolean))], [periodTrades])
  const setups = useMemo(() => [...new Set(periodTrades.map(t => t.setupType).filter(Boolean))], [periodTrades])

  const filtered = periodTrades.filter(t => {
    if (tickerFilter !== 'all' && t.ticker !== tickerFilter) return false
    if (setupFilter !== 'all' && t.setupType !== setupFilter) return false
    if (resultFilter !== 'all' && t.status !== resultFilter) return false
    return true
  })

  const closedFiltered = filtered.filter(t => t.status !== 'open')
  // Sort by tradeDate desc, then entryTime desc within the same day. Both are
  // string compares (YYYY-MM-DD and HH:MM both sort lexicographically). Trades
  // missing a tradeDate fall back to date.slice(0, 10) so legacy entries still
  // order correctly before migration completes.
  const visibleSorted = useMemo(() => [...closedFiltered].sort((a, b) => {
    const da = a.tradeDate || a.date?.slice(0, 10) || ''
    const db = b.tradeDate || b.date?.slice(0, 10) || ''
    if (da !== db) return db.localeCompare(da)
    const ta = a.entryTime || ''
    const tb = b.entryTime || ''
    return tb.localeCompare(ta)
  }), [closedFiltered])

  // ── Summary stats ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const c = closedFiltered
    const wins = c.filter(t => t.status === 'win')
    const losses = c.filter(t => t.status === 'loss')
    const totalPnl = c.reduce((s, t) => s + (t.pnl || 0), 0)
    const pnls = c.map(t => t.pnl || 0)
    const best = pnls.length ? Math.max(...pnls) : 0
    const worst = pnls.length ? Math.min(...pnls) : 0
    const winRate = wins.length + losses.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : null
    const rrs = c.map(t => t.rr).filter(Boolean)
    const avgRr = rrs.length ? rrs.reduce((s, v) => s + v, 0) / rrs.length : null
    // Best setup
    const bySetup = {}
    for (const t of c) {
      const s = t.setupType || 'Other'
      bySetup[s] = (bySetup[s] || 0) + (t.pnl || 0)
    }
    const bestSetup = Object.entries(bySetup).sort((a, b) => b[1] - a[1])[0] || null
    // Best ticker
    const byTicker = {}
    for (const t of c) {
      const k = t.ticker || '—'
      byTicker[k] = (byTicker[k] || 0) + (t.pnl || 0)
    }
    const bestTicker = Object.entries(byTicker).sort((a, b) => b[1] - a[1])[0] || null
    // Best/worst day
    const byDay = {}
    for (const t of c) {
      const d = t.tradeDate || t.date?.slice(0, 10) || ''
      byDay[d] = (byDay[d] || 0) + (t.pnl || 0)
    }
    const dayEntries = Object.entries(byDay).sort((a, b) => b[1] - a[1])
    const bestDay = dayEntries[0] || null
    const worstDay = dayEntries[dayEntries.length - 1] || null
    return { count: c.length, wins: wins.length, losses: losses.length, totalPnl, best, worst, winRate, avgRr, bestSetup, bestTicker, bestDay, worstDay }
  }, [closedFiltered])

  // ── EOD Coach ──────────────────────────────────────────────────────────────
  const todayTrades = trades.filter(t => (t.tradeDate || t.date?.slice(0, 10)) === today)
  const hasClosedToday = todayTrades.some(t => t.status !== 'open')
  const todayNote = eodNotes[today]

  async function generateCoaching() {
    if (coachLoading) return
    setCoachLoading(true); setCoachError('')
    const tradeList = todayTrades.map((t, i) =>
      `${i + 1}. ${t.ticker} ${(t.optType || '').toUpperCase()} $${t.strike || '?'} ${t.contracts || 1}c — Entry $${f2(t.entry)}, Stop $${f2(t.stop)}, Target $${f2(t.target)} — ${t.status.toUpperCase()} — P&L: ${t.pnl != null ? fmtD(t.pnl) : 'open'} — ${t.setupType || ''} — Notes: ${t.notes || '—'}`
    ).join('\n')
    const prompt = `Review these trades and provide coaching:
${tradeList}

Prep plan was: ${prep?.gamePlan || '(no plan recorded)'}

Evaluate:
1. What the trader executed well (specific)
2. Pattern in any mistakes (entry timing, ignoring levels, not following plan)
3. One specific thing to improve tomorrow
4. Grade: A/B/C/D based on PROCESS quality not P&L. Disciplined loss = B. Undisciplined win = C.

Be direct and specific. No generic advice. Max 150 words total. End with "GRADE: X".`

    try {
      const res = await fetch('/api/ai/eod-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 400 }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.content) {
        const note = data.content
        const grade = note.match(/GRADE:\s*([ABCD])/i)?.[1]?.toUpperCase() || null
        setEodNotes(prev => ({ ...prev, [today]: { note, grade, ts: Date.now(), pnl: summary.totalPnl, trades: summary.count } }))
      } else {
        // Surface server status + Anthropic error type + message verbatim, same
        // format the Prep brief uses. Failure is now debuggable from the banner.
        const parts = []
        const status = data.status || res.status
        if (status) parts.push(`Anthropic ${status}`)
        if (data.type) parts.push(`(${data.type})`)
        parts.push(data.message || data.error || 'Coaching failed')
        setCoachError(parts.join(' '))
      }
    } catch (e) { setCoachError('Network error: ' + e.message) }
    setCoachLoading(false)
  }

  const gradeColor = g => g === 'A' ? LIME : g === 'B' ? YELLOW : g === 'C' ? ORANGE : g === 'D' ? RED : '#555'

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const gradeByDate = Object.fromEntries(Object.entries(eodNotes).map(([d, v]) => [d, v?.grade || '']))
    const csv = buildCsv(filtered, gradeByDate)
    downloadCsv(`trades-${period}-${today}.csv`, csv)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div><SLabel>Real-Time Trade Tracker</SLabel><Heading>Journal</Heading></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {schwabConnected && (
            <button onClick={syncFromSchwab} disabled={syncStatus.state === 'loading'} style={{ background: syncStatus.state === 'loading' ? '#1a1a1a' : SCHWAB_BLUE, color: syncStatus.state === 'loading' ? '#666' : '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: syncStatus.state === 'loading' ? 'not-allowed' : 'pointer' }}>
              {syncStatus.state === 'loading' ? 'Syncing...' : 'Sync from Schwab →'}
            </button>
          )}
          <Btn onClick={() => onOpenQuickLog(null)}>+ New Trade</Btn>
        </div>
      </div>
      {schwabConnected && syncStatus.at && (
        <div style={{ fontSize: 10, fontFamily: MONO, color: syncStatus.state === 'err' ? RED : '#888', padding: '4px 0' }}>
          {syncStatus.msg} <span style={{ color: '#444' }}>· {new Date(syncStatus.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}

      {/* ── OPEN TRADES ─────────────────────────────────────────────────────── */}
      {openTrades.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: LIME, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>● Open Trades · {openTrades.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {openTrades.map(t => (
              <OpenTradeCard
                key={t.id}
                trade={t}
                onUpdateCurrent={(id, price) => onUpdate({ ...t, currentPrice: isNaN(price) ? null : price })}
                onCloseTrade={tr => onEdit(tr)}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── PERIOD + FILTERS ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All Time' },
          ].map(p => <Pill key={p.id} label={p.label} active={period === p.id} onClick={() => setPeriod(p.id)} />)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCsv} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa', fontFamily: MONO, fontSize: 10, padding: '6px 12px', borderRadius: 3, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Export CSV</button>
          <button disabled title="Coming soon, Schwab sync" style={{ background: 'transparent', border: `1px solid #222`, color: '#333', fontFamily: MONO, fontSize: 10, padding: '6px 12px', borderRadius: 3, cursor: 'not-allowed', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Import CSV, soon</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <Pill label="All tickers" active={tickerFilter === 'all'} onClick={() => setTickerFilter('all')} />
          {tickers.map(t => <Pill key={t} label={t} active={tickerFilter === t} onClick={() => setTickerFilter(t)} />)}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['all', 'win', 'loss', 'scratch'].map(r => <Pill key={r} label={r} active={resultFilter === r} onClick={() => setResultFilter(r)} />)}
        </div>
        {setups.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <Pill label="All setups" active={setupFilter === 'all'} onClick={() => setSetupFilter('all')} />
            {setups.map(s => <Pill key={s} label={s} active={setupFilter === s} onClick={() => setSetupFilter(s)} />)}
          </div>
        )}
      </div>

      {/* ── TRADES TABLE ────────────────────────────────────────────────────── */}
      {visibleSorted.length === 0 ? (
        <div style={{ padding: '40px 24px', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5 }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#2a2a2a', marginBottom: 8 }}>No trades for this filter.</div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#1e1e1e', lineHeight: 1.8 }}>Hit the + button to log your first trade. Open trades show at the top of this tab with live P&L.</div>
        </div>
      ) : (
        <div style={{ background: '#090909', border: `1px solid ${BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px 50px 56px 56px 50px 50px 70px 70px 78px 60px 1fr 30px', gap: 8, padding: '9px 14px', borderBottom: '1px solid #111', background: '#0a0a0a' }}>
            {['Time', 'Date', 'Ticker', 'Strike', 'Type', 'DTE', 'Entry', 'Exit', 'P&L', 'R:R', 'Setup', ''].map(h => <span key={h} style={{ fontSize: 9, letterSpacing: '0.1em', color: '#333', textTransform: 'uppercase', fontFamily: MONO }}>{h}</span>)}
          </div>
          {visibleSorted.map(t => <TradeRow key={t.id} trade={t} onUpdate={onUpdate} onEdit={onEdit} onDelete={onDelete} />)}
        </div>
      )}

      {/* ── SUMMARY BAR ─────────────────────────────────────────────────────── */}
      {closedFiltered.length > 0 && (
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, fontFamily: MONO }}>
          {[
            { l: 'Trades', v: summary.count, c: '#e8e8e8' },
            { l: 'Wins', v: summary.wins, c: LIME },
            { l: 'Losses', v: summary.losses, c: RED },
            { l: 'Win Rate', v: summary.winRate != null ? `${Math.round(summary.winRate)}%` : '—', c: summary.winRate >= 50 ? LIME : YELLOW },
            { l: 'Total P&L', v: fmtD(summary.totalPnl), c: summary.totalPnl >= 0 ? LIME : RED },
            { l: 'Best', v: summary.best ? fmtD(summary.best) : '—', c: LIME },
            { l: 'Worst', v: summary.worst ? fmtD(summary.worst) : '—', c: RED },
            { l: 'Avg R:R', v: summary.avgRr ? `1:${f2(summary.avgRr)}` : '—', c: '#aaa' },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{s.l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.v}</div>
            </div>
          ))}
          {(summary.bestSetup || summary.bestTicker) && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #1a1a1a', paddingTop: 10, marginTop: 4, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 11 }}>
              {summary.bestSetup && <span style={{ color: '#666' }}>Best setup: <strong style={{ color: '#aaa' }}>{summary.bestSetup[0]}</strong> ({fmtD(summary.bestSetup[1])})</span>}
              {summary.bestTicker && <span style={{ color: '#666' }}>Best ticker: <strong style={{ color: '#aaa' }}>{summary.bestTicker[0]}</strong> ({fmtD(summary.bestTicker[1])})</span>}
              {summary.bestDay && <span style={{ color: '#666' }}>Best day: <strong style={{ color: LIME }}>{fmtD(summary.bestDay[1])}</strong></span>}
              {summary.worstDay && summary.worstDay[1] < 0 && <span style={{ color: '#666' }}>Worst day: <strong style={{ color: RED }}>{fmtD(summary.worstDay[1])}</strong></span>}
            </div>
          )}
        </div>
      )}

      {/* ── EOD COACH ───────────────────────────────────────────────────────── */}
      {hasClosedToday && (
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '16px 20px' }}>
          {todayNote ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <SLabel style={{ marginBottom: 0 }}>EOD Coach</SLabel>
                  {todayNote.grade && (
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: gradeColor(todayNote.grade), border: `1px solid ${gradeColor(todayNote.grade)}55`, borderRadius: 4, padding: '2px 14px', lineHeight: 1.3 }}>{todayNote.grade}</div>
                  )}
                </div>
                <Btn small variant="ghost" onClick={generateCoaching} disabled={coachLoading}>{coachLoading ? 'Coaching...' : 'Regenerate'}</Btn>
              </div>
              <pre style={{ fontFamily: MONO, fontSize: 11, color: '#888', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{todayNote.note}</pre>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', fontFamily: MONO, marginBottom: 4 }}>EOD Coach</div>
                <div style={{ fontSize: 11, color: '#555', fontFamily: MONO }}>
                  {todayTrades.length} trade{todayTrades.length !== 1 ? 's' : ''} today. Get Claude's coaching and discipline grade.
                </div>
              </div>
              <Btn small variant="lime" onClick={generateCoaching} disabled={coachLoading}>{coachLoading ? '✦ Coaching...' : '✦ EOD Coach'}</Btn>
            </div>
          )}
          {coachError && <div style={{ fontSize: 10, color: RED, fontFamily: MONO, marginTop: 10 }}>{coachError}</div>}
        </div>
      )}
    </div>
  )
}
