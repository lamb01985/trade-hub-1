import { isUiPreview } from './lib/uiPreview.js'
import { useThesisAvailability } from './hooks/useThesisAvailability.js'
import WorkspaceShell from './components/workspace/WorkspaceShell.jsx'
import Portfolio from './components/workspace/Portfolio.jsx'
import Opportunities from './components/workspace/Opportunities.jsx'
import Overview, { verifiedBundle } from './components/workspace/Overview.jsx'
import CompanyIntelligence from './components/workspace/CompanyIntelligence.jsx'
import ServiceStatus from './components/workspace/ServiceStatus.jsx'
import { activeNavigation } from './components/workspace/navigation.js'
import { PageHeading, StatusBadge } from './components/workspace/primitives.jsx'
import { Brand } from './components/Brand.jsx'
import { BRAND } from './lib/brand.js'
import { THEME } from './lib/theme.js'
import UnifiedMarketContext from './components/UnifiedMarketContext.jsx'
import { useMarketData } from './hooks/useMarketData.js'
import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react'
import LocalPreviewNotice from './components/LocalPreviewNotice.jsx'
import { intelligenceFromSearch } from './lib/intelligenceNavigation.js'
import { useAiCapability } from './hooks/useAiCapability.js'
import { useLocalStorage } from './hooks/useStore.js'
import { daysToExpiry } from './lib/optionSnapshot.js'
import { useLiveData } from './hooks/useLiveData.js'
import { useLiveDataMulti } from './hooks/useLiveDataMulti.js'
import { buildLevelMap } from './lib/levels.js'
import { tradeFreshness, tradeSession } from './lib/quoteQuality.js'
import { computeMTF, alignmentScore } from './lib/structure.js'
import Command from './components/Command.jsx'
import Levels from './components/Levels.jsx'
import ChartTab from './components/Chart.jsx'
import InlineCheckGate from './components/InlineCheckGate.jsx'
import CalendarTab from './components/Calendar.jsx'
import Playbook from './components/Playbook.jsx'
// Trigger engine retired in favor of the Core Playbook (ORB, Break and Retest,
// Pullback, S/R Reversal). The Setups component and its supporting files
// (SetupCard, SetupBuilder, SetupTemplatesLibrary, AdjustSetupsModal, plus
// setupEngine / setupStorage libs) are preserved in the tree for later
// re-activation. The underlying `setups` state below still hydrates because
// the header chip and PutThesis projection read from it.
// import Setups from './components/Setups.jsx'
import CorePlaybook from './components/CorePlaybook.jsx'
import GlossaryReference from './components/GlossaryReference.jsx'
import MoversScanner from './components/MoversScanner.jsx'
import UniverseBuilder from './components/UniverseBuilder.jsx'
import OutcomesAnalyzer from './components/OutcomesAnalyzer.jsx'
import Focus from './components/Focus.jsx'
import { loadFocusedTickers, saveFocusedTickers, bootstrapFocusedTickers } from './lib/focusedTickersStorage.js'
import WheelScanner from './components/WheelScanner.jsx'
import Bot from './components/Bot.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { getAllEvents, highImpactToday } from './lib/calendar.js'
import { SCHWAB_BLUE } from './lib/schwabClient.js'
import { useSchwab } from './hooks/useSchwab.js'
import { getHistoricalBars } from './lib/massive.js'
import { bootstrapSetups, saveSetups } from './lib/setupStorage.js'
import { evaluateAllSetups, derivePutThesesProjection, computeStagedTrade } from './lib/setupEngine.js'
import { buildSnapshot } from './lib/conditionEvaluators.js'
import { resolveUniverseTickers, universeAppendTickers } from './lib/universeResolver.js'
import { estimatePremium, computeHV30 } from './lib/wheelOptions.js'
import { notify, dismiss, subscribe as subscribeNotify, requestNotificationPermission, notifyTriggered } from './lib/notify.js'
import { snapshot as apiHealthSnapshot, subscribe as subscribeApiHealth } from './lib/apiHealth.js'
import { ORBTab, IVAnalyzerTab, CalculatorTab, StatsTab, WatchlistTab, PrepTab } from './components/tabs.jsx'
import Journal from './components/Journal.jsx'
import QuickLog from './components/QuickLog.jsx'
import GlossaryModal from './components/Glossary.jsx'
import { LIME, RED, YELLOW, BLUE, MONO, SANS, DARK, BORDER, PANEL, todayStr, localDateStr, uid, getSession, f2 } from './constants.js'

const ResearchLedger = lazy(() => import('./components/intelligence/ResearchLedger.jsx'))
const MarketIntelligence = lazy(() => import('./components/intelligence/MarketIntelligence.jsx'))

