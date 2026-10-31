import { useEffect, useState } from 'react'
export function useAiCapability() {
  const [status, setStatus] = useState({ available: false, message: 'Sign in to verify server AI configuration.' })
  useEffect(() => {
    let alive = true
    async function refresh() {
      try {
        const response = await fetch('/api/ai/status', { cache: 'no-store' })
        const body = await response.json()
        if (alive) setStatus({ available: response.ok && body.configured === true && body.enabled === true, message: !response.ok ? 'Operator sign-in is required to verify AI.' : !body.configured ? 'Claude is not configured on this server.' : !body.enabled ? 'Claude billing is disabled or its budget is not configured.' : 'Server Claude configuration verified. Daily budget and request limits apply.' })
      } catch { if (alive) setStatus({ available: false, message: 'Server AI configuration could not be verified.' }) }
    }
    refresh()
    window.addEventListener('tradehub-operator-session', refresh)
    return () => { alive = false; window.removeEventListener('tradehub-operator-session', refresh) }
  }, [])
  return status
}
