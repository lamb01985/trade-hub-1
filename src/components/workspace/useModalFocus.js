import { useEffect, useRef } from 'react'
// Retrofitted legacy dialogs share keyboard containment and return focus.
export function useModalFocus(open, onClose) {
  const ref=useRef(null),close=useRef(onClose);close.current=onClose
  useEffect(()=>{
    if(!open)return
    const previous=document.activeElement,overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    const controls=()=>[...(ref.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href],[tabindex="0"]')||[])].filter(el=>el.getClientRects().length)
    const initial=ref.current?.querySelector('button,input,select,textarea');initial?.focus()
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current()}if(e.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(!first){e.preventDefault();ref.current?.focus()}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
    document.addEventListener('keydown',key,true)
    return()=>{document.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus()}
  },[open])
  return ref
}
