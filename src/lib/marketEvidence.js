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
  const trade=observation(symbol,'TRADE',raw.lastTrade?.p,raw.lastTrade?.t,{exchange:raw.lastTrade?.x??null,timeframe:raw.lastTrade?.timeframe||'UNVERIFIED'})
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

export function chicagoDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))
}
export function planningSessionDate(now = Date.now()) {
  const p=eastern(now)
  const close=['2026-11-27','2026-12-24'].includes(p.date)?780:960
  let date=p.date
  if (sessionAt(now)==='CALENDAR_UNVERIFIED') return null
  if (!['Sat','Sun'].includes(p.weekday)&&!MARKET_HOLIDAYS_2026[date]&&p.minute<close+15) return date
  do {date=new Date(Date.parse(`${date}T12:00:00Z`)+86400000).toISOString().slice(0,10)}
  while(['Sat','Sun'].includes(eastern(Date.parse(`${date}T12:00:00Z`)).weekday)||MARKET_HOLIDAYS_2026[date])
  return date.startsWith('2026-')?date:null
}

// Current planning map always owns the prior bar for its target session.
// Completed-session indicators/extended references keep their own explicit date.
export function planningStructure(context) {
  const base=deskStructure(context)
  const ind=context?.indicators, past=context?.completedIndicators, date=context?.priorDate
  const extras=[]
  function add(price,label,sourceDate,kind) {
    if(Number.isFinite(price)&&price>0)extras.push({price,label,type:kind,sourceDate,kind})
  }
  for(const period of [9,20,50])add(ind?.[`ema${period}`],`EMA${period}`,context?.date,'current-indicator')
  const ah=past?.sessions?.AFTER_HOURS
  add(ah?.high,`Prior after-hours high (${date})`,date,'extended-reference')
  add(ah?.low,`Prior after-hours low (${date})`,date,'extended-reference')
  add(ah?.last,`Prior after-hours last (${date})`,date,'extended-reference')
  add(past?.vwap,`Prior RTH VWAP (${date})`,date,'historical-indicator')
  for(const period of [9,20,50])add(past?.[`ema${period}`],`Prior EMA${period} (${date})`,date,'historical-indicator')
  const levels=[...base.levelMap.levels.map(l=>({...l,sourceDate:['structure','pivot','pivot-r','pivot-s'].includes(l.type)?date:context?.date})),...extras].sort((a,b)=>b.price-a.price)
  const scenarios=base.scenarios.map(s=>({...s,target:s.boundary==null?null:levels.filter(l=>s.side==='Bullish'?l.price>s.boundary:l.price<s.boundary).sort((a,b)=>s.side==='Bullish'?a.price-b.price:b.price-a.price)[0]??null}))
  // Only clusters of actual observed/calculated references, with no invented band padding.
  const tolerance=base.previous?.close>0?base.previous.close*0.0005:null
  const clusters=[]
  for(const level of [...levels].sort((a,b)=>a.price-b.price)) {
    const group=clusters.at(-1)
    if(group&&tolerance!=null&&level.price-group.low<=tolerance){group.high=level.price;group.labels.push(level.label)}
    else clusters.push({low:level.price,high:level.price,labels:[level.label]})
  }
  return {...base,scenarios,levelMap:{...base.levelMap,levels},zones:clusters.filter(g=>g.labels.length>1),zoneTolerance:tolerance}
}

// Current-session map: canonical bars own every dynamic calculation. A fresh
// quote never promotes another date's indicators into today's structure.
export function currentLevelStructure(context,price,now=Date.now()) {
  if(context?.period==='plan')return planningStructure(context)
  const valid=context?.period==='current'&&context.date===eastern(now).date
  const base=planningStructure(valid?context:null)
  const regular=valid?context.indicators?.sessions?.REGULAR:null
  const extra=(regular?[{price:regular.high,label:'Current session high',type:'current-range',sourceDate:context.date},{price:regular.low,label:'Current session low',type:'current-range',sourceDate:context.date}]:[]).filter(l=>positive(l.price))
  const levels=[...base.levelMap.levels,...extra].sort((a,b)=>b.price-a.price)
  const located=Number.isFinite(price)&&price>0
  const nearest=(up)=>located?levels.filter(l=>up?l.price>price:l.price<price).sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price)):[]
  const resistance=nearest(true),support=nearest(false)
  const last=context?.bars?.data?.at(-1)
  const lastStatus=evidenceStatus(last?.timestamp??last?.t,{now,kind:'MINUTE_AGGREGATE',timeframe:last?.timeframe})
  const lastTime=normalizeTradeTimestamp(last?.timestamp??last?.t)
  const currentBars=valid&&!context.bars?.error&&last?.symbol===context.symbol&&last?.session===sessionAt(now)&&lastTime!=null&&eastern(lastTime).date===context.date&&['RECENT','RECENT_DELAY_UNVERIFIED','DELAYED'].includes(lastStatus)
  const scenarios=base.scenarios.map((s,i)=>{const refs=i===0?resistance:support;return {...s,boundary:currentBars?refs[0]?.price??null:null,target:currentBars?refs.find(l=>i===0?l.price>refs[0]?.price:l.price<refs[0]?.price)??null:null}})
  const groups=[]
  for(const l of [...levels].sort((a,b)=>a.price-b.price)){const g=groups.at(-1);if(g&&base.zoneTolerance!=null&&l.price-g.low<=base.zoneTolerance){g.high=l.price;g.labels.push(l.label)}else groups.push({low:l.price,high:l.price,labels:[l.label]})}
  return {...base,scenarios,zones:groups.filter(g=>g.labels.length>1),levelMap:{...base.levelMap,levels},support:support.slice(0,5),resistance:resistance.slice(0,5),currentBarsAvailable:!!currentBars}
}
export function verifiedAlertInputs(row,context,now=Date.now()) {
  if(sessionAt(now)!=='REGULAR'||row?.trade?.symbol!==row?.symbol||!positive(row?.trade?.price)||row?.trade?.kind!=='TRADE'||row?.trade?.session!=='REGULAR'||row?.error||row?.trade?.error)return false
  if(evidenceStatus(row.trade.timestamp,{now,timeframe:row.trade.timeframe})!=='RECENT')return false
  if(context?.period!=='current'||context.symbol!==row.symbol||context.date!==eastern(now).date||context.bars?.error)return false
  const bar=context.bars?.data?.at(-1)
  return bar?.symbol===row.symbol&&bar.session==='REGULAR'&&evidenceStatus(bar.timestamp??bar.t,{now,kind:'MINUTE_AGGREGATE',timeframe:bar.timeframe})==='RECENT'
}
