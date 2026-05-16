// ── ORB Tab ───────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { Card, SLabel, Heading, Tile, Fld, Sel, Btn, Pill, CheckRow } from './ui.jsx'
import { LIME, RED, YELLOW, BLUE, PURPLE, ORANGE, MONO, SANS, BORDER, DARK, PANEL, SETUP_TYPES, todayStr, tomorrowStr, uid, f2, fmtD, fmtU, rrColor, ivContext, calcOptionRR, bsCalc, getETMins, SESSION_LABELS, SESSION_COLORS, SESSION_TIPS } from '../constants.js'
import { getOptionChain, getPrevDay, getHistoricalBars, getOptionsPCRatio } from '../lib/massive.js'
import { useLocalStorage } from '../hooks/useStore.js'

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

export function ORBTab({ settings, onSendToCalc, prepFill, liveData }) {
  const [ticker, setTicker] = useState('')
  const [orbH, setOrbH] = useState('')
  const [orbL, setOrbL] = useState('')
  const [dir, setDir] = useState('long')
  const [es, setEs] = useState('retest')
  const [checks, setChecks] = useState({})

  useEffect(() => {
    if (!prepFill) return
    if (prepFill.ticker) setTicker(prepFill.ticker)
    if (prepFill.orbHigh) setOrbH(prepFill.orbHigh)
    if (prepFill.orbLow) setOrbL(prepFill.orbLow)
  }, [prepFill])

  const oh = parseFloat(orbH), ol = parseFloat(orbL)
  const range = !isNaN(oh) && !isNaN(ol) && oh > ol ? oh - ol : null
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
      <div style={{ background: '#080d08', border: '1px solid #152015', borderRadius: 5, padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: '#3a5030', fontFamily: MONO, lineHeight: 1.8 }}>
          <span style={{ color: LIME }}>ORB uses underlying (QQQ) prices.</span> Use IV tab to check contract pricing before entering.
        </div>
      </div>
      {prepFill && <div style={{ fontSize: 11, fontFamily: MONO, color: YELLOW, background: '#0f0d04', border: '1px solid #252010', borderRadius: 4, padding: '10px 16px' }}>Levels pre-loaded from Prep. Verify against live chart.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <Fld label="Ticker" value={ticker} onChange={setTicker} type="text" placeholder="QQQ" mono />
        <Fld label="OR High" value={orbH} onChange={setOrbH} placeholder="714.00" prefix="$" />
        <Fld label="OR Low" value={orbL} onChange={setOrbL} placeholder="711.50" prefix="$" />
        <Sel label="Direction" value={dir} onChange={setDir} options={[{ value: 'long', label: '↑ Long — Buy Call' }, { value: 'short', label: '↓ Short — Buy Put' }]} />
      </div>
      <Sel label="Entry Style" value={es} onChange={setEs} options={[{ value: 'retest', label: 'Retest Entry — wait for pullback to OR level (recommended)' }, { value: 'break', label: 'Breakout Entry — enter on first close above/below' }]} />
      {range && (
        <>
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
        </>
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
export function IVAnalyzerTab({ apiKey }) {
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

  async function doFetch() {
    if (!apiKey) { setFetchError('No API key — enter it in the Command tab.'); return }
    setFetching(true); setFetchError(null); setFetchResults([])
    try {
      const results = await getOptionChain(apiKey, fetchTicker, fetchExpiry, fetchStrike || null, fetchType)
      if (!results.length) { setFetchError('No contracts found. Check strike and expiry.'); setFetching(false); return }
      setFetchResults(results)
      const top = results[0]
      if (top.last_quote?.ask) setMp(f2(top.last_quote.ask))
      if (top.implied_volatility) setIv(f2(top.implied_volatility * 100))
      if (top.details?.strike_price) setStrike(String(top.details.strike_price))
      if (top.underlying_asset?.value) setUnderlying(f2(top.underlying_asset.value))
      const dteVal = top.details?.expiration_date ? Math.max(0, Math.round((new Date(top.details.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))) : null
      if (dteVal != null) setDte(String(dteVal))
      setOptType(top.details?.contract_type || fetchType)
    } catch (e) { setFetchError(e.message) }
    setFetching(false)
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
          <Fld label="DTE" value={dte} onChange={setDte} placeholder="1" step="1" suffix="d" />
          <Fld label="IV% (from chain)" value={iv} onChange={setIv} placeholder="28.5" suffix="%" />
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
          {(beU || em) && <Card>
            <SLabel>Key Levels</SLabel>
            {beU && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #0f0f0f' }}><div><div style={{ fontSize: 11, fontFamily: MONO, color: '#555' }}>Break-even at expiry (underlying)</div><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, marginTop: 2 }}>QQQ must reach here for profit at expiry</div></div><div style={{ fontSize: 15, fontFamily: MONO, fontWeight: 700, color: YELLOW }}>${f2(beU)}</div></div>}
            {em && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}><div><div style={{ fontSize: 11, fontFamily: MONO, color: '#555' }}>Expected 1σ move (underlying)</div><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, marginTop: 2 }}>Market pricing {f2((em / S) * 100)}% move from ${f2(S)}</div></div><div style={{ fontSize: 15, fontFamily: MONO, fontWeight: 700, color: BLUE }}>±${f2(em)}</div></div>}
          </Card>}
          {optRR && <Card style={{ border: `1px solid ${rrColor(optRR.rr)}33` }}>
            <SLabel>R:R on This Contract</SLabel>
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
export function CalculatorTab({ prefill, onLogTrade, checklistPassed, lockedOut, maxTradesReached, apiKey }) {
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

  useEffect(() => {
    if (!prefill) return
    if (prefill.ticker) setTicker(prefill.ticker)
    if (prefill.optType) setOptType(prefill.optType)
    if (prefill.setupType) setSetupType(prefill.setupType)
  }, [prefill])

  async function fetchLiveAsk() {
    if (!apiKey || !ticker || !strike) { setLiveAskError('Need API key, ticker, and strike first.'); return }
    setLiveAskLoading(true); setLiveAskError(null)
    try {
      const results = await getOptionChain(apiKey, ticker, todayStr(), strike, optType)
      if (!results.length) { setLiveAskError('No contracts found.'); setLiveAskLoading(false); return }
      const top = results[0]
      if (top.last_quote?.ask) setEntry(f2(top.last_quote.ask))
    } catch (e) { setLiveAskError(e.message) }
    setLiveAskLoading(false)
  }

  const calc = calcOptionRR(entry, stop, target, contracts)
  const blocked = lockedOut || maxTradesReached
  const valid = calc !== null
  const color = valid ? rrColor(calc.rr) : '#333'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><SLabel>Options-First Trade Entry</SLabel><Heading>R:R Calculator</Heading></div>
      <div style={{ background: '#0a0d08', border: '1px solid #1a2a18', borderRadius: 5, padding: '12px 16px' }}>
        <div style={{ fontSize: 10, color: '#3a5030', fontFamily: MONO, lineHeight: 1.8 }}>
          <span style={{ color: LIME, fontWeight: 700 }}>Options mode:</span> Entry, stop, and target are the option contract prices — not QQQ. Amounts auto-calculate at ×100 per contract.
        </div>
      </div>
      {!checklistPassed && <div style={{ background: '#120d00', border: '1px solid #2a1e00', borderRadius: 4, padding: '11px 16px', fontSize: 11, fontFamily: MONO, color: YELLOW }}>Checklist not confirmed. Run the Pre-Trade Checklist first.</div>}
      {blocked && <div style={{ background: '#150000', border: `1px solid ${RED}33`, borderRadius: 4, padding: '11px 16px', fontSize: 11, fontFamily: MONO, color: RED }}>{lockedOut ? 'Trading locked — daily loss limit reached.' : 'Daily trade limit reached.'}</div>}
      <div style={{ background: '#0a0a0a', border: `1px solid ${valid ? color + '44' : BORDER}`, borderRadius: 5, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, color: '#333', letterSpacing: '0.14em', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 10 }}>Risk : Reward (on premium)</div>
          <div style={{ fontSize: 48, fontWeight: 900, color, fontFamily: MONO, lineHeight: 1, letterSpacing: '-0.03em' }}>{valid ? '1 : ' + f2(calc.rr) : '— : —'}</div>
          {valid && <div style={{ fontSize: 10, color, fontFamily: MONO, letterSpacing: '0.14em', marginTop: 8, textTransform: 'uppercase' }}>{calc.rr >= 3 ? 'STRONG EDGE' : calc.rr >= 2 ? 'ACCEPTABLE' : 'POOR SETUP — DO NOT TRADE'}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'right' }}>
          {[{ l: 'Break-even Win%', v: valid ? f2(calc.breakEvenWin) + '%' : '—', c: '#aaa' }, { l: 'Total Cost', v: valid ? fmtU(calc.totalCost) : '—', c: '#777' }, { l: 'Max $ Risk', v: valid ? fmtU(calc.dollarRisk) : '—', c: RED }, { l: 'Max $ Reward', v: valid ? fmtU(calc.dollarReward) : '—', c: LIME }].map(row => (
            <div key={row.l}><div style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '0.1em', fontFamily: MONO, textTransform: 'uppercase' }}>{row.l}</div><div style={{ fontSize: 15, color: row.c, fontFamily: MONO, fontWeight: 600 }}>{row.v}</div></div>
          ))}
        </div>
      </div>
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
      <div style={{ background: '#080d05', border: '1px solid #1a2a10', borderRadius: 5, padding: '16px 18px' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', color: '#3a5030', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6 }}>Option Contract Prices (premium per share)</div>
        <div style={{ fontSize: 10, color: '#3a5030', fontFamily: MONO, marginBottom: 14, lineHeight: 1.7 }}>Entry, stop, target = option's own price. 1 contract = 100 shares. $ amounts = price × 100 × contracts.</div>
        {apiKey && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <Btn small variant="blue" onClick={fetchLiveAsk} disabled={liveAskLoading || !ticker || !strike}>{liveAskLoading ? 'Fetching...' : 'Get Live Ask →'}</Btn>
            {liveAskError && <span style={{ fontSize: 10, color: RED, fontFamily: MONO }}>{liveAskError}</span>}
            {!liveAskError && entry && <span style={{ fontSize: 10, color: LIME, fontFamily: MONO }}>✓ Entry from live ask</span>}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Fld label="Entry Premium" value={entry} onChange={setEntry} placeholder="2.40" prefix="$" accent />
          <Fld label="Stop (option price)" value={stop} onChange={setStop} placeholder="1.20" prefix="$" accent />
          <Fld label="Target (option price)" value={target} onChange={setTarget} placeholder="4.80" prefix="$" accent />
        </div>
        {valid && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
            <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Risk / contract</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: RED }}>-${f2(calc.risk)} <span style={{ fontSize: 10, color: '#444' }}>= -${f2(calc.risk * 100)}</span></div></div>
            <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Reward / contract</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: LIME }}>${f2(calc.reward)} <span style={{ fontSize: 10, color: '#444' }}>= ${f2(calc.reward * 100)}</span></div></div>
            <div style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px' }}><div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 3 }}>Total cost ({contracts}c)</div><div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: '#aaa' }}>{fmtU(calc.totalCost)}</div></div>
          </div>
        )}
      </div>
      <Btn disabled={!valid || blocked} onClick={() => {
        if (!valid || blocked) return
        onLogTrade({ id: uid(), ticker: ticker || '—', optType, strike: parseFloat(strike) || null, dte: parseInt(dte) || null, setupType, entry: parseFloat(entry), stop: parseFloat(stop), target: parseFloat(target), contracts: parseInt(contracts) || 1, rr: calc.rr, dollarRisk: calc.dollarRisk, dollarReward: calc.dollarReward, totalCost: calc.totalCost, status: 'open', pnl: null, notes: '', date: new Date().toISOString() })
      }}>{blocked ? 'Trading Locked' : !valid ? 'Enter premium prices above' : 'Log This Trade →'}</Btn>
    </div>
  )
}

