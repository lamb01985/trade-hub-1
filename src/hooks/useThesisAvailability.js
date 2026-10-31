import { useEffect, useState } from 'react'
// Independent authenticated admission: an unavailable market gateway must not
// prevent SEC-only research. The server denies this route in market-only preview.
export function useThesisAvailability() {
  const [available,setAvailable]=useState(false)
  useEffect(()=>{
    const controller=new AbortController();let alive=true
    const timer=setTimeout(()=>controller.abort(),5000)
    fetch('/api/thesis/status',{cache:'no-store',signal:controller.signal}).then(async response=>{
      const body=await response.json()
      if(alive)setAvailable(response.ok&&body.enabled===true&&typeof body.development_fixture==='boolean')
    }).catch(()=>{if(alive)setAvailable(false)}).finally(()=>clearTimeout(timer))
    return()=>{alive=false;controller.abort();clearTimeout(timer)}
  },[])
  return available
}
