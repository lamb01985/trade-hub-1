// ─────────────────────────────────────────────────────────────────────────────
// Setups.jsx — generic trade-trigger tab. Replaces the legacy Short Thesis
// tab in nav. Drives off the setupEngine evaluation that App.jsx runs on
// every _priceTick.
//
// Responsibilities:
//   - List, filter, sort all setups
//   - Show per-setup status badge derived from the engine evaluation
//   - When a setup is triggered on any ticker, surface the staged trade
//     plan inline with an Execute action
//   - Open SetupBuilder modal for create / edit
//   - Pause / archive / duplicate / delete from the action menu
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { LIME, RED, YELLOW, BLUE, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { CONDITIONS_BY_ID } from '../lib/conditionLibrary.js'
import { createSetup } from '../lib/setupStorage.js'
import { computeStagedTrade } from '../lib/setupEngine.js'
import { estimatePremium, computeHV30 } from '../lib/wheelOptions.js'
import SetupBuilder from './SetupBuilder.jsx'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'triggered', label: 'Triggered' },
  { id: 'paused', label: 'Paused' },
  { id: 'archived', label: 'Archived' },
]
const SORTS = [
  { id: 'recent', label: 'Most recently triggered' },
  { id: 'name', label: 'Name' },
  { id: 'created', label: 'Created' },
]

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
  // Pull HV from the snapshot's daily closes for a BS premium estimate.
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
          }}>Open Fidelity →</a>
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

function SetupCard({ setup, evaluation, accountValue, onEdit, onDuplicate, onPause, onArchive, onDelete }) {
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

      {/* Triggered banner(s) inline */}
      {triggered.map(t => (
        <StagedTradeBanner key={`${setup.id}-${t.ticker}`} trigger={t} setup={setup} accountValue={accountValue} />
      ))}

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
          {/* Operator */}
          <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Match: {setup.operator === 'any' ? 'any condition' : 'all conditions'}
          </div>

          {/* Per-ticker condition status table */}
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

          {/* Trade plan */}
          <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Trade plan</div>
          <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.7 }}>
            {setup.tradePlan.instrumentType === 'stock'
              ? `${setup.direction === 'short' ? 'Short' : 'Long'} stock · sizing ${(setup.tradePlan.sizingValue * 100).toFixed(2)}% of account`
              : `${setup.tradePlan.optionType?.toUpperCase()} · DTE ${setup.tradePlan.dte} · strike offset ${(setup.tradePlan.strikeOffset * 100).toFixed(1)}% · sizing ${(setup.tradePlan.sizingValue * 100).toFixed(2)}% of account`}
            <br />
            Target +{setup.tradePlan.targetExitPct}% · Stop {setup.tradePlan.stopExitPct ? `-${setup.tradePlan.stopExitPct}%` : (setup.tradePlan.stopExitPrice != null ? `$${setup.tradePlan.stopExitPrice}` : '—')} · Time exit DTE {setup.tradePlan.timeExitDte}
          </div>

          {/* Action row */}
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

// ── Main tab ────────────────────────────────────────────────────────────────

