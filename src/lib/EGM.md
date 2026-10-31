# Shared browser libraries

## Overview

Browser-facing market-data access, technical analysis, setup evaluation, paper-trade state, persistence, notifications, and market-intelligence report adaptation. Modules export directly from their own files; there is no package barrel. Live-data clients depend on same-origin server routes; the sample intelligence report has a separate validated boundary.

## Interface

The following index lists the direct named exports. Function bodies outside the bounded scout selection were not audited; names alone do not establish a behavioral guarantee.

| Module | Named exports |
| --- | --- |
| [alerts.js](./alerts.js) | `Sounds`, `notify`, `fireAlert`, `requestNotificationPermission`, `checkLevelAlerts`, `playSetupForming`, `playGoLive`, `playPositionOpened`, `playWin`, `playLoss`, `playStopWarning`, `playLockout`, `updateTabTitle` |
| [apiHealth.js](./apiHealth.js) | `recordSuccess`, `recordFailure`, `recordRateLimit`, `recordUnavailable`, `getUnavailableEndpoints`, `snapshot`, `subscribe`, `clear` |
| [bot.js](./bot.js) | `GO_WINDOW_MS`, `CLOSED_LINGER_MS`, `WATCH_NEAR_DISTANCE`, `WATCH_DROP_DISTANCE`, `DEFAULT_DAILY_LOSS_LIMIT`, `DEFAULT_CONFLUENCE_THRESHOLD`, `DEFAULT_OPTION_DELTA`, `DEFAULT_CONTRACTS`, `SESSION_HISTORY_CAP`, `createTickerState`, `createInitialState`, `ensureTicker`, `tickerSlice`, `totalRealizedPL`, `totalUnrealizedPL`, `saveState`, `loadState`, `markPosition`, `checkExit`, `closePosition`, `nearestTradableLevel`, `isLockedOut`, `evaluateContext`, `userTakeIt`, `userSkipIt`, `userCloseManually`, `userDismissClosed`, `userUnlock`, `resetSession`, `updateSettings`, `setChecklistComplete`, `devInjectTestSetup`, `sessionStats`, `perTickerPLBreakdown`, `patternsByActivity`, `disciplineStreak`, `skipQuality` |
| [calendar.js](./calendar.js) | `MAJOR_TICKERS`, `MIN_EARNINGS_MARKET_CAP`, `HIGH_IMPACT_MARKET_CAP`, `ymd`, `parseYmd`, `isTripleWitchingDate`, `isMonthlyOPEX`, `fetchNasdaqEarnings`, `getAllEvents`, `eventsOn`, `highImpactToday`, `startOfWeek`, `colorForEvent` |
| [conditionEvaluators.js](./conditionEvaluators.js) | `emaSeries`, `ema`, `rsi`, `macd`, `buildSnapshot`, `evaluateCondition`, `evaluateAll` |
| [conditionLibrary.js](./conditionLibrary.js) | `CATEGORIES`, `CONDITIONS`, `CONDITIONS_BY_ID`, `conditionsByCategory`, `defaultParamsFor` |
| [focusedTickersStorage.js](./focusedTickersStorage.js) | `FOCUSED_TICKERS_KEY`, `FT_SEEDED_FLAG`, `createFocusedTicker`, `loadFocusedTickers`, `saveFocusedTickers`, `SEED_RECORDS`, `bootstrapFocusedTickers` |
| [indicators.js](./indicators.js) | `computeEMA`, `computeRSI`, `computeMACD`, `computeHV`, `nDayHigh`, `nDayLow`, `lastEMA`, `lastRSI` |
| [intelligenceNavigation.js](./intelligenceNavigation.js) | `INTELLIGENCE_VIEWS`, `intelligenceFromSearch` |
| [learningJournal.js](./learningJournal.js) | `LEARNING_KEY`, `loadLearning`, `saveLearning` |
| [levels.js](./levels.js) | `SQ_ON_LEVEL_ATR`, `SQ_APPROACHING_ATR`, `SQ_TIGHT_RANGE_ATR`, `SQ_FALLBACK_ATR_PCT`, `SQ_LIVE_SESSIONS`, `SQ_MARKET_CLOSED`, `calcVWAP`, `calcPivots`, `scoreSetupQuality`, `calcFibs`, `detectSDZones`, `tickSizeFor`, `calcIntradayVolumeProfile`, `calcVolumeProfile`, `calcATR`, `buildLevelMap` |
| [localPreview.js](./localPreview.js) | `isLocalServicePreview`, `LOCAL_MARKET_LIMITATION` |
| [massive.js](./massive.js) | `isEndpointUnavailable`, `listUnavailableEndpoints`, `clearMassiveCache`, `getLastTrade`, `getDayBars`, `getIntradayBars`, `getIntradayBarsForDate`, `getFinancials`, `getTickerDetails`, `getSnapshot`, `getWeeklyBarsRange`, `getRecentNews`, `getShortInterest`, `priorTradingDayStr`, `MARKET_HOLIDAYS_2026`, `mostRecentSessionDate`, `getPremarketBars`, `getPriorSession`, `getPrevDay`, `prevDayPlausible`, `getWeeklyData`, `getHistoricalBars`, `getTopMovers`, `MassiveStream`, `MassiveStreamClient` |
| [notify.js](./notify.js) | `subscribe`, `notify`, `dismiss`, `clearAll`, `requestNotificationPermission`, `formatTriggerTelegram`, `formatTriggerEmail`, `notifyTriggered` |
| [orbSignalEngine.js](./orbSignalEngine.js) | `CONFIRMATION_WINDOW_BARS`, `EXTENSION_INVALIDATION_MULT`, `evaluateOrbSignals`, `detectStaleLevels` |
| [playbook.js](./playbook.js) | `CONFLUENCE_DEFAULT_THRESHOLD`, `TOUCH_TOLERANCE`, `CONFLUENCE_STACK_RADIUS`, `STOP_OFFSET_LEVEL`, `STOP_OFFSET_VWAP`, `REVERSAL_MIN_BODY_PCT`, `COOLDOWN_MINUTES`, `RVOL_BONUS_THRESHOLD`, `PLAYBOOK`, `PLAYBOOK_BY_ID`, `evaluatePlaybook` |
| [premarket.js](./premarket.js) | `isPreMarketBar`, `isRegularSessionBar`, `filterPreMarket`, `filterRegularSession`, `computePreMarketStats`, `PREMARKET_START_ET_MIN`, `MARKET_OPEN_ET_MIN` |
| [reportContract.js](./reportContract.js) | `REPORT_STALE_HOURS`, `freshness`, `parseReport`, `adaptPythonReport` |
| [researchLedger.js](./researchLedger.js) | `RESEARCH_STORAGE_KEY`, `RESEARCH_OUTCOMES`, `loadResearch`, `saveHypothesis`, `recordResearchOutcome` |
| [schwabClient.js](./schwabClient.js) | `SCHWAB_BLUE`, `SCHWAB_TRADE_URL`, `occSymbol`, `countDayTrades`, `ordersToTrades` |
| [sectors.js](./sectors.js) | `SECTORS`, `BENCHMARK`, `TICKER_TO_SECTOR`, `sectorForTicker`, `flowLabel`, `tierColor`, `trendArrow`, `readSectorCache`, `writeSectorCache`, `rotationContextForTicker`, `getRotationSnapshot` |
| [setupBacktest.js](./setupBacktest.js) | `backtestSetup` |
| [setupEngine.js](./setupEngine.js) | `evaluateSetupForTicker`, `evaluateSetup`, `evaluateAllSetups`, `computeStagedTrade`, `derivePutThesesProjection` |
| [setupStorage.js](./setupStorage.js) | `SETUPS_KEY`, `MIGRATED_FLAG`, `SEEDED_FLAG`, `ALERT_LOG_KEY`, `LEGACY_KEY`, `createSetup`, `loadSetups`, `saveSetups`, `loadAlertLog`, `saveAlertLog`, `migrateLegacyIfNeeded`, `seedExamplesIfEmpty`, `bootstrapSetups` |
| [setupTemplates.js](./setupTemplates.js) | `CATEGORY_LABELS`, `CATEGORY_ORDER`, `SETUP_TEMPLATES`, `TEMPLATE_BY_ID`, `templatesByCategory` |
| [shortThesis.js](./shortThesis.js) | `DEFAULT_UNIVERSE`, `fetchTickerData`, `scoreTicker`, `MOMENTUM_MEME_TICKERS`, `setupStage`, `stageColor`, `highFreshness`, `timingRisk`, `isMomentumMeme`, `scoreLabel`, `scanUniverse` |
| [structure.js](./structure.js) | `detectSwings`, `labelSwings`, `analyzeStructure`, `detectBOS`, `fullAnalysis`, `aggregateBars`, `alignmentScore`, `computeMTF` |
| [templateSuggestions.js](./templateSuggestions.js) | `aggregateProfile`, `suggestTemplates`, `TEMPLATE_BY_ID`, `SETUP_TEMPLATES` |
| [tradeAggregator.js](./tradeAggregator.js) | `aggregateFills`, `_resetTradeIdsForTests` |
| [tradeSyncCore.js](./tradeSyncCore.js) | `mergeFills`, `applySyncBatch` |
| [universeResolver.js](./universeResolver.js) | `resolveUniverseTickers`, `universeIsSaved`, `universeIsList`, `universeMaterializedTickers`, `universeReplaceTickers`, `universeAppendTickers`, `normalizeUniverse` |
| [wheelOptions.js](./wheelOptions.js) | `computeHV30`, `pickPutStrike`, `pickCallStrike`, `estimatePremium`, `estimateDelta`, `getOptionsData` |

