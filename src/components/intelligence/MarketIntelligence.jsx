import { SectorRotationView } from '../Calendar.jsx'
import { isLocalServicePreview } from '../../lib/localPreview.js'
import { useCallback, useEffect, useState } from 'react'
import { Card, SLabel, Btn } from '../ui.jsx'
import { LIME, YELLOW } from '../../constants.js'
import { parseReport, freshness } from '../../lib/reportContract.js'
import { INTELLIGENCE_VIEWS } from '../../lib/intelligenceNavigation.js'
import OptionsIntelligence from './OptionsIntelligence.jsx'
import TrainingMode from './TrainingMode.jsx'
import AnalystBrief from './AnalystBrief.jsx'
import OperatorAccess from './OperatorAccess.jsx'
import './intelligence.css'

const value = v => v == null ? 'Unavailable' : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(v)
const percent = v => v == null ? 'Unavailable' : `${(v * 100).toFixed(2)}%`
function Status({ children, error = false }) { return <p role={error ? 'alert' : 'status'} style={{ color: YELLOW }}>{children}</p> }
function EvidenceTime({ time }) { return <p className="intel-time">Source: {time || 'Unavailable'} · {freshness(time)}</p> }
function Rows({ columns, rows, caption }) {
  return rows?.length ? <div className="intel-table" tabIndex={0} aria-label={caption}><table><caption>{caption}</caption><thead><tr>{columns.map(([k, title]) => <th key={k} scope="col">{title}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{columns.map(([k]) => <td key={k}>{value(r[k])}</td>)}</tr>)}</tbody></table></div> : <p>No observations available.</p>
}
function Facts({ items }) { return <dl className="intel-facts">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{value(v)}</dd></div>)}</dl> }
function Scenarios({ title, rows, symbol }) {
  const row = rows.find(x => x.symbol === symbol)
  return <section><SLabel>{title}</SLabel>{!row ? <p>Scenario unavailable.</p> : <><EvidenceTime time={row.source_timestamp}/><Facts items={[["Direction", row.direction], ["Trigger", row.trigger], ["Invalidation", row.invalidation], ["Targets", row.targets.length ? row.targets.map(value).join(', ') : null]]}/><p>{row.confirmation}</p><p className="intel-muted">Stand aside: {row.no_trade_if.join('; ')}</p></>}</section>
}
function MapView({ report }) {
  const symbols = [...new Set(['QQQ', 'SPY', 'IWM', 'SMH', ...Object.keys(report.daily_features)])]
  return <><Card><SLabel>Market regime</SLabel><strong style={{ color: LIME }}>{report.market_regime.label}</strong><p>{report.market_regime.method}</p></Card><div className="intel-grid">{symbols.map(symbol => {
    const f = report.daily_features[symbol]
    return <Card key={symbol}><h3>{symbol}</h3>{!f ? <Status>No observations available for this symbol.</Status> : <><EvidenceTime time={f.source_timestamp}/><Facts items={[["Friday completed-session close", f.close], ["Friday high", f.completed_session?.high], ["Friday low", f.completed_session?.low], ["Daily trend", f.daily_trend], ["Weekly trend", f.weekly_trend], ["Prior-to-source day high", f.previous_day.high], ["Prior-to-source day low", f.previous_day.low], ["Prior week high", f.previous_week.high], ["Prior week low", f.previous_week.low], ["ATR 14", f.atr14]]}/><p className="intel-muted">Legacy prior-day fields refer to the bar before the completed source session, Thursday in this sample.</p><p>Structural levels: {f.support_resistance.map(value).join(' · ') || 'Unavailable'}</p><Scenarios title="Intraday scenario, prior session structure" rows={report.intraday_playbook} symbol={symbol}/><Scenarios title="Swing scenario" rows={report.swing_playbook} symbol={symbol}/></>}</Card>
  })}</div></>
}
export function OptionsView({ report }) { return <OptionsIntelligence report={report}/> }
export function PlaybookView({ report, kind }) {
  const rows = kind === 'intraday' ? report.intraday_playbook : report.swing_playbook
  return <><Card><SLabel>{kind === 'intraday' ? 'Friday minute-bar structure' : 'Friday daily / weekly structure'}</SLabel><p>{kind === 'intraday' ? 'These scenarios were computed from Friday minute bars. Monday opening range, VWAP and confirmations are unavailable in this snapshot.' : 'These are unvalidated swing hypotheses from completed-session evidence. A neutral row is not a trade setup.'}</p></Card><div className="intel-grid">{[...new Set(['QQQ', 'SPY', 'IWM', 'SMH', ...rows.map(x => x.symbol)])].map(symbol => <Card key={symbol}><h3>{symbol}</h3><Scenarios title={kind === 'intraday' ? 'Intraday scenario' : 'Swing scenario'} rows={rows} symbol={symbol}/>{kind === 'intraday' && report.intraday_features[symbol] && <><SLabel>Friday regular-session observations</SLabel><Facts items={[["Friday VWAP", report.intraday_features[symbol].vwap], ["Friday opening range high", report.intraday_features[symbol].opening_range_high], ["Friday opening range low", report.intraday_features[symbol].opening_range_low]]}/></>}</Card>)}</div></>
}
export default function MarketIntelligence({ initialView = 'map' }) {
  const [view, setView] = useState(initialView)
  const title = INTELLIGENCE_VIEWS.find(x => x.id === view)?.label || 'Market Map'
  function selectView(value) {
    setView(value)
    const url = new URL(window.location.href)
    url.searchParams.set('intelligence', value)
    window.history.replaceState(null, '', url)
  }
  const [report, setReport] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setState('loading'); setError('')
    try {
      const response = await fetch('/api/intelligence/latest', { cache: 'no-store' })
      if ([401, 403].includes(response.status)) { setReport(null); setState('login'); return }
      if (!response.ok) throw new Error('Report unavailable. The server may not have a validated report or configured storage.')
      const data = parseReport(await response.json()); setReport(data); setState('ready')
    } catch (error) { setError(error.message); setState('error') }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { const close = () => { setReport(null); setState('login') }; window.addEventListener('tradehub-operator-logout', close); return () => window.removeEventListener('tradehub-operator-logout', close) }, [])
  async function signOut() {
    const response = await fetch('/api/intelligence/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (!response.ok) { setError('Sign-out failed. Retry before leaving this browser.'); return }
    setReport(null); setState('login'); window.dispatchEvent(new Event('tradehub-operator-session')); window.dispatchEvent(new Event('tradehub-operator-logout'))
  }
  return <section className="intel-root" aria-label="Market Intelligence"><div className="intel-head"><h1 className="intel-title">Market Intelligence</h1><div className="intel-actions"><Btn small disabled={state === 'loading'} onClick={refresh}>Refresh report</Btn>{report && <Btn small variant="ghost" onClick={signOut}>Sign out</Btn>}</div></div>
    <nav className="intel-subnav" aria-label="Intelligence views">{INTELLIGENCE_VIEWS.map(item => <button key={item.id} aria-pressed={view === item.id} onClick={() => selectView(item.id)}>{item.label}</button>)}</nav><h2 className="intel-view-title">{title}</h2>
    {view === 'rotation' && (isLocalServicePreview() ? <Card><p role="status">Sector rotation unavailable: live Massive services are disabled in this review. No neutral scores or live flows are inferred.</p></Card> : <SectorRotationView apiKey="server-managed"/>)}
    {view !== 'rotation' && state === 'login' && <OperatorAccess onAuthenticated={refresh}/>}{view !== 'rotation' && state === 'loading' && <Status>Loading protected intelligence...</Status>}{view !== 'rotation' && error && <Status error>{error}{report && ' Showing the previously loaded sample.'}</Status>}
    {view !== 'rotation' && report && <><Card style={{ borderColor: LIME }}><SLabel>FRIDAY-CLOSE SNAPSHOT · LOCAL SAMPLE · NOT LIVE</SLabel><strong style={{ color: YELLOW }}>{report.sample_label}</strong><p role="status">{freshness(report.observation_cutoff)} · Observation cutoff: {report.observation_cutoff}</p><p>Report date: {report.report_date} · Generated: {report.generated_at}</p><p className="intel-muted">Refresh retrieves this saved sample. It does not generate new market data. Prior-session intraday scenarios are not current-session signals.</p></Card>{(report.warnings.length > 0 || report.data_errors.length > 0) && <Card><SLabel>Source quality</SLabel>{report.warnings.map(x => <p key={x}>{x}</p>)}{report.data_errors.map((x, i) => <p key={i}>{x.symbol || 'Source'}: {x.component || 'Data'} unavailable</p>)}</Card>}{view === 'rotation' ? null : view === 'training' ? <TrainingMode report={report}/> : view === 'analyst' ? <AnalystBrief report={report}/> : view === 'map' ? <MapView report={report}/> : view === 'options' ? <OptionsView report={report}/> : <PlaybookView report={report} kind={view}/>}</>}
  </section>
}
