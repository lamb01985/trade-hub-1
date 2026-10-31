# Frontend application

## Overview

The Vite/React SPA mounts App into `#root`. App presents a Personalized Overview and grouped premium sidebar over the preserved Plan, Trade and Review state, browser-owned journal/settings/prep state, multiple market subscriptions, server-managed broker access and protected saved intelligence. Library modules supply calculations, contracts and client adapters.

## Interface

- [main.jsx](./main.jsx) installs the shared theme and calls `createRoot(...).render(<OperatorGate><App /></OperatorGate>)`; [App.jsx](./App.jsx) exports the root component and owns tab selection, shared state and integration callbacks.
- [constants.js](./constants.js) exports theme tokens, level/session labels and colors, setup labels, ET session helpers, holiday lookup, date/format helpers, IV context, `calcOptionRR` and `bsCalc`.
- [Components](./components/EGM.md) compose planning, chart/levels/checks, coach, scanners, journal and protected intelligence. [Hooks](./hooks/EGM.md) own browser lifecycle and integration effects. [Libraries](./lib/EGM.md) supply calculation, contract and client modules.
- Plan intelligence and review research are lazily imported. An `intelligence` query parameter selects the intelligence entry state; `tradehub-open-research` switches to Review / research.

## Invariants

- Default workspace is Personalized Overview; its content emphasis follows the ET session. Explicit intelligence deep links retain their existing destination. Workspace/subtab state is in memory; persisted user records use origin-local keys such as `th-trades`, `th-settings`, `th-prep` and `th-saved-preps`.
- Browser `apiKey = 'server-managed'` is a compatibility sentinel. The authenticated REST relay is the provider boundary; ws-auth is an authenticated 410 tombstone; it is not a usable secret.
- Operator AI capability, protected intelligence login and Schwab broker authentication are separate states. Browser UI must not treat one as evidence that another is enabled.
- Single active-ticker data, bot watchlist, wheel watchlist and setup/focus universe data are separate hook instances. Preserve ticker identity and historical-fallback provenance when sharing levels or strategy context.
- Retired Setups UI remains in source; App still hydrates setup state, subscribes its active universes and computes snapshots/evaluations. Focus symbols join that subscription union. Library calls and stored state may therefore remain active without the editor being mounted.
- Options risk/reward multiplies premium risk/reward by contracts and 100; Black–Scholes consumes positive underlying/strike, time in years and volatility as a decimal. Date helpers distinguish UTC `todayStr` from local journal `localDateStr`.

## Side Effects

- App hydrates/persists browser storage, migrates legacy saved universes and delegates focused/setup storage changes to library helpers.
- Hook instances initiate streams, REST refreshes, polling and broker account probes. App additionally loads daily setup history and schedules refresh/state ticks. Notifications and paper-journal callbacks cross UI/library boundaries.
- Lazy report views fetch protected server reports and maintain separate local research records. Local service preview is an origin-specific review mode with its own records; it does not import production records or broker sessions.

## Known Boundaries

- The market holiday table is hardcoded for 2026 and does not encode early closes. `nextSessionDayName(now)` derives dates from its argument but calls current-clock `getETMins()` for the time check; alternate-time callers should not assume complete injected-clock behavior.
- Frontend capability and historical labels are presentation contracts; server-side authorization, budgets and production storage require the API contracts and separate verification.

## Verification

From repository root, run `npm test` (`vitest run`) and `npm run build` (`vite build`). `npm run preview:local` is the configured local service preview. Documentation verification checks file contents and relative links; no dependency installation, service access, deployment or code changes are required.

## Inspection Scope

The root scout inspected main, constants and the first 300 lines of App within 50 KB, with imports/exports used for public boundaries. App's remaining rendering/callback implementation was not exhaustively inspected. Child contracts record their own limits. Read-only scouts ran inline because all four agent slots were occupied.

## Security remediation update

`OperatorGate` verifies the private operator session before mounting App, every 60 seconds and on focus/visibility restoration. Five-second verification failures unmount market consumers. Logout/expiry broadcasts only timestamp/nonce metadata across tabs; market caches, denial caches and pending WebSocket authentication are invalidated by session generation. Local journals remain intact. Provider 403 entitlement responses are distinct from app authentication failure. Legacy authenticated WebSocket key delivery remains a documented credential-exposure risk.

## Premium workspace update

See [workspace contract](./components/workspace/EGM.md). Navigation preserves every existing destination and browser key. Company research has an independently authenticated fallback during market discovery failure; protected market-only preview cannot use it. See [Alpha readiness](../docs/EDGEIQ-ALPHA-1-READINESS.md) for unactivated integrations and remaining risks.
