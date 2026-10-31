# EdgeIQ premium UI — development review

2026-10-31 · branch `feature/edgeiq-premium-workspace`. No merge, push, purchase,
credential rotation, production configuration change or deployment.

## What changed

- A charcoal/graphite visual system replaces the original midnight-navy terminal
  treatment. Shared `theme.js` tokens cover color, typography, radii and spacing;
  canvas charts use concrete values and CSS uses the same published variables.
  System sans-serif typography requires no font download; numerical data retains
  tabular/monospaced type where useful. The favicon and browser theme match.
- A collapsible desktop sidebar and accessible mobile drawer replace three rows
  of global navigation. Primary entries: Overview, Events, Opportunities, Company
  Intelligence, Trading Desk, Portfolio, Journal & Strategies. Grouped secondary
  tools preserve all 22 original Plan/Trade/Review destinations and their state
  setters, options/prep/chart/calculator/journal handoffs and storage keys.
- Personalized Overview is the normal landing page. Explicit intelligence deep
  links remain supported. It adapts its focus to premarket, regular hours,
  after-hours or market closure, using the existing ET session helper.
- Overview combines market pulse, chart/watchlist, opportunity categories,
  event/source status, read-only Schwab summary, briefing readiness, alerts and
  thesis monitoring. It reuses existing observations; no new Massive polling loop
  was introduced. No absent quote, portfolio mark, opportunity rank or AI briefing
  is fabricated. Future VIX/futures access remains unverified; rule-based expiry
  dates are clearly projected.
- The top bar includes active workspace, validated ticker input, keyboard search
  shortcut, actual session, connection status and the existing sign-out flow.
  Source freshness is independent of connection status. Full source/overnight,
  preview and event disclosures are retained in a compact native details panel;
  lock/PDT restrictions and notable events remain visible outside it.
- Company Intelligence presents authenticated, contract-validated annual reports
  when available, source/period/formula evidence, separate assessments and a basic
  2–5 ticker comparison. It clears old results on edits and ignores late responses.
  Current local review shows explicit unavailable states. This is not completion
  or activation of the broader fundamentals milestone.
- If the market gateway fails, independently authenticated Thesis discovery can
  open a research-only shell without mounting Legacy data consumers. Both UI and
  server preserve market-only protected-preview restrictions. Normal Legacy mode
  retains its state/effects across workspace changes; budget/performance ownership
  consolidation is a documented Alpha follow-up.
- Portfolio consumes the existing Schwab hook, submits no orders and distinguishes
  broker records from the local journal. Missing broker source timestamps and
  account errors are explicit. Allocation uses only positive reported position
  values; cash and shorts are excluded from that specific distribution.
- Events defaults to the combined chronological list, with Earnings, Economic and
  Options Expiry filters in that order. Week/month views remain available. Sector
  Rotation is reachable under Market Intelligence. Legacy schedule estimates and
  unverified expiry/release times are disclosed rather than presented as verified.
- Shared cards, buttons/forms and legacy compatibility styles use the updated
  hierarchy. Trade/glossary dialogs gain focus containment, Escape close and focus
  return. Missing chart data no longer displays a false zero-volume, setup score
  or ranging-market verdict; the chart has a bounded workspace height and honest
  unavailable overlay. Global quick log remains available as a restrained button.

## Preservation and review

Before edits, all seven unfinished source/documentation files were copied into
an owner-private `TradeHub-preservation/pre-premium-ui-*` backup with checksums.
The new branch was created from the existing development branch. The original
Thesis planning modifications and unfinished Python files remain separate;
no saved user data was deleted or imported into the preview.

An independent EGM design review required mobile focus containment/inert
background and strict market-preview admission. The implementation includes
those protections. Final independent source review found one Major dependency
between market discovery and research admission; the research-only fallback and
server preview denial resolved it. The final recheck found no remaining
confirmed Major/Blocker in the UI scope. This is not hosted-security certification.

## Validation

- Complete frontend suite: **254 passed / 37 files**, including existing security,
  operator/provider/notification/preview regressions and new navigation,
  ticker-identity, report-race, comparison-input, independent-admission and
  accessibility coverage. A build/browser/full-suite concurrent run exceeded one
  options test's five-second timeout; the final complete suite was rerun with two
  workers after the other CPU-heavy checks finished.
- Complete Python suite: **437 passed, none skipped**, including isolated local
  PostgreSQL. Focused financial/API/security/provider tests: **85 passed**. One
  existing Starlette/httpx deprecation warning; no dependencies changed.
- Production build passed. Existing large-chunk and Vite configuration warnings
  remain; tests do not establish production function packaging or entitlements.
- Chrome checks passed for the three requested workspaces, 1512×1100 desktop and
  390×844 mobile. No JavaScript errors or horizontal page overflow; mobile drawer
  naming/inert/Escape/focus, trade-dialog Escape and Events filters were checked.
  Browser requests outside localhost were blocked, and none were attempted.
- Review screenshots are real disconnected/local-service UI captures, not
  simulated market data. Six images are saved outside the source tree at
  `Desktop/EdgeIQ-review/2026-10-31/{overview,trading,company}-{desktop,mobile}.png`.

## Local review and next work

Run `npm run preview:local`, then open `http://127.0.0.1:4180`. This creates only a
local operator review session. Live Massive, broker and Claude billing remain
disabled. The existing public Nasdaq earnings proxy is available but its network
or coverage failures remain visible. Stop with Ctrl-C.

See [Alpha integration/readiness audit](./EDGEIQ-ALPHA-1-READINESS.md) for the
integration matrix, confirmed defects, actual entitlement-verification blockers,
prioritized acceptance criteria and secure deployment dependencies. Ranked
opportunities, live cited briefing, verified macro ingestion and automated thesis
change monitoring require subsequent reviewed increments; UI layout is not their
activation.

## Local review commits

- `d4659d7`: preserve the authenticated Thesis gateway/contract, regression fixtures
  and explicit protected-preview denial. Feature flags remain disabled by default.
- `91bb193`: premium shell, Personalized Overview, Company/Portfolio/Opportunities
  presentation, event reorganization, chart empty-state integrity and UI tests.

These commits are local only. The original unfinished Thesis planning note is
intentionally not staged into this redesign; the private backup and working-tree
copy remain available. The Python repository was tested but not modified by this
UI/audit increment.
