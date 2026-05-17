import { useState, useEffect, useRef, useCallback } from 'react'
import { MassiveStream, getLastTrade, getPrevDay, getIntradayBars, getIntradayBarsForDate, priorTradingDayStr, getWeeklyData, getHistoricalBars } from '../lib/massive.js'
import { calcVWAP, calcPivots, detectSDZones, calcVolumeProfile, calcATR } from '../lib/levels.js'
import { checkLevelAlerts } from '../lib/alerts.js'
import { todayStr, getETMins } from '../constants.js'

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
  const [rvol, setRvol] = useState(null)
  const [atr, setAtr] = useState(null)
  const [openPrice, setOpenPrice] = useState(null)
  const [volProfile, setVolProfile] = useState(null)
  const [intradayBars, setIntradayBars] = useState([])
  const [isHistoricalFallback, setIsHistoricalFallback] = useState(false)
  const [avgDayVol, setAvgDayVol] = useState(null)

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

      // Chart bars: today if available, else prior trading day fallback so the chart is never empty
      if (intradayBars.length) {
        setIntradayBars(intradayBars)
        setIsHistoricalFallback(false)
      } else {
        const fallback = await getIntradayBarsForDate(apiKey, ticker, priorTradingDayStr()).catch(() => [])
        setIntradayBars(fallback)
        setIsHistoricalFallback(fallback.length > 0)
      }
      setPrevDay(pd)
      setWeeklyData(wd)

      if (pd) {
        const p = calcPivots(pd.high, pd.low, pd.close)
        setPivots(p)
      }

      const zones = detectSDZones(histBars)
      setSdZones(zones)

      // Open price (first intraday bar)
      setOpenPrice(intradayBars.length > 0 ? intradayBars[0].o : null)

      // ATR from daily bars
      setAtr(calcATR(histBars))

      // Volume Profile from daily bars
      setVolProfile(calcVolumeProfile(histBars))

      // RVOL: session volume vs projected daily average
      const sessionVol = intradayBars.reduce((s, b) => s + (b.v || 0), 0)
      const avgDV = histBars.length > 0 ? histBars.reduce((s, b) => s + (b.v || 0), 0) / histBars.length : 0
      setAvgDayVol(avgDV > 0 ? avgDV : null)
      const minsElapsed = Math.max(1, getETMins() - 570) // 9:30 ET = 570 mins from midnight
      setRvol(avgDV > 0 ? sessionVol / (avgDV * minsElapsed / 390) : null)
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
    rvol,
    atr,
    openPrice,
    volProfile,
    intradayBars,
    isHistoricalFallback,
    avgDayVol,
  }
}
