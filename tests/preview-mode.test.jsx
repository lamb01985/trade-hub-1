// @vitest-environment jsdom
import React from 'react'
import {render,screen,cleanup} from '@testing-library/react'
import {it,expect,vi,afterEach} from 'vitest'
const state=vi.hoisted(()=>({value:{}}))
vi.mock('../src/hooks/useMarketData.js',()=>({useMarketData:()=>state.value}))
vi.mock('../src/hooks/useLiveData.js',()=>({useLiveData:()=>{throw Error('legacy hook must not mount')}}))
vi.mock('../src/components/UnifiedMarketContext.jsx',()=>({default:({onLegacy})=><div>Protected unified view{onLegacy && <button>Legacy</button>}</div>}))
import App from '../src/App.jsx'
afterEach(cleanup)
it('blocks legacy consumers until authenticated mode discovery succeeds',()=>{state.value={modeKnown:false};render(<App/>);expect(screen.getByRole('status').textContent).toMatch(/Market mode is unavailable/)})
it('mounts only Unified in preview and offers no Legacy bypass',()=>{state.value={modeKnown:true,previewOnly:true,unifiedEnabled:true};render(<App/>);expect(screen.getByText('Protected unified view')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull()})
it('does not fall back to legacy when preview Unified is disabled',()=>{state.value={modeKnown:true,previewOnly:true,unifiedEnabled:false};render(<App/>);expect(screen.getByRole('status').textContent).toMatch(/not activated/)})
