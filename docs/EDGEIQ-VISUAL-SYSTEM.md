# EdgeIQ visual system

EdgeIQ is a temporary public identity. Tagline: **Find your edge.** Browser title:
**EdgeIQ | Investment Intelligence**. Repository names, API paths, environment
variables, deployment identities and persisted browser keys remain unchanged.

## Implementation

`src/lib/theme.js` owns the approved background, surface, accent, primary text
and secondary text colors. It also defines readable financial signal colors,
categorical chart colors, tinted status surfaces and a dark broker button fill.
`installTheme()` publishes the same values as CSS custom properties. Charts use
the concrete JavaScript values because the canvas library does not resolve CSS
variables. Existing exported color constants remain compatible aliases.

`src/lib/brand.js` owns the public product vocabulary: Thesis, Radar, Compare,
Valuation Lab and Trading Desk. `Brand` and `FinancialStatus` are reusable React
components; financial statuses always include words as well as color. A neutral
or missing rating is labeled insufficient data, never implicitly positive.

The existing header, navigation, operator access, trading tools, cards, chart,
intelligence CSS, browser metadata and SVG favicon use the new identity/palette.
The existing Trade tab is labeled Trading Desk without changing its internal ID.
The new financial research, comparison and valuation screens must consume these
tokens as their implementation continues; this branding change does not claim
those planned features are complete or activate their services.

## Review and verification

Preservation and security reconciliation passed before this change. This work
is on `feature/edgeiq-company-intelligence` in the original TradeHub repository.
Existing uncommitted Thesis gateway and contract work remains separate.

An independent EGM source review identified chart canvas/axis contrast, filled
accent control contrast and inactive navigation contrast. All were corrected;
the reviewer rechecked and found no remaining confirmed Major findings in that
narrow scope. Additional inspection corrected filled status buttons and kept
email formatting outside the application theme migration.

- Full frontend suite: 242 tests passed across 35 files, including security,
  authenticated operator behavior, gateway regressions and new contrast tests.
- Production build passed; the existing large-chunk warning remains.
- Headless Chrome smoke check: correct title and midnight navy background,
  visible EdgeIQ/tagline and Trading Desk; no JavaScript errors. Desktop
  1440×1000 and mobile 390×844 inspected; mobile document width equals viewport.
  External browser requests were blocked during this local check.
- Palette text/status pairs meet WCAG AA 4.5:1 on both primary surfaces. This
  is a scoped contrast check, not certification of every legacy component.

No production configuration, credential, dependency or deployment changes.
Local review server and temporary test database/budget containers were stopped.
To inspect the disabled-live-services local review again: `npm run preview:local`
and open `http://127.0.0.1:4180`.

## Follow-up

Complete the independently reviewed Company Intelligence slice, keep unknown
financial inputs explicit, and apply these components to its comparison UI.
Live Massive verification still requires the approved shared request-budget
configuration and entitlement evidence. A local branding preview is not proof
that live financial data is activated or that a production release is approved.
