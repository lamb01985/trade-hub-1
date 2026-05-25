// ─────────────────────────────────────────────────────────────────────────────
// FocusedTickerCard.jsx — per-ticker dashboard.
//
// Sections:
//   - Header: ticker, direction, live price, status badge derived from
//     attached setups (triggered > approaching > monitoring)
//   - Inline staged-trade panel for each triggered setup with Execute link
//   - Per-setup condition state with progress bar + condition pills
//   - Key Levels horizontal price ladder (current price + EMAs, prev day H/L,
//     entry zones, targets, invalidation level)
//   - Notes (inline-editable markdown)
//   - Recent News (top 5 from getRecentNews)
//   - Recent Setup Activity (last 10 triggers on this ticker across setups)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, BLUE, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { evaluateSetupForTicker, computeStagedTrade } from '../lib/setupEngine.js'
import { buildSnapshot } from '../lib/conditionEvaluators.js'
import { estimatePremium, computeHV30 } from '../lib/wheelOptions.js'
import { CONDITIONS_BY_ID } from '../lib/conditionLibrary.js'
import { getRecentNews } from '../lib/massive.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

function dirColor(d) { return d === 'short' ? RED : d === 'neutral' ? YELLOW : LIME }

function StatusBadge({ status, label }) {
  const color = status === 'triggered' ? RED : status === 'approaching' ? YELLOW : DIM
  const text = label || (status === 'triggered' ? 'TRIGGERED' : status === 'approaching' ? 'APPROACHING' : 'MONITORING')
  const pulse = status === 'triggered' ? 'hdrpulse 1.5s infinite' : 'none'
  return (
    <span style={{
      fontSize: 9, color, fontFamily: MONO, fontWeight: 700,
      border: `1px solid ${color}55`, padding: '3px 8px', borderRadius: 3,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      animation: pulse,
    }}>{text}</span>
  )
}

function ConditionPill({ result }) {
  const def = CONDITIONS_BY_ID[result?.type]
  const color = result?.met ? LIME : DIM
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: result?.met ? '#0a1408' : '#0a0a0a',
      border: `1px solid ${color}44`,
      borderRadius: 3, padding: '3px 8px', fontSize: 10, fontFamily: MONO,
      color: result?.met ? LIME : '#aaa',
    }}>
      <span>{result?.met ? '✓' : '·'}</span>
      <span style={{ color: '#bbb' }}>{def?.label || result?.type}</span>
      {result?.label && <span style={{ color: MUTED, marginLeft: 4 }}>{result.label}</span>}
    </div>
  )
}

