// ── ORB Tab ───────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, SLabel, Heading, Tile, Fld, Sel, Btn, Pill, CheckRow, Tip } from './ui.jsx'
import { LIME, RED, YELLOW, BLUE, PURPLE, ORANGE, MONO, SANS, BORDER, DARK, PANEL, SETUP_TYPES, todayStr, localDateStr, tomorrowStr, uid, f2, fmtD, fmtU, rrColor, ivContext, calcOptionRR, bsCalc, getETMins, SESSION_LABELS, SESSION_COLORS, SESSION_TIPS } from '../constants.js'
import { getPrevDay, getHistoricalBars, getTopMovers, prevDayPlausible, getPriorSession } from '../lib/massive.js'
import { occSymbol, SCHWAB_TRADE_URL, SCHWAB_BLUE } from '../lib/schwabClient.js'
import { aggregateBars } from '../lib/structure.js'
import { evaluateOrbSignals, detectStaleLevels } from '../lib/orbSignalEngine.js'
import { useLocalStorage } from '../hooks/useStore.js'

// Opening-range window, expressed as the end-of-OR offset in minutes after
// the regular-session open (9:30 ET). Spec default: first 15 minutes (so OR
// closes at 9:45 ET, ET minute 585). Bars after this minute feed the signal
// engine; anything inside the window is the OR itself.
const DEFAULT_OR_WINDOW_MINUTES = 15
const RTH_OPEN_MINUTES_ET = 570 // 9:30 ET expressed in minutes since ET midnight

// Returns the bar's wall-clock minute of day in ET, used to gate bars to the
// post-OR portion of the session. We deliberately compute against ET rather
// than UTC so DST flips don't shift the window.
function etMinuteOfDay(timestampMs) {
  const t = new Date(timestampMs).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  const [h, m] = t.split(',').pop().trim().split(':').map(Number)
  return h * 60 + m
}

const CL_ITEMS = [
  { id: 'c1', text: 'Opening range has fully formed for my chosen OR period', required: true },
  { id: 'c2', text: 'Underlying has CLOSED above OR high or below OR low — no wicks', required: true },
  { id: 'c3', text: 'Entry is a retest or first confirmed breakout — not a chase', required: true },
  { id: 'c4', text: 'My stop is set on the CONTRACT PRICE, not the underlying', required: true },
  { id: 'c5', text: 'This trade has minimum 2:1 R:R on the option premium', required: true },
  { id: 'c6', text: 'IV is not extreme — I am not buying overpriced premium into a spike', required: true },
  { id: 'c7', text: 'DTE gives enough time for the setup to play out', required: false },
  { id: 'c8', text: 'Time is before 10:30 CT — not trading midday chop', required: true },
  { id: 'c9', text: 'I do NOT have 3 or more consecutive losses today', required: true },
  { id: 'c10', text: 'I am emotionally flat — not revenge, not FOMO', required: true },
  { id: 'c11', text: 'Contracts fit within my remaining daily risk budget', required: true },
  { id: 'c12', text: 'I know my exact exit — stop AND target — on the option price', required: true },
]

const CL_ITEMS_STOCK = [
  { id: 'c1', text: 'Opening range has fully formed for my chosen OR period', required: true },
  { id: 'c2', text: 'Underlying has CLOSED above OR high or below OR low — no wicks', required: true },
  { id: 'c3', text: 'Entry is a retest or first confirmed breakout — not a chase', required: true },
  { id: 'c4', text: 'My stop is set on the SHARE PRICE, defined before entry', required: true },
  { id: 'c5', text: 'This trade has minimum 2:1 R:R on the share price move', required: true },
  { id: 'c6', text: 'Stock has sufficient liquidity and volume today', required: true },
  { id: 'c7', text: 'Position size fits within daily risk budget', required: false },
  { id: 'c8', text: 'Time is before 10:30 CT — not trading midday chop', required: true },
  { id: 'c9', text: 'I do NOT have 3 or more consecutive losses today', required: true },
  { id: 'c10', text: 'I am emotionally flat — not revenge, not FOMO', required: true },
  { id: 'c11', text: 'Shares fit within my remaining daily risk budget', required: true },
  { id: 'c12', text: 'I know my exact exit — stop AND target — on the share price', required: true },
]

// Tunable: how far OR HIGH or OR LOW can drift from the current price before
// we assume the values belong to a different ticker and lock the ORB tab.
export const SANITY_THRESHOLD = 0.05

