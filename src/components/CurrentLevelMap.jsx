import {Card,SLabel,Heading,Btn} from './ui.jsx'
import {evidenceLabel,sessionAt,eastern} from '../lib/marketEvidence.js'
import {requestNotificationPermission} from '../lib/alerts.js'
import {LIME,YELLOW} from '../constants.js'
const money=v=>Number.isFinite(v)?`$${v.toFixed(4)}`:'Unavailable'
const stamp=t=>t?new Date(t).toLocaleString('en-US',{timeZone:'America/Chicago',timeZoneName:'short'}):'Unavailable'

export default function CurrentLevelMap({ticker,market,onSelectTicker,onOpenLiveMap,settings,onSettingsChange}) {
  const {row,structure,contextData:context,now}=market
  const ind=context?.indicators,previous=structure.previous
  const price=row?.trade?.price
  const waiting=market.feed.loading||market.context.loading
  const cooling=Math.max(market.feed.retryAt||0,market.context.retryAt||0)>now
  const recent=['RECENT','RECENT_DELAY_UNVERIFIED','DELAYED'].includes(market.quality)
  const ready=recent&&structure.currentBarsAvailable
  const error=market.feed.error||market.context.error||market.feed.data?.stocks?.error||context?.bars?.error||context?.previous?.error
  const levels=structure.levelMap.levels
  return <section id="current-level-map" tabIndex={-1} style={{display:'flex',flexDirection:'column',gap:18}}>
    <div><SLabel>Verified provider observations · Massive</SLabel><Heading>{ticker} · Current Level Map</Heading><label>Map symbol <select aria-label="Level Map symbol" value={ticker} onChange={e=>onSelectTicker(e.target.value)}>{['QQQ','SPY','NVDA','AMD','IWM','MU','PLTR','TSLA','ORCL','CRWV'].map(s=><option key={s}>{s}</option>)}</select></label></div>
    <Card><SLabel>{eastern(now).date} · {sessionAt(now)} · {evidenceLabel(row?.trade,now)}</SLabel>
      <strong data-testid="current-map-price" style={{fontSize:30,color:LIME}}>{money(price)}</strong>
      <p>Last provider trade: {stamp(row?.trade?.timestamp)} · {evidenceLabel(row?.trade,now)}</p>
      <p>Bid / ask: {money(row?.quote?.bid)} / {money(row?.quote?.ask)} · source {stamp(row?.quote?.timestamp)} · {evidenceLabel(row?.quote,now)}</p>
      <p>Last successful observations refresh: {stamp(market.feed.lastSuccessfulAt)} · levels refresh: {stamp(market.context.lastSuccessfulAt)}</p>
      <Btn small disabled={waiting||cooling} onClick={market.refresh}>Refresh current observations</Btn>
      <p>Automatic refresh: observations every 30 seconds; bars every 60 seconds during supported feed hours, both every 5 minutes when closed. Source timestamps determine freshness. Feed delay remains unverified unless the provider supplies it.</p>
      {cooling&&<p role="status">Provider cooldown until {stamp(Math.max(market.feed.retryAt||0,market.context.retryAt||0))}.</p>}
      {!ready&&<p role="alert" style={{color:YELLOW}}>Current setup unavailable: {waiting?'loading provider observations':error||'market closed, stale, missing or wrong-session inputs'}. Dated levels below are references only. Conditional triggers and alerts are paused.</p>}
      {error&&<p role="alert">Market data unavailable: {error}. No archived map is substituted.</p>}
    </Card>
    <Card><SLabel>Nearest support / resistance · distance from last recorded trade</SLabel>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:20}}>{[['Support',structure.support],['Resistance',structure.resistance]].map(([name,rows])=><div key={name}><strong>{name}</strong>{rows?.length?rows.map(l=><p key={l.label}>{l.label} · {money(l.price)} · distance {money(Math.abs(l.price-price))} · {l.sourceDate}</p>):<p>Unavailable without matching price and validated source levels.</p>}</div>)}</div>
    </Card>
    <Card><SLabel>Observed / calculated references · {context?.date||'session unavailable'}</SLabel><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:16}}>{[
      ['Previous high',previous?.high],['Previous low',previous?.low],['Previous close',previous?.close],
      ['Current RTH high',ind?.sessions?.REGULAR?.high],['Current RTH low',ind?.sessions?.REGULAR?.low],
      ['Premarket high',ind?.sessions?.PREMARKET?.high],['Premarket low',ind?.sessions?.PREMARKET?.low],
      ['RTH VWAP',ind?.vwap],['EMA9',ind?.ema9],['EMA20',ind?.ema20],['EMA50',ind?.ema50],
    ].map(([label,value])=><div key={label}><small>{label}</small><div style={{fontSize:19,color:LIME}}>{money(value)}</div></div>)}</div>
      <p>Previous completed session: {context?.priorDate||'Unavailable'}. RTH source: {stamp(ind?.lastTimestamp)} · {market.barQuality}. Premarket source: {stamp(ind?.sessions?.PREMARKET?.timestamp)}.</p>
      <p>VWAP = sum(provider minute VWAP × volume) / sum(volume), regular-session completed minutes only. EMAs use regular-session closes with an SMA seed and require 9, 20 or 50 bars. These are dated references when stale.</p>
    </Card>
    <Card><SLabel>Conditional long / short scenarios</SLabel>{structure.scenarios.map(s=><div key={s.side}><strong style={{color:LIME}}>{s.side==='Bullish'?'Long':'Short'} · {ready?money(s.boundary):'Paused'}</strong><p>Confirmation: {ready&&s.boundary!=null?s.trigger:'Unavailable until current price and matching session bars are recent.'}</p><p>Invalidation: {ready&&s.boundary!=null?`${s.invalidation} Boundary ${money(s.boundary)}.`:'Unavailable'}</p><p>Next reference target: {ready&&s.target?`${s.target.label} ${money(s.target.price)} · ${s.target.sourceDate}`:'Unavailable'}</p></div>)}
      <p>Boundary = nearest supplied resistance for long, support for short; target = next distinct price beyond it. A completed 5-minute confirmation and retest are required; the map does not claim that either occurred. No assumed fill, predictive accuracy or backtested edge.</p><Btn small onClick={()=>onOpenLiveMap(ticker)}>Open {ticker} live map</Btn>
    </Card>
    <Card><SLabel>Reference confluence</SLabel>{structure.zones.length?structure.zones.map((z,i)=><p key={i}>{money(z.low)}–{money(z.high)} · {z.labels.length} references · {z.labels.join(' / ')}</p>):<p>No nearby reference clusters supplied.</p>}<p>Sorted references are grouped only if the entire cluster spans at most 0.05% of the previous close ({money(structure.zoneTolerance)}). Bounds are actual constituent prices. A cluster is descriptive, not independent confirmation.</p></Card>
    <Card><SLabel>Level ladder · dated references</SLabel><div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Reference</th><th>Price</th><th>Source date</th></tr></thead><tbody>{levels.map(l=><tr key={l.label}><td>{l.label}</td><td>{money(l.price)}</td><td>{l.sourceDate||'Unavailable'}</td></tr>)}</tbody></table></div>{!levels.length&&<p>No validated map supplied.</p>}</Card>
    <Card><SLabel>Alerts</SLabel><Btn small onClick={async()=>{if(settings.alertsEnabled)onSettingsChange({...settings,alertsEnabled:false});else if(await requestNotificationPermission())onSettingsChange({...settings,alertsEnabled:true})}}>{settings.alertsEnabled?'Disable alerts':'Enable alerts + sound'}</Btn><p>{!settings.alertsEnabled?'Not armed.':market.bundle.alertEligible?'Monitoring verified current regular-session observations.':'Paused: alerts require matching, recent, explicitly real-time trades and regular-session bars. Unverified feed delay never qualifies.'}</p>{market.bundle.lastAlerts.map((a,i)=><p key={i}>{a.symbol} · {a.type} · {a.level.label} · {stamp(a.timestamp)}</p>)}</Card>
  </section>
}
