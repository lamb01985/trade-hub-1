import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocalStorage } from './hooks/useStore.js'
import { useLiveData } from './hooks/useLiveData.js'
import { useLiveDataMulti } from './hooks/useLiveDataMulti.js'
import { buildLevelMap } from './lib/levels.js'
import { computeMTF, alignmentScore } from './lib/structure.js'
import Command from './components/Command.jsx'
import Levels from './components/Levels.jsx'
import ChartTab from './components/Chart.jsx'
import InlineCheckGate from './components/InlineCheckGate.jsx'
import CalendarTab from './components/Calendar.jsx'
import Playbook from './components/Playbook.jsx'
import Setups from './components/Setups.jsx'
import WheelScanner from './components/WheelScanner.jsx'
import Bot from './components/Bot.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { getAllEvents, highImpactToday } from './lib/calendar.js'
import { exchangeCode, refreshTokens, getAccountNumbers, getAccountSummary, getTodaysFilledOrders, countDayTrades, SCHWAB_BLUE } from './lib/schwab.js'
import { getHistoricalBars } from './lib/massive.js'
import { bootstrapSetups, saveSetups } from './lib/setupStorage.js'
import { evaluateAllSetups, derivePutThesesProjection, computeStagedTrade } from './lib/setupEngine.js'
import { buildSnapshot } from './lib/conditionEvaluators.js'
import { estimatePremium, computeHV30 } from './lib/wheelOptions.js'
import { notify, dismiss, subscribe as subscribeNotify, requestNotificationPermission, notifyTriggered } from './lib/notify.js'
import { ORBTab, IVAnalyzerTab, CalculatorTab, StatsTab, WatchlistTab, PrepTab } from './components/tabs.jsx'
import Journal from './components/Journal.jsx'
import QuickLog from './components/QuickLog.jsx'
import GlossaryModal from './components/Glossary.jsx'
import { LIME, RED, YELLOW, MONO, SANS, DARK, BORDER, PANEL, todayStr, uid, getSession, f2 } from './constants.js'

const TABS = [
  { id: 'plan', label: 'Plan', desc: 'Pre-market game plan' },
  { id: 'trade', label: 'Trade', desc: 'Live session workspace', accent: true },
  { id: 'review', label: 'Review', desc: 'Post-market log' },
]

// Initial tab based on ET session. Pre-market opens PLAN, regular session
// opens TRADE, everything else (after-hours, weekend, holiday) opens REVIEW.
function defaultTabForSession() {
  const s = getSession()
  if (s === 'pre-market') return 'plan'
  if (s === 'open' || s === 'chop' || s === 'power-hour') return 'trade'
  return 'review'
}

const defaultSettings = { dailyLossLimit: 500, maxTradesPerDay: 5, orPeriod: '15', alertsEnabled: false }
const defaultPrep = { ticker: 'QQQ', orPeriod: '15', orbHigh: '', orbLow: '', keyLevel: '', plannedStrike: '', plannedDTE: '1', ivNote: '', gamePlan: '', avoidNotes: '', dayReview: '', marketEvents: '', instrument: 'options' }

