import { THEME } from '../lib/theme.js'
import { useEffect, useRef, useState } from 'react'
import { getOptionChain } from '../lib/massive.js'
import { LIME, RED, YELLOW, MONO, BORDER } from '../constants.js'
import { Fld, Sel, Btn, SLabel } from './ui.jsx'

const number = (v, digits = 2) => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits })
const time = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' }) : 'Not supplied'
const cell = { padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${BORDER}` }

export default function OptionsContracts({ ticker = 'QQQ', onSelect, onSendToPrep, onSendToCalc }) {
  const [symbol, setSymbol] = useState(ticker)
  const [expiry, setExpiry] = useState('')
  const [strike, setStrike] = useState('')
  const [type, setType] = useState('all')
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const [notice, setNotice] = useState('')
  function invalidate() {
    request.current++
    setResult(null); setSelected(null); setError(''); setLoading(false); setNotice('')
    onSelect?.(null)
  }
  useEffect(() => { setSymbol(ticker); invalidate() }, [ticker])
  useEffect(() => () => { request.current++ }, [])

  async function load() {
    const id = ++request.current
    setLoading(true); setError(''); setResult(null); setSelected(null); onSelect?.(null)
    try {
      if (strike !== '' && (!Number.isFinite(Number(strike)) || Number(strike) <= 0)) throw new Error('Strike must be a positive number.')
      const data = await getOptionChain(symbol, { expiry, type, strike })
      if (id === request.current) setResult(data)
    } catch (e) {
      if (id === request.current) setError(e.status === 403
        ? 'Massive denied this snapshot request for the server API key. Check that this key belongs to your options subscription. Other stock data remains available.'
        : e.message || 'Options request failed.')
    } finally { if (id === request.current) setLoading(false) }
  }
  function choose(contract) { setSelected(contract); setNotice(''); onSelect?.(contract) }
  const rows = [...(result?.contracts || [])].sort((a, b) => a.expiry.localeCompare(b.expiry) || (a.strike ?? 0) - (b.strike ?? 0) || a.type.localeCompare(b.type))
  const c = selected

  return <section style={{ background: THEME.colors.positiveSurface, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 18, fontFamily: MONO }}>
    <SLabel>Massive · Options contracts</SLabel>
    <p style={{ color: THEME.colors.secondary, fontSize: 12, lineHeight: 1.6 }}>Compare contracts from your subscription. IV, Greeks and open interest can be available even when bid/ask quotes are not supplied.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
      <Fld label="Underlying" value={symbol} onChange={v => { invalidate(); setSymbol(v.toUpperCase()) }} mono />
      <Fld label="Expiration (optional)" type="date" value={expiry} onChange={v => { invalidate(); setExpiry(v) }} />
      <Fld label="Exact strike (optional)" value={strike} onChange={v => { invalidate(); setStrike(v) }} />
      <Sel label="Contracts" value={type} onChange={v => { invalidate(); setType(v) }} options={[{ value: 'all', label: 'Calls + puts' }, { value: 'call', label: 'Calls' }, { value: 'put', label: 'Puts' }]} />
    </div>
    <div style={{ marginTop: 12 }}><Btn onClick={load} disabled={loading || !symbol.trim()}>{loading ? 'Loading contracts…' : 'Load options data →'}</Btn></div>
    {error && <p role="alert" style={{ color: RED, fontSize: 12 }}>{error}</p>}
    {result && <p role="status" style={{ color: THEME.colors.secondary, fontSize: 11 }}>{rows.length} contracts returned · fetched {time(result.fetchedAt)}. Quote and trade timestamps are shown separately.</p>}
    {result?.hasMore && <p style={{ color: YELLOW, fontSize: 12 }}>Partial chain: more contracts exist. Select an expiration or exact strike to narrow this 250-contract page.</p>}
    {result && !rows.length && <p style={{ color: YELLOW }}>No matching contracts. Try another expiration or clear the strike filter.</p>}
    {!!rows.length && <div style={{ overflowX: 'auto', maxHeight: 360 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead><tr>{['Contract', 'Expiry', 'Strike', 'Bid', 'Ask', 'IV', 'Delta', 'Theta', 'OI', 'Volume', ''].map((label, i) => <th key={i} scope="col" style={cell}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.symbol} style={{ background: c?.symbol === r.symbol ? THEME.colors.positiveSurface : 'transparent' }}>
        <td style={cell}>{r.type.toUpperCase()}</td><td style={cell}>{r.expiry}</td><td style={cell}>${number(r.strike)}</td>
        <td style={cell}>{number(r.bid)}</td><td style={cell}>{number(r.ask)}</td><td style={cell}>{r.iv == null ? '—' : `${number(r.iv * 100)}%`}</td>
        <td style={cell}>{number(r.delta, 3)}</td><td style={cell}>{number(r.theta, 4)}</td><td style={cell}>{number(r.openInterest, 0)}</td><td style={cell}>{number(r.volume, 0)}</td>
        <td style={cell}><Btn onClick={() => choose(r)}>Inspect</Btn></td>
      </tr>)}</tbody>
    </table></div>}
    {c && <div style={{ marginTop: 16, padding: 14, border: `1px solid ${LIME}55`, fontSize: 12, color: THEME.colors.secondary, lineHeight: 1.8 }}>
      <strong style={{ color: LIME }}>{c.symbol}</strong>
      <div>Contract size: {number(c.sharesPerContract, 0)} shares · Delta {number(c.delta, 3)} · Gamma {number(c.gamma, 4)} · Theta {number(c.theta, 4)} · Vega {number(c.vega, 4)}</div>
      <div>Quote: {c.quoteTimeframe} · {time(c.quoteTime)} · Spread {c.spread == null ? 'unavailable' : `$${number(c.spread)} (${number(c.spreadPct)}%)`}</div>
      <div>Last trade: {c.last == null ? 'not supplied' : `$${number(c.last)}`} · {c.tradeTimeframe} · {time(c.tradeTime)}</div>
      <div>Underlying: {c.underlyingPrice == null ? 'not supplied' : `$${number(c.underlyingPrice)}`} · {time(c.underlyingTime)}</div>
      <p style={{ color: YELLOW, margin: '8px 0' }}>Missing fields are not supplied by this snapshot; access and availability vary. Open interest is a daily figure. Provider “REAL-TIME” describes the feed, not whether an old quote is still current. Verify timestamps and your broker price.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onSendToPrep && <Btn onClick={() => { onSendToPrep(c); setNotice('Contract sent to Prep.') }}>Use in Prep</Btn>}
        {onSendToCalc && <Btn onClick={() => onSendToCalc(c)}>Use in Calculator</Btn>}
      </div>
      {notice && <p role="status" style={{ color: LIME }}>{notice}</p>}
    </div>}
  </section>
}
