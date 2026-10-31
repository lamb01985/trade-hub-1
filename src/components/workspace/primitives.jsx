import { ArrowUpRight, CircleHelp } from 'lucide-react'

export function PageHeading({ eyebrow, title, description, actions }) {
  return <header className="eq-page-heading"><div>{eyebrow && <div className="eq-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="eq-page-actions">{actions}</div>}</header>
}
export function Panel({ title, description, actions, children, className = '', ...props }) {
  return <section className={`eq-panel ${className}`} {...props}>{(title || actions) && <div className="eq-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</div>}{children}</section>
}
export function StatusBadge({ tone = 'neutral', children, dot = true }) {
  return <span className={`eq-badge eq-badge-${tone}`}>{dot && <i aria-hidden="true" />}{children}</span>
}
export function EmptyState({ icon: Icon = CircleHelp, title, children, action }) {
  return <div className="eq-empty"><span className="eq-empty-icon"><Icon size={23} strokeWidth={1.4}/></span><h3>{title}</h3><p>{children}</p>{action}</div>
}
export function MetricCard({ label, value, detail, tone = 'neutral', icon: Icon }) {
  return <div className="eq-metric"><div className="eq-metric-label">{label}{Icon && <Icon size={15}/>}</div><div className={`eq-metric-value eq-tone-${tone}`}>{value ?? '—'}</div><div className="eq-metric-detail">{detail}</div></div>
}
export function TextAction({ children, onClick }) {
  return <button className="eq-text-action" onClick={onClick}>{children}<ArrowUpRight size={14}/></button>
}
