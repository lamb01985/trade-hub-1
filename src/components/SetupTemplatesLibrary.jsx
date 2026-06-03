// ─────────────────────────────────────────────────────────────────────────────
// SetupTemplatesLibrary.jsx — modal browser of professional setup templates.
//
// Opened from Setups.jsx when the user clicks "+ New setup" and picks
// "Start from template" (vs "Build from scratch").
//
// Layout: filter chips by category, card grid, click-to-expand row with full
// description / conditions / trade plan / notes. Two actions per template:
//   - Clone to new setup: pre-fills the SetupBuilder with the template
//     defaults, status='paused' (user reviews + backtests).
//   - Backtest this template: runs backtestSetup against the template's
//     default universe + conditions in place, shows the result inline so
//     the user can decide whether to clone.
//
// Cloned-template tracking lives in localStorage 'tradeHub.setupTemplates.cloned.v1'
// so the card can flag "you've cloned this before".
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { useLocalStorage } from '../hooks/useStore.js'
import { SETUP_TEMPLATES, CATEGORY_ORDER, CATEGORY_LABELS, templatesByCategory } from '../lib/setupTemplates.js'
import { CONDITIONS_BY_ID } from '../lib/conditionLibrary.js'
import { createSetup } from '../lib/setupStorage.js'
import { backtestSetup } from '../lib/setupBacktest.js'
import BacktestResults from './BacktestResults.jsx'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

// Convert a template into the createSetup-compatible shape used by the
// SetupBuilder. status='paused' so the user reviews before activating.
function templateToSetupPartial(template) {
  return {
    name: template.name,
    description: template.description,
    direction: template.direction,
    status: 'paused',
    universe: [...(template.defaultUniverse || [])],
    conditions: (template.defaultConditions || []).map(c => ({
      // Fresh id per condition row so subsequent edits don't collide.
      id: `cond_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: c.type,
      params: { ...(c.params || {}) },
    })),
    operator: template.defaultOperator || 'all',
    tradePlan: { ...(template.defaultTradePlan || {}) },
  }
}

function badge(text, color) {
  return (
    <span style={{
      fontSize: 9, color, fontFamily: MONO, fontWeight: 700,
      border: `1px solid ${color}55`, padding: '2px 7px', borderRadius: 3,
      letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>{text}</span>
  )
}

function TemplateInlineBacktest({ template, apiKey, cacheRef }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ pct: 0, ticker: null, stage: 'idle' })
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  async function run() {
    setRunning(true); setError(null); setProgress({ pct: 0, ticker: null, stage: 'starting' })
    try {
      const synth = createSetup(templateToSetupPartial(template))
      const r = await backtestSetup(synth, {
        barsCache: cacheRef.current,
        onProgress: (p) => setProgress({ pct: p.progressPct, ticker: p.ticker, stage: p.stage }),
      })
      if (r?.error) { setError(r.error); setRunning(false); return }
      setResult(r)
    } catch (e) {
      setError(e?.message || 'Backtest failed')
    }
    setRunning(false)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Inline backtest (default universe + conditions)
        </div>
        <button onClick={run} disabled={running || !apiKey} style={{
          background: running || !apiKey ? '#1a1a1a' : LIME, color: running || !apiKey ? '#666' : '#000',
          border: 'none', padding: '6px 12px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
          cursor: running || !apiKey ? 'not-allowed' : 'pointer', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>{running ? 'Running...' : result ? 'Re-run' : 'Run backtest'}</button>
      </div>
      {running && (
        <>
          <div style={{ fontSize: 10, color: '#aaa', fontFamily: MONO }}>
            {progress.stage} {progress.ticker || ''} ({progress.pct}%)
          </div>
          <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress.pct}%`, background: LIME, transition: 'width 0.3s ease' }} />
          </div>
        </>
      )}
      {error && <div style={{ fontSize: 10, color: RED, fontFamily: MONO }}>{error}</div>}
      {result && <BacktestResults result={result} />}
    </div>
  )
}

