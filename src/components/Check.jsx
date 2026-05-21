import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocalStorage } from '../hooks/useStore.js'
import { SLabel, Heading } from './ui.jsx'
import { LIME, RED, MONO, BORDER, f2 } from '../constants.js'
import { aggregateBars } from '../lib/structure.js'

// ── Tunable thresholds — named exports so they can be adjusted without
// hunting through the component body. All five rules respect these.
export const MOMENTUM_MULTIPLIER = 1.3   // Rule 1: candle body must be N times the 20-candle avg
export const CLEAR_MARGIN_RATIO = 0.25   // Rule 2: close beyond level by this fraction of avg body
export const EXPANSION_THRESHOLD = 0.5   // Rule 3: 5-candle mean body/range ratio must exceed this
export const AVG_LOOKBACK = 20           // Rule 1: candles to average
export const EXPANSION_LOOKBACK = 5      // Rule 3: candles to check
export const ACTIVE_TF_MINUTES = 5       // 5-minute candles as the working timeframe

const OVERRIDE_HOLD_MS = 3000
const LOG_KEY = 'checkLog'
const LOG_LIMIT = 20

// ── Rule evaluators ──────────────────────────────────────────────────────────

function rule1Momentum(bars5m, direction) {
  if (!bars5m || bars5m.length < AVG_LOOKBACK + 1) return { pass: false, value: 'Need more candles to evaluate.' }
  const window = bars5m.slice(-(AVG_LOOKBACK + 1))
  const prev20 = window.slice(0, AVG_LOOKBACK)
  const avgBody = prev20.reduce((s, b) => s + Math.abs(b.c - b.o), 0) / AVG_LOOKBACK
  const last = window[window.length - 1]
  const body = Math.abs(last.c - last.o)
  const isBull = last.c > last.o
  const dirOk = direction === 'LONG' ? isBull : !isBull
  const sizeOk = body > MOMENTUM_MULTIPLIER * avgBody
  const dirText = isBull ? 'bullish' : 'bearish'
  return {
    pass: dirOk && sizeOk,
    value: `Last body $${f2(body)}, 20c avg $${f2(avgBody)}, direction ${dirText}`,
    meta: { body, avgBody, dirOk, sizeOk },
  }
}

function rule2Cleared(bars5m, price, zones, direction) {
  if (!bars5m?.length || !zones?.length || price == null) {
    return { pass: false, value: 'No level data yet.' }
  }
  // Interpretation: a level "cleared" is one we've already crossed. For a
  // LONG, that's the nearest level BELOW current price (price broke up
  // through it). For a SHORT, the nearest level ABOVE.
  const last = bars5m[bars5m.length - 1]
  const prev20 = bars5m.slice(-(AVG_LOOKBACK + 1), -1)
  const avgBody = prev20.length
    ? prev20.reduce((s, b) => s + Math.abs(b.c - b.o), 0) / prev20.length
    : Math.max(0.05, Math.abs(last.c - last.o))

  const validZones = zones.filter(z => z.price != null && !isNaN(z.price))
  let target = null
  if (direction === 'LONG') {
    const below = validZones.filter(z => z.price < price).sort((a, b) => b.price - a.price)
    target = below[0] || null
  } else {
    const above = validZones.filter(z => z.price > price).sort((a, b) => a.price - b.price)
    target = above[0] || null
  }
  if (!target) return { pass: false, value: 'No prior level to clear in trade direction.' }

  const closeBeyond = direction === 'LONG' ? last.c - target.price : target.price - last.c
  const margin = CLEAR_MARGIN_RATIO * avgBody
  const pass = closeBeyond > margin
  const labelType = (target.label || '').match(/^[A-Z]{2,4}/)?.[0] || target.type?.toUpperCase() || 'Level'
  return {
    pass,
    value: pass
      ? `Cleared ${labelType} $${f2(target.price)} by $${f2(closeBeyond)} (needs $${f2(margin)})`
      : `Still inside zone, close $${f2(last.c)} vs ${labelType} $${f2(target.price)}, no clean break`,
    meta: { target, closeBeyond, margin },
  }
}

