import {daysToExpiry, marketDate, validateOptionIdentity} from './optionSnapshot.js'
import {expiryInstant} from './optionsScenario.js'
import {evidenceStatus, sessionAt, eastern} from './marketEvidence.js'
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const count=n=>finite(n)&&n>=0&&Number.isInteger(n)
export const DEFAULT_FILTERS={maxSpreadPct:15,minVolume:10,minOI:50,minDelta:.2,maxDelta:.8,minDte:1,maxDte:60,minIV:.01,maxIV:5,maxAbsTheta:100}
export function quoteHealth(c,now=Date.now()) {
  if (!(finite(c.bid)&&finite(c.ask)&&c.bid>0&&c.ask>=c.bid)) return 'MISSING_OR_INVALID_QUOTE'
  return evidenceStatus(c.quoteTime?Date.parse(c.quoteTime):null,{now,timeframe:c.quoteTimeframe,kind:'OPTION_QUOTE'})
}
export function exclusions(c,filters=DEFAULT_FILTERS,now=Date.now()) {
 const f={...DEFAULT_FILTERS,...filters},why=[]
 if(!Object.values(f).every(finite)||f.maxSpreadPct<0||f.maxSpreadPct>100||f.minVolume<0||f.minOI<0||f.minDelta<0||f.maxDelta>1||f.minDelta>f.maxDelta||f.minDte<0||f.maxDte>730||f.minDte>f.maxDte||f.minIV<=0||f.maxIV>5||f.minIV>f.maxIV||f.maxAbsTheta<0)return ['Invalid filter bounds']
 try{validateOptionIdentity({details:{ticker:c.symbol,strike_price:c.strike,expiration_date:c.expiry,contract_type:c.type}},c.underlying)}catch{why.push('Invalid identity')}
 if(c.expiry<marketDate(new Date(now)))why.push('Expired contract')
 if(c.sharesPerContract!==100)why.push('Nonstandard or unverified deliverable')
 if(quoteHealth(c,now)!=='RECENT')why.push(quoteHealth(c,now))
 if(!finite(c.spreadPct)||c.spreadPct>f.maxSpreadPct)why.push('Spread exceeds limit or missing')
 if(!count(c.volume)||c.volume<f.minVolume)why.push('Volume below limit or missing')
 if(!count(c.openInterest)||c.openInterest<f.minOI)why.push('OI below limit or missing')
 if(!finite(c.delta)||Math.abs(c.delta)<f.minDelta||Math.abs(c.delta)>f.maxDelta)why.push('Delta outside range or missing')
 if(c.exerciseStyle!=='american')why.push('Unverified American exercise style')
 if(!finite(c.gamma)||c.gamma<0||!finite(c.theta)||!finite(c.vega)||c.vega<0||!finite(c.iv)||c.iv<=0||c.iv>5)why.push('Missing or invalid model inputs')
 if(finite(c.iv)&&(c.iv<f.minIV||c.iv>f.maxIV))why.push('IV outside configured range')
 if(finite(c.theta)&&Math.abs(c.theta)>f.maxAbsTheta)why.push('Theta exceeds configured per-share/day limit')
 const dte=daysToExpiry(c.expiry,new Date(now));if(dte<f.minDte||dte>f.maxDte)why.push('Outside time horizon')
 if(!finite(c.underlyingPrice)||c.underlyingPrice<=0||evidenceStatus(c.underlyingTime?Date.parse(c.underlyingTime):null,{now,timeframe:c.underlyingTimeframe,kind:'TRADE'})!=='RECENT')why.push('Underlying freshness/delay unverified')
 return why
}
function total(rows,key){return rows.length>0&&rows.every(c=>count(c[key]))?rows.reduce((n,c)=>n+c[key],0):null}
export function summarize(chain,{expiry,now=Date.now(),filters={},target=null,history=null}={}) {
 const rows=chain.contracts.filter(c=>!expiry||c.expiry===expiry),calls=rows.filter(c=>c.type==='call'),puts=rows.filter(c=>c.type==='put')
 const ratio=key=>{const a=total(puts,key),b=total(calls,key);return a!=null&&b>0?a/b:null}
 const underlying=rows.filter(c=>finite(c.underlyingPrice)&&c.underlyingPrice>0&&c.underlyingTime).sort((a,b)=>Date.parse(b.underlyingTime)-Date.parse(a.underlyingTime))[0]
 const S=underlying?.underlyingPrice??null
 const strikes=[...new Set(rows.map(c=>c.strike))].sort((a,b)=>a-b).map(strike=>({strike,callOI:total(calls.filter(c=>c.strike===strike),'openInterest'),putOI:total(puts.filter(c=>c.strike===strike),'openInterest'),callVolume:total(calls.filter(c=>c.strike===strike),'volume'),putVolume:total(puts.filter(c=>c.strike===strike),'volume')}))
 const nearest=S==null?null:[...strikes].sort((a,b)=>Math.abs(a.strike-S)-Math.abs(b.strike-S))[0]?.strike
 const atm=rows.filter(c=>c.strike===nearest),iv=atm.length===2&&atm.every(c=>finite(c.iv)&&c.iv>0)?atm.reduce((s,c)=>s+c.iv,0)/2:null
 const dte=expiry?daysToExpiry(expiry,new Date(now)):null
 const move=iv!=null&&dte!=null?S*iv*Math.sqrt(Math.max(0,expiryInstant(expiry)-now)/(365*86400000)):null
 const evaluated=rows.map(c=>({contract:c,reasons:exclusions(c,filters,now),distance:S==null?null:(c.strike/S-1)*100,targetDistance:finite(target)?Math.abs(c.strike-target):null}))
 const candidates=type=>evaluated.filter(r=>r.contract.type===type&&!r.reasons.length).sort((a,b)=>a.contract.spreadPct-b.contract.spreadPct||(a.targetDistance??0)-(b.targetDistance??0)||b.contract.openInterest-a.contract.openInterest||a.contract.symbol.localeCompare(b.contract.symbol)).slice(0,8)
 const activity=volumeOIActivity(rows,now)
 return {rows,underlying:S,underlyingTime:underlying?.underlyingTime??null,session:sessionAt(now),dte,iv,move,strikes,activity,evaluated,bullish:candidates('call'),bearish:candidates('put'),volumeRatio:ratio('volume'),oiRatio:ratio('openInterest'),coverage:chain.complete?'COMPLETE_REQUEST_WINDOW':'PARTIAL_OBSERVED_SAMPLE',topVolume:[...rows].filter(c=>count(c.volume)).sort((a,b)=>b.volume-a.volume).slice(0,5),topOI:[...rows].filter(c=>count(c.openInterest)).sort((a,b)=>b.openInterest-a.openInterest).slice(0,5),fresh:rows.filter(c=>quoteHealth(c,now)==='RECENT').length,
 expiries:[...new Set(chain.contracts.map(c=>c.expiry))].sort().map(expiry=>({expiry,count:chain.contracts.filter(c=>c.expiry===expiry).length,callOI:total(chain.contracts.filter(c=>c.expiry===expiry&&c.type==='call'),'openInterest'),putOI:total(chain.contracts.filter(c=>c.expiry===expiry&&c.type==='put'),'openInterest')}))}
}

export function volumeOIActivity(rows,now=Date.now()){
 return rows.map(c=>{const ratio=count(c.volume)&&count(c.openInterest)&&c.openInterest>0?c.volume/c.openInterest:null
  // History is reserved for independently acquired, dated comparable observations.
  return {contract:c,ratio,evidence:ratio!=null&&ratio>=2&&c.volume>=100?'LIMITED_VOLUME_VS_OI':'NO_VOLUME_OI_FLAG',health:quoteHealth(c,now),baseline:'UNAVAILABLE_NO_VERIFIED_HISTORY',explanation:ratio!=null?`${c.volume} observed session volume / ${c.openInterest} prior-day OI = ${ratio.toFixed(2)}. OI and volume have different observation periods.`:'Volume/OI unavailable: missing or zero OI is not a baseline.',limits:'No trade direction, institution identity or opening/closing evidence. Confirm only that the anomaly persists with a comparable dated baseline and fresh quotes. Invalidate this flag if a source correction, stale observation or changed contract identity breaks comparability. Monitor next-session OI and volume separately; concentration alone does not confirm direction.'}}).filter(r=>r.evidence!=='NO_VOLUME_OI_FLAG').sort((a,b)=>b.ratio-a.ratio).slice(0,10)
}
