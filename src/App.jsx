import { useState, useEffect, useMemo } from 'react'
import { useLocalStorage } from './hooks/useStore.js'
import { useLiveData } from './hooks/useLiveData.js'
import { buildLevelMap } from './lib/levels.js'
import { computeMTF, alignmentScore } from './lib/structure.js'
import Command from './components/Command.jsx'
import Levels from './components/Levels.jsx'
import ChartTab from './components/Chart.jsx'
import CalendarTab from './components/Calendar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { getAllEvents, highImpactToday } from './lib/calendar.js'
import { ORBTab, IVAnalyzerTab, CalculatorTab, ChecklistTab, JournalTab, StatsTab, WatchlistTab, PrepTab } from './components/tabs.jsx'
import GlossaryModal from './components/Glossary.jsx'
import { LIME, RED, YELLOW, MONO, SANS, DARK, BORDER, todayStr, uid, getSession } from './constants.js'

const TABS = [
  { id: 'watchlist', label: 'Watchlist', desc: 'Stocks to watch' },
  { id: 'prep', label: 'Prep', desc: 'Morning game plan' },
  { id: 'command', label: 'Command', desc: 'Session center' },
  { id: 'calendar', label: 'Calendar', desc: 'Events & catalysts' },
  { id: 'levels', label: 'Levels', desc: 'Live level map', accent: true },
  { id: 'chart', label: 'Chart', desc: 'Live price chart', accent: true },
  { id: 'orb', label: 'ORB', desc: 'Opening range' },
  { id: 'iv', label: 'IV', desc: 'Options pricing' },
  { id: 'checklist', label: 'Checklist', desc: 'Discipline gate' },
  { id: 'calc', label: 'Calculator', desc: 'R:R + trade size' },
  { id: 'journal', label: 'Journal', desc: 'Trade log' },
  { id: 'stats', label: 'Stats', desc: 'Performance' },
]

const defaultSettings = { dailyLossLimit: 500, maxTradesPerDay: 5, orPeriod: '15', alertsEnabled: false }
const defaultPrep = { ticker: 'QQQ', orPeriod: '15', orbHigh: '', orbLow: '', keyLevel: '', plannedStrike: '', plannedDTE: '1', ivNote: '', gamePlan: '', avoidNotes: '', dayReview: '', marketEvents: '', instrument: 'options' }