export default function Setups({
  setups = [],
  onSetupsChange = null,
  evaluation = null,
  accountValue = 25000,
  suggestionTickers = [],
}) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [editing, setEditing] = useState(null) // { setup, isNew }

  function updateSetup(updated) {
    if (!onSetupsChange) return
    const idx = setups.findIndex(s => s.id === updated.id)
    if (idx < 0) onSetupsChange([updated, ...setups])
    else {
      const next = [...setups]
      next[idx] = updated
      onSetupsChange(next)
    }
  }
  function removeSetup(id) {
    if (!onSetupsChange) return
    onSetupsChange(setups.filter(s => s.id !== id))
  }
  function handleSave(setup) {
    updateSetup({ ...setup, updatedAt: new Date().toISOString() })
    setEditing(null)
  }
  function handleNew() {
    setEditing({ setup: createSetup({ name: '', universe: [], conditions: [] }), isNew: true })
  }
  function handleEdit(setup) {
    setEditing({ setup, isNew: false })
  }
  function handleDuplicate(setup) {
    const dup = createSetup({
      ...setup,
      id: undefined,
      name: `${setup.name} (copy)`,
      createdAt: undefined,
      alerts: { ...(setup.alerts || {}), lastTriggeredAt: {} },
      triggeredEvents: [],
    })
    updateSetup(dup)
  }
  function handlePause(setup) {
    updateSetup({ ...setup, status: setup.status === 'paused' ? 'active' : 'paused' })
  }
  function handleArchive(setup) {
    updateSetup({ ...setup, status: setup.status === 'archived' ? 'active' : 'archived' })
  }
  function handleDelete(setup) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${setup.name}"? This cannot be undone.`)) return
    removeSetup(setup.id)
  }

  const filtered = useMemo(() => {
    let list = [...setups]
    if (filter === 'active') list = list.filter(s => (s.status || 'active') === 'active')
    else if (filter === 'paused') list = list.filter(s => s.status === 'paused')
    else if (filter === 'archived') list = list.filter(s => s.status === 'archived')
    else if (filter === 'triggered') list = list.filter(s => (evaluation?.bySetup?.[s.id]?.triggered?.length || 0) > 0)

    if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sort === 'created') list.sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0)))
    else {
      // recent: triggered first, then by lastTriggeredAt across all tickers
      list.sort((a, b) => {
        const at = (evaluation?.bySetup?.[a.id]?.triggered?.length || 0) > 0 ? 1 : 0
        const bt = (evaluation?.bySetup?.[b.id]?.triggered?.length || 0) > 0 ? 1 : 0
        if (at !== bt) return bt - at
        const aLast = Math.max(0, ...Object.values(a.alerts?.lastTriggeredAt || {}))
        const bLast = Math.max(0, ...Object.values(b.alerts?.lastTriggeredAt || {}))
        return bLast - aLast
      })
    }
    return list
  }, [setups, filter, sort, evaluation])

  const triggeredCount = useMemo(
    () => (setups || []).filter(s => (evaluation?.bySetup?.[s.id]?.triggered?.length || 0) > 0).length,
    [setups, evaluation]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Trigger engine</div>
          <div style={{ fontSize: 22, color: FG, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Setups<span style={{ color: LIME }}>.</span>
          </div>
        </div>
        <button onClick={handleNew} style={{
          background: LIME, color: '#000', border: 'none', padding: '10px 16px',
          borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 800,
          letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
        }}>+ New setup</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              background: filter === f.id ? LIME : 'transparent',
              color: filter === f.id ? '#000' : '#aaa',
              border: `1px solid ${filter === f.id ? LIME : BORDER}`,
              padding: '5px 10px', borderRadius: 3, fontFamily: MONO,
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer', fontWeight: filter === f.id ? 700 : 500,
            }}>{f.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={{
          background: DARK, color: '#aaa', border: `1px solid ${BORDER}`,
          padding: '5px 10px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
          letterSpacing: '0.04em',
        }}>
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div style={{ fontSize: 10, color: triggeredCount > 0 ? RED : MUTED, fontFamily: MONO, letterSpacing: '0.08em' }}>
          {triggeredCount > 0 ? `${triggeredCount} TRIGGERED` : `${setups.length} setup${setups.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ background: PANEL, border: `1px dashed ${BORDER}`, borderRadius: 5, padding: 32, textAlign: 'center', color: MUTED, fontSize: 11, fontFamily: MONO }}>
          {setups.length === 0
            ? 'No setups yet. Hit "New setup" to define your first trigger.'
            : 'No setups match the current filter.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(setup => (
          <SetupCard
            key={setup.id}
            setup={setup}
            evaluation={evaluation}
            accountValue={accountValue}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onPause={handlePause}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {editing && (
        <SetupBuilder
          initial={editing.setup}
          isNew={editing.isNew}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          suggestionTickers={suggestionTickers}
        />
      )}
    </div>
  )
}
