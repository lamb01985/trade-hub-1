import { useState } from 'react'
import { Card, Btn, SLabel } from '../ui.jsx'
import { LIME, MONO, RED } from '../../constants.js'

export default function OperatorAccess({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/intelligence/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      setPassword('')
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many attempts. Try again later.' : response.status === 503 ? 'Operator access is not configured on this server.' : 'Sign-in failed.')
      window.dispatchEvent(new Event('tradehub-operator-session'))
      onAuthenticated?.()
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <Card><SLabel>Private operator access</SLabel><p style={{ fontSize: 12, color: '#aaa' }}>Sign in to use TradeHub market data, notifications, licensed intelligence and server AI. This login is independent of your broker.</p><form onSubmit={submit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><label style={{ color: LIME, fontFamily: MONO, fontSize: 12 }}>Operator password<input aria-label="Operator password" type="password" autoComplete="current-password" maxLength={256} value={password} onChange={e => setPassword(e.target.value)} style={{ display: 'block', background: '#0e0e0e', color: '#eee', border: '1px solid #555', padding: 10, maxWidth: '100%' }}/></label><Btn disabled={busy || !password} type="submit">{busy ? 'Signing in...' : 'Sign in'}</Btn></form>{error && <p role="alert" style={{ color: RED }}>{error}</p>}</Card>
}
