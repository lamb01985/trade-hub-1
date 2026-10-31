# Broker fill adapters

## Overview

Scaffolds for broker-specific parsing into the normalized fills consumed by the separate `src/lib/tradeAggregator.js` engine. Both source files were read in full.

## Interface

- [schwab.js](./schwab.js): `normalizeSchwabTransaction`, `normalizeSchwabOrder`, `normalizeSchwabBatch`.
- [thinkOrSwim.js](./thinkOrSwim.js): `parseThinkOrSwimCSV`, `parseSchwabOrders`.
- Intended fill record: `{ id, timestamp, symbol, side, qty, price }`. `timestamp` is ISO 8601; `side` is `buy` or `sell`; quantity and price are positive numbers.

## Invariants

- Every exported adapter currently throws an explicit pending-mapping or not-implemented error. No source payload is normalized yet.
- Intended adapters parse only; accounting, position flips, average entry and P&L belong in the aggregation engine.
- Intended timestamps must sort chronologically as strings, using a consistent offset or UTC. Instruments and option legs must retain distinct symbols; quantity is positive and direction comes from side.
- Schwab symbol conventions described in comments are future mapping requirements, not implemented transformations.

## Side Effects

- Calls throw synchronously. These scaffolds perform no network request, storage write or trade execution.

## Verification

From the repository root, run `npm test` (`vitest run`). The existing `src/lib/tradeAggregator.test.js` and `tradeSyncCore.test.js` cover adjacent engine boundaries; their presence does not establish completed adapter mapping. No tests were run for this documentation-only change.
