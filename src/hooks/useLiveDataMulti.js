// ─────────────────────────────────────────────────────────────────────────────
// useLiveDataMulti.js — multi-ticker live data hook
//
// Subscribes ONE shared MassiveStream to N tickers, fetches REST context for
// each in parallel, and returns a map { [TICKER]: bundle } where each bundle
// mirrors the shape useLiveData returns for a single ticker.
//
// Designed for the bot's multi-ticker watchlist. The main app still uses
// useLiveData for the focused/active ticker (which carries fuller props like
// customLevels and alert subscriptions). This hook is intentionally lighter:
// no alert engine, no settings dependency, just data.
//
// Lifecycle:
// - One MassiveStream is created per apiKey. The tickers Set is reconciled
//   on every tickers prop change (subscribe new, unsubscribe gone).
// - REST context is fetched per ticker on tickers change and refreshed every
//   5 minutes (matches useLiveData cadence).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  MassiveStream,
  getLastTrade,
  getPrevDay,
  getIntradayBars,
  getIntradayBarsForDate,
  priorTradingDayStr,
  getWeeklyData,
  getHistoricalBars,
} from '../lib/massive.js'
import {
  calcVWAP,
  calcPivots,
  detectSDZones,
  calcIntradayVolumeProfile,
  calcATR,
  tickSizeFor,
} from '../lib/levels.js'
import { computePreMarketStats } from '../lib/premarket.js'
import { getETMins } from '../constants.js'

function emptyBundle() {
  return {
    price: null,
    bid: null,
    ask: null,
    prevDay: null,
    weeklyData: null,
    pivots: null,
    sdZones: [],
    vwapData: null,
    rvol: null,
    atr: null,
    openPrice: null,
    volProfile: null,
    intradayBars: [],
    isHistoricalFallback: false,
    avgDayVol: null,
    preMarket: null,
  }
}

