import React, { useEffect, useState } from 'react'
import { useMarketData } from '../hooks/useMarketData.js'
import { displayFreshness } from '../lib/marketDataContract.js'
const time = value => value ? new Date(value).toLocaleString('en-US',{timeZone:'America/Chicago',timeZoneName:'short'}) : 'Unavailable'
function Evidence({ state, title }) {
  const [,tick] = useState(0)
  useEffect(() => { const timer=setInterval(()=>tick(x=>x+1),1000); const wake=()=>tick(x=>x+1); document.addEventListener('visibilitychange',wake); return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',wake)} },[])
  const e=state.envelope
  if (!e) return <section><h2>{title}</h2><p>{state.loading ? 'Loading selected instrument…' : state.error || 'Unavailable'}</p></section>
  const elapsed=state.receivedAt === null ? 0 : (performance.now()-state.receivedAt)/1000
  return <section><h2>{title}</h2><p>{e.availability} · {displayFreshness(e,elapsed)} · {e.quality.coverage}</p><p>Massive / REST · Profile {e.deployment_profile} · Server response {time(e.generated_at)}</p>
    {state.error && <p role="status">{state.error}</p>}
    {['bid','ask','last_trade'].map(key=>{const f=e.data?.[key];return e.data && key in e.data ? <p key={key}>{key.replace('_',' ')}: {f ? `$${f.value.toFixed(2)} · ${f.feed_timeframe} · ${f.field_quality.freshness === 'CURRENT' && f.source_time && (Date.parse(e.generated_at)-Date.parse(f.source_time))/1000+elapsed > 30 ? 'STALE' : f.field_quality.freshness} · Source ${time(f.source_time)}` : 'Unavailable'}</p> : null})}
    {e.data?.bars && <><p>Completed-minute RTH context · {e.data.bars.length} observed bars · {e.coverage_details.pagination_complete ? 'Pagination complete' : 'Pagination incomplete or unknown'}</p><table><thead><tr><th>Start (CT)</th><th>End (CT)</th><th>Completed</th><th>O / H / L / C</th></tr></thead><tbody>{e.data.bars.slice(-20).map(bar=><tr key={bar.start}><td>{time(bar.start)}</td><td>{time(bar.end)}</td><td>{String(bar.completed)}</td><td>{[bar.open,bar.high,bar.low,bar.close].join(' / ')}</td></tr>)}</tbody></table></>}
    <p>{e.quality.reasons.join(' · ')}</p>
  </section>
}
export default function UnifiedMarketContext({onLegacy,ready,capabilities}) {
  const [symbol,setSymbol]=useState('QQQ')
  const [date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}))
  const quote=useMarketData('snapshot',symbol)
  const bars=useMarketData('bars',symbol,{from:date,to:date})
  return <main style={{padding:24,color:'#eee',background:'#111',minHeight:'100vh'}}><h1>Unified ETF context</h1>{onLegacy && <button onClick={onLegacy}>Switch to Legacy mode</button>}<p>Read-only QQQ, SPY and IWM evidence. Trade readiness: NOT_EVALUATED.</p><p>Server readiness: {ready ? 'Configured; source verification remains required' : 'Unavailable or not configured'}</p><section><h2>Capability evidence</h2><p>Capability evidence describes observed access; it does not prove a current feed.</p>{capabilities?.data?.records?.length ? <table><thead><tr><th>Scope / field</th><th>State</th><th>Evidence</th><th>Checked (CT)</th><th>Expires (CT)</th></tr></thead><tbody>{capabilities.data.records.map((row,index)=><tr key={index}><td>{row.instrument_scope} / {row.field_group}</td><td>{row.state}</td><td>{row.evidence_source}</td><td>{time(row.checked_at)}</td><td>{time(row.expires_at)}</td></tr>)}</tbody></table> : <p>Capability evidence unavailable.</p>}</section><label>Instrument <select value={symbol} onChange={e=>setSymbol(e.target.value)}>{['QQQ','SPY','IWM'].map(s=><option key={s}>{s}</option>)}</select></label> <label>RTH bar date <input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><Evidence title={`${symbol} quote`} state={quote}/><Evidence title={`${symbol} minute bars`} state={bars}/><p>Migration pending: current action evaluation unavailable. Coach, setups, Wheel, scanner, Market Map and options analytics await their reviewed adapters.</p></main>
}
