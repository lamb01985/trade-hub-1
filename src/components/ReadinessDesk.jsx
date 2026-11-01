import { useState } from 'react'
import { Activity, ChartCandlestick, Sigma, RefreshCw } from 'lucide-react'
import { DESK_SYMBOLS, eastern, evidenceStatus, evidenceLabel, sessionAt, deskStructure } from '../lib/marketEvidence.js'
import { useDeskMarketData } from '../hooks/useDeskMarketData.js'
import WorkspaceShell from './workspace/WorkspaceShell.jsx'
import { PageHeading, Panel, StatusBadge, MetricCard, EmptyState } from './workspace/primitives.jsx'
import ChartTab from './Chart.jsx'
import OptionsContracts from './OptionsContracts.jsx'
import { Fld } from './ui.jsx'

const NAV = [
  {id:'desk',label:'Trading Desk',icon:ChartCandlestick},
  {id:'options',label:'Options Intelligence',icon:Sigma},
  {id:'health',label:'Data Health',icon:Activity},
]
export const deskNumber = (v, digits = 4) => v == null ? '—' : v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:digits})
const stamp = v => v ? new Date(v).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}) : 'Timestamp unavailable'
const signed = (v,digits=2) => v == null ? '—' : `${v>=0?'+':''}${v.toFixed(digits)}`
const stateOf = (o,now) => o?.error || evidenceStatus(o?.timestamp,{now,kind:o?.kind,timeframe:o?.timeframe})
const recent = (o,now) => stateOf(o,now)==='RECENT'

