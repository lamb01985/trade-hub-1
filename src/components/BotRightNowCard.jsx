// ─────────────────────────────────────────────────────────────────────────────
// BotRightNowCard.jsx — hero card driven by the coach engine state.
//
// One card, six sub-renders, switched on currentCard.state:
//   WAIT      quiet, "watching for a setup"
//   WATCH     yellow, forming setup at a level, plan visible, no buttons
//   GO        loud, 60s countdown, Take it / Skip it
//   IN_TRADE  open position, live P/L, manual close
//   CLOSED    last result, auto dismiss in 30s, manual dismiss button
//   LOCKED    daily loss limit hit, typed UNLOCK confirmation required
//
// All UI tokens come from constants.js. No em-dashes. Sentence case labels.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { LIME, RED, YELLOW, BLUE, PURPLE, ORANGE, PANEL, BORDER, MONO, SANS, f2, fmtD } from '../constants.js'

const CARD_BG = PANEL
const CARD_BG_GO = '#0e1707'
const CARD_BG_WATCH = '#16140a'
const CARD_BG_LOCKED = '#170a0a'
const MUTED = '#666'
const FG = '#e8e8e8'
const DIM = '#888'

function StateTag({ label, color }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 3, border: `1px solid ${color}55`, color, fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', fontWeight: 700, textTransform: 'uppercase' }}>
      {label}
    </span>
  )
}

function Field({ label, value, color = FG, mono = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, color, fontFamily: mono ? MONO : SANS, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Btn({ children, onClick, color = LIME, ghost = false, disabled = false, size = 'md', title, full = false }) {
  const padding = size === 'lg' ? '12px 22px' : size === 'sm' ? '5px 11px' : '8px 16px'
  const fontSize = size === 'lg' ? 12 : size === 'sm' ? 9 : 11
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: disabled ? '#1a1a1a' : ghost ? 'transparent' : color,
        color: disabled ? '#555' : ghost ? color : '#0a0a0a',
        border: ghost ? `1px solid ${color}55` : 'none',
        borderRadius: 4,
        padding,
        fontFamily: MONO,
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: full ? '100%' : 'auto',
        opacity: disabled ? 0.5 : 1,
      }}
    >{children}</button>
  )
}

