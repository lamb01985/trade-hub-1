import { isUiPreview } from '../../lib/uiPreview.js'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeftToLine, ArrowRightToLine, ChevronDown, ChevronRight, Command, Search, Menu, X, ShieldCheck, LogOut } from 'lucide-react'
import { PRIMARY_NAV, NAV_GROUPS } from './navigation.js'
import { StatusBadge } from './primitives.jsx'
import { BRAND } from '../../lib/brand.js'

export default function WorkspaceShell({ active, onNavigate, ticker, onTicker, session, connected, freshness, status, actions, children }) {
  const [collapsed,setCollapsed]=useState(false),[mobile,setMobile]=useState(false),[query,setQuery]=useState(ticker),[error,setError]=useState('')
  const [openGroups,setOpenGroups]=useState({}),toggleRef=useRef(null),drawerRef=useRef(null),mainRef=useRef(null),searchRef=useRef(null)
  useEffect(()=>{setQuery(ticker);setError('')},[ticker])
  useEffect(()=>{if(!mobile)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';drawerRef.current?.querySelector('button')?.focus();return()=>{document.body.style.overflow=previous}},[mobile])
  function closeMobile(){setMobile(false);requestAnimationFrame(()=>toggleRef.current?.focus())}
  useEffect(()=>{
    const key=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus()}
      if(e.key==='Escape'&&mobile)closeMobile()
      if(e.key==='Tab'&&mobile){const controls=[...drawerRef.current.querySelectorAll('button:not([disabled]),a[href]')].filter(el=>el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
    };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)
  },[mobile])
  function navigate(item){onNavigate(item);setMobile(false);requestAnimationFrame(()=>{window.scrollTo({top:0});mainRef.current?.focus({preventScroll:true})})}
  function submit(e){e.preventDefault();const symbol=query.trim().toUpperCase();if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)){setError('Enter a valid ticker, such as QQQ or AMD.');return}setError('');onTicker(symbol)}
  function navItem(item){const Icon=item.icon;return <button key={item.id} className={`eq-nav-item ${active.id===item.id?'is-active':''}`} onClick={()=>navigate(item)} aria-current={active.id===item.id?'page':undefined} aria-label={item.label} title={collapsed?item.label:undefined}><Icon size={18} strokeWidth={1.6}/><span>{item.label}</span>{active.id===item.id && <i aria-hidden="true"/>}</button>}
  return <div className={`eq-shell ${collapsed?'eq-collapsed':''} ${mobile?'eq-drawer-open':''}`}>
    <a href="#workspace-content" className="eq-skip">Skip to workspace</a>
    {mobile && <button className="eq-drawer-scrim" aria-label="Close navigation" onClick={closeMobile}/>}
    <aside id="edge-workspace-navigation" className="eq-sidebar" ref={drawerRef} aria-label="Workspace navigation" role={mobile?'dialog':undefined} aria-modal={mobile||undefined}>
      <div className="eq-sidebar-brand"><span className="eq-mark" aria-hidden="true"><span/><span/><span/></span><div className="eq-brand-lockup"><strong>{BRAND.name}</strong><span>{BRAND.tagline}</span></div><button className="eq-icon-button eq-mobile-close" aria-label="Close sidebar" onClick={closeMobile}><X size={18}/></button></div>
      <nav><div className="eq-nav-caption">Workspace</div>{PRIMARY_NAV.map(navItem)}
        <div className="eq-nav-divider"/>{NAV_GROUPS.map(group=>{
          const selected=group.items.some(item=>item.id===active.id),open=openGroups[group.label]??selected,Icon=group.icon
          return <div className="eq-nav-group" key={group.label}><button className={`eq-group-toggle ${selected?'has-active':''}`} aria-label={group.label} aria-expanded={open&&!collapsed} onClick={()=>{if(collapsed)setCollapsed(false);setOpenGroups(prev=>({...prev,[group.label]:!open||collapsed}))}} title={collapsed?group.label:undefined}><Icon size={17}/><span>{group.label}</span>{open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button>{open&&!collapsed&&<div className="eq-nav-children">{group.items.map(navItem)}</div>}</div>
        })}</nav>
      <div className="eq-sidebar-bottom"><div className="eq-private"><ShieldCheck size={16}/><span>Private workspace<small>Personal research environment</small></span></div><button className="eq-collapse" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?<ArrowRightToLine size={17}/>:<ArrowLeftToLine size={17}/>}<span>Collapse sidebar</span></button></div>
    </aside>
    <div className="eq-main" inert={mobile?'':undefined}>
      <header className="eq-topbar"><div className="eq-topbar-context"><button ref={toggleRef} className="eq-icon-button eq-mobile-menu" aria-label="Open navigation" aria-expanded={mobile} aria-controls="edge-workspace-navigation" onClick={()=>setMobile(true)}><Menu size={20}/></button><span className="eq-topbar-root">Workspace</span><ChevronRight className="eq-breadcrumb-chevron" size={13}/><strong>{active.label}</strong></div>
        <form className="eq-search" role="search" onSubmit={submit}><Search size={16}/><input ref={searchRef} aria-label="Search ticker" value={query} onChange={e=>{setQuery(e.target.value);setError('')}} placeholder="Search ticker…" maxLength={20}/><kbd><Command size={10}/> K</kbd><button type="submit" className="eq-sr-only">Open ticker</button></form>
        <div className="eq-topbar-status"><span className="eq-session"><i/>{session}</span><StatusBadge tone={connected?'positive':'neutral'}>{connected?'REST connected':'Data unavailable'}</StatusBadge>{isUiPreview() ? <span title="Access is controlled by Vercel Authentication" aria-label="Protected UI preview"><ShieldCheck size={17}/></span> : <button className="eq-icon-button eq-signout" aria-label="Sign out of EdgeIQ" title="Sign out" onClick={()=>window.dispatchEvent(new Event('edgeiq-request-signout'))}><LogOut size={17}/></button>}</div>
      </header>
      {error&&<p className="eq-search-error" role="alert">{error}</p>}
      <div className="eq-status-strip"><div className="eq-source-label"><span className={`eq-status-dot ${freshness?.fresh?'is-current':''}`}/><strong>{ticker}</strong><span>{freshness?.label || 'No verified quote'}</span></div>{status}<div className="eq-strip-actions">{actions}</div></div>
      <main id="workspace-content" className="eq-workspace-content" ref={mainRef} tabIndex={-1}>{children}</main>
      <footer className="eq-footer"><span>{BRAND.name} <span className="eq-footer-dot">·</span> Investment intelligence</span><span>Research informs. You decide.</span></footer>
    </div>
  </div>
}
