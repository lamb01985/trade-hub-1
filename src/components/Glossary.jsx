import { LIME, MONO, BORDER } from '../constants.js'

const TERMS = [
  { term: 'VWAP', def: 'Volume Weighted Average Price — the average price weighted by volume throughout the day. Institutions use this as their primary anchor for order flow. Price above VWAP favors longs, below favors shorts — watch for reclaim or rejection as your directional signal.' },
  { term: 'RVOL', def: 'Relative Volume — how today\'s volume compares to the historical average at this time of day. Above 1.5x means institutional activity is elevated and moves are real. Below 0.8x means low conviction — don\'t chase breakouts in low-RVOL conditions.' },
  { term: 'POC', def: 'Point of Control — the price level where the most volume traded over recent sessions. Acts as a magnet: price tends to revisit it repeatedly. Also acts as strong support or resistance depending on which side price is currently on.' },
  { term: 'ATR', def: 'Average True Range — the average daily price movement over the last 14 bars. Used to set intelligent stops that aren\'t too tight (stopped out by noise) or too wide (lose too much when wrong). Use 0.5× ATR as your stop offset from the trigger level.' },
  { term: 'HVN', def: 'High Volume Node — a price area where more than 1.5× average volume traded historically. These levels attract price like a magnet and provide strong support or resistance. Expect price to slow down, consolidate, or reverse when touching an HVN.' },
  { term: 'LVN', def: 'Low Volume Node — a price area where less than half the average volume traded. These are structural gaps where price moves quickly with little friction. Once price enters an LVN, it tends to accelerate toward the next HVN or POC.' },
  { term: 'PDH / PDL / PDC', def: 'Previous Day High, Low, and Close — the three most important structural levels from yesterday. Institutions reference these every morning to set their bias and place orders. Breaks of PDH/PDL are the most common opening range breakout triggers.' },
  { term: 'OR / ORB', def: 'Opening Range and Opening Range Breakout — the high and low formed during the first 5, 15, or 30 minutes of trading. Strategy: wait for a candle to CLOSE above (or below) the range, then enter in the direction of the break. Wicks touching the level don\'t count.' },
  { term: 'Golden Pocket', def: 'The 61.8% Fibonacci retracement — the most commonly used reversal zone after a pullback. Institutional algorithms cluster orders here, making it self-fulfilling. When the 61.8% level confluences with another key level (pivot, VWAP, PDH), it\'s your highest-probability entry zone.' },
  { term: 'Confluence', def: 'When two or more independently calculated levels land within $0.40 of each other. Each level type (pivot, VWAP, Fibonacci, PDH) is calculated differently, so geographic overlap is significant. The more levels at the same price, the stronger the magnet for institutional order flow.' },
  { term: 'R:R', def: 'Risk to Reward ratio — how much you stand to gain versus how much you risk per trade. At 2:1 you make $2 for every $1 you risk, meaning you only need to be right 34% of the time to be net profitable. Never take a trade below 2:1 R:R.' },
  { term: 'IV', def: 'Implied Volatility — the market\'s expectation of future price movement, priced into the option premium. High IV means expensive options. Buy premium when IV is low relative to historical levels — you get better pricing and benefit if IV expands after entry.' },
  { term: 'DTE', def: 'Days to Expiration — how many days remain before the option expires. 0DTE options expire today and have maximum theta decay. They move fast and offer leverage, but require precise timing because time value erodes by the minute, especially after 10:30 CT.' },
  { term: 'Delta', def: 'How much the option price moves for each $1 move in the underlying. An ATM 0DTE call has ~0.50 delta — a $1 move in QQQ gives $0.50 gain per share ($50 per contract). Delta increases toward 1.0 as the option moves deeper in the money.' },
  { term: 'Theta', def: 'Daily time decay — the dollar amount an option loses each day purely from time passing. For 0DTE options, theta accelerates exponentially through the day. This is why the chop zone (10:30–1:30 CT) destroys premium even when price doesn\'t move.' },
  { term: 'Vega', def: 'How much the option price changes per 1% move in implied volatility. High vega means IV swings dominate the option\'s value. Buying before IV expansion events (Fed, earnings) can be profitable even if the underlying barely moves.' },
  { term: 'Gamma', def: 'How fast delta changes as price moves. 0DTE options have extreme gamma — a small price move rapidly accelerates your gains or losses. This creates the outsized moves in 0DTE, but also means positions can reverse instantly if the level fails.' },
  { term: 'Setup Quality', def: 'How close price is to a tradeable level right now. ON LEVEL means a potential entry exists at a known institutional level. APPROACHING means get ready to act. TIGHT RANGE means price is coiling for a big move. BETWEEN LEVELS means no edge — wait.' },
  { term: 'Session Types', def: 'The trading day is segmented by behavior: Pre-Market (prep only), Open 8:45–10:30 CT (prime window), Chop 10:30–1:30 CT (no new trades), Power Hour 1:30–3:00 CT (trend-follow only), After-Hours (review and tomorrow\'s prep). Each session has different rules.' },
]

export default function GlossaryModal({ onClose }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div style={{ background: '#111', border: `1px solid ${BORDER}`, borderRadius: 8, maxWidth: 680, width: '100%', padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: MONO, color: '#444', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Reference</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e8e8e8', fontFamily: MONO, letterSpacing: '-0.02em' }}>Trading Glossary</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#444', fontSize: 20, cursor: 'pointer', fontFamily: MONO, lineHeight: 1, padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {TERMS.map(({ term, def }, i) => (
            <div key={term} style={{ padding: '14px 0', borderBottom: i < TERMS.length - 1 ? `1px solid #1a1a1a` : 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: LIME, marginBottom: 5, letterSpacing: '0.04em' }}>{term}</div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: '#666', lineHeight: 1.75 }}>{def}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid #1a1a1a`, fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textAlign: 'center', letterSpacing: '0.08em' }}>
          Three sentences max — what it is, why it matters, what to do with it.
        </div>
      </div>
    </div>
  )
}
