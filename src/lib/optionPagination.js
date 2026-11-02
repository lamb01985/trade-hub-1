// Follow opaque cursors only; never send a provider URL or credential to our proxy.
export function optionCursor(next, symbol) {
  if (!next) return null
  const u = new URL(next)
  const cursor = u.searchParams.get('cursor')
  if (!['https://api.massive.com','https://api.polygon.io'].includes(u.origin) || u.username || u.password || u.hash || u.pathname !== `/v3/snapshot/options/${symbol}` || u.searchParams.getAll('cursor').length !== 1 || !/^[A-Za-z0-9._~+/=-]{1,2048}$/.test(cursor || '')) throw Error('Invalid options pagination identity')
  return cursor
}
