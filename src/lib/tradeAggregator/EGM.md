# Broker adapter grouping

## Overview

Directory grouping for broker-specific fill parsing. The aggregation engine is the separate `src/lib/tradeAggregator.js` file; this directory is not a module entry point.

## Interface

- [Adapters](./adapters/EGM.md): `normalizeSchwabTransaction`, `normalizeSchwabOrder`, `normalizeSchwabBatch`, `parseThinkOrSwimCSV`, and `parseSchwabOrders`.

## Invariants

- No direct executable source or barrel export exists here.
- All child adapter entry points currently throw; the intended normalized fill contract is not an implemented import feature.

## Side Effects

- This directory itself has none. Child calls currently throw synchronous errors.

## Verification

From the repository root, run `npm test` (`vitest run`). Review the child contract before connecting a broker importer. This documentation pass did not execute tests.
