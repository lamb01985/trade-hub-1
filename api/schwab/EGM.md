# Schwab account and journal API

## Overview

Read-oriented broker resources plus a partially implemented journal sync orchestration route.

## Interface

- `[resource].js`: GET `/api/schwab/account`, `/quote?symbol=...`, `/chain?symbol=...`; account returns balances/positions and an option-order round-trip estimate; chain accepts type/expiry/strike/strikeCount.
- `orders.js`: GET `/api/schwab/orders` returns sanitized FILLED orders for the current UTC day, at most 250.
- `sync.js`: GET returns stored `{trades,meta}`; POST `{from,to}` validates tokens, normalizes incoming fills, applies `/src/lib/tradeSyncCore.js`, and persists results.
- [OAuth actions](./auth/EGM.md), [debug actions](./debug/EGM.md), and [shared services](../_lib/EGM.md).

## Invariants

- Broker reads use the signed Schwab cookie; sync also accepts configured cron bearer authentication. These routes do not reuse intelligence operator authentication or its origin guard.
- Static orders/sync files coexist with the dynamic resource dispatcher. Resource handlers reject non-GET methods and return no-store on successful reads.
- Account dayTrades counts matched filled option BUY/SELL legs by symbol within a UTC day; it is an estimate, not authoritative regulatory day-trade accounting. Order-fetch failure silently leaves the estimate at zero.
- Sync currently constructs `{_placeholder:true,accountHash,from,to}` rather than fetching transactions; its adapter-error branch persists failure metadata and returns 503 `adapter_not_configured`. It must not be documented as working fill ingestion.
- GET sync has no explicit private/no-store header. POST date fields and raw body have no explicit size or date validation in this handler. Sync persistence is not transactional.

## Side Effects

- Fetches account/quote/chain/order data and may refresh OAuth tokens. Sync reads/writes Redis journal records and failure metadata; this API does not place broker orders.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). This is the project test command, not evidence that every route or external integration has coverage. Documentation-only bootstrap did not invoke providers or send notifications.
