// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import OperatorGate from '../src/components/OperatorGate.jsx'
const session = authenticated => ({ ok: true, json: async () => ({ authenticated }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear() })
it('does not mount tools until the server verifies the operator', async () => {
  let resolve
  vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r })))
  render(<OperatorGate><p>Private tools</p></OperatorGate>)
  expect(screen.queryByText('Private tools')).toBeNull()
  await act(async () => resolve(session(true)))
  expect(screen.getByText('Private tools')).toBeTruthy()
})
it('ignores a delayed verified response after logout and keeps stored journals', async () => {
  let resolve
  vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r })))
  localStorage.setItem('th-trades', '[{"id":"preserved"}]')
  render(<OperatorGate><p>Private tools</p></OperatorGate>)
  act(() => window.dispatchEvent(new Event('tradehub-operator-logout')))
  await act(async () => resolve(session(true)))
  expect(screen.queryByText('Private tools')).toBeNull()
  expect(localStorage.getItem('th-trades')).toContain('preserved')
})
it('checks an open session periodically even without a provider request', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(session(true)).mockResolvedValue(session(false)))
  await act(async () => { render(<OperatorGate><p>Private tools</p></OperatorGate>) })
  expect(screen.getByText('Private tools')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(screen.queryByText('Private tools')).toBeNull()
  expect(screen.getByLabelText('Operator password')).toBeTruthy()
})
it('unmounts tools on another tab logout and emits a local cache reset', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(session(true)))
  const reset = vi.fn(); window.addEventListener('tradehub-market-session-reset', reset)
  render(<OperatorGate><p>Private tools</p></OperatorGate>)
  await screen.findByText('Private tools')
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'th-operator-logout', newValue: 'timestamp-only' })))
  expect(screen.queryByText('Private tools')).toBeNull()
  expect(reset).toHaveBeenCalledTimes(1)
  window.removeEventListener('tradehub-market-session-reset', reset)
})
it('preserves authenticated tools and reports failed sign out honestly', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(session(true)).mockResolvedValue({ ok: false }))
  render(<OperatorGate><p>Private tools</p></OperatorGate>)
  await screen.findByText('Private tools')
  fireEvent.click(screen.getByText('Sign out of TradeHub'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sign-out failed'))
  expect(screen.getByText('Private tools')).toBeTruthy()
})
it('fails closed on verification errors and verifies again on focus', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(session(true)).mockRejectedValue(new Error('synthetic failure'))
  vi.stubGlobal('fetch', fetch)
  render(<OperatorGate><p>Private tools</p></OperatorGate>)
  await screen.findByText('Private tools')
  act(() => window.dispatchEvent(new Event('focus')))
  await screen.findByText('Retry session check')
  expect(screen.queryByText('Private tools')).toBeNull()
})