function TemplateCard({ template, isExpanded, onToggle, onClone, alreadyCloned, apiKey, cacheRef }) {
  const dirColor = template.direction === 'short' ? RED : template.direction === 'either' ? YELLOW : LIME
  return (
    <div style={{
      background: PANEL, border: `1px solid ${isExpanded ? LIME : BORDER}`,
      borderLeft: `3px solid ${dirColor}`,
      borderRadius: 5, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: FG, fontWeight: 800, fontFamily: MONO }}>{template.name}</span>
        {badge(template.direction, dirColor)}
        {badge(CATEGORY_LABELS[template.category] || template.category, '#94a3b8')}
        {alreadyCloned && badge('cloned', LIME)}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>
          {(template.defaultConditions || []).length} cond · {(template.defaultUniverse || []).length} tickers
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>{isExpanded ? '▼' : '▶'}</span>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.5 }}>
        {template.description}
      </div>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO }}>
        Source: <span style={{ color: '#bbb' }}>{template.source}</span>
      </div>
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
          <div>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>When it works</div>
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.5 }}>{template.whenItWorks}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>When it doesn't</div>
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.5 }}>{template.whenItDoesnt}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Conditions ({template.defaultOperator || 'all'})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(template.defaultConditions || []).map((c, i) => {
                const def = CONDITIONS_BY_ID[c.type]
                const paramStr = Object.entries(c.params || {}).map(([k, v]) => `${k}=${v}`).join(', ')
                return (
                  <span key={i} style={{
                    fontSize: 10, color: '#bbb', fontFamily: MONO,
                    background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3,
                    padding: '3px 8px',
                  }}>
                    {def?.label || c.type}{paramStr ? <span style={{ color: MUTED }}>  ·  {paramStr}</span> : null}
                  </span>
                )
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Default universe</div>
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.6 }}>
              {(template.defaultUniverse || []).join(', ') || '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Default trade plan</div>
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: MONO, lineHeight: 1.6 }}>
              {(() => {
                const tp = template.defaultTradePlan || {}
                if (tp.instrumentType === 'stock') return `Stock · sizing ${(tp.sizingValue * 100).toFixed(2)}%`
                return `${(tp.optionType || '').toUpperCase()} · strike ${tp.strikeOffset > 0 ? '+' : ''}${(tp.strikeOffset * 100).toFixed(1)}% · DTE ${tp.dte} · sizing ${(tp.sizingValue * 100).toFixed(2)}% · target +${tp.targetExitPct}% / stop -${tp.stopExitPct}% / time-exit DTE ${tp.timeExitDte}`
              })()}
            </div>
          </div>
          {template.notes && (
            <div style={{ background: '#150d04', border: `1px solid ${YELLOW}44`, borderRadius: 3, padding: '8px 10px', fontSize: 10, color: '#c8a030', fontFamily: MONO, lineHeight: 1.5 }}>
              {template.notes}
            </div>
          )}

          <TemplateInlineBacktest template={template} apiKey={apiKey} cacheRef={cacheRef} />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => onClone(template)} style={{
              background: LIME, color: '#000', border: 'none', padding: '8px 14px',
              borderRadius: 3, fontFamily: MONO, fontSize: 10, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            }}>Clone to new setup →</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SetupTemplatesLibrary({ apiKey, onClone, onCancel }) {
  const grouped = useMemo(() => templatesByCategory(), [])
  const [filter, setFilter] = useState('all') // 'all' or a category id
  const [expanded, setExpanded] = useState(null)
  const [cloned, setCloned] = useLocalStorage('tradeHub.setupTemplates.cloned.v1', {})
  const cacheRef = useRef({})

  const filtered = useMemo(() => {
    if (filter === 'all') return SETUP_TEMPLATES
    return grouped[filter] || []
  }, [grouped, filter])

  function handleClone(template) {
    onClone?.(templateToSetupPartial(template), template)
    setCloned(prev => ({ ...(prev || {}), [template.id]: (prev?.[template.id] || 0) + 1 }))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 28, zIndex: 220, overflowY: 'auto',
    }}>
      <div style={{
        background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 6,
        width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 14,
        padding: 18, fontFamily: MONO,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Templates</div>
            <div style={{ fontSize: 18, color: FG, fontWeight: 800, letterSpacing: '-0.01em' }}>Start from a proven setup</div>
          </div>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} style={chipStyle(filter === 'all')}>All ({SETUP_TEMPLATES.length})</button>
          {CATEGORY_ORDER.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={chipStyle(filter === cat)}>
              {CATEGORY_LABELS[cat]} ({(grouped[cat] || []).length})
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              isExpanded={expanded === t.id}
              onToggle={() => setExpanded(prev => prev === t.id ? null : t.id)}
              onClone={handleClone}
              alreadyCloned={(cloned?.[t.id] || 0) > 0}
              apiKey={apiKey}
              cacheRef={cacheRef}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
          <button onClick={onCancel} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>Close</button>
        </div>
      </div>
    </div>
  )
}

function chipStyle(active) {
  return {
    background: active ? LIME : 'transparent',
    color: active ? '#000' : '#aaa',
    border: `1px solid ${active ? LIME : BORDER}`,
    padding: '5px 10px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
    cursor: 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase',
    fontWeight: active ? 700 : 500,
  }
}
