// ─────────────────────────────────────────────────────────────────────────────
// GlossaryReference.jsx — Plan / Glossary tab.
//
// Reference for every level and indicator drawn on the chart. Each entry has
// three sections: What it is, What it tells you, and What to do when price
// interacts with it. Entries are categorized (Daily / Calculated / Structural
// / Indicators) and filterable via a search input that matches on acronym,
// full name, or body text.
//
// Distinct from the legacy GlossaryModal in Glossary.jsx, which is a quick
// options-pricing reference opened from the header. Both can coexist.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL } from '../constants.js'

const FG = '#e8e8e8'
const MUTED = '#666'
const DIM = '#888'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily Levels' },
  { id: 'calc', label: 'Calculated Levels' },
  { id: 'structural', label: 'Structural Levels' },
  { id: 'indicators', label: 'Indicators' },
]

const ENTRIES = [
  {
    term: 'PDH',
    fullName: 'Previous Day High',
    category: 'daily',
    whatItIs: 'The highest price the stock reached during yesterday\'s regular session.',
    whatItTellsYou: 'Yesterday\'s ceiling. The last place sellers were willing to step in and stop the buying.',
    whatToDo: [
      'Price approaching PDH from below = potential resistance, watch for rejection',
      'Price breaks above PDH with volume = bullish, often signals continuation higher',
      'Price gets rejected at PDH = short setup (S/R Reversal)',
      'Price breaks PDH then retests it = potential long setup (Break and Retest)',
    ],
  },
  {
    term: 'PDL',
    fullName: 'Previous Day Low',
    category: 'daily',
    whatItIs: 'The lowest price the stock reached during yesterday\'s regular session.',
    whatItTellsYou: 'Yesterday\'s floor. Where buyers stepped in to stop the selling.',
    whatToDo: [
      'Price approaching PDL from above = potential support, watch for bounce',
      'Price breaks below PDL with volume = bearish, often signals continuation lower',
      'Price gets bought at PDL = long setup (S/R Reversal)',
      'Price breaks PDL then retests it = potential short setup (Break and Retest)',
    ],
  },
  {
    term: 'PDC',
    fullName: 'Previous Day Close',
    category: 'daily',
    whatItIs: 'The price the stock closed at when yesterday\'s session ended.',
    whatItTellsYou: 'The "settlement" price. Where the market decided the stock was worth at end of day.',
    whatToDo: [
      'Today\'s price above PDC = bullish day bias',
      'Today\'s price below PDC = bearish day bias',
      'Price returning to PDC after gapping = "gap fill" setup, common reversal point',
      'PDC often acts as a magnet during the first hour of trading',
    ],
  },
  {
    term: 'PP',
    fullName: 'Pivot Point',
    category: 'daily',
    whatItIs: 'A calculated daily "fair value" using yesterday\'s high, low, and close. Formula: (H + L + C) / 3.',
    whatItTellsYou: 'The balance point between buyers and sellers based on yesterday\'s range. Used by floor traders and algorithms.',
    whatToDo: [
      'Price above PP = bullish day bias',
      'Price below PP = bearish day bias',
      'First crossing of PP each session = signal of intraday direction',
      'PP often acts as both support AND resistance depending on which side you\'re approaching from',
    ],
  },
  {
    term: 'ORB',
    fullName: 'Opening Range',
    category: 'daily',
    whatItIs: 'The high and low of the first 15 minutes (or 5, or 30) of regular trading.',
    whatItTellsYou: 'The boundaries of the initial order flow. The market\'s first attempt at price discovery for the day.',
    whatToDo: [
      'Stay flat while OR is forming, do not trade inside the range',
      'Break above OR high with volume = long ORB setup',
      'Break below OR low with volume = short ORB setup',
      'Failed break and return into OR = potential reversal setup',
    ],
  },
  {
    term: 'R1',
    fullName: 'Resistance Level 1',
    category: 'calc',
    whatItIs: 'A calculated resistance level above the pivot point. Formula: (2 × PP) − L (using yesterday\'s low).',
    whatItTellsYou: 'The first significant overhead resistance based on the pivot math. Where price often pauses or reverses on the first attempt.',
    whatToDo: [
      'Price approaching R1 from below = target for long trades, then watch for reaction',
      'Strong rejection at R1 = short setup (S/R Reversal)',
      'Break above R1 = bullish, often runs to R2 next',
    ],
  },
  {
    term: 'R2',
    fullName: 'Resistance Level 2',
    category: 'calc',
    whatItIs: 'The second resistance level above R1. Formula: PP + (H − L).',
    whatItTellsYou: 'A deeper resistance level, only reached on stronger trend days. Indicates meaningful upside extension.',
    whatToDo: [
      'Price reaching R2 = strong trend day in progress',
      'Strong rejection at R2 = potential short setup, but counter-trend (high risk)',
      'Break above R2 = very bullish, often the high of the day comes near here',
    ],
  },
  {
    term: 'S1',
    fullName: 'Support Level 1',
    category: 'calc',
    whatItIs: 'A calculated support level below the pivot point. Formula: (2 × PP) − H (using yesterday\'s high).',
    whatItTellsYou: 'First significant support below current pivot. The inverse of R1.',
    whatToDo: [
      'Price approaching S1 from above = potential bounce area',
      'Strong bounce at S1 = long setup (S/R Reversal)',
      'Break below S1 = bearish, often runs to S2 next',
    ],
  },
  {
    term: 'S2',
    fullName: 'Support Level 2',
    category: 'calc',
    whatItIs: 'The second support level below S1. Formula: PP − (H − L).',
    whatItTellsYou: 'A deeper support level, only reached on stronger bearish trend days. Indicates meaningful downside extension.',
    whatToDo: [
      'Price reaching S2 = strong bearish trend day in progress',
      'Strong bounce at S2 = potential long setup, but counter-trend (high risk)',
      'Break below S2 = very bearish, often the low of the day comes near here',
    ],
  },
  {
    term: 'BOS',
    fullName: 'Break of Structure',
    category: 'structural',
    whatItIs: 'A market structure concept marking where price broke through a previous swing high or low, confirming a trend change.',
    whatItTellsYou: 'The trend\'s direction shifted at this level. Down arrow (▼) means the prior uptrend broke down. Up arrow (▲) means the prior downtrend broke up.',
    whatToDo: [
      'Once BOS occurs, the new trend direction is "in play"',
      'Returning to the BOS level often acts as opposite-direction confirmation',
      'For bearish BOS: price returning to BOS from below = potential short entry (level is now resistance)',
      'For bullish BOS: price returning to BOS from above = potential long entry (level is now support)',
      'Classic Break and Retest setup forms at BOS levels',
    ],
  },
  {
    term: 'SH',
    fullName: 'Swing High',
    category: 'structural',
    whatItIs: 'A local peak. A candle whose high is higher than the candles immediately before and after it.',
    whatItTellsYou: 'A short-term resistance pivot. The most recent place sellers overcame buyers temporarily.',
    whatToDo: [
      'Series of higher SHs = uptrend confirmed, look for long setups',
      'Series of lower SHs = downtrend confirmed, look for short setups',
      'Price breaks above most recent SH = momentum confirmation in bullish direction',
      'Price gets rejected at recent SH = short setup at minor resistance',
    ],
  },
  {
    term: 'SL',
    fullName: 'Swing Low',
    category: 'structural',
    whatItIs: 'A local trough. A candle whose low is lower than the candles immediately before and after it.',
    whatItTellsYou: 'A short-term support pivot. The most recent place buyers overcame sellers temporarily.',
    whatToDo: [
      'Series of higher SLs = uptrend confirmed',
      'Series of lower SLs = downtrend confirmed',
      'Price breaks below most recent SL = momentum confirmation in bearish direction',
      'Price bounces at recent SL = long setup at minor support',
    ],
  },
  {
    term: 'VWAP',
    fullName: 'Volume Weighted Average Price',
    category: 'indicators',
    whatItIs: 'The average price weighted by volume across the trading session, recalculated continuously throughout the day.',
    whatItTellsYou: 'The "fair price" institutions are paying for the stock today. Big funds use VWAP to measure execution quality.',
    whatToDo: [
      'Price above VWAP = bullish intraday bias, longs favored',
      'Price below VWAP = bearish intraday bias, shorts favored',
      'Price returning to VWAP after extending away = often a reactive zone (bounce or rejection)',
      '"VWAP bounce" is one of the most common intraday Pullback setups',
    ],
  },
  {
    term: 'RVOL',
    fullName: 'Relative Volume',
    category: 'indicators',
    whatItIs: 'Current volume divided by the average volume at the same time of day over recent sessions. Expressed as a multiplier (e.g., 2.5x means 2.5 times normal volume).',
    whatItTellsYou: 'Whether the stock is trading with unusual interest right now. High RVOL means something is happening that\'s bringing in more participants than normal.',
    whatToDo: [
      'RVOL > 2 = something is going on, worth watching',
      'RVOL > 5 = major catalyst or news, expect volatility',
      'Low RVOL (< 1) = boring day, setups less reliable',
      'Use RVOL to filter your watchlist to active names',
    ],
  },
  {
    term: 'ATR',
    fullName: 'Average True Range',
    category: 'indicators',
    whatItIs: 'A measure of average price movement (volatility) over a recent period, typically 14 days. Expressed in dollars.',
    whatItTellsYou: 'How much the stock typically moves in a day. Tells you whether today\'s move is normal or extreme.',
    whatToDo: [
      'Use ATR to size stops appropriately (e.g., stop = 1x ATR below entry)',
      'A move greater than 1 ATR in a day = above-average volatility',
      'Higher ATR = need wider stops and larger price targets',
      'Lower ATR = tighter stops and smaller price targets are appropriate',
    ],
  },
  {
    term: 'EMA',
    fullName: 'Exponential Moving Average',
    category: 'indicators',
    whatItIs: 'A moving average that weights recent prices more heavily than older prices. Common periods: 9 EMA and 21 EMA for intraday.',
    whatItTellsYou: 'The recent trend direction. Price above EMA = uptrending. Price below = downtrending.',
    whatToDo: [
      'Price holding above 9 EMA in an uptrend = trend intact',
      'Pullback to 9 EMA or 21 EMA = classic Pullback setup entry',
      '9 EMA crosses above 21 EMA = bullish momentum shift',
      '9 EMA crosses below 21 EMA = bearish momentum shift',
      'Use as dynamic support/resistance in trending markets',
    ],
  },
]

