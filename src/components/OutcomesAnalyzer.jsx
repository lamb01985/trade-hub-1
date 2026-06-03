// ─────────────────────────────────────────────────────────────────────────────
// OutcomesAnalyzer.jsx — retroactive analysis of active + archived setups.
//
// For each setup, compares the backtest cadence + stats against the live
// triggered-events stream to surface:
//   - Setups that are firing way more (or way less) than backtest expectations,
//     a proxy for "regime has shifted" before P&L outcomes are wired
//   - The weekly trigger histogram per setup
//   - The backtest stat summary
//
// Bottom actions:
//   - Refresh all backtests: serial backtestSetup over every active setup,
//     showing progress, persisting each result.
//   - Find degradation: currently shows the candidates whose live cadence
//     deviates >50% from backtest cadence; the win-rate comparison is
//     stubbed until trade-outcome logging lands.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK } from '../constants.js'
import { backtestSetup } from '../lib/setupBacktest.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function weeklyHistogram(events, weeks = 12) {
  const bins = new Array(weeks).fill(0)
  const now = Date.now()
  for (const ev of events || []) {
    if (!ev?.triggeredAt) continue
    const ageWeeks = Math.floor((now - ev.triggeredAt) / WEEK_MS)
    if (ageWeeks < 0 || ageWeeks >= weeks) continue
    bins[weeks - 1 - ageWeeks] += 1
  }
  return bins
}

function HistogramBar({ values, width = 220, height = 28 }) {
  const max = Math.max(1, ...values)
  const barW = width / values.length
  const gap = Math.max(0.5, barW * 0.15)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2))
        return (
          <rect
            key={i}
            x={i * barW + gap / 2}
            y={height - h}
            width={Math.max(1, barW - gap)}
            height={h}
            fill={v > 0 ? LIME : '#333'}
          />
        )
      })}
    </svg>
  )
}

// Crude degradation classifier. Compares live cadence (triggers per week
// observed since setup creation, capped at 12 weeks) to the backtest
// cadence (backtest.triggers / 52 weeks, since backtest spans ~252 days).
function classifyCadence(setup) {
  const events = setup.triggeredEvents || []
  const bt = setup.backtest
  if (!bt || !bt.triggers) return { status: 'unknown', reason: 'No backtest yet' }
  if (events.length === 0) {
    return { status: 'unknown', reason: 'No live triggers yet' }
  }
  const earliest = Math.min(...events.map(e => e.triggeredAt || Date.now()))
  const lifetimeWeeks = Math.max(1, (Date.now() - earliest) / WEEK_MS)
  const liveTrigPerWeek = events.length / lifetimeWeeks
  const btTrigPerWeek = bt.triggers / 52
  if (btTrigPerWeek <= 0) return { status: 'unknown', reason: 'Backtest cadence zero' }
  const ratio = liveTrigPerWeek / btTrigPerWeek
  if (ratio < 0.5) return { status: 'cold', reason: `Live cadence ${liveTrigPerWeek.toFixed(2)}/wk vs backtest ${btTrigPerWeek.toFixed(2)}/wk` }
  if (ratio > 2) return { status: 'hot', reason: `Live cadence ${liveTrigPerWeek.toFixed(2)}/wk vs backtest ${btTrigPerWeek.toFixed(2)}/wk` }
  return { status: 'inline', reason: `Live cadence ${liveTrigPerWeek.toFixed(2)}/wk vs backtest ${btTrigPerWeek.toFixed(2)}/wk` }
}

