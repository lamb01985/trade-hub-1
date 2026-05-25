// ─────────────────────────────────────────────────────────────────────────────
// BacktestResults.jsx — UI for a single setup's backtest output.
//
// Displays the 8-stat summary (Triggers / Win rate / Avg win / Avg loss /
// EV per trade / Max DD / Sharpe / Last run), a small inline SVG equity
// curve (cumulative pnlPct units), and a collapsible per-trade table.
//
// Pure presentation. Receives a backtest record (the object the engine
// writes to setup.backtest) and renders. No fetches, no engine calls.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'

const FG = '#e8e8e8'
const MUTED = '#666'

function Stat({ label, value, color = FG }) {
  return (
    <div style={{ padding: 8, background: '#0a0a0a', borderRadius: 3 }}>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color, fontFamily: MONO, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

// Inline SVG equity curve. Cumulative pnlPct across trades; pure JS math.
function EquityCurve({ trades, width = 280, height = 56 }) {
  const points = useMemo(() => {
    if (!trades?.length) return null
    let equity = 0
    const series = [0]
    for (const t of trades) {
      equity += (t.pnlPct || 0)
      series.push(equity)
    }
    const min = Math.min(...series)
    const max = Math.max(...series)
    const range = max - min || 1
    const stepX = width / Math.max(1, series.length - 1)
    return {
      d: series.map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${(height - ((y - min) / range) * (height - 4) - 2).toFixed(1)}`).join(' '),
      ends: { final: equity, min, max },
      zeroY: range > 0 ? height - ((0 - min) / range) * (height - 4) - 2 : height / 2,
    }
  }, [trades, width, height])
  if (!points) return null
  const ok = points.ends.final >= 0
  return (
    <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3, padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Equity curve (cumulative pnl %)</div>
        <div style={{ fontSize: 10, color: ok ? LIME : RED, fontFamily: MONO, fontWeight: 700 }}>
          {ok ? '+' : ''}{points.ends.final.toFixed(1)}%
        </div>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <line x1="0" y1={points.zeroY} x2={width} y2={points.zeroY} stroke="#222" strokeDasharray="2 2" strokeWidth="0.5" />
        <path d={points.d} fill="none" stroke={ok ? LIME : RED} strokeWidth="1.2" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: MUTED, fontFamily: MONO, marginTop: 4 }}>
        <span>Min {points.ends.min.toFixed(1)}%</span>
        <span>Max {points.ends.max.toFixed(1)}%</span>
      </div>
    </div>
  )
}

// Collapsible per-trade table. Hidden by default to keep the card compact.
function TradeList({ trades }) {
  const [open, setOpen] = useState(false)
  if (!trades?.length) return null
  return (
    <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', background: 'transparent', border: 'none', textAlign: 'left',
        color: '#aaa', fontFamily: MONO, fontSize: 10, padding: '8px 10px',
        letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Trade list · {trades.length}</span>
        <span style={{ color: MUTED, fontSize: 11 }}>{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${BORDER}`, overflowX: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '95px 60px 50px 60px 60px 60px 70px 90px',
            gap: 6,
            padding: '6px 10px',
            background: '#0a0606',
            borderBottom: `1px solid ${BORDER}`,
            fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            <span>Entry</span><span>Ticker</span><span>Type</span><span>Strike</span><span>Entry $</span><span>Exit $</span><span>P/L %</span><span>Reason</span>
          </div>
          {trades.map((t, i) => {
            const c = (t.pnlPct ?? 0) >= 0 ? LIME : RED
            return (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '95px 60px 50px 60px 60px 60px 70px 90px',
                gap: 6,
                padding: '5px 10px',
                fontFamily: MONO, fontSize: 10,
                color: '#aaa',
                borderBottom: i === trades.length - 1 ? 'none' : '1px solid #131313',
              }}>
                <span>{t.entryDate || '—'}</span>
                <span style={{ color: FG, fontWeight: 700 }}>{t.ticker || '—'}</span>
                <span style={{ color: t.optionType === 'put' ? RED : LIME, fontWeight: 700 }}>{(t.optionType || '').toUpperCase()}</span>
                <span>${f2(t.strike)}</span>
                <span>${f2(t.entryPremium)}</span>
                <span>${f2(t.exitPremium)}</span>
                <span style={{ color: c, fontWeight: 700 }}>{(t.pnlPct ?? 0) >= 0 ? '+' : ''}{(t.pnlPct ?? 0).toFixed(1)}%</span>
                <span style={{ color: MUTED, fontSize: 9 }}>{t.exitReason || '—'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function BacktestResults({ result }) {
  if (!result) return null
  const ev = result.expectedValue ?? 0
  const trades = result.triggers ?? 0
  const passed = trades >= 20 && ev > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Stat label="Triggers" value={trades} color={trades >= 20 ? LIME : YELLOW} />
        <Stat label="Win rate" value={`${((result.winRate || 0) * 100).toFixed(0)}%`} color={(result.winRate || 0) >= 0.5 ? LIME : YELLOW} />
        <Stat label="Avg win" value={`+${(result.avgWin || 0).toFixed(1)}%`} color={LIME} />
        <Stat label="Avg loss" value={`${(result.avgLoss || 0).toFixed(1)}%`} color={RED} />
        <Stat label="EV / trade" value={`${ev >= 0 ? '+' : ''}${ev.toFixed(2)}%`} color={ev > 0 ? LIME : RED} />
        <Stat label="Max DD" value={`${(result.maxDrawdown || 0).toFixed(1)}%`} color={YELLOW} />
        <Stat label="Sharpe" value={(result.sharpe || 0).toFixed(2)} color={(result.sharpe || 0) >= 1 ? LIME : '#aaa'} />
        <Stat label="Last run" value={result.lastRunAt ? new Date(result.lastRunAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} color="#aaa" />
      </div>
      <EquityCurve trades={result.trades} />
      <TradeList trades={result.trades} />
      <div style={{
        fontSize: 9, color: passed ? LIME : YELLOW, fontFamily: MONO,
        letterSpacing: '0.08em', padding: '4px 0',
      }}>
        {passed ? '✓ Backtest passes activation gate (>= 20 triggers, positive EV)' : `Gate: needs >= 20 triggers and positive EV (have ${trades} triggers, EV ${ev.toFixed(2)}%)`}
      </div>
    </div>
  )
}