function categoryLabel(id) {
  return CATEGORIES.find(c => c.id === id)?.label || id
}

function highlightMatch(text, query) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: `${LIME}44`, color: FG, padding: 0 }}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function EntryCard({ entry, query }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: PANEL,
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${LIME}88`,
      borderRadius: 5,
      fontFamily: MONO,
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, padding: '14px 18px', width: '100%', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: FG, letterSpacing: '0.04em' }}>{highlightMatch(entry.term, query)}</span>
          <span style={{ fontSize: 11, color: DIM, letterSpacing: '0.04em' }}>{highlightMatch(entry.fullName, query)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 8, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '2px 6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {categoryLabel(entry.category)}
          </span>
          <span style={{ fontSize: 12, color: '#555' }}>{open ? '−' : '+'}</span>
        </div>
      </button>

      {open && (
        <div style={{
          padding: '0 18px 16px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <Section label="What it is" body={entry.whatItIs} />
          <Section label="What it tells you" body={entry.whatItTellsYou} />
          <BulletSection label="What to do when price interacts with it" items={entry.whatToDo} />
        </div>
      )}
    </div>
  )
}

function Section({ label, body }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}

function BulletSection({ label, items }) {
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

export default function GlossaryReference() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ENTRIES.filter(e => {
      if (category !== 'all' && e.category !== category) return false
      if (!q) return true
      const hay = [
        e.term,
        e.fullName,
        e.whatItIs,
        e.whatItTellsYou,
        ...e.whatToDo,
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [query, category])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: MONO }}>
      <div>
        <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>
          Chart levels and indicators. Definitions, what they tell you, and how to react.
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: FG, letterSpacing: '0.04em' }}>GLOSSARY</div>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '12px 14px', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5,
      }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search PDH, swing, volume…"
          style={{
            flex: '1 1 220px',
            background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4,
            color: FG, fontFamily: MONO, fontSize: 12,
            padding: '8px 12px', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map(c => {
            const active = category === c.id
            return (
              <button key={c.id} onClick={() => setCategory(c.id)} style={{
                background: active ? `${LIME}22` : 'transparent',
                border: `1px solid ${active ? `${LIME}55` : BORDER}`,
                color: active ? LIME : '#888',
                fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                padding: '6px 10px', borderRadius: 3,
                cursor: 'pointer', textTransform: 'uppercase',
              }}>{c.label}</button>
            )
          })}
        </div>
        <span style={{ fontSize: 9, color: MUTED, letterSpacing: '0.1em', marginLeft: 'auto' }}>
          {filtered.length} / {ENTRIES.length}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        gap: 10,
        alignItems: 'start',
      }}>
        {filtered.map(entry => <EntryCard key={entry.term} entry={entry} query={query.trim()} />)}
      </div>

      {filtered.length === 0 && (
        <div style={{
          padding: 24, textAlign: 'center',
          background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5,
          fontSize: 11, color: MUTED, fontFamily: MONO,
        }}>
          No entries match "{query}". Clear the search or switch categories.
        </div>
      )}
    </div>
  )
}
