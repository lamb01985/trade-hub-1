// ─────────────────────────────────────────────────────────────────────────────
// BotWatchlistChips.jsx — multi-ticker watchlist editor + status row.
//
// One chip per ticker. Each chip shows ticker, current state, live price,
// color-coded by state. Click to expand a context drawer below the row
// (nearest level, MTF regime, current setup if any). Add input + per-chip
// remove. Capped at MAX_BOT_WATCHLIST tickers.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { LIME, RED, YELLOW, BLUE, PANEL, BORDER, MONO, f2 } from '../constants.js'
import { computeMTF, alignmentScore } from '../lib/structure.js'
import { nearestTradableLevel } from '../lib/bot.js'

export const MAX_BOT_WATCHLIST = 5

const STATE_COLOR = {
  WAIT:     '#888',
  WATCH:    YELLOW,
  GO:       LIME,
  IN_TRADE: BLUE,
  CLOSED:   '#aaa',
  LOCKED:   RED,
}

const STATE_LABEL = {
  WAIT:     'WAIT',
  WATCH:    'WATCH',
  GO:       'GO',
  IN_TRADE: 'IN TRADE',
  CLOSED:   'CLOSED',
  LOCKED:   'LOCKED',
}

// Pull just the engine-relevant levels out of a live data bundle so the
// chip drawer can show "what's in range" without duplicating engine logic.
function levelsFromBundle(bundle) {
  const out = {}
  if (bundle?.vwapData?.vwap != null) out.VWAP = bundle.vwapData.vwap
  const p = bundle?.pivots
  if (p?.pp != null) out.P = p.pp
  if (p?.r1 != null) out.R1 = p.r1
  if (p?.r2 != null) out.R2 = p.r2
  if (p?.r3 != null) out.R3 = p.r3
  if (p?.s1 != null) out.S1 = p.s1
  if (p?.s2 != null) out.S2 = p.s2
  if (p?.s3 != null) out.S3 = p.s3
  const pd = bundle?.prevDay
  if (pd?.high != null) out.PDH = pd.high
  if (pd?.low != null) out.PDL = pd.low
  if (pd?.close != null) out.PDC = pd.close
  return out
}

function Chip({ chip, isExpanded, onToggleExpand, onRemove, locked }) {
  const stateColor = STATE_COLOR[chip.state] || '#888'
  const stateLabel = STATE_LABEL[chip.state] || 'WAIT'
  const accent = chip.state === 'GO' || chip.state === 'WATCH' || chip.state === 'IN_TRADE'
  return (
    <button
      onClick={onToggleExpand}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: isExpanded ? '#101010' : 'transparent',
        border: `1px solid ${accent ? stateColor : BORDER}`,
        borderRadius: 4,
        padding: '6px 10px 6px 12px',
        fontFamily: MONO,
        cursor: 'pointer',
        boxShadow: accent ? `0 0 0 2px ${stateColor}22` : 'none',
      }}
    >
      <span style={{ fontSize: 11, color: '#e8e8e8', fontWeight: 800, letterSpacing: '0.08em' }}>{chip.ticker}</span>
      <span style={{ width: 1, height: 12, background: BORDER }} />
      <span style={{ fontSize: 9, color: stateColor, fontWeight: 700, letterSpacing: '0.14em' }}>{stateLabel}</span>
      <span style={{ width: 1, height: 12, background: BORDER }} />
      <span style={{ fontSize: 11, color: '#aaa', fontWeight: 700 }}>
        {chip.price != null ? `$${f2(chip.price)}` : '—'}
      </span>
      {!locked && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onRemove() } }}
          title={`Remove ${chip.ticker} from watchlist`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, borderRadius: 8,
            color: '#666', fontSize: 10, marginLeft: 4,
            cursor: 'pointer', background: 'transparent', border: '1px solid transparent',
          }}
        >×</span>
      )}
    </button>
  )
}

