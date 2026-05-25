// ─────────────────────────────────────────────────────────────────────────────
// SetupBuilder.jsx — modal form to create or edit a Setup.
//
// Sections: Basics, Universe, Conditions (with two-step picker: category ->
// condition), Trade plan, Alerts. Validates on save; opens via Setups.jsx
// "+ New setup" or any per-card "Edit".
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { LIME, RED, YELLOW, BLUE, MONO, BORDER, PANEL, DARK, f2 } from '../constants.js'
import { CATEGORIES, CONDITIONS, CONDITIONS_BY_ID, conditionsByCategory, defaultParamsFor } from '../lib/conditionLibrary.js'
import { createSetup } from '../lib/setupStorage.js'
import { resolveUniverseTickers, universeIsSaved, normalizeUniverse } from '../lib/universeResolver.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const inputStyle = {
  background: DARK, border: `1px solid ${BORDER}`, borderRadius: 3,
  color: FG, fontFamily: MONO, fontSize: 11, padding: '7px 9px', outline: 'none',
}
const labelStyle = {
  fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em',
  textTransform: 'uppercase', marginBottom: 4, display: 'block',
}
const sectionStyle = {
  background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5,
  padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
}
const sectionLabel = {
  fontSize: 10, color: '#aaa', fontFamily: MONO, letterSpacing: '0.16em',
  textTransform: 'uppercase', fontWeight: 700,
}