Child boundaries:

- [Broker adapter grouping](./tradeAggregator/EGM.md): normalization scaffolds feeding the separate `tradeAggregator.js` module.
- [Archived bot](./_archive/EGM.md): legacy paper-trading API, distinct from `bot.js`.

### Market-data and options boundary

`massive.js` sends REST requests through `/api/polygon/proxy` with the upstream path in the `path` query parameter. Its WebSocket authentication route is `/api/polygon/ws-auth`; the source explicitly describes returning a key to the browser for WebSocket authentication. REST credentials are injected by the server. The inspected transport retries network errors, 429 and eligible 5xx responses up to three attempts, uses a 15-second attempt timeout, and spaces background requests by 25 ms. Priority requests bypass that gate. `getDayBars(ticker, from, to, { priority, fresh })` uses the priority option on its fresh branch; its cached branch uses `getCachedJson` without that option.

`wheelOptions.js` exposes historical-volatility and Black–Scholes estimates, with `getOptionsData` returning `{ putCandidate, callCandidate }`; candidate fields include `strike`, `estPremium`, `dte`, and `deltaApprox`. These are model estimates from stock bars, not an implemented live option-chain export. The source comment suggesting `getOptionChain` names a future integration; that symbol is absent from the export index.

### Sector and intelligence boundary

