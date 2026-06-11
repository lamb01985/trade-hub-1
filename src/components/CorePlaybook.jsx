// ─────────────────────────────────────────────────────────────────────────────
// CorePlaybook.jsx — Plan / Setups tab.
//
// Replaces the prior trigger engine UI with a focused 4-setup playbook for the
// intraday setups Sarah is mastering: ORB, Break and Retest, Pullback, S/R
// Reversal. Each card shows a short summary and exposes two actions:
//   - Learn   → expands the card with full educational content
//   - Use Setup → opens a pre-trade check modal with the per-setup checklist
//
// No backtest, no scanner, no scoring. This component is pure reference and
// pre-trade discipline. The underlying trigger engine code (Setups.jsx,
// SetupCard, SetupBuilder, SetupTemplatesLibrary, AdjustSetupsModal,
// setupEngine, setupStorage) is preserved in the repo for later re-activation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL } from '../constants.js'

const FG = '#e8e8e8'
const MUTED = '#666'
const DIM = '#888'

const SETUPS = [
  {
    id: 'orb',
    title: 'ORB',
    fullTitle: 'Opening Range Breakout',
    summary: 'Trade the breakout of the first 15 minutes\' high or low. Captures pent-up overnight order flow once it\'s been absorbed by the opening range.',
    conditions: 'Trend day expected, normal-to-strong gap, decent volume at the open.',
    entryRules: [
      'Wait for full 15-minute opening range to form',
      'Never trade INSIDE the range',
      '5-min candle must close beyond the range high (long) or low (short)',
      'Volume on breakout candle must exceed average of prior 10 candles',
      'Higher timeframe (15M or 1H) should not contradict the direction',
    ],
    stopLoss: 'Opposite end of opening range (wider) or breakout candle low/high (tighter).',
    target: 'T1 = 1x range height from breakout point. T2 = 1.5-2x range height.',
    kills: 'False breakouts (poke and reverse), late entries (>30 min after breakout), insufficient volume, fighting overnight bias.',
    checklist: [
      'Opening range fully formed (15 minutes complete)',
      'Breakout candle closed beyond the range',
      'Volume on breakout exceeds 10-candle average',
      'Higher timeframe direction supports this trade',
      'My stop is at opposite end of range, or tighter at breakout candle',
      'My target is at least 1x range height',
      'This trade is within my daily trade limit',
    ],
  },
  {
    id: 'br',
    title: 'Break and Retest',
    fullTitle: 'Break and Retest',
    summary: 'Wait for a clean break of a key level, then enter when price retests the level and the level holds. Confirms direction AND flips the level from resistance to support (or vice versa).',
    conditions: 'Clear key level (PDH, PDL, swing high/low), prior consolidation under/over the level, eventual breakout candle.',
    entryRules: [
      'Identify the key level pre-trade',
      'Confirm clean break (candle CLOSE beyond level + volume)',
      'Wait for pullback back to the broken level',
      'Confirm retest holds (rejection candle, doesn\'t break back through)',
      'Enter on first candle moving back in direction of original break',
    ],
    stopLoss: 'Other side of the retest extreme (beyond the retest wick).',
    target: 'Measured move (consolidation height projected from level), or next major key level.',
    kills: 'Entering on the initial break instead of waiting for retest, retest fails and breaks back through, no volume on the original break.',
    checklist: [
      'Key level was identified BEFORE the break',
      'Clean break confirmed (candle close beyond level + volume)',
      'Price has pulled back to the level',
      'Retest showed rejection (wick, doji, or rejection at level)',
      'Retest did NOT break back through the level',
      'Higher timeframe supports this direction',
      'My stop is on opposite side of retest extreme',
    ],
  },
  {
    id: 'pullback',
    title: 'Pullback',
    fullTitle: 'Trend Pullback',
    summary: 'In an established trend, enter when price pulls back to a key level (moving average or prior swing) and shows resumption of the trend. You\'re joining a trend, not predicting a reversal.',
    conditions: 'Clear trend (higher highs/lows for long, lower highs/lows for short), pullback to a meaningful level, momentum still intact.',
    entryRules: [
      'Confirm trend on your trading timeframe (5M or 15M)',
      'Wait for pullback to 9 EMA, 21 EMA, or prior swing structure',
      'Pullback should show exhaustion (small candles, dojis, long wicks against trend direction)',
      'Enter on the first candle resuming trend direction with volume',
    ],
    stopLoss: 'Below pullback low (longs) or above pullback high (shorts).',
    target: 'Previous swing high (longs) or low (shorts), then trail using moving average.',
    kills: 'Mistaking a reversal for a pullback, entering before exhaustion signals, tight stops getting noise-stopped out, trading pullbacks in choppy markets.',
    checklist: [
      'Trend is clearly established on my timeframe',
      'Price pulled back to a key moving average or swing level',
      'Pullback showed exhaustion signs (small candles, dojis, wicks)',
      'Resumption candle has volume',
      'Higher timeframes confirm trend direction',
      'I am joining a trend, NOT calling a reversal',
      'My stop is below pullback low (long) or above pullback high (short)',
    ],
  },
  {
    id: 'reversal',
    title: 'S/R Reversal',
    fullTitle: 'Support / Resistance Reversal',
    summary: 'Fade a price move INTO a major level, betting on rejection. Counter-trend by definition, so requires major levels and clear rejection signals.',
    conditions: 'Major level (PDH, PDL, R1, S1, major swing or round number), price approaching with momentum, sign of exhaustion at the level.',
    entryRules: [
      'Level must be MAJOR (not minor intraday swings)',
      'Wait for rejection candle at the level (long upper wick for short, long lower wick for long)',
      'Volume should confirm the rejection (volume bar visible)',
      'Higher timeframes must NOT show strong momentum against the trade',
      'Enter on close of rejection candle',
    ],
    stopLoss: 'Just beyond the rejection extreme (above wick for shorts, below wick for longs). Keep this TIGHT.',
    target: 'Next major support/resistance level, midpoint of prior range.',
    kills: 'Fading strong trends, weak rejection signals, wide stops, fading minor levels, no higher timeframe context.',
    checklist: [
      'This is a MAJOR level (PDH, PDL, R1, S1, major swing)',
      'Rejection candle is clear (long wick, engulfing, or doji)',
      'Volume confirms the rejection',
      'Higher timeframes do NOT show strong momentum against this trade',
      'My stop is tight (just beyond rejection extreme)',
      'I am fading a counter-trend move, not the dominant trend',
      'I accept this is the highest-risk setup type',
    ],
  },
]