function uid() {
  return `cond_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

// ── Universe input with autocomplete + chips ───────────────────────────────

function UniverseInput({ tickers, onChange, suggestions = [] }) {
  const [input, setInput] = useState('')
  const sugg = useMemo(() => {
    if (!input.trim()) return []
    const q = input.toUpperCase()
    return suggestions
      .filter(s => s.startsWith(q) && !tickers.includes(s))
      .slice(0, 5)
  }, [input, suggestions, tickers])

  function add(t) {
    const T = String(t || '').trim().toUpperCase()
    if (!T) return
    if (!/^[A-Z]{1,6}$/.test(T)) { setInput(''); return }
    if (tickers.includes(T)) { setInput(''); return }
    onChange([...tickers, T])
    setInput('')
  }
  function remove(t) {
    onChange(tickers.filter(x => x !== t))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input) } }}
          placeholder="Add ticker (Enter to confirm)"
          maxLength={6}
          style={{ ...inputStyle, flex: 1, letterSpacing: '0.06em' }}
        />
        <button onClick={() => add(input)} disabled={!input.trim()} style={{
          background: input.trim() ? LIME : '#1a1a1a', color: input.trim() ? '#000' : '#444',
          border: 'none', padding: '7px 12px', borderRadius: 3, cursor: input.trim() ? 'pointer' : 'not-allowed',
          fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        }}>+ ADD</button>
      </div>
      {sugg.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sugg.map(s => (
            <button key={s} onClick={() => add(s)} style={{
              background: '#0a0a0a', border: `1px dashed ${BORDER}`, color: '#aaa',
              padding: '3px 8px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
              cursor: 'pointer', letterSpacing: '0.06em',
            }}>+ {s}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tickers.map(t => (
          <div key={t} style={{
            background: '#0a0a0a', border: `1px solid ${BORDER}`,
            borderLeft: `3px solid ${LIME}`, borderRadius: 3,
            padding: '5px 9px', fontSize: 11, display: 'flex',
            alignItems: 'center', gap: 6, fontFamily: MONO,
          }}>
            <span style={{ color: FG, fontWeight: 700, letterSpacing: '0.06em' }}>{t}</span>
            <button onClick={() => remove(t)} style={{
              background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer',
              padding: 0, display: 'flex',
            }}>✕</button>
          </div>
        ))}
        {tickers.length === 0 && (
          <span style={{ fontSize: 10, color: MUTED }}>No tickers yet. The setup needs at least one.</span>
        )}
      </div>
    </div>
  )
}

// ── Condition picker (two-step: category -> condition) ────────────────────

function ConditionPicker({ onPick, onCancel }) {
  const [category, setCategory] = useState(null)
  const grouped = useMemo(() => conditionsByCategory(), [])
  if (!category) {
    return (
      <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>Pick a category</span>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 10, fontFamily: MONO, cursor: 'pointer' }}>CANCEL</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
              padding: '6px 12px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
              cursor: 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>{c.label}</button>
          ))}
        </div>
      </div>
    )
  }
  const items = grouped[category] || []
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={labelStyle}>{CATEGORIES.find(c => c.id === category)?.label} conditions</span>
        <button onClick={() => setCategory(null)} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 10, fontFamily: MONO, cursor: 'pointer' }}>← BACK</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(c => (
          <button key={c.id} onClick={() => onPick(c.id)} style={{
            background: '#0a0a0a', border: `1px solid ${BORDER}`, color: FG,
            textAlign: 'left', padding: '8px 10px', borderRadius: 3, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11,
          }}>
            <div style={{ fontWeight: 700, color: '#e8e8e8' }}>{c.label}</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{c.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Param input router (number, select, string) ───────────────────────────

function ParamInput({ paramDef, value, onChange }) {
  if (paramDef.type === 'select') {
    return (
      <select value={value ?? paramDef.default} onChange={e => {
        const raw = e.target.value
        const num = Number(raw)
        onChange(isNaN(num) ? raw : num)
      }} style={{ ...inputStyle, paddingRight: 16 }}>
        {(paramDef.options || []).map(o => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    )
  }
  if (paramDef.type === 'number') {
    return (
      <input
        type="number" step="any"
        value={value ?? paramDef.default ?? ''}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{ ...inputStyle, width: 90 }}
      />
    )
  }
  return (
    <input
      type="text" value={value ?? paramDef.default ?? ''}
      onChange={e => onChange(e.target.value)}
      style={inputStyle}
    />
  )
}

// ── Single condition row ──────────────────────────────────────────────────

function ConditionRow({ condition, onChange, onRemove }) {
  const def = CONDITIONS_BY_ID[condition.type]
  if (!def) {
    return (
      <div style={{ background: DARK, border: `1px solid ${RED}55`, borderRadius: 4, padding: 10, fontSize: 11, fontFamily: MONO, color: RED }}>
        Unknown condition type: {condition.type}
        <button onClick={onRemove} style={{ marginLeft: 12, ...actionBtn }}>Remove</button>
      </div>
    )
  }
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: FG, fontWeight: 700 }}>{def.label}</div>
        <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, lineHeight: 1.5 }}>{def.description}</div>
      </div>
      {(def.params || []).map(p => (
        <div key={p.name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{p.label || p.name}</span>
          <ParamInput
            paramDef={p}
            value={condition.params?.[p.name]}
            onChange={(v) => onChange({ ...condition, params: { ...condition.params, [p.name]: v } })}
          />
        </div>
      ))}
      <button onClick={onRemove} style={actionBtn}>Remove</button>
    </div>
  )
}

const actionBtn = {
  background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
  padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
  fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
}

// ── Main builder ──────────────────────────────────────────────────────────

// Activation gate: status='active' requires a backtest with >= 20 triggers
// and positive EV. The user can override with a checkbox after acknowledging
// the warning.
const MIN_BACKTEST_TRIGGERS = 20
function backtestPasses(bt) {
  if (!bt) return false
  if ((bt.triggers || 0) < MIN_BACKTEST_TRIGGERS) return false
  if ((bt.expectedValue || 0) <= 0) return false
  return true
}

export default function SetupBuilder({ initial, isNew = false, onSave, onCancel, suggestionTickers = [], savedUniverses = [] }) {
  const [setup, setSetup] = useState(() => createSetup({ ...(initial || {}) }))
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [overrideActivation, setOverrideActivation] = useState(false)

  useEffect(() => {
    setSetup(createSetup({ ...(initial || {}) }))
    setOverrideActivation(false)
  }, [initial])

  function patch(part) { setSetup(prev => ({ ...prev, ...part })) }
  function patchTradePlan(part) { setSetup(prev => ({ ...prev, tradePlan: { ...prev.tradePlan, ...part } })) }
  function patchAlerts(part) { setSetup(prev => ({ ...prev, alerts: { ...prev.alerts, ...part } })) }

  function addCondition(conditionId) {
    const cond = { id: uid(), type: conditionId, params: defaultParamsFor(conditionId) }
    setSetup(prev => ({ ...prev, conditions: [...(prev.conditions || []), cond] }))
    setPicking(false)
  }
  function updateCondition(idx, next) {
    setSetup(prev => {
      const arr = [...(prev.conditions || [])]
      arr[idx] = next
      return { ...prev, conditions: arr }
    })
  }
  function removeCondition(idx) {
    setSetup(prev => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }))
  }

  function handleSave() {
    if (!setup.name?.trim()) { setError('Name is required.'); return }
    if (resolveUniverseTickers(setup.universe, savedUniverses).length === 0) {
      setError(universeIsSaved(setup.universe)
        ? 'Pick a saved universe with at least one ticker, or switch to ticker-list mode.'
        : 'Add at least one ticker to the universe.')
      return
    }
    if (!(setup.conditions || []).length) { setError('Add at least one condition.'); return }
    const sz = Number(setup.tradePlan?.sizingValue)
    if (isNaN(sz) || sz < 0.001 || sz > 0.05) { setError('Sizing must be between 0.1% and 5% (0.001-0.05).'); return }
    if (setup.status === 'active' && !backtestPasses(setup.backtest) && !overrideActivation) {
      setError(`Cannot promote to active without a passing backtest (>= ${MIN_BACKTEST_TRIGGERS} triggers and positive EV). Run a backtest first, or check "I know what I'm doing" to override.`)
      return
    }
    setError('')
    onSave({ ...setup })
  }

  // Focus trap not implemented; ESC-to-cancel for convenience.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

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
          <div style={{ fontSize: 16, fontWeight: 800, color: FG, letterSpacing: '-0.01em' }}>
            {isNew ? 'New setup' : `Edit: ${setup.name || 'Untitled'}`}
          </div>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
        </div>

        {/* BASICS */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Basics</div>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={setup.name} onChange={e => patch({ name: e.target.value })} style={{ ...inputStyle, width: '100%' }} placeholder="e.g. Multiple compression short" />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={setup.description} onChange={e => patch({ description: e.target.value })} rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: MONO }} placeholder="When and why this setup fires." />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={labelStyle}>Direction</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['long', 'short', 'either'].map(d => (
                  <button key={d} onClick={() => patch({ direction: d })} style={{
                    background: setup.direction === d ? (d === 'short' ? RED : LIME) : 'transparent',
                    color: setup.direction === d ? '#000' : '#aaa',
                    border: `1px solid ${setup.direction === d ? (d === 'short' ? RED : LIME) : BORDER}`,
                    padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                    fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
                    textTransform: 'uppercase', fontWeight: setup.direction === d ? 700 : 500,
                  }}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={setup.status} onChange={e => patch({ status: e.target.value })} style={inputStyle}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* UNIVERSE */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={sectionLabel}>Universe</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['list', 'saved'].map(t => {
                const active = universeIsSaved(setup.universe) ? t === 'saved' : t === 'list'
                return (
                  <button key={t} type="button" onClick={() => {
                    if (t === 'list') {
                      // Convert saved -> list, snapshotting the current resolved tickers.
                      const tickers = resolveUniverseTickers(setup.universe, savedUniverses)
                      patch({ universe: { type: 'list', tickers } })
                    } else {
                      // Switch to saved-ref form. Default to the first saved universe if any.
                      const first = (savedUniverses && savedUniverses[0]) ? savedUniverses[0].id : null
                      patch({ universe: { type: 'saved', universeId: first || '' } })
                    }
                  }} style={{
                    background: active ? LIME : 'transparent',
                    color: active ? '#000' : '#aaa',
                    border: `1px solid ${active ? LIME : BORDER}`,
                    padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                    fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                    textTransform: 'uppercase', fontWeight: active ? 700 : 500,
                  }}>{t === 'list' ? 'Ticker list' : 'Saved universe'}</button>
                )
              })}
            </div>
          </div>

          {universeIsSaved(setup.universe) ? (
            (() => {
              const sel = (savedUniverses || []).find(u => u.id === setup.universe.universeId)
              const resolved = resolveUniverseTickers(setup.universe, savedUniverses)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(!savedUniverses || savedUniverses.length === 0) && (
                    <div style={{ fontSize: 11, color: YELLOW, fontFamily: MONO, lineHeight: 1.5 }}>
                      No saved universes yet. Build one in Plan / Universe and Save it first, then come back here.
                    </div>
                  )}
                  {savedUniverses && savedUniverses.length > 0 && (
                    <select
                      value={setup.universe.universeId || ''}
                      onChange={e => patch({ universe: { type: 'saved', universeId: e.target.value } })}
                      style={{ ...inputStyle, width: '100%' }}
                    >
                      <option value="">— pick a saved universe —</option>
                      {[...savedUniverses].sort((a, b) => (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0)).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.tickers?.length || 0})</option>
                      ))}
                    </select>
                  )}
                  {sel && (
                    <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, lineHeight: 1.6 }}>
                      Linked to <strong style={{ color: FG }}>{sel.name}</strong> · resolves to {resolved.length} ticker{resolved.length === 1 ? '' : 's'} ({resolved.slice(0, 8).join(', ')}{resolved.length > 8 ? `, +${resolved.length - 8} more` : ''}).
                      Engine resolves at evaluation time, so updates to the saved universe propagate to this setup.
                    </div>
                  )}
                </div>
              )
            })()
          ) : (
            <>
              {initial && Array.isArray(initial.universe) === false && initial.universe?.type === 'list' && (initial.universe.tickers || []).length > 0 && isNew && (
                <div style={{ fontSize: 10, color: LIME, fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Universe loaded from screener ({(initial.universe.tickers || []).length} tickers)
                </div>
              )}
              {(savedUniverses && savedUniverses.length > 0) && (
                <select
                  value=""
                  onChange={e => {
                    const id = e.target.value
                    if (!id) return
                    const u = (savedUniverses || []).find(x => x.id === id)
                    if (!u) return
                    const merged = [...new Set([...(setup.universe?.tickers || []), ...(u.tickers || [])])]
                    patch({ universe: { type: 'list', tickers: merged } })
                    e.target.value = ''
                  }}
                  style={{ ...inputStyle, fontSize: 10, maxWidth: 240 }}
                  title="Append tickers from a saved screener universe"
                >
                  <option value="">+ Append from saved universe</option>
                  {[...savedUniverses].sort((a, b) => (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0)).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.tickers?.length || 0})</option>
                  ))}
                </select>
              )}
              <UniverseInput
                tickers={(setup.universe?.tickers) || []}
                onChange={(arr) => patch({ universe: { type: 'list', tickers: arr } })}
                suggestions={suggestionTickers}
              />
            </>
          )}
        </div>

        {/* CONDITIONS */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={sectionLabel}>Conditions</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Match:</span>
              {['all', 'any'].map(op => (
                <button key={op} onClick={() => patch({ operator: op })} style={{
                  background: setup.operator === op ? LIME : 'transparent',
                  color: setup.operator === op ? '#000' : '#aaa',
                  border: `1px solid ${setup.operator === op ? LIME : BORDER}`,
                  padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                  textTransform: 'uppercase', fontWeight: setup.operator === op ? 700 : 500,
                }}>{op}</button>
              ))}
            </div>
          </div>
          {(setup.conditions || []).map((c, i) => (
            <ConditionRow
              key={c.id || i}
              condition={c}
              onChange={(next) => updateCondition(i, next)}
              onRemove={() => removeCondition(i)}
            />
          ))}
          {picking
            ? <ConditionPicker onPick={addCondition} onCancel={() => setPicking(false)} />
            : (
              <button onClick={() => setPicking(true)} style={{
                background: 'transparent', color: LIME,
                border: `1px dashed ${LIME}55`, padding: '10px',
                borderRadius: 4, cursor: 'pointer', fontFamily: MONO, fontSize: 11,
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>+ Add condition</button>
            )
          }
        </div>

        {/* TRADE PLAN */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Trade plan</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={labelStyle}>Instrument</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['option', 'stock'].map(t => (
                  <button key={t} onClick={() => patchTradePlan({ instrumentType: t })} style={{
                    background: setup.tradePlan.instrumentType === t ? LIME : 'transparent',
                    color: setup.tradePlan.instrumentType === t ? '#000' : '#aaa',
                    border: `1px solid ${setup.tradePlan.instrumentType === t ? LIME : BORDER}`,
                    padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                    fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                    textTransform: 'uppercase', fontWeight: setup.tradePlan.instrumentType === t ? 700 : 500,
                  }}>{t}</button>
                ))}
              </div>
            </div>
            {setup.tradePlan.instrumentType === 'option' && (
              <div>
                <label style={labelStyle}>Option type</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['call', 'put'].map(t => (
                    <button key={t} onClick={() => patchTradePlan({ optionType: t })} style={{
                      background: setup.tradePlan.optionType === t ? (t === 'put' ? RED : LIME) : 'transparent',
                      color: setup.tradePlan.optionType === t ? '#000' : '#aaa',
                      border: `1px solid ${setup.tradePlan.optionType === t ? (t === 'put' ? RED : LIME) : BORDER}`,
                      padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                      fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                      textTransform: 'uppercase', fontWeight: setup.tradePlan.optionType === t ? 700 : 500,
                    }}>{t}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {setup.tradePlan.instrumentType === 'option' && (
              <>
                <div>
                  <label style={labelStyle}>Strike offset (fraction)</label>
                  <input type="number" step="0.01" value={setup.tradePlan.strikeOffset ?? ''} onChange={e => patchTradePlan({ strikeOffset: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>DTE</label>
                  <input type="number" value={setup.tradePlan.dte ?? ''} onChange={e => patchTradePlan({ dte: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
                </div>
              </>
            )}
            <div>
              <label style={labelStyle}>Sizing (fraction of account)</label>
              <input type="number" step="0.001" value={setup.tradePlan.sizingValue ?? ''} onChange={e => patchTradePlan({ sizingValue: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Target exit %</label>
              <input type="number" value={setup.tradePlan.targetExitPct ?? ''} onChange={e => patchTradePlan({ targetExitPct: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Stop exit %</label>
              <input type="number" value={setup.tradePlan.stopExitPct ?? ''} onChange={e => patchTradePlan({ stopExitPct: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Stop $ (alt)</label>
              <input type="number" step="0.01" value={setup.tradePlan.stopExitPrice ?? ''} onChange={e => patchTradePlan({ stopExitPrice: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
            </div>
            {setup.tradePlan.instrumentType === 'option' && (
              <div>
                <label style={labelStyle}>Time exit DTE</label>
                <input type="number" value={setup.tradePlan.timeExitDte ?? ''} onChange={e => patchTradePlan({ timeExitDte: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
              </div>
            )}
          </div>
        </div>

        {/* ALERTS */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Alerts</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!setup.alerts.enabled} onChange={e => patchAlerts({ enabled: e.target.checked })} />
            <span style={{ fontSize: 11, color: FG, fontFamily: MONO }}>Fire notifications when triggered</span>
          </label>
          <div>
            <label style={labelStyle}>Channels</label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {[
                { key: 'inApp', label: 'In-app toast' },
                { key: 'telegram', label: 'Telegram' },
                { key: 'email', label: 'Email' },
              ].map(ch => (
                <label key={ch.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!setup.alerts?.channels?.[ch.key]}
                    onChange={e => patchAlerts({ channels: { ...(setup.alerts?.channels || {}), [ch.key]: e.target.checked } })}
                  />
                  <span style={{ fontSize: 11, color: FG, fontFamily: MONO }}>{ch.label}</span>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, marginTop: 6, lineHeight: 1.5 }}>
              Telegram + email require env vars set in Vercel: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, RESEND_API_KEY + NOTIFICATION_EMAIL.
            </div>
          </div>
          <div>
            <label style={labelStyle}>Priority</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['normal', 'urgent'].map(p => (
                <button key={p} onClick={() => patchAlerts({ priority: p })} style={{
                  background: setup.alerts?.priority === p ? (p === 'urgent' ? RED : LIME) : 'transparent',
                  color: setup.alerts?.priority === p ? '#000' : '#aaa',
                  border: `1px solid ${setup.alerts?.priority === p ? (p === 'urgent' ? RED : LIME) : BORDER}`,
                  padding: '4px 12px', borderRadius: 3, cursor: 'pointer',
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                  textTransform: 'uppercase', fontWeight: setup.alerts?.priority === p ? 700 : 500,
                }}>{p}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Cooldown (minutes)</label>
            <input type="number" value={setup.alerts.cooldownMinutes ?? 60} onChange={e => patchAlerts({ cooldownMinutes: Number(e.target.value) || 0 })} style={{ ...inputStyle, width: 100 }} />
            <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>Prevents the same ticker from re-firing within this window.</span>
          </div>
        </div>

        {/* Activation gate */}
        {setup.status === 'active' && !backtestPasses(setup.backtest) && (
          <div style={{ background: '#150d04', border: `1px solid ${YELLOW}55`, borderRadius: 4, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, color: YELLOW, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>
              Activation gate
            </div>
            <div style={{ fontSize: 11, color: '#c8a030', fontFamily: MONO, lineHeight: 1.5 }}>
              This setup hasn't passed a backtest yet (need {MIN_BACKTEST_TRIGGERS}+ triggers and positive EV).
              {setup.backtest
                ? ` Current: ${setup.backtest.triggers || 0} triggers, EV ${(setup.backtest.expectedValue ?? 0).toFixed(2)}%.`
                : ' Save as Paused, open the setup, run a backtest, then promote.'}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={overrideActivation} onChange={e => setOverrideActivation(e.target.checked)} />
              <span style={{ fontSize: 11, color: FG, fontFamily: MONO }}>I know what I'm doing. Activate anyway.</span>
            </label>
          </div>
        )}

        {error && (
          <div style={{ background: '#150505', border: `1px solid ${RED}55`, color: RED, padding: '8px 12px', borderRadius: 4, fontSize: 11, fontFamily: MONO }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
            padding: '9px 18px', borderRadius: 4, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            background: LIME, color: '#000', border: 'none',
            padding: '9px 18px', borderRadius: 4, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
            fontWeight: 800,
          }}>Save setup</button>
        </div>
      </div>
    </div>
  )
}
