// @vitest-environment jsdom
import React from 'react'
import {afterEach,it,expect,vi} from 'vitest'
import {render,cleanup} from '@testing-library/react'
const capture=vi.hoisted(()=>({options:null,candles:null}))
vi.mock('lightweight-charts',()=>({
 CandlestickSeries:'candles',HistogramSeries:'volume',LineSeries:'line',LineStyle:{Dashed:1,Dotted:2},
 createSeriesMarkers:()=>({setMarkers:vi.fn()}),
 createChart:(_el,options)=>{
  capture.options=options
  const timeScale={fitContent:vi.fn(),subscribeVisibleLogicalRangeChange:vi.fn(),unsubscribeVisibleLogicalRangeChange:vi.fn()}
  return {addSeries:type=>{const s={setData:vi.fn(),update:vi.fn(),applyOptions:vi.fn(),priceToCoordinate:()=>null,createPriceLine:()=>({applyOptions:vi.fn()}),removePriceLine:vi.fn()};if(type==='candles')capture.candles=s;return s},priceScale:()=>({applyOptions:vi.fn()}),timeScale:()=>timeScale,applyOptions:vi.fn(),remove:vi.fn()}
 }
}))
import Chart from '../src/components/Chart.jsx'
afterEach(cleanup)
it('formats the CT axis across DST without changing provider candle timestamps or synthesizing ticks',()=>{
 const friday=Date.parse('2026-10-30T13:30:00Z'),monday=Date.parse('2026-11-02T14:30:00Z')
 const bars=[{t:friday,o:100,h:101,l:99,c:100,v:10}]
 const props={researchOnly:true,ticker:'QQQ',liveData:{intradayBars:bars,price:null},levelMap:{levels:[]},trades:[]}
 const view=render(<Chart {...props}/>)
 expect(capture.options.timeScale.tickMarkFormatter(friday/1000)).toBe('08:30')
 expect(capture.options.timeScale.tickMarkFormatter(monday/1000)).toBe('08:30')
 expect(capture.options.localization.timeFormatter(friday/1000)).toContain('CDT')
 expect(capture.options.localization.timeFormatter(monday/1000)).toContain('CST')
 expect(capture.candles.setData.mock.calls.at(-1)[0][0].time).toBe(friday/1000)
 view.rerender(<Chart {...props} liveData={{...props.liveData,price:200,priceTimestamp:monday}}/>)
 expect(capture.candles.update).not.toHaveBeenCalled()
})
