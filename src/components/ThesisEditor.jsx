// ─────────────────────────────────────────────────────────────────────────────
// ThesisEditor.jsx — modal form for the per-ticker thesis structure.
//
// Opened from FocusedTickerCard via "Edit thesis". Mirrors the
// focusedTickersStorage schema: direction toggle, description, repeating
// lists of entry zones + targets, single invalidation level, time horizon,
// freeform markdown notes. The ticker is locked once the record exists.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK } from '../constants.js'

const FG = '#e8e8e8'
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

function uid() { return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}` }

function ZoneRow({ row, onChange, onRemove }) {
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 8 }}>
      <input type="number" step="0.01" value={row.price ?? ''} onChange={e => onChange({ ...row, price: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Price" style={inputStyle} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input type="text" value={row.label || ''} onChange={e => onChange({ ...row, label: e.target.value })} placeholder="Label (e.g. First support break)" style={inputStyle} />
        <input type="text" value={row.notes || ''} onChange={e => onChange({ ...row, notes: e.target.value })} placeholder="Notes" style={inputStyle} />
      </div>
      <button onClick={onRemove} style={{
        background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
        padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO,
        fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', alignSelf: 'flex-start',
      }}>Remove</button>
    </div>
  )
}

function TargetRow({ row, onChange, onRemove }) {
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 10, display: 'grid', gridTemplateColumns: '90px 110px 1fr auto', gap: 8 }}>
      <input type="number" step="0.01" value={row.price ?? ''} onChange={e => onChange({ ...row, price: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Price" style={inputStyle} />
      <select value={row.type || 'target_1'} onChange={e => onChange({ ...row, type: e.target.value })} style={inputStyle}>
        <option value="target_1">Target 1</option>
        <option value="target_2">Target 2</option>
        <option value="target_3">Target 3</option>
        <option value="target_extended">Extended</option>
      </select>
      <input type="text" value={row.notes || ''} onChange={e => onChange({ ...row, notes: e.target.value })} placeholder="Notes" style={inputStyle} />
      <button onClick={onRemove} style={{
        background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
        padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO,
        fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>Remove</button>
    </div>
  )
}

export default function ThesisEditor({ initial, isNew = false, onSave, onCancel }) {
  const [record, setRecord] = useState(() => ({ ...(initial || {}) }))
  const [error, setError] = useState('')

  useEffect(() => { setRecord({ ...(initial || {}) }) }, [initial])

  function patch(p) { setRecord(prev => ({ ...prev, ...p })) }
  function patchInv(p) { setRecord(prev => ({ ...prev, invalidationLevel: { ...(prev.invalidationLevel || {}), ...p } })) }

  function addZone() {
    setRecord(prev => ({ ...prev, entryZones: [...(prev.entryZones || []), { id: uid(), price: null, label: '', notes: '' }] }))
  }
  function updateZone(i, next) {
    setRecord(prev => {
      const arr = [...(prev.entryZones || [])]
      arr[i] = next
      return { ...prev, entryZones: arr }
    })
  }
  function removeZone(i) {
    setRecord(prev => ({ ...prev, entryZones: (prev.entryZones || []).filter((_, idx) => idx !== i) }))
  }

  function addTarget() {
    setRecord(prev => ({ ...prev, targets: [...(prev.targets || []), { id: uid(), price: null, type: 'target_1', notes: '' }] }))
  }
  function updateTarget(i, next) {
    setRecord(prev => {
      const arr = [...(prev.targets || [])]
      arr[i] = next
      return { ...prev, targets: arr }
    })
  }
  function removeTarget(i) {
    setRecord(prev => ({ ...prev, targets: (prev.targets || []).filter((_, idx) => idx !== i) }))
  }

  function handleSave() {
    const ticker = String(record.ticker || '').trim().toUpperCase()
    if (!ticker || !/^[A-Z]{1,6}$/.test(ticker)) { setError('Ticker is required (1-6 uppercase letters).'); return }
    setError('')
    onSave({ ...record, ticker, updatedAt: new Date().toISOString() })
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 28, zIndex: 240, overflowY: 'auto',
    }}>
      <div style={{
        background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 6,
        width: '100%', maxWidth: 800, display: 'flex', flexDirection: 'column', gap: 14,
        padding: 18, fontFamily: MONO,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: FG, letterSpacing: '-0.01em' }}>
            {isNew ? 'New focused ticker' : `Edit thesis: ${record.ticker}`}
          </div>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Identity + direction */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Identity</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 140px' }}>
              <label style={labelStyle}>Ticker</label>
              <input
                value={record.ticker || ''}
                onChange={e => patch({ ticker: e.target.value.toUpperCase() })}
                disabled={!isNew}
                placeholder="e.g. CRWD"
                maxLength={6}
                style={{ ...inputStyle, width: '100%', textTransform: 'uppercase', opacity: isNew ? 1 : 0.7 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Direction</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['long', 'short', 'neutral'].map(d => (
                  <button key={d} onClick={() => patch({ thesisDirection: d })} style={{
                    background: record.thesisDirection === d ? (d === 'short' ? RED : d === 'neutral' ? YELLOW : LIME) : 'transparent',
                    color: record.thesisDirection === d ? '#000' : '#aaa',
                    border: `1px solid ${record.thesisDirection === d ? (d === 'short' ? RED : d === 'neutral' ? YELLOW : LIME) : BORDER}`,
                    padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                    fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
                    textTransform: 'uppercase', fontWeight: record.thesisDirection === d ? 700 : 500,
                  }}>{d}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Time horizon</label>
              <input value={record.timeHorizon || ''} onChange={e => patch({ timeHorizon: e.target.value })} placeholder="e.g. 4-8 weeks for primary move" style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Thesis description</label>
            <textarea value={record.thesisDescription || ''} onChange={e => patch({ thesisDescription: e.target.value })} rows={4} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} placeholder="What's the thesis? Why this name, why now?" />
          </div>
        </div>

        {/* Entry zones */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={sectionLabel}>Entry zones</div>
            <button onClick={addZone} style={{
              background: 'transparent', color: LIME,
              border: `1px dashed ${LIME}55`, padding: '5px 12px',
              borderRadius: 3, cursor: 'pointer', fontFamily: MONO, fontSize: 10,
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>+ Add zone</button>
          </div>
          {(record.entryZones || []).length === 0 && (
            <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>No entry zones yet. Add one to anchor the entry plan.</div>
          )}
          {(record.entryZones || []).map((z, i) => (
            <ZoneRow key={z.id || i} row={z} onChange={(next) => updateZone(i, next)} onRemove={() => removeZone(i)} />
          ))}
        </div>

        {/* Targets */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={sectionLabel}>Targets</div>
            <button onClick={addTarget} style={{
              background: 'transparent', color: LIME,
              border: `1px dashed ${LIME}55`, padding: '5px 12px',
              borderRadius: 3, cursor: 'pointer', fontFamily: MONO, fontSize: 10,
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>+ Add target</button>
          </div>
          {(record.targets || []).length === 0 && (
            <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>No targets yet.</div>
          )}
          {(record.targets || []).map((t, i) => (
            <TargetRow key={t.id || i} row={t} onChange={(next) => updateTarget(i, next)} onRemove={() => removeTarget(i)} />
          ))}
        </div>

        {/* Invalidation */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Invalidation level</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" step="0.01" value={record.invalidationLevel?.price ?? ''} onChange={e => patchInv({ price: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Price" style={{ ...inputStyle, width: 110 }} />
            <input type="text" value={record.invalidationLevel?.notes ?? ''} onChange={e => patchInv({ notes: e.target.value })} placeholder="Why this invalidates the thesis" style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>

        {/* Notes */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Notes (markdown)</div>
          <textarea value={record.notes || ''} onChange={e => patch({ notes: e.target.value })} rows={6} style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5 }} placeholder="Freeform notes: catalysts, comparables, journal entries..." />
        </div>

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
          }}>Save thesis</button>
        </div>
      </div>
    </div>
  )
}
