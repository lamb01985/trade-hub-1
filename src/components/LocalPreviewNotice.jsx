import { isLocalServicePreview, LOCAL_MARKET_LIMITATION } from '../lib/localPreview.js'
import { MONO, YELLOW, BORDER } from '../constants.js'
export default function LocalPreviewNotice() {
  if (!isLocalServicePreview()) return null
  return <aside aria-label="Local preview service limitations" style={{maxWidth:920,margin:'16px auto 0',padding:'12px 16px',border:`1px solid ${BORDER}`,borderRadius:4,background:'#18160b',color:YELLOW,fontFamily:MONO,fontSize:11,lineHeight:1.6}}><strong>LOCAL REVIEW: live feeds, broker access and AI billing are disabled.</strong><p style={{margin:'6px 0'}}>{LOCAL_MARKET_LIMITATION}</p><p style={{margin:'6px 0'}}>Calendar events remain available. Earnings use the public Nasdaq proxy and may be unavailable if Nasdaq rejects or times out on this network. No earnings fixtures are substituted.</p><p style={{margin:'6px 0'}}>This localhost origin has its own browser settings and journal. Production records and broker sessions have not been imported.</p></aside>
}