export function ORBTab({ settings, onSendToCalc, prepFill, liveData, savedPreps }) {
  const [ticker, setTicker] = useState('')
  const [orbH, setOrbH] = useState('')
  const [orbL, setOrbL] = useState('')
  const [orbStamps, setOrbStamps] = useState(null)  // { high: ISO, low: ISO } for current ticker
  const [loadingTicker, setLoadingTicker] = useState(false)
  const [dir, setDir] = useState('long')
  const [es, setEs] = useState('retest')
  const [checks, setChecks] = useState({})
  const lastLoadedTickerRef = useRef('')

  // Initial pre-fill from Prep
  useEffect(() => {
    if (!prepFill) return
    if (prepFill.ticker) setTicker(prepFill.ticker)
    if (prepFill.orbHigh) setOrbH(prepFill.orbHigh)
    if (prepFill.orbLow) setOrbL(prepFill.orbLow)
    if (prepFill.orbHigh || prepFill.orbLow) {
      const ts = prepFill.dateSaved || new Date().toISOString()
      setOrbStamps({ high: ts, low: ts })
    }
    lastLoadedTickerRef.current = (prepFill.ticker || '').toUpperCase()
  }, [prepFill])

  // When ticker changes (and not because prepFill just set it), look up
  // saved Prep data for that ticker. If none, clear the OR fields rather
  // than letting stale values from a different ticker stick.
  useEffect(() => {
    const t = (ticker || '').trim().toUpperCase()
    if (!t || t === lastLoadedTickerRef.current) return
    setLoadingTicker(true)
    const saved = savedPreps?.[t]
    if (saved && (saved.orbHigh || saved.orbLow)) {
      setOrbH(saved.orbHigh || '')
      setOrbL(saved.orbLow || '')
      setOrbStamps({ high: saved.dateSaved || null, low: saved.dateSaved || null })
    } else {
      setOrbH('')
      setOrbL('')
      setOrbStamps(null)
    }
    lastLoadedTickerRef.current = t
    const id = setTimeout(() => setLoadingTicker(false), 250)
    return () => clearTimeout(id)
  }, [ticker, savedPreps])

  // Stamp OR fields with "now" when user types into them. We only stamp when
  // the value transitions from empty to non-empty, or changes meaningfully.
  function setOrbHWithStamp(v) {
    setOrbH(v)
    if (v && v !== orbH) setOrbStamps(s => ({ ...(s || {}), high: new Date().toISOString() }))
  }
  function setOrbLWithStamp(v) {
    setOrbL(v)
    if (v && v !== orbL) setOrbStamps(s => ({ ...(s || {}), low: new Date().toISOString() }))
  }

  const oh = parseFloat(orbH), ol = parseFloat(orbL)
  const range = !isNaN(oh) && !isNaN(ol) && oh > ol ? oh - ol : null

  // Sanity check: if either OR value differs from current price by more than
  // SANITY_THRESHOLD (5% default), the values almost certainly belong to a
  // different ticker. Block downstream calculations.
  const livePriceForSanity = liveData?.price
  const sanityFail = (() => {
    if (livePriceForSanity == null) return null
    const highBad = !isNaN(oh) && Math.abs(oh - livePriceForSanity) / livePriceForSanity > SANITY_THRESHOLD
    const lowBad = !isNaN(ol) && Math.abs(ol - livePriceForSanity) / livePriceForSanity > SANITY_THRESHOLD
    return (highBad || lowBad) ? { highBad, lowBad } : null
  })()
  // ── ORB Signal Engine ───────────────────────────────────────────────────
  // Derive completed post-OR 5m bars from the live 1m intraday feed and run
  // the pure engine. Anything inside the OR window is the OR itself; anything
  // not yet closed (current 5m bucket whose end is in the future) is dropped.
  // The engine is gated on full bar closes by design, so partial bars never
  // surface as a CONFIRMED signal.
  const orWindowMinutes = DEFAULT_OR_WINDOW_MINUTES
  const orbSignal = useMemo(() => {
    if (isNaN(oh) || isNaN(ol) || !(oh > ol)) return null
    const oneMin = liveData?.intradayBars || []
    if (!oneMin.length) return null
    const fiveMin = aggregateBars(oneMin, 5)
    const orEndEtMin = RTH_OPEN_MINUTES_ET + orWindowMinutes
    const now = Date.now()
    const completedPostOr = fiveMin.filter(b => {
      if (etMinuteOfDay(b.t) < orEndEtMin) return false
      // Drop the in-flight 5m bucket (its window has not closed yet).
      if (b.t + 5 * 60000 > now) return false
      return true
    })
    return evaluateOrbSignals(completedPostOr, { orHigh: oh, orLow: ol })
  }, [oh, ol, orWindowMinutes, liveData?.intradayBars])

  // Stale-levels warning: live price more than one orRange beyond both
  // boundaries means the loaded OR is almost certainly from a prior session.
  const orbStale = useMemo(() => {
    if (livePriceForSanity == null || isNaN(oh) || isNaN(ol)) return false
    return detectStaleLevels(livePriceForSanity, oh, ol)
  }, [livePriceForSanity, oh, ol])

  const isLong = dir === 'long'
  const entry = range ? (isLong ? (es === 'retest' ? oh : oh + range * 0.03) : (es === 'retest' ? ol : ol - range * 0.03)) : null
  const stop = range ? (isLong ? ol : oh) : null
  const t1 = range ? (isLong ? oh + range : ol - range) : null
  const t2 = range ? (isLong ? oh + range * 2 : ol - range * 2) : null
  const t3 = range ? (isLong ? oh + range * 3 : ol - range * 3) : null
  const risk = range ? Math.abs(entry - stop) : null
  const rr2 = risk && t2 ? Math.abs(t2 - entry) / risk : null

  const rules = ['OR period has fully closed.', 'Underlying CLOSED above OR high or below OR low — no wicks.', 'Volume on breakout looks elevated.', 'Pre-market gap or trend aligns with direction.', 'No significant news in the next 30 minutes.', 'It is before 10:30 CT.', 'Daily loss limit and trade count allow this.']
  const allOk = rules.every((_, i) => checks[i])
  const done = rules.filter((_, i) => checks[i]).length

  const ladder = range ? [
    { l: '3:1 Target', p: t3, c: LIME },
    { l: '2:1 Target', p: t2, c: LIME },
    { l: '1:1 Target', p: t1, c: '#aaa' },
    { l: 'OR High', p: oh, c: '#555' },
    { l: 'OR Low', p: ol, c: '#555' },
    { l: 'Stop', p: stop, c: RED },
  ].filter(r => r.p != null).sort((a, b) => b.p - a.p) : []

  const livePrice = liveData?.price

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><SLabel>Opening Range Breakout — Underlying</SLabel><Heading>ORB Calculator</Heading></div>

      {/* Helper or sanity-fail banner. The red banner replaces the green one
          and visually dominates whenever OR values look wrong for ticker. */}
      {sanityFail ? (
        <div style={{ background: '#1a0505', border: `1px solid ${RED}88`, borderRadius: 5, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: RED, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>
            WARNING: opening range values look incorrect for {ticker || 'this ticker'}
          </div>
          <div style={{ fontSize: 11, color: '#cc8888', fontFamily: MONO, lineHeight: 1.7 }}>
            Current price ${f2(liveData?.price)}, OR HIGH ${orbH || '—'}, OR LOW ${orbL || '—'}. Difference exceeds {(SANITY_THRESHOLD * 100).toFixed(0)}%. Verify inputs before trading. Trading actions are disabled until resolved.
          </div>
        </div>
      ) : (
        <div style={{ background: '#080d08', border: '1px solid #152015', borderRadius: 5, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#3a5030', fontFamily: MONO, lineHeight: 1.8 }}>
            <span style={{ color: LIME }}>ORB uses underlying ({(ticker || 'QQQ').toUpperCase()}) prices.</span> Use IV tab to check contract pricing before entering.
          </div>
        </div>
      )}
      {prepFill && !sanityFail && <div style={{ fontSize: 11, fontFamily: MONO, color: YELLOW, background: '#0f0d04', border: '1px solid #252010', borderRadius: 4, padding: '10px 16px' }}>Levels pre-loaded from Prep. Verify against live chart.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <Fld label="Ticker" value={ticker} onChange={setTicker} type="text" placeholder="QQQ" mono />
        <div>
          <Fld label="OR High" value={orbH} onChange={setOrbHWithStamp} placeholder="714.00" prefix="$" />
          {(() => {
            const stamp = orbStamps?.high
            const stampDate = stamp ? new Date(stamp) : null
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const isPriorDay = stampDate && stampDate.getTime() < today.getTime()
            const label = loadingTicker ? 'Loading...' : stampDate
              ? `${isPriorDay ? 'Stale, last updated' : 'Updated'} ${stampDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : 'No timestamp'
            return <div style={{ fontSize: 9, fontFamily: MONO, color: isPriorDay ? RED : '#555', marginTop: 4 }}>{label}</div>
          })()}
        </div>
        <div>
          <Fld label="OR Low" value={orbL} onChange={setOrbLWithStamp} placeholder="711.50" prefix="$" />
          {(() => {
            const stamp = orbStamps?.low
            const stampDate = stamp ? new Date(stamp) : null
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const isPriorDay = stampDate && stampDate.getTime() < today.getTime()
            const label = loadingTicker ? 'Loading...' : stampDate
              ? `${isPriorDay ? 'Stale, last updated' : 'Updated'} ${stampDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : 'No timestamp'
            return <div style={{ fontSize: 9, fontFamily: MONO, color: isPriorDay ? RED : '#555', marginTop: 4 }}>{label}</div>
          })()}
        </div>
        <Sel label="Direction" value={dir} onChange={setDir} options={[{ value: 'long', label: '↑ Long — Buy Call' }, { value: 'short', label: '↓ Short — Buy Put' }]} />
      </div>

      {/* Refetch from chart: re-derive OR HIGH/LOW from live intraday bars
          covering 8:30-8:45 CT (first 15 min of the session). */}
      {(() => {
        const bars = liveData?.intradayBars || []
        const canFetch = bars.length > 0
        function refetchFromChart() {
          if (!canFetch) return
          // Filter to today's session in ET, 9:30-9:45 (570-585 minutes from
          // midnight ET = first 15 min of regular session)
          const first15 = bars.filter(b => {
            const d = new Date(b.t)
            const et = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
            const [h, m] = et.split(':').map(Number)
            const mins = h * 60 + m
            return mins >= 570 && mins < 585
          })
          if (!first15.length) return
          const hi = Math.max(...first15.map(b => b.h))
          const lo = Math.min(...first15.map(b => b.l))
          setOrbH(f2(hi))
          setOrbL(f2(lo))
          const now = new Date().toISOString()
          setOrbStamps({ high: now, low: now })
        }
        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={refetchFromChart} disabled={!canFetch} style={{
              background: 'transparent', border: `1px solid ${BORDER}`,
              color: canFetch ? '#aaa' : '#444',
              fontFamily: MONO, fontSize: 10, padding: '5px 12px', borderRadius: 3,
              cursor: canFetch ? 'pointer' : 'not-allowed', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>Refetch from chart</button>
          </div>
        )
      })()}

      {/* ── ORB Signal card. Always renders once OR levels are valid. ─────── */}
      {orbSignal && !sanityFail && (() => {
        const cur = orbSignal.current
        const state = cur?.state || 'WATCHING'
        const tone = state === 'CONFIRMED'
          ? (cur?.direction === 'LONG' ? 'long' : cur?.direction === 'SHORT' ? 'short' : 'neutral')
          : state === 'PENDING' ? 'pending' : 'watching'
        const color = tone === 'long' ? LIME : tone === 'short' ? RED : tone === 'pending' ? YELLOW : '#888'
        const bg = tone === 'long' ? '#071208' : tone === 'short' ? '#150505' : tone === 'pending' ? '#100d04' : '#0a0a0a'
        const border = tone === 'long' ? `${LIME}55` : tone === 'short' ? `${RED}55` : tone === 'pending' ? `${YELLOW}55` : BORDER
        const directionGlyph = cur?.direction === 'LONG' ? '▲' : cur?.direction === 'SHORT' ? '▼' : '•'
        return (
          <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 5, padding: '14px 18px' }}>
            {orbStale && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#150505', border: `1px solid ${RED}55`, borderRadius: 4, fontSize: 10, fontFamily: MONO, color: RED, letterSpacing: '0.06em' }}>
                STALE LEVELS: live price ${f2(livePriceForSanity)} sits more than one OR range from both boundaries. The loaded OR may be from a prior session. Use Refetch from chart above.
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 10, fontFamily: MONO, fontWeight: 800, letterSpacing: '0.14em',
                  color: state === 'CONFIRMED' ? '#000' : color,
                  background: state === 'CONFIRMED' ? color : 'transparent',
                  border: `1px solid ${color}`,
                  padding: '3px 8px', borderRadius: 3,
                }}>{state}</span>
                {cur?.signal && (
                  <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: '#e8e8e8', letterSpacing: '0.04em' }}>
                    {cur.signal.replace(/_/g, ' ')}
                  </span>
                )}
                {state === 'PENDING' && (
                  <span style={{ fontSize: 11, fontFamily: MONO, color, letterSpacing: '0.08em' }}>{cur.boundary} broken</span>
                )}
              </div>
              {cur?.direction && (
                <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 800, color, letterSpacing: '0.12em' }}>
                  {directionGlyph} {cur.direction}
                </span>
              )}
            </div>
            {state === 'CONFIRMED' && (
              <>
                <div style={{ fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.6, marginBottom: 8 }}>{cur.explanation}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: MONO, color: '#888', flexWrap: 'wrap' }}>
                  <span><span style={{ color: '#555' }}>Boundary:</span> <strong style={{ color: '#bbb' }}>{cur.boundary}</strong></span>
                  {cur.event?.boundaryPrice != null && (
                    <span><span style={{ color: '#555' }}>Level:</span> <strong style={{ color: '#bbb' }}>${f2(cur.event.boundaryPrice)}</strong></span>
                  )}
                  {cur.price != null && (
                    <span><span style={{ color: '#555' }}>Trigger close:</span> <strong style={{ color }}>${f2(cur.price)}</strong></span>
                  )}
                </div>
              </>
            )}
            {state === 'PENDING' && (
              <>
                <div style={{ fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.6, marginBottom: 8 }}>{cur.waitingFor}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: MONO, color: '#888', flexWrap: 'wrap' }}>
                  <span><span style={{ color: '#555' }}>Boundary:</span> <strong style={{ color: '#bbb' }}>{cur.boundary} ${f2(cur.boundaryPrice)}</strong></span>
                  <span><span style={{ color: '#555' }}>Break close:</span> <strong style={{ color: YELLOW }}>${f2(cur.triggerPrice)}</strong></span>
                  <span><span style={{ color: '#555' }}>Window remaining:</span> <strong style={{ color: YELLOW }}>{cur.windowRemaining} {cur.windowRemaining === 1 ? 'bar' : 'bars'} (5m)</strong></span>
                </div>
              </>
            )}
            {state === 'WATCHING' && (
              <div style={{ fontSize: 11, fontFamily: MONO, color: '#888', lineHeight: 1.6 }}>
                No qualifying bar close yet. Engine waits for a full 5m bar to close beyond OR High or OR Low, or for an inside-range wick-and-reclaim of either boundary.
              </div>
            )}
          </div>
        )
      })()}

      <Sel label="Entry Style" value={es} onChange={setEs} options={[{ value: 'retest', label: 'Retest Entry — wait for pullback to OR level (recommended)' }, { value: 'break', label: 'Breakout Entry — enter on first close above/below' }]} />
      {range && (
        <div style={{ pointerEvents: sanityFail ? 'none' : 'auto', opacity: sanityFail ? 0.3 : 1, filter: sanityFail ? 'grayscale(1)' : 'none', transition: 'opacity 0.2s' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Tile compact label="OR Range" value={`$${f2(range)}`} sub="underlying" />
            <Tile compact label={isLong ? 'Call Entry' : 'Put Entry'} value={`$${f2(entry)}`} sub="underlying trigger" color={isLong ? LIME : RED} />
            <Tile compact label="Stop Level" value={`$${f2(stop)}`} sub="underlying ref" color={RED} />
          </div>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <SLabel>Price Ladder</SLabel>
              {livePrice && <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: LIME }}>LIVE ${f2(livePrice)}</span>}
            </div>
            {livePrice && (() => {
              const isAbove = livePrice > oh
              const isBelow = livePrice < ol
              const bg = isAbove ? '#071208' : isBelow ? '#120708' : '#0a0a0a'
              const borderC = isAbove ? LIME : isBelow ? RED : '#1a1a1a'
              const color = isAbove ? LIME : isBelow ? RED : YELLOW
              const msg = isAbove ? '▲ ABOVE OR HIGH — breakout' : isBelow ? '▼ BELOW OR LOW — breakdown' : '◆ INSIDE RANGE — wait'
              return (
                <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 4, background: bg, border: `1px solid ${borderC}` }}>
                  <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color }}>{msg}</span>
                </div>
              )
            })()}
            {ladder.map((row, i) => {
              const isNear = livePrice && Math.abs(livePrice - row.p) < 0.15
              const isCrossed = livePrice && ((row.l.includes('High') && livePrice > row.p) || (row.l.includes('Low') && livePrice < row.p))
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < ladder.length - 1 ? '1px solid #0f0f0f' : 'none', background: isNear ? '#1a1a0a' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isNear && <div style={{ width: 6, height: 6, borderRadius: '50%', background: LIME, boxShadow: `0 0 6px ${LIME}` }} />}
                    <span style={{ fontSize: 9, color: isCrossed ? LIME : row.c, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: isCrossed ? 700 : 400 }}>{row.l}</span>
                  </div>
                  <span style={{ fontSize: 13, color: isCrossed ? LIME : row.c, fontFamily: MONO, fontWeight: isCrossed ? 900 : 600 }}>${f2(row.p)}</span>
                </div>
              )
            })}
          </Card>
          <Card>
            <SLabel>Underlying Price Targets</SLabel>
            {[{ l: '1:1 — Move stop to BE on option', p: t1, note: 'Check if option ~doubled' }, { l: '2:1 — Primary target', p: t2, rr: rr2, note: 'Your option target corresponds here' }, { l: '3:1 — Extension runner', p: t3, note: 'Trail stop on option if 2:1 hit' }].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < 2 ? '1px solid #111' : 'none' }}>
                <div>
                  <div style={{ fontSize: 12, fontFamily: MONO, color: '#666' }}>{row.l}</div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: '#2a2a2a', marginTop: 2 }}>{row.note}</div>
                </div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontFamily: MONO, color: isLong ? LIME : RED, fontWeight: 700 }}>${f2(row.p)}</span>
                  {row.rr && <span style={{ fontSize: 10, fontFamily: MONO, color: rrColor(row.rr) }}>1:{f2(row.rr)}</span>}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
      <Card>
        <SLabel>ORB Pre-Entry Checklist</SLabel>
        {rules.map((rule, i) => <CheckRow key={i} text={rule} required={true} checked={!!checks[i]} onToggle={() => setChecks(c => ({ ...c, [i]: !c[i] }))} />)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1, height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(done / rules.length) * 100}%`, background: allOk ? LIME : YELLOW, transition: 'width 0.25s' }} />
          </div>
          <span style={{ fontSize: 10, fontFamily: MONO, color: allOk ? LIME : '#555' }}>{done}/{rules.length}</span>
        </div>
      </Card>
      {range && <Btn disabled={!allOk} onClick={() => onSendToCalc({ ticker, optType: isLong ? 'call' : 'put', setupType: 'ORB' })}>{allOk ? 'Send to Calculator →' : `Complete ${rules.length - done} remaining checks`}</Btn>}
    </div>
  )
}

// ── IV Analyzer ────────────────────────────────────────────────────────────────
export function IVAnalyzerTab({ apiKey, instrument }) {
  if (instrument === 'stock') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div><SLabel>Black-Scholes Pricing Engine</SLabel><Heading>IV Analyzer</Heading></div>
        <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 14, color: '#2a2a2a' }}>◈</div>
          <div style={{ fontSize: 13, fontFamily: MONO, color: '#555', marginBottom: 8 }}>IV analysis is for options contracts only.</div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#333', lineHeight: 1.7 }}>Switch to <strong style={{ color: LIME }}>Options</strong> in the Prep tab to access IV analysis.</div>
        </div>
      </div>
    )
  }
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [fetchTicker, setFetchTicker] = useState('QQQ')
  const [fetchExpiry, setFetchExpiry] = useState(todayStr())
  const [fetchStrike, setFetchStrike] = useState('')
  const [fetchType, setFetchType] = useState('call')
  const [fetchResults, setFetchResults] = useState([])

  const [underlying, setUnderlying] = useState('')
  const [strike, setStrike] = useState('')
  const [dte, setDte] = useState('')
  const [iv, setIv] = useState('')
  const [mp, setMp] = useState('')
  const [optType, setOptType] = useState('call')
  const [contracts, setContracts] = useState('1')
  const [stopP, setStopP] = useState('')
  const [targetP, setTargetP] = useState('')
  const [ivRank, setIvRank] = useLocalStorage('th-iv-rank-input', '')

  async function doFetch() {
    // Options endpoints are not in the current Polygon plan and are blocked
    // by the proxy allowlist. Keep the UI in place for a future restoration
    // but surface a clear error so the user knows why nothing is loading.
    setFetchError('Options chain unavailable: current Polygon plan does not include options data.')
    setFetchResults([])
  }

  const S = parseFloat(underlying), K = parseFloat(strike), T = parseFloat(dte) / 365, sigma = parseFloat(iv) / 100, r = 0.045, mpp = parseFloat(mp), n = parseInt(contracts) || 1
  const result = (!isNaN(S) && !isNaN(K) && !isNaN(T) && !isNaN(sigma) && T > 0 && sigma > 0) ? bsCalc(S, K, T, r, sigma, optType) : null
  const ivCtx = !isNaN(parseFloat(iv)) ? ivContext(parseFloat(iv)) : null
  const optRR = calcOptionRR(mp, stopP, targetP, contracts)
  const beU = result && !isNaN(mpp) ? (optType === 'call' ? K + mpp : K - mpp) : null
  const em = !isNaN(S) && !isNaN(T) && !isNaN(sigma) ? S * sigma * Math.sqrt(T) : null

  let money = '', mc = '#888'
  if (!isNaN(S) && !isNaN(K)) {
    const d = ((S - K) / K) * 100
    if (optType === 'call') { if (S > K * 1.005) { money = `ITM +${f2(Math.abs(d))}%`; mc = LIME } else if (S < K * 0.995) { money = `OTM ${f2(Math.abs(d))}%`; mc = YELLOW } else { money = 'ATM'; mc = BLUE } }
    else { if (S < K * 0.995) { money = `ITM +${f2(Math.abs(d))}%`; mc = LIME } else if (S > K * 1.005) { money = `OTM ${f2(Math.abs(d))}%`; mc = YELLOW } else { money = 'ATM'; mc = BLUE } }
  }
  let fairColor = '#888', fairLabel = ''
  if (result && !isNaN(mpp)) {
    const pct = ((mpp - result.price) / result.price) * 100
    if (pct > 20) { fairColor = RED; fairLabel = `${f2(pct)}% ABOVE FAIR — Overpriced` }
    else if (pct > 10) { fairColor = YELLOW; fairLabel = `${f2(pct)}% above fair — Slightly rich` }
    else if (pct < -10) { fairColor = LIME; fairLabel = `${f2(Math.abs(pct))}% below fair — Cheap` }
    else { fairColor = LIME; fairLabel = 'Near fair value' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><SLabel>Black-Scholes Pricing Engine</SLabel><Heading>IV Analyzer</Heading></div>
      <div style={{ background: '#080e05', border: '1px solid #1a2a1a', borderRadius: 5, padding: '18px 20px' }}>
        <SLabel>Fetch Live Contract from Massive</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <Fld label="Ticker" value={fetchTicker} onChange={setFetchTicker} type="text" placeholder="QQQ" mono />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 9, letterSpacing: '0.14em', color: '#3a3a3a', textTransform: 'uppercase', fontFamily: MONO }}>Expiry</label>
            <input type="date" value={fetchExpiry} onInput={e => setFetchExpiry(e.target.value)} style={{ background: '#0c0c0c', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#e8e8e8', fontFamily: MONO, fontSize: 12, padding: '9px 12px', outline: 'none', width: '100%' }} />
          </div>
          <Fld label="Strike" value={fetchStrike} onChange={setFetchStrike} placeholder="714" prefix="$" />
          <Sel label="Type" value={fetchType} onChange={setFetchType} options={[{ value: 'call', label: 'Call ↑' }, { value: 'put', label: 'Put ↓' }]} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Btn onClick={doFetch} disabled={fetching || !apiKey}>{fetching ? 'Fetching...' : apiKey ? 'Fetch Live Contract →' : 'Add API key in Command'}</Btn>
          {fetchResults.length > 0 && <span style={{ fontSize: 10, fontFamily: MONO, color: LIME }}>✓ {fetchResults.length} contract{fetchResults.length > 1 ? 's' : ''} found — fields populated below</span>}
        </div>
        {fetchError && <div style={{ fontSize: 11, color: RED, fontFamily: MONO, marginTop: 8 }}>{fetchError}</div>}
        {fetchResults.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <SLabel>Matching Contracts — click to load</SLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {fetchResults.map((r, i) => (
                <div key={i} onClick={() => {
                  if (r.last_quote?.ask) setMp(f2(r.last_quote.ask))
                  if (r.implied_volatility) setIv(f2(r.implied_volatility * 100))
                  if (r.details?.strike_price) setStrike(String(r.details.strike_price))
                  if (r.underlying_asset?.value) setUnderlying(f2(r.underlying_asset.value))
                }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, cursor: 'pointer' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#ccc' }}>{r.details?.ticker || '—'}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: LIME }}>Ask: ${f2(r.last_quote?.ask)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: BLUE }}>IV: {f2((r.implied_volatility || 0) * 100)}%</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: YELLOW }}>Δ: {f2(r.greeks?.delta, 3)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#555' }}>OI: {r.open_interest?.toLocaleString() || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Card>
        <SLabel>Enter from your broker's option chain</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Sel label="Option Type" value={optType} onChange={setOptType} options={[{ value: 'call', label: 'Call — Bullish ↑' }, { value: 'put', label: 'Put — Bearish ↓' }]} />
          <Fld label="Underlying Price" value={underlying} onChange={setUnderlying} placeholder="713.36" prefix="$" />
          <Fld label="Strike Price" value={strike} onChange={setStrike} placeholder="714.00" prefix="$" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Fld label="DTE" value={dte} onChange={setDte} placeholder="1" step="1" suffix="d" tip="Days to Expiration — how many days until the option expires. 0DTE expires today and has maximum theta decay. Theta burns fastest after 10:30 CT — be precise with timing." />
          <Fld label="IV% (from chain)" value={iv} onChange={setIv} placeholder="28.5" suffix="%" tip="Implied Volatility — the market's expectation of future price movement, priced into the option. High IV = expensive premium. Buy when IV is relatively low and the expected move is real." />
          <Fld label="Ask Price" value={mp} onChange={setMp} placeholder="2.40" prefix="$" />
          <Fld label="Contracts" value={contracts} onChange={setContracts} placeholder="1" step="1" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Fld label="Your Stop (option price)" value={stopP} onChange={setStopP} placeholder="1.20" prefix="$" />
          <Fld label="Your Target (option price)" value={targetP} onChange={setTargetP} placeholder="4.80" prefix="$" />
        </div>
      </Card>
      {result && (
        <>
          <div style={{ background: '#0a0a0a', border: `1px solid ${PURPLE}33`, borderRadius: 5, padding: '22px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <SLabel>Theoretical Fair Value (Black-Scholes)</SLabel>
              <div style={{ fontSize: 48, fontWeight: 900, fontFamily: MONO, color: PURPLE, lineHeight: 1, letterSpacing: '-0.03em' }}>${f2(result.price)}</div>
              {!isNaN(mpp) && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#444', fontFamily: MONO, marginBottom: 4 }}>You're paying: <span style={{ color: '#e8e8e8', fontWeight: 700 }}>${f2(mpp)}</span> / contract = <span style={{ color: '#aaa' }}>${f2(mpp * n * 100)} total</span></div>
                  <div style={{ fontSize: 13, fontFamily: MONO, color: fairColor, fontWeight: 700 }}>{fairLabel}</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'right' }}>
              {money && <div><div style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '0.1em', fontFamily: MONO, textTransform: 'uppercase' }}>Moneyness</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: mc }}>{money}</div></div>}
              {ivCtx && <div><div style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '0.1em', fontFamily: MONO, textTransform: 'uppercase' }}>IV Level</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: ivCtx.color }}>{ivCtx.label}</div></div>}
              <div><div style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '0.1em', fontFamily: MONO, textTransform: 'uppercase' }}>Daily Theta</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: RED }}>-${f2(Math.abs(result.theta), 3)}/day</div></div>
            </div>
          </div>
          {ivCtx && <div style={{ background: PANEL, border: `1px solid ${ivCtx.color}22`, borderRadius: 5, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 20, color: ivCtx.color, fontFamily: MONO, flexShrink: 0 }}>◉</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: ivCtx.color, letterSpacing: '0.06em', marginBottom: 5 }}>IV {f2(parseFloat(iv))}% — {ivCtx.label}</div>
              <div style={{ fontSize: 11, color: '#555', fontFamily: MONO, lineHeight: 1.7 }}>{ivCtx.detail}</div>
            </div>
          </div>}

          {/* IV Rank panel — surfaced when holding multi-day */}
          {parseInt(dte) > 3 && (() => {
            const rank = parseFloat(ivRank)
            const valid = !isNaN(rank) && rank >= 0 && rank <= 100
            let label, color, msg
            if (!valid) {
              label = 'Enter IV Rank'; color = '#888'
              msg = 'IV Rank tells you how today\'s IV compares to the last 52 weeks. Your broker shows it on each option chain.'
            } else if (rank >= 50) {
              label = 'EXPENSIVE'; color = RED
              msg = 'High IV rank: premium is rich. Caution buying — you\'re paying up. Consider selling premium or waiting for IV to drop.'
            } else if (rank >= 30) {
              label = 'FAIR'; color = YELLOW
              msg = 'Mid IV rank: premium is fairly priced relative to history. Acceptable for directional plays.'
            } else {
              label = 'CHEAP'; color = LIME
              msg = 'Low IV rank: options are cheap relative to history. Good environment to buy options if the setup is there.'
            }
            return (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <SLabel style={{ marginBottom: 0 }}>IV Rank ({parseInt(dte)} DTE — matters more on multi-day)</SLabel>
                  <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 700, color }}>{label}{valid ? ` · ${f2(rank)}%` : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <input type="number" min="0" max="100" value={ivRank} onChange={e => setIvRank(e.target.value)} placeholder="e.g. 32" style={{ width: 120, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#e8e8e8', fontFamily: MONO, fontSize: 13, padding: '8px 10px', outline: 'none' }} />
                  <span style={{ fontSize: 10, fontFamily: MONO, color: '#555' }}>0–100 (from your broker's option chain)</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: MONO, color: valid ? color : '#666', lineHeight: 1.6 }}>{msg}</div>
              </Card>
            )
          })()}
          {(beU || em) && <Card>
            <SLabel>Key Levels</SLabel>
            {beU && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #0f0f0f' }}><div><div style={{ fontSize: 11, fontFamily: MONO, color: '#555' }}>Break-even at expiry (underlying)</div><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, marginTop: 2 }}>QQQ must reach here for profit at expiry</div></div><div style={{ fontSize: 15, fontFamily: MONO, fontWeight: 700, color: YELLOW }}>${f2(beU)}</div></div>}
            {em && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}><div><div style={{ fontSize: 11, fontFamily: MONO, color: '#555' }}>Expected 1σ move (underlying)</div><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, marginTop: 2 }}>Market pricing {f2((em / S) * 100)}% move from ${f2(S)}</div></div><div style={{ fontSize: 15, fontFamily: MONO, fontWeight: 700, color: BLUE }}>±${f2(em)}</div></div>}
          </Card>}
          {optRR && <Card style={{ border: `1px solid ${rrColor(optRR.rr)}33` }}>
            <SLabel style={{ display: 'flex', alignItems: 'center' }}>R:R on This Contract<Tip tip="Risk to Reward ratio — how much you make vs. how much you risk per trade. At 2:1 you make $2 for every $1 risked, meaning you only need to be right 34% of the time to be net profitable. Never take a trade below 2:1." /></SLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
              {[{ l: 'Entry', v: '$' + f2(parseFloat(mp)), c: '#e8e8e8' }, { l: 'Stop', v: '$' + f2(parseFloat(stopP)), c: RED }, { l: 'Target', v: '$' + f2(parseFloat(targetP)), c: LIME }, { l: 'R:R', v: '1:' + f2(optRR.rr), c: rrColor(optRR.rr) }].map(row => (
                <div key={row.l}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{row.l}</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: row.c }}>{row.v}</div></div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ background: '#0a0505', border: '1px solid #1e0808', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#3a1a1a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>$ Risk ({n}c)</div><div style={{ fontSize: 17, fontFamily: MONO, fontWeight: 700, color: RED }}>-${f2(optRR.dollarRisk)}</div></div>
              <div style={{ background: '#060d04', border: '1px solid #152010', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#1a3a1a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>$ Reward ({n}c)</div><div style={{ fontSize: 17, fontFamily: MONO, fontWeight: 700, color: LIME }}>+${f2(optRR.dollarReward)}</div></div>
              <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Total Cost</div><div style={{ fontSize: 17, fontFamily: MONO, fontWeight: 700, color: '#777' }}>{fmtU(optRR.totalCost)}</div></div>
            </div>
            {optRR.rr < 2 && <div style={{ marginTop: 12, fontSize: 11, fontFamily: MONO, color: RED, padding: '10px 14px', background: '#100505', borderRadius: 4, border: '1px solid #2a0a0a' }}>R:R below 2:1. Per your rules, this does not qualify. Do not enter.</div>}
          </Card>}
          <div>
            <SLabel>The Greeks</SLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { l: 'Delta', v: f2(result.delta, 3), c: result.delta > 0 ? LIME : RED, d: `Option moves $${f2(Math.abs(result.delta), 2)} per $1 QQQ move.` },
                { l: 'Theta / day', v: '-$' + f2(Math.abs(result.theta), 3), c: RED, d: `You lose $${f2(Math.abs(result.theta), 2)} per day from time decay.` },
                { l: 'Vega / 1% IV', v: '$' + f2(result.vega, 3), c: BLUE, d: `Option moves $${f2(result.vega, 2)} per 1% IV change.` },
                { l: 'Gamma', v: f2(result.gamma, 4), c: YELLOW, d: `Delta accelerates by ${f2(result.gamma, 4)} per $1 move.` },
              ].map(g => (
                <div key={g.l} style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '0.14em', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 4 }}>{g.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: g.c, marginBottom: 4 }}>{g.v}</div>
                  <div style={{ fontSize: 10, color: '#333', fontFamily: MONO, lineHeight: 1.5 }}>{g.d}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Calculator Tab ────────────────────────────────────────────────────────────
export function CalculatorTab({ prefill, onLogTrade, checklistPassed, lockedOut, maxTradesReached, apiKey, instrument, schwab, prep, liveData }) {
  const [ticker, setTicker] = useState('')
  const [optType, setOptType] = useState('call')
  const [strike, setStrike] = useState('')
  const [dte, setDte] = useState('')
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [contracts, setContracts] = useState('1')
  const [setupType, setSetupType] = useState('ORB')
  const [liveAskLoading, setLiveAskLoading] = useState(false)
  const [liveAskError, setLiveAskError] = useState(null)
  const [askDetail, setAskDetail] = useState(null)  // { bid, ask, spread }
  const [stageOpen, setStageOpen] = useState(false)
  const [expiry, setExpiry] = useState(todayStr())

  const isStock = instrument === 'stock'
  const schwabConnected = !!schwab?.isConnected
  const schwabAcctInfo = schwab?.account || null

  useEffect(() => {
    if (!prefill) return
    if (prefill.ticker) setTicker(prefill.ticker)
    if (prefill.optType) setOptType(prefill.optType)
    if (prefill.setupType) setSetupType(prefill.setupType)
  }, [prefill])

  async function fetchSchwabAsk() {
    if (!schwabConnected || !ticker || !strike) { setLiveAskError('Need Schwab connection, ticker, and strike.'); return }
    setLiveAskLoading(true); setLiveAskError(null); setAskDetail(null)
    try {
      const chain = await schwab.getChain(ticker, {
        expiry,
        type: optType.toLowerCase() === 'put' ? 'PUT' : 'CALL',
        strike: parseFloat(strike),
      })
      const side = optType.toLowerCase() === 'put' ? chain.puts : chain.calls
      const target = parseFloat(strike)
      const match = (side || []).find(c => parseFloat(c.strike) === target) || side?.[0]
      if (!match || match.ask == null) { setLiveAskError('No contract found at that strike/expiry.'); setLiveAskLoading(false); return }
      setEntry(f2(match.ask))
      setAskDetail({ bid: match.bid, ask: match.ask, spread: (match.ask || 0) - (match.bid || 0) })
    } catch (e) { setLiveAskError(e.message || 'Schwab quote failed') }
    setLiveAskLoading(false)
  }

  // Options R:R
  const calcOpts = !isStock ? calcOptionRR(entry, stop, target, contracts) : null

  // Stock R:R — same math, no ×100 multiplier
  const sharesN = parseInt(contracts) || 1
  const eN = parseFloat(entry), sN = parseFloat(stop), tN = parseFloat(target)
  const calcStock = isStock && eN > 0 && sN > 0 && tN > 0 && eN > sN && tN > eN ? (() => {
    const risk = eN - sN, reward = tN - eN, rr = reward / risk
    return { rr, risk, reward, dollarRisk: risk * sharesN, dollarReward: reward * sharesN, totalCost: eN * sharesN, breakEvenWin: (1 / (1 + rr)) * 100 }
  })() : null

  const calc = isStock ? calcStock : calcOpts
  const blocked = lockedOut || maxTradesReached
  const valid = calc !== null
  const color = valid ? rrColor(calc.rr) : '#333'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><SLabel>{isStock ? 'Stock/ETF Trade Entry' : 'Options-First Trade Entry'}</SLabel><Heading>R:R Calculator</Heading></div>
      <div style={{ background: '#0a0d08', border: '1px solid #1a2a18', borderRadius: 5, padding: '12px 16px' }}>
        <div style={{ fontSize: 10, color: '#3a5030', fontFamily: MONO, lineHeight: 1.8 }}>
          {isStock
            ? <><span style={{ color: LIME, fontWeight: 700 }}>Stock mode:</span> Entry, stop, and target are share prices. Dollar amounts = price difference × shares.</>
            : <><span style={{ color: LIME, fontWeight: 700 }}>Options mode:</span> Entry, stop, and target are the option contract prices — not QQQ. Amounts auto-calculate at ×100 per contract.</>
          }
        </div>
      </div>
      {!checklistPassed && <div style={{ background: '#120d00', border: '1px solid #2a1e00', borderRadius: 4, padding: '11px 16px', fontSize: 11, fontFamily: MONO, color: YELLOW }}>Checklist not confirmed. Run the Pre-Trade Checklist first.</div>}
      {blocked && <div style={{ background: '#150000', border: `1px solid ${RED}33`, borderRadius: 4, padding: '11px 16px', fontSize: 11, fontFamily: MONO, color: RED }}>{lockedOut ? 'Trading locked — daily loss limit reached.' : 'Daily trade limit reached.'}</div>}
      <div style={{ background: '#0a0a0a', border: `1px solid ${valid ? color + '44' : BORDER}`, borderRadius: 5, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, color: '#333', letterSpacing: '0.14em', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 10 }}>{isStock ? 'Risk : Reward (on share price)' : 'Risk : Reward (on premium)'}</div>
          <div style={{ fontSize: 48, fontWeight: 900, color, fontFamily: MONO, lineHeight: 1, letterSpacing: '-0.03em' }}>{valid ? '1 : ' + f2(calc.rr) : '— : —'}</div>
          {valid && <div style={{ fontSize: 10, color, fontFamily: MONO, letterSpacing: '0.14em', marginTop: 8, textTransform: 'uppercase' }}>{calc.rr >= 3 ? 'STRONG EDGE' : calc.rr >= 2 ? 'ACCEPTABLE' : 'POOR SETUP — DO NOT TRADE'}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'right' }}>
          {[{ l: 'Break-even Win%', v: valid ? f2(calc.breakEvenWin) + '%' : '—', c: '#aaa' }, { l: 'Total Cost', v: valid ? fmtU(calc.totalCost) : '—', c: '#777' }, { l: 'Max $ Risk', v: valid ? fmtU(calc.dollarRisk) : '—', c: RED }, { l: 'Max $ Reward', v: valid ? fmtU(calc.dollarReward) : '—', c: LIME }].map(row => (
            <div key={row.l}><div style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '0.1em', fontFamily: MONO, textTransform: 'uppercase' }}>{row.l}</div><div style={{ fontSize: 15, color: row.c, fontFamily: MONO, fontWeight: 600 }}>{row.v}</div></div>
          ))}
        </div>
      </div>

      {/* Ticker + direction + setup */}
      {isStock ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Fld label="Ticker" value={ticker} onChange={setTicker} type="text" placeholder="SPY" mono />
          <Sel label="Setup Type" value={setupType} onChange={setSetupType} options={SETUP_TYPES.map(s => ({ value: s, label: s }))} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Fld label="Ticker" value={ticker} onChange={setTicker} type="text" placeholder="QQQ" mono />
            <Sel label="Option Type" value={optType} onChange={setOptType} options={[{ value: 'call', label: 'Call — Bullish ↑' }, { value: 'put', label: 'Put — Bearish ↓' }]} />
            <Sel label="Setup Type" value={setupType} onChange={setSetupType} options={SETUP_TYPES.map(s => ({ value: s, label: s }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Fld label="Strike" value={strike} onChange={setStrike} placeholder="714" prefix="$" />
            <Fld label="DTE" value={dte} onChange={setDte} placeholder="0" step="1" suffix="d" />
            <Fld label="Contracts" value={contracts} onChange={setContracts} placeholder="1" step="1" />
          </div>
        </>
      )}

      {/* Price fields */}
      <div style={{ background: '#080d05', border: '1px solid #1a2a10', borderRadius: 5, padding: '16px 18px' }}>
        {isStock ? (
          <>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', color: '#3a5030', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6 }}>Share Prices</div>
            <div style={{ fontSize: 10, color: '#3a5030', fontFamily: MONO, marginBottom: 14, lineHeight: 1.7 }}>All prices are share prices. Dollar risk/reward = price difference × number of shares.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <Fld label="Entry (share price)" value={entry} onChange={setEntry} placeholder="512.50" prefix="$" accent />
              <Fld label="Stop (share price)" value={stop} onChange={setStop} placeholder="510.00" prefix="$" accent />
              <Fld label="Target (share price)" value={target} onChange={setTarget} placeholder="517.50" prefix="$" accent />
              <Fld label="Shares" value={contracts} onChange={setContracts} placeholder="100" step="1" />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', color: '#3a5030', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6 }}>Option Contract Prices (premium per share)</div>
            <div style={{ fontSize: 10, color: '#3a5030', fontFamily: MONO, marginBottom: 14, lineHeight: 1.7 }}>Entry, stop, target = option's own price. 1 contract = 100 shares. $ amounts = price × 100 × contracts.</div>
            {schwabConnected ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <Fld label="Expiry" value={expiry} onChange={setExpiry} type="date" />
                <button onClick={fetchSchwabAsk} disabled={liveAskLoading || !ticker || !strike} style={{ background: liveAskLoading || !ticker || !strike ? '#1a1a1a' : SCHWAB_BLUE, color: liveAskLoading || !ticker || !strike ? '#444' : '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: liveAskLoading || !ticker || !strike ? 'not-allowed' : 'pointer', alignSelf: 'flex-end' }}>{liveAskLoading ? 'Fetching...' : 'Get Live Ask (Schwab) →'}</button>
                {liveAskError && <span style={{ fontSize: 10, color: RED, fontFamily: MONO }}>{liveAskError}</span>}
                {askDetail && <span style={{ fontSize: 10, color: SCHWAB_BLUE, fontFamily: MONO }}>Bid ${f2(askDetail.bid)} / Ask ${f2(askDetail.ask)} · spread ${f2(askDetail.spread)}</span>}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: '#444', fontFamily: MONO, marginBottom: 12, lineHeight: 1.6 }}>
                Enter ask price from your broker's option chain. <span style={{ color: '#666' }}>(Connect Schwab in Command for one-click live ask.)</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Fld label="Entry Premium" value={entry} onChange={setEntry} placeholder="2.40" prefix="$" accent />
              <Fld label="Stop (option price)" value={stop} onChange={setStop} placeholder="1.20" prefix="$" accent />
              <Fld label="Target (option price)" value={target} onChange={setTarget} placeholder="4.80" prefix="$" accent />
            </div>
          </>
        )}
        {valid && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
            {isStock ? (
              <>
                <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Risk / share</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: RED }}>-${f2(calc.risk)}</div></div>
                <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Reward / share</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: LIME }}>${f2(calc.reward)}</div></div>
                <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Total cost ({sharesN} shares)</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: '#aaa' }}>{fmtU(calc.totalCost)}</div></div>
              </>
            ) : (
              <>
                <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Risk / contract</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: RED }}>-${f2(calc.risk)} <span style={{ fontSize: 10, color: '#444' }}>= -${f2(calc.risk * 100)}</span></div></div>
                <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Reward / contract</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: LIME }}>${f2(calc.reward)} <span style={{ fontSize: 10, color: '#444' }}>= ${f2(calc.reward * 100)}</span></div></div>
                <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Total cost ({contracts}c)</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: '#aaa' }}>{fmtU(calc.totalCost)}</div></div>
              </>
            )}
          </div>
        )}
      </div>
      {/* Multi-day theta + break-even */}
      {!isStock && valid && parseInt(dte) > 1 && (() => {
        const dteN = parseInt(dte)
        const S = liveData?.price
        const K = parseFloat(strike)
        const e = parseFloat(entry)
        const T = dteN / 365
        const ivPct = parseFloat((prep?.ivNote || '').replace(/[^\d.]/g, '')) || 25
        const sigma = ivPct / 100
        const r = 0.045
        const bsForTheta = (!isNaN(S) && !isNaN(K) && T > 0 && sigma > 0) ? bsCalc(S, K, T, r, sigma, optType) : null
        const dailyTheta = bsForTheta?.theta != null ? bsForTheta.theta : -e / dteN  // fallback: linear decay heuristic
        const thetaPerContractDollar = Math.abs(dailyTheta) * 100
        const holdCost = thetaPerContractDollar * dteN * (parseInt(contracts) || 1)
        const breakeven = !isNaN(K) && !isNaN(e) ? (optType === 'call' ? K + e : K - e) : null
        const expiryDate = (() => { const d = new Date(); d.setDate(d.getDate() + dteN); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })()
        return (
          <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 5, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 9, fontFamily: MONO, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Multi-Day Trade — {dteN} DTE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, fontFamily: MONO, fontSize: 11 }}>
              <div>
                <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Daily theta</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: RED }}>-${f2(thetaPerContractDollar)} <span style={{ fontSize: 10, color: '#444' }}>per contract / day</span></div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Cost to hold {dteN} day{dteN !== 1 ? 's' : ''}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: RED }}>-${f2(holdCost)} <span style={{ fontSize: 10, color: '#444' }}>({contracts || 1}c)</span></div>
              </div>
              {breakeven != null && (
                <div>
                  <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Break-even by expiry</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8e8' }}>${f2(breakeven)} <span style={{ fontSize: 10, color: '#444' }}>by {expiryDate}</span></div>
                  {S != null && (
                    <div style={{ fontSize: 10, fontFamily: MONO, color: '#666', marginTop: 3 }}>{optType === 'call' ? 'Underlying needs +' : 'Underlying needs -'}${f2(Math.abs(breakeven - S))} from current</div>
                  )}
                </div>
              )}
            </div>
            {!bsForTheta && (
              <div style={{ fontSize: 9, fontFamily: MONO, color: '#444', fontStyle: 'italic' }}>Theta estimated linearly. For Black-Scholes theta, set IV in Prep and have live price loaded.</div>
            )}
          </div>
        )
      })()}

      {/* Buying power check (Schwab connected only) */}
      {schwabConnected && valid && !isStock && schwabAcctInfo?.buyingPower != null && (() => {
        const cost = calc.totalCost
        const bp = schwabAcctInfo.buyingPower
        const over = cost > bp
        return (
          <div style={{ background: over ? '#150505' : '#0a1408', border: `1px solid ${over ? RED + '55' : LIME + '44'}`, borderRadius: 4, padding: '10px 14px', fontSize: 11, fontFamily: MONO, color: over ? RED : LIME, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{over ? '⚠ Exceeds buying power' : '✓ Within buying power'}</span>
            <span style={{ color: '#888' }}>Cost ${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · BP ${bp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 10 }}>
        <Btn disabled={!valid || blocked} onClick={() => {
          if (!valid || blocked) return
          onLogTrade({ id: uid(), ticker: ticker || '—', instrument: instrument || 'options', optType: isStock ? null : optType, strike: isStock ? null : (parseFloat(strike) || null), dte: isStock ? null : (parseInt(dte) || null), expiry: isStock ? null : expiry, setupType, entry: parseFloat(entry), stop: parseFloat(stop), target: parseFloat(target), contracts: parseInt(contracts) || 1, rr: calc.rr, dollarRisk: calc.dollarRisk, dollarReward: calc.dollarReward, totalCost: calc.totalCost, status: 'open', pnl: null, notes: '', date: new Date().toISOString(), tradeDate: localDateStr(), entryTime: '', exitTime: '' })
        }}>{blocked ? 'Trading Locked' : !valid ? (isStock ? 'Enter share prices above' : 'Enter premium prices above') : 'Log This Trade →'}</Btn>
        {schwabConnected && valid && !isStock && checklistPassed && !blocked && (
          <button onClick={() => setStageOpen(true)} style={{ background: SCHWAB_BLUE, color: '#fff', border: 'none', borderRadius: 4, padding: '12px 18px', fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', cursor: 'pointer' }}>
            Stage Order →
          </button>
        )}
      </div>

      {/* ── Stage Order modal ────────────────────────────────────────────── */}
      {stageOpen && (() => {
        const sym = occSymbol({ ticker, expiry, strike, optType })
        const limit = parseFloat(entry)
        const qty = parseInt(contracts) || 1
        const totalCost = limit * qty * 100
        function copyOcc() {
          if (navigator?.clipboard) navigator.clipboard.writeText(sym).catch(() => {})
        }
        function openSchwab() {
          window.open(SCHWAB_TRADE_URL, '_blank', 'noopener,noreferrer')
        }
        return (
          <div onClick={() => setStageOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#0a0d12', border: `1px solid ${SCHWAB_BLUE}44`, borderRadius: 6, maxWidth: 520, width: '100%', padding: '24px 26px', fontFamily: MONO }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: SCHWAB_BLUE, letterSpacing: '0.14em' }}>STAGE ORDER</div>
                <button onClick={() => setStageOpen(false)} style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer', letterSpacing: '0.1em' }}>CLOSE ✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <div><span style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Symbol</span><div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8e8', marginTop: 2 }}>{sym || '—'}</div></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 11 }}>
                  <div><div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Action</div><div style={{ color: optType === 'put' ? RED : LIME, fontWeight: 700 }}>BUY TO OPEN {(optType || '').toUpperCase()}</div></div>
                  <div><div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Quantity</div><div style={{ color: '#e8e8e8', fontWeight: 700 }}>{qty} contract{qty !== 1 ? 's' : ''}</div></div>
                  <div><div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Limit Price</div><div style={{ color: '#e8e8e8', fontWeight: 700 }}>${f2(limit)}</div></div>
                  <div><div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Total Cost</div><div style={{ color: '#aaa', fontWeight: 700 }}>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                  <div><div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Stop</div><div style={{ color: RED, fontWeight: 700 }}>${f2(parseFloat(stop))}</div></div>
                  <div><div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Target</div><div style={{ color: LIME, fontWeight: 700 }}>${f2(parseFloat(target))}</div></div>
                </div>
              </div>
              <div style={{ background: '#0d0a05', border: `1px solid ${YELLOW}33`, borderRadius: 4, padding: '10px 12px', fontSize: 10, color: '#c8a030', lineHeight: 1.6, marginBottom: 16 }}>
                ⚠ Trade Hub never auto-submits orders. Copy the symbol, open Schwab, and enter manually. You confirm in Schwab — always.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={copyOcc} style={{ flex: 1, minWidth: 140, background: '#1a1a1a', border: `1px solid ${BORDER}`, color: '#aaa', fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', padding: '11px', borderRadius: 4, cursor: 'pointer' }}>COPY OCC SYMBOL</button>
                <button onClick={openSchwab} style={{ flex: 2, minWidth: 200, background: SCHWAB_BLUE, color: '#fff', border: 'none', fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', padding: '11px', borderRadius: 4, cursor: 'pointer' }}>Open Schwab Trade →</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Checklist Tab ─────────────────────────────────────────────────────────────
export function ChecklistTab({ onPass, instrument, setupQuality, alignmentScore, schwabConnected, schwabDayTrades = 0, plannedDTE = 0 }) {
  const [checked, setChecked] = useState({})
  const isStock = instrument === 'stock'
  const sqItem = {
    id: 'c0',
    text: `Setup quality is ON LEVEL or APPROACHING — not BETWEEN LEVELS (currently: ${setupQuality || 'NO DATA'})`,
    required: true,
  }
  const alignItem = {
    id: 'ca',
    text: `1H structure confirms trade direction AND alignment score above 55 (currently: ${alignmentScore || 0}/100${alignmentScore >= 70 ? ' — ideal' : alignmentScore >= 55 ? ' — acceptable' : ' — too low, stand aside'})`,
    required: true,
  }
  const pdtItem = schwabConnected ? {
    id: 'cp',
    text: `PDT trades remaining (currently: ${3 - schwabDayTrades}/3${schwabDayTrades >= 3 ? ' — NO MORE DAY TRADES' : ''})`,
    required: true,
  } : null
  const isMultiDay = plannedDTE > 1
  let baseItems = isStock ? CL_ITEMS_STOCK : CL_ITEMS
  if (isMultiDay) {
    // Swap intraday-chop item for a stop-related multi-day equivalent
    baseItems = baseItems.map(it => it.id === 'c8'
      ? { ...it, text: 'Stop is set and will protect position through overnight risk' }
      : it)
  }
  const multiDayItems = isMultiDay ? [
    { id: 'md1', text: 'IV rank checked — not buying expensive premium', required: true },
    { id: 'md2', text: 'Thesis is valid for multi-day hold — not just today\'s price action', required: true },
    { id: 'md3', text: 'Stop placed at a technical level, not an arbitrary price', required: true },
    { id: 'md4', text: 'Position size accounts for multi-day / overnight gap risk', required: true },
  ] : []
  const items = [sqItem, alignItem, ...(pdtItem ? [pdtItem] : []), ...multiDayItems, ...baseItems]
  const req = items.filter(i => i.required), allReq = req.every(i => checked[i.id])
  const done = items.filter(i => checked[i.id]).length, pct = Math.round((done / items.length) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><SLabel>{isStock ? 'Stock Discipline Gate' : 'Options Discipline Gate'}</SLabel><Heading>Pre-Trade Checklist</Heading></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 32, fontWeight: 900, fontFamily: MONO, color: allReq ? LIME : YELLOW, letterSpacing: '-0.03em' }}>{pct}%</div><div style={{ fontSize: 9, color: '#333', fontFamily: MONO, textTransform: 'uppercase' }}>{done}/{items.length}</div></div>
      </div>
      <div style={{ background: allReq ? '#070e04' : '#100c04', border: `1px solid ${allReq ? '#162210' : '#231a08'}`, borderRadius: 4, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: allReq ? LIME : YELLOW, flexShrink: 0, boxShadow: `0 0 10px ${allReq ? LIME : YELLOW}` }} />
        <span style={{ fontFamily: MONO, fontSize: 12, color: allReq ? LIME : YELLOW, fontWeight: 700, letterSpacing: '0.06em' }}>{allReq ? 'CLEAR TO TRADE — All required rules confirmed.' : 'NOT CLEAR — Complete all required rules first.'}</span>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {items.map(item => (
          <div key={item.id} style={{ padding: '0 18px', background: checked[item.id] ? '#0b0e09' : 'transparent' }}>
            <CheckRow text={item.text} required={item.required} checked={!!checked[item.id]} onToggle={() => setChecked(c => ({ ...c, [item.id]: !c[item.id] }))} />
          </div>
        ))}
      </Card>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={() => setChecked({})}>Reset</Btn>
        <Btn disabled={!allReq} onClick={onPass}>{allReq ? 'Proceed to Calculator →' : 'Complete required rules first'}</Btn>
      </div>
    </div>
  )
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────
export function StatsTab({ trades: allTrades }) {
  const [eodNotes] = useLocalStorage('th-eod-notes', {})
  // Paper trades are written by the Bot coach when the writePaperTrades setting
  // is on. Default behavior here is to exclude them from performance metrics so
  // real-money stats stay clean. User can flip the toggle to include them.
  const [includePaper, setIncludePaper] = useLocalStorage('th-stats-include-paper', false)
  const paperCount = (allTrades || []).filter(t => t.paper).length
  const trades = includePaper ? allTrades : (allTrades || []).filter(t => !t.paper)
  const closed = trades.filter(t => t.status === 'win' || t.status === 'loss')
  const wins = trades.filter(t => t.status === 'win'), losses = trades.filter(t => t.status === 'loss')
  const winRate = closed.length ? (wins.length / closed.length) * 100 : null
  const totalPnl = trades.reduce((a, t) => a + (t.pnl || 0), 0)
  const avgWin = wins.length ? wins.reduce((a, t) => a + (t.pnl || 0), 0) / wins.length : null
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + (t.pnl || 0), 0) / losses.length) : null
  const avgRR = closed.length ? closed.reduce((a, t) => a + (t.rr || 0), 0) / closed.length : null
  const exp = winRate != null && avgWin != null && avgLoss != null ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss : null
  const calls = closed.filter(t => t.optType === 'call'), puts = closed.filter(t => t.optType === 'put')
  let cum = 0
  // Sort chronologically by tradeDate then entryTime, falling back to date.
  // Same comparator shape as Journal but ascending so the equity curve plots
  // oldest-to-newest left-to-right.
  const curve = trades.slice().sort((a, b) => {
    const da = a.tradeDate || a.date?.slice(0, 10) || ''
    const db = b.tradeDate || b.date?.slice(0, 10) || ''
    if (da !== db) return da.localeCompare(db)
    const ta = a.entryTime || ''
    const tb = b.entryTime || ''
    return ta.localeCompare(tb)
  }).filter(t => t.pnl != null).map(t => { cum += t.pnl; return cum })
  const cH = 90, cW = 520, maxV = Math.max(...curve, 0.01), minV = Math.min(...curve, -0.01), rng = maxV - minV
  const pts = curve.map((v, i) => `${curve.length === 1 ? cW / 2 : (i / (curve.length - 1)) * cW},${cH - ((v - minV) / rng) * cH}`)
  if (closed.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div><SLabel>Options Performance</SLabel><Heading>Stats</Heading></div>
          {paperCount > 0 && (
            <button
              onClick={() => setIncludePaper(v => !v)}
              title={includePaper ? 'Paper trades are included in these stats' : 'Paper trades are hidden from these stats'}
              style={{
                background: includePaper ? `${PURPLE}22` : 'transparent',
                color: includePaper ? PURPLE : '#666',
                border: `1px solid ${includePaper ? PURPLE : BORDER}`,
                borderRadius: 4,
                padding: '6px 12px',
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {includePaper ? `Paper on (${paperCount})` : `Paper off (${paperCount})`}
            </button>
          )}
        </div>
        <div style={{ padding: '40px 24px', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5 }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#2a2a2a', marginBottom: 8 }}>No closed trades yet.</div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#1e1e1e', lineHeight: 1.8 }}>
            Stats build automatically as you log trades in the Calculator tab. After 10+ trades you'll see win rate by session, equity curve, expectancy, and calls vs. puts breakdown.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><SLabel>Options Performance</SLabel><Heading>Stats</Heading></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Tile label="Total P&L" value={fmtD(totalPnl)} color={totalPnl >= 0 ? LIME : RED} />
        <Tile label="Win Rate" value={winRate != null ? f2(winRate) + '%' : '—'} sub={`${wins.length}W · ${losses.length}L`} color={winRate != null ? (winRate >= 50 ? LIME : RED) : '#555'} />
        <Tile label="Avg R:R (Actual)" value={avgRR != null ? '1:' + f2(avgRR) : '—'} color={rrColor(avgRR)} />
        <Tile label="Expectancy / Trade" value={exp != null ? fmtD(exp) : '—'} sub="true edge per trade" color={exp != null ? (exp >= 0 ? LIME : RED) : '#555'} />
        <Tile label="Avg Win" value={avgWin != null ? fmtD(avgWin) : '—'} color={LIME} />
        <Tile label="Avg Loss" value={avgLoss != null ? '-$' + f2(avgLoss) : '—'} color={RED} />
      </div>
      {(calls.length > 0 || puts.length > 0) && (
        <Card>
          <SLabel>Calls vs Puts</SLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[{ lbl: 'Calls', data: calls, color: LIME }, { lbl: 'Puts', data: puts, color: RED }].map(({ lbl, data, color }) => {
              const w = data.filter(t => t.status === 'win'), pnl = data.reduce((a, t) => a + (t.pnl || 0), 0)
              return (
                <div key={lbl} style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color, marginBottom: 8 }}>{lbl} ({data.length})</div>
                  <div style={{ fontSize: 11, fontFamily: MONO, color: '#555' }}>{data.length ? Math.round((w.length / data.length) * 100) + '% win rate' : 'No closed trades'}</div>
                  <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: pnl >= 0 ? LIME : RED, marginTop: 4 }}>{fmtD(pnl)}</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
      {curve.length > 1 && (
        <Card>
          <SLabel>Equity Curve</SLabel>
          <svg width="100%" viewBox={`0 0 ${cW} ${cH + 6}`} style={{ overflow: 'visible' }}>
            <defs><linearGradient id="ecfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={totalPnl >= 0 ? LIME : RED} stopOpacity="0.12" /><stop offset="100%" stopColor={totalPnl >= 0 ? LIME : RED} stopOpacity="0" /></linearGradient></defs>
            <line x1="0" y1={cH - ((0 - minV) / rng) * cH} x2={cW} y2={cH - ((0 - minV) / rng) * cH} stroke="#1a1a1a" strokeWidth="1" strokeDasharray="4 3" />
            <polygon points={`0,${cH} ${pts.join(' ')} ${cW},${cH}`} fill="url(#ecfill)" />
            <polyline points={pts.join(' ')} fill="none" stroke={totalPnl >= 0 ? LIME : RED} strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#222', fontFamily: MONO, marginTop: 6 }}><span>Trade #1</span><span>Trade #{curve.length}</span></div>
        </Card>
      )}
      {closed.length >= 3 && exp != null && (
        <div style={{ background: exp > 0 ? '#070d04' : '#100505', border: `1px solid ${exp > 0 ? '#132010' : '#200808'}`, borderRadius: 4, padding: '16px 20px' }}>
          <SLabel>Edge Assessment</SLabel>
          <div style={{ fontSize: 12, color: '#666', fontFamily: MONO, lineHeight: 1.9 }}>
            {exp > 0 ? `Positive expectancy of ${fmtD(exp)} per trade. Your system has a real edge.` : `Negative expectancy. At your ${f2(winRate)}% win rate you need at least 1:${f2((100 - winRate) / winRate)} R:R to break even.`}
          </div>
        </div>
      )}

      {(() => {
        const gradeColor = g => g === 'A' ? LIME : g === 'B' ? YELLOW : g === 'C' ? ORANGE : g === 'D' ? RED : '#222'
        // Build the last 30 trading days (skip Sat/Sun)
        const days = []
        const d = new Date()
        while (days.length < 30) {
          if (d.getDay() !== 0 && d.getDay() !== 6) {
            const yyyy = d.getFullYear()
            const mm = String(d.getMonth() + 1).padStart(2, '0')
            const dd = String(d.getDate()).padStart(2, '0')
            days.unshift(`${yyyy}-${mm}-${dd}`)
          }
          d.setDate(d.getDate() - 1)
        }
        // P&L + trade count per day from trades
        const dayTrades = {}
        for (const t of trades) {
          const k = t.tradeDate || t.date?.slice(0, 10)
          if (!k) continue
          if (!dayTrades[k]) dayTrades[k] = { pnl: 0, count: 0 }
          dayTrades[k].pnl += (t.pnl || 0)
          if (t.status !== 'open') dayTrades[k].count++
        }
        const gradedDays = days.filter(d => eodNotes[d]?.grade)
        const counts = { A: 0, B: 0, C: 0, D: 0 }
        for (const d of gradedDays) counts[eodNotes[d].grade]++
        const avgScore = gradedDays.length ? gradedDays.reduce((s, d) => s + ({ A: 4, B: 3, C: 2, D: 1 }[eodNotes[d].grade] || 0), 0) / gradedDays.length : null
        const avgGrade = avgScore ? (avgScore >= 3.5 ? 'A' : avgScore >= 2.5 ? 'B' : avgScore >= 1.5 ? 'C' : 'D') : null
        return (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <SLabel style={{ marginBottom: 0 }}>Discipline Grades — last 30 trading days</SLabel>
              {avgGrade && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#444', fontFamily: MONO }}>Avg</span>
                  <span style={{ fontSize: 16, fontWeight: 900, fontFamily: MONO, color: gradeColor(avgGrade) }}>{avgGrade}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 4 }}>
              {days.map(d => {
                const grade = eodNotes[d]?.grade
                const dt = dayTrades[d]
                const c = gradeColor(grade)
                const pnlStr = dt?.pnl ? fmtD(dt.pnl) : 'no trade'
                const tradeStr = dt?.count ? `${dt.count} trade${dt.count !== 1 ? 's' : ''}` : ''
                const title = `${d} · grade ${grade || '—'} · ${pnlStr}${tradeStr ? ' · ' + tradeStr : ''}`
                return (
                  <div key={d} title={title} style={{
                    aspectRatio: '1 / 1', minHeight: 22, borderRadius: 3,
                    background: grade ? c + '33' : '#0d0d0d',
                    border: `1px solid ${grade ? c + '55' : '#1a1a1a'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontFamily: MONO, fontWeight: 900,
                    color: grade ? c : '#222', cursor: 'default',
                  }}>
                    {grade || '·'}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 9, fontFamily: MONO, color: '#333', flexWrap: 'wrap' }}>
              {[['A', LIME], ['B', YELLOW], ['C', ORANGE], ['D', RED]].map(([g, c]) => (
                <span key={g} style={{ color: c }}>{g} — {counts[g]} day{counts[g] !== 1 ? 's' : ''}</span>
              ))}
              <span style={{ marginLeft: 'auto' }}>process grade, not P&L · hover for details</span>
            </div>
          </Card>
        )
      })()}
    </div>
  )
}

