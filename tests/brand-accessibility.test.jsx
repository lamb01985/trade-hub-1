// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { THEME, installTheme } from '../src/lib/theme.js'
import { Brand, FinancialStatus } from '../src/components/Brand.jsx'

afterEach(cleanup)
const luminance = hex => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
it('keeps body, secondary and financial signal text above WCAG AA contrast on both surfaces', () => {
  for (const background of ['background', 'surface']) for (const foreground of ['text', 'secondary', 'accent', 'positive', 'caution', 'negative']) {
    const ratio = (luminance(THEME.colors[foreground]) + .05) / (luminance(THEME.colors[background]) + .05)
    expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
  }
})
it('keeps dark text readable on filled accent buttons and installs the same CSS palette', () => {
  expect((luminance(THEME.colors.accent) + .05) / (luminance(THEME.colors.background) + .05)).toBeGreaterThanOrEqual(4.5)
  expect((luminance(THEME.colors.text) + .05) / (luminance(THEME.colors.brokerSurface) + .05)).toBeGreaterThanOrEqual(4.5)
  installTheme()
  expect(document.documentElement.style.getPropertyValue('--edge-background')).toBe(THEME.colors.background)
})
it('labels the brand and financial states without relying on color', () => {
  render(<><Brand />{['GREEN', 'YELLOW', 'RED', 'UNKNOWN'].map(state => <FinancialStatus key={state} state={state} />)}</>)
  for (const label of ['EdgeIQ', 'Find your edge.', 'Positive', 'Caution', 'Negative', 'Insufficient data']) expect(screen.getByText(label)).toBeTruthy()
})
