import { useEffect, useState } from 'react'
import { eastern } from '../lib/marketEvidence.js'

async function request(params, signal) {
  const response = await fetch(`/api/desk?${new URLSearchParams(params)}`, {cache:'no-store',signal})
  if (response.headers.get('X-TradeHub-Auth-Required') === 'true') window.dispatchEvent(new Event('tradehub-operator-expired'))
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Market data unavailable')
  return data
}
function usePolling(params, interval, refresh) {
  const key = JSON.stringify(params)
  const [state, setState] = useState({key:null,data:null,error:null,loading:true})
  useEffect(() => {
    let active = true, timer
    const controller = new AbortController()
    setState({key,data:null,error:null,loading:true})
    async function load() {
      const deadline = new AbortController()
      const abort = () => deadline.abort()
      controller.signal.addEventListener('abort',abort,{once:true})
      const timeout = setTimeout(abort,45000)
      let delay = interval
      try {
        const data = await request(JSON.parse(key), deadline.signal)
        if (active) setState({key,data,error:null,loading:false})
        if (data.stocks?.error === 'RATE_LIMITED' || data.bars?.error === 'RATE_LIMITED') delay = Math.max(delay,60000)
      } catch(error) {
        if (active) setState({key,data:null,error:deadline.signal.aborted?'Refresh timed out':error.message,loading:false})
        delay = Math.max(delay,60000)
      } finally {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort',abort)
        if (active) timer=setTimeout(load,delay)
      }
    }
    load()
    return () => { active=false;controller.abort();clearTimeout(timer) }
  }, [key,interval,refresh])
  return state.key===key ? state : {data:null,error:null,loading:true}
}
export function useDeskMarketData(symbol, period, refresh = 0) {
  const [now,setNow] = useState(Date.now())
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  const feed = usePolling({action:'watchlist'},30000,refresh)
  // Date is part of identity: bars cannot persist across the Eastern midnight rollover.
  const context = usePolling({action:'context',symbol,period,date:eastern(now).date},60000,refresh)
  return {feed,context,now}
}
