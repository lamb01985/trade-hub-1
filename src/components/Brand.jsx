import { BRAND } from '../lib/brand.js'
import { THEME } from '../lib/theme.js'

export function Brand({ tagline = true }) {
  return <span className="edge-brand"><span className="edge-brand-name">{BRAND.name}</span>{tagline && <span className="edge-brand-tagline">{BRAND.tagline}</span>}</span>
}

// Always includes a visible label; color alone must never convey financial status.
export function FinancialStatus({ state, children }) {
  const color = { GREEN: THEME.colors.positive, YELLOW: THEME.colors.caution, RED: THEME.colors.negative }[state] || THEME.colors.secondary
  return <span className="edge-status" style={{ color }}><span aria-hidden="true">●</span>{children || ({ GREEN: 'Positive', YELLOW: 'Caution', RED: 'Negative' }[state] || 'Insufficient data')}</span>
}
