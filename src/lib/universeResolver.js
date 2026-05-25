// ─────────────────────────────────────────────────────────────────────────────
// universeResolver.js — bridge between universe-shape variants and the
// engine's expected flat ticker list.
//
// A setup's `universe` field can be one of three shapes:
//   1. ['AAPL', ...]                              legacy flat array
//   2. { type: 'list', tickers: ['AAPL', ...] }   discriminated list form
//   3. { type: 'saved', universeId: 'u_xxx' }     reference to a saved universe
//
// resolveUniverseTickers normalizes any of the above to a string[] of
// uppercase ticker symbols.
//
// universeIsSaved / universeMaterializedTickers / universeReplaceTickers are
// convenience helpers used by the SetupBuilder UI and by mutating consumers
// (e.g. MoversScanner add-to-setup) that need to write back a new universe.
// ─────────────────────────────────────────────────────────────────────────────

function uppercaseUnique(arr) {
  const seen = new Set()
  const out = []
  for (const t of arr || []) {
    if (!t) continue
    const T = String(t).toUpperCase().trim()
    if (!T || seen.has(T)) continue
    seen.add(T)
    out.push(T)
  }
  return out
}

// Main resolver. Pass the universe field and the savedUniverses array
// (from 'th-universes-v1'). Returns string[] of tickers.
export function resolveUniverseTickers(universe, savedUniverses = []) {
  if (!universe) return []
  if (Array.isArray(universe)) return uppercaseUnique(universe)
  if (typeof universe !== 'object') return []
  if (universe.type === 'list') return uppercaseUnique(universe.tickers || [])
  if (universe.type === 'saved') {
    const found = (savedUniverses || []).find(u => u?.id === universe.universeId)
    return uppercaseUnique(found?.tickers || [])
  }
  return []
}

export function universeIsSaved(universe) {
  return !!(universe && typeof universe === 'object' && universe.type === 'saved')
}

export function universeIsList(universe) {
  if (Array.isArray(universe)) return true
  return !!(universe && typeof universe === 'object' && universe.type === 'list')
}

// Materialize a universe to a flat ticker list for storage (snapshot).
export function universeMaterializedTickers(universe, savedUniverses = []) {
  return resolveUniverseTickers(universe, savedUniverses)
}

// Return a new universe object with the given ticker list, in list form.
// Use this when a mutating consumer (movers add-to-setup, etc.) needs to
// write back a new universe. Saved-type universes get converted to list
// (the saved-universe reference is lost; the tickers are preserved).
export function universeReplaceTickers(universe, tickers, savedUniverses = []) {
  // If the current universe is saved and tickers are not provided, snapshot.
  const snapshot = tickers || resolveUniverseTickers(universe, savedUniverses)
  return { type: 'list', tickers: uppercaseUnique(snapshot) }
}

// Append tickers to a universe, preserving its shape when possible. For
// 'saved' universes this returns a new list-form universe that combines
// the resolved tickers with the new ones.
export function universeAppendTickers(universe, newTickers, savedUniverses = []) {
  const current = resolveUniverseTickers(universe, savedUniverses)
  const merged = uppercaseUnique([...current, ...(newTickers || [])])
  if (universeIsSaved(universe)) {
    // Saved reference becomes a snapshot once the user adds tickers manually.
    return { type: 'list', tickers: merged }
  }
  if (universe && typeof universe === 'object' && universe.type === 'list') {
    return { ...universe, tickers: merged }
  }
  // Legacy array form: keep the discriminator going forward.
  return { type: 'list', tickers: merged }
}

// Normalize legacy/empty universes to the discriminated list form. Idempotent.
export function normalizeUniverse(universe) {
  if (!universe) return { type: 'list', tickers: [] }
  if (Array.isArray(universe)) return { type: 'list', tickers: uppercaseUnique(universe) }
  if (universe.type === 'list') return { ...universe, tickers: uppercaseUnique(universe.tickers || []) }
  if (universe.type === 'saved') return universe
  return { type: 'list', tickers: [] }
}
