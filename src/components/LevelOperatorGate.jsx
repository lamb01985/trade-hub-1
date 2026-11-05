import {useEffect,useState} from 'react'
import {Card,Btn,Heading} from './ui.jsx'

// Mount market consumers only after the existing server-side operator session
// is verified. No credentials are stored in browser storage.
export default function LevelOperatorGate({children}) {
  const [status,setStatus]=useState('checking'),[error,setError]=useState(''),[password,setPassword]=useState('')
  useEffect(()=>{
    let active=true;const controller=new AbortController()
    async function verify() {
      try {
        const r=await fetch('/api/desk?action=session',{cache:'no-store',signal:controller.signal})
        const d=await r.json()
        if(!r.ok||typeof d.authenticated!=='boolean')throw Error('Operator session unavailable')
        if(active)setStatus(d.authenticated?'authenticated':'login')
      }catch(e){if(active){setStatus('login');setError('Operator session unavailable. Retry before using current market data.')}}
    }
    const expired=()=>{setStatus('login');setError('Operator session expired. Sign in again.')}
    verify();const timer=setInterval(verify,60000)
    window.addEventListener('tradehub-operator-expired',expired)
    return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('tradehub-operator-expired',expired)}
  },[])
  async function signIn(e) {
    e.preventDefault();setError('');setStatus('checking')
    try {
      const r=await fetch('/api/desk?action=login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})})
      setPassword('');const d=await r.json()
      if(!r.ok||d.authenticated!==true)throw Error(d.error||'Operator sign-in failed')
      setStatus('authenticated')
    }catch(e){setStatus('login');setError(e.message)}
  }
  async function signOut() {
    const r=await fetch('/api/desk?action=logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
    if(r.ok)setStatus('login');else setError('Sign-out failed. Retry.')
  }
  return <div style={{minHeight:'100vh',background:'#080808',color:'#ddd',padding:16}}>
    {status==='authenticated'?<><Btn small onClick={signOut}>Sign out</Btn>{children}</>:<Card style={{maxWidth:500,margin:'10vh auto'}}><Heading>TRADE HUB</Heading><p>Private operator access · current Level Map</p>{status==='checking'?<p role="status">Verifying operator session…</p>:<form onSubmit={signIn}><label>Operator password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><Btn type="submit" onClick={signIn}>Sign in</Btn></form>}</Card>}
    {error&&<p role="alert">{error}</p>}
  </div>
}
