# Milestone 2: integration inventory and entitlement evidence

Date: 2026-10-25. Scope: read-only code/document review and bounded requests through the connected Massive plugin. No application implementation, environment modification, subscription purchase or deployment was performed. Probe results below describe the connected account; matching it to TradeHub's deployed key is not yet established.

## Existing integration inventory

| Area | Implementation evidence | Current boundary or defect |
| --- | --- | --- |
| Browser REST | [massive.js](../../src/lib/massive.js) | Last trade, stock snapshots, intraday/daily/weekly bars, prior session, movers, reference, financials, news and short interest through same-origin proxy. Daily requests use limit 50 without pagination; current-minute requests use limit 500. |
| Browser streaming | [massive.js](../../src/lib/massive.js), [single hook](../../src/hooks/useLiveData.js), [multi hook](../../src/hooks/useLiveDataMulti.js) | Shared in-tab stock socket, T/Q subscriptions and REST fallback. Provider key reaches browser memory through ws-auth; multiple tabs/devices do not share the module hub. Source timestamps are lost at several hook boundaries. |
| Vercel provider transport | [polygon helper](../../api/_lib/polygon.js), [proxy](../../api/polygon/proxy.js), [ws-auth](../../api/polygon/ws-auth.js) | POLYGON_API_KEY, legacy api.polygon.io host. Prefix allowlist, explicit options-snapshot block, no implemented operator guards on these routes. Security fixes are specified but not implemented. |
| Live UI consumers | [App](../../src/App.jsx), [Levels](../../src/components/Levels.jsx), [Chart](../../src/components/Chart.jsx), [sectors](../../src/lib/sectors.js), [coach hook](../../src/hooks/useBot.js), [setup snapshots](../../src/lib/conditionEvaluators.js) | Multiple REST hydration loops; wrong-ticker asynchronous prices and stale/historical evaluation risks in drift report. Sector retrieval time can look like source freshness. No TradeHub index/futures data adapter. |
| Legacy options UI | [tabs.jsx](../../src/components/tabs.jsx), [wheelOptions.js](../../src/lib/wheelOptions.js), [WheelScanner](../../src/components/WheelScanner.jsx) | IV fetch deliberately returns an options-plan-unavailable message without requesting a chain. Wheel candidates are HV/Black–Scholes estimates. Source comments asserting no options subscription are not account evidence. |
| Optional broker data | [Schwab resource handler](../../api/schwab/[resource].js), [broker hook](../../src/hooks/useSchwab.js) | Separate provider and auth; quote/chain reads must not silently stand in for Massive. Broker execution import has unrelated accuracy/scaffold issues. |
| Historical intelligence | [report loader](../../api/_lib/reports.js), [adapter](../../src/lib/reportContract.js), [views](../../src/components/intelligence/MarketIntelligence.jsx), [options adapter](../../scripts/options_workspace.py) | File pinned to October 26 sample; Friday evidence, not current-session streaming. Per-expiration reconstruction uses archived source contracts. Frontend schemas are sample-only. |
| Python Massive provider | [adapter](../../../trade-decision-engine/app/market_data/massive.py), [interfaces](../../../trade-decision-engine/app/market_data/base.py) | Existing reusable server-side implementation: equity snapshots/observations, aggregate pagination, option contract discovery/chains/bars/trades/quotes, futures contract discovery/minute bars. Uses MASSIVE_API_KEY, unlike TradeHub's POLYGON_API_KEY. Generic failure classification and heuristic timestamp normalization need refinement. |
| Python analytics | [market map builder](../../../trade-decision-engine/app/market_intelligence.py), [options engine](../../../trade-decision-engine/app/options_flow_engine.py), [options evidence](../../../trade-decision-engine/app/options_intelligence.py) | Existing analytics and SQLite source snapshots. Market-map builder is preparation-oriented and rejects option observations at/after target-session open; it is not an intraday publisher. Snapshot persistence replaces same-day contract rows, so it is not an immutable intraday evidence log. |
| Python serving | [main](../../../trade-decision-engine/app/main.py), [report router](../../../trade-decision-engine/app/intelligence_api.py), [freshness](../../../trade-decision-engine/app/freshness.py), [NQ probe](../../../trade-decision-engine/app/futures_probe.py) | Existing FastAPI options endpoints, historical latest/history reports and data-only NQ probe. Historical freshness uses 24 hours; equity freshness uses 90/300 seconds. Neither suffices unchanged for all products. Service-to-service auth for new data routes must be explicit; do not assume existing routes are private. |
| Local modes | [Vite config](../../vite.config.js), [local API middleware](../../scripts/vite-api.mjs), [historical preview](../../scripts/local-preview.mjs) | Working-tree local middleware executes actual handlers; historical preview remains a separate disabled-feed mode. No local .env files or operator/provider variables were present in the prior presence-only inspection. Native Vercel runtime differs from Vite middleware. |

The [root architecture](../../EGM.md), [library contract](../../src/lib/EGM.md), [API contract](../../api/EGM.md), and [drift report](../../EGM-DRIFT-REPORT.md) remain the architecture baseline. The inventory above records discoveries beyond bootstrap sampling, not completed fixes.

## Evidence levels