// ── Watchlist / Nightly Scanner Tab ──────────────────────────────────────────

const DEFAULT_TICKERS = ['QQQ', 'SPY', 'NVDA', 'PLTR', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'AMD', 'SMCI', 'MSTR', 'TQQQ']

function calcSetupScore(pd, avgVol) {
  if (!pd || pd.high <= pd.low) return null
  const { high, low, close, volume } = pd
  const range = high - low

  // Range (45%) — primary filter. Under 0.5% = 0, 3% = 100.
  const rangePct = range / close * 100
  const rangeScore = rangePct < 0.5
    ? 0
    : Math.min(100, (rangePct - 0.5) / 2.5 * 100)

  // Structure (40%) — trending vs choppy. Hard 0 if close is in the middle 30%.
  const closePos = (close - low) / range
  const extremity = Math.abs(closePos - 0.5)
  const structureScore = extremity < 0.15 ? 0 : Math.min(100, extremity * 200)

  // Volume (15%) — bonus, works without avgVol (neutral 40 if no history)
  const volRatio = avgVol ? volume / avgVol : 1
  const volScore = avgVol
    ? Math.min(100, Math.max(0, (volRatio - 0.7) / 1.3 * 100))
    : 40

  return {
    total: Math.round(rangeScore * 0.45 + structureScore * 0.40 + volScore * 0.15),
    rangeScore: Math.round(rangeScore),
    structureScore: Math.round(structureScore),
    volScore: Math.round(volScore),
    rangePct,
    volRatio,
    closePos,
  }
}