export default function ReadinessDesk() {
  const [symbol,setSymbol] = useState('QQQ')
  const [view,setView] = useState('desk')
  const [period,setPeriod] = useState('current')
  const [refresh,setRefresh] = useState(0)
  const [selectionError,setSelectionError] = useState('')
  const {feed,context,now} = useDeskMarketData(symbol,period,refresh)
  const records = feed.data?.stocks?.data || []
  const selected = symbol==='VIX'?feed.data?.vix?.data:records.find(row=>row.symbol===symbol)
  const selectedContext = context.data?.symbol===symbol && context.data?.period===period ? context.data : null
  const structure = deskStructure(selectedContext)
  const trade = selected?.trade, quote = selected?.quote
  const currentSession = sessionAt(now)
  const observationError = feed.error || (symbol==='VIX'?feed.data?.vix?.error:feed.data?.stocks?.error) || selected?.error
  const sourceAvailable = !observationError && trade?.price!=null
  const ind = selectedContext?.indicators
  const prior = selectedContext?.previous?.data?.[0]
  const lastBarState = evidenceStatus(ind?.lastTimestamp,{now,kind:'MINUTE_AGGREGATE'})
  function select(value) {
    const next = value.trim().toUpperCase()
    if (!DESK_SYMBOLS.includes(next)) {setSelectionError('Choose a supported watchlist symbol.');return}
    setSelectionError('');setSymbol(next)
  }
  const active = NAV.find(item=>item.id===view)
  return <WorkspaceShell active={active} showSignOut={false} primaryNav={NAV} navGroups={[]} onNavigate={item=>setView(item.id)} ticker={symbol} onTicker={select}
    session={currentSession.replaceAll('_',' ')} connected={sourceAvailable} connectionLabel={sourceAvailable?'Massive connected':feed.loading?'Connecting…':'Data unavailable'}
    freshness={{fresh:recent(trade,now),label:observationError||evidenceLabel(trade,now)}}
    status={<span>Last trade {stamp(trade?.timestamp)}</span>} actions={<button className="eq-text-action" onClick={()=>setView('health')}>Data Health</button>}>
    <PageHeading eyebrow="TradeHub · Personal trading workspace" title={active.label}
      description={view==='desk'?'Price action, reference levels and a plan for both directions.':view==='options'?'Contract pricing and dated liquidity evidence.':'Source timestamps, coverage and provider status.'}
      actions={<button className="eq-button" disabled={feed.loading||context.loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/>{feed.loading?'Refreshing…':'Refresh data'}</button>}/>
    {selectionError && <p role="alert">{selectionError}</p>}
    {currentSession==='CLOSED' && <p className="desk-session-note" role="status">Market closed. Last trades and quotes are recorded observations; they are not executable live prices.</p>}
    {observationError && <p role="alert" className="desk-session-note">{observationError} · Market observations unavailable. No historical price is substituted.</p>}
    {view==='health' ? <DataHealth feed={feed} context={context} selected={selected} now={now}/> : <>
      <div className="desk-pulse" aria-label="Priority watchlist">{['QQQ','SPY','NVDA','AMD'].map(s=>{
        const row=records.find(r=>r.symbol===s)
        return <button key={s} className="eq-pulse-instrument" aria-pressed={s===symbol} onClick={()=>select(s)}><div><strong>{s}</strong><span className={row?.change?.amount>=0?'desk-up':'desk-down'}>{signed(row?.change?.percent)}%</span></div><span>{deskNumber(row?.trade?.price)}</span><small>{evidenceLabel(row?.trade,now)}</small></button>
      })}</div>
      <div className="desk-layout">
        <Panel title="Watchlist" description="Last trade · session change" className="desk-watchlist">
          <div className="eq-table-scroll"><table className="eq-data-table"><thead><tr><th>Symbol</th><th>Last</th><th>Change</th></tr></thead><tbody>{DESK_SYMBOLS.filter(s=>s!=='VIX').map(s=>{
            const row=records.find(r=>r.symbol===s),c=row?.change
            return <tr key={s} className={s===symbol?'desk-selected':''} data-testid={`watch-${s}`}><th><button className="eq-text-action" aria-pressed={s===symbol} onClick={()=>select(s)}>{s}</button><small>{evidenceLabel(row?.trade,now)}</small></th><td className="eq-number">{deskNumber(row?.trade?.price)}<small>{row?.trade?.timestamp?stamp(row.trade.timestamp):'Not supplied'}</small></td><td className={`eq-number ${c?.amount==null?'':c.amount>=0?'desk-up':'desk-down'}`}>{signed(c?.amount)}<small>{signed(c?.percent)}%{c?.date?` · ${c.date.slice(5)}`:''}</small></td></tr>
          })}</tbody></table></div>
          <p className="eq-fine-print">Change = last trade versus the prior regular close for its observed session. Select a symbol for bid/ask and reference dates.</p>
        </Panel>
        <div className="desk-selected-workspace">
          <section className="desk-instrument" aria-label={`${symbol} quote`} data-testid="selected-quote">
            <div><span className="eq-eyebrow">{selected?.instrumentType||'Instrument'} · Massive</span><h2>{symbol} <StatusBadge tone={recent(trade,now)?'positive':'neutral'}>{evidenceLabel(trade,now)}</StatusBadge></h2><p>{trade?.session?.replaceAll('_',' ')||'Session unavailable'} · {stamp(trade?.timestamp)}</p></div>
            <div className="desk-last-price" data-testid="selected-price">{deskNumber(trade?.price)}<small>Last trade{symbol==='VIX'?' / index value':''}</small></div>
          </section>
          <div className="eq-metrics-grid desk-quote-metrics">
            <MetricCard label={`Change · ${selected?.change?.date||'date unavailable'}`} value={selected?.change?.amount!=null?`${signed(selected.change.amount)} (${signed(selected.change.percent)}%)`:'—'} detail={`Versus ${selected?.change?.baselineDate||'unavailable'} regular close`} tone={selected?.change?.amount==null?'neutral':selected.change.amount>=0?'positive':'negative'}/>
            <MetricCard label="Bid / ask" value={`${deskNumber(quote?.bid)} / ${deskNumber(quote?.ask)}`} detail={`${evidenceLabel(quote,now)} · ${stamp(quote?.timestamp)}`}/>
            <MetricCard label="Quoted spread" value={deskNumber(selected?.spread)} detail="Recorded ask − bid · verify age before use"/>
            <MetricCard label="Prior close · change baseline" value={deskNumber(selected?.prior?.close?.value)} detail={`${selected?.prior?.close?.date||'Date unavailable'} · regular-session close`}/>
          </div>
          {view==='options' ? <>
            <div className="desk-quick-options"><span>Priority underlyings</span>{['QQQ','SPY','NVDA','AMD','PLTR'].map(s=><button className="eq-button" key={s} aria-pressed={s===symbol} onClick={()=>select(s)}>{s}</button>)}</div>
            {symbol!=='VIX'?<OptionsContracts key={symbol} ticker={symbol} lockedUnderlying/>:<EmptyState title="VIX options unavailable">This desk supports equity/ETF options snapshots. No equity contract is substituted for an index.</EmptyState>}
          </> : <>
            <Panel title={`${symbol} · Price action`} description={`Minute aggregates · CT axis · ${selectedContext?.date||'verifying date'} · ${period==='completed'?'Historical review':'Current calendar session'}`}
              actions={<div className="eq-segmented" aria-label="Bar session"><button aria-pressed={period==='current'} onClick={()=>setPeriod('current')}>Today</button><button aria-pressed={period==='completed'} onClick={()=>setPeriod('completed')}>Last completed session</button></div>}>
              <p className="desk-bar-status" role="status">{period==='completed'?'Historical session review — not a live feed. ':''}{context.error||selectedContext?.bars?.error||(!selectedContext?.bars?.data?.length?'No bars for the requested session.':`${selectedContext.bars.data.length} completed minute bars · last ${stamp(selectedContext.bars.data.at(-1).timestamp)}`)}</p>
              <div className="eq-legacy-content desk-chart"><ChartTab key={`${symbol}:${period}`} researchOnly ticker={symbol} liveData={structure.chartData} levelMap={structure.levelMap} trades={[]}/></div>
            </Panel>
            <div className="desk-structure-grid">
              <Panel title="Trading structure" description={`${selectedContext?.date||eastern(now).date} · calculated from supplied bars`}>
                <div className="desk-level-grid">
                  {[['Previous high',prior?.h],['Previous low',prior?.l],['Previous close',prior?.c],['Premarket high',ind?.sessions?.PREMARKET?.high],['Premarket low',ind?.sessions?.PREMARKET?.low],['After-hours high',ind?.sessions?.AFTER_HOURS?.high],['After-hours low',ind?.sessions?.AFTER_HOURS?.low],['RTH VWAP',ind?.vwap],['EMA 9',ind?.ema9],['EMA 20',ind?.ema20],['EMA 50',ind?.ema50]].map(([label,value])=><div key={label}><span>{label}</span><strong>{deskNumber(value)}</strong></div>)}
                </div>
                <p className="eq-fine-print">Previous levels: {selectedContext?.priorDate||'date unavailable'} daily bar{selectedContext?.previous?.error?` · ${selectedContext.previous.error}`:''}. Premarket / after-hours belong only to {selectedContext?.date||'the selected date'}.</p>
                <div className="desk-trend"><strong>{structure.trend}</strong><span>{ind?.barCount??0} RTH bars · {lastBarState.replaceAll('_',' ').toLowerCase()} · {stamp(ind?.lastTimestamp)}</span></div>
              </Panel>
              <Panel title="Support & resistance" description="Observed levels and calculated floor pivots">
                <div className="eq-table-scroll"><table className="eq-data-table"><thead><tr><th>Reference</th><th>Price</th></tr></thead><tbody>{structure.levelMap.levels.map((level,i)=><tr key={`${level.label}:${i}`}><td>{level.label}</td><td className="eq-number">{deskNumber(level.price)}</td></tr>)}</tbody></table></div>
                {!structure.levelMap.levels.length&&<p className="eq-fine-print">No validated reference levels supplied.</p>}
                <details className="desk-method"><summary>How these levels are calculated</summary><p>Previous high/low/close and premarket extremes come directly from dated aggregates. PP = (H + L + C) / 3; R1 = 2×PP − L; S1 = 2×PP − H; R2/S2 = PP ± (H − L); R3 = H + 2×(PP − L); S3 = L − 2×(H − PP). VWAP weights provider minute VWAP by volume. EMA9/20/50 use completed RTH closes with SMA seeding. Sparse feed minutes are not filled.</p></details>
              </Panel>
            </div>
            <Panel title="Plan both directions" description="Discretionary scenarios · no backtested edge or automatic trigger evaluation">
              <div className="desk-scenarios">{structure.scenarios.map(s=><article key={s.side}><h3 className={s.side==='Bullish'?'desk-up':'desk-down'}>{s.side} · {deskNumber(s.boundary)}</h3><p><strong>Trigger:</strong> {s.boundary!=null?s.trigger:'Unavailable without validated session boundaries.'}</p><p><strong>Invalidation:</strong> {s.boundary!=null?s.invalidation:'Unavailable.'}</p><p><strong>Next reference:</strong> {s.target?`${s.target.label} at ${deskNumber(s.target.price)}`:'No supplied level beyond this boundary.'}</p></article>)}</div>
              <p className="eq-fine-print">Boundary = the higher of previous-day / premarket highs for the bullish case, or the lower of their lows for the bearish case. Retest quality is discretionary. These are hypotheses, not instructions or outcome forecasts. {period==='completed'?'Historical review only.':currentSession==='CLOSED'?'Market closed; no live confirmation.':'Confirm current bars and quotes before acting.'}</p>
              <ManualRisk key={symbol}/>
              <div className="eq-panel-footer"><span>Underlying prices · contract premiums have separate risk</span><button className="eq-text-action" onClick={()=>setView('options')}>Inspect {symbol} options →</button></div>
            </Panel>
          </>}
        </div>
      </div>
    </>}
  </WorkspaceShell>
}
function ManualRisk() {
  const [entry,setEntry]=useState(''),[stop,setStop]=useState(''),[target,setTarget]=useState('')
  const valid = [entry,stop,target].every(v=>v!==''&&Number.isFinite(Number(v))&&Number(v)>0)
  const ordered = +target>+entry&&+entry>+stop || +target<+entry&&+entry<+stop
  const ratio = valid&&ordered?Math.abs((+target-+entry)/(+entry-+stop)):null
  return <details className="desk-method"><summary>Manual reward / risk check</summary><div className="desk-risk-fields"><Fld label="Entry" value={entry} onChange={setEntry}/><Fld label="Invalidation / stop" value={stop} onChange={setStop}/><Fld label="Target" value={target} onChange={setTarget}/></div><p>{ratio==null?'Enter ordered entry, stop and target prices.':`${ratio.toFixed(2)}:1 before costs, slippage and gap risk.`} Manual inputs are not generated signals.</p></details>
}
function DataHealth({feed,context,selected,now}) {
  return <div className="desk-health">
    <Panel title="Feed status" description="Authenticated Massive REST · credentials remain server-side">
      <div className="desk-level-grid"><div><span>Equity / ETF snapshots</span><strong>{feed.error||feed.data?.stocks?.error||`${feed.data?.stocks?.data?.length??0} symbols available`}</strong></div><div><span>Last retrieval</span><strong>{stamp(feed.data?.fetchedAt)}</strong></div><div><span>Selected trade</span><strong>{stateOf(selected?.trade,now)}</strong></div><div><span>Selected quote</span><strong>{stateOf(selected?.quote,now)}</strong></div></div>
      <p className="eq-fine-print">Quotes poll every 30 seconds after completion; bars every 60 seconds. Receipt time never replaces source time. Snapshot delay is unverified where Massive supplies no timeframe. Provider access does not establish exchange licensing; use the owner's approved entitlements.</p>
      <p className="eq-fine-print">VIX (I:VIX): {feed.data?.vix?.error||'See index observation below'} · ES/NQ: {feed.data?.futures?.error||'Unavailable'} · No ETF substitutes.</p>
    </Panel>
    <Panel title="Provenance & raw normalized observations" description="Trade, quote, daily reference and minute aggregates remain distinct">
      <details><summary>Watchlist observations</summary><pre>{JSON.stringify(feed.data||{error:feed.error||'Loading'},null,2)}</pre></details>
      <details><summary>Selected symbol bars and calculations</summary><pre>{JSON.stringify(context.data||{error:context.error||'Loading'},null,2)}</pre></details>
    </Panel>
  </div>
}
