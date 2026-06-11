// ─────────────────────────────────────────────────────────────────────────────
// CorePlaybook.jsx — Plan / Setups tab.
//
// Educational reference for the 4 intraday setups Sarah is mastering: ORB,
// Break and Retest, Pullback, S/R Reversal. Each card has a short summary
// in the collapsed view and a Learn toggle that reveals Conditions, Entry
// rules, Stop loss, Target, Kills, and a small EXAMPLE section with stylized
// mini-charts showing the setup playing out.
//
// There is no pre-trade checklist or modal here, and no gating between the
// cards and the Journal. The Setup dropdown in the Log Trade form is just a
// dropdown. The "Open in Chart" button is a plain navigation shortcut — it
// does not pre-fill anything.
//
// The trigger engine (Setups.jsx and its supporting files) is still archived
// in the tree; see App.jsx for re-enable instructions.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL } from '../constants.js'

const FG = '#e8e8e8'
const MUTED = '#666'
const DIM = '#888'
const BULL = '#22c55e'
const BEAR = '#ef4444'
const LEVEL = '#666'

// ── Mini-chart primitives. Tiny SVG candles + level lines for the EXAMPLE
// section. Coordinates assume a 200x80 viewBox with y growing downward
// (higher number = lower price), matching SVG conventions.
function Candle({ x, top, bottom, wickTop, wickBottom, color, width = 6 }) {
  return (
    <>
      <line x1={x + width / 2} y1={wickTop ?? top} x2={x + width / 2} y2={wickBottom ?? bottom} stroke={color} strokeWidth="1" />
      <rect x={x} y={top} width={width} height={Math.max(1, bottom - top)} fill={color} />
    </>
  )
}

function Level({ y, label, dashed = true }) {
  return (
    <>
      <line x1="0" y1={y} x2="200" y2={y} stroke={LEVEL} strokeWidth="0.6" strokeDasharray={dashed ? '3 3' : 'none'} />
      {label && <text x="2" y={y - 2} fontSize="6" fill={LEVEL} fontFamily="ui-monospace, monospace">{label}</text>}
    </>
  )
}

function Note({ x, y, text, color }) {
  return <text x={x} y={y} fontSize="6" fill={color || LEVEL} fontFamily="ui-monospace, monospace" fontWeight="700">{text}</text>
}

