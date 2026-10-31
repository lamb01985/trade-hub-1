# React integration hooks

## Overview

Hooks connect browser state and UI to market data, the paper coach, operator AI capability and server-side Schwab endpoints. Business calculations are imported from `src/lib`; these hooks own React lifecycle and external effects.

## Interface

- `useLocalStorage(key, defaultValue)` returns `[value, setValue]`; invalid JSON/storage failures fall back or are silently ignored.
- `useLiveData(ticker = 'QQQ', levelMap = null, settings = {})` supplies scalar price/quotes, stream status, REST context, derived levels/volume metrics, context provenance (`dataTicker`), historical fallback status and refresh actions.
- `useLiveDataMulti(tickers)` supplies `{ data, connected, wsError, loadingContext, contextError, refreshContext }`, with data keyed by normalized ticker. Each bundle contains quote/context fields used by watchlist consumers.
- `useBot({ watchlist, liveDataMulti, activeTicker, checklistComplete, onPaperTrade })` bridges the multi-ticker engine to React. It adapts levels, opening range and alignment, evaluates each available ticker, ranks primary/pending views and exposes ticker-aware user actions to the Bot composer.
- `useSchwab()` exposes connection/account/positions/dayTrades, loading/error/warning, connect/disconnect, account refresh, quote/chain lookup and today's orders. `useAiCapability()` returns `{ available, message }` from protected server capability status.
- [Archived hook](./_archive/EGM.md) preserves the old rule-based single-ticker API.

## Invariants

- `useLiveData` rejects async context results for a ticker that changed during the request. Consumers must match `dataTicker` before trusting ticker-specific context and respect `isHistoricalFallback`.
- Multi-ticker data normalizes symbols and shares one stream per hook instance; separate App instances for bot, wheel and setup universes remain separate subscriptions. Context refresh is every five minutes; disconnected quote fallback polls every ten seconds.
- Bot state is indexed by ticker with a global lockout. Primary ranking prioritizes GO, IN_TRADE, WATCH, CLOSED, WAIT, then confidence and the active ticker. No-price bundles are skipped. Paper positions remain paper records.
- Schwab secrets/tokens are handled by server endpoints. Quote/chain results use a five-second cache; initial connected-account polling is every 60 seconds. Operator AI availability requires both configured and enabled server flags and is independent of broker connection.
- Storage is scoped to the browser origin and is not cross-device persistence.

## Side Effects

- Market hooks open/close streams, issue REST requests, schedule/clear timers, update React state and may trigger level alerts.
- Bot loads/saves engine state, plays sounds, sends notifications and updates the document title. `onPaperTrade` is the integration callback for journal-shaped paper records.
- Schwab uses same-origin credentialed requests, performs login navigation and cleans callback query markers using history replacement. Disconnect posts to the server, clears local account state and cache even if the request fails.
- AI capability fetches `/api/ai/status` on mount and operator session events; it removes its listener on unmount.

## Known Boundaries

- `useLiveDataMulti` context requests lack a cancellation or current-membership check before `setData`; an in-flight response can repopulate a ticker removed from the watchlist. Per-ticker fetch errors are swallowed, so an empty/partial bundle need not produce `contextError`.
- Single-ticker chart fallback bars and multi-ticker historical bundles are not evidence of a current trading session. Keep provenance checks in downstream strategy consumers.

## Verification

From repository root, run `npm test` and `npm run build`. Relevant manual checks include ticker switches during slow requests, watchlist removal during context loading, disconnected polling, local storage failures and independent operator/broker login. No live credentials or services were exercised for this documentation.

## Inspection Scope

Interfaces for all six active modules were inventoried; implementations were sampled up to 300 lines per file within 50 KB. Later portions of the 18 KB bot hook were not fully read; action names were cross-checked through the Bot component interface.

## Unified data increment

`useMarketData` polls authenticated same-origin capabilities/snapshot/1m-bars endpoints with generation-guarded selection, full-attempt timeout and cancellation. App authentication headers invalidate the operator; provider entitlement errors do not. Selection changes immediately remove old ticker data. Unified mode unmounts the legacy app tree; legacy hooks and evaluators also reject explicit Unified mode. Displayed quality ages without requiring a new response.