// Horizontal price ladder. Pure SVG. Plots a labeled tick for each level on
// a price axis sorted ascending, with the current price highlighted.
function KeyLevelsLadder({ price, snapshot, focused }) {
  const items = useMemo(() => {
    const arr = []
    if (price != null) arr.push({ kind: 'price', price, label: 'Now', color: LIME, bold: true })
    if (focused?.invalidationLevel?.price != null) arr.push({ kind: 'inv', price: focused.invalidationLevel.price, label: 'Invalid', color: RED })
    for (const z of focused?.entryZones || []) {
      if (z.price != null) arr.push({ kind: 'entry', price: z.price, label: z.label || 'Entry', color: '#aaa' })
    }
    for (const t of focused?.targets || []) {
      if (t.price != null) arr.push({ kind: 'target', price: t.price, label: (t.type || 'target').replace('_', ' '), color: LIME })
    }
    if (snapshot?.ema50 != null) arr.push({ kind: 'ema', price: snapshot.ema50, label: '50EMA', color: '#94a3b8' })
    if (snapshot?.ema200 != null) arr.push({ kind: 'ema', price: snapshot.ema200, label: '200EMA', color: '#94a3b8' })
    if (snapshot?.prevDay?.high != null) arr.push({ kind: 'pdh', price: snapshot.prevDay.high, label: 'PDH', color: '#94a3b8' })
    if (snapshot?.prevDay?.low != null) arr.push({ kind: 'pdl', price: snapshot.prevDay.low, label: 'PDL', color: '#94a3b8' })
    if (snapshot?.wk52High != null) arr.push({ kind: '52h', price: snapshot.wk52High, label: '52W H', color: '#94a3b8' })
    if (snapshot?.wk52Low != null) arr.push({ kind: '52l', price: snapshot.wk52Low, label: '52W L', color: '#94a3b8' })
    return arr.filter(x => x.price != null && !isNaN(x.price)).sort((a, b) => a.price - b.price)
  }, [price, snapshot, focused])

  if (items.length === 0) return null
  const min = items[0].price
  const max = items[items.length - 1].price
  const range = max - min || 1
  const width = 720
  const height = 88
  const pad = 16

  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Key levels</div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <line x1={pad} y1={height - 22} x2={width - pad} y2={height - 22} stroke="#222" strokeWidth="1" />
        {items.map((it, i) => {
          const x = pad + ((it.price - min) / range) * (width - 2 * pad)
          const top = height - 22
          const tickH = it.kind === 'price' ? 18 : 10
          return (
            <g key={i}>
              <line x1={x} y1={top - tickH} x2={x} y2={top} stroke={it.color} strokeWidth={it.bold ? 2 : 1} />
              {/* alternate label heights to reduce collisions */}
              <text x={x} y={top + 14} fill={it.color} fontSize="9" textAnchor="middle" fontFamily="ui-monospace, monospace" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {it.label}
              </text>
              <text x={x} y={top - tickH - 4} fill={it.color} fontSize="9" textAnchor="middle" fontFamily="ui-monospace, monospace" fontWeight={it.bold ? 700 : 400}>
                ${it.price.toFixed(2)}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: MUTED, fontFamily: MONO, marginTop: 4 }}>
        <span>min ${min.toFixed(2)}</span>
        <span>max ${max.toFixed(2)}</span>
      </div>
    </div>
  )
}

function StagedTradeInline({ trigger, setup, snapshot, accountValue }) {
  const price = snapshot?.price
  const hv = computeHV30(snapshot?.histBars || [])
  const plan = useMemo(() => computeStagedTrade(setup, price, accountValue, hv, estimatePremium), [setup, price, accountValue, hv])
  function copyPlan() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    const lines = [
      `${plan.side} ${trigger.ticker}`,
      plan.optionType ? `Strike $${plan.strike}  •  Expiration ${plan.expiration}  •  ${plan.contracts} contract(s)` : `${plan.shares} shares @ ~$${f2(price)}`,
      plan.estPremium != null ? `Est premium ~$${plan.estPremium.toFixed(2)} (HV-based)` : null,
      `Sizing ${(plan.sizing * 100).toFixed(2)}% of $${plan.accountValue?.toLocaleString?.() || plan.accountValue}`,
      `Setup: ${setup.name}`,
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(lines).catch(() => {})
  }
  const cost = plan.optionType && plan.estPremium != null
    ? plan.estPremium * 100 * (plan.contracts || 1)
    : (plan.shares ? plan.shares * (price || 0) : null)
  const pctOfAccount = cost != null && plan.accountValue ? (cost / plan.accountValue) * 100 : null
  return (
    <div style={{
      background: '#150505', border: `1px solid ${RED}55`, borderRadius: 5,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ background: RED, color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 3, letterSpacing: '0.14em', fontFamily: MONO }}>TRIGGERED · {setup.name}</span>
        <span style={{ fontSize: 12, color: FG, fontFamily: MONO, fontWeight: 800 }}>
          {plan.side} {plan.optionType ? `$${plan.strike} ${plan.optionType.toUpperCase()} ${plan.expiration}` : `${plan.shares} sh`}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#cbd5e1', fontFamily: MONO, lineHeight: 1.6 }}>
        {plan.optionType
          ? <>Strike <strong style={{ color: FG }}>${plan.strike}</strong> · DTE <strong style={{ color: FG }}>{plan.dte}</strong> · Contracts <strong style={{ color: FG }}>{plan.contracts}</strong> · Est cost <strong style={{ color: LIME }}>${cost != null ? cost.toFixed(0) : '—'}</strong>{pctOfAccount != null ? <> ({pctOfAccount.toFixed(2)}% of account)</> : null}</>
          : <>Shares <strong style={{ color: FG }}>{plan.shares}</strong> @ ${f2(price)} · Est cost <strong style={{ color: LIME }}>${cost != null ? cost.toFixed(0) : '—'}</strong>{pctOfAccount != null ? <> ({pctOfAccount.toFixed(2)}% of account)</> : null}</>
        }
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
  )
}

function PerSetupRow({ setup, evaluation }) {
  const [open, setOpen] = useState(false)
  const status = evaluation?.status || 'monitoring'
  const pct = evaluation?.percentMet ?? 0
  const color = status === 'triggered' ? RED : status === 'approaching' ? YELLOW : DIM
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: FG, fontFamily: MONO, fontWeight: 700, flex: 1 }}>{setup.name}</span>
        <span style={{ fontSize: 9, color: setup.direction === 'short' ? RED : LIME, border: `1px solid ${(setup.direction === 'short' ? RED : LIME)}44`, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: MONO }}>{setup.direction || 'either'}</span>
        <span style={{ fontSize: 9, color, border: `1px solid ${color}55`, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: MONO }}>{status}</span>
        <div style={{ width: 60, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct * 100}%`, background: color }} />
        </div>
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, minWidth: 38, textAlign: 'right' }}>{evaluation?.metCount ?? 0}/{evaluation?.total ?? 0}</span>
        <span style={{ fontSize: 11, color: '#444' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {(evaluation?.conditionResults || []).map((res, i) => <ConditionPill key={i} result={res} />)}
        </div>
      )}
    </div>
  )
}

// ── Top-level card ────────────────────────────────────────────────────────

export default function FocusedTickerCard({
  focused,
  attachedSetups = [],
  snapshot,
  livePrice,
  savedUniverses = [],
  accountValue = 25000,
  apiKey = '',
  collapsed = false,
  onToggleCollapsed,
  onEditThesis,
  onAdjustSetups,
  onUpdateNotes,
  onRemove,
}) {
  const ticker = focused.ticker
  const dcolor = dirColor(focused.thesisDirection)
  const evaluationsBySetup = useMemo(() => {
    const out = {}
    for (const s of attachedSetups) {
      out[s.id] = evaluateSetupForTicker(s, ticker, snapshot)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedSetups, snapshot])

  // Overall card status from the highest-priority attached-setup status.
  const cardStatus = useMemo(() => {
    let best = 'monitoring'
    for (const s of attachedSetups) {
      const st = evaluationsBySetup[s.id]?.status
      if (st === 'triggered') return 'triggered'
      if (st === 'approaching' && best !== 'triggered') best = 'approaching'
    }
    return best
  }, [attachedSetups, evaluationsBySetup])

  // Status counts for the collapsed-mode summary line.
  const statusCounts = useMemo(() => {
    const counts = { triggered: 0, approaching: 0, monitoring: 0 }
    for (const s of attachedSetups) {
      const st = evaluationsBySetup[s.id]?.status || 'monitoring'
      counts[st] = (counts[st] || 0) + 1
    }
    return counts
  }, [attachedSetups, evaluationsBySetup])

  // Notes inline editor.
  const [notesDraft, setNotesDraft] = useState(focused.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  useEffect(() => { setNotesDraft(focused.notes || '') }, [focused.notes])
  function saveNotes() {
    if (notesDraft === (focused.notes || '')) { setEditingNotes(false); return }
    onUpdateNotes?.(notesDraft)
    setEditingNotes(false)
  }

  // Recent news.
  const [news, setNews] = useState(null)
  const [newsLoading, setNewsLoading] = useState(false)
  useEffect(() => {
    if (!apiKey) return
    let alive = true
    setNewsLoading(true)
    getRecentNews(apiKey, ticker, 5).then(n => { if (alive) { setNews(n || []); setNewsLoading(false) } }).catch(() => { if (alive) { setNews([]); setNewsLoading(false) } })
    return () => { alive = false }
  }, [apiKey, ticker])

  // Recent setup activity across ALL setups (not just attached) for this ticker.
  // Each setup's triggeredEvents array carries { ticker, triggeredAt, price }.
  const recentActivity = useMemo(() => {
    const out = []
    for (const s of attachedSetups) {
      for (const ev of s.triggeredEvents || []) {
        if (String(ev.ticker || '').toUpperCase() === ticker) {
          out.push({ ...ev, setupName: s.name })
        }
      }
    }
    out.sort((a, b) => (b.triggeredAt || 0) - (a.triggeredAt || 0))
    return out.slice(0, 10)
  }, [attachedSetups, ticker])

  const lastUpdated = focused.updatedAt ? new Date(focused.updatedAt) : null

  return (
    <div style={{
      background: PANEL, border: `1px solid ${cardStatus === 'triggered' ? RED : BORDER}`,
      borderLeft: `3px solid ${dcolor}`, borderRadius: 6, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 12, fontFamily: MONO,
      ...(cardStatus === 'triggered' ? { boxShadow: `0 0 0 2px ${RED}22` } : {}),
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, color: FG, fontFamily: MONO, fontWeight: 800, letterSpacing: '0.04em' }}>{ticker}</span>
        <span style={{ fontSize: 9, color: dcolor, fontFamily: MONO, fontWeight: 700, border: `1px solid ${dcolor}55`, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{focused.thesisDirection}</span>
        <StatusBadge status={cardStatus} />
        {livePrice != null && (
          <span style={{ fontSize: 13, color: LIME, fontFamily: MONO, fontWeight: 800 }}>${f2(livePrice)}</span>
        )}
        {snapshot?.changePct != null && (
          <span style={{ fontSize: 11, color: snapshot.changePct >= 0 ? LIME : RED, fontFamily: MONO, fontWeight: 700 }}>
            {snapshot.changePct >= 0 ? '+' : ''}{snapshot.changePct.toFixed(2)}%
          </span>
        )}
        <div style={{ flex: 1 }} />
        {!collapsed && (
          <>
            <button onClick={() => onEditThesis?.(focused)} style={actionBtn}>Edit thesis</button>
            <button onClick={() => onAdjustSetups?.(focused)} style={actionBtn}>Adjust setups</button>
            <button onClick={() => onRemove?.(focused)} style={{ ...actionBtn, color: RED, borderColor: `${RED}55` }}>Remove</button>
          </>
        )}
        <button
          onClick={() => onToggleCollapsed?.()}
          title={collapsed ? 'Expand card' : 'Collapse card'}
          style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
            padding: '4px 9px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO,
            fontSize: 11, lineHeight: 1,
          }}
        >{collapsed ? '▶' : '▼'}</button>
      </div>

      {/* Collapsed summary line */}
      {collapsed && (
        <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.5, letterSpacing: '0.04em' }}>
          {attachedSetups.length === 0
            ? 'No setups attached.'
            : (
              <>
                {attachedSetups.length} setup{attachedSetups.length === 1 ? '' : 's'}:{' '}
                <span style={{ color: statusCounts.triggered > 0 ? RED : MUTED, fontWeight: statusCounts.triggered > 0 ? 800 : 400 }}>{statusCounts.triggered} triggered</span>
                <span style={{ color: MUTED }}> · </span>
                <span style={{ color: statusCounts.approaching > 0 ? YELLOW : MUTED, fontWeight: statusCounts.approaching > 0 ? 800 : 400 }}>{statusCounts.approaching} approaching</span>
                <span style={{ color: MUTED }}> · </span>
                <span style={{ color: '#aaa' }}>{statusCounts.monitoring} monitoring</span>
              </>
            )}
        </div>
      )}

      {/* Expanded body */}
      {!collapsed && (
        <>
          {/* Thesis description */}
          {focused.thesisDescription && (
            <div style={{ fontSize: 12, color: '#aaa', fontFamily: MONO, lineHeight: 1.6 }}>
              {focused.thesisDescription}
            </div>
          )}
          {focused.timeHorizon && (
            <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.06em' }}>
              Horizon: <span style={{ color: '#aaa' }}>{focused.timeHorizon}</span>
            </div>
          )}

          {/* Inline staged trade per triggered setup */}
          {attachedSetups.filter(s => evaluationsBySetup[s.id]?.status === 'triggered').map(s => (
            <StagedTradeInline
              key={`stg-${s.id}`}
              trigger={{ ticker, snapshot }}
              setup={s}
              snapshot={snapshot}
              accountValue={accountValue}
            />
          ))}

          {/* Per-setup status */}
          {attachedSetups.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Attached setups ({attachedSetups.length})</div>
              {attachedSetups.map(s => (
                <PerSetupRow key={s.id} setup={s} evaluation={evaluationsBySetup[s.id]} />
              ))}
            </div>
          )}
          {attachedSetups.length === 0 && (
            <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>
              No setups attached. Use "Adjust setups" to attach this ticker to one or more active setups.
            </div>
          )}

          {/* Key levels ladder */}
          <KeyLevelsLadder price={livePrice} snapshot={snapshot} focused={focused} />

      {/* Notes */}
      <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Notes</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lastUpdated && <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO }}>updated {lastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            {!editingNotes && <button onClick={() => setEditingNotes(true)} style={actionBtnSmall}>Edit</button>}
            {editingNotes && <button onClick={saveNotes} style={{ ...actionBtnSmall, color: LIME, borderColor: `${LIME}55` }}>Save</button>}
          </div>
        </div>
        {editingNotes ? (
          <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={5} onBlur={saveNotes} style={{
            background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3,
            color: FG, fontFamily: MONO, fontSize: 11, padding: '8px 10px', outline: 'none',
            resize: 'vertical', lineHeight: 1.6,
          }} />
        ) : (
          <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {focused.notes || <span style={{ color: MUTED }}>No notes yet. Click Edit to add.</span>}
          </div>
        )}
      </div>

      {/* Recent news */}
      <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Recent news</div>
        {newsLoading && <div style={{ fontSize: 11, color: MUTED }}>Loading…</div>}
        {news && news.length === 0 && <div style={{ fontSize: 11, color: MUTED }}>No recent news.</div>}
        {news && news.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {news.slice(0, 5).map((n, i) => (
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

      {/* Recent setup activity */}
      <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Recent setup activity</div>
        {recentActivity.length === 0 ? (
          <div style={{ fontSize: 11, color: MUTED }}>No triggered events yet for {ticker}.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentActivity.map((a, i) => {
              const d = new Date(a.triggeredAt)
              return (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 10, color: '#aaa', fontFamily: MONO, padding: '4px 6px', borderBottom: i === recentActivity.length - 1 ? 'none' : `1px solid ${BORDER}` }}>
                  <span style={{ color: MUTED, minWidth: 90 }}>{d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: FG, fontWeight: 700 }}>{a.setupName}</span>
                  {a.price != null && <span style={{ color: MUTED }}>@ ${f2(a.price)}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

const actionBtn = {
  background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
  padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO,
  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
}
const actionBtnSmall = {
  background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
  padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO,
  fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
}
