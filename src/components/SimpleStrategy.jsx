import { useEffect, useState } from 'react'
import { evaluateSimpleStrategy } from '../lib/simpleStrategy.js'
import { BORDER, LIME, MONO, PANEL, RED, YELLOW } from '../constants.js'

const CLOCK_REFRESH_MS = 15_000
const STATUS_REFRESH_MS = 60_000
const money = n => Number.isFinite(n) ? `$${n.toFixed(2)}` : 'Pending'
export default function SimpleStrategy({ liveData, ticker, active, lockedOut, maxTradesReached }) {
  const [now, setNow] = useState(Date.now())
  const [phone, setPhone] = useState(null)
  const [statusError, setStatusError] = useState('')
  useEffect(() => {
    if (!active) return
    let stopped = false
    const clock = setInterval(() => setNow(Date.now()), CLOCK_REFRESH_MS)
    async function refresh() {
      try {
        const response = await fetch('/api/simple-strategy?mode=status', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Phone status unavailable.')
        if (!stopped) { setPhone(data); setStatusError('') }
      } catch { if (!stopped) { setPhone(null); setStatusError('Phone status unavailable. Do not rely on phone alerts.') } }
    }
    refresh()
    const status = setInterval(refresh, STATUS_REFRESH_MS)
    return () => { stopped = true; clearInterval(clock); clearInterval(status) }
  }, [active])
  const correctTicker = ticker === 'QQQ' && liveData?.dataTicker === 'QQQ' && !liveData?.isHistoricalFallback
  const evaluated = evaluateSimpleStrategy(correctTicker ? liveData?.intradayBars : [], now)
  const result = liveData?.alertEligible ? evaluated : { ...evaluated, state: evaluated.state === 'CLOSED' ? 'CLOSED' : 'PAUSED', signal: null, reason: 'Verified real-time trade and bar evidence required. Alerts paused.' }
  const blocked = lockedOut || maxTradesReached
  const color = blocked ? RED : result.state === 'CONFIRMED' ? LIME : YELLOW
  const signal = blocked ? null : result.signal
  const configured = phone && Object.values(phone.config || {}).every(Boolean)
  const monitoring = configured && phone.workerFresh && !phone.meta?.error
  const box = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 20 }
  return <div style={{ display: 'grid', gap: 16, fontFamily: MONO, color: '#ddd' }}>
    <section style={box}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>QQQ ONLY / FIRST-HOUR PULLBACK / PAPER TRIAL</div>
      <h2 style={{ color, margin: '0 0 12px' }}>{blocked ? 'STOP FOR TODAY' : result.state === 'CONFIRMED' ? `${result.direction}: CHECK THE TRIGGER` : result.state}</h2>
      <p>{blocked ? 'Your app risk limit has been reached. No new trades.' : !correctTicker ? 'Select QQQ and load current QQQ data. Other tickers and historical fallback data cannot trigger this strategy.' : result.reason}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 18 }}>
        {[['First-hour low', result.range?.low], ['Midpoint alert', result.range?.mid], ['First-hour high', result.range?.high], ['Session VWAP', result.vwap]].map(([label, n]) => <div key={label}><div style={{ color: '#999', fontSize: 11 }}>{label}</div><strong style={{ fontSize: 22 }}>{money(n)}</strong></div>)}
      </div>
      <p style={{ fontSize: 11, color: '#999' }}>Data through {result.asOf ? new Date(result.asOf).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' }) + ' Central' : 'not available'}. Delayed, missing, or old-session bars pause signals.</p>
    </section>
    {signal && <section style={{ ...box, borderColor: LIME }}>
      <h3 style={{ marginTop: 0 }}>Your plan</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>{[['Trigger', signal.entry], ['Stop', signal.stop], ['Target', signal.target]].map(([label, value]) => <div key={label}>{label}<div style={{ fontSize: 24 }}>{money(value)}</div></div>)}</div>
      <p>{signal.rr.toFixed(1)}:1 potential reward/risk. Trigger {signal.direction === 'LONG' ? 'above' : 'below'} the listed price before {new Date(signal.expiresAt).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })} Central.</p>
      <p>Check live price first. Skip if the trigger already passed. Prices refer to QQQ, not option premiums. No order is placed.</p>
    </section>}
    <section style={box}>
      <h3 style={{ marginTop: 0 }}>Phone alerts: {monitoring ? 'background check reporting' : 'not ready'}</h3>
      <p>{statusError || phone?.meta?.error || (monitoring ? 'Background worker is responding. A successful phone sound test is still required.' : 'Phone delivery and a running background schedule must be connected before relying on alerts.')}</p>
      <p style={{ fontSize: 12 }}>1. Midpoint touched: check the chart. 2. Pullback confirmed: review trigger, stop, and target.</p>
      <p style={{ fontSize: 12, color: '#aaa' }}>Telegram notifications request sound. Your phone controls volume, mute, and Focus settings. Test with the screen locked. No SMS or phone call is configured.</p>
      {phone && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11 }}>{Object.entries(phone.config || {}).map(([key, ok]) => <span key={key} style={{ color: ok ? LIME : YELLOW }}>{key}: {ok ? 'configured' : 'missing'}</span>)}</div>}
      <p style={{ fontSize: 11, color: '#999' }}>Background signals are market observations. They cannot read your browser-only trade count or daily loss limit. Stop after two trial attempts and ignore later notifications.</p>
    </section>
    <section style={box}>
      <h3 style={{ marginTop: 0 }}>The boring rules</h3>
      <p>Wait until 9:30 a.m. Central. Trade only a midpoint pullback with rising VWAP for longs or falling VWAP for shorts. Wait for a completed five-minute candle to reclaim or reject the midpoint. Enter only on its high/low break during the next candle.</p>
      <p>Target the first-hour edge. Stop beyond the last three completed candles, plus one cent. Require at least 2:1. No clear direction, no pullback, or missed entry means no trade.</p>
      <p style={{ fontSize: 12, color: '#aaa' }}>This is our defined trial version, not a validated win-rate claim. Maximum two paper attempts per day. VWAP slope threshold: one cent over the preceding five-minute candle.</p>
    </section>
  </div>
}