export default function App() {
  const [activeTab, setActiveTab] = useState('command')
  const [apiKey, setApiKey] = useLocalStorage('th-apikey', '')
  const [anthropicKey, setAnthropicKey] = useLocalStorage('th-anthropic-key', '')
  const [trades, setTrades] = useLocalStorage('th-trades', [])
  const [settings, setSettings] = useLocalStorage('th-settings', defaultSettings)
  const [prep, setPrep] = useLocalStorage('th-prep', defaultPrep)
  const [savedPreps, setSavedPreps] = useLocalStorage('th-saved-preps', {})
  const [orbPrefill, setOrbPrefill] = useState(null)
  const [calcPrefill, setCalcPrefill] = useState(null)
  const [checklistPassed, setChecklistPassed] = useState(false)
  const [manualFibs, setManualFibs] = useState(null)
  const [customLevels, setCustomLevels] = useState([])
  const [showGlossary, setShowGlossary] = useState(false)

  // Build level map for alert checking
  const levelMapInput = useMemo(() => ({
    orbHigh: parseFloat(orbPrefill?.orbHigh || prep.orbHigh) || null,
    orbLow: parseFloat(orbPrefill?.orbLow || prep.orbLow) || null,
  }), [orbPrefill, prep])

  const liveData = useLiveData(apiKey, prep.ticker || 'QQQ', null, settings)

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

  // Loss limit lockout
  const todayTrades = trades.filter(t => t.date?.slice(0, 10) === todayStr())
  const todayPnl = todayTrades.reduce((a, t) => a + (t.pnl || 0), 0)
  const lockedOut = settings.dailyLossLimit > 0 && todayPnl <= -settings.dailyLossLimit
  const maxTradesReached = settings.maxTradesPerDay > 0 && todayTrades.length >= settings.maxTradesPerDay

  function handleLogTrade(trade) {
    setTrades(prev => [...prev, trade])
    setActiveTab('journal')
  }

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
              <button onClick={() => setActiveTab('levels')} title="Jump to Levels tab" style={{ fontSize: 9, color: LIME, fontFamily: MONO, background: 'transparent', border: `1px solid ${LIME}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', animation: 'hdrpulse 1.5s infinite', cursor: 'pointer' }}>ON LEVEL →</button>
            )}
            {fullLevelMap.setupQuality === 'APPROACHING' && (
              <button onClick={() => setActiveTab('levels')} title="Jump to Levels tab" style={{ fontSize: 9, color: YELLOW, fontFamily: MONO, background: 'transparent', border: `1px solid ${YELLOW}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', cursor: 'pointer' }}>APPROACHING →</button>
            )}
            {mtfAlignment.score > 0 && (() => {
              const c = mtfAlignment.score >= 85 ? LIME : mtfAlignment.score >= 70 ? LIME : mtfAlignment.score >= 55 ? YELLOW : mtfAlignment.score >= 40 ? '#F97316' : RED
              return (
                <button onClick={() => setActiveTab('chart')} title={`${mtfAlignment.label} — jump to Chart`} style={{ fontSize: 9, color: c, fontFamily: MONO, background: 'transparent', border: `1px solid ${c}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', cursor: 'pointer' }}>ALIGN: {mtfAlignment.score} →</button>
              )
            })()}
          </div>
        </div>

        {/* Setup banner — shown when no API key */}
        {!apiKey && (
          <div style={{ background: '#0c1408', borderTop: `1px solid ${LIME}22`, borderBottom: `1px solid ${LIME}22` }}>
            <div style={{ maxWidth: 960, margin: '0 auto', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11, fontFamily: MONO, color: '#7a9a6a' }}>
                ↳ Add your Massive API key in the <strong style={{ color: LIME }}>Command</strong> tab to activate live price, VWAP, and level intelligence.
              </span>
              <button
                onClick={() => setActiveTab('command')}
                style={{ background: LIME, color: '#000', border: 'none', borderRadius: 3, padding: '5px 14px', fontFamily: MONO, fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Go to Command →
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
                  {tab.id === 'levels' && fullLevelMap.setupQuality === 'ON LEVEL' && (
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
            <button onClick={() => setActiveTab('calendar')} style={{ background: 'transparent', border: `1px solid ${YELLOW}44`, color: YELLOW, fontFamily: MONO, fontSize: 9, padding: '3px 9px', borderRadius: 3, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>View Calendar →</button>
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

      {/* Content */}
      <div style={{ maxWidth: activeTab === 'chart' ? '100%' : 960, margin: '0 auto', padding: activeTab === 'chart' ? '20px 24px 40px' : '28px 20px 60px' }}>
        {activeTab === 'watchlist' && (
          <WatchlistTab
            apiKey={apiKey}
            savedPreps={savedPreps}
            onSendToPrep={entry => { setPrep(p => ({ ...p, ticker: entry.ticker, orbHigh: entry.priorHigh || '', orbLow: entry.priorLow || '', plannedStrike: entry.plannedStrike || '', plannedDTE: entry.plannedDTE || '', ivNote: entry.ivNote || '' })); setActiveTab('prep') }}
            onLoadSavedPrep={saved => { const { dateSaved, ...data } = saved; setPrep(p => ({ ...p, ...data })); setActiveTab('prep') }}
          />
        )}

        {activeTab === 'prep' && (
          <PrepTab
            prep={prep}
            onPrepChange={setPrep}
            onSendToORB={fill => { setOrbPrefill(fill); setActiveTab('orb') }}
            settings={settings}
            liveData={liveData}
            anthropicKey={anthropicKey}
            savedPreps={savedPreps}
            onSavedPrepsChange={setSavedPreps}
            levelMap={fullLevelMap}
            mtfAlignment={mtfAlignment}
          />
        )}

        {activeTab === 'command' && (
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
          />
        )}

        {activeTab === 'calendar' && (
          <ErrorBoundary label="Calendar tab">
            <CalendarTab />
          </ErrorBoundary>
        )}

        {activeTab === 'levels' && (
          <Levels
            liveData={{ ...liveData, lastAlerts: liveData.lastAlerts }}
            orbHigh={orbPrefill?.orbHigh || prep.orbHigh}
            orbLow={orbPrefill?.orbLow || prep.orbLow}
            settings={settings}
            onSettingsChange={setSettings}
            mtfAlignment={mtfAlignment}
          />
        )}

        {activeTab === 'chart' && (
          <ErrorBoundary label="Chart tab">
            <ChartTab
              liveData={liveData}
              levelMap={fullLevelMap}
              trades={trades}
              ticker={prep.ticker || 'QQQ'}
              customLevels={customLevels}
              onCustomLevelsChange={setCustomLevels}
              mtfAlignment={mtfAlignment}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'orb' && (
          <ORBTab
            settings={settings}
            onSendToCalc={fill => { setCalcPrefill(fill); setActiveTab('calc') }}
            prepFill={orbPrefill}
            liveData={liveData}
          />
        )}

        {activeTab === 'iv' && (
          <IVAnalyzerTab apiKey={apiKey} instrument={prep.instrument || 'options'} />
        )}

        {activeTab === 'checklist' && (
          <ChecklistTab onPass={() => { setChecklistPassed(true); setActiveTab('calc') }} instrument={prep.instrument || 'options'} setupQuality={fullLevelMap.setupQuality} alignmentScore={mtfAlignment.score} />
        )}

        {activeTab === 'calc' && (
          <CalculatorTab
            prefill={calcPrefill}
            onLogTrade={handleLogTrade}
            checklistPassed={checklistPassed}
            lockedOut={lockedOut}
            maxTradesReached={maxTradesReached}
            apiKey={apiKey}
            instrument={prep.instrument || 'options'}
          />
        )}

        {activeTab === 'journal' && (
          <JournalTab
            trades={trades}
            onUpdate={handleUpdateTrade}
            onDelete={handleDeleteTrade}
            anthropicKey={anthropicKey}
            prep={prep}
          />
        )}

        {activeTab === 'stats' && (
          <StatsTab trades={trades} />
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
    </div>
  )
}
