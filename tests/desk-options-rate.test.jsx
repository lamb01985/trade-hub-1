// @vitest-environment jsdom
import React from 'react'
import {afterEach,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
vi.mock('../src/lib/massive.js',()=>({getOptionChain:vi.fn()}))
import {getOptionChain} from '../src/lib/massive.js'
import Options from '../src/components/OptionsContracts.jsx'
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('shows the options rate limit and blocks another manual request until cooldown',async()=>{
 getOptionChain.mockRejectedValue(Object.assign(new Error('rate limited'),{status:429,retryAfter:120}))
 render(<Options ticker="NVDA"/>)
 fireEvent.click(screen.getByRole('button',{name:'Load options data →'}))
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Massive rate limit reached'))
 const retry=screen.getByRole('button',{name:/Retry options in 12\ds/})
 expect(retry.disabled).toBe(true)
 fireEvent.click(retry)
 expect(getOptionChain).toHaveBeenCalledTimes(1)
})