// ── Checklist Tab ─────────────────────────────────────────────────────────────
export function ChecklistTab({ onPass }) {
  const [checked, setChecked] = useState({})
  const req = CL_ITEMS.filter(i => i.required), allReq = req.every(i => checked[i.id])
  const done = CL_ITEMS.filter(i => checked[i.id]).length, pct = Math.round((done / CL_ITEMS.length) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><SLabel>Options Discipline Gate</SLabel><Heading>Pre-Trade Checklist</Heading></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 32, fontWeight: 900, fontFamily: MONO, color: allReq ? LIME : YELLOW, letterSpacing: '-0.03em' }}>{pct}%</div><div style={{ fontSize: 9, color: '#333', fontFamily: MONO, textTransform: 'uppercase' }}>{done}/{CL_ITEMS.length}</div></div>
      </div>
      <div style={{ background: allReq ? '#070e04' : '#100c04', border: `1px solid ${allReq ? '#162210' : '#231a08'}`, borderRadius: 4, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: allReq ? LIME : YELLOW, flexShrink: 0, boxShadow: `0 0 10px ${allReq ? LIME : YELLOW}` }} />
        <span style={{ fontFamily: MONO, fontSize: 12, color: allReq ? LIME : YELLOW, fontWeight: 700, letterSpacing: '0.06em' }}>{allReq ? 'CLEAR TO TRADE — All required rules confirmed.' : 'NOT CLEAR — Complete all required rules first.'}</span>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {CL_ITEMS.map(item => (
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

// ── Journal Tab ───────────────────────────────────────────────────────────────
function TradeRow({ trade, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false)
  const [exitP, setExitP] = useState(trade.exitPrice || '')
  const [notes, setNotes] = useState(trade.notes || '')
  const [status, setStatus] = useState(trade.status)
  const ep = parseFloat(exitP), calcPnl = !isNaN(ep) && trade.contracts ? (ep - trade.entry) * trade.contracts * 100 : null
  const sc = { win: LIME, loss: RED, scratch: YELLOW, open: '#333' }
  function doSave() { onUpdate({ ...trade, exitPrice: parseFloat(exitP) || null, notes, status, pnl: calcPnl ?? trade.pnl }); setOpen(false) }
  return (
    <div style={{ borderBottom: '1px solid #0d0d0d' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'grid', gridTemplateColumns: '55px 40px 55px 55px 1fr 72px 55px', gap: 6, padding: '11px 14px', cursor: 'pointer', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: LIME, fontFamily: MONO, fontWeight: 700 }}>{trade.ticker}</span>
        <span style={{ fontSize: 10, color: trade.optType === 'call' ? LIME : RED, fontFamily: MONO, fontWeight: 700 }}>{trade.optType === 'call' ? 'CALL' : 'PUT'}</span>
        <span style={{ fontSize: 10, color: '#444', fontFamily: MONO }}>{trade.strike ? '$' + trade.strike : '—'}</span>
        <span style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO }}>{trade.dte != null ? trade.dte + 'DTE' : '—'}</span>
        <span style={{ fontSize: 10, color: '#2a2a2a', fontFamily: MONO, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{trade.notes || trade.setupType || '—'}</span>
        <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: trade.pnl != null ? (trade.pnl >= 0 ? LIME : RED) : '#444' }}>{trade.pnl != null ? fmtD(trade.pnl) : '1:' + f2(trade.rr)}</span>
        <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: MONO, color: sc[status] }}>{status}</span>
      </div>
      {open && (
        <div style={{ background: '#0a0a0a', borderTop: '1px solid #111', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontFamily: MONO, fontSize: 12 }}>
            {[['Entry Prem', '$' + f2(trade.entry)], ['Stop Prem', '$' + f2(trade.stop)], ['Target Prem', '$' + f2(trade.target)], ['Contracts', (trade.contracts || 1) + 'c']].map(([l, v]) => (
              <div key={l}><div style={{ color: '#2a2a2a', fontSize: 9, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{l}</div><div style={{ color: '#bbb' }}>{v}</div></div>
            ))}
          </div>
          <div style={{ background: '#080808', border: '1px solid #111', borderRadius: 4, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 4 }}>P&L Math</div>
            <div style={{ fontSize: 11, color: '#333', fontFamily: MONO, lineHeight: 1.8 }}>
              (Exit - Entry) × Contracts × 100 = <span style={{ color: calcPnl != null ? (calcPnl >= 0 ? LIME : RED) : '#444', fontWeight: 700 }}>{calcPnl != null ? fmtD(calcPnl) : '—'}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Fld label="Exit Premium" value={exitP} onChange={setExitP} placeholder="4.80" prefix="$" mono />
            <Sel label="Outcome" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'win', label: 'Win' }, { value: 'loss', label: 'Loss' }, { value: 'scratch', label: 'Scratch / BE' }]} />
          </div>
          {calcPnl != null && <div style={{ fontSize: 14, fontFamily: MONO, color: calcPnl >= 0 ? LIME : RED, fontWeight: 700 }}>P&L: {fmtD(calcPnl)}</div>}
          <textarea value={notes} onInput={e => setNotes(e.target.value)} placeholder="IV at entry, setup quality, what you learned..."
            style={{ background: '#0c0c0c', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#777', fontFamily: MONO, fontSize: 12, padding: '10px 12px', resize: 'vertical', minHeight: 56, outline: 'none', width: '100%' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small onClick={doSave}>Save</Btn>
            <Btn small variant="danger" onClick={() => onDelete(trade.id)}>Delete</Btn>
            <Btn small variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

export function JournalTab({ trades, onUpdate, onDelete, anthropicKey, prep }) {
  const [sf, setSf] = useState('all')
  const [tf, setTf] = useState('all')
  const [eodNotes, setEodNotes] = useLocalStorage('th-eod-notes', {})
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState('')

  let visible = trades.slice()
  if (sf !== 'all') visible = visible.filter(t => t.status === sf)
  if (tf !== 'all') visible = visible.filter(t => t.setupType === tf)
  visible.reverse()
  const usedSetups = [...new Set(trades.map(t => t.setupType).filter(Boolean))]

  const today = todayStr()
  const todayTrades = trades.filter(t => t.date?.slice(0, 10) === today)
  const hasClosedToday = todayTrades.some(t => t.status !== 'open')
  const todayNote = eodNotes[today]

  async function generateCoaching() {
    if (!anthropicKey || coachLoading) return
    setCoachLoading(true)
    setCoachError('')
    const tradeList = todayTrades.map((t, i) =>
      `${i + 1}. ${t.ticker} ${(t.optType || '').toUpperCase()} $${t.strike || '?'} — Entry $${f2(t.entry)}, Stop $${f2(t.stop)}, Target $${f2(t.target)}, ${t.contracts || 1}c — Status: ${t.status} — P&L: ${t.pnl != null ? fmtD(t.pnl) : 'open'} — Notes: ${t.notes || '—'}`
    ).join('\n')
    const prompt = `You are a trading performance coach. Be direct, specific, and brief. Under 250 words total.

Today: ${today}
Morning game plan:
${prep?.gamePlan || '(no game plan recorded)'}

Today's trades:
${tradeList || '(none)'}

Write an EOD coaching note using exactly these section headers:

EXECUTED WELL
[1-2 specific things — reference actual trades if possible]

MISTAKES PATTERN
[The repeating pattern in any mistakes. If clean execution, say so.]

ONE ADJUSTMENT TOMORROW
[One specific, actionable thing to change or keep]

GRADE: [A, B, C, or D]
A = disciplined, followed plan. B = mostly disciplined, minor deviations. C = multiple violations. D = rule violations or emotional trading.
Grade on PROCESS only. A disciplined loss = B or higher. An undisciplined win = C or lower.`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await res.json()
      if (data.content?.[0]?.text) {
        const note = data.content[0].text
        const gradeMatch = note.match(/GRADE:\s*([ABCD])/i)
        const grade = gradeMatch?.[1]?.toUpperCase() || null
        setEodNotes(prev => ({ ...prev, [today]: { note, grade, ts: Date.now() } }))
      } else {
        setCoachError(data.error?.message || 'Coaching failed — check Claude API key in Command tab')
      }
    } catch (e) { setCoachError('Network error: ' + e.message) }
    setCoachLoading(false)
  }

  const gradeColor = g => g === 'A' ? LIME : g === 'B' ? YELLOW : g === 'C' ? ORANGE : g === 'D' ? RED : '#555'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div><SLabel>Options Trade History</SLabel><Heading>Journal</Heading></div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{['all', 'open', 'win', 'loss', 'scratch'].map(f => <Pill key={f} label={f} active={sf === f} onClick={() => setSf(f)} />)}</div>
      </div>
      {usedSetups.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}><Pill label="All" active={tf === 'all'} onClick={() => setTf('all')} />{usedSetups.map(s => <Pill key={s} label={s} active={tf === s} onClick={() => setTf(s)} />)}</div>}
      {visible.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 0', color: '#222', fontFamily: MONO, fontSize: 12 }}>No trades logged yet.</div>
        : <div style={{ background: '#090909', border: `1px solid ${BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '55px 40px 55px 55px 1fr 72px 55px', gap: 6, padding: '9px 14px', borderBottom: '1px solid #111' }}>
            {['Ticker', 'Type', 'Strike', 'DTE', 'Notes', 'P&L/RR', 'Status'].map(h => <span key={h} style={{ fontSize: 9, letterSpacing: '0.1em', color: '#222', textTransform: 'uppercase', fontFamily: MONO }}>{h}</span>)}
          </div>
          {visible.map(t => <TradeRow key={t.id} trade={t} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>}

      {/* EOD Coach */}
      {hasClosedToday && (
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '16px 20px' }}>
          {todayNote ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <SLabel style={{ marginBottom: 0 }}>EOD Coach</SLabel>
                  {todayNote.grade && (
                    <div style={{ fontSize: 18, fontWeight: 900, fontFamily: MONO, color: gradeColor(todayNote.grade), border: `1px solid ${gradeColor(todayNote.grade)}44`, borderRadius: 4, padding: '2px 10px', lineHeight: 1.4 }}>{todayNote.grade}</div>
                  )}
                </div>
                <Btn small variant="ghost" onClick={generateCoaching} disabled={coachLoading || !anthropicKey}>
                  {coachLoading ? 'Coaching...' : 'Regenerate'}
                </Btn>
              </div>
              <pre style={{ fontFamily: MONO, fontSize: 11, color: '#888', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{todayNote.note}</pre>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', fontFamily: MONO, marginBottom: 4 }}>EOD Coach</div>
                <div style={{ fontSize: 11, color: '#555', fontFamily: MONO }}>
                  {anthropicKey ? `${todayTrades.length} trade${todayTrades.length !== 1 ? 's' : ''} today. Get Claude's coaching on your execution and process.` : 'Add Claude API key in Command to enable EOD coaching.'}
                </div>
              </div>
              {anthropicKey && (
                <Btn small variant="lime" onClick={generateCoaching} disabled={coachLoading}>
                  {coachLoading ? '✦ Coaching...' : '✦ EOD Coach'}
                </Btn>
              )}
            </div>
          )}
          {coachError && <div style={{ fontSize: 10, color: RED, fontFamily: MONO, marginTop: 10 }}>{coachError}</div>}
        </div>
      )}
    </div>
  )
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────
export function StatsTab({ trades }) {
  const [eodNotes] = useLocalStorage('th-eod-notes', {})
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
  const curve = trades.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).filter(t => t.pnl != null).map(t => { cum += t.pnl; return cum })
  const cH = 90, cW = 520, maxV = Math.max(...curve, 0.01), minV = Math.min(...curve, -0.01), rng = maxV - minV
  const pts = curve.map((v, i) => `${curve.length === 1 ? cW / 2 : (i / (curve.length - 1)) * cW},${cH - ((v - minV) / rng) * cH}`)
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

      {Object.keys(eodNotes).length > 0 && (() => {
        const gradeColor = g => g === 'A' ? LIME : g === 'B' ? YELLOW : g === 'C' ? ORANGE : g === 'D' ? RED : '#333'
        const sorted = Object.entries(eodNotes).sort(([a], [b]) => a.localeCompare(b))
        const graded = sorted.filter(([, v]) => v.grade)
        const avgScore = graded.length ? graded.reduce((s, [, v]) => s + ({ A: 4, B: 3, C: 2, D: 1 }[v.grade] || 0), 0) / graded.length : null
        const avgGrade = avgScore ? (avgScore >= 3.5 ? 'A' : avgScore >= 2.5 ? 'B' : avgScore >= 1.5 ? 'C' : 'D') : null
        return (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <SLabel style={{ marginBottom: 0 }}>Discipline Grade History</SLabel>
              {avgGrade && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#444', fontFamily: MONO }}>Avg</span>
                  <span style={{ fontSize: 16, fontWeight: 900, fontFamily: MONO, color: gradeColor(avgGrade) }}>{avgGrade}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {sorted.map(([date, { grade }]) => {
                const color = gradeColor(grade)
                return (
                  <div key={date} title={`${date}: ${grade || '?'}`} style={{ width: 26, height: 26, borderRadius: 4, background: grade ? color + '28' : '#141414', border: `1px solid ${grade ? color + '55' : '#222'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: MONO, fontWeight: 900, color: grade ? color : '#2a2a2a', cursor: 'default' }}>
                    {grade || '·'}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 9, fontFamily: MONO, color: '#333' }}>
              {[['A', LIME], ['B', YELLOW], ['C', ORANGE], ['D', RED]].map(([g, c]) => (
                <span key={g} style={{ color: c }}>{g} — {graded.filter(([, v]) => v.grade === g).length} day{graded.filter(([, v]) => v.grade === g).length !== 1 ? 's' : ''}</span>
              ))}
              <span style={{ marginLeft: 'auto' }}>process grade, not P&L</span>
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

function DataChip({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: '#333', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: color || '#888' }}>{value}</div>
    </div>
  )
}

export function WatchlistTab({ apiKey, onSendToPrep }) {
  const [tickers, setTickers] = useLocalStorage('th-scanner-tickers', DEFAULT_TICKERS)
  const [results, setResults] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanErrors, setScanErrors] = useState(0)
  const [scanTime, setScanTime] = useState(() => {
    try { const t = localStorage.getItem('th-scanner-time'); return t ? parseInt(t) : null } catch { return null }
  })
  const [addInput, setAddInput] = useState('')
  const autoScanned = useRef(false)

  async function runScan() {
    if (!apiKey || scanning) return
    setScanning(true)
    setScanErrors(0)

    // Each call has its own .catch() so a single failure doesn't drop the ticker.
    // This scan is pure REST — no WebSocket dependency.
    const settled = await Promise.allSettled(
      tickers.map(async ticker => {
        const [pd, hist, pcr] = await Promise.all([
          getPrevDay(apiKey, ticker).catch(() => null),
          getHistoricalBars(apiKey, ticker, 21).catch(() => []),
          getOptionsPCRatio(apiKey, ticker).catch(() => ({})),
        ])
        const histBars = Array.isArray(hist) && hist.length > 1 ? hist.slice(0, -1) : (hist || [])
        const avgVol = histBars.length > 0
          ? histBars.reduce((s, b) => s + b.v, 0) / histBars.length
          : null
        const score = calcSetupScore(pd, avgVol)
        return { ticker, pd, avgVol, score, pcr }
      })
    )

    const data = settled
      .filter(r => r.status === 'fulfilled' && r.value.pd)
      .map(r => r.value)
      .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))

    const errCount = settled.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.pd)).length
    setScanErrors(errCount)
    setResults(data)
    const ts = Date.now()
    setScanTime(ts)
    try { localStorage.setItem('th-scanner-time', String(ts)) } catch {}
    setScanning(false)
  }

  // Auto-scan on tab open if last scan was > 30 min ago
  useEffect(() => {
    if (autoScanned.current || !apiKey) return
    autoScanned.current = true
    if (!scanTime || Date.now() - scanTime > 30 * 60 * 1000) runScan()
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

  const timeSince = scanTime ? Math.round((Date.now() - scanTime) / 60000) : null
  const scanLabel = timeSince === null ? null
    : timeSince < 1 ? 'just now'
    : timeSince === 1 ? '1 min ago'
    : `${timeSince} min ago`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SLabel>Nightly Setup Scanner</SLabel>
          <Heading>Watchlist</Heading>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {scanLabel && <span style={{ fontSize: 9, fontFamily: MONO, color: '#444' }}>Scanned {scanLabel}</span>}
          {!apiKey && <span style={{ fontSize: 9, fontFamily: MONO, color: RED }}>No API key — add in Command</span>}
          <Btn small onClick={runScan} disabled={!apiKey || scanning}>
            {scanning ? 'Scanning...' : `Scan ${tickers.length} tickers`}
          </Btn>
        </div>
      </div>

      {/* Ticker management */}
      <Card>
        <SLabel>Ticker List</SLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {tickers.map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#141414', border: `1px solid ${BORDER}`, borderRadius: 3, padding: '4px 10px' }}>
              <span style={{ fontSize: 11, fontFamily: MONO, color: '#888' }}>{t}</span>
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

      {/* Scanning — skeleton rows */}
      {scanning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', paddingLeft: 2 }}>
            Scanning {tickers.length} tickers...
          </span>
          {tickers.map(t => (
            <div key={t} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 10, fontFamily: MONO, color: '#1e1e1e', width: 18 }}>—</div>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: MONO, color: '#1e1e1e', minWidth: 60 }}>{t}</div>
              <div style={{ flex: 1, height: 8, background: '#161616', borderRadius: 3 }} />
              <div style={{ width: 40, height: 22, background: '#161616', borderRadius: 3 }} />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!scanning && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {results.length} tickers ranked by setup score — best at top
            </span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {scanErrors > 0 && (
                <span style={{ fontSize: 9, color: '#4a3a2a', fontFamily: MONO }}>⚠ {scanErrors} ticker{scanErrors > 1 ? 's' : ''} returned no data (API limit or bad ticker)</span>
              )}
              {results.some(r => r.pcr?.planError) && (
                <span style={{ fontSize: 9, color: '#333', fontFamily: MONO }}>◦ P/C ratio requires Options Advanced plan</span>
              )}
            </div>
          </div>
          {results.map(({ ticker, pd, score, pcr }, idx) => {
            if (!pd) return null
            const range = pd.high - pd.low
            const rangePct = pd.close > 0 ? range / pd.close * 100 : 0
            const movePct = pd.open > 0 ? (pd.close - pd.open) / pd.open * 100 : 0
            const total = score?.total ?? 0
            const volRatio = score?.volRatio ?? 1
            const closePos = score?.closePos ?? 0.5
            const scoreColor = total >= 70 ? LIME : total >= 45 ? YELLOW : RED
            const topThree = idx < 3
            const closeLbl = closePos > 0.80 ? 'Near HOD' : closePos < 0.20 ? 'Near LOD' : 'Mid Range'
            const closeLblColor = (closePos > 0.80 || closePos < 0.20) ? '#aaa' : '#444'
            const volColor = volRatio >= 1.5 ? LIME : volRatio >= 1.0 ? '#777' : '#444'
            const obs = buildObservation(pd, score)
            const unusualVol = volRatio >= 2.0
            const hasPCR = pcr && !pcr.planError && !pcr.error && pcr.pcRatio != null
            const pcrColor = hasPCR ? (pcr.pcRatio > 1.2 ? RED : pcr.pcRatio < 0.8 ? LIME : '#888') : '#444'
            return (
              <div key={ticker} style={{ background: PANEL, border: `1px solid ${topThree ? LIME + '44' : BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px' }}>
                  {/* Rank */}
                  <div style={{ fontSize: 10, fontFamily: MONO, color: '#222', width: 18, flexShrink: 0, textAlign: 'right' }}>#{idx + 1}</div>

                  {/* Ticker + flash */}
                  <div style={{ flexShrink: 0, minWidth: 60 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, fontFamily: MONO, color: total >= 70 ? LIME : total >= 45 ? YELLOW : '#e8e8e8' }}>{ticker}</div>
                    {unusualVol && <div style={{ fontSize: 8, color: YELLOW, fontFamily: MONO, letterSpacing: '0.08em' }}>⚡ UNUSUAL VOL</div>}
                  </div>

                  {/* Data chips */}
                  <div style={{ flex: 1, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    <DataChip label="Prev Range" value={`$${f2(range)} (${f2(rangePct)}%)`} />
                    <DataChip label="% Move" value={`${movePct > 0 ? '+' : ''}${f2(movePct)}%`} color={movePct > 0.3 ? LIME : movePct < -0.3 ? RED : '#888'} />
                    <DataChip label="Volume" value={`${volRatio.toFixed(1)}x avg`} color={volColor} />
                    <DataChip label="Structure" value={closeLbl} color={closeLblColor} />
                    <DataChip label="P/C Ratio" value={hasPCR ? pcr.pcRatio.toFixed(2) : '—'} color={pcrColor} />
                  </div>

                  {/* Score */}
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 60 }}>
                    <div style={{ fontSize: 8, color: '#333', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Score</div>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: scoreColor, lineHeight: 1 }}>{total}</div>
                    <div style={{ width: 60, height: 3, background: '#1a1a1a', borderRadius: 2, marginTop: 5 }}>
                      <div style={{ height: '100%', width: `${total}%`, background: scoreColor, borderRadius: 2 }} />
                    </div>
                  </div>
                </div>

                {/* Observation + Send to Prep */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '9px 18px', background: '#0a0a0a', borderTop: '1px solid #111' }}>
                  <span style={{ fontSize: 10, fontFamily: MONO, color: '#444', flex: 1 }}>{obs}</span>
                  <Btn small variant="blue" onClick={() => onSendToPrep({ ticker, priorHigh: String(f2(pd.high)), priorLow: String(f2(pd.low)) })}>
                    → Prep
                  </Btn>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!scanning && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#1e1e1e', fontFamily: MONO, fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>◈</div>
          {apiKey ? "Hit Scan to analyze tonight's setups." : 'Add your Massive API key in Command to enable scanning.'}
        </div>
      )}
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

export function PrepTab({ prep, onPrepChange, onSendToORB, settings, liveData, anthropicKey }) {
  const [rc, setRc] = useState({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [dataLoaded, setDataLoaded] = useState(false)

  const oh = parseFloat(prep.orbHigh), ol = parseFloat(prep.orbLow)
  const range = !isNaN(oh) && !isNaN(ol) && oh > ol ? oh - ol : null
  const dc = ROUTINE.filter((_, i) => rc[i]).length
  const upd = (k, v) => onPrepChange({ ...prep, [k]: v })

  const hasLiveData = !!(liveData?.prevDay?.high || liveData?.pivots?.pp)
  const hasClaudeKey = !!anthropicKey

  function loadMarketData() {
    const { prevDay, pivots, price } = liveData || {}
    const updates = {}
    if (prevDay?.high) updates.orbHigh = f2(prevDay.high)
    if (prevDay?.low) updates.orbLow = f2(prevDay.low)
    if (pivots?.pp) updates.keyLevel = f2(pivots.pp)
    if (price) updates.plannedStrike = String(Math.round(price))
    onPrepChange({ ...prep, ...updates })
    setDataLoaded(true)
    setTimeout(() => setDataLoaded(false), 4000)
  }

  async function generateBrief() {
    if (!anthropicKey) return
    setAiLoading(true)
    setAiError('')
    const { prevDay, pivots, vwapData, price } = liveData || {}
    const d = (v, fb = 'unknown') => v != null && !isNaN(v) ? f2(v) : fb

    const prompt = `You are a professional options day trader assistant. Generate a pre-market game plan for 0DTE ${prep.ticker || 'QQQ'} options.

Market context:
- Ticker: ${prep.ticker || 'QQQ'} | Current price: $${d(price)}
- OR Period: ${prep.orPeriod || 15} min
- Prev Day High: $${d(prevDay?.high, prep.orbHigh)} | Low: $${d(prevDay?.low, prep.orbLow)} | Close: $${d(prevDay?.close)}
- Pivot Point: $${d(pivots?.pp)} | R1: $${d(pivots?.r1)} | R2: $${d(pivots?.r2)} | R3: $${d(pivots?.r3)}
- S1: $${d(pivots?.s1)} | S2: $${d(pivots?.s2)} | S3: $${d(pivots?.s3)}
- VWAP: $${d(vwapData?.vwap)} | VWAP +1σ: $${d(vwapData?.band1up)} | -1σ: $${d(vwapData?.band1dn)}
- Planned strike: $${prep.plannedStrike || 'not set'} | DTE: ${prep.plannedDTE || 1}
- IV note: ${prep.ivNote || 'not recorded'}
- Market events tomorrow: ${prep.marketEvents || 'none noted'}

Write a tight, specific game plan with these exact sections:

THESIS
[1-2 sentences: what the market structure supports today and why]

KEY LEVELS
[List 4-6 levels from the data with $ price and what a touch/break means. Format: • $XXX.XX — [explanation]]

ENTRY CONDITIONS
[Exactly what must happen on the 5-min chart before entering. Candle behavior, volume, level confirmation. Be specific — "wait for a candle CLOSE above $X" not vague.]

IDEAL SETUP
Strike: $${prep.plannedStrike || '[ATM]'} | DTE: ${prep.plannedDTE || 1}
Entry premium: $X.XX–$X.XX | Stop: $X.XX (if [level] fails) | Target: $X.XX (at [level])

STAND ASIDE IF
[3 specific conditions that kill today's setup. Be concrete.]

Only use the levels provided. No generic advice.`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 900,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      if (data.content?.[0]?.text) {
        upd('gamePlan', data.content[0].text)
      } else {
        setAiError(data.error?.message || 'Generation failed — check your Claude API key in Command tab')
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
          <Btn small variant={hasClaudeKey ? 'lime' : 'ghost'} onClick={generateBrief} disabled={!hasClaudeKey || aiLoading}>
            {aiLoading ? '✦ Writing...' : hasClaudeKey ? '✦ Generate AI Brief' : 'Add Claude Key → Command'}
          </Btn>
          <div style={{ fontSize: 12, color: LIME, fontFamily: MONO, fontWeight: 700 }}>
            {new Date(todayStr() + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {aiError && (
        <div style={{ background: '#1a0505', border: '1px solid #3a0808', borderRadius: 4, padding: '10px 16px', fontSize: 11, fontFamily: MONO, color: RED }}>{aiError}</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Fld label="Primary Ticker" value={prep.ticker || ''} onChange={v => upd('ticker', v.toUpperCase())} type="text" placeholder="QQQ" mono />
          <Sel label="OR Period" value={prep.orPeriod || settings.orPeriod || '15'} onChange={v => upd('orPeriod', v)} options={[{ value: '5', label: '5 min (8:35 CT)' }, { value: '15', label: '15 min (8:45 CT)' }, { value: '30', label: '30 min (9:00 CT)' }]} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Fld label="Prior Day High" value={prep.orbHigh || ''} onChange={v => upd('orbHigh', v)} placeholder="714.00" prefix="$" />
          <Fld label="Prior Day Low" value={prep.orbLow || ''} onChange={v => upd('orbLow', v)} placeholder="711.50" prefix="$" />
          <Fld label="Key Level (PP)" value={prep.keyLevel || ''} onChange={v => upd('keyLevel', v)} placeholder="712.67" prefix="$" />
          <Fld label="Strike Plan" value={prep.plannedStrike || ''} onChange={v => upd('plannedStrike', v)} placeholder="714" prefix="$" mono />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Fld label="Planned DTE" value={prep.plannedDTE || ''} onChange={v => upd('plannedDTE', v)} placeholder="1" step="1" suffix="d" />
          <Fld label="IV Note (from option chain)" value={prep.ivNote || ''} onChange={v => upd('ivNote', v)} placeholder="~26%" mono />
        </div>
        {range && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            <Tile compact label="Day Range" value={`$${f2(range)}`} />
            <Tile compact label="2:1 Long" value={`$${f2(oh + range * 2)}`} color={LIME} />
            <Tile compact label="2:1 Short" value={`$${f2(ol - range * 2)}`} color={RED} />
          </div>
        )}
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
