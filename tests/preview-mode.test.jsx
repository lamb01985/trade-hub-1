// @vitest-environment jsdom
import React from 'react'
import {render,screen,cleanup,fireEvent} from '@testing-library/react'
import {it,expect,vi,afterEach} from 'vitest'
const state=vi.hoisted(()=>({value:{},thesis:false}))
vi.mock('../src/hooks/useThesisAvailability.js',()=>({useThesisAvailability:()=>state.thesis}))
vi.mock('../src/components/workspace/CompanyIntelligence.jsx',()=>({default:()=> <p>Independent financial research</p>}))
vi.mock('../src/hooks/useMarketData.js',()=>({useMarketData:()=>state.value}))
vi.mock('../src/hooks/useLiveData.js',()=>({useLiveData:()=>{throw Error('legacy hook must not mount')}}))
vi.mock('../src/components/UnifiedMarketContext.jsx',()=>({default:({onLegacy})=><div>Protected unified view{onLegacy && <button>Legacy</button>}</div>}))
import App from '../src/App.jsx'
afterEach(()=>{cleanup();state.thesis=false})
it('blocks legacy consumers until authenticated mode discovery succeeds',()=>{state.value={modeKnown:false};render(<App/>);expect(screen.getByRole('status').textContent).toMatch(/Market mode is unavailable/)})
it('mounts only Unified in preview and offers no Legacy bypass',()=>{state.value={modeKnown:true,previewOnly:true,unifiedEnabled:true};render(<App/>);expect(screen.getByText('Protected unified view')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull()})
it('does not fall back to legacy when preview Unified is disabled',()=>{state.value={modeKnown:true,previewOnly:true,unifiedEnabled:false};render(<App/>);expect(screen.getByRole('status').textContent).toMatch(/not activated/)})

it('allows independently admitted research when market discovery fails without mounting legacy consumers',()=>{state.value={modeKnown:false};state.thesis=true;render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Open Company Intelligence'}));expect(screen.getByText('Independent financial research')).toBeTruthy()})
it('does not expose independent research from protected preview even if Thesis is available',()=>{state.value={modeKnown:true,previewOnly:true,unifiedEnabled:true};state.thesis=true;render(<App/>);expect(screen.getByText('Protected unified view')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull()})
