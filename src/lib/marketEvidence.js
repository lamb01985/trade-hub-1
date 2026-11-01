import { MARKET_HOLIDAYS_2026 } from '../constants.js'
import { computeEMA } from './indicators.js'
import { normalizeTradeTimestamp } from './quoteQuality.js'

export const DESK_SYMBOLS = ['QQQ','SPY','IWM','NVDA','AMD','MU','PLTR','TSLA','ORCL','CRWV','VIX']
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
  return {symbol,instrumentType:instrumentType(symbol),provider:'Massive',trade,quote}
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
