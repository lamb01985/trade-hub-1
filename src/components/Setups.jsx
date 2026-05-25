// ─────────────────────────────────────────────────────────────────────────────
// Setups.jsx — Plan / Setups tab.
//
// Container for the Setup list. Owns:
//   - filter + sort state
//   - editing state (drives the SetupBuilder modal)
//   - the shared backtest cache (so re-running setup B reuses bars fetched
//     for setup A)
//
// Each row renders via SetupCard. The builder modal renders inline at the
// bottom when editing is non-null.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, DARK } from '../constants.js'
import { createSetup } from '../lib/setupStorage.js'
import SetupCard from './SetupCard.jsx'
import SetupBuilder from './SetupBuilder.jsx'

const FG = '#e8e8e8'
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

export default function Setups({
  setups = [],
  onSetupsChange = null,
  evaluation = null,
  accountValue = 25000,
  apiKey = '',
  suggestionTickers = [],
}) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [editing, setEditing] = useState(null) // { setup, isNew }
  // Shared bar cache across backtest runs.
  const backtestCacheRef = useRef({})

  function updateSetup(updated) {
    if (!onSetupsChange) return
    onSetupsChange(prev => {
      const list = prev || []
      const idx = list.findIndex(s => s.id === updated.id)
      if (idx < 0) return [updated, ...list]
      const next = [...list]
      next[idx] = updated
      return next
    })
  }
  function removeSetup(id) {
    if (!onSetupsChange) return
    onSetupsChange(prev => (prev || []).filter(s => s.id !== id))
  }
  function handleSave(setup) {
    updateSetup({ ...setup, updatedAt: new Date().toISOString() })
    setEditing(null)
  }
  function handleNew() {
    setEditing({ setup: createSetup({ name: '', universe: [], conditions: [], status: 'paused' }), isNew: true })
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
      status: 'paused',
      alerts: { ...(setup.alerts || {}), lastTriggeredAt: {} },
      triggeredEvents: [],
      backtest: null,
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
  function handleBacktestResult(setupId, result) {
    if (!onSetupsChange) return
    onSetupsChange(prev => (prev || []).map(s => s.id === setupId
      ? { ...s, backtest: result, updatedAt: new Date().toISOString() }
      : s))
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
            apiKey={apiKey}
            backtestCache={backtestCacheRef.current}
            onBacktestResult={handleBacktestResult}
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
