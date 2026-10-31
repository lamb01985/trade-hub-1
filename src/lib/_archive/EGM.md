# Archived rule-based bot

## Overview

Historical paper-trading engine in [bot.legacy.js](./bot.legacy.js), separate from the current parent-level `bot.js`. The first 300 implementation lines and exported declarations were inspected; later persistence bodies were outside the scan.

## Interface

`LEVEL_TYPES`, `TRIGGER_TYPES`, `ACTION_TYPES`, `createInitialState`, `createRule`, `validateRule`, `shouldTrigger`, `markPosition`, `checkExit`, `closePosition`, `processTick`, `manualClose`, `dismissAlert`, `sessionStats`, `saveState`, `loadState`, and `resetSession`.

`processTick(state, ticker, currentPrice, levels)` returns `{ state, events }`; `validateRule(rule)` returns an array of errors. `createRule(partial)` creates a rule with defaults and an identifier.

## Invariants

- Validation requires a known level, trigger and action, positive quantity, and positive target/stop distances. `processTick` does not invoke validation; callers must establish rule validity.
- Cross detection requires both previous and current prices. Disabled engines still update their last-price record.
- Tick processing checks exits before firing eligible rules and enforces per-rule cooldowns. Paper share positions use long/short price-difference accounting; option actions create `alert_only` records.
- Log history is capped at 500 entries. Returned state and events are for callers to render or notify; this engine does not execute broker orders.

## Side Effects

- The inspected engine reads time and randomness to generate IDs and timestamps. It returns updated state and event objects.
- Persistence exports exist and the source declares storage key `tradeHub.bot.state.v1`; their later implementation bodies were not inspected, so compatibility with current bot persistence is not guaranteed.

## Verification

From the repository root, run `npm test` (`vitest run`). No dedicated archive test was established during the bounded scout, and tests were not run for this documentation-only change.
