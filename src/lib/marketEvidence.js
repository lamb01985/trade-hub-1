import { MARKET_HOLIDAYS_2026 } from '../constants.js'
import { calcPivots, buildLevelMap } from './levels.js'
import { computeEMA } from './indicators.js'
import { normalizeTradeTimestamp } from './quoteQuality.js'

export const DESK_SYMBOLS = ['QQQ','SPY','NVDA','AMD','IWM','MU','PLTR','TSLA','ORCL','CRWV','VIX']
export const instrumentType = symbol => (symbol === 'VIX' || symbol.startsWith('I:')) ? 'INDEX' : ['QQQ','SPY','IWM'].includes(symbol) ? 'ETF' : 'EQUITY'
export function eastern(at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(new Date(at))
  const p = key => parts.find(v=>v.type===key)?.value
  return {date:`${p('year')}-${p('month')}-${p('day')}`,minute:Number(p('hour'))*60+Number(p('minute')),weekday:p('weekday')}
}
export function sessionAt(at = Date.now()) {
  const p = eastern(at)
  if (!p.date.startsWith('2026-')) return 'CALENDAR_UNVERIFIED'
  if (['Sat','Sun'].includes(p.weekday) || MARKET_HOLIDAYS_2026[p.date]) return 'CLOSED'
  const close = ['2026-11-27','2026-12-24'].includes(p.date) ? 780 : 960
  const lateEnd = close === 780 ? 1020 : 1200
  return p.minute < 240 || p.minute >= lateEnd ? 'CLOSED' : p.minute < 570 ? 'PREMARKET' : p.minute < close ? 'REGULAR' : 'AFTER_HOURS'
}
export function previousSession(date) {
  let at = Date.parse(`${date}T12:00:00Z`)
  do { at -= 86400000 } while(sessionAt(at)==='CLOSED')
  return eastern(at).date
}
export function evidenceStatus(timestamp, {now=Date.now(),timeframe='UNVERIFIED',kind='TRADE'} = {}) {
  const t = normalizeTradeTimestamp(timestamp)
  if (!t || t > now+5000) return 'TIME_UNVERIFIED'
  if (kind==='DAILY_AGGREGATE') return 'HISTORICAL_REFERENCE'
  if (sessionAt(now)==='CALENDAR_UNVERIFIED') return 'CALENDAR_UNVERIFIED'
  if (kind==='OPTION_QUOTE' && (sessionAt(now)!=='REGULAR' || sessionAt(t)!=='REGULAR')) return 'OPTIONS_SESSION_UNVERIFIED_OR_CLOSED'
  if (sessionAt(now)==='CLOSED') return 'MARKET_CLOSED'
  if (eastern(t).date!==eastern(now).date) return 'PREVIOUS_SESSION'
  if (now-t > (kind==='MINUTE_AGGREGATE' ? 180000 : 60000)) return 'STALE'
  if (/DELAYED/i.test(timeframe)) return 'DELAYED'
  return timeframe==='REAL-TIME' ? 'RECENT' : 'RECENT_DELAY_UNVERIFIED'
}
const positive = n => typeof n==='number' && Number.isFinite(n) && n>0
export function observation(symbol, kind, price, timestamp, extra={}) {
  const t = normalizeTradeTimestamp(timestamp)
  return {symbol,instrumentType:instrumentType(symbol),provider:'Massive',kind,price:positive(price)?price:null,timestamp:t,session:t?sessionAt(t):'UNVERIFIED',timeframe:'UNVERIFIED',error:positive(price)?null:'FIELD_NOT_SUPPLIED',...extra}
}
export function stockEvidence(symbol, raw) {
  if (raw?.ticker!==symbol) throw new Error('INSTRUMENT_MISMATCH')
  const trade=observation(symbol,'TRADE',raw.lastTrade?.p,raw.lastTrade?.t,{exchange:raw.lastTrade?.x??null})
  const q=raw.lastQuote||{}
  const valid=positive(q.p)&&positive(q.P)&&q.p<=q.P
  const quote=observation(symbol,'QUOTE',null,q.t,{price:null,bid:valid?q.p:null,ask:valid?q.P:null,error:valid?null:'QUOTE_NOT_SUPPLIED_OR_INVALID'})
  const updated = normalizeTradeTimestamp(raw.updated)
  const snapshotDate = updated ? eastern(updated).date : null
  const priorDate = snapshotDate ? previousSession(snapshotDate) : null
  const priorClose = positive(raw.prevDay?.c) ? raw.prevDay.c : null
  const sameSession = snapshotDate && trade.timestamp && eastern(trade.timestamp).date === snapshotDate
  const amount = sameSession && trade.price != null && priorClose != null ? trade.price - priorClose : null
  const reference = (field, value, date) => ({symbol, instrumentType:instrumentType(symbol), provider:'Massive', kind:'DAILY_AGGREGATE', field, value:positive(value)?value:null, date, timestamp:null, timeframe:'HISTORICAL_REFERENCE'})
  return {
    symbol,instrumentType:instrumentType(symbol),provider:'Massive',trade,quote,
    spread: valid ? q.P-q.p : null,
    snapshotDate,
    prior: {close:reference('close',raw.prevDay?.c,priorDate),high:reference('high',raw.prevDay?.h,priorDate),low:reference('low',raw.prevDay?.l,priorDate)},
    regularClose: reference('close',raw.day?.c,snapshotDate),
    change: {amount,percent:amount!=null?amount/priorClose*100:null,date:snapshotDate,baselineDate:priorDate,baseline:priorClose,kind:'LAST_TRADE_VS_PRIOR_REGULAR_CLOSE'},
  }
}
export function validateBars(symbol, data, date, {daily=false,now=Date.now()}={}) {
  if (data.ticker!==symbol || !(Array.isArray(data.results) || data.results == null && data.resultsCount === 0) || data.next_url) throw new Error('INVALID_OR_INCOMPLETE_BARS')
  let previous=0
  return (data.results || []).map(b=>{
    if (![b.o,b.h,b.l,b.c].every(positive) || !Number.isFinite(b.v) || b.v<0 || !Number.isSafeInteger(b.t) || b.t<=previous || b.h<Math.max(b.o,b.c,b.l) || b.l>Math.min(b.o,b.c,b.h) || eastern(b.t).date!==date) throw new Error('INVALID_BAR')
    previous=b.t
    if (b.t>now+5000) throw new Error('FUTURE_BAR')
    return {...b,symbol,instrumentType:instrumentType(symbol),provider:'Massive',kind:daily?'DAILY_AGGREGATE':'MINUTE_AGGREGATE',timestamp:b.t,session:daily?'REGULAR':sessionAt(b.t),timeframe:'UNVERIFIED'}
  }).filter(b=>daily || b.t+60000<=now)
}
export function intradayContext(bars) {
  const regular=bars.filter(b=>b.session==='REGULAR')
  const closes=regular.map(b=>b.c)
  const ema=period=>computeEMA(closes,period).at(-1)??null
  const volume=regular.reduce((s,b)=>s+b.v,0)
  // Provider minute VWAP * minute volume, not a fabricated trade-level VWAP.
  const vwap=volume>0 && regular.every(b=>Number.isFinite(b.vw)&&b.vw>0) ? regular.reduce((s,b)=>s+b.vw*b.v,0)/volume : null
  return {ema9:ema(9),ema20:ema(20),ema50:ema(50),vwap,barCount:regular.length,lastTimestamp:regular.at(-1)?.t??null,
    sessions:Object.fromEntries(['PREMARKET','REGULAR','AFTER_HOURS'].map(s=>{const rows=bars.filter(b=>b.session===s);return [s,rows.length?{last:rows.at(-1).c,high:Math.max(...rows.map(b=>b.h)),low:Math.min(...rows.map(b=>b.l)),timestamp:rows.at(-1).t}:null]}))}
}


