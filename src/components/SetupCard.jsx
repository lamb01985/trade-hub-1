// ─────────────────────────────────────────────────────────────────────────────
// SetupCard.jsx — single-setup card. One row in Setups.jsx's list.
//
// Renders status badge, header (name / direction / counts / backtest score),
// optional triggered banner with staged trade, and an expand panel with
// per-ticker condition status, trade plan, backtest results, and actions.
//
// All mutations go up through callbacks; this component holds only local
// UI state (expand toggle, backtest progress).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { LIME, RED, YELLOW, BLUE, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { CONDITIONS_BY_ID } from '../lib/conditionLibrary.js'
import { computeStagedTrade } from '../lib/setupEngine.js'
import { estimatePremium, computeHV30 } from '../lib/wheelOptions.js'
import { backtestSetup } from '../lib/setupBacktest.js'
import BacktestResults from './BacktestResults.jsx'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

function statusBadgeFor(setup, evaluation) {
  if (setup.status === 'archived') return { color: MUTED, label: 'archived' }
  if (setup.status === 'paused') return { color: '#94a3b8', label: 'paused' }
  const r = evaluation?.bySetup?.[setup.id]
  if (r?.triggered?.length) return { color: RED, label: 'triggered', pulse: true }
  if (r?.approaching?.length) return { color: YELLOW, label: 'approaching' }
  return { color: LIME, label: 'active' }
}

function ConditionPill({ result }) {
  const def = CONDITIONS_BY_ID[result?.type]
  const color = result?.met ? LIME : DIM
  const label = def?.label || result?.type || 'condition'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: result?.met ? '#0a1408' : '#0a0a0a',
      border: `1px solid ${color}44`,
      borderRadius: 3, padding: '3px 8px', fontSize: 10, fontFamily: MONO,
      color: result?.met ? LIME : '#aaa',
    }}>
      <span>{result?.met ? '✓' : '·'}</span>
      <span style={{ color: '#bbb' }}>{label}</span>
      {result?.label && <span style={{ color: MUTED, marginLeft: 4 }}>{result.label}</span>}
    </div>
  )
}