function SetupPlaybookCard({ setup, onUseSetup }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      background: PANEL,
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${LIME}88`,
      borderRadius: 5,
      padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12,
      fontFamily: MONO,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: FG, letterSpacing: '0.02em' }}>{setup.title}</span>
          <span style={{ fontSize: 10, color: DIM, letterSpacing: '0.08em' }}>{setup.fullTitle}</span>
        </div>
        <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>{setup.summary}</div>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
          <Section label="Conditions" body={setup.conditions} />
          <ListSection label="Entry rules" items={setup.entryRules} />
          <Section label="Stop loss" body={setup.stopLoss} />
          <Section label="Target" body={setup.target} accent={LIME} />
          <Section label="Kills" body={setup.kills} accent={RED} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => setExpanded(e => !e)} style={{
          flex: 1,
          background: 'transparent',
          border: `1px solid ${BORDER}`,
          color: expanded ? LIME : '#aaa',
          fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          padding: '9px 14px', borderRadius: 4,
          cursor: 'pointer', textTransform: 'uppercase',
        }}>{expanded ? 'Collapse' : 'Learn'}</button>
        <button onClick={() => onUseSetup(setup)} style={{
          flex: 1,
          background: LIME,
          color: '#000',
          border: 'none',
          fontFamily: MONO, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
          padding: '9px 14px', borderRadius: 4,
          cursor: 'pointer', textTransform: 'uppercase',
        }}>Use Setup →</button>
      </div>
    </div>
  )
}

function Section({ label, body, accent }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: accent || MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}

function ListSection({ label, items }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>{it}</li>
        ))}
      </ul>
    </div>
  )
}

function PreTradeCheckModal({ setup, onClose }) {
  const [checked, setChecked] = useState({})
  const total = setup.checklist.length
  const done = Object.values(checked).filter(Boolean).length
  const allChecked = done === total
  function toggle(i) { setChecked(prev => ({ ...prev, [i]: !prev[i] })) }
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
      zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      overflow: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: PANEL, width: '100%', maxWidth: 560, maxHeight: '94vh', overflow: 'auto',
        borderRadius: '12px 12px 0 0', padding: '20px 22px 26px',
        border: `1px solid ${BORDER}`, borderBottom: 'none',
        fontFamily: MONO,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: LIME, letterSpacing: '0.1em' }}>PRE-TRADE CHECK</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#666',
            fontFamily: MONO, fontSize: 12, cursor: 'pointer', letterSpacing: '0.1em',
          }}>CLOSE ✕</button>
        </div>
        <div style={{ fontSize: 12, color: FG, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 18 }}>
          {setup.title} <span style={{ color: DIM, fontWeight: 400, marginLeft: 6 }}>{setup.fullTitle}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {setup.checklist.map((item, i) => {
            const on = !!checked[i]
            return (
              <button key={i} onClick={() => toggle(i)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: on ? `${LIME}11` : 'transparent',
                border: `1px solid ${on ? `${LIME}55` : BORDER}`,
                borderRadius: 4, padding: '10px 14px',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: MONO,
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 3,
                  border: `1px solid ${on ? LIME : BORDER}`,
                  background: on ? LIME : 'transparent',
                  color: '#000', fontWeight: 900, fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{on ? '✓' : ''}</span>
                <span style={{ fontSize: 11, color: on ? FG : '#aaa', lineHeight: 1.5 }}>{item}</span>
              </button>
            )
          })}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px',
          background: allChecked ? `${LIME}11` : '#0a0a0a',
          border: `1px solid ${allChecked ? `${LIME}55` : BORDER}`,
          borderRadius: 4, marginBottom: 18,
        }}>
          <span style={{ fontSize: 10, fontFamily: MONO, color: allChecked ? LIME : '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {done} / {total} checks complete
          </span>
          {!allChecked && (
            <span style={{ fontSize: 10, fontFamily: MONO, color: YELLOW, letterSpacing: '0.06em' }}>
              {total - done} item{total - done === 1 ? '' : 's'} left
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, color: '#888',
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
            padding: '12px', borderRadius: 4, cursor: 'pointer',
          }}>CANCEL</button>
          <button onClick={onClose} disabled={!allChecked} style={{
            flex: 2,
            background: allChecked ? LIME : '#1a1a1a',
            color: allChecked ? '#000' : '#444',
            border: 'none',
            fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em',
            padding: '12px', borderRadius: 4,
            cursor: allChecked ? 'pointer' : 'not-allowed',
          }}>{allChecked ? 'All checks confirmed →' : 'Complete the checklist'}</button>
        </div>
      </div>
    </div>
  )
}

export default function CorePlaybook() {
  const [active, setActive] = useState(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: MONO }}>
      <div>
        <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>
          The 4 setups I'm mastering. Use the pre-trade check before every entry.
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: FG, letterSpacing: '0.04em' }}>CORE PLAYBOOK</div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 14,
        alignItems: 'start',
      }}>
        {SETUPS.map(setup => (
          <SetupPlaybookCard key={setup.id} setup={setup} onUseSetup={setActive} />
        ))}
      </div>

      {active && <PreTradeCheckModal setup={active} onClose={() => setActive(null)} />}
    </div>
  )
}
