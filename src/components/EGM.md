# Trading workspace components

## Overview

React screens compose planning, session analysis, paper coaching and review. App owns shared trades, settings, prep and market bundles; components receive data and mutation/navigation callbacks. A separate intelligence workspace renders timestamped saved research.

## Interface

| Boundary | Entry modules and inputs |
| --- | --- |
| Session workspace | `Command({ trades, settings, onSettingsChange, lockedOut, onUnlock, aiCapability, liveData, marketEvents, instrument, ticker, levelMap, todayEvents, schwab })`; `Levels({ liveData, orbHigh, orbLow, settings, onSettingsChange, mtfAlignment, putThesis })` |
| Chart and checks | `ChartTab({ liveData, levelMap, trades, ticker, customLevels, onCustomLevelsChange, mtfAlignment, putThesis, volumeThresholds, onVolumeThresholdsChange })`; `CheckTab` and `InlineCheckGate` receive ticker-specific data, levels and alignment |
| Tab library | `tabs.jsx` exports `ORBTab`, `IVAnalyzerTab`, `CalculatorTab`, `ChecklistTab`, `StatsTab`, `WatchlistTab`, `PrepTab` and `SANITY_THRESHOLD = 0.05`; these connect prep, calculations, checklists and journal callbacks |
| Paper coach | `Bot` accepts activeTicker, checklistComplete, onPaperTrade, watchlist, onWatchlistChange and liveDataMulti; composes right-now, pending, today, patterns, settings and watchlist panels. `MAX_BOT_WATCHLIST = 5` is exported by `BotWatchlistChips` |
| Planning and research | `CorePlaybook`, `Playbook`, `CalendarTab`, `Focus`/`FocusedTickerCard`, `MoversScanner`, `UniverseBuilder`, `WheelScanner`, `OutcomesAnalyzer` |
| Setup editing surfaces | `Setups`, `SetupCard`, `SetupBuilder`, `SetupTemplatesLibrary`, `AdjustSetupsModal`, `ShortThesis`, `ThesisEditor`, `BacktestResults`; presence does not imply active App navigation |
| Journal and shared UI | `Journal`, `QuickLog`, glossary views; `ui.jsx` exports `Tip`, `Card`, `SLabel`, `Heading`, `Tile`, `Fld`, `Sel`, `Btn`, `Pill`, `CheckRow`; `ErrorBoundary` contains render errors |
| Protected report views | [Intelligence contract](./intelligence/EGM.md): Market Map, Options Intelligence, analyst briefs, training and hypothetical outcomes |

## Invariants

- App comments explicitly retire the generic Setups screen in favor of Core Playbook while preserving setup state and supporting modules. Do not infer a mounted feature from a file export alone.
- ORB calculations use underlying prices. Contract sizing/stop/target inputs must remain distinct from underlying chart prices. `ORBTab` rejects an opening range more than 5% from the supplied live reference and invalid high/low order.
- ORB signal evaluation aggregates one-minute bars to completed five-minute bars after the 9:30–9:45 ET opening window, dropping in-flight buckets. Saved levels retain timestamps and switching tickers clears or reloads matching saved prep.
- Bot actions are bound to the current card's ticker; pending queue handlers retain explicit ticker arguments. Synthetic GO injection is guarded by `import.meta.env.DEV`.
- AI capability comes from the protected server status passed by App. The API-key sentinel is a compatibility gate, not a browser credential.
- `LocalPreviewNotice` displays separate-origin settings/journal and disabled live feeds, broker access and AI billing when the local-service predicate holds. It also describes possible real Nasdaq earnings failure without substituting earnings fixtures.

## Side Effects

- Components invoke callbacks to persist or mutate shared state; paper trade logging is distinct from actual broker execution.
- Sampled tab code loads market data through library clients, manages timers and local storage, and computes ORB signals. Chart imports the lightweight-charts imperative rendering API and structure/premarket helpers.
- Protected intelligence performs login/report requests and local research writes under its child contract. UI notifications and broker navigation are integrated through hooks/libraries.

## Verification

From repository root, run `npm test` and `npm run build`. Review ORB ticker switches, stale saved levels, local-preview notice, coach ticker targeting and intelligence provenance in the browser. These documentation changes did not exercise broker, paid AI or live market services.

## Inspection Scope

Export/import surfaces were inventoried across all JSX files. A 50 KB directory scout budget prioritized shared UI, local notice, error boundary, tabs and chart entry code; implementations outside that sample, including most large scanner/editor/journal modules, were not audited. Child intelligence was inspected under its own budget. This is a boundary map, not an exhaustive behavioral specification of every screen.

## Unified read-only ETF context

`UnifiedMarketContext` shows only QQQ/SPY/IWM quote and completed-minute evidence, source times, profile, capability evidence and explicit freshness/coverage. It is separate from `LegacyApp`; coach, setup, Wheel and scanner consumers do not mount behind it. Later Market Map/options/action adapters remain migration pending. `OperatorGate` guards both modes.