`sectors.js` owns eleven SPDR sector definitions, the SPY benchmark, and a static ticker-to-sector mapping used for contextual information. `sectorForTicker` uppercases its input and returns a matching definition or `null`. `getRotationSnapshot()` fetches snapshots and two daily-bar ranges for eleven sectors plus SPY, then returns `{ rows, spy, fetchedAt }` sorted by descending score. Each row includes metrics, score, partial status, label, arrow and tier. `rotationContextForTicker` supplies cached sector context to consumers such as watchlists and AI briefs; it does not fetch fresh data.

`reportContract.js` compiles strict Ajv schemas from repository `/contracts/`. `parseReport(value)` validates and returns the value or throws. `adaptPythonReport(raw, now)` validates the Python report, selects provider-derived fields without recalculating analytics, marks the adapted report as a dated preparation sample, removes options `trade_flow.evidence` and `positioning.contract_changes`, and validates the resulting report. `freshness` distinguishes `UNAVAILABLE`, `FUTURE_TIMESTAMP`, `STALE`, and `RECENT` using a 24-hour threshold.

## Invariants

- Preserve the separation between sample intelligence and live market data. `LOCAL_MARKET_LIMITATION` says local review disables live services and restricts the Friday snapshot to Market Intelligence; local service detection is an explicit exported helper. Availability still depends on the actual server route configuration.
- Preserve report schema validation and provenance timestamps at the report boundary. Schema failures throw rather than silently manufacturing analytics.
- Sector scores are clamped to [-100, 100]. Missing snapshots produce null metrics, score zero and `partial: true`; missing supporting data can also mark partial results. A neutral label alone does not prove complete data.
- Sector cache key is `th-sector-cache`. `readSectorCache` computes `stale` after 30 minutes and can return stale data; consumers must retain that flag. `getRotationSnapshot` does not write the cache automatically.
- Option premiums are per-share estimates; a standard contract multiplier is 100. Volatility requires at least 20 valid positive closes, using up to 30 bars. Call-strike selection raises the strike to cost basis when needed.
- The transport response cache is in memory, capped at 500 entries, with endpoint-specific TTLs. `clearMassiveCache` clears that cache, not every transport state structure.
- Endpoint-unavailability matching currently examines the URL pathname; calls use the shared proxy pathname. Distinct upstream paths in query parameters therefore share a pattern in this implementation. Do not infer endpoint-specific isolation from the helper names.
- Adapter modules below this directory remain throwing scaffolds; their stable fill shape does not imply broker import is operational.

## Side Effects

- Market and calendar clients may perform network requests. The inspected Massive transport updates shared API-health state, uses timers, records unavailable patterns and logs failures. Streaming exports are indexed, but their full lifecycle was outside the implementation scan.
- Sector cache reads and writes use browser `localStorage`; parse and storage failures are caught. Report schemas compile at module initialization; report adaptation itself performs no network request.
- Storage modules and bot persistence expose browser state operations. Alert and notification modules expose permission, sound, title and notification operations; detailed implementations were outside this bounded scan.
- Pure option calculations do not place broker orders. Broker execution/import capabilities must be established at their separate server and adapter boundaries.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). Relevant existing suites include `src/lib/massive.test.js`, `massiveStream.test.js`, `levels.test.js`, `orbSignalEngine.test.js`, `tradeAggregator.test.js`, and `tradeSyncCore.test.js`. This documentation pass did not execute tests or contact market services.

## Inspection Limits

The inline scout used exported declarations across production modules and selected implementation excerpts for Massive transport (first 300 lines), sectors, option estimation (first 180 lines), report adaptation and local-preview messaging, within the directory reading budget. Tests were excluded from symbol discovery. Other implementations and the latter Massive streaming/session helpers are indexed by their declarations only. This is a bounded architectural contract, not a full runtime audit.

## Provider confinement update

The reviewed confinement increment supersedes earlier browser-key statements in this contract. Source ws-auth is now an authenticated410 tombstone that never reads/delivers a provider key. Legacy observations use authenticated shared REST polling with field invalidation and session cancellation. Shared account admission has an independent enforcement flag and separate optional budget-store credentials. Production remains unchanged until explicitly deployed; previously copied keys remain valid until separately revoked. See docs/preview/PROTECTED-PREVIEW-RUNBOOK.md and IMPLEMENTATION-REPORT.md.