// ─── WAIT ──────────────────────────────────────────────────────────────────
function WaitView({ ticker, checklistRequired }) {
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 24, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <StateTag label="Waiting" color={DIM} />
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em' }}>{ticker}</span>
      </div>
      {checklistRequired ? (
        <div>
          <div style={{ fontSize: 14, color: YELLOW, fontWeight: 700, marginBottom: 6 }}>Checklist not complete</div>
          <div style={{ fontSize: 12, color: DIM, lineHeight: 1.6 }}>
            The coach stays disarmed until today's Check verdict reads TRADE. Open the Check tab, pass the rules, and the bot will start scanning.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 14, color: FG, fontWeight: 700, marginBottom: 6 }}>Scanning the playbook</div>
          <div style={{ fontSize: 12, color: DIM, lineHeight: 1.6 }}>
            No setup is forming right now. The bot is checking each tick against levels, time of day, multi-timeframe alignment, and volume. When confluence reaches the threshold you will see a setup here.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WATCH ─────────────────────────────────────────────────────────────────
function WatchView({ setup, ticker }) {
  if (!setup) return null
  const dir = (setup.direction || '').toUpperCase()
  const dirColor = dir === 'LONG' ? LIME : RED
  return (
    <div style={{ background: CARD_BG_WATCH, border: `1px solid ${YELLOW}44`, borderRadius: 6, padding: 22, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <StateTag label="Watching" color={YELLOW} />
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em' }}>{ticker}</span>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, color: FG, fontWeight: 800, letterSpacing: '-0.01em' }}>{setup.setupName}</div>
        <div style={{ fontSize: 11, color: dirColor, fontFamily: MONO, letterSpacing: '0.14em', fontWeight: 700, marginTop: 2 }}>{dir} candidate</div>
      </div>
      <div style={{ fontSize: 12, color: DIM, lineHeight: 1.6, marginBottom: 16 }}>{setup.why}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
        <Field label="Entry" value={`$${f2(setup.entry)}`} />
        <Field label="Stop" value={`$${f2(setup.stop)}`} color={RED} />
        <Field label="Target" value={`$${f2(setup.target)}`} color={LIME} />
      </div>
      <div style={{ marginTop: 14, fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.06em' }}>
        Waiting for the entry candle. No buttons until the signal confirms.
      </div>
    </div>
  )
}

// ─── GO ────────────────────────────────────────────────────────────────────
function GoView({ setup, goExpiresAt, ticker, onTakeIt, onSkipIt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])
  const [strike, setStrike] = useState('')
  const [premium, setPremium] = useState('')
  const [contracts, setContracts] = useState('1')

  if (!setup) return null
  const secondsLeft = Math.max(0, Math.ceil(((goExpiresAt || 0) - now) / 1000))
  const dir = (setup.direction || '').toUpperCase()
  const dirColor = dir === 'LONG' ? LIME : RED
  const optDir = (setup.optionDirection || '').toUpperCase()
  const optColor = optDir === 'CALL' ? LIME : RED

  function handleTake() {
    const s = strike === '' ? null : Number(strike)
    const p = premium === '' ? 0 : Number(premium)
    const c = Math.max(1, parseInt(contracts) || 1)
    onTakeIt({ strike: s, premium: p, contracts: c })
  }

  return (
    <div style={{ background: CARD_BG_GO, border: `1px solid ${LIME}`, borderRadius: 6, padding: 22, fontFamily: SANS, boxShadow: `0 0 0 3px ${LIME}11` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <StateTag label="GO" color={LIME} />
        <span style={{ fontSize: 11, color: secondsLeft <= 10 ? RED : YELLOW, fontFamily: MONO, fontWeight: 800, letterSpacing: '0.14em' }}>
          {secondsLeft}s window
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 19, color: FG, fontWeight: 800, letterSpacing: '-0.01em' }}>{setup.setupName}</span>
        <span style={{ fontSize: 11, color: dirColor, fontFamily: MONO, fontWeight: 800, letterSpacing: '0.14em' }}>{dir}</span>
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', marginLeft: 'auto' }}>{ticker}</span>
      </div>

      <div style={{ fontSize: 10, color: LIME, fontFamily: MONO, fontWeight: 700, marginBottom: 12, letterSpacing: '0.1em' }}>
        Confluence {setup.confidence}/10
      </div>

      <div style={{ fontSize: 12, color: DIM, lineHeight: 1.6, marginBottom: 14 }}>{setup.why}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
        <Field label="Entry" value={`$${f2(setup.entry)}`} />
        <Field label="Stop" value={`$${f2(setup.stop)}`} color={RED} />
        <Field label="Target" value={`$${f2(setup.target)}`} color={LIME} />
        <Field label="Option" value={`${optDir} ${(setup.optionStrikeRule || 'ATM').toUpperCase()}`} color={optColor} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
        <PaperField label="Strike (optional)" value={strike} setValue={setStrike} placeholder="e.g. 590" />
        <PaperField label="Premium paid" value={premium} setValue={setPremium} placeholder="e.g. 1.20" />
        <PaperField label="Contracts" value={contracts} setValue={setContracts} placeholder="1" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Btn onClick={handleTake} color={LIME} size="lg" full>I took it</Btn>
        <Btn onClick={onSkipIt} color={YELLOW} ghost size="lg" full>Skip</Btn>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: MUTED, fontFamily: MONO, lineHeight: 1.6, letterSpacing: '0.04em' }}>
        Strike and premium are only used for paper P/L. Leave blank to mark the entry without an option estimate.
      </div>
    </div>
  )
}

function PaperField({ label, value, setValue, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        style={{ background: '#0a0a0a', color: FG, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '6px 9px', fontFamily: MONO, fontSize: 12 }}
      />
    </label>
  )
}

// ─── IN_TRADE ──────────────────────────────────────────────────────────────
function InTradeView({ position, ticker, onCloseManually }) {
  const [exitPremium, setExitPremium] = useState('')
  const [showClose, setShowClose] = useState(false)

  if (!position) return null
  const dir = (position.direction || '').toUpperCase()
  const dirColor = dir === 'LONG' ? LIME : RED
  const upl = position.unrealizedPL || 0
  const uplColor = upl >= 0 ? LIME : RED
  const heldMs = Date.now() - (position.openedAt || Date.now())
  const heldMin = Math.floor(heldMs / 60000)
  const heldSec = Math.floor((heldMs % 60000) / 1000)

  function handleConfirmClose() {
    const v = exitPremium === '' ? position.premiumPaid : Number(exitPremium)
    onCloseManually(v)
    setShowClose(false)
    setExitPremium('')
  }

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BLUE}55`, borderRadius: 6, padding: 22, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <StateTag label="In trade" color={BLUE} />
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em' }}>
          {ticker} · {heldMin}m {heldSec}s
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 17, color: FG, fontWeight: 800 }}>{position.setupName}</span>
        <span style={{ fontSize: 11, color: dirColor, fontFamily: MONO, fontWeight: 800, letterSpacing: '0.14em' }}>{dir}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
        <Field label="Entry" value={`$${f2(position.entryUnderlying)}`} />
        <Field label="Now" value={`$${f2(position.currentUnderlying)}`} />
        <Field label="Stop" value={`$${f2(position.stopUnderlying)}`} color={RED} />
        <Field label="Target" value={`$${f2(position.targetUnderlying)}`} color={LIME} />
        <Field label="Unrealized" value={fmtD(upl)} color={uplColor} />
      </div>

      {position.optionStrike != null && (
        <div style={{ marginTop: 12, fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.04em' }}>
          Paper option: {position.contracts}x {(position.optionDirection || '').toUpperCase()} @ ${f2(position.optionStrike)}, paid ${f2(position.premiumPaid)}.
          P/L estimated from a delta of {position.delta.toFixed(2)}.
        </div>
      )}

      {!showClose ? (
        <div style={{ marginTop: 16 }}>
          <Btn onClick={() => setShowClose(true)} color={BLUE} size="md">Close manually</Btn>
        </div>
      ) : (
        <div style={{ marginTop: 16, padding: 12, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
          <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>
            Exit premium per contract
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              value={exitPremium}
              onChange={e => setExitPremium(e.target.value)}
              placeholder={f2(position.premiumPaid)}
              style={{ flex: 1, background: '#000', color: FG, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '7px 10px', fontFamily: MONO, fontSize: 13 }}
            />
            <Btn onClick={handleConfirmClose} color={RED} size="sm">Confirm close</Btn>
            <Btn onClick={() => { setShowClose(false); setExitPremium('') }} ghost color={DIM} size="sm">Cancel</Btn>
          </div>
          <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, marginTop: 8, lineHeight: 1.5 }}>
            Enter the option premium you actually exited at. Leave blank to use entry premium (flat exit).
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CLOSED ────────────────────────────────────────────────────────────────
function ClosedView({ lastClosed, ticker, onDismissClosed }) {
  if (!lastClosed) return null
  const pl = lastClosed.realizedPL || 0
  const isWin = pl >= 0
  const color = isWin ? LIME : RED
  const reason = (lastClosed.exitReason || '').toUpperCase()
  const reasonLabel = reason === 'TARGET' ? 'Target hit' : reason === 'STOP' ? 'Stopped out' : 'Manual close'

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${color}66`, borderRadius: 6, padding: 22, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <StateTag label={isWin ? 'Win' : 'Loss'} color={color} />
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em' }}>{ticker}</span>
      </div>

      <div style={{ fontSize: 17, color: FG, fontWeight: 800, marginBottom: 8 }}>{lastClosed.setupName}</div>
      <div style={{ fontSize: 26, color, fontFamily: MONO, fontWeight: 800, marginBottom: 14, letterSpacing: '-0.01em' }}>
        {fmtD(pl)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
        <Field label="Entry" value={`$${f2(lastClosed.entryUnderlying)}`} />
        <Field label="Exit" value={`$${f2(lastClosed.exitUnderlying)}`} />
        <Field label="Reason" value={reasonLabel} color={isWin ? LIME : reason === 'STOP' ? RED : YELLOW} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Btn onClick={onDismissClosed} ghost color={DIM} size="sm">Dismiss now</Btn>
        <span style={{ marginLeft: 12, fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.04em' }}>
          Auto returns to scanning in 30s.
        </span>
      </div>
    </div>
  )
}

// ─── LOCKED ────────────────────────────────────────────────────────────────
function LockedView({ realizedPL, settings, onUnlock, perTickerBreakdown = [] }) {
  const [typed, setTyped] = useState('')
  const ready = typed.trim().toUpperCase() === 'UNLOCK'
  const hasBreakdown = perTickerBreakdown && perTickerBreakdown.length > 0
  return (
    <div style={{ background: CARD_BG_LOCKED, border: `1px solid ${RED}`, borderRadius: 6, padding: 22, fontFamily: SANS, boxShadow: `0 0 0 3px ${RED}11` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <StateTag label="Locked out" color={RED} />
      </div>

      <div style={{ fontSize: 17, color: FG, fontWeight: 800, marginBottom: 6 }}>Daily loss limit hit</div>
      <div style={{ fontSize: 12, color: DIM, lineHeight: 1.6, marginBottom: 14 }}>
        The bot stops surfacing setups for the rest of the session. This is intentional. Step away, journal what happened, and come back tomorrow.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
        <Field label="Realized today" value={fmtD(realizedPL)} color={RED} />
        <Field label="Limit" value={fmtD(-(settings?.dailyLossLimit || 0))} color={MUTED} />
      </div>

      {hasBreakdown && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
            By ticker (concentrated vs spread?)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {perTickerBreakdown.map(row => {
              const total = (row.realized || 0) + (row.unrealized || 0)
              const c = total >= 0 ? LIME : RED
              return (
                <div key={row.ticker} style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 80px 80px',
                  alignItems: 'center', gap: 12,
                  padding: '6px 10px', background: '#0a0a0a',
                  border: `1px solid ${BORDER}`, borderRadius: 3,
                }}>
                  <span style={{ fontSize: 11, color: FG, fontFamily: MONO, fontWeight: 800, letterSpacing: '0.08em' }}>{row.ticker}</span>
                  <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.06em' }}>
                    {row.taken} trade{row.taken === 1 ? '' : 's'} taken
                  </span>
                  <span style={{ fontSize: 11, color: c, fontFamily: MONO, fontWeight: 700, textAlign: 'right' }}>
                    {fmtD(row.realized || 0)}
                  </span>
                  <span style={{ fontSize: 10, color: row.unrealized ? c : MUTED, fontFamily: MONO, textAlign: 'right' }}>
                    {row.unrealized ? `${fmtD(row.unrealized)} unr.` : 'closed'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, background: '#0a0a0a', border: `1px solid ${RED}33`, borderRadius: 4 }}>
        <div style={{ fontSize: 10, color: RED, fontFamily: MONO, letterSpacing: '0.14em', marginBottom: 8, textTransform: 'uppercase' }}>
          Override (not recommended)
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder="Type UNLOCK"
            style={{ flex: 1, background: '#000', color: FG, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '7px 10px', fontFamily: MONO, fontSize: 12, letterSpacing: '0.14em' }}
          />
          <Btn onClick={() => { if (ready) { onUnlock(); setTyped('') } }} disabled={!ready} color={RED} size="md">Unlock</Btn>
        </div>
      </div>
    </div>
  )
}

// ─── Top-level dispatcher ──────────────────────────────────────────────────
export default function BotRightNowCard({ currentCard, realizedPL, onTakeIt, onSkipIt, onCloseManually, onDismissClosed, onUnlock, perTickerBreakdown = [] }) {
  if (!currentCard) return null
  const { state, setup, position, lastClosed, goExpiresAt, ticker, settings, checklistRequired } = currentCard

  switch (state) {
    case 'WATCH':    return <WatchView setup={setup} ticker={ticker} />
    case 'GO':       return <GoView setup={setup} goExpiresAt={goExpiresAt} ticker={ticker} onTakeIt={onTakeIt} onSkipIt={onSkipIt} />
    case 'IN_TRADE': return <InTradeView position={position} ticker={ticker} onCloseManually={onCloseManually} />
    case 'CLOSED':   return <ClosedView lastClosed={lastClosed} ticker={ticker} onDismissClosed={onDismissClosed} />
    case 'LOCKED':   return <LockedView realizedPL={realizedPL} settings={settings} onUnlock={onUnlock} perTickerBreakdown={perTickerBreakdown} />
    case 'WAIT':
    default:         return <WaitView ticker={ticker} checklistRequired={checklistRequired} />
  }
}