function buildObservation(pd, score) {
  if (!pd || !score) return '—'
  const { closePos, volRatio, rangePct, structureScore, total } = score

  const rangeStr = rangePct >= 2.5 ? `Strong expansion (${f2(rangePct)}% range)`
    : rangePct >= 1.5 ? `Decent range (${f2(rangePct)}%)`
    : `Tight range (${f2(rangePct)}%)`

  const closeStr = closePos > 0.80 ? 'closed at HOD'
    : closePos > 0.65 ? 'closed near HOD'
    : closePos < 0.20 ? 'closed at LOD'
    : closePos < 0.35 ? 'closed near LOD'
    : 'mid-range close'

  const volStr = volRatio >= 2.5 ? `${volRatio.toFixed(1)}x avg vol`
    : volRatio >= 1.5 ? `${volRatio.toFixed(1)}x avg vol`
    : volRatio < 0.8 ? `light vol (${volRatio.toFixed(1)}x avg)`
    : 'avg vol'

  if (structureScore === 0) {
    return `${rangeStr}, ${closeStr}, ${volStr} — choppy day, low conviction. Consider passing.`
  }
  const verdict = total >= 75 ? 'strong ORB candidate tomorrow'
    : total >= 50 ? 'watch for follow-through'
    : 'low-quality setup'

  return `${rangeStr}, ${closeStr}, ${volStr} — ${verdict}`
}