function StatusBadge({ status }) {
  const color = status === 'hot' ? YELLOW : status === 'cold' ? RED : status === 'inline' ? LIME : '#94a3b8'
  const label = status === 'hot' ? 'OVERFIRING' : status === 'cold' ? 'UNDERFIRING' : status === 'inline' ? 'IN LINE' : 'UNKNOWN'
  return (
    <span style={{
      fontSize: 9, color, fontFamily: MONO, fontWeight: 700,
      border: `1px solid ${color}55`, padding: '2px 7px', borderRadius: 3,
      letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>{label}</span>
  )
}

function SetupRow({ setup, onJump }) {
  const cad = classifyCadence(setup)
  const events = setup.triggeredEvents || []
  const hist = weeklyHistogram(events, 12)
  const bt = setup.backtest
  return (
    <div style={{
      background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: FG, fontFamily: MONO, fontWeight: 800 }}>{setup.name}</span>
        <span style={{
          fontSize: 9, color: setup.direction === 'short' ? RED : LIME,
          border: `1px solid ${setup.direction === 'short' ? RED : LIME}44`,
          padding: '2px 6px', borderRadius: 3, letterSpacing: '0.14em',
          fontFamily: MONO, textTransform: 'uppercase',
        }}>{setup.direction}</span>
        <span style={{
          fontSize: 9, color: setup.status === 'active' ? LIME : setup.status === 'paused' ? '#94a3b8' : MUTED,
          border: `1px solid ${setup.status === 'active' ? LIME : setup.status === 'paused' ? '#94a3b8' : MUTED}44`,
          padding: '2px 6px', borderRadius: 3, letterSpacing: '0.14em',
          fontFamily: MONO, textTransform: 'uppercase',
        }}>{setup.status || 'active'}</span>
        <StatusBadge status={cad.status} />
        <div style={{ flex: 1 }} />
        <button onClick={() => onJump(setup)} style={{
          background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
          padding: '4px 10px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
          letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Open in Setups →</button>
      </div>

      <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>{cad.reason}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Backtest summary</div>
          {bt ? (
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.7 }}>
              {bt.triggers} triggers · Win rate {((bt.winRate || 0) * 100).toFixed(0)}% · EV {(bt.expectedValue || 0) >= 0 ? '+' : ''}{(bt.expectedValue || 0).toFixed(2)}%<br />
              Avg win +{(bt.avgWin || 0).toFixed(1)}% / loss {(bt.avgLoss || 0).toFixed(1)}% · Sharpe {(bt.sharpe || 0).toFixed(2)}<br />
              <span style={{ color: MUTED, fontSize: 10 }}>Last run {bt.lastRunAt ? new Date(bt.lastRunAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, fontStyle: 'italic' }}>No backtest run yet. Use "Refresh all backtests" below or open the setup to run one.</div>
          )}
        </div>
        <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Live triggers, last 12 weeks</div>
          <HistogramBar values={hist} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUTED, fontFamily: MONO, marginTop: 4 }}>
            <span>{events.length} total triggers</span>
            <span>{hist.reduce((a, b) => a + b, 0)} in window</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Top-level ──────────────────────────────────────────────────────────────

export default function OutcomesAnalyzer({ setups = [], onSetupsChange = null, apiKey = '', onJumpToSetups }) {
  const [refreshing, setRefreshing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null })
  const [error, setError] = useState(null)
  const cacheRef = useRef({})

  const active = useMemo(() => (setups || []).filter(s => s.status !== 'archived'), [setups])

  async function refreshAll() {
    if (!apiKey) { setError('Add a Massive API key in Command first.'); return }
    const targets = active.filter(s => s.status === 'active')
    if (targets.length === 0) { setError('No active setups to refresh.'); return }
    setRefreshing(true); setError(null); setProgress({ done: 0, total: targets.length, current: null })
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i]
      setProgress({ done: i, total: targets.length, current: s.name })
      try {
        const result = await backtestSetup(s, { barsCache: cacheRef.current })
        if (!result?.error) {
          onSetupsChange?.(prev => (prev || []).map(x => x.id === s.id ? { ...x, backtest: result, updatedAt: new Date().toISOString() } : x))
        }
      } catch {}
    }
    setProgress({ done: targets.length, total: targets.length, current: null })
    setRefreshing(false)
  }

  function handleJump(setup) {
    onJumpToSetups?.(setup.id)
  }

  // Degradation pile = setups whose cadence classifier flagged cold or hot
  // AND have a backtest. Helps surface the candidates to review.
  const degraded = useMemo(() => {
    const out = []
    for (const s of active) {
      if (!s.backtest) continue
      const cad = classifyCadence(s)
      if (cad.status === 'cold' || cad.status === 'hot') out.push({ setup: s, cad })
    }
    return out
  }, [active])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Review</div>
          <div style={{ fontSize: 22, color: FG, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Outcomes<span style={{ color: LIME }}>.</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {refreshing && (
            <span style={{ fontSize: 10, color: '#aaa', fontFamily: MONO }}>
              {progress.current ? `Backtesting ${progress.current}` : 'Starting'} ({progress.done}/{progress.total})
            </span>
          )}
          <button onClick={refreshAll} disabled={refreshing || !apiKey} title={!apiKey ? 'Add Massive API key' : ''} style={{
            background: refreshing || !apiKey ? '#1a1a1a' : LIME,
            color: refreshing || !apiKey ? '#666' : '#000',
            border: 'none', padding: '8px 14px', borderRadius: 3,
            fontFamily: MONO, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            cursor: refreshing || !apiKey ? 'not-allowed' : 'pointer',
          }}>{refreshing ? 'Refreshing...' : 'Refresh all backtests'}</button>
        </div>
      </div>

      {error && <div style={{ background: '#150505', border: `1px solid ${RED}55`, color: RED, padding: '8px 12px', borderRadius: 4, fontSize: 11, fontFamily: MONO }}>{error}</div>}

      {/* Degradation summary */}
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Degradation watch</span>
          <span style={{ fontSize: 10, color: degraded.length ? YELLOW : MUTED, fontFamily: MONO }}>
            {degraded.length} {degraded.length === 1 ? 'setup' : 'setups'} flagged
          </span>
        </div>
        {degraded.length === 0 ? (
          <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, lineHeight: 1.6 }}>
            Cadence within 0.5x-2x of backtest for every setup with a backtest. Live win-rate vs backtest win-rate comparison lands once trade-outcome logging is wired.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {degraded.map(({ setup, cad }) => (
              <div key={setup.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#0a0a0a', border: `1px solid ${cad.status === 'cold' ? RED : YELLOW}44`,
                borderRadius: 3, padding: '6px 10px', fontFamily: MONO,
              }}>
                <span style={{ fontSize: 11, color: FG, fontWeight: 700 }}>{setup.name}</span>
                <StatusBadge status={cad.status} />
                <span style={{ fontSize: 10, color: MUTED, flex: 1 }}>{cad.reason}</span>
                <button onClick={() => handleJump(setup)} style={{
                  background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
                  padding: '3px 8px', borderRadius: 3, fontFamily: MONO, fontSize: 9,
                  letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
                }}>Review</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {active.length === 0 ? (
        <div style={{ background: PANEL, border: `1px dashed ${BORDER}`, borderRadius: 5, padding: 28, textAlign: 'center', color: MUTED, fontSize: 11, fontFamily: MONO }}>
          No active or paused setups. Create one in Plan / Setups to see analysis here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.map(s => (
            <SetupRow key={s.id} setup={s} onJump={handleJump} />
          ))}
        </div>
      )}
    </div>
  )
}
