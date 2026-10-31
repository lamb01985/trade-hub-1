// @vitest-environment jsdom
import React from 'react'
import { render,screen,fireEvent,cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach,it,expect } from 'vitest'
import TrainingMode from '../src/components/intelligence/TrainingMode.jsx'
import AnalystBrief from '../src/components/intelligence/AnalystBrief.jsx'
import { saveLearning,loadLearning,LEARNING_KEY } from '../src/lib/learningJournal.js'
import { briefFixture } from './analystFixture.js'
const lesson={id:'structure',title:'Mixed structure',context:'Observed Friday data, not a forecast.',choices:['Require evidence','Predict certainty','Ignore uncertainty'],correct_index:0,explanation:'The observation does not guarantee a future result.',source_cutoff:'2026-10-23T20:00:00Z',report_id:'synthetic'}
function report(){const b=briefFixture();b.desk={simple_sections:['The Big Picture','What Matters Today','What the Options Market Is Telling Us','What Would Change the Outlook','What To Do'].map((title,i)=>({id:String(i),title,text:'Source-grounded explanation.',teach:'Why this matters.'})),quant:{status:'UNAVAILABLE',summary:'No current data',comparisons:[],assumptions:[]},flow_detail:{},validation:{status:'NOT_VALIDATED',reason:'No verified samples.',validated_samples:0,requirements:[]},training:[lesson]};return{analyst_briefs:[b],daily_features:{QQQ:{}}}}
afterEach(()=>{cleanup();localStorage.removeItem(LEARNING_KEY)})
it('keeps detail collapsed and starts with five simple sections; teach mode is optional',()=>{
 render(<AnalystBrief report={report()}/>);
 for(const text of ['1. The Big Picture','2. What Matters Today','3. What the Options Market Is Telling Us','4. What Would Change the Outlook','5. What To Do'])expect(screen.getByRole('heading',{name:text})).toBeInTheDocument()
 expect(screen.queryByText('Why this matters.')).not.toBeInTheDocument();fireEvent.click(screen.getByLabelText('Teach Me: explain the reasoning'));expect(screen.getAllByText('Why this matters.')).toHaveLength(5)
 expect(screen.getByText('Evidence, assumptions and research scenarios').parentElement.open).toBe(false)
})
it('requires correct interpretation and all three explanations to complete a lesson',()=>{
 render(<TrainingMode report={report()}/>);fireEvent.click(screen.getByLabelText('Predict certainty'));fireEvent.click(screen.getByRole('button',{name:'Check understanding'}));expect(screen.getByRole('status')).toHaveTextContent('Reconsider')
 expect(screen.queryByRole('button',{name:'Save lesson reflection'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('Require evidence'));fireEvent.click(screen.getByRole('button',{name:'Check understanding'}));
 for(const label of ['Your hypothesis','The strongest counterargument','What would invalidate your hypothesis'])fireEvent.change(screen.getByLabelText(label),{target:{value:'This is a dated and testable research explanation.'}})
 fireEvent.click(screen.getByRole('button',{name:'Save lesson reflection'}));expect(loadLearning()).toHaveLength(1);expect(loadLearning()[0].validation).toBe('EDUCATIONAL_NOT_STRATEGY_VALIDATION')
})
it('rejects unsupported completion and preserves unreadable existing learning records',()=>{
 expect(()=>saveLearning(lesson,2,{})).toThrow();expect(()=>saveLearning(lesson,0,{})).toThrow()
 localStorage.setItem(LEARNING_KEY,'broken');expect(()=>loadLearning()).toThrow();expect(localStorage.getItem(LEARNING_KEY)).toBe('broken')
})
