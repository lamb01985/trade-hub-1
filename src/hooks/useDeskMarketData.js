import { useEffect, useState } from 'react'
import { eastern, planningSessionDate } from '../lib/marketEvidence.js'

async function request(params, signal) {
  const response = await fetch(`/api/desk?${new URLSearchParams(params)}`, {cache:'no-store',signal})
  if (response.headers.get('X-TradeHub-Auth-Required') === 'true') window.dispatchEvent(new Event('tradehub-operator-expired'))
  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.error || 'Market data unavailable')
    const hint = response.headers.get('Retry-After')
    if (hint !== null) error.retryAfter = /^\d+$/.test(hint) ? Number(hint) : NaN
    throw error
  }
  return data
}
function usePolling(params, interval, refresh) {
  const key = JSON.stringify(params)
  const [state, setState] = useState({key:null,data:null,error:null,loading:true,retryAt:null})
  useEffect(() => {
    let active = true, timer
    const controller = new AbortController()
    setState({key,data:null,error:null,loading:true,retryAt:null})
    async function load() {
      const deadline = new AbortController()
      const abort = () => deadline.abort()
      controller.signal.addEventListener('abort',abort,{once:true})
      const timeout = setTimeout(abort,45000)
      let delay = interval, paused = false
      function backoff(hints) {
        for (const hint of hints.filter(value=>value!==undefined)) {
          if (!Number.isInteger(hint) || hint < 1 || hint > 86400) paused = true
          else delay = Math.max(delay,hint*1000)
        }
      }
      try {
        const data = await request(JSON.parse(key), deadline.signal)
        const parts = [data.stocks,data.vix,data.bars,data.previous,data.completed].filter(Boolean)
        if (parts.some(part=>part.error==='RATE_LIMITED')) delay = Math.max(delay,60000)
        backoff(parts.map(part=>part.retryAfter))
        if (active) setState({key,data:paused?null:data,error:paused?'Automatic refresh paused: invalid provider retry time. Check Data Health before retrying manually.':null,loading:false,retryAt:!paused && parts.some(part=>part.error==='RATE_LIMITED'||part.retryAfter!==undefined)?Date.now()+delay:null})
      } catch(error) {
        delay = Math.max(delay,60000)
        backoff([error.retryAfter])
        if (active) setState({key,data:null,error:paused?'Automatic refresh paused: invalid provider retry time. Check Data Health before retrying manually.':deadline.signal.aborted?'Refresh timed out':error.message,loading:false,retryAt:paused?null:Date.now()+delay})
      } finally {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort',abort)
        if (active && !paused) timer=setTimeout(load,delay)
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
  const context = usePolling({action:'context',symbol,period,date:period==='plan'?planningSessionDate(now):eastern(now).date},60000,refresh)
  return {feed,context,now}
}