function DataChip({ label, value, color, tip, sub }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: '#333', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, display: 'flex', alignItems: 'center' }}>{label}{tip && <Tip tip={tip} />}</div>
      <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: color || '#888' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function fmtVol(v) {
  if (!v) return '—'
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return String(v)
}

function scoreSnapshot(snap) {
  const pd = snap.prevDay
  if (!pd || !pd.h || !pd.l || pd.h <= pd.l) return null
  const range = pd.h - pd.l
  const rangePct = range / pd.c * 100
  const closePos = (pd.c - pd.l) / range
  const extremity = Math.abs(closePos - 0.5)
  const rangeScore = rangePct < 0.5 ? 0 : Math.min(100, (rangePct - 0.5) / 2.5 * 100)
  const structureScore = extremity < 0.15 ? 0 : Math.min(100, extremity * 200)
  const minsElapsed = Math.max(1, getETMins() - 570)
  const dayVol = snap.day?.v || 0
  const volRatio = pd.v > 0 && minsElapsed > 5 && minsElapsed < 500
    ? dayVol / (pd.v * minsElapsed / 390)
    : 1
  const volScore = Math.min(100, Math.max(0, (volRatio - 0.7) / 1.3 * 100))
  return {
    total: Math.round(rangeScore * 0.45 + structureScore * 0.40 + volScore * 0.15),
    rangeScore: Math.round(rangeScore),
    structureScore: Math.round(structureScore),
    volScore: Math.round(volScore),
    rangePct,
    closePos,
    volRatio,
  }
}

// Layer 1 fetch timeout. The Polygon gainers/losers calls normally return in
// under a second; 10s is generous and avoids leaving the UI in SCANNING for a
// hung socket.
const LAYER1_FETCH_TIMEOUT_MS = 10000

