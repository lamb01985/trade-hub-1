import { THEME } from '../lib/theme.js'
import { useState, useRef, useEffect } from 'react'
import { DARK, PANEL, BORDER, LIME, RED, YELLOW, BLUE, PURPLE, MONO, SANS } from '../constants.js'

const s = {
  fontFamily: MONO,
}

export function Tip({ tip }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function closeOutside(e) {
      if (!btnRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  function toggle(e) {
    e.stopPropagation()
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setRect(r)
    setOpen(v => !v)
  }

  const left = rect ? Math.min(rect.left, window.innerWidth - 268) : 0
  const top = rect ? rect.bottom + 6 : 0

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{
          width: 14, height: 14, borderRadius: '50%', background: 'transparent',
          border: `1px solid ${open ? THEME.colors.border : THEME.colors.border}`, color: open ? THEME.colors.secondary : THEME.colors.secondary,
          fontFamily: MONO, fontSize: 8, lineHeight: '12px', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: 5, padding: 0, flexShrink: 0,
        }}
      >?</button>
      {open && rect && (
        <div style={{
          position: 'fixed', top, left, zIndex: 9999,
          background: THEME.colors.surface, border: `1px solid ${THEME.colors.surface}`, borderRadius: 5,
          padding: '12px 16px', width: 252, boxShadow: '0 8px 32px rgba(0,0,0,0.85)',
        }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: THEME.colors.secondary, lineHeight: 1.75 }}>{tip}</div>
        </div>
      )}
    </span>
  )
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
    <div style={{ fontSize: 9, letterSpacing: '0.16em', color: color || THEME.colors.secondary, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6, ...style }}>
      {children}
    </div>
  )
}

export function Heading({ children }) {
  return (
    <div style={{ fontSize: 22, fontWeight: 700, color: THEME.colors.text, letterSpacing: '-0.02em', marginBottom: 18 }}>
      {children}
    </div>
  )
}

export function Tile({ label, value, sub, color, compact }) {
  return (
    <Card style={{ padding: compact ? '12px 14px' : '15px 18px' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.15em', color: THEME.colors.secondary, fontFamily: MONO, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: compact ? 18 : 22, fontWeight: 700, color: color || THEME.colors.text, fontFamily: MONO, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: THEME.colors.secondary, fontFamily: MONO, marginTop: 3 }}>{sub}</div>}
    </Card>
  )
}

export function Fld({ label, value, onChange, type = 'number', placeholder, step = '0.01', prefix, suffix, disabled, mono, accent, tip }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 9, letterSpacing: '0.14em', color: accent ? THEME.colors.positive : THEME.colors.secondary, textTransform: 'uppercase', fontFamily: MONO, display: 'flex', alignItems: 'center' }}>{label}{tip && <Tip tip={tip} />}</label>}
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: THEME.colors.secondary, fontFamily: MONO, fontSize: 13, pointerEvents: 'none' }}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onInput={e => onChange(e.target.value)}
          placeholder={placeholder}
          step={step}
          disabled={disabled}
          style={{ background: disabled ? THEME.colors.background : THEME.colors.surface, border: `1px solid ${accent ? THEME.colors.positiveSurface : BORDER}`, borderRadius: 4, color: disabled ? THEME.colors.secondary : THEME.colors.text, fontFamily: mono ? MONO : SANS, fontSize: 13, padding: `9px ${suffix ? '30px' : '12px'} 9px ${prefix ? '22px' : '12px'}`, width: '100%', outline: 'none' }}
          onFocus={e => { if (!disabled) e.target.style.borderColor = LIME }}
          onBlur={e => { e.target.style.borderColor = accent ? THEME.colors.positiveSurface : BORDER }}
        />
        {suffix && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: THEME.colors.secondary, fontFamily: MONO, fontSize: 12, pointerEvents: 'none' }}>{suffix}</span>}
      </div>
    </div>
  )
}

export function Sel({ label, value, onChange, options, small }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 9, letterSpacing: '0.14em', color: THEME.colors.secondary, textTransform: 'uppercase', fontFamily: MONO }}>{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: THEME.colors.surface, border: `1px solid ${BORDER}`, borderRadius: 4, color: THEME.colors.text, fontFamily: MONO, fontSize: small ? 11 : 13, padding: small ? '6px 10px' : '9px 12px', outline: 'none', cursor: 'pointer', appearance: 'none' }}
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
    primary: { bg: disabled ? THEME.colors.surface : LIME, color: disabled ? THEME.colors.secondary : THEME.colors.background, border: 'none' },
    ghost: { bg: 'transparent', color: THEME.colors.secondary, border: `1px solid ${BORDER}` },
    danger: { bg: THEME.colors.negativeSurface, color: RED, border: `1px solid ${THEME.colors.negativeSurface}` },
    blue: { bg: THEME.colors.surface, color: BLUE, border: `1px solid ${THEME.colors.surface}` },
    purple: { bg: THEME.colors.surface, color: PURPLE, border: `1px solid ${THEME.colors.surface}` },
    lime: { bg: THEME.colors.positiveSurface, color: LIME, border: `1px solid ${LIME}44` },
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
      style={{ background: active ? (color ? color + '22' : THEME.colors.surface) : 'transparent', color: active ? (color || THEME.colors.secondary) : THEME.colors.secondary, border: `1px solid ${active ? (color ? color + '44' : THEME.colors.border) : THEME.colors.border}`, borderRadius: 3, padding: '4px 12px', fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
    >
      {label}
    </button>
  )
}

export function CheckRow({ text, required, checked, onToggle }) {
  return (
    <div onClick={onToggle} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${THEME.colors.background}`, cursor: 'pointer', alignItems: 'flex-start' }}>
      <div style={{ width: 17, height: 17, borderRadius: 3, flexShrink: 0, marginTop: 1, border: `1px solid ${checked ? LIME : required ? THEME.colors.border : THEME.colors.surface}`, background: checked ? LIME : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <span style={{ color: THEME.colors.background, fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontSize: 12, color: checked ? THEME.colors.secondary : THEME.colors.secondary, fontFamily: MONO, lineHeight: 1.6, textDecoration: checked ? 'line-through' : 'none' }}>{text}</span>
    </div>
  )
}