export default function App() {
  const [activeTab, setActiveTab] = useState(defaultTabForSession)
  // Sub-tab state per top tab. In-memory only: switching top tabs preserves
  // your last sub-tab within each, but reload resets to defaults (same model
  // as activeTab, which resets via session each load).
  const [planSubTab, setPlanSubTab] = useState('watchlist')
  const [tradeSubTab, setTradeSubTab] = useState('chart')
  const [reviewSubTab, setReviewSubTab] = useState('journal')
  const [apiKey, setApiKey] = useLocalStorage('th-apikey', '')
  const [anthropicKey, setAnthropicKey] = useLocalStorage('th-anthropic-key', '')
  const [trades, setTrades] = useLocalStorage('th-trades', [])
  const [settings, setSettings] = useLocalStorage('th-settings', defaultSettings)
  const [prep, setPrep] = useLocalStorage('th-prep', defaultPrep)
  const [savedPreps, setSavedPreps] = useLocalStorage('th-saved-preps', {})
  const [orbPrefill, setOrbPrefill] = useState(null)
  const [calcPrefill, setCalcPrefill] = useState(null)
  const [manualFibs, setManualFibs] = useState(null)
  const [customLevels, setCustomLevels] = useState([])
  const [showGlossary, setShowGlossary] = useState(false)
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState(null)
  const [schwabCreds, setSchwabCreds] = useLocalStorage('th-schwab-creds', { app_key: '', app_secret: '' })
  const [schwabToken, setSchwabToken] = useLocalStorage('th-schwab-token', null)
  const [schwabAccount, setSchwabAccount] = useLocalStorage('th-schwab-account', null)
  const [schwabAcctInfo, setSchwabAcctInfo] = useState(null)
  const [schwabDayTrades, setSchwabDayTrades] = useState(0)
  const [schwabToast, setSchwabToast] = useState('')
  const [schwabConnectError, setSchwabConnectError] = useState('')
  // Setups: generic trade-trigger engine. State seeded via bootstrapSetups on
  // first mount (migrates legacy th-short-theses into short setups, adds four
  // example seeds if storage is empty afterwards). Every mutation persists.
  const [setups, setSetupsRaw] = useState(() => (typeof window === 'undefined' ? [] : bootstrapSetups()))
  const setSetups = (nextOrFn) => {
    setSetupsRaw(prev => {
      const next = typeof nextOrFn === 'function' ? nextOrFn(prev) : nextOrFn
      saveSetups(next)
      return next
    })
  }
  // Per-ticker volume thresholds for the chart overlay. Lifted to App so the
  // AI brief generator in PrepTab can write into it and the Chart reacts in
  // the same session. Defaults to 50k when a ticker has no entry (Chart-side).
  const [volumeThresholds, setVolumeThresholds] = useLocalStorage('tradeHub.chart.volumeThreshold.v1', {})
  // Bot multi-ticker watchlist. Capped at MAX_BOT_WATCHLIST in setters.
  // Default 3 liquid index/leveraged ETFs.
  const [botWatchlist, setBotWatchlist] = useLocalStorage('tradeHub.bot.watchlist.v1', ['QQQ', 'TQQQ', 'SPY'])
  // Wheel scanner watchlist. Default 9 quality names with active option chains.
  const [wheelWatchlist, setWheelWatchlist] = useLocalStorage('tradeHub.wheel.watchlist.v1', ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'AMD', 'COST', 'SPY', 'QQQ'])
  // Account value used by the Setup engine to size staged trades. Defaults to
  // the same value the WheelScanner uses; not yet user-editable from App.
  const accountValue = 25000
  const [_priceTick, setPriceTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setPriceTick(t => t + 1), 5000); return () => clearInterval(id) }, [])

  // ── Schwab OAuth callback handler ─────────────────────────────────────────
  // Schwab redirects browser to /callback?code=... after auth. Exchange the
  // code via /api/schwab-callback and store the tokens.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.location.pathname.startsWith('/callback')) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const errParam = params.get('error')
    if (errParam) {
      setSchwabConnectError(`Schwab auth error: ${errParam}`)
      window.history.replaceState({}, '', '/')
      return
    }
    if (!code) return
    if (!schwabCreds?.app_key || !schwabCreds?.app_secret) {
      setSchwabConnectError('App Key / App Secret missing — set them in the Broker section before connecting.')
      window.history.replaceState({}, '', '/')
      return
    }
    exchangeCode({ code, app_key: schwabCreds.app_key, app_secret: schwabCreds.app_secret })
      .then(async tokens => {
        // Look up account hash for subsequent API calls
        let acctHash = null, acctNum = null
        try {
          const list = await getAccountNumbers(tokens)
          if (list[0]) {
            acctHash = list[0].hashValue
            acctNum = list[0].accountNumber
          }
        } catch {}
        setSchwabToken(tokens)
        setSchwabAccount({ hash: acctHash, number: acctNum })
        setSchwabToast('Schwab connected successfully ✓')
        setTimeout(() => setSchwabToast(''), 4500)
        setActiveTab('trade')
        setTradeSubTab('command')
        window.history.replaceState({}, '', '/')
      })
      .catch(err => {
        setSchwabConnectError(err.message || 'Token exchange failed')
        window.history.replaceState({}, '', '/')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Schwab token auto-refresh ─────────────────────────────────────────────
  useEffect(() => {
    if (!schwabToken?.refresh_token || !schwabCreds?.app_key || !schwabCreds?.app_secret) return
    const id = setInterval(async () => {
      const ms = (schwabToken.expires_at || 0) - Date.now()
      if (ms > 5 * 60 * 1000) return  // more than 5 min left, skip
      try {
        const fresh = await refreshTokens({ refresh_token: schwabToken.refresh_token, app_key: schwabCreds.app_key, app_secret: schwabCreds.app_secret })
        setSchwabToken(fresh)
      } catch {
        setSchwabConnectError('Schwab session expired — reconnect')
        setSchwabToken(null)
      }
    }, 60_000)
    return () => clearInterval(id)
  }, [schwabToken, schwabCreds, setSchwabToken])

  // ── Periodic account info + day-trade count ───────────────────────────────
  useEffect(() => {
    if (!schwabToken?.access_token || !schwabAccount?.hash) {
      setSchwabAcctInfo(null)
      setSchwabDayTrades(0)
      return
    }
    let alive = true
    async function pull() {
      try {
        const [info, orders] = await Promise.all([
          getAccountSummary(schwabToken, schwabAccount.hash),
          getTodaysFilledOrders(schwabToken, schwabAccount.hash).catch(() => []),
        ])
        if (!alive) return
        setSchwabAcctInfo(info)
        setSchwabDayTrades(countDayTrades(orders))
      } catch {}
    }
    pull()
    const id = setInterval(pull, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [schwabToken, schwabAccount])

  // Build level map for alert checking
  const levelMapInput = useMemo(() => ({
    orbHigh: parseFloat(orbPrefill?.orbHigh || prep.orbHigh) || null,
    orbLow: parseFloat(orbPrefill?.orbLow || prep.orbLow) || null,
  }), [orbPrefill, prep])

  const liveData = useLiveData(apiKey, prep.ticker || 'QQQ', null, settings)

  // Multi-ticker bundle for the bot's watchlist. Independent of the active
  // ticker (the active ticker is in liveData above).
  const liveDataMulti = useLiveDataMulti(apiKey, botWatchlist)

  // Multi-ticker bundle for the wheel scanner's watchlist (separate from bot).
  const wheelDataMulti = useLiveDataMulti(apiKey, wheelWatchlist)

  // Setup engine: live-subscribe to the union of every active setup's universe.
  const setupTickers = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const s of setups || []) {
      if ((s.status || 'active') !== 'active') continue
      for (const t of s.universe || []) {
        const T = String(t || '').toUpperCase().trim()
        if (!T || seen.has(T)) continue
        seen.add(T)
        out.push(T)
      }
    }
    return out
  }, [setups])
  const setupDataMulti = useLiveDataMulti(apiKey, setupTickers)

  // 252-day daily bars per setup ticker, used by buildSnapshot for EMAs, RSI,
  // MACD, and 52W high/low. Cached in a ref; refreshed when tickers change
  // and again every 30 minutes during the session.
  const setupHistRef = useRef({})  // { TICKER: { bars, fetchedAt } }
  const [histVersion, setHistVersion] = useState(0)
  const setupTickersKey = setupTickers.join('|')
  useEffect(() => {
    if (!apiKey || setupTickers.length === 0) return
    let cancelled = false
    async function refresh() {
      const MAX_AGE = 30 * 60 * 1000
      for (const t of setupTickers) {
        const cached = setupHistRef.current[t]
        if (cached && (Date.now() - cached.fetchedAt) < MAX_AGE) continue
        try {
          const bars = await getHistoricalBars(apiKey, t, 252)
          if (cancelled) return
          setupHistRef.current[t] = { bars: bars || [], fetchedAt: Date.now() }
        } catch {}
      }
      if (!cancelled) setHistVersion(v => v + 1)
    }
    refresh()
    const id = setInterval(refresh, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, setupTickersKey])

  // Per-ticker snapshots = bundle + indicators. Recomputed every render so it
  // tracks the price ticks pumped through liveDataMulti without a separate
  // interval.
  const setupSnapshots = useMemo(() => {
    const out = {}
    const bundles = setupDataMulti?.data || {}
    for (const t of setupTickers) {
      const bundle = bundles[t]
      const hist = setupHistRef.current[t]?.bars || []
      const snap = buildSnapshot(t, bundle, hist, {})
      if (snap) out[t] = snap
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupDataMulti, setupTickersKey, histVersion])

  const setupEvaluation = useMemo(
    () => evaluateAllSetups(setups, setupSnapshots),
    [setups, setupSnapshots]
  )

  // Trigger-transition detection. The first evaluation after mount establishes
  // a baseline so we don't spam toasts for setups that were already in a
  // triggered state from a previous session.
  const prevTriggerKeysRef = useRef(null)
  useEffect(() => {
    if (!setupEvaluation) return
    const currentKeys = new Set(setupEvaluation.triggers.map(t => `${t.setupId}|${t.ticker}`))
    if (prevTriggerKeysRef.current === null) {
      prevTriggerKeysRef.current = currentKeys
      return
    }
    const newOnes = setupEvaluation.triggers.filter(t => !prevTriggerKeysRef.current.has(`${t.setupId}|${t.ticker}`))
    prevTriggerKeysRef.current = currentKeys
    if (newOnes.length === 0) return

    // Stamp lastTriggeredAt + triggered events on the relevant setups.
    setSetups(prev => {
      const next = [...prev]
      for (const tr of newOnes) {
        const idx = next.findIndex(s => s.id === tr.setupId)
        if (idx < 0) continue
        const cur = next[idx]
        next[idx] = {
          ...cur,
          alerts: {
            ...(cur.alerts || {}),
            lastTriggeredAt: { ...((cur.alerts || {}).lastTriggeredAt || {}), [tr.ticker]: Date.now() },
          },
          triggeredEvents: [
            { ticker: tr.ticker, triggeredAt: Date.now(), price: tr.snapshot?.price ?? null },
            ...((cur.triggeredEvents || []).slice(0, 49)),
          ],
        }
      }
      return next
    })

    // Toast + native + off-app per new trigger, with the staged trade attached
    // so Telegram / email recipients get the same plan the in-app card shows.
    for (const tr of newOnes) {
      if (tr.setup?.alerts?.enabled === false) continue
      const hv = computeHV30(tr.snapshot?.histBars || [])
      const stagedTrade = computeStagedTrade(tr.setup, tr.snapshot?.price, accountValue, hv, estimatePremium)
      notifyTriggered({
        setup: tr.setup,
        ticker: tr.ticker,
        snapshot: tr.snapshot,
        stagedTrade,
        conditionResults: tr.conditionResults,
        action: {
          label: 'Open Setups',
          onClick: () => { setActiveTab('plan'); setPlanSubTab('setups') },
        },
      })
    }
  }, [setupEvaluation])

  // Best-effort: ask for native notification permission once. Browsers silence
  // re-prompts after a denial; this is a one-time best-attempt on mount.
  useEffect(() => { requestNotificationPermission() }, [])

  // Derived projection feeding Chart / Levels / Calendar via the legacy
  // putTheses-shape API. Kept so those components don't have to be rewritten.
  const derivedPutTheses = useMemo(() => derivePutThesesProjection(setups), [setups])

  // Merge pre-market H/L into custom levels so they show in the level map
  const enrichedCustomLevels = useMemo(() => {
    const base = customLevels || []
    const pm = liveData.preMarket
    if (!pm?.active) return base
    const extras = []
    if (pm.high != null) extras.push({ label: 'PMH', price: pm.high, type: 'premarket-high' })
    if (pm.low != null) extras.push({ label: 'PML', price: pm.low, type: 'premarket-low' })
    return [...extras, ...base]
  }, [customLevels, liveData.preMarket])

  // Merge liveData into a full level map for the Levels tab
  const fullLevelMap = useMemo(() => buildLevelMap(liveData.price, {
    pivots: liveData.pivots,
    fibs: manualFibs,
    vwapData: liveData.vwapData,
    prevDay: liveData.prevDay,
    weeklyData: liveData.weeklyData,
    orbHigh: levelMapInput.orbHigh,
    orbLow: levelMapInput.orbLow,
    sdZones: liveData.sdZones,
    customLevels: enrichedCustomLevels,
    volProfile: liveData.volProfile,
  }), [liveData, manualFibs, levelMapInput, enrichedCustomLevels])

  // Multi-timeframe alignment — computed once, fanned out to header / Levels / Chart / Checklist / AI brief
  const mtfAlignment = useMemo(() => {
    const mtf = computeMTF(liveData.intradayBars)
    if (!mtf) return { mtf: null, score: 0, direction: 'NO DATA', confidence: 'NONE', label: 'NO DATA', recommendation: 'Waiting for bars.' }
    return { mtf, ...alignmentScore(mtf, liveData.rvol) }
  }, [liveData.intradayBars, liveData.rvol])

  // Calendar events for next 14 days, recomputed once per session
  const calendarEvents = useMemo(() => getAllEvents(new Date(), 14), [])
  const todayHighImpact = useMemo(() => highImpactToday(calendarEvents), [calendarEvents])

  // Checklist completion gate for the bot coach. Reads the same checkLog
  // localStorage Check.jsx writes; verdict TRADE or TRADE_FORCED logged on
  // today's ET date counts as complete. Re-evaluates every 5s via _priceTick.
  const checklistComplete = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const raw = localStorage.getItem('checkLog')
      if (!raw) return false
      const log = JSON.parse(raw)
      if (!Array.isArray(log)) return false
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
      const todayET = fmt.format(new Date())
      return log.some(e => {
        if (!e?.timestamp) return false
        if (e.verdict !== 'TRADE' && e.verdict !== 'TRADE_FORCED') return false
        return fmt.format(new Date(e.timestamp)) === todayET
      })
    } catch { return false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_priceTick])

  // Loss limit lockout
  const todayTrades = trades.filter(t => t.date?.slice(0, 10) === todayStr())
  const todayPnl = todayTrades.reduce((a, t) => a + (t.pnl || 0), 0)
  const lockedOut = settings.dailyLossLimit > 0 && todayPnl <= -settings.dailyLossLimit
  const maxTradesReached = settings.maxTradesPerDay > 0 && todayTrades.length >= settings.maxTradesPerDay

  function handleLogTrade(trade) {
    setTrades(prev => [...prev, trade])
    setActiveTab('review')
    setReviewSubTab('journal')
  }

  // Opt-in paper write from the Bot coach. Stays out of Stats by default
  // (StatsTab filters paper: true unless the user toggles "Include paper").
  function handleBotPaperTrade(trade) {
    if (!trade) return
    setTrades(prev => [...prev, trade])
  }

  function openQuickLog(trade = null) {
    setEditingTrade(trade)
    setQuickLogOpen(true)
  }

  function closeQuickLog() {
    setQuickLogOpen(false)
    setEditingTrade(null)
  }

  function handleQuickLogSubmit(data) {
    if (editingTrade) {
      setTrades(prev => prev.map(t => t.id === data.id ? data : t))
    } else {
      setTrades(prev => [...prev, data])
    }
    closeQuickLog()
  }

  const openTrades = trades.filter(t => t.status === 'open')
  const headerOpenPnl = openTrades.reduce((s, t) => {
    if (t.currentPrice == null || t.entry == null) return s
    return s + (t.currentPrice - t.entry) * (t.contracts || 1) * 100
  }, 0)
  const headerOpenAny = openTrades.some(t => t.currentPrice != null)
  const headerOpenSummary = openTrades.length === 1 && openTrades[0].currentPrice != null
    ? `${openTrades[0].ticker} ${openTrades[0].strike ? openTrades[0].strike : ''}${openTrades[0].optType ? openTrades[0].optType[0].toUpperCase() : ''}`
    : openTrades.length > 1 ? `${openTrades.length} OPEN`
    : null

  function handleUpdateTrade(updated) {
    setTrades(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  function handleDeleteTrade(id) {
    setTrades(prev => prev.filter(t => t.id !== id))
  }

  const session = getSession()

  return (
    <div style={{ minHeight: '100vh', background: DARK, fontFamily: MONO }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 100, background: '#0a0a0a' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#e8e8e8', fontFamily: MONO, letterSpacing: '-0.03em' }}>TRADE HUB</div>
            {liveData.price ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: liveData.connected ? LIME : YELLOW, boxShadow: liveData.connected ? `0 0 6px ${LIME}` : 'none' }} />
                <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: '#888' }}>{prep.ticker || 'QQQ'}</span>
                <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 900, color: LIME }}>${liveData.price?.toFixed(2)}</span>
              </div>
            ) : (
              <span style={{ fontSize: 10, fontFamily: MONO, color: '#444', letterSpacing: '0.08em' }}>
                {apiKey ? 'connecting...' : 'no live data'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lockedOut && (
              <span style={{ fontSize: 9, color: RED, fontFamily: MONO, border: `1px solid ${RED}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em' }}>LOCKED</span>
            )}
            {fullLevelMap.setupQuality === 'ON LEVEL' && (
              <button onClick={() => { setActiveTab('trade'); setTradeSubTab('chart') }} title="Jump to Trade / Chart" style={{ fontSize: 9, color: LIME, fontFamily: MONO, background: 'transparent', border: `1px solid ${LIME}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', animation: 'hdrpulse 1.5s infinite', cursor: 'pointer' }}>ON LEVEL →</button>
            )}
            {fullLevelMap.setupQuality === 'APPROACHING' && (
              <button onClick={() => { setActiveTab('trade'); setTradeSubTab('chart') }} title="Jump to Trade / Chart" style={{ fontSize: 9, color: YELLOW, fontFamily: MONO, background: 'transparent', border: `1px solid ${YELLOW}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', cursor: 'pointer' }}>APPROACHING →</button>
            )}
            {headerOpenSummary && headerOpenAny && (
              <button onClick={() => { setActiveTab('review'); setReviewSubTab('journal') }} title="Jump to Review / Journal" style={{ fontSize: 9, color: headerOpenPnl >= 0 ? LIME : RED, fontFamily: MONO, background: 'transparent', border: `1px solid ${(headerOpenPnl >= 0 ? LIME : RED)}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.06em', cursor: 'pointer', fontWeight: 700 }}>
                {headerOpenSummary} {headerOpenPnl >= 0 ? '+' : ''}${Math.abs(headerOpenPnl).toFixed(0)}
              </button>
            )}
            {(() => {
              const count = setupEvaluation?.triggers?.length || 0
              if (count === 0) return null
              return (
                <button
                  onClick={() => { setActiveTab('plan'); setPlanSubTab('setups') }}
                  title="Setups triggered (Plan / Setups)"
                  style={{ fontSize: 9, color: RED, fontFamily: MONO, background: 'transparent', border: `1px solid ${RED}55`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.08em', cursor: 'pointer', fontWeight: 700, animation: 'hdrpulse 1.5s infinite' }}
                >
                  {count} SETUP{count === 1 ? '' : 'S'} TRIGGERED →
                </button>
              )
            })()}
            {schwabToken?.access_token && schwabDayTrades > 0 && (() => {
              const c = schwabDayTrades >= 3 ? RED : schwabDayTrades >= 2 ? YELLOW : '#888'
              return (
                <span title="Pattern Day Trader count — round-trip option trades today" style={{ fontSize: 9, color: c, fontFamily: MONO, border: `1px solid ${c}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em' }}>
                  PDT: {schwabDayTrades}/3{schwabDayTrades >= 3 ? ' — NO MORE' : ''}
                </span>
              )
            })()}
            {mtfAlignment.score > 0 && (() => {
              const c = mtfAlignment.score >= 85 ? LIME : mtfAlignment.score >= 70 ? LIME : mtfAlignment.score >= 55 ? YELLOW : mtfAlignment.score >= 40 ? '#F97316' : RED
              return (
                <button onClick={() => { setActiveTab('trade'); setTradeSubTab('chart') }} title={`${mtfAlignment.label}, jump to Trade / Chart`} style={{ fontSize: 9, color: c, fontFamily: MONO, background: 'transparent', border: `1px solid ${c}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', cursor: 'pointer' }}>ALIGN: {mtfAlignment.score} →</button>
              )
            })()}
          </div>
        </div>

        {/* Setup banner — shown when no API key */}
        {!apiKey && (
          <div style={{ background: '#0c1408', borderTop: `1px solid ${LIME}22`, borderBottom: `1px solid ${LIME}22` }}>
            <div style={{ maxWidth: 960, margin: '0 auto', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11, fontFamily: MONO, color: '#7a9a6a' }}>
                ↳ Add your Massive API key in the <strong style={{ color: LIME }}>Trade</strong> tab (Command section) to activate live price, VWAP, and level intelligence.
              </span>
              <button
                onClick={() => { setActiveTab('trade'); setTradeSubTab('command') }}
                style={{ background: LIME, color: '#000', border: 'none', borderRadius: 3, padding: '5px 14px', fontFamily: MONO, fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Go to Trade →
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${LIME}` : '2px solid transparent',
                  color: isActive ? (tab.accent ? LIME : '#e8e8e8') : '#484848',
                  fontFamily: MONO,
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 400,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  padding: '10px 14px 8px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span>{tab.label}
                  {tab.id === 'trade' && fullLevelMap.setupQuality === 'ON LEVEL' && (
                    <span style={{ marginLeft: 5, width: 5, height: 5, borderRadius: '50%', background: LIME, display: 'inline-block', boxShadow: `0 0 6px ${LIME}`, verticalAlign: 'middle' }} />
                  )}
                </span>
                <span style={{ fontSize: 8, color: isActive ? '#555' : '#333', letterSpacing: '0.06em', textTransform: 'none', fontWeight: 400 }}>{tab.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* High-impact event banner — visible on every tab */}
      {todayHighImpact.length > 0 && (
        <div style={{ background: '#110d04', borderBottom: `1px solid ${YELLOW}33` }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO }}>
            <span style={{ fontSize: 11, color: YELLOW }}>⚠</span>
            <span style={{ fontSize: 10, color: YELLOW, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>High Impact Today:</span>
            <span style={{ fontSize: 10, color: '#c8a030', flex: 1 }}>
              {todayHighImpact.map(e => `${e.name}${e.time ? ` at ${e.time} CT` : ''}`).join(' · ')}
            </span>
            <button onClick={() => { setActiveTab('plan'); setPlanSubTab('calendar') }} style={{ background: 'transparent', border: `1px solid ${YELLOW}44`, color: YELLOW, fontFamily: MONO, fontSize: 9, padding: '3px 9px', borderRadius: 3, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>View Calendar →</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes hdrpulse { 0%,100%{opacity:1}50%{opacity:0.5} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input::placeholder, textarea::placeholder { color: #1e1e1e !important; }
        select option { background: #111; color: #e8e8e8; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; }
        button { transition: opacity 0.15s; }
        button:hover { opacity: 0.85; }
      `}</style>

      {/* Content. TRADE gets a wider container so the chart has room. */}
      <div style={{ maxWidth: activeTab === 'trade' ? 1200 : 960, margin: '0 auto', padding: '28px 20px 60px' }}>

        {activeTab === 'plan' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SubNav
              tabs={[
                { id: 'watchlist', label: 'Watchlist' },
                { id: 'wheel', label: 'Wheel' },
                { id: 'prep', label: 'Prep' },
                { id: 'playbook', label: 'Playbook' },
                { id: 'calendar', label: 'Calendar' },
                { id: 'levels', label: 'Levels' },
                { id: 'setups', label: 'Setups' },
              ]}
              active={planSubTab}
              onChange={setPlanSubTab}
            />

            <div style={{ display: planSubTab === 'watchlist' ? 'flex' : 'none', flexDirection: 'column', gap: 24 }}>
              <PreMarketSummarySection liveData={liveData} ticker={prep.ticker || 'QQQ'} />
              <WatchlistTab
                apiKey={apiKey}
                savedPreps={savedPreps}
                onSendToPrep={entry => { setPrep(p => ({ ...p, ticker: entry.ticker, orbHigh: entry.priorHigh || '', orbLow: entry.priorLow || '', plannedStrike: entry.plannedStrike || '', plannedDTE: entry.plannedDTE || '', ivNote: entry.ivNote || '' })); setPlanSubTab('prep') }}
                onLoadSavedPrep={saved => { const { dateSaved, ...data } = saved; setPrep(p => ({ ...p, ...data })); setPlanSubTab('prep') }}
              />
            </div>

            <div style={{ display: planSubTab === 'wheel' ? 'block' : 'none' }}>
              <ErrorBoundary label="Wheel">
                <WheelScanner
                  watchlist={wheelWatchlist}
                  onWatchlistChange={setWheelWatchlist}
                  liveDataMulti={wheelDataMulti?.data || {}}
                  apiKey={apiKey}
                  anthropicKey={anthropicKey}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'prep' ? 'block' : 'none' }}>
              <PrepTab
                prep={prep}
                onPrepChange={setPrep}
                onSendToORB={fill => { setOrbPrefill(fill); setActiveTab('trade'); setTradeSubTab('orb') }}
                settings={settings}
                liveData={liveData}
                anthropicKey={anthropicKey}
                savedPreps={savedPreps}
                onSavedPrepsChange={setSavedPreps}
                levelMap={fullLevelMap}
                mtfAlignment={mtfAlignment}
                onVolumeThresholdsChange={setVolumeThresholds}
              />
            </div>

            <div style={{ display: planSubTab === 'playbook' ? 'block' : 'none' }}>
              <ErrorBoundary label="Playbook">
                <Playbook trades={trades} settings={settings} lockedOut={lockedOut} prep={prep} />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'calendar' ? 'block' : 'none' }}>
              <ErrorBoundary label="Calendar">
                <CalendarTab putTheses={derivedPutTheses} apiKey={apiKey} />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'levels' ? 'block' : 'none' }}>
              <ErrorBoundary label="Levels">
                <Levels
                  liveData={{ ...liveData, lastAlerts: liveData.lastAlerts }}
                  orbHigh={orbPrefill?.orbHigh || prep.orbHigh}
                  orbLow={orbPrefill?.orbLow || prep.orbLow}
                  settings={settings}
                  onSettingsChange={setSettings}
                  mtfAlignment={mtfAlignment}
                  putThesis={derivedPutTheses[(prep.ticker || 'QQQ').toUpperCase()]}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'setups' ? 'block' : 'none' }}>
              <ErrorBoundary label="Setups">
                <Setups
                  setups={setups}
                  onSetupsChange={setSetups}
                  evaluation={setupEvaluation}
                  accountValue={accountValue}
                  suggestionTickers={[...new Set([...botWatchlist, ...wheelWatchlist, ...setupTickers])]}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}

        {activeTab === 'trade' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SubNav
              tabs={[
                { id: 'chart', label: 'Chart' },
                { id: 'bot', label: 'Bot' },
                { id: 'orb', label: 'ORB' },
                { id: 'iv', label: 'IV' },
                { id: 'calc', label: 'Calculator' },
                { id: 'command', label: 'Command' },
              ]}
              active={tradeSubTab}
              onChange={setTradeSubTab}
            />

            <div style={{ display: tradeSubTab === 'chart' ? 'block' : 'none' }}>
              <ErrorBoundary label="Chart">
                <ChartTab
                  liveData={liveData}
                  levelMap={fullLevelMap}
                  trades={trades}
                  ticker={prep.ticker || 'QQQ'}
                  customLevels={customLevels}
                  onCustomLevelsChange={setCustomLevels}
                  mtfAlignment={mtfAlignment}
                  putThesis={derivedPutTheses[(prep.ticker || 'QQQ').toUpperCase()]}
                  volumeThresholds={volumeThresholds}
                  onVolumeThresholdsChange={setVolumeThresholds}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: tradeSubTab === 'bot' ? 'flex' : 'none', flexDirection: 'column', gap: 24 }}>
              <ErrorBoundary label="Check gate">
                <InlineCheckGate
                  liveData={liveData}
                  levelMap={fullLevelMap}
                  mtfAlignment={mtfAlignment}
                  ticker={prep.ticker || 'QQQ'}
                />
              </ErrorBoundary>
              <ErrorBoundary label="Bot">
                <Bot
                  activeTicker={(prep.ticker || 'QQQ').toUpperCase()}
                  livePrice={liveData?.price ?? null}
                  intradayBars={liveData?.intradayBars || []}
                  levelMap={fullLevelMap}
                  mtfAlignment={mtfAlignment}
                  prevDay={liveData?.prevDay || null}
                  rvol={liveData?.rvol ?? null}
                  checklistComplete={checklistComplete}
                  onPaperTrade={handleBotPaperTrade}
                  watchlist={botWatchlist}
                  onWatchlistChange={setBotWatchlist}
                  liveDataMulti={liveDataMulti?.data || {}}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: tradeSubTab === 'orb' ? 'block' : 'none' }}>
              <ORBTab
                settings={settings}
                onSendToCalc={fill => { setCalcPrefill(fill); setTradeSubTab('calc') }}
                prepFill={orbPrefill}
                liveData={liveData}
                savedPreps={savedPreps}
              />
            </div>

            <div style={{ display: tradeSubTab === 'iv' ? 'block' : 'none' }}>
              <IVAnalyzerTab apiKey={apiKey} instrument={prep.instrument || 'options'} />
            </div>

            <div style={{ display: tradeSubTab === 'calc' ? 'block' : 'none' }}>
              <CalculatorTab
                prefill={calcPrefill}
                onLogTrade={handleLogTrade}
                checklistPassed={checklistComplete}
                lockedOut={lockedOut}
                maxTradesReached={maxTradesReached}
                apiKey={apiKey}
                instrument={prep.instrument || 'options'}
                schwabToken={schwabToken}
                schwabAccount={schwabAccount}
                schwabAcctInfo={schwabAcctInfo}
                prep={prep}
                liveData={liveData}
              />
            </div>

            <div style={{ display: tradeSubTab === 'command' ? 'block' : 'none' }}>
              <Command
                trades={trades}
                settings={settings}
                onSettingsChange={setSettings}
                lockedOut={lockedOut}
                onUnlock={() => setSettings(s => ({ ...s, dailyLossLimit: 0 }))}
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                anthropicKey={anthropicKey}
                onAnthropicKeyChange={setAnthropicKey}
                liveData={liveData}
                marketEvents={prep.marketEvents}
                instrument={prep.instrument || 'options'}
                ticker={prep.ticker || 'QQQ'}
                levelMap={fullLevelMap}
                todayEvents={todayHighImpact}
                schwabCreds={schwabCreds}
                onSchwabCredsChange={setSchwabCreds}
                schwabToken={schwabToken}
                onSchwabTokenChange={setSchwabToken}
                schwabAccount={schwabAccount}
                schwabAcctInfo={schwabAcctInfo}
                schwabDayTrades={schwabDayTrades}
                schwabConnectError={schwabConnectError}
              />
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SubNav
              tabs={[
                { id: 'journal', label: 'Journal' },
                { id: 'stats', label: 'Stats' },
              ]}
              active={reviewSubTab}
              onChange={setReviewSubTab}
            />

            <div style={{ display: reviewSubTab === 'journal' ? 'block' : 'none' }}>
              <ErrorBoundary label="Journal">
                <Journal
                  trades={trades}
                  onUpdate={handleUpdateTrade}
                  onDelete={handleDeleteTrade}
                  onEdit={openQuickLog}
                  onOpenQuickLog={openQuickLog}
                  anthropicKey={anthropicKey}
                  prep={prep}
                  schwabToken={schwabToken}
                  schwabAccount={schwabAccount}
                  onAddTrades={list => setTrades(prev => [...prev, ...list])}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: reviewSubTab === 'stats' ? 'block' : 'none' }}>
              <StatsTab trades={trades} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid #111`, padding: '16px 20px', textAlign: 'center' }}>
        <button
          onClick={() => setShowGlossary(true)}
          style={{ background: 'none', border: 'none', color: '#2a2a2a', fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#222' }}
        >
          Glossary
        </button>
        <span style={{ color: '#1a1a1a', fontSize: 9, fontFamily: MONO, margin: '0 10px' }}>·</span>
        <span style={{ color: '#1a1a1a', fontSize: 9, fontFamily: MONO, letterSpacing: '0.1em' }}>Trade Hub — personal use only</span>
      </div>

      {showGlossary && <GlossaryModal onClose={() => setShowGlossary(false)} />}

      {/* Floating action button — visible on every tab */}
      <button onClick={() => openQuickLog(null)} title="Log a trade" style={{
        position: 'fixed', bottom: 22, right: 22, width: 56, height: 56, borderRadius: '50%',
        background: LIME, color: '#000', border: 'none', fontSize: 26, fontWeight: 900,
        cursor: 'pointer', boxShadow: '0 6px 20px rgba(209,255,121,0.35), 0 2px 6px rgba(0,0,0,0.5)',
        zIndex: 150, fontFamily: MONO,
      }}>+</button>

      <QuickLog
        open={quickLogOpen}
        onClose={closeQuickLog}
        onSubmit={handleQuickLogSubmit}
        prep={prep}
        editing={editingTrade}
      />

      {schwabToast && (
        <div style={{ position: 'fixed', bottom: 90, right: 22, background: SCHWAB_BLUE, color: '#fff', fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: '12px 18px', borderRadius: 6, boxShadow: '0 6px 24px rgba(59,130,246,0.4)', zIndex: 200, letterSpacing: '0.04em' }}>
          {schwabToast}
        </div>
      )}

      <NotificationOverlay />
    </div>
  )
}

