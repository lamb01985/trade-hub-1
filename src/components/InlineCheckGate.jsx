// ─────────────────────────────────────────────────────────────────────────────
// InlineCheckGate.jsx — collapsible Pre-flight Check gate for the TRADE tab.
//
// Wraps the existing CheckTab in a status header bar derived from today's
// checkLog entry. Expanded by default. Collapsed shows just the last verdict
// (TRADE / NO TRADE / FORCED) + direction + time. The CheckTab itself stays
// mounted via display:none so direction and rule-5 text persist across toggles.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { useLocalStorage } from '../hooks/useStore.js'
import CheckTab from './Check.jsx'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL } from '../constants.js'

export default function InlineCheckGate({ liveData, levelMap, mtfAlignment, ticker = 'QQQ' }) {
  const [expanded, setExpanded] = useState(true)
  const [logRaw] = useLocalStorage('checkLog', [])

  // Derive today's most recent verdict for the collapsed status pill. Same
  // ET-date derivation App.jsx uses for checklistComplete (lines 205-221).
  const todayStatus = useMemo(() => {
    if (!Array.isArray(logRaw) || logRaw.length === 0) return null
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
    const todayET = fmt.format(new Date())
    const entry = logRaw.find(e => e?.timestamp && fmt.format(new Date(e.timestamp)) === todayET)
    if (!entry) return null
    return {
      verdict: entry.verdict,
      direction: entry.direction,
      forced: !!entry.override,
      time: new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
  }, [logRaw])

  const pillColor = !todayStatus ? '#666'
    : todayStatus.verdict === 'TRADE' ? LIME
    : todayStatus.verdict === 'TRADE_FORCED' ? YELLOW
    : RED
  const pillLabel = !todayStatus ? 'NO CHECK TODAY'
    : todayStatus.verdict === 'TRADE' ? `TRADE ${todayStatus.direction}`
    : todayStatus.verdict === 'TRADE_FORCED' ? `FORCED ${todayStatus.direction}`
    : `NO TRADE ${todayStatus.direction}`

  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: MONO, color: '#e8e8e8',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Pre-flight Check
          </span>
          <span style={{
            fontSize: 10, color: pillColor, fontWeight: 700, letterSpacing: '0.12em',
            border: `1px solid ${pillColor}55`, padding: '3px 9px', borderRadius: 3,
          }}>
            {pillLabel}
          </span>
          {todayStatus && (
            <span style={{ fontSize: 9, color: '#555', fontFamily: MONO }}>{todayStatus.time}</span>
          )}
        </span>
        <span style={{ fontSize: 11, color: '#888' }}>{expanded ? '▼' : '▶'}</span>
      </button>

      <div style={{ display: expanded ? 'block' : 'none', padding: '0 18px 18px' }}>
        <CheckTab
          liveData={liveData}
          levelMap={levelMap}
          mtfAlignment={mtfAlignment}
          ticker={ticker}
          inline={true}
        />
      </div>
    </div>
  )
}