function AddInput({ onAdd, disabled }) {
  const [value, setValue] = useState('')
  function commit() {
    const t = value.trim().toUpperCase()
    if (!t) return
    if (!/^[A-Z]{1,6}$/.test(t)) { setValue(''); return }
    onAdd(t)
    setValue('')
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        value={value}
        onChange={e => setValue(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        placeholder={disabled ? 'Max reached' : 'Add ticker'}
        disabled={disabled}
        maxLength={6}
        style={{
          width: 96, background: '#0a0a0a', border: `1px dashed ${BORDER}`, borderRadius: 4,
          color: '#e8e8e8', fontFamily: MONO, fontSize: 11, padding: '6px 10px', outline: 'none',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      <button
        onClick={commit}
        disabled={disabled || !value.trim()}
        style={{
          background: 'transparent', border: `1px solid ${BORDER}`,
          color: disabled ? '#444' : '#aaa', fontFamily: MONO, fontSize: 10,
          padding: '6px 10px', borderRadius: 3,
          cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
          letterSpacing: '0.1em',
        }}
      >+ ADD</button>
    </div>
  )
}

function ExpandedDrawer({ chip, bundle }) {
  const levels = useMemo(() => levelsFromBundle(bundle), [bundle])
  const near = useMemo(() => nearestTradableLevel(levels, chip.price ?? 0), [levels, chip.price])
  const align = useMemo(() => {
    const mtf = computeMTF(bundle?.intradayBars || [])
    if (!mtf) return null
    return alignmentScore(mtf, bundle?.rvol ?? null)
  }, [bundle?.intradayBars, bundle?.rvol])

  // Sort levels by distance from price for the "in range" list.
  const sortedLevels = useMemo(() => {
    if (chip.price == null) return []
    const arr = []
    for (const [name, price] of Object.entries(levels)) {
      arr.push({ name, price, distance: Math.abs(price - chip.price) })
    }
    arr.sort((a, b) => a.distance - b.distance)
    return arr.slice(0, 6)
  }, [levels, chip.price])

  return (
    <div style={{
      background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4,
      padding: '12px 14px', marginTop: -2, display: 'flex', flexDirection: 'column', gap: 10,
      fontFamily: MONO,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Nearest level</div>
          {near ? (
            <>
              <div style={{ fontSize: 12, color: '#e8e8e8', fontWeight: 800 }}>{near.name} ${f2(near.price)}</div>
              <div style={{ fontSize: 10, color: '#666' }}>{`$${f2(near.distance)} away`}</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#444' }}>No tradable level loaded.</div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Regime</div>
          {align ? (
            <>
              <div style={{ fontSize: 12, color: '#e8e8e8', fontWeight: 800 }}>{align.label || align.direction}</div>
              <div style={{ fontSize: 10, color: '#666' }}>Score {align.score ?? '—'}/100</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#444' }}>Waiting for bars.</div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Current setup</div>
          {chip.setup ? (
            <>
              <div style={{ fontSize: 12, color: '#e8e8e8', fontWeight: 800 }}>{chip.setup.setupName}</div>
              <div style={{ fontSize: 10, color: chip.setup.direction === 'long' ? LIME : RED, letterSpacing: '0.12em', fontWeight: 700 }}>
                {(chip.setup.direction || '').toUpperCase()}{chip.setup.confidence ? `, ${chip.setup.confidence}/10` : ''}
              </div>
            </>
          ) : chip.position ? (
            <>
              <div style={{ fontSize: 12, color: '#e8e8e8', fontWeight: 800 }}>{chip.position.setupName}</div>
              <div style={{ fontSize: 10, color: BLUE, letterSpacing: '0.12em', fontWeight: 700 }}>Position open</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#444' }}>None yet.</div>
          )}
        </div>
      </div>

      {sortedLevels.length > 0 && (
        <div style={{ paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Levels in range</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sortedLevels.map(l => (
              <span key={l.name} style={{
                fontSize: 10, color: '#aaa', fontFamily: MONO,
                border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 8px',
              }}>{l.name} ${f2(l.price)} <span style={{ color: '#555' }}>({l.distance < 0.5 ? '<$0.50' : `$${f2(l.distance)}`})</span></span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BotWatchlistChips({
  chips = [],
  liveDataMulti = {},
  watchlist = [],
  onWatchlistChange = null,
  locked = false,
}) {
  const [expanded, setExpanded] = useState(null)

  function handleAdd(ticker) {
    if (!onWatchlistChange) return
    onWatchlistChange(prev => {
      const list = Array.isArray(prev) ? prev : []
      if (list.length >= MAX_BOT_WATCHLIST) return list
      const upper = ticker.toUpperCase()
      if (list.map(t => t.toUpperCase()).includes(upper)) return list
      return [...list, upper]
    })
  }

  function handleRemove(ticker) {
    if (!onWatchlistChange) return
    onWatchlistChange(prev => {
      const list = Array.isArray(prev) ? prev : []
      if (list.length <= 1) return list // never drop below 1 ticker
      return list.filter(t => t.toUpperCase() !== ticker.toUpperCase())
    })
  }

  const canAdd = (watchlist?.length || 0) < MAX_BOT_WATCHLIST && !locked

  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: '#666', fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 4 }}>
          Watchlist
        </span>
        {chips.map(chip => (
          <Chip
            key={chip.ticker}
            chip={chip}
            isExpanded={expanded === chip.ticker}
            onToggleExpand={() => setExpanded(prev => prev === chip.ticker ? null : chip.ticker)}
            onRemove={() => handleRemove(chip.ticker)}
            locked={locked}
          />
        ))}
        <AddInput onAdd={handleAdd} disabled={!canAdd} />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#444', fontFamily: MONO, letterSpacing: '0.08em' }}>
          {chips.length}/{MAX_BOT_WATCHLIST} tickers
        </span>
      </div>
      {expanded && chips.find(c => c.ticker === expanded) && (
        <div style={{ marginTop: 12 }}>
          <ExpandedDrawer chip={chips.find(c => c.ticker === expanded)} bundle={liveDataMulti[expanded]} />
        </div>
      )}
    </div>
  )
}
