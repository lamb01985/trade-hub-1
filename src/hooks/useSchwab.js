// useSchwab — single source of truth for Schwab state in the SPA.
//
// All Schwab calls go through /api/schwab/* which holds the secret and
// tokens server-side (Upstash KV + signed HttpOnly session cookie). The
// browser never sees app_secret or access_token.
//
// Returns: {
//   isConnected, loading, lastError, warning,
//   account, positions, dayTrades,
//   connect(), disconnect(),
//   getQuote(symbol), getChain(symbol, opts), getOrdersToday(),
//   refreshAccount(),
// }
//
// `connect()` navigates to /api/schwab/auth/login which 302s to Schwab
// and back to /api/schwab/auth/callback, which 302s to whatever
// SCHWAB_REDIRECT_AFTER_AUTH points at (typically '/'). The SPA detects
// the `?schwab_connected=1` marker on mount and refreshes account state.

import { useCallback, useEffect, useRef, useState } from 'react'

const ACCOUNT_POLL_MS = 60_000
const CACHE_TTL_MS = 5_000

async function getJson(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts })
  const text = await res.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = { error: text, code: 'BAD_JSON' } }
  }
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`
    const err = new Error(msg)
    err.status = res.status
    err.code = data?.code || 'HTTP_ERROR'
    throw err
  }
  return data
}

export function useSchwab() {
  const [account, setAccount] = useState(null)   // { accountNumber, buyingPower, ... , positions }
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [isConnected, setIsConnected] = useState(false)

  const cacheRef = useRef(new Map())  // key -> { at, value }

  // Pulls /api/schwab/account. Treats NOT_CONNECTED / REFRESH_EXPIRED as
  // "not connected" without surfacing as an error.
  const refreshAccount = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getJson('/api/schwab/account')
      setAccount(data)
      setIsConnected(true)
      setWarning(data.warning || null)
      setLastError(null)
      return data
    } catch (err) {
      if (err.code === 'NOT_CONNECTED' || err.code === 'REFRESH_EXPIRED') {
        setIsConnected(false)
        setAccount(null)
        setWarning(err.code === 'REFRESH_EXPIRED' ? 'Schwab session expired, reconnect required.' : null)
        setLastError(null)
      } else {
        setLastError(err)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // On mount: probe account state once. Re-poll every 60s if connected.
  // Also handle the `?schwab_connected=1` query that the callback redirect
  // appends to mark a fresh successful connection.
  useEffect(() => {
    let alive = true
    let pollId = null

    async function init() {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        if (params.get('schwab_connected')) {
          params.delete('schwab_connected')
          const q = params.toString()
          window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : ''))
        }
        if (params.get('schwab_error')) {
          const code = params.get('schwab_error')
          params.delete('schwab_error')
          const q = params.toString()
          window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : ''))
          setLastError(Object.assign(new Error(`Schwab connect failed: ${code}`), { code }))
        }
      }
      const data = await refreshAccount()
      if (!alive) return
      if (data) {
        pollId = setInterval(() => { if (alive) refreshAccount() }, ACCOUNT_POLL_MS)
      }
    }
    init()
    return () => { alive = false; if (pollId) clearInterval(pollId) }
  }, [refreshAccount])

  // Cached fetch: returns cached value if newer than CACHE_TTL_MS, else
  // hits the network and updates the cache.
  const cachedFetch = useCallback(async (cacheKey, url) => {
    const now = Date.now()
    const hit = cacheRef.current.get(cacheKey)
    if (hit && (now - hit.at) < CACHE_TTL_MS) return hit.value
    const value = await getJson(url)
    cacheRef.current.set(cacheKey, { at: now, value })
    if (value?.warning) setWarning(value.warning)
    return value
  }, [])

  const getQuote = useCallback(async (symbol) => {
    if (!symbol) throw new Error('symbol required')
    const sym = String(symbol).toUpperCase().trim()
    try {
      return await cachedFetch(`q:${sym}`, `/api/schwab/quote?symbol=${encodeURIComponent(sym)}`)
    } catch (err) {
      setLastError(err)
      throw err
    }
  }, [cachedFetch])

  const getChain = useCallback(async (symbol, opts = {}) => {
    if (!symbol) throw new Error('symbol required')
    const sym = String(symbol).toUpperCase().trim()
    const q = new URLSearchParams({ symbol: sym })
    if (opts.expiry) q.set('expiry', opts.expiry)
    if (opts.type) q.set('type', opts.type)
    if (opts.strike != null) q.set('strike', String(opts.strike))
    if (opts.strikeCount != null) q.set('strikeCount', String(opts.strikeCount))
    const key = `c:${q.toString()}`
    try {
      return await cachedFetch(key, `/api/schwab/chain?${q.toString()}`)
    } catch (err) {
      setLastError(err)
      throw err
    }
  }, [cachedFetch])

  const getOrdersToday = useCallback(async () => {
    try {
      const data = await getJson('/api/schwab/orders')
      if (data?.warning) setWarning(data.warning)
      return data.orders || []
    } catch (err) {
      setLastError(err)
      throw err
    }
  }, [])

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return
    window.location.href = '/api/schwab/auth/login'
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await fetch('/api/schwab/auth/disconnect', { method: 'POST', credentials: 'same-origin' })
    } catch {}
    setAccount(null)
    setIsConnected(false)
    setWarning(null)
    cacheRef.current.clear()
  }, [])

  return {
    isConnected,
    loading,
    lastError,
    warning,
    account,
    positions: account?.positions || [],
    dayTrades: account?.dayTrades || 0,
    connect,
    disconnect,
    refreshAccount,
    getQuote,
    getChain,
    getOrdersToday,
  }
}
