import { DARK, PANEL, BORDER, LIME, RED, YELLOW, BLUE, PURPLE, MONO, SANS } from '../constants.js'

const s = {
  fontFamily: MONO,
}

export function Card({ children, style = {} }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '16px 20px', ...style }}>
      {children}
    </div>
  )
}

export function SLabel({ children, color, style = {} }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: '0.16em', color: color || '#666', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6, ...style }}>
      {children}
    </div>
  )
}

export function Heading({ children }) {
  return (
    <div style={{ fontSize: 22, fontWeight: 700, color: '#e8e8e8', letterSpacing: '-0.02em', marginBottom: 18 }}>
      {children}
    </div>
  )
}

export function Tile({ label, value, sub, color, compact }) {
  return (
    <Card style={{ padding: compact ? '12px 14px' : '15px 18px' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.15em', color: '#666', fontFamily: MONO, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: compact ? 18 : 22, fontWeight: 700, color: color || '#e8e8e8', fontFamily: MONO, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#555', fontFamily: MONO, marginTop: 3 }}>{sub}</div>}
    </Card>
  )
}

export function Fld({ label, value, onChange, type = 'number', placeholder, step = '0.01', prefix, suffix, disabled, mono, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 9, letterSpacing: '0.14em', color: accent ? '#6a7a5a' : '#666', textTransform: 'uppercase', fontFamily: MONO }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#666', fontFamily: MONO, fontSize: 13, pointerEvents: 'none' }}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onInput={e => onChange(e.target.value)}
          placeholder={placeholder}
          step={step}
          disabled={disabled}
          style={{ background: disabled ? '#111' : '#161616', border: `1px solid ${accent ? '#2a3525' : BORDER}`, borderRadius: 4, color: disabled ? '#444' : '#e8e8e8', fontFamily: mono ? MONO : SANS, fontSize: 13, padding: `9px ${suffix ? '30px' : '12px'} 9px ${prefix ? '22px' : '12px'}`, width: '100%', outline: 'none' }}
          onFocus={e => { if (!disabled) e.target.style.borderColor = LIME }}
          onBlur={e => { e.target.style.borderColor = accent ? '#2a3525' : BORDER }}
        />
        {suffix && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#666', fontFamily: MONO, fontSize: 12, pointerEvents: 'none' }}>{suffix}</span>}
      </div>
    </div>
  )
}

export function Sel({ label, value, onChange, options, small }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 9, letterSpacing: '0.14em', color: '#666', textTransform: 'uppercase', fontFamily: MONO }}>{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: '#161616', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#e8e8e8', fontFamily: MONO, fontSize: small ? 11 : 13, padding: small ? '6px 10px' : '9px 12px', outline: 'none', cursor: 'pointer', appearance: 'none' }}
        onFocus={e => e.target.style.borderColor = LIME}
        onBlur={e => { e.target.style.borderColor = BORDER }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export function Btn({ children, onClick, variant = 'primary', disabled, small }) {
  const variants = {
    primary: { bg: disabled ? '#181818' : LIME, color: disabled ? '#333' : '#000', border: 'none' },
    ghost: { bg: 'transparent', color: '#555', border: `1px solid ${BORDER}` },
    danger: { bg: '#1a0505', color: RED, border: '1px solid #2a0a0a' },
    blue: { bg: '#0a1020', color: BLUE, border: '1px solid #152030' },
    purple: { bg: '#0e0814', color: PURPLE, border: '1px solid #1e1028' },
    lime: { bg: '#0a1204', color: LIME, border: `1px solid ${LIME}44` },
  }
  const v = variants[variant] || variants.primary
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: v.bg, color: v.color, border: v.border || 'none', borderRadius: 4, padding: small ? '6px 12px' : '10px 20px', fontFamily: MONO, fontWeight: 700, fontSize: small ? 10 : 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
    >
      {children}
    </button>
  )
}

export function Pill({ label, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{ background: active ? (color ? color + '22' : '#242424') : 'transparent', color: active ? (color || '#ccc') : '#555', border: `1px solid ${active ? (color ? color + '44' : '#3a3a3a') : '#252525'}`, borderRadius: 3, padding: '4px 12px', fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
    >
      {label}
    </button>
  )
}

export function CheckRow({ text, required, checked, onToggle }) {
  return (
    <div onClick={onToggle} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid #111`, cursor: 'pointer', alignItems: 'flex-start' }}>
      <div style={{ width: 17, height: 17, borderRadius: 3, flexShrink: 0, marginTop: 1, border: `1px solid ${checked ? LIME : required ? '#3a3a3a' : '#222'}`, background: checked ? LIME : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <span style={{ color: '#000', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontSize: 12, color: checked ? '#444' : '#aaa', fontFamily: MONO, lineHeight: 1.6, textDecoration: checked ? 'line-through' : 'none' }}>{text}</span>
    </div>
  )
}
