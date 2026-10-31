import { THEME } from '../lib/theme.js'
import { useState } from 'react'
import { Card, Btn } from './ui.jsx'
import { BLUE, LIME, YELLOW, MONO, BORDER, f2 } from '../constants.js'
import { marketDateStr } from '../lib/massive.js'
import { RESEARCH_SESSION, RESEARCH_SOURCE, RESEARCH_AS_OF, SESSION_RESEARCH, researchStatus } from '../lib/sessionResearch.js'

export default function SessionResearch({ ticker, onSelectTicker }) {
  const [expanded, setExpanded] = useState(ticker || 'QQQ')
  const status = researchStatus(marketDateStr())
  const item = SESSION_RESEARCH.find(row => row.ticker === expanded) || SESSION_RESEARCH[0]
  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong style={{ color: LIME }}>Session watchlist: {RESEARCH_SESSION}</strong>
        <span style={{ color: YELLOW, fontFamily: MONO, fontSize: 11 }}>{status} | CONDITIONAL, NOT LIVE SIGNALS</span>
      </div>
      <p style={{ color: THEME.colors.secondary, fontSize: 12, lineHeight: 1.6 }}>
        {RESEARCH_SOURCE}. After-hours coverage ends {new Date(RESEARCH_AS_OF).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT. These references require a premarket refresh. No backtested win rate is claimed.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SESSION_RESEARCH.map(row => <Btn key={row.ticker} small variant={expanded === row.ticker ? 'lime' : undefined} onClick={() => setExpanded(row.ticker)}>#{row.priority} {row.ticker}</Btn>)}
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{item.ticker}: {item.thesis}</strong>
        <Btn small onClick={() => onSelectTicker?.(item.ticker)}>Open {item.ticker} live map</Btn>
      </div>
      <p style={{ color: THEME.colors.secondary, fontSize: 12 }}>Regular close ${f2(item.close)} | After-hours reference ${f2(item.afterHours)} (historical)</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
          <thead><tr><th style={{ padding: 8 }}>Price</th><th>Source / reference</th><th>Session</th></tr></thead>
          <tbody>{[...item.levels].reverse().map(level => <tr key={`${level.price}-${level.label}`} style={{ borderTop: `1px solid ${BORDER}` }}>
            <td style={{ padding: 8, fontFamily: MONO, color: level.kind === 'extended' ? YELLOW : BLUE }}>${f2(level.price)}</td>
            <td>{level.label}</td><td style={{ color: THEME.colors.secondary }}>{level.kind === 'extended' ? 'After hours' : 'Regular'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.7, color: THEME.colors.secondary }}>
        <p><strong style={{ color: LIME }}>Long:</strong> {item.bullish}</p>
        <p><strong style={{ color: YELLOW }}>Short:</strong> {item.bearish}</p>
        <p><strong>Invalidation:</strong> {item.invalidation}</p>
        <p>Use 5-minute structure and the first 15-minute opening range. Require confirmation and room to the next target for at least 2:1 underlying reward/risk. Check option bid/ask, quote age, size and premium risk separately. SMH is context only.</p>
        <p>Before entry: refresh premarket high/low, verify current regular-session VWAP, and replace invalidated levels. Stop and target must come from the actual setup. The map never stages an order.</p>
      </div>
    </Card>
  )
}
