// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, it, expect } from 'vitest'
import AnalystBrief from '../src/components/intelligence/AnalystBrief.jsx'
import ResearchLedger from '../src/components/intelligence/ResearchLedger.jsx'
import { briefFixture } from './analystFixture.js'
import { RESEARCH_STORAGE_KEY } from '../src/lib/researchLedger.js'
afterEach(()=>{cleanup();localStorage.removeItem(RESEARCH_STORAGE_KEY);localStorage.removeItem('th-trades')})
it('explains evidence, competing cases and keeps historical readiness blocked',()=>{
 render(<AnalystBrief report={{analyst_briefs:[briefFixture()],daily_features:{QQQ:{},SPY:{}}}}/>)
 expect(screen.getByRole('heading',{name:'6. Competing bullish and bearish hypotheses'})).toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'7. limitations'})).toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('I reviewed risk and the stand-aside conditions'))
 expect(screen.getByText(/NOT READY: historical sample/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'SPY',exact:true}));expect(screen.getByText(/Analyst brief unavailable for SPY/)).toBeInTheDocument()
})
it('saves a hypothesis and reloads it in the separate research history',()=>{
 localStorage.setItem('th-trades','actual journal unchanged')
 const a=render(<AnalystBrief report={{analyst_briefs:[briefFixture()],daily_features:{QQQ:{}}}}/>)
 fireEvent.click(screen.getByText('Evidence, assumptions and research scenarios'));fireEvent.click(screen.getByRole('button',{name:'Save bullish hypothesis'}));for(const label of ['Your hypothesis','Strongest counterargument','What would invalidate the case','Risk assumptions, costs and maximum loss'])fireEvent.change(screen.getByLabelText(label),{target:{value:'Dated evidence and a clearly stated alternative.'}});fireEvent.click(screen.getByRole('button',{name:'Save research plan'}));expect(screen.getByText(/Research hypothesis saved separately/)).toBeInTheDocument()
 a.unmount();render(<ResearchLedger/>);expect(screen.getByText('Outcome pending. No result is inferred.')).toBeInTheDocument()
 expect(localStorage.getItem('th-trades')).toBe('actual journal unchanged')
})