export function WatchlistTab({ apiKey, onSendToPrep, savedPreps, onLoadSavedPrep }) {
  const [tickers, setTickers] = useLocalStorage('th-scanner-tickers', DEFAULT_TICKERS)
  // Layer 1 — auto universe
  const [autoResults, setAutoResults] = useState([])
  const [autoScanning, setAutoScanning] = useState(false)
  const [autoScanError, setAutoScanError] = useState(null)
  const [autoScanTime, setAutoScanTime] = useState(() => {
    try { const t = localStorage.getItem('th-auto-scan-time'); return t ? parseInt(t) : null } catch { return null }
  })
  // Layer 2 — manual watchlist
  const [results, setResults] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanErrors, setScanErrors] = useState(0)
  const [scanTime, setScanTime] = useState(() => {
    try { const t = localStorage.getItem('th-scanner-time'); return t ? parseInt(t) : null } catch { return null }
  })
  const [addInput, setAddInput] = useState('')
  const initialized = useRef(false)

  // ── Layer 1: auto universe scan ───────────────────────────────────────────
  // Single attempt with AbortController-backed timeout. On any failure (timeout,
  // network, 429), retries once with a fresh controller before surfacing the
  // error. Loading state always clears in finally so the UI cannot get stuck
  // in SCANNING.
  async function runAutoScan() {
    if (!apiKey || autoScanning) return
    setAutoScanning(true)
    setAutoScanError(null)
    async function attempt() {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), LAYER1_FETCH_TIMEOUT_MS)
      try {
        const snaps = await getTopMovers({ signal: controller.signal })
        if (controller.signal.aborted) throw new Error('timeout')
        return snaps
      } finally {
        clearTimeout(timer)
      }
    }
    try {
      let snaps
      try {
        snaps = await attempt()
      } catch {
        snaps = await attempt()
      }
      const minsElapsed = Math.max(1, getETMins() - 570)
      const filtered = snaps
        .filter(snap => {
          const pd = snap.prevDay
          if (!pd || !pd.c || pd.h <= pd.l) return false
          if (pd.c < 10) return false                          // price > $10
          if ((pd.h - pd.l) / pd.c < 0.02) return false       // range > 2%
          if (pd.v < 1_000_000) return false                   // avg vol > 1M
          if (Math.abs(snap.todaysChangePerc || 0) > 35) return false  // no binary events
          return true
        })
        .map(snap => {
          const pd = snap.prevDay
          const dayVol = snap.day?.v || 0
          const rvol = pd.v > 0 && minsElapsed > 5 && minsElapsed < 500
            ? dayVol / (pd.v * minsElapsed / 390)
            : null
          const score = scoreSnapshot(snap)
          const pdAdapted = { high: pd.h, low: pd.l, close: pd.c, volume: pd.v, open: pd.o }
          return { ticker: snap.ticker, price: pd.c, change: snap.todaysChangePerc, prevDay: pdAdapted, dayVol, rvol, score }
        })
        .filter(r => r.score !== null)
        .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
        .slice(0, 10)
      setAutoResults(filtered)
      const ts = Date.now()
      setAutoScanTime(ts)
      try { localStorage.setItem('th-auto-scan-time', String(ts)) } catch {}
    } catch (err) {
      setAutoScanError(err?.message || 'fetch failed')
    } finally {
      setAutoScanning(false)
    }
  }

  // ── Layer 2: manual watchlist scan ────────────────────────────────────────
  async function runScan() {
    if (!apiKey || scanning) return
    setScanning(true)
    setScanErrors(0)
    const settled = await Promise.allSettled(
      tickers.map(async ticker => {
        let pd = null, hist = [], fetchError = null
        try { pd = await getPrevDay(ticker) } catch (e) { fetchError = e.message }
        try { hist = await getHistoricalBars(ticker, 21) } catch {}
        const histBars = Array.isArray(hist) && hist.length > 1 ? hist.slice(0, -1) : (hist || [])
        const avgVol = histBars.length > 0 ? histBars.reduce((s, b) => s + b.v, 0) / histBars.length : null
        const score = pd ? calcSetupScore(pd, avgVol) : null
        return { ticker, pd, avgVol, score, fetchError }
      })
    )
    const data = settled
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .concat(settled.filter(r => r.status === 'rejected').map(r => ({ ticker: '?', pd: null, score: null, fetchError: r.reason?.message || 'Request failed' })))
      .sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1))
    setScanErrors(data.filter(r => !r.pd).length)
    setResults(data)
    const ts = Date.now()
    setScanTime(ts)
    try { localStorage.setItem('th-scanner-time', String(ts)) } catch {}
    setScanning(false)
  }

  async function scanAll() {
    await Promise.all([runAutoScan(), runScan()])
  }

  // Auto-init on tab open
  useEffect(() => {
    if (initialized.current || !apiKey) return
    initialized.current = true
    const stale = 30 * 60 * 1000
    const now = Date.now()
    if (!autoScanTime || now - autoScanTime > stale) runAutoScan()
    if (!scanTime || now - scanTime > stale) runScan()
  }, [apiKey]) // eslint-disable-line

  // Auto-refresh Layer 1 every 30 min
  useEffect(() => {
    if (!apiKey) return
    const iv = setInterval(runAutoScan, 30 * 60 * 1000)
    return () => clearInterval(iv)
  }, [apiKey]) // eslint-disable-line

  function addTicker() {
    const t = addInput.trim().toUpperCase()
    if (!t || tickers.includes(t)) { setAddInput(''); return }
    setTickers([...tickers, t])
    setAddInput('')
  }

  function removeTicker(t) {
    setTickers(prev => prev.filter(x => x !== t))
    setResults(prev => prev.filter(r => r.ticker !== t))
  }

  const isRefreshing = autoScanning || scanning
  const autoTickers = new Set(autoResults.map(r => r.ticker))

  // Helper to format time-since label
  function ageLbl(ts) {
    if (!ts) return null
    const m = Math.round((Date.now() - ts) / 60000)
    return m < 1 ? 'just now' : m === 1 ? '1 min ago' : `${m} min ago`
  }

  // Shared skeleton row for scanning states
  function SkeletonRow({ label }) {
    return (
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 10, fontFamily: MONO, color: '#1e1e1e', width: 18 }}>—</div>
        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: MONO, color: '#1e1e1e', minWidth: 60 }}>{label}</div>
        <div style={{ flex: 1, height: 8, background: '#161616', borderRadius: 3 }} />
        <div style={{ width: 40, height: 22, background: '#161616', borderRadius: 3 }} />
      </div>
    )
  }

  // Shared result row (used for both layers)
  function ResultRow({ ticker, pd, score, fetchError, volRatioOverride, dayVol, rank, isTop3 }) {
    if (!pd) {
      return (
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 16, opacity: 0.4 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#333', width: 18 }}>—</div>
          <div style={{ fontSize: 15, fontWeight: 900, fontFamily: MONO, color: '#333', minWidth: 60 }}>{ticker}</div>
          <span style={{ fontSize: 10, fontFamily: MONO, color: '#333', flex: 1 }}>
            {fetchError ? `API error: ${fetchError}` : 'No data — ticker may be invalid or API plan restriction'}
          </span>
        </div>
      )
    }
    const range = pd.high - pd.low
    const rangePct = pd.close > 0 ? range / pd.close * 100 : 0
    const movePct = pd.open > 0 ? (pd.close - pd.open) / pd.open * 100 : 0
    const total = score?.total ?? 0
    const volRatio = volRatioOverride != null ? volRatioOverride : (score?.volRatio ?? 1)
    const closePos = score?.closePos ?? 0.5
    const scoreColor = total >= 70 ? LIME : total >= 45 ? YELLOW : RED
    const closeLbl = closePos > 0.80 ? 'Near HOD' : closePos < 0.20 ? 'Near LOD' : 'Mid Range'
    const closeLblColor = (closePos > 0.80 || closePos < 0.20) ? '#aaa' : '#444'
    const volColor = volRatio >= 1.5 ? LIME : volRatio >= 1.0 ? '#777' : '#444'
    const obs = buildObservation(pd, score)
    const unusualVol = volRatio >= 2.0
    const absVol = dayVol || pd.volume
    return (
      <div style={{ background: PANEL, border: `1px solid ${isTop3 ? LIME + '44' : BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#222', width: 18, flexShrink: 0, textAlign: 'right' }}>#{rank}</div>
          <div style={{ flexShrink: 0, minWidth: 60 }}>
            <div style={{ fontSize: 16, fontWeight: 900, fontFamily: MONO, color: total >= 70 ? LIME : total >= 45 ? YELLOW : '#e8e8e8' }}>{ticker}</div>
            {unusualVol && <div style={{ fontSize: 8, color: YELLOW, fontFamily: MONO, letterSpacing: '0.08em' }}>⚡ UNUSUAL VOL</div>}
          </div>
          <div style={{ flex: 1, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <DataChip label="Prev Range" value={`$${f2(range)} (${f2(rangePct)}%)`} />
            <DataChip label="% Move" value={`${movePct > 0 ? '+' : ''}${f2(movePct)}%`} color={movePct > 0.3 ? LIME : movePct < -0.3 ? RED : '#888'} />
            <DataChip
              label="RVOL"
              value={`${volRatio.toFixed(1)}x avg`}
              sub={absVol ? fmtVol(absVol) : undefined}
              color={volColor}
              tip="Relative Volume — today's volume vs. the projected daily average. Above 1.5x means institutional conviction. Below 0.8x means low conviction — don't chase breakouts."
            />
            <DataChip label="Structure" value={closeLbl} color={closeLblColor} />
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 60 }}>
            <div style={{ fontSize: 8, color: '#333', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Score</div>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: scoreColor, lineHeight: 1 }}>{total}</div>
            <div style={{ width: 60, height: 3, background: '#1a1a1a', borderRadius: 2, marginTop: 5 }}>
              <div style={{ height: '100%', width: `${total}%`, background: scoreColor, borderRadius: 2 }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '9px 18px', background: '#0a0a0a', borderTop: '1px solid #111' }}>
          <span style={{ fontSize: 10, fontFamily: MONO, color: '#444', flex: 1 }}>{obs}</span>
          {savedPreps?.[ticker]
            ? <Btn small variant="lime" onClick={() => onLoadSavedPrep(savedPreps[ticker])}>Load Saved Prep</Btn>
            : <Btn small variant="blue" onClick={() => onSendToPrep({ ticker, priorHigh: String(f2(pd.high)), priorLow: String(f2(pd.low)) })}>→ Prep</Btn>
          }
        </div>
      </div>
    )
  }

  // Layer 2 results filtered to exclude tickers already in auto top setups
  const myResults = results.filter(r => !autoTickers.has(r.ticker))
  const myScored = myResults.filter(r => r.pd).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SLabel>Two-Layer Setup Scanner</SLabel>
          <Heading>Watchlist</Heading>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!apiKey && <span style={{ fontSize: 9, fontFamily: MONO, color: RED }}>No API key — add in Command</span>}
          <Btn small onClick={scanAll} disabled={!apiKey || isRefreshing}>
            {isRefreshing ? 'Scanning...' : 'Scan All'}
          </Btn>
        </div>
      </div>

      {/* ── LAYER 1: Today's Top Setups ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: MONO, color: '#555', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>Layer 1 — Auto Universe</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: '#e8e8e8', letterSpacing: '-0.01em' }}>Today's Top Setups</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {ageLbl(autoScanTime) && autoResults.length > 0 && <div style={{ fontSize: 9, fontFamily: MONO, color: '#2a2a2a' }}>Updated {ageLbl(autoScanTime)}</div>}
            <div style={{ fontSize: 8, fontFamily: MONO, color: '#1a1a1a', marginTop: 2 }}>Auto-refreshes every 30 min</div>
          </div>
        </div>

        {autoScanning && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Scanning gainers + losers universe...</div>
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} label="···" />)}
          </div>
        )}

        {!autoScanning && autoScanError && autoResults.length === 0 && (
          <div style={{ background: '#1a0d05', border: '1px solid #3a1a08', borderRadius: 5, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontFamily: MONO, color: RED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Scan failed</div>
              <div style={{ fontSize: 11, fontFamily: MONO, color: '#888' }}>{autoScanError}. Hit Retry to try again.</div>
            </div>
            <Btn small variant="ghost" onClick={runAutoScan}>Retry</Btn>
          </div>
        )}

        {!autoScanning && autoResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, letterSpacing: '0.06em' }}>
              {autoResults.length} setups ranked from gainers + losers universe · price &gt;$10 · range &gt;2% · vol &gt;1M
            </div>
            {autoResults.map((r, idx) => (
              <ResultRow
                key={r.ticker}
                ticker={r.ticker}
                pd={r.prevDay}
                score={r.score}
                fetchError={null}
                volRatioOverride={r.rvol}
                dayVol={r.dayVol}
                rank={idx + 1}
                isTop3={idx < 3}
              />
            ))}
          </div>
        )}

        {!autoScanning && !autoScanError && autoResults.length === 0 && (
          <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '20px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#2a2a2a' }}>
              {apiKey ? 'No setups found in today\'s universe. Try scanning again after market open.' : 'Add your Massive API key in Command to enable auto-scanning.'}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid #111` }} />

      {/* ── LAYER 2: My Watchlist ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: MONO, color: '#555', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>Layer 2 — Manual</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: '#e8e8e8', letterSpacing: '-0.01em' }}>My Watchlist</div>
          </div>
          {ageLbl(scanTime) && <div style={{ fontSize: 9, fontFamily: MONO, color: '#2a2a2a' }}>Updated {ageLbl(scanTime)}</div>}
        </div>

        {/* Ticker pill management */}
        <Card>
          <SLabel>Tickers</SLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {tickers.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, background: autoTickers.has(t) ? '#0a1208' : '#141414', border: `1px solid ${autoTickers.has(t) ? LIME + '33' : BORDER}`, borderRadius: 3, padding: '4px 10px' }}>
                <span style={{ fontSize: 11, fontFamily: MONO, color: autoTickers.has(t) ? '#5a7a5a' : '#888' }}>{t}</span>
                {autoTickers.has(t) && <span style={{ fontSize: 7, fontFamily: MONO, color: '#3a5a3a' }}>↑top</span>}
                <span onClick={() => removeTicker(t)} style={{ fontSize: 9, color: '#3a3a3a', cursor: 'pointer', lineHeight: 1 }}>✕</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={addInput}
              onInput={e => setAddInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addTicker()}
              placeholder="Add ticker..."
              style={{ background: '#161616', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#e8e8e8', fontFamily: MONO, fontSize: 12, padding: '7px 12px', outline: 'none', width: 130 }}
            />
            <Btn small variant="ghost" onClick={addTicker} disabled={!addInput.trim()}>Add</Btn>
          </div>
        </Card>

        {/* Scanning skeleton */}
        {scanning && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Scanning {tickers.length} tickers...</div>
            {tickers.filter(t => !autoTickers.has(t)).map(t => <SkeletonRow key={t} label={t} />)}
          </div>
        )}

        {/* Layer 2 results — deduplicated */}
        {!scanning && myResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {autoTickers.size > 0 && (
              <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, letterSpacing: '0.06em' }}>
                {autoResults.filter(r => tickers.includes(r.ticker)).length > 0
                  ? `${autoResults.filter(r => tickers.includes(r.ticker)).length} watchlist ticker${autoResults.filter(r => tickers.includes(r.ticker)).length > 1 ? 's' : ''} already shown in Top Setups above`
                  : `${myScored} of ${myResults.length} tickers scored`
                }
              </div>
            )}
            {scanErrors > 0 && <div style={{ fontSize: 9, color: '#4a3a2a', fontFamily: MONO }}>⚠ {scanErrors} ticker{scanErrors > 1 ? 's' : ''} returned no data</div>}
            {myResults.map(({ ticker, pd, score, fetchError, avgVol }, idx) => (
              <ResultRow
                key={ticker + idx}
                ticker={ticker}
                pd={pd}
                score={score}
                fetchError={fetchError}
                volRatioOverride={null}
                dayVol={null}
                rank={myResults.slice(0, idx).filter(r => r.pd).length + 1}
                isTop3={myResults.slice(0, idx).filter(r => r.pd).length < 3}
              />
            ))}
          </div>
        )}

        {!scanning && myResults.length === 0 && results.length > 0 && autoTickers.size > 0 && (
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#2a2a2a', padding: '8px 0' }}>
            All watchlist tickers are already shown in Today's Top Setups above.
          </div>
        )}

        {!scanning && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#1e1e1e', fontFamily: MONO, fontSize: 11 }}>
            {apiKey ? "Hit 'Scan All' to score your watchlist." : 'Add your Massive API key in Command to enable scanning.'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Prep Tab ──────────────────────────────────────────────────────────────────
const ROUTINE = [
  { time: '7:30 CT', label: 'Review your Prep notes and AI brief. Know every level before the chart opens. No surprises.' },
  { time: '8:00 CT', label: 'Trade Hub → Levels tab. Verify PDH/PDL/PDC are loaded. Check pivot levels vs prior day structure.' },
  { time: '8:10 CT', label: 'TradingView: pull ticker on 5-min chart. Draw your key levels. Match them to the Level Map.' },
  { time: '8:20 CT', label: 'IV tab: compare current IV to your Prep note. If IV spiked overnight, reduce size or stand aside.' },
  { time: '8:25 CT', label: 'News check: earnings, Fed speakers, CPI, FOMC today? If yes, stand aside or cut size in half.' },
  { time: '8:30 CT', label: 'Market opens. HANDS OFF. Watch price discover levels. Do not trade the first candle — ever.' },
  { time: '8:30–8:45 CT', label: 'OR forming. Watch price action and volume. Mark OR high and low as they develop in real time.' },
  { time: '8:45 CT', label: 'OR complete. Enter ORH/ORL in ORB tab. Is bias confirmed? Is a level tap or breakout developing?' },
  { time: '8:45–10:30 CT', label: 'Your window. Wait for a level TOUCH + confirmation candle close. Then Calculator tab before entering.' },
  { time: 'Before entry', label: 'Calculator: entry/stop/target = OPTION PREMIUM — not QQQ. Confirm 2:1 R:R. One contract if unsure.' },
  { time: '10:30 CT', label: 'Chop starts. No new entries. Trailing winner? Decide now: trail stop or close. Do not hold through chop.' },
]

// Delay before auto-firing Load Market Data after an external trigger (e.g.
// Layer 2 → Prep). Gives useLiveData time to refetch for a new ticker before
// loadMarketData reads from liveData. Typical Massive refetch is <800ms; this
// adds slack for slower connections without making the UX feel sluggish.
const PREP_AUTOLOAD_DELAY_MS = 1500

export function PrepTab({ prep, onPrepChange, onSendToORB, settings, liveData, anthropicKey, savedPreps, onSavedPrepsChange, levelMap, mtfAlignment, onVolumeThresholdsChange, autoLoadTrigger }) {
  const [rc, setRc] = useState({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [priceWarning, setPriceWarning] = useState('')
  const [dataLoaded, setDataLoaded] = useState(false)
  const [missingFields, setMissingFields] = useState({})
  const [justSaved, setJustSaved] = useState(false)

  const dc = ROUTINE.filter((_, i) => rc[i]).length
  const upd = (k, v) => onPrepChange({ ...prep, [k]: v })

  // Changing the primary ticker invalidates every level/strike/IV value, all
  // of which are ticker-specific. Clear them in the same update so the form
  // can never display the prior ticker's data attached to a new ticker.
  function updateTicker(v) {
    const next = (v || '').toUpperCase()
    const prev = (prep.ticker || '').toUpperCase()
    if (next === prev) {
      onPrepChange({ ...prep, ticker: next })
      return
    }
    onPrepChange({ ...prep, ticker: next, orbHigh: '', orbLow: '', sessionOpen: '', sessionClose: '', keyLevel: '', plannedStrike: '', ivNote: '', gamePlan: '', avoidNotes: '', marketEvents: '' })
    setMissingFields({})
  }

  const canSave = !!(prep.ticker && prep.orbHigh && prep.orbLow && prep.gamePlan)
  const hasSaved = savedPreps && Object.keys(savedPreps).length > 0
  const isAlreadySaved = !!(savedPreps && prep.ticker && savedPreps[prep.ticker])

  function savePrep() {
    if (!canSave) return
    const { dayReview, ...prepToSave } = prep
    onSavedPrepsChange({ ...savedPreps, [prep.ticker]: { ...prepToSave, dateSaved: new Date().toISOString() } })
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2500)
  }

  function loadSavedPrep(saved) {
    const { dateSaved, ...data } = saved
    onPrepChange({ ...prep, ...data })
  }

  function deleteSavedPrep(ticker) {
    const next = { ...savedPreps }
    delete next[ticker]
    onSavedPrepsChange(next)
  }

  const tickerMatchesData = (liveData?.dataTicker || '').toUpperCase() === (prep.ticker || '').toUpperCase()
  const hasLiveData = tickerMatchesData && !!(liveData?.prevDay?.high || liveData?.pivots?.pp)
  const hasClaudeKey = !!anthropicKey

  async function loadMarketData() {
    // eslint-disable-next-line no-console
    console.log('[Load Market Data] clicked')
    const { pivots, price, dataTicker } = liveData || {}
    setLoadError('')

    const want = (prep.ticker || '').toUpperCase()
    const have = (dataTicker || '').toUpperCase()
    // eslint-disable-next-line no-console
    console.log('[Load Market Data] ticker:', want, '| liveData dataTicker:', have || '(none)')

    if (!want) {
      const msg = 'No ticker entered. Type a ticker into Primary Ticker, then hit Load Market Data.'
      // eslint-disable-next-line no-console
      console.warn('[Load Market Data] aborting:', msg)
      setLoadError(msg)
      setDataLoaded(false)
      return
    }

    // Note: pivots and live price come from the useLiveData hook which is
    // gated by its own ticker prop. If that hook hasn't finished loading
    // context for `want` yet, dataTicker will not equal want and we cannot
    // trust pivots / price for this ticker. We DON'T block the whole load on
    // that, we just skip the pivots-derived fields and tell the user. The
    // session fields (high/low/open/close) come from a separate, request-
    // scoped getPriorSession call below that is always for `want`.
    const liveContextReady = !!have && have === want
    if (!liveContextReady) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Load Market Data] live context not yet bound to want=' + want
        + ' (have=' + (have || '(none)') + '). Will populate session fields only,'
        + ' key level and strike depend on pivots/price and stay empty for now.',
      )
    }

    // Pull the most-recently-completed regular session from the server. After
    // 16:15 ET this is today's bar; before that it is the prior trading day.
    // Anchored to America/New_York inside mostRecentSessionDate, so the
    // boundary holds regardless of where the user is.
    let session = null
    try {
      // eslint-disable-next-line no-console
      console.log('[Load Market Data] calling getPriorSession(' + want + ') -> /api/polygon/proxy')
      session = await getPriorSession(want)
      // eslint-disable-next-line no-console
      console.log('[Load Market Data] session response:', session)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Load Market Data] getPriorSession threw:', err)
      setLoadError(
        `Could not reach the market data API for ${want}: ${err?.message || 'unknown error'}. ` +
        `If POLYGON_API_KEY is missing in Vercel env, set it and redeploy. ` +
        `Fields are editable: enter levels manually to continue.`,
      )
      setDataLoaded(false)
      return
    }

    if (!session) {
      // eslint-disable-next-line no-console
      console.warn('[Load Market Data] getPriorSession returned null (missing bar or failed consistency guard)')
      setLoadError(
        `Could not load the most recent session for ${want}. ` +
        `The daily bar is missing or inconsistent (low must bound open and close). ` +
        `Fields are editable: enter levels manually to continue.`,
      )
      setDataLoaded(false)
      return
    }

    // Secondary backstop: reject a session range wildly off the live price
    // (bad/stale/halted-day bar). Only check if live price is for the right
    // ticker; otherwise skip the plausibility check.
    if (liveContextReady && price != null
      && !prevDayPlausible({ high: session.high, low: session.low }, price)) {
      const msg =
        `Live data looks wrong for ${want}: ` +
        `session range $${f2(session.low)} to $${f2(session.high)} vs live $${f2(price)}. ` +
        `Levels NOT loaded. Refresh data or enter levels manually before trading.`
      // eslint-disable-next-line no-console
      console.warn('[Load Market Data] plausibility check failed:', msg)
      setLoadError(msg)
      setDataLoaded(false)
      return
    }

    // Build the state update. Session fields always populate from the
    // server-returned bar for `want`. Pivots/strike only populate when the
    // useLiveData hook has bound the live context to this ticker.
    const next = {
      orbHigh: session.high != null ? f2(session.high) : '',
      orbLow: session.low != null ? f2(session.low) : '',
      sessionOpen: session.open != null ? f2(session.open) : '',
      sessionClose: session.close != null ? f2(session.close) : '',
      keyLevel: liveContextReady && pivots?.pp != null ? f2(pivots.pp) : '',
      plannedStrike: liveContextReady && price != null ? String(Math.round(price)) : '',
    }
    // eslint-disable-next-line no-console
    console.log('[Load Market Data] state update payload:', next)
    onPrepChange({ ...prep, ...next })
    setMissingFields({
      orbHigh: !next.orbHigh,
      orbLow: !next.orbLow,
      sessionOpen: !next.sessionOpen,
      sessionClose: !next.sessionClose,
      keyLevel: !next.keyLevel,
      plannedStrike: !next.plannedStrike,
    })
    if (!liveContextReady) {
      // Soft warning, not a hard failure: the session fields ARE loaded.
      setLoadError(
        `Session levels loaded. Key Level and Strike Plan are still loading ` +
        `for ${want} (the live data feed is catching up). Hit Load Market Data ` +
        `again in a moment to fill those two.`,
      )
    }
    setDataLoaded(true)
    // eslint-disable-next-line no-console
    console.log('[Load Market Data] state updated, success path complete')
    setTimeout(() => setDataLoaded(false), 4000)
  }

  // External callers (Layer 2 → Prep, etc.) bump autoLoadTrigger to request an
  // auto-fire of Load Market Data after the parent has updated prep.ticker.
  // We keep a ref to the latest loadMarketData so the deferred call always
  // reads the current prep + liveData, even if several renders happened during
  // the delay window.
  const loadMarketDataRef = useRef(loadMarketData)
  useEffect(() => { loadMarketDataRef.current = loadMarketData })
  useEffect(() => {
    if (!autoLoadTrigger) return
    const timer = setTimeout(() => loadMarketDataRef.current?.(), PREP_AUTOLOAD_DELAY_MS)
    return () => clearTimeout(timer)
  }, [autoLoadTrigger])

  async function generateBrief() {
    if (!anthropicKey) return
    setAiLoading(true)
    setAiError('')
    setPriceWarning('')
    const { prevDay, pivots, vwapData, price, rvol, atr, preMarket, volProfile } = liveData || {}
    const d = (v, fb = 'unknown') => v != null && !isNaN(v) ? f2(v) : fb

    // ── Build refPrice + marketContext ────────────────────────────────────
    // Priority chain per spec: live price -> sessionClose -> prevDay close ->
    // sessionOpen -> pre-market last. Live price first per spec, but we also
    // compute the drift against sessionClose / currentPrice so a stale tick
    // (the typical case where the WS holds a pre-market print after close)
    // raises a visible warning before we ship the prompt.
    const finitePos = v => typeof v === 'number' && isFinite(v) && v > 0
    const parseNum = s => {
      const n = parseFloat(s)
      return finitePos(n) ? n : null
    }
    const livePriceN = finitePos(price) ? price : null
    const sessionCloseN = parseNum(prep.sessionClose)
    const sessionOpenN = parseNum(prep.sessionOpen)
    const prevDayCloseN = finitePos(prevDay?.close) ? prevDay.close : null
    const orbHighN = parseNum(prep.orbHigh)
    const orbLowN = parseNum(prep.orbLow)
    const preMarketLastN = finitePos(preMarket?.last) ? preMarket.last : null

    // ET-aware after-hours flag computed up front so the priority chain can
    // branch on it. After regular close, the WS price can hold a stale
    // pre-market tick (the 713.98 case we hit on QQQ), so sessionClose wins
    // over livePrice in that window. During regular hours and pre-market,
    // livePrice is the right anchor and stays at the top of the chain.
    const etFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    })
    const etParts = {}
    for (const p of etFmt.formatToParts(new Date())) etParts[p.type] = p.value
    const etHour = parseInt(etParts.hour, 10) % 24
    const etMinute = parseInt(etParts.minute, 10)
    const etWeekday = etParts.weekday
    const isWeekendEt = etWeekday === 'Sat' || etWeekday === 'Sun'
    const etMinutesOfDay = etHour * 60 + etMinute
    const isAfterHours = isWeekendEt || etMinutesOfDay >= 16 * 60
    const isBeforeOpen = !isWeekendEt && etMinutesOfDay < 9 * 60 + 30

    let refPrice = null
    let refPriceSource = 'none'
    if (isAfterHours && sessionCloseN != null) {
      // Post-close: regular session close is the canonical anchor. The live
      // tick (if any) can be a stale pre-market print or an unstable AH quote.
      refPrice = sessionCloseN; refPriceSource = 'sessionClose'
    } else if (livePriceN != null) {
      refPrice = livePriceN; refPriceSource = 'livePrice'
    } else if (sessionCloseN != null) {
      refPrice = sessionCloseN; refPriceSource = 'sessionClose'
    } else if (prevDayCloseN != null) {
      refPrice = prevDayCloseN; refPriceSource = 'prevDayClose'
    } else if (sessionOpenN != null) {
      refPrice = sessionOpenN; refPriceSource = 'sessionOpen'
    } else if (preMarketLastN != null) {
      refPrice = preMarketLastN; refPriceSource = 'preMarketLast'
    }

    const marketContext = {
      currentPrice: livePriceN,
      refPrice,
      refPriceSource,
      sessionOpen: sessionOpenN,
      sessionClose: sessionCloseN,
      priorDayHigh: orbHighN ?? (finitePos(prevDay?.high) ? prevDay.high : null),
      priorDayLow: orbLowN ?? (finitePos(prevDay?.low) ? prevDay.low : null),
      prevDayClose: prevDayCloseN,
      isAfterHours,
      isBeforeRegularOpen: isBeforeOpen,
      timestamp: new Date().toISOString(),
    }

    // eslint-disable-next-line no-console
    console.log('[Generate AI Brief] selected refPrice:', refPrice, 'source:', refPriceSource)
    // eslint-disable-next-line no-console
    console.log('[Generate AI Brief] marketContext:', marketContext)

    // 2% drift warning: if refPrice diverges from currentPrice OR sessionClose
    // by more than 2%, surface that to the user before firing the AI call.
    // Helps catch the stuck-WS-pre-market-tick case where the live price is
    // unreliable even though it sits at the top of the priority chain.
    if (refPrice != null) {
      const anchors = [
        { name: 'sessionClose', value: sessionCloseN },
        { name: 'currentPrice', value: livePriceN },
      ].filter(a => a.value != null && a.value !== refPrice)
      for (const anchor of anchors) {
        const drift = Math.abs(refPrice - anchor.value) / anchor.value
        if (drift > 0.02) {
          const msg =
            `Ref Price $${f2(refPrice)} (${refPriceSource}) differs by ` +
            `${(drift * 100).toFixed(1)}% from ${anchor.name} $${f2(anchor.value)}. ` +
            `If the live price feed is stuck on a pre-market tick, re-run Load Market Data and regenerate.`
          // eslint-disable-next-line no-console
          console.warn('[Generate AI Brief] drift warning:', msg)
          setPriceWarning(msg)
          break
        }
      }
    }

    const isStock = (prep.instrument || 'options') === 'stock'
    const rvolStr = rvol != null ? `${rvol.toFixed(2)}x avg (${rvol >= 1.2 ? 'elevated, moves are real' : rvol >= 0.8 ? 'normal' : 'low, low conviction'})` : 'not available'
    const atrStr = atr != null ? `$${d(atr)} (daily ATR)` : 'not available'
    const pmStr = preMarket?.active
      ? `Price $${d(preMarket.last)}, gap ${preMarket.gap >= 0 ? 'up' : 'down'} $${d(Math.abs(preMarket.gap))} vs PDC. PMH $${d(preMarket.high)}, PML $${d(preMarket.low)}. Trend: ${preMarket.trend}.`
      : 'no pre-market data yet'
    const vpStr = volProfile?.poc != null
      ? `POC $${d(volProfile.poc)}, VAH $${d(volProfile.vah)}, VAL $${d(volProfile.val)}`
      : 'not computed yet'
    const alignStr = mtfAlignment?.score > 0
      ? `1H ${mtfAlignment.mtf?.['1h']?.state || '—'}, 15M ${mtfAlignment.mtf?.['15m']?.state || '—'}, 5M ${mtfAlignment.mtf?.['5m']?.state || '—'}, 1M ${mtfAlignment.mtf?.['1m']?.state || '—'}. Score: ${mtfAlignment.score}/100. ${mtfAlignment.label}.`
      : 'not yet calculated'

    // Canonical reference block the AI must anchor on. Format optimized for the
    // model to grok at a glance: refPrice front and center, the alternatives
    // listed so the model can sanity-check, and an explicit instruction not to
    // fall back to pre-market after regular close.
    const refBlock = [
      `Ref Price (anchor all level math on this): $${d(refPrice)} (source: ${refPriceSource})`,
      `Current live price: ${livePriceN != null ? '$' + d(livePriceN) : 'unavailable'}`,
      `Session open (today's regular session open): ${sessionOpenN != null ? '$' + d(sessionOpenN) : 'unavailable'}`,
      `Session close (today's regular session close): ${sessionCloseN != null ? '$' + d(sessionCloseN) : 'unavailable'}`,
      `Prior day high: ${marketContext.priorDayHigh != null ? '$' + d(marketContext.priorDayHigh) : 'unavailable'}`,
      `Prior day low: ${marketContext.priorDayLow != null ? '$' + d(marketContext.priorDayLow) : 'unavailable'}`,
      `Is after regular hours: ${isAfterHours}`,
      `Is before regular open: ${isBeforeOpen}`,
      `Generated at: ${marketContext.timestamp}`,
    ].join('\n')

    const refRule =
      `HARD RULE: Do not use the pre-market or session open as Ref Price after the regular session has closed. ` +
      `If sessionClose or currentPrice is available, use that instead. Anchor every Key Level, Entry, Stop, ` +
      `and Target on Ref Price above, not on a pre-market or session-open value.`
    const prompt = isStock
      ? `You are a professional day trader assistant. Generate a game plan for ${prep.ticker || 'SPY'} stock/ETF.

MARKET CONTEXT (anchor on this):
${refBlock}

${refRule}

Other context:
- Ticker: ${prep.ticker || 'SPY'}
- OR Period: ${prep.orPeriod || 15} min
- Prev Day High: $${d(prevDay?.high, prep.orbHigh)} | Low: $${d(prevDay?.low, prep.orbLow)} | Close: $${d(prevDay?.close)}
- Pivot Point: $${d(pivots?.pp)} | R1: $${d(pivots?.r1)} | R2: $${d(pivots?.r2)} | R3: $${d(pivots?.r3)}
- S1: $${d(pivots?.s1)} | S2: $${d(pivots?.s2)} | S3: $${d(pivots?.s3)}
- VWAP: $${d(vwapData?.vwap)} | VWAP +1σ: $${d(vwapData?.band1up)} | -1σ: $${d(vwapData?.band1dn)}
- RVOL: ${rvolStr}
- ATR: ${atrStr}
- Volume Profile: ${vpStr}
- Pre-Market: ${pmStr}
- MTF Alignment: ${alignStr}
- Market events: ${prep.marketEvents || 'none noted'}

Write a tight, specific game plan with these exact sections:

THESIS
[1-2 sentences: what the market structure supports today and why]

KEY LEVELS
[List 4-6 levels from the data with $ price and what a touch/break means. Format: • $XXX.XX — [explanation]]

ENTRY CONDITIONS
[Exactly what must happen on the 5-min chart before entering. Candle behavior, volume, level confirmation. Be specific — "wait for a candle CLOSE above $X" not vague.]

PRIMARY SETUP
[The highest-probability trade today. Specify exact entry trigger, stop (share price), target (share price), and R:R. Use the ATR to size the stop.]

SECONDARY SETUP
[Backup plan if primary fails. One alternative scenario — what reversal or different direction could play out. One concise setup.]

PROBABILITY ASSESSMENT
[1-2 honest sentences: is this a high or low probability day? What makes it tradeable or why you'd stand aside? Factor in RVOL and ATR context.]

STAND ASIDE IF
[3 specific conditions that kill today's setup. Be concrete.]

Only use the levels provided. No generic advice.

---
STRUCTURED (parsing block, do not modify the format): output exactly one JSON object on its own line at the very end of your response, after all prose sections above. The JSON must contain a single field "volume_threshold", an integer share count for the break-candle volume that confirms the primary setup. Estimate from the ticker's typical 5-min volume if not stated. Example: {"volume_threshold": 50000}`
      : `You are a professional options day trader assistant. Generate a game plan for 0DTE ${prep.ticker || 'QQQ'} options.

MARKET CONTEXT (anchor on this):
${refBlock}

${refRule}

Other context:
- Ticker: ${prep.ticker || 'QQQ'}
- OR Period: ${prep.orPeriod || 15} min
- Prev Day High: $${d(prevDay?.high, prep.orbHigh)} | Low: $${d(prevDay?.low, prep.orbLow)} | Close: $${d(prevDay?.close)}
- Pivot Point: $${d(pivots?.pp)} | R1: $${d(pivots?.r1)} | R2: $${d(pivots?.r2)} | R3: $${d(pivots?.r3)}
- S1: $${d(pivots?.s1)} | S2: $${d(pivots?.s2)} | S3: $${d(pivots?.s3)}
- VWAP: $${d(vwapData?.vwap)} | VWAP +1σ: $${d(vwapData?.band1up)} | -1σ: $${d(vwapData?.band1dn)}
- RVOL: ${rvolStr}
- ATR: ${atrStr}
- Volume Profile: ${vpStr}
- Pre-Market: ${pmStr}
- MTF Alignment: ${alignStr}
- Planned strike: $${prep.plannedStrike || 'not set'} | DTE: ${prep.plannedDTE || 1}
- IV note: ${prep.ivNote || 'not recorded'}
- Market events: ${prep.marketEvents || 'none noted'}

Write a tight, specific game plan with these exact sections:

THESIS
[1-2 sentences: what the market structure supports today and why]

KEY LEVELS
[List 4-6 levels from the data with $ price and what a touch/break means. Format: • $XXX.XX — [explanation]]

ENTRY CONDITIONS
[Exactly what must happen on the 5-min chart before entering. Candle behavior, volume, level confirmation. Be specific — "wait for a candle CLOSE above $X" not vague.]

PRIMARY SETUP
Strike: $${prep.plannedStrike || '[ATM]'} | DTE: ${prep.plannedDTE || 1}
[The highest-probability 0DTE setup. Specify entry premium range, stop, target, and R:R. Include underlying trigger level.]

SECONDARY SETUP
[Backup if primary fails — alternative direction or structure play if the primary level doesn't hold. One concise setup.]

PROBABILITY ASSESSMENT
[1-2 honest sentences: is this a high or low probability day? What makes it tradeable or why you'd stand aside? Factor in RVOL, IV, and ATR context.]

STAND ASIDE IF
[3 specific conditions that kill today's setup. Be concrete.]

Only use the levels provided. No generic advice.

---
STRUCTURED (parsing block, do not modify the format): output exactly one JSON object on its own line at the very end of your response, after all prose sections above. The JSON must contain a single field "volume_threshold", an integer share count for the break-candle volume that confirms the primary setup. Estimate from the ticker's typical 5-min volume if not stated. Example: {"volume_threshold": 50000}`

    try {
      // The Anthropic call is now server-side. ANTHROPIC_API_KEY and the
      // model string live in Vercel env so the browser never holds the
      // key and the model can be bumped from the dashboard without a
      // redeploy. The server returns a flat { content, model } on
      // success or a structured { status, type, message, model } on
      // failure; both shapes are surfaced verbatim in the banner.
      const res = await fetch('/api/ai/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 900 }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.content) {
        const raw = data.content
        // Extract the trailing STRUCTURED JSON block, write threshold for
        // the active ticker, and strip the block from the visible brief.
        let visible = raw
        try {
          const match = raw.match(/\{[^{}]*"volume_threshold"\s*:\s*([0-9]+)[^{}]*\}\s*$/m)
          if (match) {
            const threshold = parseInt(match[1], 10)
            if (!isNaN(threshold) && threshold > 0 && onVolumeThresholdsChange) {
              const tickerKey = (prep.ticker || 'QQQ').toUpperCase()
              onVolumeThresholdsChange(prev => ({ ...(prev || {}), [tickerKey]: threshold }))
            }
            visible = raw
              .replace(/\n*---\s*\n+STRUCTURED[^\n]*\n+\{[^{}]*"volume_threshold"[^{}]*\}\s*$/m, '')
              .replace(/\n*\{[^{}]*"volume_threshold"[^{}]*\}\s*$/m, '')
              .trimEnd()
          }
        } catch {}
        upd('gamePlan', visible)
      } else {
        // Surface the real upstream failure: HTTP status, Anthropic error
        // type, and the message verbatim. A future "model not found" or
        // "missing key" failure becomes immediately debuggable from the
        // banner instead of showing a blank Generation failed line.
        const parts = []
        const status = data.status || res.status
        if (status) parts.push(`Anthropic ${status}`)
        if (data.type) parts.push(`(${data.type})`)
        const message = data.message || data.error || 'Generation failed'
        parts.push(message)
        setAiError(parts.join(' '))
      }
    } catch (e) {
      setAiError('Network error: ' + e.message)
    }
    setAiLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div><SLabel>Nightly Options Game Plan</SLabel><Heading>Tomorrow's Prep</Heading></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {hasLiveData && (
            <Btn small variant="ghost" onClick={loadMarketData}>
              {dataLoaded ? '✓ Loaded' : '↓ Load Market Data'}
            </Btn>
          )}
          {canSave && (
            <Btn small variant="ghost" onClick={savePrep}>
              {justSaved ? '✓ Saved' : isAlreadySaved ? '↑ Update Saved' : '+ Save Prep'}
            </Btn>
          )}
          <Btn small variant={hasClaudeKey ? 'lime' : 'ghost'} onClick={generateBrief} disabled={!hasClaudeKey || aiLoading}>
            {aiLoading ? '✦ Writing...' : hasClaudeKey ? '✦ Generate AI Brief' : 'Add Claude Key → Command'}
          </Btn>
          <div style={{ fontSize: 12, color: LIME, fontFamily: MONO, fontWeight: 700 }}>
            {new Date(todayStr() + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {priceWarning && (
        <div style={{ background: '#1a1605', border: `1px solid ${YELLOW}`, borderRadius: 4, padding: '10px 16px', fontSize: 11, fontFamily: MONO, color: YELLOW, fontWeight: 700 }}>⚠ {priceWarning}</div>
      )}

      {aiError && (
        <div style={{ background: '#1a0505', border: '1px solid #3a0808', borderRadius: 4, padding: '10px 16px', fontSize: 11, fontFamily: MONO, color: RED }}>{aiError}</div>
      )}

      {loadError && (
        <div style={{ background: '#1a0505', border: `1px solid ${RED}`, borderRadius: 4, padding: '10px 16px', fontSize: 11, fontFamily: MONO, color: RED, fontWeight: 700 }}>⚠ {loadError}</div>
      )}

      {!hasClaudeKey && (
        <div style={{ background: '#0d100a', border: `1px solid ${LIME}22`, borderRadius: 5, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontFamily: MONO, color: '#6a8060' }}>
            ✦ Add your Claude API key in the <strong style={{ color: LIME }}>Command</strong> tab to enable AI game plan generation — gets your thesis, key levels, entry conditions, and ideal setup in one click.
          </span>
        </div>
      )}

      <div style={{ background: '#0d1208', border: '1px solid #1e2a18', borderRadius: 5, padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SLabel style={{ marginBottom: 0 }}>Tonight's Setup</SLabel>
          {hasLiveData && !dataLoaded && (
            <span style={{ fontSize: 9, fontFamily: MONO, color: '#555' }}>Live data available — hit "Load Market Data" to auto-fill ↑</span>
          )}
          {dataLoaded && <span style={{ fontSize: 9, fontFamily: MONO, color: LIME }}>✓ PDH/PDL/PP/Strike loaded from Massive</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, marginBottom: 14, alignItems: 'end' }}>
          <Fld label="Primary Ticker" value={prep.ticker || ''} onChange={updateTicker} type="text" placeholder="QQQ" mono />
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: '#3a3a3a', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6 }}>Instrument</div>
            <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden' }}>
              {[{ v: 'options', l: 'Options' }, { v: 'stock', l: 'Stock/ETF' }].map(({ v, l }) => {
                const active = (prep.instrument || 'options') === v
                return (
                  <button key={v} onClick={() => upd('instrument', v)} style={{ flex: 1, background: active ? '#1e1e1e' : 'transparent', color: active ? LIME : '#444', border: 'none', borderRight: v === 'options' ? `1px solid ${BORDER}` : 'none', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '9px 14px', cursor: 'pointer', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {l}
                  </button>
                )
              })}
            </div>
          </div>
          <Sel label="OR Period" value={prep.orPeriod || settings.orPeriod || '15'} onChange={v => upd('orPeriod', v)} options={[{ value: '5', label: '5 min (8:35 CT)' }, { value: '15', label: '15 min (8:45 CT)' }, { value: '30', label: '30 min (9:00 CT)' }]} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 14 }}>
          <div>
            <Fld label="Prior Day High" value={prep.orbHigh || ''} onChange={v => upd('orbHigh', v)} prefix="$" />
            {missingFields.orbHigh && <div style={{ fontSize: 8, fontFamily: MONO, color: YELLOW, letterSpacing: '0.08em', marginTop: 4 }}>no live value</div>}
          </div>
          <div>
            <Fld label="Prior Day Low" value={prep.orbLow || ''} onChange={v => upd('orbLow', v)} prefix="$" />
            {missingFields.orbLow && <div style={{ fontSize: 8, fontFamily: MONO, color: YELLOW, letterSpacing: '0.08em', marginTop: 4 }}>no live value</div>}
          </div>
          <div>
            <Fld label="Session Open" value={prep.sessionOpen || ''} onChange={v => upd('sessionOpen', v)} prefix="$" />
            {missingFields.sessionOpen && <div style={{ fontSize: 8, fontFamily: MONO, color: YELLOW, letterSpacing: '0.08em', marginTop: 4 }}>no live value</div>}
          </div>
          <div>
            <Fld label="Session Close" value={prep.sessionClose || ''} onChange={v => upd('sessionClose', v)} prefix="$" />
            {missingFields.sessionClose && <div style={{ fontSize: 8, fontFamily: MONO, color: YELLOW, letterSpacing: '0.08em', marginTop: 4 }}>no live value</div>}
          </div>
          <div>
            <Fld label="Key Level (PP)" value={prep.keyLevel || ''} onChange={v => upd('keyLevel', v)} prefix="$" />
            {missingFields.keyLevel && <div style={{ fontSize: 8, fontFamily: MONO, color: YELLOW, letterSpacing: '0.08em', marginTop: 4 }}>no live value</div>}
          </div>
          <div>
            <Fld label="Strike Plan" value={prep.plannedStrike || ''} onChange={v => upd('plannedStrike', v)} prefix="$" mono />
            {missingFields.plannedStrike && <div style={{ fontSize: 8, fontFamily: MONO, color: YELLOW, letterSpacing: '0.08em', marginTop: 4 }}>no live value</div>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          {(() => {
            const presets = [
              { v: '0', label: '0DTE' },
              { v: '1', label: '1DTE' },
              { v: '3', label: '3DTE' },
              { v: '7', label: '1W' },
              { v: '14', label: '2W' },
            ]
            const current = String(prep.plannedDTE ?? '')
            const isPreset = presets.some(p => p.v === current)
            return (
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.14em', color: '#3a3a3a', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6 }}>Planned DTE</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {presets.map(p => {
                    const active = current === p.v
                    return (
                      <button key={p.v} onClick={() => upd('plannedDTE', p.v)} style={{ flex: 1, background: active ? LIME : 'transparent', color: active ? '#000' : '#888', border: `1px solid ${active ? LIME : BORDER}`, borderRadius: 3, padding: '7px 8px', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', minWidth: 42 }}>{p.label}</button>
                    )
                  })}
                  <button onClick={() => upd('plannedDTE', isPreset ? '' : current || '')} style={{ flex: 1, background: !isPreset && current ? LIME : 'transparent', color: !isPreset && current ? '#000' : '#888', border: `1px solid ${!isPreset && current ? LIME : BORDER}`, borderRadius: 3, padding: '7px 8px', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', minWidth: 56 }}>Custom</button>
                </div>
                {!isPreset && (
                  <input type="number" value={current} onChange={e => upd('plannedDTE', e.target.value)} placeholder="days" style={{ marginTop: 6, width: '100%', background: '#111', border: `1px solid ${BORDER}`, borderRadius: 3, color: '#bbb', fontFamily: MONO, fontSize: 12, padding: '7px 10px', outline: 'none' }} />
                )}
              </div>
            )
          })()}
          <Fld label="IV Note (from option chain)" value={prep.ivNote || ''} onChange={v => upd('ivNote', v)} placeholder="~26%" mono />
        </div>
        {(() => {
          const price = liveData?.price
          const vwap = liveData?.vwapData?.vwap
          const vwapDelta = price != null && vwap != null ? price - vwap : null
          const sq = levelMap?.setupQuality
          const above = levelMap?.nearestAbove
          const below = levelMap?.nearestBelow
          const nearest = (() => {
            if (!price) return null
            if (!above && !below) return null
            if (!above) return { ...below, dist: price - below.price, dir: 'below' }
            if (!below) return { ...above, dist: above.price - price, dir: 'above' }
            const dA = above.price - price, dB = price - below.price
            return dA < dB ? { ...above, dist: dA, dir: 'above' } : { ...below, dist: dB, dir: 'below' }
          })()
          const activeCount = (levelMap?.levels || []).length
          const pdh = liveData?.prevDay?.high
          const pdl = liveData?.prevDay?.low
          const pp = liveData?.pivots?.pp

          const qColor = sq === 'ON LEVEL' ? LIME : sq === 'APPROACHING' ? YELLOW : sq === 'TIGHT RANGE' ? PURPLE : '#888'
          const qDesc = sq === 'ON LEVEL' ? 'price is touching a key level — await candle close' : sq === 'APPROACHING' ? 'price is closing in on a level — get ready' : sq === 'TIGHT RANGE' ? 'compressed between two close levels — breakout setup' : sq === 'BETWEEN LEVELS' ? 'no immediate level — wait for price to reach one' : 'live data not loaded'

          const plan = (prep.gamePlan || '').trim()
          const briefDetected = !!anthropicKey && (plan.includes('THESIS') || plan.includes('PRIMARY SETUP') || plan.includes('KEY LEVELS'))

          const checks = [
            { label: `Ticker set${prep.ticker ? ` (${prep.ticker})` : ''}`, done: !!prep.ticker, nudge: 'Enter a ticker above' },
            { label: `Prior day levels loaded${prep.orbHigh && prep.orbLow ? ` ($${prep.orbHigh} / $${prep.orbLow})` : ''}`, done: !!(prep.orbHigh && prep.orbLow), nudge: 'Hit "Load Market Data" ↑' },
            { label: `Key level (PP) set${prep.keyLevel ? ` ($${prep.keyLevel})` : ''}`, done: !!prep.keyLevel, nudge: 'Hit "Load Market Data" ↑' },
            { label: `Strike plan set${prep.plannedStrike ? ` ($${prep.plannedStrike})` : ''}`, done: !!prep.plannedStrike, nudge: 'Set a planned strike above' },
            { label: 'Game plan written', done: plan.length > 20, nudge: 'Write your plan below' },
            { label: 'AI brief generated', done: briefDetected, nudge: anthropicKey ? 'Hit "Generate AI Brief" ↑' : 'Add Claude API key in Command' },
          ]
          const doneCount = checks.filter(c => c.done).length
          const allDone = doneCount === checks.length

          return (
            <div style={{ background: '#0a0d08', border: `1px solid ${qColor}33`, borderRadius: 5, padding: '16px 18px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SLabel style={{ marginBottom: 0 }}>Setup Quality</SLabel>
                <span style={{ fontSize: 9, fontFamily: MONO, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>live</span>
              </div>

              {/* Quality badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ background: `${qColor}11`, border: `1px solid ${qColor}55`, borderRadius: 4, padding: '8px 14px', minWidth: 150 }}>
                  <div style={{ fontSize: 9, color: '#555', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Quality</div>
                  <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 900, color: qColor, letterSpacing: '0.04em' }}>{sq || 'NO DATA'}</div>
                </div>
                <div style={{ fontSize: 11, fontFamily: MONO, color: '#777', lineHeight: 1.5, flex: 1 }}>{qDesc}</div>
              </div>

              {/* Key context */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ background: '#080808', border: '1px solid #161616', borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, color: '#444', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>vs VWAP</div>
                  <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: vwapDelta == null ? '#444' : vwapDelta >= 0 ? LIME : RED }}>
                    {vwapDelta == null ? '—' : vwapDelta >= 0 ? `Above +$${f2(vwapDelta)}` : `Below -$${f2(Math.abs(vwapDelta))}`}
                  </div>
                </div>
                <div style={{ background: '#080808', border: '1px solid #161616', borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, color: '#444', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Nearest Level</div>
                  <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: nearest ? '#e8e8e8' : '#444' }}>
                    {nearest ? `${nearest.label} $${f2(nearest.price)}` : '—'}
                  </div>
                  {nearest && (
                    <div style={{ fontSize: 9, fontFamily: MONO, color: '#555', marginTop: 2 }}>{nearest.dir === 'above' ? '↑' : '↓'} ${f2(nearest.dist)} away</div>
                  )}
                </div>
                <div style={{ background: '#080808', border: '1px solid #161616', borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, color: '#444', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Active Levels</div>
                  <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: activeCount > 0 ? '#e8e8e8' : '#444' }}>
                    {activeCount > 0 ? `${activeCount} loaded` : '—'}
                  </div>
                </div>
              </div>

              {/* Tomorrow's structure */}
              <div>
                <div style={{ fontSize: 9, color: '#444', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Tomorrow's Structure</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { l: 'PDH — resistance', v: pdh, c: RED },
                    { l: 'PP — pivot', v: pp, c: '#888' },
                    { l: 'PDL — support', v: pdl, c: BLUE },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ background: '#080808', border: `1px solid ${v != null ? c + '22' : '#161616'}`, borderRadius: 4, padding: '8px 12px' }}>
                      <div style={{ fontSize: 9, color: '#555', fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: v != null ? c : '#333' }}>{v != null ? `$${f2(v)}` : '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Readiness checklist */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 9, color: '#444', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Prep Readiness</span>
                  <span style={{ fontSize: 10, fontFamily: MONO, color: allDone ? LIME : '#666' }}>{doneCount}/{checks.length} complete</span>
                </div>
                <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', width: `${(doneCount / checks.length) * 100}%`, background: allDone ? LIME : YELLOW, transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {checks.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: MONO, fontSize: 11 }}>
                      <span style={{ color: c.done ? LIME : RED, fontWeight: 700, minWidth: 14 }}>{c.done ? '✓' : '✗'}</span>
                      <span style={{ color: c.done ? '#aaa' : '#666' }}>{c.label}</span>
                      {!c.done && <span style={{ color: '#3a3a3a', fontSize: 10 }}>— {c.nudge}</span>}
                    </div>
                  ))}
                </div>
                {allDone && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#071208', border: `1px solid ${LIME}55`, borderRadius: 4, textAlign: 'center' }}>
                    <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 900, color: LIME, letterSpacing: '0.12em' }}>READY FOR MONDAY</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 9, letterSpacing: '0.14em', color: '#666', textTransform: 'uppercase', fontFamily: MONO }}>
              Game Plan {aiLoading && <span style={{ color: LIME }}>— AI Writing...</span>}
            </label>
            {prep.gamePlan && !aiLoading && <span style={{ fontSize: 9, color: '#444', fontFamily: MONO }}>edit freely</span>}
          </div>
          <textarea
            value={prep.gamePlan || ''}
            onInput={e => upd('gamePlan', e.target.value)}
            placeholder={aiLoading ? 'Claude is analyzing your levels and writing your brief...' : hasClaudeKey ? 'Hit "Generate AI Brief" for an auto-generated plan, or write your own.' : 'Setup, strike, entry trigger, stop, target. What would make you stand aside?'}
            style={{ background: '#111', border: `1px solid ${prep.gamePlan ? '#2a3825' : BORDER}`, borderRadius: 4, color: '#bbb', fontFamily: MONO, fontSize: 12, padding: '14px 16px', resize: 'vertical', minHeight: prep.gamePlan ? 220 : 80, outline: 'none', lineHeight: 1.85, width: '100%', opacity: aiLoading ? 0.6 : 1 }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 9, letterSpacing: '0.14em', color: '#666', textTransform: 'uppercase', fontFamily: MONO }}>What to Avoid Tomorrow</label>
          <textarea value={prep.avoidNotes || ''} onInput={e => upd('avoidNotes', e.target.value)} placeholder="What traps will you stay out of?"
            style={{ background: '#111', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#888', fontFamily: MONO, fontSize: 12, padding: '12px 14px', resize: 'vertical', minHeight: 52, outline: 'none', lineHeight: 1.7, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
          <label style={{ fontSize: 9, letterSpacing: '0.14em', color: '#666', textTransform: 'uppercase', fontFamily: MONO }}>Market Events Tomorrow</label>
          <input
            type="text"
            value={prep.marketEvents || ''}
            onInput={e => upd('marketEvents', e.target.value)}
            placeholder="CPI 8:30 CT, FOMC 2pm, NVDA earnings AH..."
            style={{ background: '#111', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#888', fontFamily: MONO, fontSize: 12, padding: '9px 12px', outline: 'none', width: '100%' }}
            onFocus={e => { e.target.style.borderColor = YELLOW }}
            onBlur={e => { e.target.style.borderColor = BORDER }}
          />
        </div>
      </div>

      {prep.ticker && prep.orbHigh && prep.orbLow && (
        <div style={{ background: '#0d1208', border: '1px solid #253520', borderRadius: 5, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: '#ccc', marginBottom: 4 }}>
              {prep.ticker} — H: ${prep.orbHigh} / L: ${prep.orbLow}{prep.plannedStrike ? ` — Strike: $${prep.plannedStrike}` : ''}
            </div>
            <div style={{ fontSize: 10, color: '#555', fontFamily: MONO }}>
              At {prep.orPeriod === '5' ? '8:35' : prep.orPeriod === '30' ? '9:00' : '8:45'} CT, load into ORB tab and verify in IV tab.
            </div>
          </div>
          <Btn onClick={() => onSendToORB({ ticker: prep.ticker, orbHigh: prep.orbHigh, orbLow: prep.orbLow, orPeriod: prep.orPeriod })}>Load into ORB →</Btn>
        </div>
      )}

      {/* Saved Preps panel — only shown when saves exist */}
      {hasSaved && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SLabel>Saved Preps</SLabel>
            <span style={{ fontSize: 9, fontFamily: MONO, color: '#333' }}>{Object.keys(savedPreps).length} saved</span>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {Object.values(savedPreps).map(saved => {
              const planLines = (saved.gamePlan || '').split('\n').filter(l => l.trim()).slice(0, 2).join(' ')
              const preview = planLines.length > 100 ? planLines.slice(0, 100) + '...' : planLines || 'No game plan'
              const dateStr = new Date(saved.dateSaved).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const isCurrent = prep.ticker === saved.ticker
              return (
                <div key={saved.ticker} style={{ background: '#0d0d0d', border: `1px solid ${isCurrent ? LIME + '44' : BORDER}`, borderRadius: 5, padding: '14px 16px', minWidth: 200, maxWidth: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, fontFamily: MONO, color: LIME, letterSpacing: '-0.02em' }}>{saved.ticker}</div>
                    <div style={{ fontSize: 9, color: '#333', fontFamily: MONO, paddingTop: 3 }}>{dateStr}</div>
                  </div>
                  {saved.orbHigh && saved.orbLow && (
                    <div style={{ fontSize: 9, color: '#444', fontFamily: MONO }}>${saved.orbLow} — ${saved.orbHigh}</div>
                  )}
                  <div style={{ fontSize: 10, color: '#2a2a2a', fontFamily: MONO, lineHeight: 1.5, flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {preview}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn small variant="blue" onClick={() => loadSavedPrep(saved)}>Load</Btn>
                    <Btn small variant="ghost" onClick={() => deleteSavedPrep(saved.ticker)}>Delete</Btn>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><SLabel>Morning Routine (CT)</SLabel><div style={{ fontSize: 11, color: '#666', fontFamily: MONO }}>Check off as you go.</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 80, height: 3, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(dc / ROUTINE.length) * 100}%`, background: dc === ROUTINE.length ? LIME : YELLOW, transition: 'width 0.2s' }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: MONO, color: '#555' }}>{dc}/{ROUTINE.length}</span>
          </div>
        </div>
        {ROUTINE.map((step, i) => {
          const checked = !!rc[i]
          return (
            <div key={i} onClick={() => setRc(c => ({ ...c, [i]: !c[i] }))} style={{ display: 'flex', cursor: 'pointer', background: checked ? '#0c0f0a' : 'transparent', borderBottom: i < ROUTINE.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <div style={{ minWidth: 130, padding: '12px 14px', borderRight: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontFamily: MONO, color: checked ? '#444' : LIME, fontWeight: 700, whiteSpace: 'nowrap' }}>{step.time}</span>
              </div>
              <div style={{ width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${BORDER}` }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${checked ? LIME : '#444'}`, background: checked ? LIME : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {checked && <span style={{ color: '#000', fontSize: 9, fontWeight: 900 }}>✓</span>}
                </div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: checked ? '#3a3a3a' : '#999', fontFamily: MONO, lineHeight: 1.55, textDecoration: checked ? 'line-through' : 'none' }}>{step.label}</span>
              </div>
            </div>
          )
        })}
        {dc === ROUTINE.length && (
          <div style={{ padding: '14px 20px', background: '#0a1208', borderTop: '1px solid #1e3018' }}>
            <div style={{ fontSize: 12, fontFamily: MONO, color: LIME, fontWeight: 700, letterSpacing: '0.06em' }}>ROUTINE COMPLETE — Execute the plan. Trust your prep.</div>
          </div>
        )}
      </Card>

      <div style={{ background: '#120d0d', border: '1px solid #2a1818', borderRadius: 5, padding: '16px 20px' }}>
        <SLabel>End of Day Reset</SLabel>
        <textarea value={prep.dayReview || ''} onInput={e => upd('dayReview', e.target.value)} placeholder="What did you learn? How did IV affect your premium? What will you do differently tomorrow?"
          style={{ background: '#111', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#888', fontFamily: MONO, fontSize: 12, padding: '12px 14px', resize: 'vertical', minHeight: 80, outline: 'none', lineHeight: 1.7, width: '100%' }} />
      </div>
    </div>
  )
}
