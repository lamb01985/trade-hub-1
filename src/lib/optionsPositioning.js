import {volumeOIActivity} from './optionsIntelligence.js'
import {expiryInstant} from './optionsScenario.js'
import {validateOptionIdentity,marketDate} from './optionSnapshot.js'
import {sessionAt,evidenceStatus,eastern,validateBars,intradayContext,previousSession} from './marketEvidence.js'
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const count=n=>Number.isSafeInteger(n)&&n>=0
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
export function validateSnapshot(snapshot,{now=Date.now()}={}) {
 if(!snapshot||!Array.isArray(snapshot.contracts)||snapshot.contracts.length>1000||!/^[A-Z][A-Z0-9.-]{0,9}$/.test(snapshot.symbol||'')||!iso(snapshot.fetchedAt)||Date.parse(snapshot.fetchedAt)>now+5000||typeof snapshot.complete!=='boolean')throw Error('Invalid positioning snapshot')
 const seen=new Set()
 for(const c of snapshot.contracts){validateOptionIdentity({details:{ticker:c.symbol,strike_price:c.strike,expiration_date:c.expiry,contract_type:c.type}},snapshot.symbol);if(c.underlying!==snapshot.symbol||seen.has(c.symbol))throw Error('Positioning identity/duplicate mismatch');seen.add(c.symbol)}
 return snapshot
}
function aggregate(rows,key,snapshot,now) {
 const valid=rows.filter(c=>count(c[key])),sum=valid.length?valid.reduce((sum,c)=>sum+c[key],0):null,value=sum!==null&&Number.isSafeInteger(sum)?sum:null
 const observationTimes=rows.map(c=>key==='volume'?c.dayTime:null).filter(iso)
 const age=now-Date.parse(snapshot.fetchedAt)
 return {value,status:sum!==null&&!Number.isSafeInteger(sum)?'INVALID_TOTAL':!rows.length?'UNAVAILABLE':valid.length!==rows.length?'MISSING_FIELDS':!snapshot.complete?'PARTIAL':age>300000?'STALE':'OBSERVED_REQUEST_WINDOW',known:valid.length,observed:rows.length,missing:rows.length-valid.length,scope:snapshot.coverageScope||'REQUEST_WINDOW',paginationComplete:snapshot.complete,acquiredAt:snapshot.fetchedAt,observationTimes:[...new Set(observationTimes)],freshness:age>300000?'STALE_SNAPSHOT':'RECENT_ACQUISITION_NOT_SOURCE_TIME',sourceTime:key==='openInterest'?'PRIOR_TRADING_DAY_NO_PROVIDER_OI_TIMESTAMP':'PROVIDER_DAY_BAR_TIME_OR_UNKNOWN'}
}
function group(rows,field,snapshot,now) {
 return [...new Set(rows.map(c=>c[field]))].sort((a,b)=>typeof a==='number'?a-b:a.localeCompare(b)).map(value=>{
  const subset=rows.filter(c=>c[field]===value),calls=subset.filter(c=>c.type==='call'),puts=subset.filter(c=>c.type==='put')
  return {level:value,count:subset.length,callOI:aggregate(calls,'openInterest',snapshot,now),putOI:aggregate(puts,'openInterest',snapshot,now),callVolume:aggregate(calls,'volume',snapshot,now),putVolume:aggregate(puts,'volume',snapshot,now),contracts:subset.map(c=>c.symbol)}
 })
}
export function positioning(snapshot,{expiry='',now=Date.now()}={}) {
 validateSnapshot(snapshot,{now})
 const rows=snapshot.contracts.filter(c=>!expiry||c.expiry===expiry),calls=rows.filter(c=>c.type==='call'),puts=rows.filter(c=>c.type==='put')
 const metrics={callOI:aggregate(calls,'openInterest',snapshot,now),putOI:aggregate(puts,'openInterest',snapshot,now),callVolume:aggregate(calls,'volume',snapshot,now),putVolume:aggregate(puts,'volume',snapshot,now)}
 const ratio=(a,b)=>({value:a.value!=null&&b.value>0&&a.missing===0&&b.missing===0?a.value/b.value:null,status:a.missing||b.missing?'MISSING_FIELDS':a.value==null||!b.value?'UNAVAILABLE':snapshot.complete?'REQUEST_WINDOW_ONLY':'PARTIAL',classification:'MODEL_DERIVED',paginationComplete:snapshot.complete,scope:expiry||'OBSERVED_EXPIRATIONS',acquiredAt:snapshot.fetchedAt})
 const strikes=group(rows,'strike',snapshot,now),expiries=group(snapshot.contracts,'expiry',snapshot,now)
 const concentrations=[...strikes].map(r=>({...r,knownOI:(r.callOI.value??0)+(r.putOI.value??0),missingSides:r.callOI.value==null||r.putOI.value==null||r.callOI.missing>0||r.putOI.missing>0})).filter(r=>r.callOI.value!=null||r.putOI.value!=null).sort((a,b)=>b.knownOI-a.knownOI).slice(0,5)
 const u=rows.filter(c=>finite(c.underlyingPrice)&&c.underlyingPrice>0&&iso(c.underlyingTime)&&Date.parse(c.underlyingTime)<=now+5000).sort((a,b)=>Date.parse(b.underlyingTime)-Date.parse(a.underlyingTime))[0]
 return {activity:volumeOIActivity(rows,now),symbol:snapshot.symbol,expiry,metrics,oiRatio:ratio(metrics.putOI,metrics.callOI),volumeRatio:ratio(metrics.putVolume,metrics.callVolume),strikes,expiries,concentrations,underlying:u?{value:u.underlyingPrice,time:u.underlyingTime,timeframe:u.underlyingTimeframe}:null,rows,session:sessionAt(now),complete:snapshot.complete,fetchedAt:snapshot.fetchedAt,classification:'MODEL_DERIVED',direction:'INCONCLUSIVE',note:'Observed contracts do not identify inventory holders, new positions or trade direction. Completeness is limited to the requested filters; pages are not atomic.'}
}
export function compareSnapshots(current,prior,{now=Date.now()}={}) {
 validateSnapshot(current,{now});validateSnapshot(prior,{now})
 if(current.symbol!==prior.symbol||Date.parse(prior.fetchedAt)>=Date.parse(current.fetchedAt)||current.coverageScope!==prior.coverageScope||current.expiry!==prior.expiry)throw Error('Noncomparable snapshot identity/window')
 const old=new Map(prior.contracts.map(c=>[c.symbol,c]));const differentDay=marketDate(new Date(current.fetchedAt))!==marketDate(new Date(prior.fetchedAt))
 return current.contracts.map(c=>{const p=old.get(c.symbol);const sameSession=p&&iso(c.quoteTime)&&iso(p.quoteTime)&&eastern(Date.parse(c.quoteTime)).date===eastern(Date.parse(p.quoteTime)).date&&sessionAt(Date.parse(c.quoteTime))==='REGULAR'&&sessionAt(Date.parse(p.quoteTime))==='REGULAR'
  const deliverable=p&&c.sharesPerContract===100&&p.sharesPerContract===100
  const ivComparable=deliverable&&sameSession&&Date.parse(current.fetchedAt)-Date.parse(c.quoteTime)<=60000&&Date.parse(prior.fetchedAt)-Date.parse(p.quoteTime)<=60000&&Date.parse(c.quoteTime)>Date.parse(p.quoteTime)&&Date.parse(c.quoteTime)<=Date.parse(current.fetchedAt)+5000&&Date.parse(p.quoteTime)<=Date.parse(prior.fetchedAt)+5000&&Math.abs(Date.parse(c.quoteTime)-Date.parse(p.quoteTime))<=86400000&&['REAL-TIME','DELAYED'].includes(c.quoteTimeframe)&&c.quoteTimeframe===p.quoteTimeframe&&finite(c.iv)&&c.iv>0&&finite(p.iv)&&p.iv>0
  return {contract:c.symbol,oiChange:differentDay&&deliverable&&count(c.openInterest)&&count(p.openInterest)?c.openInterest-p.openInterest:null,ivChange:ivComparable?c.iv-p.iv:null,ivReason:ivComparable?'QUOTE_TIME_PROXY_ONLY':'UNVERIFIED_DELAY_SESSION_OR_TIMING',classification:'MODEL_DERIVED',priorAt:prior.fetchedAt,currentAt:current.fetchedAt,coverage:current.complete&&prior.complete?'MATCHED_CONTRACT_REQUEST_WINDOWS':'PARTIAL_MATCHED_CONTRACTS',limitations:'OI change is versus dated acquisitions, not necessarily exactly one official daily update. IV has no independent provider timestamp; quote times are a comparability proxy, not proof of IV publication time.'}
 })
}
export function gammaResearch(report,{callSign=null,putSign=null,now=Date.now()}={}) {
 const rows=report.rows,spot=report.underlying?.value
 if(!finite(spot)||spot<=0)return {status:'INSUFFICIENT_EVIDENCE',reason:'Missing underlying observation',strikes:[]}
 if(![callSign,putSign].every(v=>v===null||[-1,0,1].includes(v)))throw Error('Invalid hypothetical inventory sign')
 const eligible=rows.filter(c=>finite(c.gamma)&&c.gamma>=0&&count(c.openInterest)&&c.sharesPerContract===100&&iso(c.underlyingTime)&&now<expiryInstant(c.expiry)&&Math.abs(c.underlyingPrice/spot-1)<=.001)
 const contributions=eligible.map(c=>({contract:c.symbol,strike:c.strike,type:c.type,gross:c.gamma*c.openInterest*100*spot*spot*.01}))
 if(!contributions.length)return {status:'INSUFFICIENT_EVIDENCE',reason:'No compatible gamma/OI/100-share inputs',strikes:[]}
 const gross=contributions.reduce((s,c)=>s+c.gross,0)
 if(!Number.isFinite(gross)||!Number.isFinite(gross*1.01**2))return {status:'INSUFFICIENT_EVIDENCE',reason:'Nonfinite gamma aggregate',strikes:[]}
 const signed=callSign===null||putSign===null?null:contributions.reduce((s,c)=>s+c.gross*(c.type==='call'?callSign:putSign),0)
 return {status:eligible.length===rows.length&&report.complete?'MODEL_DERIVED_REQUEST_WINDOW':'MODEL_DERIVED_PARTIAL',classification:'MODEL_DERIVED',gross,signed,callSign,putSign,eligible:eligible.length,observed:rows.length,spot,underlyingTime:report.underlying.time,gammaAsOf:'PROVIDER_GREEKS_TIMESTAMP_UNAVAILABLE',strikes:[...new Set(contributions.map(c=>c.strike))].sort((a,b)=>a-b).map(strike=>({strike,gross:contributions.filter(c=>c.strike===strike).reduce((s,c)=>s+c.gross,0)})),sensitivity:{spotMinus1PctHoldingGammaFixed:gross*.99**2,spotPlus1PctHoldingGammaFixed:gross*1.01**2,allInventoryLong: gross,allInventoryShort:-gross},units:'Approximate dollar delta-notional change per 1% underlying move',formula:'sum(gamma per $1 per share × prior-day OI contracts ×100 shares/contract × S² ×0.01)',limitations:'Gross magnitude only. Dealer inventory and Greek publication time unknown. Signs are user hypotheses, not dealer data. Sensitivity holds gamma/OI fixed; no gamma flip, wall, hedge timing or price forecast is established.'}
}
export function technicalLevels(context,symbol,now=Date.now()) {
 if(!context||context.symbol!==symbol||context.period!=='current'||context.date!==eastern(now).date)return {status:'UNAVAILABLE',levels:[]}
 try {
 const bars=validateBars(symbol,{ticker:symbol,results:context.bars?.data||[]},context.date,{now}),ind=intradayContext(bars)
 const levels=[];const add=(label,value,time,kind)=>{if(finite(value)&&value>0)levels.push({label,value,time,kind,provider:'Massive',symbol})}
 if(context.priorDate===previousSession(context.date)&&Array.isArray(context.previous?.data)){
 const previous=validateBars(symbol,{ticker:symbol,results:context.previous.data},context.priorDate,{daily:true,now})
 if(previous.length===1)for(const [label,key]of [['Prior high','h'],['Prior low','l'],['Prior close','c']])add(label,previous[0][key],new Date(previous[0].t).toISOString(),'DATED_DAILY_REFERENCE')
 }
 for(const [label,value]of [['VWAP',ind.vwap],['EMA9',ind.ema9],['EMA20',ind.ema20],['EMA50',ind.ema50]])add(label,value,ind.lastTimestamp?new Date(ind.lastTimestamp).toISOString():null,'CURRENT_BAR_DERIVED')
 for(const [label,value]of [['Premarket high',ind.sessions.PREMARKET?.high],['Premarket low',ind.sessions.PREMARKET?.low]])add(label,value,ind.sessions.PREMARKET?.timestamp?new Date(ind.sessions.PREMARKET.timestamp).toISOString():null,'PREMARKET_SESSION_REFERENCE')
 return {status:ind.lastTimestamp&&evidenceStatus(ind.lastTimestamp,{now,kind:'MINUTE_AGGREGATE'})==='RECENT_DELAY_UNVERIFIED'?'RECENT_BARS_DELAY_UNVERIFIED':'STALE_OR_UNAVAILABLE',levels,lastBarAt:ind.lastTimestamp,limitations:'Reuses validated bars and existing indicator formulas; aggregate delay is unverified. No automatic trigger confirmation.'}
 }catch{return {status:'INVALID_SOURCE_EVIDENCE',levels:[]}}
}
export function levelScenarios(report,technical) {
 return report.concentrations.slice(0,3).map(c=>{const nearby=technical.levels.filter(l=>Math.abs(l.value/c.level-1)<=.005)
 return {level:c.level,classification:'HYPOTHESIS',interpretation:'INCONCLUSIVE',coverage:report.complete?'REQUEST_WINDOW':'PARTIAL_SAMPLE',evidence:`${c.knownOI} known observed OI at strike ${c.level}${c.missingSides?' (one side missing)':''}; ${nearby.length} technical references within 0.5% (unvalidated proximity heuristic).`,technical:nearby,
 bullish:`Potential breakout/acceleration only after price closes above ${c.level}, holds a retest and remains above a fresh VWAP where available.`,bearish:`Potential rejection/breakdown only after failure to hold ${c.level}, a close below it and below fresh VWAP where available.`,invalidation:`Bullish scenario invalidated by loss of ${c.level}; bearish scenario invalidated by a reclaim above ${c.level}. Neither is confirmed by OI alone.`,limitations:`${technical.status}. Require fresh underlying/bars and live liquidity before evaluating confirmation. Concentrations may instead accompany consolidation; holder direction/hedging pressure unknown. No tested statistical edge.`}
 })
}
