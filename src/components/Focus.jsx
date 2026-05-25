// ─────────────────────────────────────────────────────────────────────────────
// Focus.jsx — Plan / Focus sub-tab. Lists FocusedTickerCards plus the
// editor and adjust-setups modals.
//
// Owns:
//   - which card is being edited (drives ThesisEditor)
//   - which card is having its setup attachment adjusted (drives
//     AdjustSetupsModal)
// All persistence flows up via onFocusedTickersChange / onSetupsChange.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK } from '../constants.js'
import { buildSnapshot } from '../lib/conditionEvaluators.js'
import { createFocusedTicker } from '../lib/focusedTickersStorage.js'
import FocusedTickerCard from './FocusedTickerCard.jsx'
import ThesisEditor from './ThesisEditor.jsx'
import AdjustSetupsModal from './AdjustSetupsModal.jsx'

const FG = '#e8e8e8'
const MUTED = '#666'

export default function Focus({
  focusedTickers = [],
  onFocusedTickersChange,
  setups = [],
  onSetupsChange,
  liveDataMulti = {},
  setupHistMap = {},
  savedUniverses = [],
  accountValue = 25000,
  apiKey = '',
}) {
  const [editing, setEditing] = useState(null)   // { record, isNew }
  const [adjusting, setAdjusting] = useState(null) // record

  function updateFocused(updated) {
    if (!onFocusedTickersChange) return
    onFocusedTickersChange(prev => {
      const list = prev || []
      const idx = list.findIndex(f => f.ticker === updated.ticker)
      if (idx < 0) return [updated, ...list]
      const next = [...list]
      next[idx] = updated
      return next
    })
  }
  function removeFocused(rec) {
    if (!onFocusedTickersChange) return
    if (typeof window !== 'undefined' && !window.confirm(`Remove ${rec.ticker} from Focus?`)) return
    onFocusedTickersChange(prev => (prev || []).filter(f => f.ticker !== rec.ticker))
  }
  function handleNewClick() {
    setEditing({ record: createFocusedTicker({ ticker: '', thesisDirection: 'long' }), isNew: true })
  }
  function handleEditorSave(updated) {
    updateFocused(updated)
    setEditing(null)
  }

  function handleAdjustApply({ attachedSetupIds, patches }) {
    if (!adjusting) return
    // Patch setups' universes per the diff the modal returned.
    if (patches?.length && onSetupsChange) {
      onSetupsChange(prev => (prev || []).map(s => {
        const patch = patches.find(p => p.setupId === s.id)
        if (!patch) return s
        return { ...s, universe: patch.nextUniverse, updatedAt: new Date().toISOString() }
      }))
    }
    // Update the focused ticker's attachedSetupIds.
    updateFocused({ ...adjusting, attachedSetupIds, updatedAt: new Date().toISOString() })
    setAdjusting(null)
  }

  // Build per-card snapshot from live + cached daily bars.
  function snapshotFor(ticker) {
    const T = String(ticker || '').toUpperCase()
    const bundle = liveDataMulti?.[T]
    if (!bundle) return null
    const histBars = setupHistMap?.[T]?.bars || []
    return buildSnapshot(T, bundle, histBars, {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Per-ticker dashboards</div>
          <div style={{ fontSize: 22, color: FG, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Focus<span style={{ color: LIME }}>.</span>
          </div>
        </div>
        <button onClick={handleNewClick} style={{
          background: LIME, color: '#000', border: 'none', padding: '10px 16px',
          borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 800,
          letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
        }}>+ Focus on ticker</button>
      </div>

      {focusedTickers.length === 0 && (
        <div style={{ background: PANEL, border: `1px dashed ${BORDER}`, borderRadius: 5, padding: 28, textAlign: 'center', color: MUTED, fontSize: 11, fontFamily: MONO }}>
          No focused tickers yet. Use "+ Focus on ticker" to add the names you actively follow.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {focusedTickers.map(f => {
          const attached = (f.attachedSetupIds || []).map(id => setups.find(s => s.id === id)).filter(Boolean)
          const snap = snapshotFor(f.ticker)
          const bundle = liveDataMulti?.[f.ticker.toUpperCase()]
          return (
            <FocusedTickerCard
              key={f.ticker}
              focused={f}
              attachedSetups={attached}
              snapshot={snap}
              livePrice={bundle?.price ?? null}
              savedUniverses={savedUniverses}
              accountValue={accountValue}
              apiKey={apiKey}
              onEditThesis={(rec) => setEditing({ record: rec, isNew: false })}
              onAdjustSetups={(rec) => setAdjusting(rec)}
              onUpdateNotes={(notes) => updateFocused({ ...f, notes, updatedAt: new Date().toISOString() })}
              onRemove={removeFocused}
            />
          )
        })}
      </div>

      {editing && (
        <ThesisEditor
          initial={editing.record}
          isNew={editing.isNew}
          onSave={handleEditorSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {adjusting && (
        <AdjustSetupsModal
          ticker={adjusting.ticker}
          thesisDirection={adjusting.thesisDirection}
          currentAttachedIds={adjusting.attachedSetupIds || []}
          setups={setups}
          savedUniverses={savedUniverses}
          onCancel={() => setAdjusting(null)}
          onApply={handleAdjustApply}
        />
      )}
    </div>
  )
}
