import { useEffect, useRef, useState } from 'react'
import { assertMarketDataEnvelope } from '../lib/marketDataContract.js'
export function useMarketData(resource, symbol, { enabled = true, from, to, sessionEpoch = 0 } = {}) {
  const generation = useRef(0)
  const key = JSON.stringify([resource,symbol,from,to,sessionEpoch])
  const [state,setState] = useState({key:null,envelope:null,error:null,loading:true,receivedAt:null})
  useEffect(() => {
    const id = ++generation.current
    let stopped = false, timer, attemptController, deadlineTimer
    const current = () => !stopped && id === generation.current
    setState({key,envelope:null,error:null,loading:enabled,receivedAt:null})
    if (!enabled) return
    if (resource !== 'capabilities' && !['QQQ','SPY','IWM'].includes(symbol)) {
      setState({key,envelope:null,error:'UNSUPPORTED_INSTRUMENT',loading:false,receivedAt:null})
      return
    }
    async function load() {
      attemptController = new AbortController()
      const request = attemptController
      let timedOut = false
      try {
        const query = new URLSearchParams(resource === 'capabilities' ? {} : {symbol})
        if (resource === 'bars') { query.set('interval','1m'); query.set('from',from); query.set('to',to) }
        const operation = async () => {
          const response = await fetch(`/api/market/${resource}?${query}`,{credentials:'same-origin',cache:'no-store',signal:request.signal})
          if (!current() || request.signal.aborted) return null
          if (response.headers.get('X-TradeHub-Auth-Required') === 'true') {
            stopped = true
            request.abort()
            setState({key,envelope:null,error:'OPERATOR_AUTH_REQUIRED',loading:false,receivedAt:null})
            window.dispatchEvent(new Event('tradehub-operator-expired'))
            return null
          }
          const envelope = assertMarketDataEnvelope(await response.json(),{resource,symbol:resource === 'capabilities' ? undefined : symbol})
          return {response,envelope}
        }
        const deadline = new Promise((_,reject) => { deadlineTimer = setTimeout(() => {timedOut=true;request.abort();reject(new Error('REFRESH_TIMEOUT'))},35000) })
        const result = await Promise.race([operation(),deadline])
        if (!result || !current() || request.signal.aborted) return
        const {response,envelope} = result
        // Explicit provider denial is evidence, never an operator logout.
        setState({key,envelope,error:envelope.error?.code || null,loading:false,receivedAt:performance.now(),unifiedEnabled:response.headers.get('X-Market-Data-Unified-Enabled') === 'true',ready:response.headers.get('X-Market-Data-Ready') === 'true',modeKnown:response.headers.get('X-Market-Data-Unified-Enabled') !== null,previewOnly:response.headers.get('X-Market-Data-Preview-Only') === 'true'})
      } catch (error) {
        if (!current() || (request.signal.aborted && !timedOut)) return
        setState({key,envelope:null,error:timedOut ? 'REFRESH_TIMEOUT' : error.message,loading:false,receivedAt:null})
      } finally { clearTimeout(deadlineTimer) }
      if (current() && resource !== 'capabilities') timer = setTimeout(load,resource === 'bars' ? 60000 : 10000)
    }
    load()
    return () => { stopped=true; ++generation.current; attemptController?.abort(); clearTimeout(timer); clearTimeout(deadlineTimer) }
  },[key,enabled])
  return state.key === key ? state : {envelope:null,error:null,loading:enabled,receivedAt:null}
}