export function useLiveDataMulti(tickers = []) {
  // Normalize incoming tickers: uppercase, unique, stable.
  const normalized = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const raw of tickers || []) {
      if (!raw) continue
      const t = String(raw).toUpperCase().trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
    return out
  }, [tickers])
  const tickersKey = normalized.join('|')

  const [data, setData] = useState({})
  const [connected, setConnected] = useState(false)
  const [wsError, setWsError] = useState(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [contextError, setContextError] = useState(null)

  const streamRef = useRef(null)
  const subscribedRef = useRef(new Set())

  // ── WebSocket: one shared connection, subscriptions reconciled on tickers
  // change. Stream is created once on mount.
  useEffect(() => {
    if (streamRef.current) return // existing connection survives ticker changes

    const stream = new MassiveStream({
      onConnected: () => {
        setConnected(true)
        setWsError(null)
        // Resubscribe to whatever set we want.
        for (const t of subscribedRef.current) stream.subscribe(t)
      },
      onDisconnected: () => setConnected(false),
      onError: (msg) => { setWsError(msg); setConnected(false) },
      onTrade: ({ ticker: sym, price: p }) => {
        if (p == null) return
        setData(prev => {
          const cur = prev[sym] || emptyBundle()
          return { ...prev, [sym]: { ...cur, price: p } }
        })
      },
      onQuote: ({ ticker: sym, bid: b, ask: a }) => {
        setData(prev => {
          const cur = prev[sym] || emptyBundle()
          return { ...prev, [sym]: { ...cur, bid: b, ask: a } }
        })
      },
    })
    stream.connect()
    streamRef.current = stream

    return () => {
      stream.disconnect()
      streamRef.current = null
      subscribedRef.current = new Set()
    }
  }, [])

  // ── Subscription reconciliation: add new tickers, drop removed ones.
  useEffect(() => {
    const stream = streamRef.current
    const want = new Set(normalized)
    const have = subscribedRef.current

    // Subscribe new
    for (const t of want) {
      if (!have.has(t)) {
        stream?.subscribe(t)
        have.add(t)
      }
    }
    // Unsubscribe gone
    for (const t of Array.from(have)) {
      if (!want.has(t)) {
        stream?.unsubscribe(t)
        have.delete(t)
      }
    }

    // Trim data state so removed tickers don't linger.
    setData(prev => {
      let changed = false
      const next = {}
      for (const k of Object.keys(prev)) {
        if (want.has(k)) next[k] = prev[k]
        else changed = true
      }
      // Seed empty bundles for any newly added tickers so consumers can read
      // without optional-chaining gymnastics.
      for (const t of want) {
        if (!next[t]) { next[t] = emptyBundle(); changed = true }
      }
      return changed ? next : prev
    })
  }, [tickersKey, normalized])

  // ── REST context per ticker, parallel. Mirrors useLiveData's loadContext.
  const loadContext = useCallback(async () => {
    if (normalized.length === 0) return
    setLoadingContext(true)
    setContextError(null)
    try {
      await Promise.all(normalized.map(async (ticker) => {
        try {
          const [intradayBars, pd, wd, histBars] = await Promise.all([
            getIntradayBars(ticker, 1, 'minute').catch(() => []),
            getPrevDay(ticker).catch(() => null),
            getWeeklyData(ticker).catch(() => null),
            getHistoricalBars(ticker, 25).catch(() => []),
          ])

          let bars = intradayBars
          let isHistoricalFallback = false
          if (!bars.length) {
            const fallback = await getIntradayBarsForDate(ticker, priorTradingDayStr()).catch(() => [])
            bars = fallback
            isHistoricalFallback = fallback.length > 0
          }

          const vwap = calcVWAP(bars)
          const pivots = pd ? calcPivots(pd.high, pd.low, pd.close) : null
          const zones = detectSDZones(histBars)
          const openPrice = bars.length > 0 ? bars[0].o : null
          const atr = calcATR(histBars)
          const refPrice = bars[0]?.c || pd?.close
          const tick = tickSizeFor(refPrice)
          const volProfile = calcIntradayVolumeProfile(bars, tick)
          const preMarket = computePreMarketStats(bars, pd?.close)

          const sessionVol = bars.reduce((s, b) => s + (b.v || 0), 0)
          const avgDV = histBars.length > 0
            ? histBars.reduce((s, b) => s + (b.v || 0), 0) / histBars.length
            : 0
          const avgDayVol = avgDV > 0 ? avgDV : null
          const minsElapsed = Math.max(1, getETMins() - 570)
          const rvol = avgDV > 0 ? sessionVol / (avgDV * minsElapsed / 390) : null

          setData(prev => {
            const cur = prev[ticker] || emptyBundle()
            return {
              ...prev,
              [ticker]: {
                ...cur,
                prevDay: pd,
                weeklyData: wd,
                pivots,
                sdZones: zones,
                vwapData: vwap,
                rvol,
                atr,
                openPrice,
                volProfile,
                intradayBars: bars,
                isHistoricalFallback,
                avgDayVol,
                preMarket,
              },
            }
          })
        } catch (e) {
          // Per-ticker failure does not poison the rest.
        }
      }))
    } catch (e) {
      setContextError(e.message)
    } finally {
      setLoadingContext(false)
    }
  }, [tickersKey])

  useEffect(() => {
    loadContext()
    const iv = setInterval(loadContext, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [loadContext])

  // ── REST poll fallback for price if WebSocket is down.
  useEffect(() => {
    if (connected || normalized.length === 0) return
    let cancelled = false
    const poll = async () => {
      await Promise.all(normalized.map(async (ticker) => {
        try {
          const p = await getLastTrade(ticker)
          if (cancelled) return
          if (p != null) {
            setData(prev => {
              const cur = prev[ticker] || emptyBundle()
              return { ...prev, [ticker]: { ...cur, price: p } }
            })
          }
        } catch {}
      }))
    }
    poll()
    const iv = setInterval(poll, 10000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [connected, tickersKey])

  return {
    data,
    connected,
    wsError,
    loadingContext,
    contextError,
    refreshContext: loadContext,
  }
}
