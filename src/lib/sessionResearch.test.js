import { describe, it, expect } from 'vitest'
import { getResearchLevels, researchStatus, SESSION_RESEARCH } from './sessionResearch.js'

describe('dated session research', () => {
  it('never supplies another ticker or an expired plan to the live ladder', () => {
    expect(getResearchLevels('QQQ', '2026-10-30').some(level => level.price === 702.5)).toBe(true)
    expect(getResearchLevels('PLTR', '2026-10-30').some(level => level.price === 702.5)).toBe(false)
    expect(getResearchLevels('SMH', '2026-10-30')).toEqual([])
    expect(getResearchLevels('QQQ', '2026-10-31')).toEqual([])
    expect(getResearchLevels('QQQ', '2026-10-28')).toEqual([])
    expect(getResearchLevels('QQQ', '2026-10-29').length).toBeGreaterThan(0)
  })

  it('distinguishes evening prep, session use and archived research', () => {
    expect(researchStatus('2026-10-29')).toBe('EVENING PREP')
    expect(researchStatus('2026-10-30')).toBe('SESSION PLAN')
    expect(researchStatus('2026-11-02')).toBe('ARCHIVED')
    for (const plan of SESSION_RESEARCH) {
      expect(plan.levels.every(level => level.price > 0 && level.label && level.kind)).toBe(true)
    }
  })
})