function Mini({ caption, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg viewBox="0 0 200 80" style={{ width: '100%', height: 80, background: '#0a0a0a', borderRadius: 3, border: `1px solid ${BORDER}` }}>
        {children}
      </svg>
      <div style={{ fontSize: 9, color: '#666', textAlign: 'center', fontFamily: MONO, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {caption}
      </div>
    </div>
  )
}

// ── Per-setup illustrations. Two each, kept intentionally schematic so they
// read as "shape of the setup" rather than literal trades.

function OrbBullish() {
  return (
    <>
      <Level y={32} label="ORH" />
      <Level y={58} label="ORL" />
      <Candle x={18} top={40} bottom={50} color={LEVEL} />
      <Candle x={30} top={42} bottom={52} color={LEVEL} />
      <Candle x={42} top={38} bottom={48} color={LEVEL} />
      <Candle x={54} top={44} bottom={54} color={LEVEL} />
      <Candle x={66} top={40} bottom={50} color={LEVEL} />
      <Candle x={86} top={20} bottom={36} color={BULL} />
      <Candle x={102} top={14} bottom={26} color={BULL} />
      <Candle x={118} top={10} bottom={20} color={BULL} />
      <Note x={88} y={14} text="BREAK" color={BULL} />
    </>
  )
}

function OrbBearish() {
  return (
    <>
      <Level y={28} label="ORH" />
      <Level y={50} label="ORL" />
      <Candle x={18} top={34} bottom={44} color={LEVEL} />
      <Candle x={30} top={32} bottom={42} color={LEVEL} />
      <Candle x={42} top={36} bottom={46} color={LEVEL} />
      <Candle x={54} top={32} bottom={44} color={LEVEL} />
      <Candle x={66} top={36} bottom={46} color={LEVEL} />
      <Candle x={86} top={52} bottom={68} color={BEAR} />
      <Candle x={102} top={60} bottom={72} color={BEAR} />
      <Candle x={118} top={64} bottom={75} color={BEAR} />
      <Note x={88} y={72} text="BREAK" color={BEAR} />
    </>
  )
}

function BrBullish() {
  return (
    <>
      <Level y={40} label="LEVEL" />
      <Candle x={10} top={48} bottom={58} color={BEAR} />
      <Candle x={22} top={46} bottom={56} color={BEAR} />
      <Candle x={34} top={48} bottom={58} color={LEVEL} />
      <Candle x={46} top={28} bottom={44} color={BULL} />
      <Candle x={58} top={32} bottom={42} color={LEVEL} />
      <Candle x={70} top={36} bottom={44} color={LEVEL} />
      <Candle x={82} top={36} bottom={44} color={LEVEL} wickBottom={50} />
      <Note x={70} y={56} text="RETEST" color={LEVEL} />
      <Candle x={96} top={24} bottom={36} color={BULL} />
      <Candle x={110} top={18} bottom={28} color={BULL} />
      <Candle x={124} top={14} bottom={22} color={BULL} />
    </>
  )
}

function BrBearish() {
  return (
    <>
      <Level y={40} label="LEVEL" />
      <Candle x={10} top={22} bottom={32} color={BULL} />
      <Candle x={22} top={24} bottom={34} color={BULL} />
      <Candle x={34} top={22} bottom={32} color={LEVEL} />
      <Candle x={46} top={36} bottom={52} color={BEAR} />
      <Candle x={58} top={38} bottom={48} color={LEVEL} />
      <Candle x={70} top={36} bottom={44} color={LEVEL} />
      <Candle x={82} top={36} bottom={44} color={LEVEL} wickTop={30} />
      <Note x={70} y={28} text="RETEST" color={LEVEL} />
      <Candle x={96} top={44} bottom={56} color={BEAR} />
      <Candle x={110} top={52} bottom={62} color={BEAR} />
      <Candle x={124} top={58} bottom={68} color={BEAR} />
    </>
  )
}

function PullbackBullish() {
  return (
    <>
      <path d="M 10 60 Q 50 50, 90 38 Q 130 30, 190 18" fill="none" stroke={LEVEL} strokeWidth="0.8" strokeDasharray="2 2" />
      <Candle x={14} top={56} bottom={66} color={BULL} />
      <Candle x={26} top={48} bottom={58} color={BULL} />
      <Candle x={38} top={40} bottom={50} color={BULL} />
      <Candle x={50} top={36} bottom={44} color={LEVEL} />
      <Candle x={62} top={38} bottom={46} color={LEVEL} wickBottom={52} />
      <Candle x={74} top={40} bottom={48} color={LEVEL} wickBottom={54} />
      <Note x={50} y={68} text="PULLBACK" color={LEVEL} />
      <Candle x={86} top={32} bottom={42} color={BULL} />
      <Candle x={98} top={26} bottom={36} color={BULL} />
      <Candle x={110} top={22} bottom={30} color={BULL} />
      <Candle x={122} top={16} bottom={26} color={BULL} />
      <Note x={86} y={28} text="RESUME" color={BULL} />
    </>
  )
}

function PullbackBearish() {
  return (
    <>
      <path d="M 10 18 Q 50 28, 90 42 Q 130 50, 190 62" fill="none" stroke={LEVEL} strokeWidth="0.8" strokeDasharray="2 2" />
      <Candle x={14} top={16} bottom={26} color={BEAR} />
      <Candle x={26} top={22} bottom={32} color={BEAR} />
      <Candle x={38} top={30} bottom={40} color={BEAR} />
      <Candle x={50} top={36} bottom={44} color={LEVEL} />
      <Candle x={62} top={32} bottom={42} color={LEVEL} wickTop={26} />
      <Candle x={74} top={32} bottom={42} color={LEVEL} wickTop={26} />
      <Note x={50} y={20} text="PULLBACK" color={LEVEL} />
      <Candle x={86} top={38} bottom={48} color={BEAR} />
      <Candle x={98} top={44} bottom={54} color={BEAR} />
      <Candle x={110} top={50} bottom={60} color={BEAR} />
      <Candle x={122} top={54} bottom={64} color={BEAR} />
      <Note x={86} y={64} text="RESUME" color={BEAR} />
    </>
  )
}

function ReversalAtResistance() {
  return (
    <>
      <Level y={22} label="MAJOR R" />
      <Candle x={14} top={56} bottom={66} color={BULL} />
      <Candle x={28} top={48} bottom={58} color={BULL} />
      <Candle x={42} top={40} bottom={50} color={BULL} />
      <Candle x={56} top={32} bottom={42} color={BULL} />
      <Candle x={72} top={26} bottom={36} color={BULL} wickTop={16} />
      <Note x={62} y={14} text="REJECTION" color={BEAR} />
      <Candle x={88} top={32} bottom={46} color={BEAR} />
      <Candle x={102} top={40} bottom={54} color={BEAR} />
      <Candle x={116} top={48} bottom={62} color={BEAR} />
    </>
  )
}

function ReversalAtSupport() {
  return (
    <>
      <Level y={62} label="MAJOR S" />
      <Candle x={14} top={18} bottom={28} color={BEAR} />
      <Candle x={28} top={26} bottom={36} color={BEAR} />
      <Candle x={42} top={34} bottom={44} color={BEAR} />
      <Candle x={56} top={42} bottom={52} color={BEAR} />
      <Candle x={72} top={48} bottom={58} color={BEAR} wickBottom={68} />
      <Note x={62} y={76} text="REJECTION" color={BULL} />
      <Candle x={88} top={38} bottom={52} color={BULL} />
      <Candle x={102} top={30} bottom={44} color={BULL} />
      <Candle x={116} top={22} bottom={36} color={BULL} />
    </>
  )
}

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
    examples: [
      { caption: 'Bullish breakout above ORH', svg: <OrbBullish /> },
      { caption: 'Bearish breakdown below ORL', svg: <OrbBearish /> },
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
    examples: [
      { caption: 'Bullish break, retest, continuation', svg: <BrBullish /> },
      { caption: 'Bearish break, retest, continuation', svg: <BrBearish /> },
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
    examples: [
      { caption: 'Uptrend pullback to EMA, then resume', svg: <PullbackBullish /> },
      { caption: 'Downtrend pullback to EMA, then resume', svg: <PullbackBearish /> },
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
    examples: [
      { caption: 'Rejection at major resistance', svg: <ReversalAtResistance /> },
      { caption: 'Rejection at major support', svg: <ReversalAtSupport /> },
    ],
  },
]

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

function ExampleStrip({ examples }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Examples</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${examples.length}, 1fr)`,
        gap: 8,
      }}>
        {examples.map((ex, i) => <Mini key={i} caption={ex.caption}>{ex.svg}</Mini>)}
      </div>
    </div>
  )
}

function SetupPlaybookCard({ setup, onOpenChart }) {
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
          <ExampleStrip examples={setup.examples} />
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
        {onOpenChart && (
          <button onClick={onOpenChart} style={{
            flex: 1,
            background: 'transparent',
            border: `1px solid ${BORDER}`,
            color: '#aaa',
            fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            padding: '9px 14px', borderRadius: 4,
            cursor: 'pointer', textTransform: 'uppercase',
          }}>Open in Chart →</button>
        )}
      </div>
    </div>
  )
}

export default function CorePlaybook({ onOpenChart }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: MONO }}>
      <div>
        <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>
          The 4 setups I'm mastering. Reference material, no gating.
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
          <SetupPlaybookCard key={setup.id} setup={setup} onOpenChart={onOpenChart} />
        ))}
      </div>
    </div>
  )
}
