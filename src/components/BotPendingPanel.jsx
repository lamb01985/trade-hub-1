// ─────────────────────────────────────────────────────────────────────────────
// BotPendingPanel.jsx — "Also live" pending setups queue.
//
// Renders up to 3 non-primary tickers currently in WATCH, GO, or IN_TRADE.
// Each row carries enough info to act without scrolling: setup name,
// direction, confluence, entry/stop/target, and per-row Take / Skip buttons.
//
// Take expands inline to capture optional strike/premium/contracts before
// committing the position (so the primary right-now card's input flow is
// preserved for non-primary takes).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { LIME, RED, YELLOW, BLUE, PANEL, BORDER, MONO, SANS, f2 } from '../constants.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const STATE_STYLE = {
  GO:       { color: LIME,   label: 'GO' },
  WATCH:    { color: YELLOW, label: 'WATCH' },
  IN_TRADE: { color: BLUE,   label: 'IN TRADE' },
}

function PendingRow({ card, onTakeIt, onSkipIt }) {
  const [takeOpen, setTakeOpen] = useState(false)
  const [strike, setStrike] = useState('')
  const [premium, setPremium] = useState('')
  const [contracts, setContracts] = useState('1')

  const style = STATE_STYLE[card.state] || { color: DIM, label: card.state }
  const setup = card.setup
  const dir = (setup?.direction || '').toUpperCase()
  const dirColor = dir === 'LONG' ? LIME : RED

  function handleConfirmTake() {
    const opts = {
      strike: strike === '' ? null : Number(strike),
      premium: premium === '' ? 0 : Number(premium),
      contracts: Math.max(1, parseInt(contracts) || 1),
    }
    onTakeIt(card.ticker, opts)
    setTakeOpen(false)
    setStrike(''); setPremium(''); setContracts('1')
  }

  return (
    <div style={{
      background: '#0a0a0a', border: `1px solid ${style.color}44`, borderRadius: 5,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            display: 'inline-block', fontSize: 9, color: style.color,
            border: `1px solid ${style.color}55`, padding: '2px 7px', borderRadius: 3,
            letterSpacing: '0.14em', fontWeight: 700,
          }}>{style.label}</span>
          <span style={{ fontSize: 12, color: FG, fontFamily: MONO, fontWeight: 800, letterSpacing: '0.06em' }}>
            {card.ticker}
          </span>
          {setup && (
            <span style={{ fontSize: 11, color: '#bbb', fontFamily: SANS, fontWeight: 700 }}>
              {setup.setupName}
            </span>
          )}
          {dir && (
            <span style={{ fontSize: 10, color: dirColor, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.14em' }}>{dir}</span>
          )}
          {setup?.confidence != null && card.state === 'GO' && (
            <span style={{ fontSize: 10, color: LIME, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.1em' }}>
              {setup.confidence}/10
            </span>
          )}
        </div>

        {card.state === 'GO' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setTakeOpen(o => !o)}
              style={{
                background: LIME, color: '#000', border: 'none', borderRadius: 3,
                padding: '6px 14px', fontFamily: MONO, fontSize: 10, fontWeight: 800,
                letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >{takeOpen ? 'Close form' : 'I took it'}</button>
            <button
              onClick={() => onSkipIt(card.ticker)}
              style={{
                background: 'transparent', color: YELLOW, border: `1px solid ${YELLOW}55`, borderRadius: 3,
                padding: '6px 12px', fontFamily: MONO, fontSize: 10, fontWeight: 800,
                letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >Skip</button>
          </div>
        )}
      </div>

      {setup && card.state !== 'IN_TRADE' && (
        <div style={{ display: 'flex', gap: 18, fontFamily: MONO, fontSize: 10, color: DIM, letterSpacing: '0.06em' }}>
          <span>Entry <span style={{ color: FG }}>${f2(setup.entry)}</span></span>
          <span>Stop <span style={{ color: RED }}>${f2(setup.stop)}</span></span>
          <span>Target <span style={{ color: LIME }}>${f2(setup.target)}</span></span>
        </div>
      )}

      {card.state === 'IN_TRADE' && card.position && (
        <div style={{ display: 'flex', gap: 18, fontFamily: MONO, fontSize: 10, color: DIM, letterSpacing: '0.06em' }}>
          <span>Entry <span style={{ color: FG }}>${f2(card.position.entryUnderlying)}</span></span>
          <span>Now <span style={{ color: FG }}>${f2(card.position.currentUnderlying)}</span></span>
          <span>Unrealized <span style={{ color: (card.position.unrealizedPL ?? 0) >= 0 ? LIME : RED }}>{
            (card.position.unrealizedPL ?? 0) >= 0 ? '+' : '-'
          }${Math.abs(card.position.unrealizedPL ?? 0).toFixed(2)}</span></span>
        </div>
      )}

      {takeOpen && card.state === 'GO' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px auto', gap: 8, alignItems: 'center', paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Strike</span>
            <input type="number" step="0.01" value={strike} onChange={e => setStrike(e.target.value)} placeholder="opt"
              style={{ background: '#000', color: FG, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '5px 8px', fontFamily: MONO, fontSize: 11 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Premium</span>
            <input type="number" step="0.01" value={premium} onChange={e => setPremium(e.target.value)} placeholder="opt"
              style={{ background: '#000', color: FG, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '5px 8px', fontFamily: MONO, fontSize: 11 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Qty</span>
            <input type="number" min="1" value={contracts} onChange={e => setContracts(e.target.value)}
              style={{ background: '#000', color: FG, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '5px 8px', fontFamily: MONO, fontSize: 11 }} />
          </label>
          <button
            onClick={handleConfirmTake}
            style={{
              background: LIME, color: '#000', border: 'none', borderRadius: 3,
              padding: '6px 14px', fontFamily: MONO, fontSize: 10, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
              alignSelf: 'end',
            }}
          >Confirm</button>
        </div>
      )}
    </div>
  )
}

export default function BotPendingPanel({ pendingCards = [], onTakeIt, onSkipIt }) {
  if (!pendingCards || pendingCards.length === 0) return null
  return (
    <div style={{
      background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: MONO,
      }}>
        <span style={{ fontSize: 9, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Also live
        </span>
        <span style={{ fontSize: 9, color: '#444', letterSpacing: '0.08em' }}>
          {pendingCards.length} additional setup{pendingCards.length === 1 ? '' : 's'}
        </span>
      </div>
      {pendingCards.map(card => (
        <PendingRow key={card.ticker} card={card} onTakeIt={onTakeIt} onSkipIt={onSkipIt} />
      ))}
    </div>
  )
}
