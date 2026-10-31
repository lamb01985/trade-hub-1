# EdgeIQ premium workspaces

`WorkspaceShell` owns presentation-only sidebar/drawer/search interaction. It
receives navigation callbacks, ticker/session and separate connection/freshness
state; it does not acquire market data or authorize providers. Seven primary
entries are Overview, Events, Opportunities, Company Intelligence, Trading Desk,
Portfolio and Journal & Strategies. `navigation.js` also maps every original
Plan/Trade/Review destination to the original state setters. Do not delete saved
keys or replace handoffs when regrouping navigation.

`Overview` defaults the ordinary landing page and derives its session emphasis
from the existing ET session helper. It reuses existing hook/store observations;
there is no added Massive polling loop. Active ticker data requires matching
`dataTicker`. VIX/futures, rankings, current briefing and thesis monitoring remain
explicitly unavailable without their reviewed adapters. Never infer missing
price/volume/portfolio values as zero or fill a chart with fabricated bars.

`CompanyIntelligence` uses authenticated Thesis status/company routes and the
closed report validator. Changing inputs/date/view clears results and invalidates
pending generations. Comparisons request two to five distinct symbols sequentially;
period differences remain visible. Source URLs, assumptions, unknown valuation
and readiness are separate from quantitative quality. A research-only App path
admits an enabled Thesis service during market gateway failure without Legacy
hooks; the protected market preview rejects the route on the server.

`Portfolio` reads the existing Schwab hook only; it does not submit orders or
create another account polling loop. Broker timestamp absence and stale/error
responses remain explicit. Journal positions are separate from broker holdings.
`Opportunities` is an honest unavailable ranking interface, not an invented
recommendation engine. Reuse Python options/financial/technical functions later.

`ServiceStatus` retains complete source/overnight/local-preview/event disclosures
in a compact native details control. Freshness, lock/PDT restrictions and notable
events remain visible outside it. Mobile drawer uses modal naming, focus
containment, inert background, Escape close and focus restoration. `useModalFocus`
retrofits keyboard containment/return focus to legacy trade/glossary dialogs.

Theme values come from `lib/theme.js`, including concrete canvas colors and CSS
variables, sans-serif typography, tabular numeric fonts, radii and spacing.
Shared financial states always carry text, never color alone.

Run `npm test` and `npm run build`. Exercise real browser desktop/mobile navigation,
collapsed sidebar, dialogs, source disclosure, ticker changes and disconnected
states. Unit tests use synthetic fixtures only; runtime account rights, SEC
access, fresh quotes, broker/Claude and production deployment require separate
verification. The source-readiness audit lives in `docs/EDGEIQ-ALPHA-1-READINESS.md`.
