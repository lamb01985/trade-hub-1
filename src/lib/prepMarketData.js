import { getPriorSession, getLastTrade } from './massive.js'

// Request-scoped inputs: never borrow a price from another ticker or wait for
// unrelated background context. A failed price request preserves session prep.
export async function loadPrepMarketData(ticker) {
  const [sessionResult, priceResult] = await Promise.allSettled([
    getPriorSession(ticker, { priority: true }),
    getLastTrade(ticker, { priority: true }),
  ])
  if (sessionResult.status === 'rejected') throw sessionResult.reason
  const price = priceResult.status === 'fulfilled' ? priceResult.value : null
  const validPrice = typeof price === 'number' && Number.isFinite(price) && price > 0
  return {
    session: sessionResult.value,
    price: validPrice ? price : null,
    priceError: validPrice ? null : priceResult.status === 'rejected'
      ? `Price request failed: ${priceResult.reason?.message || 'unknown error'}.`
      : 'The provider returned no valid last-trade price.',
  }
}