export function latestCompletedSession(now = Date.now()) {
  const p = eastern(now)
  const close = ['2026-11-27','2026-12-24'].includes(p.date) ? 780 : 960
  const tradingDay = p.date.startsWith('2026-') && !['Sat','Sun'].includes(p.weekday) && !MARKET_HOLIDAYS_2026[p.date]
  return tradingDay && p.minute>=close+15 ? p.date : previousSession(p.date)
}

// The only bridge to existing trading components. No chart/feed recalculation.
export function deskStructure(context) {
  const pd = context?.previous?.data?.[0]
  const ind = context?.indicators
  const previous = pd ? {high:pd.h,low:pd.l,close:pd.c,date:context.priorDate} : null
  const pivots = pd ? calcPivots(pd.h,pd.l,pd.c) : null
  const pm = ind?.sessions?.PREMARKET
  const custom = pm ? [{price:pm.high,label:'Premarket high'},{price:pm.low,label:'Premarket low'}] : []
  // Passing no current price intentionally omits legacy round-number targets and scores.
  const levelMap = buildLevelMap(null,{prevDay:previous,pivots,vwapData:ind?.vwap!=null?{vwap:ind.vwap}:null,customLevels:custom})
  const upper = pd ? Math.max(pd.h,pm?.high??pd.h) : pm?.high
  const lower = pd ? Math.min(pd.l,pm?.low??pd.l) : pm?.low
  const levels = levelMap.levels
  const bullishTarget = upper != null ? [...levels].filter(l=>l.price>upper).sort((a,b)=>a.price-b.price)[0] : null
  const bearishTarget = lower != null ? [...levels].filter(l=>l.price<lower).sort((a,b)=>b.price-a.price)[0] : null
  const aligned = ind?.ema50 != null ? ind.ema9>ind.ema20&&ind.ema20>ind.ema50?'EMAs aligned up':ind.ema9<ind.ema20&&ind.ema20<ind.ema50?'EMAs aligned down':'Mixed EMA alignment' : 'Trend unavailable — 50 RTH bars required'
  return {
    levelMap,pivots,previous,trend:aligned,
    scenarios: [
      {side:'Bullish',boundary:upper??null,trigger:'A completed 5-minute close above the boundary, then a retest that holds.',invalidation:'A completed 5-minute close back below the boundary.',target:bullishTarget??null},
      {side:'Bearish',boundary:lower??null,trigger:'A completed 5-minute close below the boundary, then a retest that fails.',invalidation:'A completed 5-minute close back above the boundary.',target:bearishTarget??null},
    ],
    chartData: {dataTicker:context?.symbol,intradayBars:context?.bars?.data||[],price:context?.bars?.data?.at(-1)?.c??null,priceTimestamp:context?.bars?.data?.at(-1)?.timestamp??null,prevDay:previous,vwapData:ind?.vwap!=null?{vwap:ind.vwap}:null,isHistoricalFallback:context?.period==='completed'},
  }
}

export function evidenceLabel(observation, now = Date.now()) {
  if (!observation || observation.error) return 'Unavailable'
  const status = evidenceStatus(observation.timestamp,{now,kind:observation.kind,timeframe:observation.timeframe})
  return ({MARKET_CLOSED:'Market closed · recorded',PREVIOUS_SESSION:'Previous session',STALE:'Stale',DELAYED:'Delayed',RECENT:'Recent',RECENT_DELAY_UNVERIFIED:'Recent · delay unverified',TIME_UNVERIFIED:'Timestamp unverified',CALENDAR_UNVERIFIED:'Calendar unverified',OPTIONS_SESSION_UNVERIFIED_OR_CLOSED:'Options closed / session unverified'})[status] || status
}
