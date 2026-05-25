// ─────────────────────────────────────────────────────────────────────────────
// AdjustSetupsModal.jsx — checkbox modal that picks which active setups
// watch a focused ticker.
//
// On confirm:
//   - The focused ticker's attachedSetupIds is replaced with the current
//     selection.
//   - Each newly-checked setup gets the ticker added to its universe.
//   - Each newly-unchecked setup gets the ticker removed (only if it
//     resolves to type='list'; type='saved' refs are left alone).
//
// Direction filter at the top defaults to only-compatible (long/either for
// a long thesis, short/either for short) but can be toggled to "all".
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK } from '../constants.js'
import { resolveUniverseTickers, universeIsSaved, universeAppendTickers } from '../lib/universeResolver.js'

const FG = '#e8e8e8'
const MUTED = '#666'

function dirColor(d) { return d === 'short' ? RED : d === 'either' || d === 'neutral' ? YELLOW : LIME }

export default function AdjustSetupsModal({
  ticker,
  thesisDirection = 'long',
  currentAttachedIds = [],
  setups = [],
  savedUniverses = [],
  onCancel,
  onApply,
}) {
  const T = String(ticker || '').toUpperCase()
  const [onlyCompatible, setOnlyCompatible] = useState(true)
  const initialSet = useMemo(() => new Set(currentAttachedIds || []), [currentAttachedIds])
  const [selected, setSelected] = useState(initialSet)

  const visible = useMemo(() => {
    const active = (setups || []).filter(s => (s.status || 'active') === 'active')
    if (!onlyCompatible) return active
    return active.filter(s => {
      const d = s.direction || 'either'
      if (d === 'either') return true
      if (thesisDirection === 'long') return d === 'long'
      if (thesisDirection === 'short') return d === 'short'
      return true
    })
  }, [setups, onlyCompatible, thesisDirection])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function confirm() {
    // Diff vs initial
    const added = []
    const removed = []
    for (const id of selected) if (!initialSet.has(id)) added.push(id)
    for (const id of initialSet) if (!selected.has(id)) removed.push(id)
    // Universe patches: add ticker to newly-checked setups, remove from unchecked.
    const patches = []
    for (const id of added) {
      const s = setups.find(x => x.id === id)
      if (!s) continue
      const nextU = universeAppendTickers(s.universe, [T], savedUniverses)
      patches.push({ setupId: id, nextUniverse: nextU })
    }
    for (const id of removed) {
      const s = setups.find(x => x.id === id)
      if (!s) continue
      if (universeIsSaved(s.universe)) {
        // Don't mutate saved-type refs from here. Skip silently.
        continue
      }
      const current = resolveUniverseTickers(s.universe, savedUniverses)
      const nextTickers = current.filter(t => t !== T)
      patches.push({ setupId: id, nextUniverse: { type: 'list', tickers: nextTickers } })
    }
    onApply({ attachedSetupIds: [...selected], patches })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 28, zIndex: 250,
    }}>
      <div style={{
        background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 6,
        width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12,
        padding: 18, fontFamily: MONO,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Adjust setup attachment</div>
            <div style={{ fontSize: 16, color: FG, fontWeight: 800 }}>{T}</div>
          </div>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontFamily: MONO, fontSize: 11 }}>
          <span style={{ color: MUTED }}>Thesis direction</span>
          <span style={{ color: dirColor(thesisDirection), fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{thesisDirection}</span>
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyCompatible} onChange={e => setOnlyCompatible(e.target.checked)} />
            <span style={{ color: FG }}>Only show compatible-direction setups</span>
          </label>
        </div>

        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, maxHeight: 360, overflowY: 'auto' }}>
          {visible.length === 0 && (
            <div style={{ padding: 14, fontSize: 11, color: MUTED, fontFamily: MONO, textAlign: 'center' }}>No active setups{onlyCompatible ? ' with a compatible direction' : ''}.</div>
          )}
          {visible.map(s => {
            const dc = dirColor(s.direction || 'either')
            const checked = selected.has(s.id)
            const resolved = resolveUniverseTickers(s.universe, savedUniverses)
            const alreadyHasTicker = resolved.map(t => String(t).toUpperCase()).includes(T)
            return (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid #131313`, cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} />
                <span style={{ fontSize: 12, color: FG, fontFamily: MONO, fontWeight: 700, flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 9, color: dc, fontFamily: MONO, fontWeight: 700, border: `1px solid ${dc}55`, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{s.direction || 'either'}</span>
                <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO }}>{resolved.length} ticker{resolved.length === 1 ? '' : 's'}</span>
                {universeIsSaved(s.universe) && (
                  <span title="Saved-universe-backed setup. Adding from here will switch its universe to a list snapshot." style={{ fontSize: 9, color: YELLOW, fontFamily: MONO, letterSpacing: '0.1em' }}>SAVED</span>
                )}
                {alreadyHasTicker && (
                  <span style={{ fontSize: 9, color: LIME, fontFamily: MONO, letterSpacing: '0.1em' }}>HAS {T}</span>
                )}
              </label>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa',
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>Cancel</button>
          <button onClick={confirm} style={{
            background: LIME, color: '#000', border: 'none',
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
            fontWeight: 800,
          }}>Apply</button>
        </div>
      </div>
    </div>
  )
}
