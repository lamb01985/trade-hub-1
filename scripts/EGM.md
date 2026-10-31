# Offline intelligence adapters and local review tools

## Overview

This directory bridges archived results from the sibling `trade-decision-engine` Python application into TradeHub's historical review interface. It also contains the loopback API harness and browser verification programs. It is not a production market-data ingestion service.

## Interface

- `analyst_briefs.py`: `build_briefs(report)` and `scenario(...)` create deterministic narrative evidence and conditional research hypotheses from supplied results.
- `analyst_desk.py`: `build_desk(...)`, `quant_context(...)`, and `historical_pnl(...)` produce educational interpretations and bounded frozen-Greek pricing estimates.
- `options_workspace.py`: `build_workspace(report, archive)`, `build_expiration(...)`, `expiry_groups(...)`, and `compatible_prior(...)` reconstruct per-expiration views using the sibling engine's `positioning`, `gamma_scenarios`, and `options_report` functions.
- `prepare-local-sample.py`: CLI `--source`; `sanitize(raw)` allowlists report fields. Defaults to the sibling engine's October 26, 2026 report and SQLite archive, builds narratives and an options workspace, and writes the private local sample.
- `create-contracts.py`: regenerates the Python-report and browser-transport schema files. It does not generate all five schemas.
- `local-preview.mjs`: `npm run preview:local` starts the Vite middleware harness on `127.0.0.1:4180`.
- `verify-preview.mjs`, `verify-legacy-preview.mjs`, and `verify-options-preview.mjs`: browser assertions against the running preview. `audit-local-regressions.mjs` performs browser inspection.
- Schema boundary: [contracts](../contracts/EGM.md). API boundary: [serverless handlers](../api/EGM.md).

## Invariants

- Fixture preparation accepts the explicit October 26 report and reads the archive with SQLite `mode=ro`. Missing compatible source evidence must remain unavailable.
- Expiration-specific OI comes from matching archived contracts, never an inferred split of aggregate strike totals. Archive checks include report session, observation cutoff, identity/count, OI totals, and future-quote rejection.
- Prior OI comparisons require compatible dated observations. Gamma signs remain inventory assumptions; deterministic narratives and Greek estimates are not validated trading signals.
- The Python options adapter imports the sibling engine by relative filesystem layout and uses its existing interpreter when invoked by preparation. This is a cross-repository runtime dependency, not a self-contained npm workflow.
- Local preview establishes an ephemeral review session, clears selected inherited provider credentials in its own process, disables AI billing and live/broker routes, and enables the public Nasdaq earnings handler. It never represents live-service production parity.
- Preserve private-report provenance and missing-data states. Historical evidence must not become actual journal trades.

## Side Effects

- Preparation reads external local JSON/SQLite and launches the sibling Python interpreter; writes owner-readable JSON under ignored `private-reports/`. Contract generation overwrites two schema files if explicitly executed.
- The preview changes only its child-process environment, listens on loopback, creates cookies, reads the private sample, and can request public Nasdaq earnings.
- Browser programs launch installed macOS Google Chrome with isolated contexts; some write screenshots under ignored `.local/`. These tools are platform-specific and require an already-running preview.

## Verification

- Existing targets: `npm test`; `python3 -m unittest discover -s scripts -p 'test_*.py'`. Options adapter tests require the sibling engine import/dependency environment; the README specifies that engine's existing Python interpreter.
- Browser checks: `node scripts/verify-preview.mjs`, `node scripts/verify-legacy-preview.mjs`, and `node scripts/verify-options-preview.mjs`, with the preview already running.
- This bootstrap performed static documentation verification only. It did not run fixture/schema generation, start the preview, or change process configuration.
- Scout sampling was capped at 50 KB and 300 lines per file; targeted follow-up inspected adapter boundaries. This is architectural documentation, not an exhaustive audit of every helper branch.
