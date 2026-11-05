import { polygonFetch } from './_lib/polygon.js'
import { providerOperator, providerQuota } from './_lib/providerAccess.js'
import { sendFailure, AccessError, privateResponse, requireOperator, login, logout, jsonBody } from './_lib/access.js'
import { DESK_SYMBOLS, stockEvidence, observation, sessionAt, previousSession, validateBars, intradayContext, instrumentType, latestCompletedSession, planningSessionDate, levelMapSessionDate } from '../src/lib/marketEvidence.js'

async function read(path, params={}) {
  const r=await polygonFetch(path,params)
  const d=JSON.parse(r.body)
  if(r.status!==200 || ['ERROR','NOT_AUTHORIZED'].includes(d.status)) {
    const error = new AccessError(r.status===200?502:r.status, r.status===401?'PROVIDER_KEY_REJECTED':r.status===403?'NOT_ENTITLED':r.status===429?'RATE_LIMITED':'PROVIDER_ERROR')
    if (r.status === 429 && r.retryAfter !== undefined) error.retryAfter = Number(r.retryAfter)
    throw error
  }
  return d
}
async function attempt(fn) {try{return {data:await fn(),error:null}}catch(e){return {data:null,error:e.code||'UNAVAILABLE',...(e.retryAfter===undefined?{}:{retryAfter:e.retryAfter})}}}
export default async function handler(req,res) {
  try {
    privateResponse(res)
    const authAction=req.query?.action
    if(authAction==='session'&&req.method==='GET') {
      try {await requireOperator(req);return res.status(200).json({authenticated:true})}
      catch(e) {if([401,403].includes(e.status))return res.status(200).json({authenticated:false});throw e}
    }
    if(authAction==='login'&&req.method==='POST') {await login(req,res,jsonBody(req,1024).password);return res.status(200).json({authenticated:true})}
    if(authAction==='logout'&&req.method==='POST') {await logout(req,res);return res.status(200).json({authenticated:false})}
    const operator=await providerOperator(req,res)
    await providerQuota(operator,'rest')
    const {action,symbol,period='current'}=req.query||{}
    if(action==='watchlist') {
      const stocks=await attempt(async()=>{
        const d=await read('/v2/snapshot/locale/us/markets/stocks/tickers',{tickers:DESK_SYMBOLS.filter(s=>s!=='VIX').join(',')})
        if(!Array.isArray(d.tickers)) throw new Error('INVALID_SNAPSHOT')
        return DESK_SYMBOLS.filter(s=>s!=='VIX').map(s=>{const raw=d.tickers.find(r=>r.ticker===s);return raw?stockEvidence(s,raw):{symbol:s,instrumentType:instrumentType(s),error:'NOT_SUPPLIED'}})
      })
      const vix=await attempt(async()=>{
        const d=await read('/v3/snapshot',{ticker:'I:VIX'})
        const r=d.results?.find(r=>r.ticker==='I:VIX')
        if(!r || r.error) throw new Error(r?.error||'NOT_SUPPLIED')
        return {symbol:'VIX',instrumentType:'INDEX',trade:observation('VIX','INDEX_VALUE',r.value,r.last_updated,{timeframe:r.timeframe||'UNVERIFIED'}),quote:null}
      })
      return res.status(200).json({provider:'Massive',fetchedAt:new Date().toISOString(),stocks,vix,futures:{error:'CONTRACT_AND_ENTITLEMENT_UNVERIFIED',note:'ES/NQ require entitled futures contracts. No ETF substitution.'}})
    }
    if(action==='context' && DESK_SYMBOLS.includes(symbol) && ['current','completed','plan'].includes(period)) {
      const date=period==='plan'?planningSessionDate():period==='completed'?latestCompletedSession():levelMapSessionDate()
      if (!date) throw new AccessError(503,'CALENDAR_UNVERIFIED')
      const prior=previousSession(date)
      const bars=await attempt(async()=>validateBars(symbol==='VIX'?'I:VIX':symbol,await read(`/v2/aggs/ticker/${symbol==='VIX'?'I:VIX':symbol}/range/1/minute/${date}/${date}`,{adjusted:'true',sort:'asc',limit:'50000'}),date))
      const previous=await attempt(async()=>validateBars(symbol==='VIX'?'I:VIX':symbol,await read(`/v2/aggs/ticker/${symbol==='VIX'?'I:VIX':symbol}/range/1/day/${prior}/${prior}`,{adjusted:'true',sort:'asc',limit:'50'}),prior,{daily:true}))
      const completed = ['plan','current'].includes(period) ? await attempt(async()=>validateBars(symbol==='VIX'?'I:VIX':symbol,await read(`/v2/aggs/ticker/${symbol==='VIX'?'I:VIX':symbol}/range/1/minute/${prior}/${prior}`,{adjusted:'true',sort:'asc',limit:'50000'}),prior)) : null
      const sessionDaily=period==='current'&&sessionAt()==='CLOSED'?await attempt(async()=>validateBars(symbol,await read(`/v2/aggs/ticker/${symbol}/range/1/day/${date}/${date}`,{adjusted:'true',sort:'asc',limit:'50'}),date,{daily:true})):null
      return res.status(200).json({symbol,period,provider:'Massive',date,priorDate:prior,sessionDaily,...(completed?{completed,completedIndicators:completed.data?intradayContext(completed.data):null}:{}),fetchedAt:new Date().toISOString(),bars,previous,indicators:bars.data?intradayContext(bars.data):null})
    }
    throw new AccessError(400,'invalid_desk_request')
  }catch(e){sendFailure(res,e)}
}