function rule3Expansion(bars5m) {
  if (!bars5m || bars5m.length < EXPANSION_LOOKBACK) return { pass: false, value: 'Need more candles to evaluate.' }
  const recent = bars5m.slice(-EXPANSION_LOOKBACK)
  const ratios = recent.map(b => {
    const range = Math.max(0.0001, b.h - b.l)
    return Math.abs(b.c - b.o) / range
  })
  const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length
  return {
    pass: mean > EXPANSION_THRESHOLD,
    value: `Body ratio (${EXPANSION_LOOKBACK}c avg): ${mean.toFixed(2)}, threshold: ${EXPANSION_THRESHOLD.toFixed(2)}`,
    meta: { mean },
  }
}

function rule4Alignment(mtf, direction) {
  const tf5 = mtf?.['5m']?.state || null
  const tf15 = mtf?.['15m']?.state || null
  if (!tf5 || !tf15) return { pass: false, value: 'Alignment data not loaded.' }
  const want = direction === 'LONG' ? 'BULLISH' : 'BEARISH'
  const pass = tf5 === want && tf15 === want
  return {
    pass,
    value: `5M: ${tf5}, 15M: ${tf15}, your direction: ${direction}`,
    meta: { tf5, tf15, want },
  }
}

function rule5Manual(checked, signalText) {
  const text = (signalText || '').trim()
  const pass = !!checked && text.length > 0
  return { pass, value: pass ? `Signal noted: "${text}"` : 'Tick the box and name your signal.' }
}

// ── Stat helpers ─────────────────────────────────────────────────────────────

function startOfWeekMs() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.getTime()
}

// ── Pill / atom components ──────────────────────────────────────────────────

function StatusPill({ pass }) {
  const c = pass ? LIME : RED
  return (
    <span style={{
      fontSize: 10, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.12em',
      color: c, background: pass ? 'rgba(209,255,121,0.15)' : 'rgba(255,77,77,0.15)',
      padding: '4px 10px', borderRadius: 3,
    }}>{pass ? 'PASS' : 'FAIL'}</span>
  )
}

