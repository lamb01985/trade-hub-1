# Archived bot hook

## Overview

Historical single-active-ticker rule adapter retained alongside the current multi-ticker coach. Its comments describe an earlier UI migration and are not proof of current application wiring.

## Interface

- [useBot.legacy.js](./useBot.legacy.js) exports `useBot({ activeTicker, livePrice, levelMap } = {})`, returning state, active-ticker prices/levels, bot enablement, rule CRUD, manual close, alert dismissal and session reset actions.
- It imports the archived engine from `src/lib/_archive/bot.legacy.js`; current consumers should consult [the active hooks contract](../EGM.md).

## Invariants

- Only matching rules for the active uppercase ticker receive ticks. Other rule tickers appear in `livePrices` with `last: null` and `active: false`.
- Rule additions and edits call `validateRule` before dispatch. Level-map labels map to engine vocabulary, including `Pivot` to `P`; invalid prices are skipped.
- Hydration occurs once, followed by persistence of changed engine state. This API differs from the active multi-ticker `useBot` and is not interchangeable.

## Side Effects

- Engine helpers load/save browser state. Rule and position actions mutate React reducer state.
- Tick events invoke sound wrappers and browser notifications. Audio exceptions before user interaction are swallowed.

## Verification

Run `npm test` and `npm run build` from the repository root. These commands do not establish that this archived module is imported by the current application.

## Inspection Scope

The complete 207-line module was inspected; the archived engine is documented separately by its owning subtree.
