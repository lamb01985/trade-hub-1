# Trade Hub

Personal options trading platform for QQQ/TQQQ 0DTE intraday trading.

Built with React + Vite. Live market data from [Massive.com](https://massive.com) (formerly Polygon.io).

## Features

- **Levels Intelligence**: Real-time price ladder with VWAP, floor pivots, Fibonacci, prev day H/L/C, weekly levels, opening range, supply/demand zones, and confluence detection
- **Live Data**: WebSocket streaming for sub-second price updates, REST fallback for resilience
- **IV Analyzer**: Black-Scholes pricing engine with live options chain from Massive API
- **ORB Calculator**: Opening range breakout levels, entry/stop/target, live price ladder
- **R:R Calculator**: Options-first P&L math (entry/stop/target = contract premium, not underlying)
- **Checklist**: 12-rule pre-trade discipline gate
- **Journal**: Trade logging with P&L math, outcome tracking
- **Stats**: Win rate, expectancy, equity curve
- **Command**: Session clock, daily loss limit, risk controls

## Setup

1. Clone this repo
2. `npm install`
3. `npm run dev`
4. Configure the server-side operator ID/password hash and `TRADEHUB_APP_ORIGIN=http://127.0.0.1:5173` in ignored `.env.local`; configure legacy `POLYGON_API_KEY` there if needed. Never use a `VITE_` variable for a secret.
5. Open http://127.0.0.1:5173 and enter the private operator password in the sign-in form. Vite serves the local API handlers and uses loopback-only development sessions; it does not create a password.

## Deployment

Connected to Vercel. Pushes to `main` auto-deploy.

## Data Source

Massive API (massive.com) — Options Advanced plan required for live options chain data.
WebSocket endpoint: `wss://socket.polygon.io/stocks`

## Notes

- All times displayed in Central Time (CT)
- Entry/stop/target = option contract premium, not underlying price
- Minimum 2:1 R:R on contract premium enforced in Calculator
- Daily loss limit locks the platform when hit

## Local Market Intelligence review

This feature lives in this TradeHub 1 React app, under Plan > Market Intelligence.
The four views are Market Map, Options Positioning, Intraday Playbook and Swing
Playbook. Existing Plan, Trade and Review tools remain in place.

Start the local review server:

```bash
cd /Users/sarahlambertson/Desktop/trade-hub-1
npm run preview:local
```

Open **http://127.0.0.1:4180/?intelligence=map** on this Mac. The loopback-only
preview establishes an ephemeral local review session automatically. No AWS,
broker connection, Claude key or new market-data request is needed. Provider
feeds, AI billing and broker handlers are disabled in this preview. Other
workspace tools remain navigable, with unavailable live data clearly separate
from the intelligence snapshot. Stop the server with Control-C.

The ignored fixture `private-reports/october-26.json` contains allowlisted
analytics from the actual Massive-generated October 26 Phase 2 report. It is a
Friday October 23 close snapshot, including options observations through about
16:15 ET, not Monday live data. Source timestamps, stale quotes, first-snapshot
OI, insufficient unusual-volume baselines and incomplete flow pagination remain
visible. Intraday and swing scenarios are unvalidated research hypotheses.

To regenerate this local fixture from the existing Python report without any
provider request:

```bash
python3 scripts/prepare-local-sample.py
```

The preparation script removes raw trades, raw quotes and duplicated contract
snapshots, includes only derived analytics and source metadata, and rejects
credential/broker markers. Friday completed-session high/low is read from the
existing local source archive. The legacy `previous_day` field is labeled as the
prior-to-source bar, Thursday in this fixture. No calculations were ported from
Python into JavaScript.

Versioned JSON contracts live in `contracts/`; the adapter and validation are in
`src/lib/reportContract.js`. There are no fixture imports in the browser build.
The fixture and review screenshots are ignored by Git and Vercel; direct Vite
file access to the fixture is denied. The development preview reads it through a
local-session-protected endpoint. Do not publish this fixture or deploy the
branch until access controls, provider entitlements and data rights are reviewed.

Checks:

```bash
npm test
npm run build
node scripts/verify-preview.mjs
```

The browser verification uses installed Google Chrome, isolated browser storage,
and the running localhost server. It checks all four views, actual snapshot
values, desktop/mobile containment, existing Plan/Trade/Review navigation,
anonymous API denial and denial of direct fixture downloads. Screenshots are
written only to ignored `.local/`.

If Codex cannot bind the localhost port, allow its local-server escalation. In a
normal Terminal, run the same preview command. If port 4180 is already occupied
by this preview, use the existing URL or stop that process before restarting.
No deployment command is part of this workflow.

The legacy Massive WebSocket key-return path now requires operator authentication and rate limits.
This local preview blocks it entirely. A future production solution should use
server-side polling or a controlled streaming relay before claiming all provider
credentials remain server-side. Secure report delivery and production rollout
remain pending review.

## Analyst Intelligence layer

Open **http://127.0.0.1:4180/?intelligence=analyst** to review the local Analyst
Brief. QQQ, SPY and every equity in the fixture have an interpretation. Missing
options coverage is explicit. This adds a view within Plan and a separate
Research outcomes tab within Review; the actual Journal remains unchanged.

`prepare-local-sample.py` calls `scripts/analyst_briefs.py` to interpret the
existing Phase 2 results. It does not call Claude, fetch data, recompute
indicators or reimplement the options engine. The versioned output contract is
`contracts/analyst-brief-v1.schema.json`, validated by the existing adapter.
Six narrative evidence sections plus competing scenarios cover the seven analyst
requirements. Numeric case boundaries come from archived completed-session
high/low; optional reference targets are selected from supplied structural levels.
These new conditional cases are explicitly separate from Phase 2 engine signals.

Observation confidence describes historical evidence coverage, not a forecast
probability. No institutional identity, directional put/call OI sentiment,
opening/closing intent or verified dealer gamma sign is claimed. Limited
baselines and sampled single-contract flow cannot support whole-market claims.
The historical fixture cannot pass current-session Trade Readiness, even when
manual risk review is checked. No signal is labeled historically validated.

Saving a hypothesis freezes its scenario, source report, version, evidence and
readiness snapshot. `th-analyst-research-v1` stores this browser's hypotheses and
append-only manual outcome observations separately from `th-trades` and broker
sessions. Outcomes require a dated post-session-open observation and an evidence
note, reject future dates, and remain MANUAL_UNVERIFIED / NOT_VALIDATED. They are
not actual trades, do not affect P&L and do not establish backtest performance.
There is no cross-device sync; clearing site storage removes the local history.
Storage failures are surfaced, and unreadable existing history is retained.

Future validation should join frozen hypotheses to later timestamped bars under
a versioned evaluation policy, retain ambiguous trigger/stop/target ordering,
include non-triggered hypotheses, separate development from held-out periods and
report sample sizes and uncertainty. It must not infer fills or transfer outcomes
into the actual journal. That automated validation is not implemented here.

Additional checks:

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
npm test
node scripts/verify-preview.mjs
```

## Local regression audit against production

Audited against production commit `71d93620fa5ae481b381349e23d6cc5e0f144d4d`.
The public production page still references `index-CbzRp9Bz.js`. Before these
regression fixes, Levels, Calendar, their data hooks and the earnings proxy were
unchanged from that commit. The custom local preview router was the new source of
blanket 503 responses for legacy API routes.

Use `npm run preview:local` and **http://127.0.0.1:4180/?intelligence=map**.
Plain `npm run dev` runs Vite only: it does not emulate Vercel serverless
functions and has no configured API proxy. No automatic proxy to production was
added, and no Vercel environment files were downloaded.

The local review now runs the existing public Nasdaq earnings proxy, with an
8-second upstream timeout and a 12-second client timeout. It requires no secret.
The Mac's public-feed check returned HTTP 200 with 74 raw provider rows for
October 26; the frontend applies its existing major-company/market-cap filter.
Nasdaq may still reject or time out on individual requests. Loading, complete
empty coverage, failed coverage and partial coverage are now distinct. Status is
visible across Calendar tabs rather than only under Events. Scheduled/calendar
items remain generated from the existing local calendar definitions; they are
not a substitute for verifying official release schedules.

Live Massive, sector rotation, broker access and billable AI remain disabled in
this credential-free review. A global local-service notice explains that limit.
Levels shows a readable unavailable state and keeps manual reference entry. Its
existing populated-data calculations still run when real hook data is supplied.
Historical fallback bars receive an explicit warning. No Friday fixture is
silently injected into charts, scanners, levels or earnings. Broker handlers,
chart implementation, scanner components, journal implementation and browser
storage key names are unchanged by this audit.

Vercel and localhost have separate browser-local storage and cookies. This
checkout has no local `.env` files or configured provider/broker credential
variables. That accounts for absent local journal/cache/session data and prevents
credential-backed parity testing. Existing production storage was neither read
nor migrated. The shared Massive client stops retrying only responses explicitly
marked as intentionally disabled by the local server; real upstream retry and
entitlement behavior remains unchanged.

Regression checks include synthetic provider input for populated Levels,
manual level entry without a feed, earnings success/failure/partial/empty
coverage, malformed SPA fallback responses, method/date validation and timeouts.
Runtime preview data is not mocked. Browser checks verify legacy navigation and
Market Intelligence, along with journal isolation and blocked key-return routes.

```bash
npm test
npm run build
node scripts/verify-legacy-preview.mjs
node scripts/verify-preview.mjs
```

New feature development is paused while reviewing these fixes. No deployment,
merge, production credential modification or brokerage action occurred.

## Options Intelligence workspace

Open **http://127.0.0.1:4180/?intelligence=options**. The existing Options
Positioning tab now presents an executive interpretation, prominent symbol and
expiration controls, a call/put strike visualization around the historical
underlying price, conditional research scenarios and progressively disclosed
pricing, activity and gamma evidence. Teach Me explanations define each metric.

Audit findings: the original Phase 2 `positioning.by_strike` aggregates across
expirations. Filtering that array cannot create a valid expiration-specific OI
chart. The matching local SQLite archive retains the source contracts for all
three saved expirations. `scripts/options_workspace.py` reads that archive in
read-only mode and calls the existing Python `positioning`, `options_report` and
`gamma_scenarios` functions. Expected moves, per-expiration mean IV, skew
observations and term structure are selected from the already computed Phase 2
volatility outputs. No analytics were ported into JavaScript. JavaScript only
selects, formats and scales bars for rendering.

The `options-workspace-v1` contract is validated alongside the existing report
contract. Archive reconstruction requires matching observation cutoff, report
session, contract identities/counts and original per-expiration OI totals. An
incomplete or mismatched archive produces an unavailable view, never a guessed
split of aggregate totals. Every observed strike in the selected expiration is
rendered, including explicit missing-side states and known zeros. The saved
request covered only the three nearest expirations and a bounded plus/minus 15%
strike window. This is not proof of full-chain coverage, current entitlements or
current pagination completeness. No new provider request is made by preparation.

0DTE is relative to the report's trading session, not the clock or the Friday
observation date. The saved dates are October 26, 27 and 28. Weekly/monthly
calendar groups remain disabled because matching expirations are absent. New
symbols without option source records show unavailable; another symbol is not
substituted. The reference underlying timestamp is separate from the quote
cutoff and the completed-close reference used by the existing gamma model.

Daily OI changes in this sample remain unavailable because the report declares a
first snapshot. The comparison path supports actual dated prior snapshots with
matching ticker, strike, type, expiration and contract metadata. Same-day
retrievals, missing contracts or mismatched multipliers do not produce inferred
changes. A comparison is labeled with its prior observation time; it is not
silently described as a consecutive daily update.

Unusual-volume rows and baseline coverage are scoped to the selected expiration.
The saved bounded trade/quote sample exists for one selected contract per
underlying in the nearest expiration. Later expirations show no sample rather
than inheriting those counts. Pagination limitations remain explicit.

Pricing displays the supplied ATM straddle estimate, selected-expiration mean IV,
observed ATM bid/ask widths and the existing historical liquidity gates. Nearby
25-delta call/put IV observations are not represented as a fitted matched-delta
skew metric. Per-expiration IV rank/percentile are unavailable without comparable
history; an overall-chain rank is not substituted. Gamma signs are hypothetical
inventory assumptions. None of this establishes an executable price, investor
identity, directional sentiment from OI, verified dealer inventory or a validated
signal.

Regenerate the local derived fixture using the existing engine environment:

```bash
python3 scripts/prepare-local-sample.py
npm test
/Users/sarahlambertson/Desktop/trade-decision-engine/.venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
npm run build
node scripts/verify-options-preview.mjs
```

The preparation script uses the sibling engine's existing Python environment to
run the expiration adapter. The generated files remain under ignored
`private-reports/`, outside the browser bundle and public deployment. Source
reports, source database, credentials and history are not modified. Browser checks
cover both symbols, all saved expirations, every supplied strike, missing-data
states, stale timestamps, absent changes/weekly/monthly groups and mobile width.

## Reviewed Unified ETF increment (not activated)

M2.0/M2.1 adds an explicit read-only Unified ETF context alongside Legacy mode. The new server-only configuration is `MARKET_DATA_SERVICE_URL`, `MARKET_DATA_SERVICE_TOKEN`, `MARKET_DATA_DEPLOYMENT_PROFILE`, `MARKET_DATA_UNIFIED_ENABLED`, `MASSIVE_ACCOUNT_BUDGET_SCOPE`, `MASSIVE_REQUESTS_PER_MINUTE` and `MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE`, plus protected Redis settings. Python owns `MASSIVE_API_KEY`; legacy TradeHub uses `POLYGON_API_KEY`. Never place tokens in VITE variables. No values were created or changed here.

The gateway requires a dedicated service token of at least 32 random bytes and exact audience; hosted service URLs must use HTTPS. Literal loopback HTTP is allowed only for explicitly local development. Start the configured engine with `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8765` in the sibling engine repository, and `npm run dev` here; use http://127.0.0.1:5173 after operator sign-in. Configuration/Redis policy and verified recency are activation prerequisites, not automatic defaults. An unconfigured setup returns typed unavailable JSON. Historical `preview:local` continues to disable live routes.

The actual deployment subscription and field entitlements govern access; the older plan-name note above is not verification of Options Standard or this deployment account. See [implementation evidence](docs/market-data/M2-0-M2-1-IMPLEMENTATION-REPORT.md) for tests, residual browser-key exposure and required activation/release steps.
