import { useCallback, useEffect, useRef, useState } from 'react'
import OperatorAccess from './intelligence/OperatorAccess.jsx'

export const OPERATOR_CHECK_MS = 60_000
const CHECK_TIMEOUT_MS = 5_000
const LOGOUT_KEY = 'th-operator-logout'

export default function OperatorGate({ children }) {
  const [status, setStatus] = useState('checking')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const controller = useRef(null)
  const active = useRef(false)
  const invalidate = useCallback((broadcast = true) => {
    generation.current++
    controller.current?.abort()
    setStatus('login')
    if (broadcast) {
      try { localStorage.setItem(LOGOUT_KEY, `${Date.now()}:${Math.random()}`) } catch {}
    }
  }, [])
  const verify = useCallback(async () => {
    const run = ++generation.current
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    const timer = setTimeout(() => request.abort(), CHECK_TIMEOUT_MS)
    try {
      const response = await fetch('/api/intelligence/session', { cache: 'no-store', signal: request.signal })
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (typeof data.authenticated !== 'boolean') throw new Error()
      if (!active.current || run !== generation.current) return
      setError('')
      if (data.authenticated) setStatus('authenticated')
      else window.dispatchEvent(new Event('tradehub-operator-expired'))
    } catch {
      if (!active.current || run !== generation.current) return
      window.dispatchEvent(new Event('tradehub-operator-expired'))
      setError('Operator session could not be verified. Retry before using live services.')
      setStatus('error')
    } finally { clearTimeout(timer) }
  }, [])
  useEffect(() => {
    active.current = true
    const close = () => invalidate(true)
    const storage = event => {
      if (event.key === LOGOUT_KEY && event.newValue) {
        invalidate(false)
        window.dispatchEvent(new Event('tradehub-market-session-reset'))
      }
    }
    window.addEventListener('tradehub-operator-session', verify)
    window.addEventListener('tradehub-operator-logout', close)
    window.addEventListener('tradehub-operator-expired', close)
    window.addEventListener('storage', storage)
    verify()
    return () => {
      active.current = false
      generation.current++
      controller.current?.abort()
      window.removeEventListener('tradehub-operator-session', verify)
      window.removeEventListener('tradehub-operator-logout', close)
      window.removeEventListener('tradehub-operator-expired', close)
      window.removeEventListener('storage', storage)
    }
  }, [verify, invalidate])
  useEffect(() => {
    if (status !== 'authenticated') return
    const visible = () => { if (document.visibilityState === 'visible') verify() }
    const interval = setInterval(verify, OPERATOR_CHECK_MS)
    window.addEventListener('focus', verify)
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', verify)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [status, verify])
  async function signOut() {
    try {
      const response = await fetch('/api/intelligence/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!response.ok) throw new Error()
      window.dispatchEvent(new Event('tradehub-operator-logout'))
    } catch { setError('Sign-out failed. Retry before leaving this browser.') }
  }
  return <div style={{ background: '#0e0e0e', color: '#eee', minHeight: '100vh' }}>
    {error && <p role="alert">{error}</p>}
    {status === 'authenticated' ? <><button onClick={signOut}>Sign out of TradeHub</button>{children}</>
      : status === 'checking' ? <p role="status">Verifying private operator access...</p>
        : <div style={{ padding: 24, maxWidth: 650 }}><h1>TradeHub operator access</h1>
          {status === 'error' && <button onClick={verify}>Retry session check</button>}
          <OperatorAccess/></div>}
  </div>
}
