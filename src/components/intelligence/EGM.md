# Market Intelligence views

## Overview

Protected React views render a validated, saved intelligence report. Market Map, options positioning, analyst research and training share report provenance; the supplied UI describes historical Friday-close evidence rather than a live execution feed.

## Interface

- `MarketIntelligence({ initialView = 'map' })` loads `/api/intelligence/latest`, validates it with `parseReport`, selects views from `INTELLIGENCE_VIEWS`, and renders login/loading/error/report states. Named `OptionsView({ report })` and `PlaybookView({ report, kind })` adapt report views.
- `OptionsIntelligence({ report })` selects a symbol and an observed expiration from `report.options_workspace.symbols`. Internal chart, activity, pricing and gamma panels render strike OI, comparable changes, baseline-qualified activity, historical quote quality and explicit inventory-sign scenarios.
- `OperatorAccess({ onAuthenticated })` submits operator login independently of broker authentication. `AnalystBrief({ report })` presents conditional scenarios, blocked readiness and a research reflection form; `DeskDetail({ desk })` expands quant, flow and validation evidence.
- `ResearchLedger()` reads hypotheses and appends dated manual outcomes. `TrainingMode({ report })` saves evidence-based lesson reflections. Shared primitives come from [ui.jsx](../ui.jsx); report and persistence helpers live under `src/lib`.

## Invariants

- Reports must pass `parseReport` before rendering. Unauthorized report loads remove the report and show operator access; a failed refresh may retain a previously loaded report with an error.
- Source timestamps, historical status and unavailable observations remain visible. Missing strike sides are not zero. OI change mode requires `COMPARABLE_PRIOR_OBSERVATION`.
- Expiration groups belong to the report session; 0DTE does not mean today. No additional chain request runs when selecting an expiration. Missing symbol/expiration coverage is not filled from another source.
- OI colors do not establish direction; gamma inventory signs are assumptions. Trade/quote aggressor samples are bounded and do not identify institutions or dealer ownership.
- Hypotheses, manual/unverified outcomes and learning reflections remain separate from actual trades and broker P&L. Analyst readiness remains blocked by missing current evidence; manual risk review does not clear freshness requirements.

## Side Effects

- GET latest report; POST operator login/logout. Successful session changes dispatch `tradehub-operator-session`; logout dispatches `tradehub-operator-logout` and clears report state.
- View selection replaces the URL `intelligence` query parameter without navigating. Research navigation dispatches `tradehub-open-research`.
- Research and training helpers persist to origin-local browser storage. ResearchLedger listens for `tradehub-research-update` and `storage`, removing listeners on unmount. Login keeps the submitted password only in component state and clears it after receiving a response.

## Verification

From the repository root, run `npm test` and `npm run build`. For browser review, check protected login, invalid/unavailable reports, symbol/expiration changes, missing OI sides, historical labels and separate research persistence. No live service validation was performed for this documentation.

## Inspection Scope

All seven JSX files were sampled up to 300 lines each within the 50 KB directory budget. Stylesheets were inventoried; visual rendering and server authorization implementation were not audited here.
