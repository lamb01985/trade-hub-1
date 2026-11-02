import { THEME } from '../lib/theme.js'
import { useState, useEffect } from 'react'
import { Card, Btn } from './ui.jsx'
import { BLUE, LIME, YELLOW, MONO, BORDER, f2 } from '../constants.js'
import { DESK_SYMBOLS, evidenceLabel } from '../lib/marketEvidence.js'
import { marketDateStr } from '../lib/massive.js'
import { RESEARCH_SESSION, RESEARCH_SOURCE, RESEARCH_AS_OF, SESSION_RESEARCH, researchStatus } from '../lib/sessionResearch.js'

export default function SessionResearch(props) {
  return props.current ? <CurrentResearch {...props}/> : <ArchivedResearch {...props}/>
}
function ArchivedResearch({ ticker, onSelectTicker, onOpenLiveMap, supportedSymbols }) {
  const [expanded, setExpanded] = useState(ticker || 'QQQ')
  useEffect(()=>setExpanded(ticker||'QQQ'),[ticker])
  const status = researchStatus(marketDateStr())
  const item = SESSION_RESEARCH.find(row => row.ticker === expanded) || SESSION_RESEARCH[0]
  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong style={{ color: LIME }}>Archived session watchlist: {RESEARCH_SESSION}</strong>
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
        <Btn small disabled={supportedSymbols && !supportedSymbols.includes(item.ticker)} onClick={() => (onOpenLiveMap || onSelectTicker)?.(item.ticker)}>Open {item.ticker} live map</Btn>
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

function CurrentResearch({ticker,current,onSelectTicker,onOpenLiveMap}) {
  const {state,structure,context,now}=current
  const rows=state.feed.data?.stocks?.data||[]
  const row=rows.find(r=>r.symbol===ticker)
  return <Card><strong style={{color:LIME}}>Ranked watchlist · planning {context?.date||'date being verified'}</strong>
    <p>Configured watch priority, not a signal score or predicted return. Live-map levels use the target session’s latest completed regular bar.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{DESK_SYMBOLS.filter(s=>s!=='VIX').map((s,i)=><Btn key={s} small variant={s===ticker?'lime':'ghost'} onClick={()=>onSelectTicker(s)}>#{i+1} {s}</Btn>)}</div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginTop:16}}><strong>{ticker} · conditional long / short plan</strong><Btn small disabled={!onOpenLiveMap} onClick={()=>onOpenLiveMap(ticker)}>Open {ticker} live map</Btn></div>
    <p>{row?.trade?.price!=null?`Last recorded trade $${f2(row.trade.price)}`:'Trade unavailable'} · {evidenceLabel(row?.trade,now)} · {row?.trade?.timestamp?new Date(row.trade.timestamp).toLocaleString('en-US',{timeZone:'America/Chicago',timeZoneName:'short'}):'Source time unavailable'}</p>
    {structure.scenarios.map(s=><div key={s.side} style={{borderTop:`1px solid ${BORDER}`,paddingTop:10}}><p><strong style={{color:s.side==='Bullish'?LIME:YELLOW}}>{s.side==='Bullish'?'Long':'Short'} boundary: {s.boundary==null?'Unavailable':`$${f2(s.boundary)}`}</strong></p>
      <p><strong>Entry confirmation:</strong> {s.boundary==null?'Unavailable without a validated previous or premarket range.':s.trigger}</p>
      <p><strong>Invalidation:</strong> {s.boundary==null?'Unavailable':`${s.invalidation} Boundary $${f2(s.boundary)}.`}</p>
      <p><strong>Reference target:</strong> {s.target?`${s.target.label} $${f2(s.target.price)} · source ${s.target.sourceDate||context?.date}`:'No supplied level beyond the boundary; target unavailable.'}</p></div>)}
    <p>Boundaries are the higher of previous-day/premarket highs or the lower of their lows. Scenarios are conditional interpretations, not confirmations. An actual entry and rejection/reclaim swing are required to define stop distance and risk/reward. No win rate, expected return or guaranteed outcome is claimed.</p>
    <PlanRisk key={ticker}/>
  </Card>
}
function PlanRisk() {
  const [entry,setEntry]=useState(''),[stop,setStop]=useState(''),[target,setTarget]=useState('')
  const valid=[entry,stop,target].every(v=>v!==''&&Number.isFinite(+v)&&+v>0)&&((+target>+entry&&+entry>+stop)||(+target<+entry&&+entry<+stop))
  return <details><summary>Entry / invalidation / reward-risk assumptions</summary><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{[['Confirmed entry',entry,setEntry],['Actual invalidation',stop,setStop],['Reference target',target,setTarget]].map(([label,value,set])=><label key={label}>{label}<input aria-label={label} type="number" value={value} onChange={e=>set(e.target.value)} style={{display:'block',maxWidth:160}}/></label>)}</div><p>{valid?`${(Math.abs((+target-+entry)/(+entry-+stop))).toFixed(2)}:1 before costs, slippage and gaps.`:'Reward/risk unavailable until ordered entry, invalidation and target are entered.'} Underlying prices only; option premium risk is separate. Boundary levels are not assumed fills.</p></details>
}