// Toast stack pinned bottom-right. Subscribes to the notify.js queue and
// renders dismissible cards. Setup-trigger toasts are sticky until the user
// dismisses or hits the action; info toasts auto-fade via their own ttlMs.
function NotificationOverlay() {
  const [items, setItems] = useState([])
  useEffect(() => subscribeNotify(setItems), [])
  if (!items?.length) return null
  return (
    <div style={{
      position: 'fixed', bottom: 90, right: 22, zIndex: 250,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
    }}>
      {items.map(t => {
        const accent = t.kind === 'trigger' ? RED : t.kind === 'warn' ? YELLOW : LIME
        return (
          <div key={t.id} style={{
            background: '#0a0a0a', border: `1px solid ${accent}55`, borderLeft: `3px solid ${accent}`,
            borderRadius: 5, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 800, color: '#e8e8e8', lineHeight: 1.3 }}>{t.title}</div>
              <button onClick={() => dismiss(t.id)} style={{ background: 'transparent', border: 'none', color: '#666', fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>✕</button>
            </div>
            {t.body && (
              <div style={{ fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.5 }}>{t.body}</div>
            )}
            {t.action && (
              <button onClick={() => { try { t.action.onClick?.() } catch {}; dismiss(t.id) }} style={{
                alignSelf: 'flex-start', background: accent, color: '#000', border: 'none',
                padding: '5px 10px', borderRadius: 3, fontFamily: MONO, fontSize: 10,
                letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800, cursor: 'pointer',
              }}>{t.action.label}</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Top section of PLAN. Shows the active ticker's pre-market H/L, gap, trend,
// volume. Phase 2 keeps it single-ticker (sourced from liveData.preMarket);
// the multi-ticker QQQ/SPY/TQQQ aggregator is Phase 4 polish.
function PreMarketSummarySection({ liveData, ticker }) {
  const pm = liveData?.preMarket
  const prevDay = liveData?.prevDay
  const cardStyle = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '16px 20px' }
  const labelStyle = { fontSize: 10, fontFamily: MONO, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase' }

  if (!pm?.active) {
    return (
      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Overnight & Pre-Market</div>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#555' }}>
          No pre-market data yet for {ticker}. Live data activates after the 4:00 ET pre-market open with your Massive API key connected.
        </div>
      </div>
    )
  }

  const gapColor = pm.gapPct == null ? '#888' : pm.gapPct > 0 ? LIME : pm.gapPct < 0 ? RED : '#888'
  const gapLabel = pm.gap == null ? '—'
    : `${pm.gap >= 0 ? '+' : '-'}$${Math.abs(pm.gap).toFixed(2)} (${pm.gapPct >= 0 ? '+' : ''}${pm.gapPct.toFixed(2)}%)`
  const trendColor = pm.trend === 'trending up' ? LIME : pm.trend === 'trending down' ? RED : YELLOW

  const Stat = ({ label, value, color = '#e8e8e8' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontSize: 15, fontFamily: MONO, color, fontWeight: 800 }}>{value}</span>
    </div>
  )

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={labelStyle}>Overnight & Pre-Market, {ticker}</div>
        <div style={{ fontSize: 10, fontFamily: MONO, color: trendColor, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{pm.trend}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18 }}>
        <Stat label="PM High" value={pm.high == null ? '—' : `$${pm.high.toFixed(2)}`} />
        <Stat label="PM Low" value={pm.low == null ? '—' : `$${pm.low.toFixed(2)}`} />
        <Stat label="Last" value={pm.last == null ? '—' : `$${pm.last.toFixed(2)}`} />
        <Stat label={prevDay?.close ? `Gap vs $${prevDay.close.toFixed(2)}` : 'Gap'} value={gapLabel} color={gapColor} />
        <Stat label="PM Vol" value={pm.vol ? pm.vol.toLocaleString() : '—'} />
      </div>
    </div>
  )
}

// Sub-navigation row. Smaller mirror of the top nav. One row per top tab,
// rendered at the top of its content area.
function SubNav({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 0, overflowX: 'auto', borderBottom: `0.5px solid ${BORDER}`,
      marginBottom: 4,
    }}>
      {tabs.map(t => {
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? `2px solid ${LIME}` : '2px solid transparent',
              color: isActive ? LIME : '#666',
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '8px 14px 7px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