function StagedTradeBanner({ trigger, setup, accountValue }) {
  const price = trigger.snapshot?.price
  const hv = computeHV30(trigger.snapshot?.histBars || [])
  const plan = useMemo(
    () => computeStagedTrade(setup, price, accountValue, hv, estimatePremium),
    [setup, price, accountValue, hv]
  )
  function copyPlan() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    const lines = [
      `${plan.side} ${trigger.ticker}`,
      plan.optionType ? `Strike $${plan.strike}  •  Expiration ${plan.expiration}  •  ${plan.contracts} contract(s)` : `${plan.shares} shares @ ~$${f2(price)}`,
      plan.estPremium != null ? `Est premium ~$${plan.estPremium.toFixed(2)} (HV-based)` : null,
      `Sizing ${(plan.sizing * 100).toFixed(2)}% of $${plan.accountValue?.toLocaleString?.() || plan.accountValue}`,
      plan.targetExitPct ? `Target +${plan.targetExitPct}%  •  Stop ${plan.stopExitPct ? `-${plan.stopExitPct}%` : `$${plan.stopExitPrice}`}  •  Time-exit DTE ${plan.timeExitDte}` : null,
      `Setup: ${setup.name}`,
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(lines).catch(() => {})
  }
  return (
    <div style={{
      background: '#150505', border: `1px solid ${RED}55`, borderRadius: 5,
      padding: 12, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: RED, color: '#fff', fontSize: 10, fontWeight: 800,
            padding: '3px 8px', borderRadius: 3, letterSpacing: '0.14em',
            fontFamily: MONO,
          }}>TRIGGERED · {trigger.ticker}</span>
          <span style={{ fontSize: 12, color: FG, fontFamily: MONO, fontWeight: 800 }}>
            {plan.side} {plan.optionType ? `$${plan.strike} ${plan.optionType.toUpperCase()} ${plan.expiration}` : `${plan.shares} sh`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={copyPlan} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
            padding: '6px 12px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
            cursor: 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Copy plan</button>
          <a href="https://digital.fidelity.com/prgw/digital/trade-equity/options-trading" target="_blank" rel="noopener noreferrer" style={{
            background: RED, color: '#fff', textDecoration: 'none', padding: '6px 12px',
            borderRadius: 3, fontFamily: MONO, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Execute in Fidelity →</a>
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#cbd5e1', fontFamily: MONO, lineHeight: 1.6 }}>
        Price ${f2(price)}  •  HV {hv != null ? `${(hv * 100).toFixed(0)}%` : '—'}
        {plan.optionType && (
          <>  •  {plan.contracts} contract{plan.contracts === 1 ? '' : 's'}  •  est premium ${plan.estPremium != null ? plan.estPremium.toFixed(2) : '—'}  •  sizing {(plan.sizing * 100).toFixed(2)}% of ${plan.accountValue?.toLocaleString?.() || plan.accountValue}</>
        )}
      </div>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>
        Target +{plan.targetExitPct}%  •  Stop {plan.stopExitPct ? `-${plan.stopExitPct}%` : (plan.stopExitPrice != null ? `$${plan.stopExitPrice}` : '—')}  •  Time exit DTE {plan.timeExitDte}
      </div>
    </div>
  )
}

function BacktestRunner({ setup, apiKey, backtestCache, onResult }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ pct: 0, ticker: null, stage: 'idle' })
  const [error, setError] = useState(null)
  async function run() {
    if (!apiKey) { setError('Add a Massive API key in Command first.'); return }
    setRunning(true); setError(null); setProgress({ pct: 0, ticker: null, stage: 'starting' })
    try {
      const result = await backtestSetup(setup, apiKey, {
        barsCache: backtestCache,
        onProgress: (p) => setProgress({ pct: p.progressPct, ticker: p.ticker, stage: p.stage }),
      })
      if (result?.error) { setError(result.error); setRunning(false); return }
      onResult(result)
      setProgress({ pct: 100, ticker: null, stage: 'done' })
    } catch (e) {
      setError(e?.message || 'Backtest failed')
    }
    setRunning(false)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Backtest</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {running && (
            <span style={{ fontSize: 10, color: '#aaa', fontFamily: MONO }}>
              {progress.stage} {progress.ticker || ''} ({progress.pct}%)
            </span>
          )}
          <button onClick={run} disabled={running || !apiKey} title={!apiKey ? 'Add Massive API key in Command' : ''} style={{
            background: running || !apiKey ? '#1a1a1a' : LIME,
            color: running || !apiKey ? '#666' : '#000', border: 'none',
            padding: '6px 12px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
            cursor: running || !apiKey ? 'not-allowed' : 'pointer', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>{running ? 'Running...' : setup.backtest ? 'Re-run backtest' : 'Run backtest'}</button>
        </div>
      </div>
      {running && (
        <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress.pct}%`, background: LIME, transition: 'width 0.3s ease' }} />
        </div>
      )}
      {error && <div style={{ fontSize: 10, color: RED, fontFamily: MONO }}>{error}</div>}
      {setup.backtest && !running && <BacktestResults result={setup.backtest} />}
      {!setup.backtest && !running && (
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, lineHeight: 1.5 }}>
          Walk-forward simulation against 252 days of daily bars with HV-based Black-Scholes option pricing. Daily-bar approximation; intraday signals (VWAP, true gap) are estimated.
        </div>
      )}
    </div>
  )
}

const actionBtnStyle = {
  background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
  padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO,
  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
}

function fmtAgo(ts) {
  if (!ts) return ''
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export default function SetupCard({
  setup,
  evaluation,
  accountValue,
  apiKey,
  backtestCache,
  onBacktestResult,
  onEdit,
  onDuplicate,
  onPause,
  onArchive,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(false)
  const badge = statusBadgeFor(setup, evaluation)
  const r = evaluation?.bySetup?.[setup.id]
  const triggered = r?.triggered || []
  const approaching = r?.approaching || []
  const monitoring = r?.monitoring || []
  const missing = r?.missing || []
  const conditionCount = setup.conditions?.length || 0
  const universeCount = setup.universe?.length || 0
  const lastTrig = Object.entries(setup.alerts?.lastTriggeredAt || {}).sort((a, b) => b[1] - a[1])[0]
  const lastSummary = lastTrig ? `Last triggered: ${lastTrig[0]} ${fmtAgo(lastTrig[1])}` : null

  // Backtest "score" for the header. Use EV per trade; null if no backtest.
  const btScore = setup.backtest?.expectedValue != null ? setup.backtest.expectedValue : null
  const btScoreColor = btScore == null ? MUTED : btScore > 0 ? LIME : RED

  return (
    <div style={{
      background: PANEL,
      border: `1px solid ${triggered.length ? RED : BORDER}`,
      borderLeft: `3px solid ${badge.color}`,
      borderRadius: 5, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      ...(badge.pulse ? { boxShadow: `0 0 0 2px ${RED}22` } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, color: badge.color, fontFamily: MONO, fontWeight: 700,
          border: `1px solid ${badge.color}55`, padding: '3px 8px', borderRadius: 3,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          animation: badge.pulse ? 'hdrpulse 1.5s infinite' : 'none',
        }}>{badge.label}</span>
        <span style={{ fontSize: 13, color: FG, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.02em' }}>{setup.name}</span>
        <span style={{
          fontSize: 9, color: setup.direction === 'short' ? RED : LIME,
          border: `1px solid ${setup.direction === 'short' ? RED : LIME}44`,
          padding: '2px 6px', borderRadius: 3, letterSpacing: '0.14em',
          fontFamily: MONO, textTransform: 'uppercase',
        }}>{setup.direction || 'either'}</span>
        <span style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>
          {universeCount} ticker{universeCount === 1 ? '' : 's'} · {conditionCount} condition{conditionCount === 1 ? '' : 's'}
        </span>
        {btScore != null && (
          <span style={{ fontSize: 10, color: btScoreColor, fontFamily: MONO, fontWeight: 700 }}>
            EV {btScore >= 0 ? '+' : ''}{btScore.toFixed(2)}%
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setExpanded(e => !e)} style={{
          background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
          padding: '4px 9px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO,
          fontSize: 10, letterSpacing: '0.12em',
        }}>{expanded ? 'COLLAPSE' : 'EXPAND'}</button>
      </div>
      {setup.description && (
        <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.5 }}>
          {setup.description}
        </div>
      )}
      {lastSummary && (
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>{lastSummary}</div>
      )}

      {triggered.map(t => (
        <StagedTradeBanner key={`${setup.id}-${t.ticker}`} trigger={t} setup={setup} accountValue={accountValue} />
      ))}

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
          <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Match: {setup.operator === 'any' ? 'any condition' : 'all conditions'}
          </div>

          {[...triggered, ...approaching, ...monitoring].map(row => (
            <div key={row.ticker} style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: FG, fontFamily: MONO, letterSpacing: '0.04em' }}>{row.ticker}</span>
                <span style={{ fontSize: 10, color: '#aaa', fontFamily: MONO }}>${f2(row.snapshot?.price)}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                  color: row.status === 'triggered' ? RED : row.status === 'approaching' ? YELLOW : '#94a3b8',
                  border: `1px solid ${(row.status === 'triggered' ? RED : row.status === 'approaching' ? YELLOW : '#94a3b8')}44`,
                  padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase',
                }}>{row.status}</span>
                {row.inCooldown && (
                  <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: MONO }}>cooldown</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {row.conditionResults.map((res, i) => (
                  <ConditionPill key={i} result={res} />
                ))}
              </div>
            </div>
          ))}
          {missing.length > 0 && (
            <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>
              No data yet for: {missing.join(', ')}
            </div>
          )}

          <BacktestRunner
            setup={setup}
            apiKey={apiKey}
            backtestCache={backtestCache}
            onResult={(result) => onBacktestResult(setup.id, result)}
          />

          <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Trade plan</div>
          <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.7 }}>
            {setup.tradePlan.instrumentType === 'stock'
              ? `${setup.direction === 'short' ? 'Short' : 'Long'} stock · sizing ${(setup.tradePlan.sizingValue * 100).toFixed(2)}% of account`
              : `${setup.tradePlan.optionType?.toUpperCase()} · DTE ${setup.tradePlan.dte} · strike offset ${(setup.tradePlan.strikeOffset * 100).toFixed(1)}% · sizing ${(setup.tradePlan.sizingValue * 100).toFixed(2)}% of account`}
            <br />
            Target +{setup.tradePlan.targetExitPct}% · Stop {setup.tradePlan.stopExitPct ? `-${setup.tradePlan.stopExitPct}%` : (setup.tradePlan.stopExitPrice != null ? `$${setup.tradePlan.stopExitPrice}` : '—')} · Time exit DTE {setup.tradePlan.timeExitDte}
          </div>

          {(setup.triggeredEvents || []).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Triggered events ({(setup.triggeredEvents || []).length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                {(setup.triggeredEvents || []).slice(0, 20).map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 10, color: '#aaa', fontFamily: MONO, padding: '4px 8px', background: '#0a0a0a', borderRadius: 3 }}>
                    <span style={{ color: FG, fontWeight: 700 }}>{ev.ticker}</span>
                    <span>${f2(ev.price)}</span>
                    <span style={{ color: MUTED }}>{fmtAgo(ev.triggeredAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onEdit(setup)} style={actionBtnStyle}>Edit</button>
            <button onClick={() => onDuplicate(setup)} style={actionBtnStyle}>Duplicate</button>
            <button onClick={() => onPause(setup)} style={actionBtnStyle}>
              {setup.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => onArchive(setup)} style={actionBtnStyle}>
              {setup.status === 'archived' ? 'Unarchive' : 'Archive'}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => onDelete(setup)} style={{ ...actionBtnStyle, color: RED, borderColor: `${RED}55` }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
