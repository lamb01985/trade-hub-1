import {useEffect,useState} from 'react'
import {useDeskMarketData} from './useDeskMarketData.js'
import {currentLevelStructure,verifiedAlertInputs,evidenceStatus,eastern,planningSessionDate} from '../lib/marketEvidence.js'
import {checkLevelAlerts,resetLevelAlerts} from '../lib/alerts.js'
export function useVerifiedPlanning(symbol,settings,period='current') {
  const [refreshToken,setRefreshToken]=useState(0),[lastAlerts,setLastAlerts]=useState([])
  const state=useDeskMarketData(symbol,period,refreshToken)
  const expectedDate=period==='plan'?planningSessionDate(state.now):eastern(state.now).date
  const context=state.context.data?.symbol===symbol&&state.context.data?.period===period&&state.context.data?.date===expectedDate?state.context.data:null
  const structure=currentLevelStructure(context,state.feed.data?.stocks?.data?.find(r=>r.symbol===symbol)?.trade?.price,state.now)
  const row=state.feed.data?.stocks?.data?.find(r=>r.symbol===symbol)
  const quality=evidenceStatus(row?.trade?.timestamp,{now:state.now,timeframe:row?.trade?.timeframe})
  const barQuality=evidenceStatus(context?.indicators?.lastTimestamp,{now:state.now,kind:'MINUTE_AGGREGATE'})
  const eligible=verifiedAlertInputs(row,context,state.now)
  useEffect(()=>{resetLevelAlerts(symbol);setLastAlerts([])},[symbol,eligible,settings.alertsEnabled])
  useEffect(()=>{
    if(!eligible||!settings.alertsEnabled)return
    const fired=checkLevelAlerts(row?.trade?.price,structure.levelMap.levels.filter(l=>!['current-indicator','vwap'].includes(l.type)||barQuality==='RECENT'),{...settings,ticker:symbol})
    if(fired.length)setLastAlerts(prev=>[...fired.map(a=>({...a,symbol,timestamp:row.trade.timestamp})),...prev].slice(0,20))
  },[row?.trade?.price,row?.trade?.timestamp,symbol,eligible,settings.alertsEnabled,context,barQuality])
  const pm=context?.indicators?.sessions?.PREMARKET
  return {...state,contextData:context,structure,row,quality,barQuality,refresh:()=>setRefreshToken(n=>n+1),
    bundle:{verified:true,dataTicker:symbol,price:row?.trade?.price??null,priceTimestamp:row?.trade?.timestamp??null,priceSource:'Massive',bid:row?.quote?.bid??null,ask:row?.quote?.ask??null,quoteTimestamp:row?.quote?.timestamp??null,
      prevDay:structure.previous,pivots:structure.pivots,vwapData:context?.indicators?.vwap!=null?{vwap:context.indicators.vwap}:null,
      intradayBars:context?.bars?.data||[],preMarket:pm?{...pm,active:true}:null,loadingContext:state.context.loading,contextError:state.context.error||context?.previous?.error||context?.bars?.error||null,
      connected:!state.feed.error&&!state.feed.data?.stocks?.error&&quality==='RECENT',lastAlerts,alertEligible:eligible,barQuality,
      refreshContext:()=>setRefreshToken(n=>n+1),planning:context,structure,feedError:state.feed.error||state.feed.data?.stocks?.error||null,now:state.now},
  }
}