function RuleRow({ n, title, body, pass }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '0.5px solid #222' }}>
      <div style={{ width: 22, fontSize: 11, fontFamily: MONO, color: '#444', fontWeight: 700 }}>{n}.</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#ccc', fontFamily: MONO, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#888', fontFamily: MONO }}>{body}</div>
      </div>
      <StatusPill pass={pass} />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CheckTab({ liveData, levelMap, mtfAlignment, ticker = 'QQQ' }) {
  const [direction, setDirection] = useState(null)        // 'LONG' | 'SHORT' | null
  const [r5Checked, setR5Checked] = useState(false)
  const [r5Text, setR5Text] = useState('')
  const [logRaw, setLogRaw] = useLocalStorage(LOG_KEY, [])
  const [overrideOn, setOverrideOn] = useState(false)
  const [overrideProgress, setOverrideProgress] = useState(0)
  const [overrideReason, setOverrideReason] = useState('')
  const [holdingOverride, setHoldingOverride] = useState(false)
  const [showLog, setShowLog] = useState(true)
  const [flashRed, setFlashRed] = useState(false)
  const prevVerdictRef = useRef(null)
  const holdRafRef = useRef(null)
  const holdStartRef = useRef(0)
  const lastLoggedKeyRef = useRef('')

  // ── Aggregate to 5M bars from the 1M intraday feed ────────────────────────
  const bars5m = useMemo(() => {
    const bars = liveData?.intradayBars || []
    return aggregateBars(bars, ACTIVE_TF_MINUTES)
  }, [liveData?.intradayBars])

  const currentPrice = liveData?.price ?? bars5m[bars5m.length - 1]?.c ?? null
  const zones = levelMap?.levels || []

  // ── Evaluate rules 1 through 4 reactively. Rule 5 is manual. ──────────────
  const rules = useMemo(() => {
    if (!direction) return null
    return {
      r1: rule1Momentum(bars5m, direction),
      r2: rule2Cleared(bars5m, currentPrice, zones, direction),
      r3: rule3Expansion(bars5m),
      r4: rule4Alignment(mtfAlignment?.mtf, direction),
      r5: rule5Manual(r5Checked, r5Text),
    }
  }, [direction, bars5m, currentPrice, zones, mtfAlignment, r5Checked, r5Text])

  const allPass = rules && Object.values(rules).every(r => r.pass)
  const verdict = !direction ? 'PENDING' : overrideOn ? 'TRADE_FORCED' : (allPass ? 'TRADE' : 'NO_TRADE')

  // ── Flash red on transition from TRADE back to NO_TRADE ───────────────────
  useEffect(() => {
    const prev = prevVerdictRef.current
    if (prev === 'TRADE' && verdict === 'NO_TRADE') {
      setFlashRed(true)
      const id = setTimeout(() => setFlashRed(false), 700)
      return () => clearTimeout(id)
    }
    prevVerdictRef.current = verdict
  }, [verdict])

  // ── Override 3-second hold (mousedown / touchstart drives a RAF tick) ─────
  function startHold(e) {
    e.preventDefault()
    if (overrideOn) return
    setHoldingOverride(true)
    holdStartRef.current = performance.now()
    const tick = () => {
      const elapsed = performance.now() - holdStartRef.current
      const pct = Math.min(100, (elapsed / OVERRIDE_HOLD_MS) * 100)
      setOverrideProgress(pct)
      if (pct >= 100) {
        completeOverride()
        return
      }
      holdRafRef.current = requestAnimationFrame(tick)
    }
    holdRafRef.current = requestAnimationFrame(tick)
  }

  function cancelHold() {
    if (overrideOn) return
    setHoldingOverride(false)
    setOverrideProgress(0)
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current)
    holdRafRef.current = null
  }

  function completeOverride() {
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current)
    holdRafRef.current = null
    setHoldingOverride(false)
    setOverrideOn(true)
    setOverrideProgress(100)
  }

  function resetOverride() {
    setOverrideOn(false)
    setOverrideProgress(0)
    setOverrideReason('')
  }

  // ── Log writer: writes when a check is committed, dedup by (verdict + dir + ticker + signal) ──
  function commitLog(forced = false, reason = '') {
    if (!direction || !rules) return
    const entry = {
      timestamp: Date.now(),
      ticker,
      direction,
      verdict: forced ? 'TRADE_FORCED' : (allPass ? 'TRADE' : 'NO_TRADE'),
      rule_results: [
        { rule: 'momentum_candle', status: rules.r1.pass ? 'PASS' : 'FAIL', value: rules.r1.value },
        { rule: 'cleared_level', status: rules.r2.pass ? 'PASS' : 'FAIL', value: rules.r2.value },
        { rule: 'expansion_5c', status: rules.r3.pass ? 'PASS' : 'FAIL', value: rules.r3.value },
        { rule: 'tf_alignment', status: rules.r4.pass ? 'PASS' : 'FAIL', value: rules.r4.value },
        { rule: 'printed_signal', status: rules.r5.pass ? 'PASS' : 'FAIL', value: rules.r5.value },
      ],
      override: forced,
      override_reason: forced ? reason : undefined,
      signal_text: rules.r5.pass ? r5Text.trim() : undefined,
    }
    const key = `${entry.verdict}|${entry.direction}|${entry.ticker}|${entry.signal_text || ''}|${forced ? '1' : '0'}`
    if (!forced && lastLoggedKeyRef.current === key) return
    lastLoggedKeyRef.current = key
    setLogRaw(prev => [entry, ...(prev || [])].slice(0, 200))  // keep generous internal cap
  }

  // ── Auto-commit a non-forced check when rule 5 is satisfied. Forced
  // overrides commit explicitly via the override button.
  useEffect(() => {
    if (!direction || !rules) return
    if (overrideOn) return
    if (!rules.r5.pass) return
    commitLog(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, r5Checked, r5Text, direction])

  function confirmForcedOverride() {
    const reason = overrideReason.trim()
    if (!reason) return
    commitLog(true, reason)
    resetOverride()
    setR5Checked(false)
    setR5Text('')
  }

  // ── Recent-log slice + stats ──────────────────────────────────────────────
  const log = (logRaw || []).slice(0, LOG_LIMIT)
  const weekStart = startOfWeekMs()
  const weekly = (logRaw || []).filter(e => e.timestamp >= weekStart)
  const forcedCount = weekly.filter(e => e.override).length
  const savesCount = weekly.filter(e => !e.override && e.verdict === 'NO_TRADE').length

  // ── Verdict block colors ──────────────────────────────────────────────────
  const verdictBg = verdict === 'TRADE' || verdict === 'TRADE_FORCED' ? LIME
    : verdict === 'NO_TRADE' ? RED : '#1a1a1a'
  const verdictText = verdict === 'TRADE' ? 'TRADE'
    : verdict === 'TRADE_FORCED' ? 'TRADE (FORCED)'
    : verdict === 'NO_TRADE' ? 'NO TRADE'
    : 'SELECT DIRECTION'
  const verdictColor = verdict === 'TRADE' || verdict === 'TRADE_FORCED' ? '#0A0A0A'
    : verdict === 'NO_TRADE' ? '#FFFFFF' : '#555'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <SLabel>Pre-flight Check</SLabel>
        <Heading>CHECK</Heading>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#555', marginTop: 4 }}>
          {ticker}, active timeframe: {ACTIVE_TF_MINUTES}M
        </div>
      </div>

      {/* Direction toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {['LONG', 'SHORT'].map(d => {
          const active = direction === d
          const longSel = d === 'LONG'
          return (
            <button key={d} onClick={() => setDirection(d)} style={{
              flex: 1, padding: '14px 16px',
              background: active ? (longSel ? LIME : RED) : 'transparent',
              color: active ? (longSel ? '#000' : '#fff') : '#888',
              border: active ? 'none' : '0.5px solid #333',
              borderRadius: 5, fontFamily: MONO, fontSize: 14, fontWeight: 700, letterSpacing: '0.14em',
              cursor: 'pointer',
            }}>{d}</button>
          )
        })}
      </div>

      {/* Verdict block */}
      <div style={{
        height: 80, width: '100%',
        background: flashRed ? RED : verdictBg,
        color: flashRed ? '#fff' : verdictColor,
        fontFamily: MONO, fontSize: 32, fontWeight: 700, letterSpacing: '0.08em',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5, transition: 'background 0.18s, color 0.18s',
      }}>{flashRed ? 'NO TRADE' : verdictText}</div>

      {/* Rule rows */}
      {rules ? (
        <div>
          <RuleRow n={1} title="Momentum candle in your direction" body={rules.r1.value} pass={rules.r1.pass} />
          <RuleRow n={2} title="Price has cleared a level, not just tested" body={rules.r2.value} pass={rules.r2.pass} />
          <RuleRow n={3} title="Last 5 candles expanding, not contracting" body={rules.r3.value} pass={rules.r3.pass} />
          <RuleRow n={4} title="5M and 15M aligned with your direction" body={rules.r4.value} pass={rules.r4.pass} />
          <RuleRow n={5} title="Printed signal, not gut feel" body={rules.r5.value} pass={rules.r5.pass} />
        </div>
      ) : (
        <div style={{ padding: '24px 18px', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11, fontFamily: MONO, color: '#444' }}>
          Pick LONG or SHORT to evaluate the setup.
        </div>
      )}

      {/* Rule 5 manual input */}
      {rules && (
        <div style={{ background: '#0c0c0c', border: '0.5px solid #222', borderRadius: 5, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={r5Checked} onChange={e => setR5Checked(e.target.checked)} style={{ width: 16, height: 16, accentColor: LIME, cursor: 'pointer' }} />
            <span style={{ fontSize: 12, fontFamily: MONO, color: '#bbb' }}>
              I am entering because of a specific printed signal I can name in one sentence.
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" maxLength={80}
              value={r5Text} onChange={e => setR5Text(e.target.value)}
              placeholder="e.g. 5M close back above VWAP after retest"
              style={{
                flex: 1, background: '#0a0a0a', border: '0.5px solid #222', borderRadius: 4,
                color: '#e8e8e8', fontFamily: MONO, fontSize: 12, padding: '8px 10px', outline: 'none',
              }} />
            <span style={{ fontSize: 10, fontFamily: MONO, color: r5Text.length > 70 ? '#FFD166' : '#444', minWidth: 38, textAlign: 'right' }}>
              {r5Text.length}/80
            </span>
          </div>
        </div>
      )}

      {/* Override path */}
      {rules && !overrideOn && verdict !== 'TRADE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <button
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
            style={{
              position: 'relative', overflow: 'hidden',
              background: 'transparent', border: '0.5px solid #2a2a2a',
              color: '#666', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              padding: '8px 18px', borderRadius: 3, cursor: 'pointer',
              userSelect: 'none', WebkitUserSelect: 'none',
            }}>
            Override (3s hold)
            {holdingOverride && (
              <div style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${overrideProgress}%`, background: RED, transition: 'width 0.05s linear' }} />
            )}
          </button>
          <div style={{ fontSize: 9, fontFamily: MONO, color: '#333', letterSpacing: '0.08em' }}>
            Forced trades are logged. The button only flips after the full 3 seconds.
          </div>
        </div>
      )}

      {/* Override notes — required after forced trigger */}
      {overrideOn && (
        <div style={{ background: '#150505', border: `1px solid ${RED}44`, borderRadius: 5, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: RED, fontWeight: 700, letterSpacing: '0.1em' }}>
            FORCED OVERRIDE, reason required before clearing
          </div>
          <input type="text" maxLength={140}
            value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
            placeholder="Why are you overriding?"
            style={{
              background: '#0a0a0a', border: `0.5px solid ${RED}44`, borderRadius: 4,
              color: '#e8c8c8', fontFamily: MONO, fontSize: 12, padding: '8px 10px', outline: 'none',
            }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmForcedOverride} disabled={!overrideReason.trim()} style={{
              flex: 1, background: overrideReason.trim() ? RED : '#1a1a1a',
              color: overrideReason.trim() ? '#fff' : '#444',
              border: 'none', borderRadius: 4, padding: '10px',
              fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              cursor: overrideReason.trim() ? 'pointer' : 'not-allowed',
            }}>Log override and clear</button>
            <button onClick={resetOverride} style={{
              background: 'transparent', border: '0.5px solid #333', color: '#888',
              borderRadius: 4, padding: '10px 14px',
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Recent checks */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <button onClick={() => setShowLog(s => !s)} style={{ background: 'transparent', border: 'none', color: '#666', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', cursor: 'pointer', padding: 0 }}>
            {showLog ? '▼' : '▶'} RECENT CHECKS, last {LOG_LIMIT}
          </button>
          <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: MONO }}>
            <span style={{ color: '#666' }}>Forced this week: <strong style={{ color: forcedCount > 0 ? RED : '#aaa' }}>{forcedCount}</strong></span>
            <span style={{ color: '#666' }}>NO TRADE saves this week: <strong style={{ color: savesCount > 0 ? LIME : '#aaa' }}>{savesCount}</strong></span>
          </div>
        </div>
        {showLog && (
          log.length === 0
            ? <div style={{ fontSize: 11, fontFamily: MONO, color: '#333', padding: '14px 0' }}>No checks logged yet.</div>
            : <div style={{ background: '#0a0a0a', border: '0.5px solid #222', borderRadius: 5 }}>
                {log.map((e, i) => {
                  const dt = new Date(e.timestamp)
                  const time = dt.toLocaleTimeString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  const isForced = !!e.override
                  const isPass = e.verdict === 'TRADE' || e.verdict === 'TRADE_FORCED'
                  const tagColor = isForced ? RED : isPass ? LIME : '#888'
                  return (
                    <div key={e.timestamp + '-' + i} style={{ display: 'grid', gridTemplateColumns: '110px 60px 60px 100px 1fr', gap: 10, alignItems: 'center', padding: '9px 14px', borderBottom: i < log.length - 1 ? '0.5px solid #161616' : 'none' }}>
                      <span style={{ fontSize: 10, fontFamily: MONO, color: '#555' }}>{time}</span>
                      <span style={{ fontSize: 10, fontFamily: MONO, color: '#aaa', fontWeight: 700 }}>{e.ticker}</span>
                      <span style={{ fontSize: 10, fontFamily: MONO, color: e.direction === 'LONG' ? LIME : RED, fontWeight: 700 }}>{e.direction}</span>
                      <span style={{ fontSize: 9, fontFamily: MONO, color: tagColor, fontWeight: 700, letterSpacing: '0.1em' }}>
                        {e.verdict.replace('_', ' ')}{isForced ? ' (FORCED)' : ''}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: MONO, color: '#666', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {e.override_reason || e.signal_text || '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
        )}
      </div>
    </div>
  )
}
