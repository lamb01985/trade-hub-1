import {validateOptionIdentity,providerTime} from './optionSnapshot.js'
import {eastern,sessionAt} from './marketEvidence.js'
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const count=n=>Number.isSafeInteger(n)&&n>=0
export function flowResearch(contract,{trades=null,quotes=null,baseline=null,daily=null,now=Date.now(),largeContracts=100}={}) {
 validateOptionIdentity({details:{ticker:contract.symbol,strike_price:contract.strike,expiration_date:contract.expiry,contract_type:contract.type}},contract.underlying)
 const realDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d
 const envelope=e=>{
  if(!e||e.contract!==contract.symbol||e.provider!=='Massive'||!Number.isFinite(Date.parse(e.fetchedAt))||Date.parse(e.fetchedAt)>now+5000||!Array.isArray(e.results)||e.results.length>1000||typeof e.complete!=='boolean'||!realDay(e.requestedDate))return false
  try{const u=new URL(e.source);if(u.origin!=='https://api.massive.com'||u.username||u.password||u.hash||u.searchParams.has('apiKey'))return false
   if(e.kind==='daily')return realDay(e.range?.start)&&realDay(e.range?.end)&&e.range.start<=e.range.end&&e.range.end<e.requestedDate&&u.pathname===`/v2/aggs/ticker/${contract.symbol}/range/1/day/${e.range.start}/${e.range.end}`
   return ['trades','quotes'].includes(e.kind)&&u.pathname===`/v3/${e.kind}/${contract.symbol}`&&u.searchParams.get('timestamp')===e.requestedDate
  }catch{return false}
 }
 baseline=baseline??daily
 const t=trades&&envelope(trades)&&trades.kind==='trades'?trades:null,q=quotes&&envelope(quotes)&&quotes.kind==='quotes'?quotes:null,b=baseline&&envelope(baseline)&&baseline.kind==='daily'?baseline:null
 const sorted=q?q.results.map(x=>({...x,time:providerTime(x.sip_timestamp)})).filter(x=>x.time&&Date.parse(x.time)<=Date.parse(q.fetchedAt)+5000&&finite(x.bid_price)&&finite(x.ask_price)&&x.bid_price>0&&x.ask_price>x.bid_price&&count(x.bid_size)&&x.bid_size>0&&count(x.ask_size)&&x.ask_size>0).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)):[]
 const conflicts=new Set(sorted.filter((x,i)=>sorted.some((y,j)=>i!==j&&x.time===y.time&&(x.bid_price!==y.bid_price||x.ask_price!==y.ask_price))).map(x=>x.time))
 const validQuotes=sorted
 const ids=new Set()
 const observations=t?t.results.map(x=>{const time=providerTime(x.sip_timestamp),at=time?Date.parse(time):NaN
  if(!finite(x.price)||x.price<=0||!count(x.size)||x.size<=0||!finite(at)||at>Date.parse(t.fetchedAt)+5000||eastern(at).date!==t.requestedDate)return null
  if(x.id!=null){if(ids.has(String(x.id)))return null;ids.add(String(x.id))}
  const aligned=[...validQuotes].reverse().find(quote=>Date.parse(quote.time)<=at&&at-Date.parse(quote.time)<=1000&&eastern(at).date===eastern(Date.parse(quote.time)).date)
  const unambiguous=aligned&&!conflicts.has(aligned.time)
  const clean=Array.isArray(x.conditions)&&x.conditions.length===0&&!x.correction // unfamiliar conditions deliberately unclassified
  let classification='INSUFFICIENT_EVIDENCE',direction='UNCLASSIFIED'
  if(unambiguous&&clean&&sessionAt(at)==='REGULAR'&&sessionAt(Date.parse(aligned.time))==='REGULAR'&&x.price>=aligned.bid_price&&x.price<=aligned.ask_price){classification='MODEL_DERIVED';direction=x.price===aligned.ask_price?'AT_ASK':x.price===aligned.bid_price?'AT_BID':'INSIDE_SPREAD_UNCLASSIFIED'}
  return {contract:contract.symbol,time,size:x.size,price:x.price,notional:contract.sharesPerContract===100?x.price*x.size*100:null,large:x.size>=largeContracts,classification,direction,quoteTime:aligned?.time||null,quoteBid:aligned?.bid_price??null,quoteAsk:aligned?.ask_price??null,conditions:x.conditions??null,exchange:x.exchange??null,tradeId:x.id??null}
 }).filter(Boolean):[]
 // Never average duplicate or current/future daily bars, and never fill absent days with zero.
 const volumeTime=contract.dayTime?Date.parse(contract.dayTime):NaN,day=finite(volumeTime)&&volumeTime<=now+5000?eastern(volumeTime).date:null
 const days=b?b.results.map(r=>({date:providerTime(r.t)?eastern(Date.parse(providerTime(r.t))).date:null,volume:r.v})):[]
 const requestedDay=b?.requestedDate??null
 const validDays=day&&day===requestedDay&&days.length>=5&&days.every(r=>r.date&&r.date<day&&r.date>=b.range.start&&r.date<=b.range.end&&count(r.volume))&&new Set(days.map(r=>r.date)).size===days.length
 const mean=validDays?days.reduce((sum,r)=>sum+r.volume,0)/days.length:null
 const relativeVolume=finite(mean)&&mean>0&&count(contract.volume)?contract.volume/mean:null
 const counts={AT_ASK:0,AT_BID:0,INSIDE_SPREAD_UNCLASSIFIED:0,UNCLASSIFIED:0};for(const r of observations)counts[r.direction]+=r.size
 const clusters=Object.values(observations.reduce((acc,r)=>{const key=r.time.slice(0,16);acc[key]??={minute:key,contracts:0,trades:0};acc[key].contracts+=r.size;acc[key].trades++;return acc},{}))
 const buyer=counts.AT_ASK,seller=counts.AT_BID
 const interpretation=buyer===seller?'INCONCLUSIVE':(contract.type==='call'?buyer>seller:buyer<seller)?'BULLISH_HYPOTHESIS':'BEARISH_HYPOTHESIS'
 return {contract:contract.symbol,status:t?'BOUNDED_TRADE_SAMPLE':'INSUFFICIENT_EVIDENCE',classification:observations.length?'DIRECTLY_OBSERVED':'INSUFFICIENT_EVIDENCE',observations,clusters,counts,large:observations.filter(r=>r.large),relativeVolume,baseline:{numeratorDate:day,requestedDate:requestedDay,range:b?.range??null,observations:validDays?days.length:0,mean,status:relativeVolume==null?'INSUFFICIENT_EVIDENCE':b.complete?'OBSERVED_DAY_MEAN_NOT_ZERO_FILLED':'PARTIAL_OBSERVED_DAY_MEAN',source:b?.source??null},interpretation,coverage:{tradesComplete:t?.complete??false,quotesComplete:q?.complete??false,baselineComplete:b?.complete??false},sources:[t,q,b].filter(Boolean).map(e=>({source:e.source,fetchedAt:e.fetchedAt,requestId:e.requestId??null,complete:e.complete})),method:'Last preceding positive-size noncrossed quote within1000ms in the same regular session; conflicting quotes at the same millisecond are unclassified. Only exact bid/ask touches with explicitly empty conditions and no correction are classified. Inside spread, unknown conditions, outside quote and missing/stale alignment remain unclassified.',limitations:'At-bid/ask is an uncertain aggressor estimate, not institution identity or opening/closing intent. Partial quote/trade samples miss activity. Single prints may be legs of spreads/hedges. Current accumulated session volume versus prior observed daily mean is not adjusted for time of day and is not an expected full-session forecast. Bullish/bearish labels are hypotheses about classified premium activity only; no underlying forecast. Monitor subsequent quote-aligned samples; invalidate on correction, failed alignment or contradictory flow.'}
}
