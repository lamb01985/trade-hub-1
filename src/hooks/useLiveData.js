import { useState, useEffect, useRef, useCallback } from 'react'
import { MassiveStream, getLastTrade, getPrevDay, getIntradayBars, getWeeklyData, getHistoricalBars } from '../lib/massive.js'
import { calcVWAP, calcPivots, detectSDZones } from '../lib/levels.js'
import { checkLevelAlerts } from '../lib/alerts.js'
import { todayStr } from '../constants.js'

export function useLiveData(apiKey, ticker = 'QQQ', levelMap = null, settings = {}) {
  const [price, setPrice] = useState(null)
  const [bid, setBid] = useState(null)
  const [ask, setAsk] = useState(null)
  const [connected, setConnected] = useState(false)
  const [wsError, setWsError] = useState(null)

  // Computed from REST
  const [vwapData, setVwapData] = useState(null)
  const [prevDay, setPrevDay] = useState(null)
  const [weeklyData, setWeeklyData] = useState(null)
  const [pivots, setPivots] = useState(null)
  const [sdZones, setSdZones] = useState([])
  const [loadingContext, setLoadingContext] = useState(false)
  const [contextError, setContextError] = useState(null)
  const [lastAlerts, setLastAlerts] = useState([])

  const streamRef = useRef(null)
  const vwapBarsRef = useRef([]) // Accumulate bars for VWAP
  const priceRef = useRef(null)

  // ── WebSocket connection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !ticker) return

    const stream = new MassiveStream(apiKey, {
      onConnected: () => {
        setConnected(true)
        setWsError(null)
        stream.subscribe(ticker)
      },
      onDisconnected: () => setConnected(false),
      onError: (msg) => { setWsError(msg); setConnected(false) },
      onTrade: ({ ticker: sym, price: p }) => {
        if (sym !== ticker) return
        priceRef.current = p
        setPrice(p)
        // Update VWAP with new trade (simple approach: re-use bar data)
      },
      onQuote: ({ ticker: sym, bid: b, ask: a }) => {
        if (sym !== ticker) return
        setBid(b)
        setAsk(a)
      },
    })

    stream.connect()
    streamRef.current = stream

    return () => {
      stream.disconnect()
      streamRef.current = null
    }
  }, [apiKey, ticker])

  // ── Alert checking on price update ─────────────────────────────────────────
  useEffect(() => {
    if (!price || !levelMap?.levels?.length) return
    const fired = checkLevelAlerts(price, levelMap.levels, settings)
    if (fired.length) setLastAlerts(prev => [...fired, ...prev].slice(0, 20))
  }, [price, levelMap, settings])

  // ── REST: load market context (VWAP, prev day, weekly, pivots, S/D zones) ──
  const loadContext = useCallback(async () => {
    if (!apiKey || !ticker) return
    setLoadingContext(true)
    setContextError(null)

    try {
      const [intradayBars, pd, wd, histBars] = await Promise.all([
        getIntradayBars(apiKey, ticker, 1, 'minute').catch(() => []),
        getPrevDay(apiKey, ticker).catch(() => null),
        getWeeklyData(apiKey, ticker).catch(() => null),
        getHistoricalBars(apiKey, ticker, 25).catch(() => []),
      ])

      vwapBarsRef.current = intradayBars
      const vwap = calcVWAP(intradayBars)
      setVwapData(vwap)
      setPrevDay(pd)
      setWeeklyData(wd)

      if (pd) {
        const p = calcPivots(pd.high, pd.low, pd.close)
        setPivots(p)
      }

      const zones = detectSDZones(histBars)
      setSdZones(zones)
    } catch (e) {
      setContextError(e.message)
    } finally {
      setLoadingContext(false)
    }
  }, [apiKey, ticker])

  // Load context on mount and refresh every 5 min (VWAP needs frequent refresh)
  useEffect(() => {
    if (!apiKey) return
    loadContext()
    const interval = setInterval(loadContext, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadContext])

  // Fallback REST poll for price if WebSocket fails
  useEffect(() => {
    if (connected || !apiKey) return
    const poll = async () => {
      try {
        const p = await getLastTrade(apiKey, ticker)
        if (p) setPrice(p)
      } catch {}
    }
    poll()
    const iv = setInterval(poll, 10000)
    return () => clearInterval(iv)
  }, [connected, apiKey, ticker])

  return {
    price,
    bid,
    ask,
    connected,
    wsError,
    vwapData,
    prevDay,
    weeklyData,
    pivots,
    sdZones,
    loadingContext,
    contextError,
    lastAlerts,
    refreshContext: loadContext,
  }
}
