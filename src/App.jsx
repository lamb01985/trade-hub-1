import { useState, useEffect, useMemo } from 'react'
import { useLocalStorage } from './hooks/useStore.js'
import { useLiveData } from './hooks/useLiveData.js'
import { buildLevelMap } from './lib/levels.js'
import Command from './components/Command.jsx'
import Levels from './components/Levels.jsx'
import { ORBTab, IVAnalyzerTab, CalculatorTab, ChecklistTab, JournalTab, StatsTab, WatchlistTab, PrepTab } from './components/tabs.jsx'
import { LIME, RED, YELLOW, MONO, SANS, DARK, BORDER, todayStr, uid, getSession } from './constants.js'

const TABS = [
  { id: 'watchlist', label: 'Watchlist', desc: 'Stocks to watch' },
  { id: 'prep', label: 'Prep', desc: 'Morning game plan' },
  { id: 'command', label: 'Command', desc: 'Session center' },
  { id: 'levels', label: 'Levels', desc: 'Live level map', accent: true },
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

  // Build level map for alert checking
  const levelMapInput = useMemo(() => ({
    orbHigh: parseFloat(orbPrefill?.orbHigh || prep.orbHigh) || null,
    orbLow: parseFloat(orbPrefill?.orbLow || prep.orbLow) || null,
  }), [orbPrefill, prep])

  const liveData = useLiveData(apiKey, prep.ticker || 'QQQ', null, settings)

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
    customLevels,
  }), [liveData, manualFibs, levelMapInput, customLevels])

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
              <span style={{ fontSize: 9, color: LIME, fontFamily: MONO, border: `1px solid ${LIME}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em', animation: 'hdrpulse 1.5s infinite' }}>ON LEVEL</span>
            )}
            {fullLevelMap.setupQuality === 'APPROACHING' && (
              <span style={{ fontSize: 9, color: YELLOW, fontFamily: MONO, border: `1px solid ${YELLOW}44`, borderRadius: 3, padding: '3px 9px', letterSpacing: '0.1em' }}>APPROACHING</span>
            )}
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
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 60px' }}>
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
          />
        )}

        {activeTab === 'levels' && (
          <Levels
            liveData={{ ...liveData, lastAlerts: liveData.lastAlerts }}
            orbHigh={orbPrefill?.orbHigh || prep.orbHigh}
            orbLow={orbPrefill?.orbLow || prep.orbLow}
            settings={settings}
            onSettingsChange={setSettings}
          />
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
          <ChecklistTab onPass={() => { setChecklistPassed(true); setActiveTab('calc') }} instrument={prep.instrument || 'options'} />
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
    </div>
  )
}