const TABS = [
  { id: 'plan', label: 'Plan', desc: 'Pre-market game plan' },
  { id: 'trade', label: BRAND.trading, desc: 'Live session workspace', accent: true },
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

// Read the legacy 'tradeHub.universes.v1' map (Phase 2 shape) if present,
// convert to the array shape Phase 2+ expects under 'th-universes-v1', and
// write the result so subsequent reads find the new key populated. Returns
// the array used as the useLocalStorage default.
function migrateSavedUniverses() {
  if (typeof window === 'undefined') return []
  try {
    const newRaw = localStorage.getItem('th-universes-v1')
    if (newRaw) return JSON.parse(newRaw) || []
    const oldRaw = localStorage.getItem('tradeHub.universes.v1')
    if (!oldRaw) return []
    const old = JSON.parse(oldRaw)
    if (!old || typeof old !== 'object') return []
    const arr = Object.values(old).map(u => ({
      id: u.id || `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: u.name || 'Migrated universe',
      tickers: u.tickers || [],
      filterDefinition: u.filters || u.filterDefinition || {},
      createdAt: u.savedAt || u.createdAt || Date.now(),
      lastUsedAt: u.lastUsedAt || u.savedAt || u.createdAt || Date.now(),
    }))
    localStorage.setItem('th-universes-v1', JSON.stringify(arr))
    return arr
  } catch {
    return []
  }
}

const defaultSettings = { dailyLossLimit: 500, maxTradesPerDay: 5, orPeriod: '15', alertsEnabled: false }
const defaultPrep = { ticker: 'QQQ', orPeriod: '15', orbHigh: '', orbLow: '', sessionOpen: '', sessionClose: '', keyLevel: '', plannedStrike: '', plannedDTE: '1', ivNote: '', gamePlan: '', avoidNotes: '', dayReview: '', marketEvents: '', instrument: 'options' }

export default function App() {
  return isUiPreview() ? <LegacyApp/> : <LiveApp/>
}

function LiveApp() {
  const capabilities = useMarketData('capabilities')
  const [mode, setMode] = useState('legacy')
  const thesisAvailable = useThesisAvailability()
  if (import.meta.env.VITE_LOCAL_SERVICE_PREVIEW === 'true') return <LegacyApp />
  if (mode === 'research' && thesisAvailable && !capabilities.previewOnly) return <ResearchOnlyWorkspace onExit={() => setMode('legacy')}/>
  if (!capabilities.modeKnown) return <main style={{padding:24}}><Brand /><p role="status">Market mode is unavailable or being verified. Reload to retry.</p>{thesisAvailable && !capabilities.previewOnly && <button className="eq-button" onClick={() => setMode('research')}>Open Company Intelligence</button>}</main>
  if (capabilities.previewOnly && !capabilities.unifiedEnabled) return <main style={{padding:24}}><Brand /><p role="status">Protected preview is not activated.</p></main>
  if ((mode === 'unified' || capabilities.previewOnly) && capabilities.unifiedEnabled) return <UnifiedMarketContext capabilities={capabilities.envelope} ready={capabilities.ready} onLegacy={capabilities.previewOnly ? null : () => setMode('legacy')} />
  return <>{capabilities.unifiedEnabled && <button onClick={() => setMode('unified')}>Switch to Unified ETF context (read-only)</button>}<LegacyApp /></>
}

function ResearchOnlyWorkspace({onExit}) {
  const [ticker,setTicker]=useState('AMD'),[view,setView]=useState('company')
  return <WorkspaceShell active={activeNavigation('company',null,view)} ticker={ticker} onTicker={setTicker}
    onNavigate={item=>{if(item.tab==='company')setView(item.view||'company');else onExit()}}
    session="Research only" connected={false} freshness={{fresh:false,label:'Market gateway unavailable'}}
    status={<span className="eq-muted">Authenticated financial research · trading consumers inactive</span>}>
    <CompanyIntelligence ticker={ticker} view={view}/>
  </WorkspaceShell>
}

function LegacyApp() {
  const [activeTab, setActiveTab] = useState(() => intelligenceFromSearch(window.location.search) ? 'plan' : 'overview')
  // Sub-tab state per top tab. In-memory only: switching top tabs preserves
  // your last sub-tab within each, but reload resets to defaults (same model
  // as activeTab, which resets via session each load).
  const [planSubTab, setPlanSubTab] = useState(() => intelligenceFromSearch(window.location.search) ? 'intelligence' : 'watchlist')
  const [tradeSubTab, setTradeSubTab] = useState('chart')
  const [intelligenceView, setIntelligenceView] = useState(null)
  const [companyView, setCompanyView] = useState('company')
  const [reviewSubTab, setReviewSubTab] = useState('journal')
  useEffect(() => {
    const open = () => { setActiveTab('review'); setReviewSubTab('research') }
    window.addEventListener('tradehub-open-research', open)
    return () => window.removeEventListener('tradehub-open-research', open)
  }, [])
  // Increments whenever something external (Layer 2 → Prep, etc.) wants
  // PrepTab to auto-fire Load Market Data after the tab switch settles.
  const [autoLoadPrepTrigger, setAutoLoadPrepTrigger] = useState(0)
  // The Polygon API key is managed server-side via POLYGON_API_KEY in Vercel
  // env vars. src/lib/massive.js routes every REST call through
  // /api/polygon/proxy through an authenticated server-side REST relay.
  // The retired ws-auth route never delivers provider credentials. A truthy sentinel is passed down so
  // existing apiKey-gated UI in child components stays clean without forcing
  // a sweep of every gate in this commit. Child components no longer call
  // any data-fetch function with this value.
  const apiKey = 'server-managed'
  const aiCapability = useAiCapability()
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
  const schwab = useSchwab()
  const [schwabToast, setSchwabToast] = useState('')
  // The connected-toast fires once when the hook transitions to connected.
  const schwabPrevConnectedRef = useRef(schwab.isConnected)
  useEffect(() => {
    if (!schwabPrevConnectedRef.current && schwab.isConnected) {
      setSchwabToast('Schwab connected successfully')
      setTimeout(() => setSchwabToast(''), 4500)
    }
    schwabPrevConnectedRef.current = schwab.isConnected
  }, [schwab.isConnected])
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
  // Saved screener universes from UniverseBuilder. Referenced by SetupBuilder
  // and by setup.universe = { type: 'saved', universeId } refs. Stored as an
  // array under 'th-universes-v1'; one-time migrates the old map shape under
  // 'tradeHub.universes.v1'.
  const [savedUniverses, setSavedUniverses] = useLocalStorage('th-universes-v1', migrateSavedUniverses())
  // Pending setup seed used by the CREATE-SETUP flow from UniverseBuilder and
  // by Clone-with-universe from template suggestions. When non-null, Setups
  // auto-opens SetupBuilder with the seed and clears it on consume.
  const [pendingSetupSeed, setPendingSetupSeed] = useState(null)
  // Focused tickers (per-ticker dashboards under Plan / Focus). Initialized
  // straight from localStorage on first render; the seed bootstrap runs in
  // a dedicated effect below once setups are loaded.
  const [focusedTickers, setFocusedTickersRaw] = useState(() => (typeof window === 'undefined' ? [] : loadFocusedTickers()))
  const setFocusedTickers = (nextOrFn) => {
    setFocusedTickersRaw(prev => {
      const next = typeof nextOrFn === 'function' ? nextOrFn(prev) : nextOrFn
      saveFocusedTickers(next)
      return next
    })
  }
  const [_priceTick, setPriceTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setPriceTick(t => t + 1), 5000); return () => clearInterval(id) }, [])

  // Schwab connection state (account, positions, PDT count, refresh-before-call,
  // CSRF state binding, session cookie) lives entirely in the useSchwab hook.

  // Build level map for alert checking
  const levelMapInput = useMemo(() => ({
    orbHigh: parseFloat(orbPrefill?.orbHigh || prep.orbHigh) || null,
    orbLow: parseFloat(orbPrefill?.orbLow || prep.orbLow) || null,
  }), [orbPrefill, prep])

  const liveData = useLiveData(prep.ticker || 'QQQ', null, settings)

  // Multi-ticker bundle for the bot's watchlist. Independent of the active
  // ticker (the active ticker is in liveData above).
  const liveDataMulti = useLiveDataMulti(botWatchlist)

  // Multi-ticker bundle for the wheel scanner's watchlist (separate from bot).
  const wheelDataMulti = useLiveDataMulti(wheelWatchlist)

  // Setup engine: live-subscribe to the union of every active setup's
  // universe PLUS the symbols of every focused ticker so the Focus tab
  // always has live data for the dashboards.
  const setupTickers = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const s of setups || []) {
      if ((s.status || 'active') !== 'active') continue
      for (const T of resolveUniverseTickers(s.universe, savedUniverses)) {
        if (!T || seen.has(T)) continue
        seen.add(T)
        out.push(T)
      }
    }
    for (const f of focusedTickers || []) {
      const T = String(f.ticker || '').toUpperCase()
      if (!T || seen.has(T)) continue
      seen.add(T)
      out.push(T)
    }
    return out
  }, [setups, savedUniverses, focusedTickers])
  const setupDataMulti = useLiveDataMulti(setupTickers)

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
          const bars = await getHistoricalBars(t, 252)
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
    () => evaluateAllSetups(setups, setupSnapshots, { savedUniverses }),
    [setups, setupSnapshots, savedUniverses]
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

  // Focused-tickers seed bootstrap. Runs once. If the seeded flag is unset
  // and the focused-tickers store is empty, adds CRWD + ELF and auto-attaches
  // each to compatible-direction active setups.
  useEffect(() => {
    const { focusedTickers: seeded, setupsPatch } = bootstrapFocusedTickers(setups)
    if (seeded?.length && seeded.length !== focusedTickers.length) {
      setFocusedTickers(seeded)
    }
    if (setupsPatch?.length) {
      setSetups(prev => prev.map(s => {
        const adds = setupsPatch.filter(p => p.setupId === s.id).map(p => p.addTicker)
        if (adds.length === 0) return s
        return { ...s, universe: universeAppendTickers(s.universe, adds, savedUniverses || []), updatedAt: new Date().toISOString() }
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Derived projection feeding Chart / Levels / Calendar via the legacy
  // putTheses-shape API. Kept so those components don't have to be rewritten.
  const derivedPutTheses = useMemo(() => derivePutThesesProjection(setups, savedUniverses), [setups, savedUniverses])

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
    atr: liveData.atr,
    // _priceTick re-runs this every 5s so the session flips at the bell even
    // when no new price tick arrives (thin after-hours tape).
    session: getSession(),
  }), [liveData, manualFibs, levelMapInput, enrichedCustomLevels, _priceTick])

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

  // One-time cleanup: clear any Polygon API key that earlier versions of the
  // app persisted client-side. Server-side key management means these entries
  // are dead weight and a leak surface. Gated by a flag so the cleanup only
  // runs once per browser.
  useEffect(() => {
    try {
      if (localStorage.getItem('polygon-cleanup-v1-done')) return
      const stale = ['th-apikey', 'th-polygon-key', 'polygon-api-key']
      for (const k of stale) localStorage.removeItem(k)
      localStorage.setItem('polygon-cleanup-v1-done', '1')
    } catch {}
  }, [])

  // One-time migration: backfill tradeDate on any existing trade that predates
  // the field. Converts the legacy date timestamp into the user's local
  // calendar date so it matches the localDateStr() that new trades set on
  // creation; date.slice(0, 10) alone would give the UTC date and split
  // late-evening CT trades onto the wrong day.
  useEffect(() => {
    setTrades(prev => {
      let changed = false
      const next = prev.map(t => {
        if (t.tradeDate) return t
        changed = true
        return { ...t, tradeDate: t.date ? localDateStr(new Date(t.date)) : localDateStr() }
      })
      return changed ? next : prev
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Loss limit lockout
  const todayTrades = trades.filter(t => (t.tradeDate || t.date?.slice(0, 10)) === localDateStr())
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

  const selectedTicker = (prep.ticker || 'QQQ').toUpperCase()
  const selectedData = verifiedBundle(selectedTicker, liveData)
  const session = getSession()
  const priceStatus = tradeFreshness(selectedData?.priceTimestamp)
  const priceTime = selectedData?.priceTimestamp ? new Date(selectedData.priceTimestamp).toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
  }) + ' CT' : 'timestamp unavailable'
  function navigateWorkspace(item) {
    setActiveTab(item.tab)
    if (item.tab === 'plan' && item.sub) { setPlanSubTab(item.sub); if (item.sub === 'intelligence') setIntelligenceView(item.intelligence || null) }
    if (item.tab === 'trade' && item.sub) setTradeSubTab(item.sub)
    if (item.tab === 'review' && item.sub) setReviewSubTab(item.sub)
    if (item.tab === 'company') setCompanyView(item.view || 'company')
  }
  function selectTicker(ticker) {
    if (ticker === selectedTicker) return
    setOrbPrefill(null); setCalcPrefill(null); setManualFibs(null); setCustomLevels([])
    setPrep(p => ({ ...p, ticker, orbHigh: '', orbLow: '', sessionOpen: '', sessionClose: '', keyLevel: '', plannedStrike: '', plannedDTE: '', plannedContract: null, ivNote: '', gamePlan: '', avoidNotes: '', marketEvents: '' }))
  }

  return (
    <WorkspaceShell active={activeNavigation(activeTab, activeTab === 'plan' ? planSubTab : activeTab === 'trade' ? tradeSubTab : activeTab === 'review' ? reviewSubTab : null, companyView)}
      onNavigate={navigateWorkspace} ticker={selectedTicker} onTicker={selectTicker}
      session={session.replaceAll('-', ' ')} connected={liveData.connected}
      freshness={priceStatus}
      status={<><ServiceStatus freshness={priceStatus} ticker={selectedTicker} data={selectedData} priceTime={priceTime} events={todayHighImpact} onCalendar={() => {setActiveTab('plan');setPlanSubTab('calendar')}}/>{todayHighImpact.length > 0 && <button className="eq-event-chip" onClick={() => {setActiveTab('plan');setPlanSubTab('calendar')}}>{todayHighImpact.length} high-impact event{todayHighImpact.length > 1 ? 's' : ''} today</button>}</>}
      actions={<><ApiHealthIndicator />            {lockedOut && (
              <span style={{ fontSize: 9, color: RED, fontFamily: MONO, border: `1px solid ${RED}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em' }}>LOCKED</span>
            )}
            {selectedData && priceStatus.fresh && fullLevelMap.setupQuality === 'ON LEVEL' && (
              <button onClick={() => { setActiveTab('trade'); setTradeSubTab('chart') }} title="Jump to Trade / Chart" style={{ fontSize: 9, color: LIME, fontFamily: MONO, background: 'transparent', border: `1px solid ${LIME}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', animation: 'hdrpulse 1.5s infinite', cursor: 'pointer' }}>ON LEVEL →</button>
            )}
            {selectedData && priceStatus.fresh && fullLevelMap.setupQuality === 'APPROACHING' && (
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
            {schwab.isConnected && schwab.dayTrades > 0 && (() => {
              const c = schwab.dayTrades >= 3 ? RED : schwab.dayTrades >= 2 ? YELLOW : THEME.colors.secondary
              return (
                <span title="Pattern Day Trader count, round-trip option trades today" style={{ fontSize: 9, color: c, fontFamily: MONO, border: `1px solid ${c}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em' }}>
                  PDT: {schwab.dayTrades}/3{schwab.dayTrades >= 3 ? ' NO MORE' : ''}
                </span>
              )
            })()}
            {selectedData && priceStatus.fresh && mtfAlignment.score > 0 && (() => {
              const c = mtfAlignment.score >= 85 ? LIME : mtfAlignment.score >= 70 ? LIME : mtfAlignment.score >= 55 ? YELLOW : mtfAlignment.score >= 40 ? THEME.colors.orange : RED
              return (
                <button onClick={() => { setActiveTab('trade'); setTradeSubTab('chart') }} title={`${mtfAlignment.label}, jump to Trade / Chart`} style={{ fontSize: 9, color: c, fontFamily: MONO, background: 'transparent', border: `1px solid ${c}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', cursor: 'pointer' }}>ALIGN: {mtfAlignment.score} →</button>
              )
            })()}</>}>


      {/* Content. TRADE gets a wider container so the chart has room. */}
      <div className="eq-content-body">
        {activeTab === 'overview' && <Overview ticker={selectedTicker} liveData={liveData} multiData={liveDataMulti?.data || {}} watchlist={botWatchlist} trades={trades} setups={setups} levelMap={fullLevelMap} onNavigate={navigateWorkspace} onTicker={selectTicker} onLogTrade={() => openQuickLog(null)} connected={liveData.connected} session={session} schwab={schwab} aiCapability={aiCapability} events={calendarEvents}/>}
        {activeTab === 'portfolio' && <Portfolio schwab={schwab} onConnections={() => {setActiveTab('trade');setTradeSubTab('command')}}/>}
        {activeTab === 'opportunities' && <Opportunities onNavigate={navigateWorkspace}/>}
        {activeTab === 'company' && <CompanyIntelligence view={companyView} ticker={selectedTicker}/>}
        {activeTab === 'trade' && <PageHeading eyebrow="Execution workspace" title="Trading Desk" description={`${selectedTicker} · Chart, levels and execution tools. Decisions grounded in verified observations.`}/>}


        {activeTab === 'plan' && (
          <div className="eq-legacy-content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>


            {planSubTab === 'intelligence' && <Suspense fallback={<p>Loading intelligence...</p>}><MarketIntelligence key={intelligenceView || 'default'} initialView={intelligenceView || intelligenceFromSearch(window.location.search) || 'map'}/></Suspense>}
            <div style={{ display: planSubTab === 'watchlist' ? 'flex' : 'none', flexDirection: 'column', gap: 24 }}>
              <PreMarketSummarySection liveData={liveData} ticker={prep.ticker || 'QQQ'} />
              <WatchlistTab
                apiKey={apiKey}
                savedPreps={savedPreps}
                onSendToPrep={entry => {
                  setPrep(p => {
                    const next = (entry.ticker || '').toUpperCase()
                    const prev = (p.ticker || '').toUpperCase()
                    if (next === prev) {
                      return { ...p, ticker: next, orbHigh: entry.priorHigh || p.orbHigh, orbLow: entry.priorLow || p.orbLow }
                    }
                    return {
                      ...p,
                      ticker: next,
                      orbHigh: entry.priorHigh || '',
                      orbLow: entry.priorLow || '',
                      keyLevel: '',
                      plannedStrike: entry.plannedStrike || '',
                      plannedDTE: entry.plannedDTE || '',
                      ivNote: entry.ivNote || '',
                      gamePlan: '',
                      avoidNotes: '',
                      marketEvents: '',
                    }
                  })
                  setPlanSubTab('prep')
                  setAutoLoadPrepTrigger(n => n + 1)
                }}
                onLoadSavedPrep={saved => { const { dateSaved, ...data } = saved; setPrep(p => ({ ...p, ...data })); setPlanSubTab('prep') }}
              />
            </div>

            <div style={{ display: planSubTab === 'focus' ? 'block' : 'none' }}>
              <ErrorBoundary label="Focus">
                <Focus
                  focusedTickers={focusedTickers}
                  onFocusedTickersChange={setFocusedTickers}
                  setups={setups}
                  onSetupsChange={setSetups}
                  liveDataMulti={setupDataMulti?.data || {}}
                  setupHistMap={setupHistRef.current}
                  savedUniverses={savedUniverses}
                  accountValue={accountValue}
                  apiKey={apiKey}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'wheel' ? 'block' : 'none' }}>
              <ErrorBoundary label="Wheel">
                <WheelScanner
                  watchlist={wheelWatchlist}
                  onWatchlistChange={setWheelWatchlist}
                  liveDataMulti={wheelDataMulti?.data || {}}
                  apiKey={apiKey}
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
                aiCapability={aiCapability}
                savedPreps={savedPreps}
                onSavedPrepsChange={setSavedPreps}
                levelMap={fullLevelMap}
                mtfAlignment={mtfAlignment}
                onVolumeThresholdsChange={setVolumeThresholds}
                autoLoadTrigger={autoLoadPrepTrigger}
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
                  ticker={(prep.ticker || 'QQQ').toUpperCase()}
                  onSelectTicker={ticker => {
                    setOrbPrefill(null)
                    setPrep(p => ({ ...p, ticker, orbHigh: '', orbLow: '', keyLevel: '' }))
                  }}
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

            <div style={{ display: planSubTab === 'movers' ? 'block' : 'none' }}>
              <ErrorBoundary label="Movers">
                <MoversScanner
                  apiKey={apiKey}
                  setups={setups}
                  onSetupsChange={setSetups}
                  savedUniverses={savedUniverses}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'universe' ? 'block' : 'none' }}>
              <ErrorBoundary label="Universe">
                <UniverseBuilder
                  apiKey={apiKey}
                  savedUniverses={savedUniverses}
                  onSavedUniversesChange={setSavedUniverses}
                  onCreateSetupFromTickers={(tickers) => {
                    setPendingSetupSeed({ universe: { type: 'list', tickers } })
                    setActiveTab('plan'); setPlanSubTab('setups')
                  }}
                  onCloneTemplateWithTickers={(templatePartial, tickers) => {
                    setPendingSetupSeed({ ...templatePartial, universe: { type: 'list', tickers } })
                    setActiveTab('plan'); setPlanSubTab('setups')
                  }}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'setups' ? 'block' : 'none' }}>
              <ErrorBoundary label="Setups">
                {/* Trigger engine UI archived. Original render kept as a
                    reference comment so re-enabling is a one-block paste back.
                    <Setups
                      setups={setups}
                      onSetupsChange={setSetups}
                      evaluation={setupEvaluation}
                      accountValue={accountValue}
                      apiKey={apiKey}
                      savedUniverses={savedUniverses}
                      suggestionTickers={[...new Set([...botWatchlist, ...wheelWatchlist, ...setupTickers])]}
                      pendingSeed={pendingSetupSeed}
                      onConsumeSeed={() => setPendingSetupSeed(null)}
                    />
                */}
                <CorePlaybook onOpenChart={() => { setActiveTab('trade'); setTradeSubTab('chart') }} />
              </ErrorBoundary>
            </div>

            <div style={{ display: planSubTab === 'glossary' ? 'block' : 'none' }}>
              <ErrorBoundary label="Glossary">
                <GlossaryReference />
              </ErrorBoundary>
            </div>
          </div>
        )}

        {activeTab === 'trade' && (() => {
          // Trade sub-tab catalog. Add a tab id to HIDDEN_TRADE_SUBTABS to hide
          // it from the sub-tab bar without deleting any code. The underlying
          // tab pane keeps mounting (so state survives) but the chip in the bar
          // is removed.
          //
          //   'chart'   live chart, key levels, S/R, bias indicator. Primary view.
          //   'bot'     bot universe + paper trade output, used when the bot is on.
          //   'orb'     opening range checklist + ORB level entry. Day-trading window.
          //   'iv'      IV analyzer + Black-Scholes calc. Less used now that the
          //             plan is stocks-only and options pricing is a side concern.
          //   'calc'    position sizing calculator. Overlaps with Stage Order modal
          //             that Schwab integration surfaces. Candidate to hide.
          //   'command' risk controls + Polygon status + Schwab connection.
          const HIDDEN_TRADE_SUBTABS = []
          const TRADE_SUBTAB_CATALOG = [
            { id: 'chart', label: 'Chart' },
            { id: 'bot', label: 'Bot' },
            { id: 'orb', label: 'ORB' },
            { id: 'iv', label: 'Options / IV' },
            { id: 'calc', label: 'Calculator' },
            { id: 'command', label: 'Command' },
          ]
          const tradeSubTabs = TRADE_SUBTAB_CATALOG.filter(t => !HIDDEN_TRADE_SUBTABS.includes(t.id))
          return (
          <div className="eq-legacy-content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>


            <div style={{ display: tradeSubTab === 'chart' ? 'block' : 'none' }}>
              <ErrorBoundary label="Chart">
                <ChartTab
                  liveData={selectedData || {price:null,intradayBars:[],dataTicker:null}}
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
              <IVAnalyzerTab
                ticker={prep.ticker || 'QQQ'}
                onSendToPrep={contract => {
                  setPrep(p => ({ ...p,
                    ...(p.ticker !== contract.underlying ? { orbHigh: '', orbLow: '', sessionOpen: '', sessionClose: '', keyLevel: '', gamePlan: '', avoidNotes: '' } : {}),
                    ticker: contract.underlying, instrument: 'options', plannedStrike: String(contract.strike),
                    plannedDTE: String(daysToExpiry(contract.expiry)), plannedContract: contract,
                    ivNote: contract.iv == null ? '' : `${(contract.iv * 100).toFixed(2)}% · Massive ${contract.symbol}`,
                  }))
                }}
                onSendToCalc={contract => {
                  setPrep(p => ({ ...p, instrument: 'options' }))
                  setCalcPrefill({ ticker: contract.underlying, optType: contract.type, strike: contract.strike, expiry: contract.expiry, dte: daysToExpiry(contract.expiry), source: 'MASSIVE_OPTIONS' })
                  setTradeSubTab('calc')
                }}
              />
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
                schwab={schwab}
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
                aiCapability={aiCapability}
                liveData={liveData}
                marketEvents={prep.marketEvents}
                instrument={prep.instrument || 'options'}
                ticker={prep.ticker || 'QQQ'}
                levelMap={fullLevelMap}
                todayEvents={todayHighImpact}
                schwab={schwab}
              />
            </div>
          </div>
          )
        })()}

        {activeTab === 'review' && (
          <div className="eq-legacy-content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>


            {reviewSubTab === 'research' && <Suspense fallback={<p>Loading research history...</p>}><ResearchLedger/></Suspense>}
            <div style={{ display: reviewSubTab === 'journal' ? 'block' : 'none' }}>
              <ErrorBoundary label="Journal">
                <Journal
                  trades={trades}
                  onUpdate={handleUpdateTrade}
                  onDelete={handleDeleteTrade}
                  onEdit={openQuickLog}
                  onOpenQuickLog={openQuickLog}
                  prep={prep}
                  schwab={schwab}
                  onAddTrades={list => setTrades(prev => [...prev, ...list])}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: reviewSubTab === 'outcomes' ? 'block' : 'none' }}>
              <ErrorBoundary label="Outcomes">
                <OutcomesAnalyzer
                  setups={setups}
                  onSetupsChange={setSetups}
                  apiKey={apiKey}
                  onJumpToSetups={() => { setActiveTab('plan'); setPlanSubTab('setups') }}
                />
              </ErrorBoundary>
            </div>

            <div style={{ display: reviewSubTab === 'stats' ? 'block' : 'none' }}>
              <StatsTab trades={trades} />
            </div>
          </div>
        )}
      </div>

      <div className="eq-workspace-help"><button onClick={() => setShowGlossary(true)}>Glossary & terminology</button><span>Personal research workspace</span></div>

      {showGlossary && <GlossaryModal onClose={() => setShowGlossary(false)} />}

      {/* Floating action button — visible on every tab */}
      <button className="eq-quick-log" onClick={() => openQuickLog(null)} title="Log a trade" aria-label="Log a trade">+</button>

      <QuickLog
        open={quickLogOpen}
        onClose={closeQuickLog}
        onSubmit={handleQuickLogSubmit}
        prep={prep}
        editing={editingTrade}
      />

      {schwabToast && (
        <div style={{ position: 'fixed', bottom: 90, right: 22, background: SCHWAB_BLUE, color: THEME.colors.text, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: '12px 18px', borderRadius: 6, boxShadow: '0 6px 24px rgba(59,130,246,0.4)', zIndex: 200, letterSpacing: '0.04em' }}>
          {schwabToast}
        </div>
      )}

      <NotificationOverlay />
    </WorkspaceShell>
  )
}

// Header dot + click-to-expand modal driven by apiHealth. Color rolls up
// the last 5 minutes of Polygon outcomes: lime when no recent errors,
// yellow when any errors at a low ratio, red when error rate >= 25% with
// 3+ errors. Click opens a small modal with counts + the last 10 errors.
function ApiHealthIndicator() {
  const [snap, setSnap] = useState(() => apiHealthSnapshot())
  const [open, setOpen] = useState(false)
  useEffect(() => subscribeApiHealth(setSnap), [])
  const color = snap.status === 'red' ? RED : snap.status === 'yellow' ? YELLOW : LIME
  const tip = `API ${snap.status === 'red' ? 'degraded' : snap.status === 'yellow' ? 'wobbly' : 'OK'} — ${snap.successes}✓ ${snap.failures}✗ ${snap.rateLimits} rate-limited in last 5m`
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={tip}
        aria-label={tip}
        style={{
          background: 'transparent', border: 'none', padding: '4px',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: 4, background: color,
          boxShadow: snap.status === 'green' ? `0 0 6px ${LIME}55` : 'none',
          display: 'inline-block',
        }} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
          padding: 28, zIndex: 260,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: THEME.colors.background, border: `1px solid ${BORDER}`, borderRadius: 6,
            width: '100%', maxWidth: 420, padding: 16, fontFamily: MONO,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: THEME.colors.secondary, letterSpacing: '0.14em', textTransform: 'uppercase' }}>API health</div>
                <div style={{ fontSize: 14, color: THEME.colors.text, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
                  {snap.status === 'red' ? 'Degraded' : snap.status === 'yellow' ? 'Wobbly' : 'All good'}
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: THEME.colors.secondary, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Stat label="OK" value={snap.successes} color={LIME} />
              <Stat label="Errors" value={snap.failures} color={snap.failures > 0 ? RED : THEME.colors.secondary} />
              <Stat label="Rate-limit" value={snap.rateLimits} color={snap.rateLimits > 0 ? YELLOW : THEME.colors.secondary} />
            </div>
            <div style={{ fontSize: 10, color: THEME.colors.secondary, fontFamily: MONO, letterSpacing: '0.06em' }}>
              Rolling 5-minute window. Polygon requests served from in-memory cache don't count.
            </div>

            {/* Polygon plan limits — populated whenever the API client sees a
                403 on an endpoint. We short-circuit further calls to that
                endpoint, so this list is what's currently unavailable to the
                user's plan tier. */}
            {snap.unavailableEndpoints?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: THEME.colors.secondary, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Polygon plan limits
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {snap.unavailableEndpoints.map((u, i) => (
                    <div key={i} style={{
                      background: THEME.colors.cautionSurface, border: `1px solid ${YELLOW}33`, borderRadius: 3,
                      padding: '6px 8px', fontSize: 10, fontFamily: MONO, color: THEME.colors.caution, lineHeight: 1.5,
                    }}>
                      <div style={{ wordBreak: 'break-all', color: YELLOW, fontWeight: 700 }}>{u.pattern}</div>
                      {u.hint && <div style={{ color: THEME.colors.caution, marginTop: 2 }}>{u.hint}</div>}
                    </div>
                  ))}
                </div>
                <a href="https://polygon.io/pricing" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 10, color: BLUE, fontFamily: MONO, letterSpacing: '0.06em', textDecoration: 'none' }}>
                  polygon.io/pricing →
                </a>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: THEME.colors.secondary, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Recent errors</div>
              {(!snap.recentErrors || snap.recentErrors.length === 0) ? (
                <div style={{ fontSize: 11, color: THEME.colors.secondary }}>No errors recorded.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {snap.recentErrors.map((e, i) => {
                    const isRate = e.kind === 'rate_limit'
                    const isUnavail = e.kind === 'unavailable'
                    const tagColor = isRate ? YELLOW : isUnavail ? YELLOW : RED
                    const tag = isRate ? 'RATE-LIMIT' : isUnavail ? 'PLAN LIMIT' : 'ERROR'
                    return (
                      <div key={i} style={{
                        background: THEME.colors.negativeSurface, border: `1px solid ${BORDER}`, borderRadius: 3,
                        padding: '5px 8px', fontSize: 10, fontFamily: MONO, color: THEME.colors.secondary, lineHeight: 1.5,
                      }}>
                        <span style={{ color: tagColor, fontWeight: 700 }}>{tag}</span>
                        <span style={{ color: THEME.colors.secondary, marginLeft: 8 }}>{new Date(e.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <div style={{ color: THEME.colors.secondary, fontSize: 10, marginTop: 2, wordBreak: 'break-all' }}>
                          {e.detail?.url || e.detail?.message || '—'}
                          {e.detail?.status ? ` · status ${e.detail.status}` : ''}
                          {e.detail?.hint ? ` · ${e.detail.hint}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, color = THEME.colors.text }) {
  return (
    <div style={{ padding: 8, background: THEME.colors.negativeSurface, borderRadius: 3 }}>
      <div style={{ fontSize: 9, color: THEME.colors.secondary, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color, fontFamily: MONO, fontWeight: 700 }}>{value}</div>
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
            background: THEME.colors.background, border: `1px solid ${accent}55`, borderLeft: `3px solid ${accent}`,
            borderRadius: 5, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 800, color: THEME.colors.text, lineHeight: 1.3 }}>{t.title}</div>
              <button onClick={() => dismiss(t.id)} style={{ background: 'transparent', border: 'none', color: THEME.colors.secondary, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>✕</button>
            </div>
            {t.body && (
              <div style={{ fontSize: 11, fontFamily: MONO, color: THEME.colors.secondary, lineHeight: 1.5 }}>{t.body}</div>
            )}
            {t.action && (
              <button onClick={() => { try { t.action.onClick?.() } catch {}; dismiss(t.id) }} style={{
                alignSelf: 'flex-start', background: accent, color: THEME.colors.background, border: 'none',
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
  const labelStyle = { fontSize: 10, fontFamily: MONO, color: THEME.colors.secondary, letterSpacing: '0.14em', textTransform: 'uppercase' }

  if (!pm?.active) {
    return (
      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Overnight & Pre-Market</div>
        <div style={{ fontSize: 11, fontFamily: MONO, color: THEME.colors.secondary }}>
          No pre-market data yet for {ticker}. Live data activates after the 4:00 ET pre-market open with your Massive API key connected.
        </div>
      </div>
    )
  }

  const gapColor = pm.gapPct == null ? THEME.colors.secondary : pm.gapPct > 0 ? LIME : pm.gapPct < 0 ? RED : THEME.colors.secondary
  const gapLabel = pm.gap == null ? '—'
    : `${pm.gap >= 0 ? '+' : '-'}$${Math.abs(pm.gap).toFixed(2)} (${pm.gapPct >= 0 ? '+' : ''}${pm.gapPct.toFixed(2)}%)`
  const trendColor = pm.trend === 'trending up' ? LIME : pm.trend === 'trending down' ? RED : YELLOW

  const Stat = ({ label, value, color = THEME.colors.text }) => (
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
              color: isActive ? LIME : THEME.colors.secondary,
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
