import { Info, ChevronDown } from 'lucide-react'
import LocalPreviewNotice from '../LocalPreviewNotice.jsx'
import { isLocalServicePreview } from '../../lib/localPreview.js'
export default function ServiceStatus({ freshness, ticker, data, priceTime, events=[], onCalendar }) {
  const preview=isLocalServicePreview()
  return <details className="eq-service-details"><summary><Info size={14}/><span>{preview?'Local review · live services disabled':freshness.fresh?'Source & service details':'Source limitations'}</span><ChevronDown size={13}/></summary><div className="eq-service-body">
    <h3>Market data & source status</h3><p><strong>{ticker} · {freshness.label}.</strong> Massive stocks coverage is 3 a.m. to 7 p.m. CT. BOATS overnight prices are not connected.</p>
    <p>{data?.price!=null?`Recorded last trade: $${data.price.toFixed(2)} · ${priceTime}. ${freshness.fresh?'Recent trade observation; transport readiness does not prove execution quality.':'This is not a verified current price.'}`:'No verified current trade is available.'}</p>
    {data?.prevDay?.close!=null&&<p>Last completed regular-session close: ${data.prevDay.close.toFixed(2)} ({data.prevDay.date}).</p>}
    {events.length>0&&<div><h3>High-impact events today</h3><p>{events.map(e=>`${e.name}${e.time?` at ${e.time} CT`:''}`).join(' · ')}</p><button className="eq-button" onClick={onCalendar}>Open economic calendar</button></div>}
    <LocalPreviewNotice/>
  </div></details>
}
