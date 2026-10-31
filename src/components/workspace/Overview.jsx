import { ArrowUpRight, ChartNoAxesCombined, Crosshair, Bookmark, BriefcaseBusiness, ArrowRight, FileSearch, Layers3 } from 'lucide-react'
import { PortfolioSummary } from './Portfolio.jsx'
import { PageHeading, Panel, MetricCard, StatusBadge, EmptyState, TextAction } from './primitives.jsx'
import { tradeFreshness, normalizeTradeTimestamp } from '../../lib/quoteQuality.js'
import { THEME } from '../../lib/theme.js'

const money=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v):'—'
export const observationTime=value=>{const stamp=normalizeTradeTimestamp(value);return stamp?new Date(stamp).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' CT':'No source timestamp'}
export function verifiedBundle(ticker, data) { return data?.dataTicker===ticker ? data : null }
export function MarketPlot({ bars=[], ticker }) {
  const points=bars.map(b=>({close:b.c??b.close,time:b.t??b.time})).filter(b=>Number.isFinite(b.close)&&b.close>0&&Number.isFinite(b.time)).slice(-160)
  if(points.length<2)return <div className="eq-market-plot"><div className="eq-chart-grid" aria-hidden="true"/><EmptyState icon={ChartNoAxesCombined} title="No verified price series">A chart will appear when authenticated market observations are available. No sample prices are shown.</EmptyState></div>
  const prices=points.map(b=>b.close),low=Math.min(...prices),high=Math.max(...prices),span=high-low||1
  const path=points.map((p,i)=>`${i===0?'M':'L'} ${(i/(points.length-1))*800} ${190-((p.close-low)/span)*155}`).join(' ')
  return <div className="eq-market-plot"><div className="eq-chart-grid" aria-hidden="true"/><svg viewBox="0 0 800 220" preserveAspectRatio="none" role="img" aria-label={`${ticker} observed prices, ${points.length} bars`}><defs><linearGradient id="overview-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={THEME.colors.accent} stopOpacity=".17"/><stop offset="100%" stopColor={THEME.colors.accent} stopOpacity="0"/></linearGradient></defs><path d={`${path} L800 220 L0 220 Z`} fill="url(#overview-fill)"/><path d={path} fill="none" stroke={THEME.colors.accent} strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><div className="eq-chart-period">Observed bars · {observationTime(points[0].time)} — {observationTime(points.at(-1).time)}</div></div>
}
export default function Overview({ ticker, liveData, multiData={}, watchlist=[], trades=[], setups=[], levelMap, onNavigate, onTicker, onLogTrade, connected, session, schwab, aiCapability, events=[] }) {
  const selected=verifiedBundle(ticker,liveData),fresh=tradeFreshness(selected?.priceTimestamp),open=trades.filter(t=>t.status==='open')
  const activeSetups=setups.filter(s=>(s.status||'active')==='active'),savedTickers=[...new Set(['QQQ','SPY','IWM',...watchlist])].slice(0,6)
  const prior=selected?.prevDay,change=fresh.fresh&&Number.isFinite(prior?.close)&&prior.close>0?((selected.price/prior.close)-1)*100:null
  const sessionNote=session==='pre-market'?'Premarket focus: review catalysts, prepare your levels and define risk before the open.':['open','chop','power-hour'].includes(session)?'Regular session focus: monitor current observations, liquidity and execution risk.':session==='after-hours'?'After-hours focus: review the session, revisit your theses and prepare for the next open.':'Markets closed: review your research, positions and upcoming catalysts.'
  const nextExpirations=events.filter(event=>event.type==='opex').slice(0,3)
  const go=(tab,sub)=>onNavigate({tab,sub})
  return <div className="eq-overview">
    <PageHeading eyebrow="Your investment workspace" title="Personalized Overview" description="Your markets. Your capital. Your next decision." actions={<><button className="eq-button" onClick={()=>go('plan','watchlist')}><Bookmark size={15}/>Watchlist</button><button className="eq-button eq-button-primary" onClick={onLogTrade}>Log a trade<ArrowUpRight size={15}/></button></>}/>
    <p className="eq-session-note">{sessionNote}</p>
    <div className="eq-market-pulse" aria-label="Market pulse">{['SPY','QQQ','IWM','VIX','NQ','ES'].map(symbol=>{const supported=['SPY','QQQ','IWM'].includes(symbol),bundle=symbol===ticker?selected:supported?multiData[symbol]:null,quality=tradeFreshness(bundle?.priceTimestamp);return <button className="eq-pulse-instrument" key={symbol} onClick={()=>{if(supported)onTicker(symbol)}} disabled={!supported} aria-label={`${symbol} market pulse`}><div><strong>{symbol}</strong><StatusBadge>{bundle?.price!=null?quality.fresh?'Recent':'Recorded':'Unavailable'}</StatusBadge></div><span>{money(bundle?.price)}</span><small>{bundle?.price!=null?observationTime(bundle.priceTimestamp):supported?'No verified observation':symbol==='VIX'?'Index access not verified':'Futures access not verified'}</small></button>})}</div>
    <div className="eq-metrics-grid">
      <MetricCard label={`${ticker} last observation`} value={money(selected?.price)} detail={fresh.fresh?'Recent trade · Massive REST':`${fresh.label.toLowerCase()} · Massive REST`} icon={ChartNoAxesCombined}/>
      <MetricCard label="Versus prior session close" value={change===null?'—':`${change>=0?'+':''}${change.toFixed(2)}%`} detail={change===null?'Requires a recent trade and prior close':`Baseline ${prior.date || 'date unavailable'}`} tone={change===null?'neutral':change>=0?'positive':'negative'}/>
      <MetricCard label="Open journal positions" value={String(open.length)} detail="Saved locally · not broker account value" icon={BriefcaseBusiness}/>
      <MetricCard label="Saved active setups" value={String(activeSetups.length)} detail="Saved criteria · not confirmed live signals" icon={Crosshair}/>
    </div>
    <div className="eq-overview-main">
      <Panel title="Market overview" description="Observed price action. Source quality stays visible." actions={<TextAction onClick={()=>go('trade','chart')}>Open Trading Desk</TextAction>}>
        <div className="eq-chart-toolbar"><div className="eq-segmented">{['QQQ','SPY','IWM'].map(s=><button key={s} aria-pressed={ticker===s} onClick={()=>onTicker(s)}>{s}</button>)}</div><StatusBadge tone={fresh.fresh?'positive':'neutral'}>{fresh.fresh?'Recent observation':'Awaiting verified data'}</StatusBadge></div>
        <MarketPlot ticker={ticker} bars={selected?.intradayBars||[]}/>
        <div className="eq-source-footer"><span>Massive · authenticated REST</span><span>{observationTime(selected?.priceTimestamp)}</span></div>
      </Panel>
      <Panel title="Your watchlist" description="Saved focus. Verified quotes only." actions={<TextAction onClick={()=>go('plan','watchlist')}>Manage</TextAction>}>
        <div className="eq-watchlist-table"><table><thead><tr><th>Instrument</th><th>Last trade</th><th>Status</th></tr></thead><tbody>{savedTickers.map(symbol=>{
          const bundle=symbol===ticker?selected:multiData[symbol],quality=tradeFreshness(bundle?.priceTimestamp)
          return <tr key={symbol}><td><button className="eq-ticker-link" onClick={()=>onTicker(symbol)}><span className="eq-ticker-mark">{symbol.slice(0,1)}</span><span><strong>{symbol}</strong><small>{['QQQ','SPY','IWM'].includes(symbol)?'Index ETF':'Watchlist'}</small></span></button></td><td className="eq-number">{money(bundle?.price)}{bundle?.price!=null && <small className="eq-quote-time">{observationTime(bundle.priceTimestamp)}</small>}</td><td><StatusBadge tone={quality.fresh?'positive':'neutral'}>{quality.fresh?'Recent':bundle?.price!=null?'Recorded':'Unavailable'}</StatusBadge></td></tr>
        })}</tbody></table></div>
      </Panel>
    </div>
    <div className="eq-overview-bottom">
      <Panel title="Ranked opportunities" description="Radar · three distinct investment horizons" actions={<TextAction onClick={()=>go('opportunities')}>Explore</TextAction>}>{[['Long-term investments','Financial quality & valuation'],['LEAPS','Long-dated options & liquidity'],['Tactical shorts','Deterioration, catalysts & risk']].map(([label,detail])=><div className="eq-opportunity-row" key={label}><span>{label}<small>{detail}</small></span><StatusBadge>Not ranked</StatusBadge></div>)}<p className="eq-fine-print">Verified inputs and reviewed ranking policies are required. No opportunities are invented.</p></Panel>
      <Panel title="Upcoming events" description="Catalysts with source quality kept visible" actions={<TextAction onClick={()=>go('plan','calendar')}>All events</TextAction>}><div className="eq-opportunity-row"><span>Earnings & economic releases<small>Verified current coverage unavailable</small></span><StatusBadge>Unverified</StatusBadge></div>{nextExpirations.map((event,i)=><div className="eq-opportunity-row" key={i}><span>{event.name}<small>{event.date} · rule-based projection</small></span><StatusBadge>Verify expiry</StatusBadge></div>)}<p className="eq-fine-print">Contract holidays and official schedules require verification. Nasdaq earnings load in Events; coverage errors remain visible.</p></Panel>
      <PortfolioSummary schwab={schwab} onConnections={()=>go('trade','command')}/>
    </div>
    <div className="eq-personalized-grid">
      <Panel title="Market briefing" description="Claude · evidence-led interpretation"><div className="eq-research-shortcut"><span className="eq-shortcut-icon"><FileSearch size={22}/></span><div><h3>Briefing unavailable</h3><p>{aiCapability?.available?'Claude access is configured. A current, source-cited Overview briefing pipeline has not been connected.':'Authenticated Claude access and a verified current evidence packet are required.'}</p></div></div><div className="eq-panel-footer"><span>No generated text or citations substituted</span><TextAction onClick={()=>go('plan','prep')}>Session prep</TextAction></div></Panel>
      <Panel title="Alerts & invalidation" description="Act on verified changes, not stale observations"><div className="eq-compact-empty"><Crosshair size={23} strokeWidth={1.3}/><h3>{fresh.fresh?'Review active chart levels':'Current alert evidence unavailable'}</h3><p>{fresh.fresh?'Inspect the Trading Desk for source-dated levels and the existing alert engine.':'Live levels and invalidation alerts require verified ticker-matched observations.'}</p></div><div className="eq-panel-footer"><span>Existing risk controls remain active</span><TextAction onClick={()=>go('plan','levels')}>Key levels</TextAction></div></Panel>
      <Panel title="Thesis monitoring" description="Follow the evidence as the investment case evolves"><div className="eq-compact-empty"><Bookmark size={23} strokeWidth={1.3}/><h3>No verified thesis-change feed</h3><p>Saved research remains in your journal. Automated financial-change and catalyst monitoring is not yet connected.</p></div><div className="eq-panel-footer"><span>Original research records preserved</span><TextAction onClick={()=>go('review','research')}>Research journal</TextAction></div></Panel>
    </div>

  </div>
}
