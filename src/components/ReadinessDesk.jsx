import { useEffect, useState } from 'react'
import { DESK_SYMBOLS, eastern, evidenceStatus, sessionAt, instrumentType } from '../lib/marketEvidence.js'
import OptionsContracts from './OptionsContracts.jsx'
import { Card } from './ui.jsx'
const money=v=>v==null?'Unavailable':v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})
const time=v=>v?new Date(v).toLocaleString('en-US',{timeZone:'America/Chicago',timeZoneName:'short'}):'Time unavailable'
async function request(action,symbol,signal){
  const r=await fetch(`/api/desk?action=${action}${symbol?`&symbol=${symbol}`:''}`,{cache:'no-store',signal})
  if(r.headers.get('X-TradeHub-Auth-Required')==='true') window.dispatchEvent(new Event('tradehub-operator-expired'))
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Provider unavailable');return d
}
export default function ReadinessDesk(){
  const [symbol,setSymbol]=useState('QQQ'),[feed,setFeed]=useState(null),[context,setContext]=useState(null),[error,setError]=useState(''),[contextError,setContextError]=useState(''),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false)
  const [entry,setEntry]=useState(''),[stop,setStop]=useState(''),[target,setTarget]=useState('')
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[])
  useEffect(()=>{
    const controller=new AbortController();let active=true
    async function refresh(){setBusy(true);try{const d=await request('watchlist',null,controller.signal);if(active){setFeed(d);setError('')}}catch(e){if(active){setFeed(null);setError(e.message)}}finally{if(active)setBusy(false)}}
    refresh();const t=setInterval(refresh,60000)
    return()=>{active=false;controller.abort();clearInterval(t)}
  },[])
  useEffect(()=>{
    const controller=new AbortController();let active=true
    setContext(null);setContextError('');setEntry('');setStop('');setTarget('')
    async function load(){try{const d=await request('context',symbol,controller.signal);if(active)setContext(d)}catch(e){if(active){setContext(null);setContextError(e.message)}}}
    load();const t=setInterval(load,60000)
    return()=>{active=false;controller.abort();clearInterval(t)}
  },[symbol])
  const contextData=context?.symbol===symbol?context:null
  const records=feed?.stocks.data||[],ind=contextData?.indicators,pd=contextData?.previous.data?.[0]
  const age=o=>o?.error?o.error:evidenceStatus(o?.timestamp,{now,kind:o?.kind,timeframe:o?.timeframe})
  const rr=[entry,stop,target].every(v=>v!==''&&Number.isFinite(Number(v))&&Number(v)>0)&&((+target>+entry&&+entry>+stop)||(+target<+entry&&+entry<+stop))?Math.abs((+target-+entry)/(+entry-+stop)):null
  const trend=ind?.ema50!=null?(ind.ema9>ind.ema20&&ind.ema20>ind.ema50?'EMA alignment up':ind.ema9<ind.ema20&&ind.ema20<ind.ema50?'EMA alignment down':'Mixed EMA alignment'):'Insufficient regular-session bars'
  return <main style={{padding:24,maxWidth:1500,margin:'auto'}}>
    <h1>TradeHub · Market data desk</h1><p>Read-only research · {sessionAt(now)} · {time(now)} · Massive REST</p>
    <p>Data access and exchange agreements must cover your personal use. Feed delay is unverified unless Massive supplies a timeframe. Recent observations alone do not prove real-time licensing.</p>
    <p role="status">{busy?'Requesting provider snapshots…':error||`Last retrieval: ${time(feed?.fetchedAt)}. Source timestamps below determine freshness.`}</p>
    <div style={{overflowX:'auto'}}><table className="eq-data-table"><thead><tr>{['Symbol / type','Last trade / index','Source time (CT)','Observed session','Status / delay','Bid / ask','Quote time / status'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
      {DESK_SYMBOLS.map(s=>{const row=s==='VIX'?feed?.vix.data:records.find(r=>r.symbol===s),t=row?.trade,q=row?.quote,fail=s==='VIX'?feed?.vix.error:feed?.stocks.error;return <tr key={s}><th><button onClick={()=>setSymbol(s)}>{s}</button> · {instrumentType(s)}</th><td>{money(t?.price)}</td><td>{time(t?.timestamp)}</td><td>{t?.session||'Unverified'}</td><td>{error||fail||row?.error||age(t)} · {t?.timeframe||'UNVERIFIED'} · Massive</td><td>{money(q?.bid)} / {money(q?.ask)}</td><td>{time(q?.timestamp)} · {age(q)}</td></tr>})}
    </tbody></table></div>
    <p>ES / NQ · FUTURES · Unavailable: contract and entitlement unverified for this server key. Connected Massive app denied both futures snapshots. No ETF price is used. VIX uses I:VIX index data.</p>
    <Card><h2>{symbol} · source-dated levels and bars</h2><label>Instrument <select value={symbol} onChange={e=>setSymbol(e.target.value)}>{DESK_SYMBOLS.map(s=><option key={s}>{s}</option>)}</select></label>
      <p>{contextError||`Requested ${contextData?.date||eastern(now).date} · ${contextData?.bars.error||'Provider minute aggregates; unfinished minute excluded'}`}</p>
      <p>Prior session {contextData?.priorDate||'unavailable'}: {contextData?.previous.error||(!pd?'No completed bar supplied':`High ${money(pd.h)} · Low ${money(pd.l)} · Close ${money(pd.c)}`)} · {time(pd?.timestamp)} · Massive daily aggregate / historical reference</p>
      <p>Prior high/low are reference resistance/support; they are not predictions.</p>
      {['PREMARKET','REGULAR','AFTER_HOURS'].map(s=>{const r=ind?.sessions[s];return <p key={s}>{s}: {r?`last bar close ${money(r.last)} · high ${money(r.high)} · low ${money(r.low)} · ${time(r.timestamp)} · ${evidenceStatus(r.timestamp,{now,kind:'MINUTE_AGGREGATE'})}`:'Unavailable for requested date'}</p>})}
      <p>RTH minute VWAP {money(ind?.vwap)} · EMA9 {money(ind?.ema9)} · EMA20 {money(ind?.ema20)} · EMA50 {money(ind?.ema50)} · {ind?.barCount??0} completed bars</p>
      <p>{trend} · last RTH bar {time(ind?.lastTimestamp)} · {evidenceStatus(ind?.lastTimestamp,{now,kind:'MINUTE_AGGREGATE'})}. Indicators describe supplied bars; sparse minutes and plan delays limit coverage.</p>
      <details><summary>Inspect provider bars and provenance</summary><pre style={{maxHeight:240,overflow:'auto'}}>{JSON.stringify(contextData?.bars.data??{error:contextData?.bars.error||contextError||'Loading'},null,2)}</pre></details>
    </Card>
    <Card><h2>Conditional research plan</h2><p>No automatic signal. Define a setup, trigger and invalidation after checking dated levels. All inputs are manual underlying prices; contract premium risk requires the options calculator.</p>
      <label>Setup / evidence <input placeholder="e.g. prior-high break and retest" /></label> <label>Trigger / entry <input type="number" value={entry} onChange={e=>setEntry(e.target.value)}/></label> <label>Invalidation / stop <input type="number" value={stop} onChange={e=>setStop(e.target.value)}/></label> <label>Target <input type="number" value={target} onChange={e=>setTarget(e.target.value)}/></label>
      <p>Reward / risk: {rr==null?'Unavailable: enter an ordered entry, stop and target':`${rr.toFixed(2)}:1 before costs and slippage`}. Hypothesis only; no fill or outcome is implied.</p>
    </Card>
    {symbol!=='VIX'&&<OptionsContracts ticker={symbol}/>}<p>Priority options: QQQ, SPY, NVDA, AMD, PLTR. Select the underlying above and load a bounded chain. Missing Greeks, IV or quotes remain unavailable.</p>
  </main>
}