1. **User reported:** an Options Standard subscription exists. This exact plan label is not verified from account billing.
2. **Documentation verified:** current public plan/endpoint pages describe capabilities and field-level restrictions. They do not establish purchased entitlements.
3. **Connected-account observed:** the plugin returned fields or an explicit NOT_ENTITLED response for the particular bounded request.
4. **Deployment-key verified:** not established. TradeHub's server credential was not read, copied or substituted into plugin requests. No account identity or secret was printed.
5. **Live-session verified:** not established for stocks/options because these checks occurred on Sunday. A REAL-TIME field label and a successful response do not prove a current updating feed.

## Probe ledger

Checks occurred during approximately 23:42–23:52 UTC on 2026-10-25. Each options snapshot used one row, not an exhaustive chain. No raw provider datasets are saved in this document.

| Capability/request | Observed result | What it establishes and does not establish |
| --- | --- | --- |
| Stock snapshots: QQQ, SPY, IWM | Rows returned with trade, quote, minute/day and prior-day columns | Snapshot access and field presence on connected account. Weekend observations do not establish live cadence or subscription tier. |
| Option-chain snapshots: QQQ, SPY, IWM | One row per symbol; pagination remains | Chain access, OI, Greeks/IV and quotes present in sampled rows. SPY/IWM rows also had trade fields. No guarantee of all contracts/fields/expirations or complete pagination. |
| QQQ sampled option quote timeframe | Provider labeled REAL-TIME; timestamp belonged to Friday | Provider feed label is present, but observation was historical. Not an actionable/current quote. |
| Historical QQQ option quotes, one sampled contract on October 23 | Rows returned with bid/ask and SIP timestamp | This precise historical quote request was accessible. It does not prove every date or quote product is licensed. |
| Historical trades for that same option | EMPTY warning, zero records | Inconclusive: sparse/no trades does not establish denial or entitlement. |
| Daily bars for that same option | EMPTY warning | Inconclusive; no fabricated baseline or plan conclusion. |
| I:VIX index snapshot | Explicit NOT_ENTITLED warning | This request is not covered on the connected account. |
| I:VIX daily aggregate for October 23 | Explicit NOT_ENTITLED warning | That historical request is also not covered. Do not substitute an ETF or another website and call it Massive VIX. |
| NQ and ES futures snapshots | Explicit NOT_ENTITLED warnings | Those snapshot requests are not covered; reference access does not change that. |
| ES futures contracts reference, broad active query | Reference row and pagination returned | Metadata access only. The first row was not validated as the current/front contract and was not adopted. |
| ES aggregate query against that unverified reference row | EMPTY warning | Inconclusive: not proof that current-contract history is unavailable or allowed. |
| Dated ES/NQ contract queries | Initial sort request rejected with 400; corrected documented ticker sort plus date/expiry filters returned EMPTY | Current dated resolution remains unverified. No contract ticker is hardcoded or inferred from these results. Runtime sort support was narrower than a broad docs description. |

The connector did not expose a subscription/billing-introspection endpoint in endpoint discovery. Complete account confirmation therefore requires a names-only dashboard/support check plus bounded capability probes using the actual configured deployment profile. A question about the exact Options Standard label/account match is pending; no secret is requested.

## Public documentation versus Options Standard

The current [options plan page](https://massive.com/pricing?product=options) lists Basic, Starter, Developer and Advanced for individuals, rather than Standard. Do not map the reported Standard name to one of them by price or guess. It may be a different/legacy account product; its effective rights remain an account question.

The [option chain documentation](https://massive.com/docs/rest/options/snapshots/option-chain-snapshot) makes quote/trade fields conditional on plan access and caps a page at 250. [Massive's entitlement troubleshooting](https://massive.com/knowledge-base/article/how-quickly-can-i-access-massives-market-date) distinguishes per-product subscription, exchange agreements and streaming address. A stock subscription must not be treated as options, indices or futures access.

The [options FAQ](https://massive.com/knowledge-base/categories/options) explains that current daily OI is not historical OI; build comparisons from saved dated observations. Plan-dependent missing fields, adjusted contract series and distinct option sessions require explicit treatment. No account-wide real-time promise follows from a sampled snapshot.

[Index snapshots](https://massive.com/docs/rest/indices/snapshots/indices-snapshot) identify I:-prefixed symbols and per-row timeframe/error fields. [Futures reference](https://massive.com/docs/rest/futures/contracts) and [futures overview](https://massive.com/docs/rest/futures/overview) distinguish dated contracts, reference data, market data and exchange sessions. REST futures event times are UTC with endpoint-specific nanosecond fields; displayed exchange hours are a separate concern.

## Required verification before release

- Confirm exact purchased plan names, professional/nonprofessional classification where applicable, signed product/exchange agreements and which account TradeHub uses, without exposing keys or changing subscriptions.
- From the intended server configuration, verify separately: stock quotes/trades/bars; option reference, chains, quote/trade history and each required field; index data; futures reference versus actual market data. Keep EMPTY, HTTP 400, rate limits, transport errors and explicit entitlement denial distinct.
- During each product's open session, verify observation times advance across two requests, measure provider/ingestion age and declared delay, and test reconnect/gap recovery only if streaming is later approved.
- Save metadata-only evidence with deployment profile, endpoint family, time window, observation time, supported fields, limits and result classification. No API keys, signed URLs, raw account identifiers or licensed raw samples in public documentation.
