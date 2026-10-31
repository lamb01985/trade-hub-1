# EdgeIQ Alpha 1 — integration and release readiness

Audit date: 2026-10-31. Original repositories inspected: `Desktop/trade-hub-1`
(frontend development branch `feature/edgeiq-premium-workspace`) and
`Desktop/trade-decision-engine` (`feature/edgeiq-company-intelligence`). Existing
unfinished source was preserved; no protected-preview worktree was used as a
base. No purchase, production change, secret disclosure, merge or deployment.

## Decision

The premium UI is ready for development review. **A live-data Alpha release is
not yet ready.** UI tests prove presentation and security behavior with synthetic
fixtures/mocks; they do not establish live subscriptions or production safety.

Local configuration was inspected for names/presence only: the Python `.env`
contains a Massive key. The frontend has no local `.env` configuration; operator,
Schwab, Claude, SEC contact/enable flags, service URL/token/profile and shared
Massive budget configuration were absent in the inspected local environment.
**This does not imply that hosted variables are absent.** A read-only Vercel
metadata request returned HTTP 403; hosted configuration and deployment identity
could not be verified. No environment values or credentials are recorded here.

## Integration matrix

| Integration | Implemented and authenticated | Configuration/live verification | Tested / remaining work |
|---|---|---|---|
| Massive equities | [Node relay](../api/_lib/polygon.js), shared authenticated browser polling; [Python adapter](../../trade-decision-engine/app/market_data/massive.py), Unified QQQ/SPY/IWM snapshot/minute-bar envelopes | Python key present locally; Node expects `POLYGON_API_KEY`, Python `MASSIVE_API_KEY`. Deployment account, cadence and budgets unverified | Relay/allowlist/redaction/admission/identity regressions pass. Unified feed recency deliberately UNKNOWN; no live execution claim |
| Massive options | [Chain snapshots](../src/lib/massive.js), [contract normalization](../src/lib/optionSnapshot.js), existing Python options intelligence/quality/plans | User-reported Options Standard; historical connector access only, not proof for deployed key or all LEAPS expiries | Reuse these adapters. Unified options remains FEATURE_NOT_ENABLED; long-dated completeness, current spreads/Greeks/OI/volume/depth need verification |
| Schwab | [Server OAuth/token refresh](../api/_lib/schwab.js), operator-gated account/positions/quotes/chains/orders; new read-only Portfolio uses existing `useSchwab` | Local app/session configuration absent; hosted OAuth callback, scopes and Redis not verified | Auth regressions pass. Account responses lack a broker source timestamp; UI labels this and hides account values on fetch errors. Live OAuth/account refresh E2E pending |
| Claude | [Server Messages route](../api/ai/[action].js), operator/Origin checks, bounded prompts/output, 3 requests/minute and shared daily spend reservation | No local key/billing budget; hosted model/access unverified | Policy/security tests pass. Existing prep/coaching/narrative functions remain. Source-cited Overview briefing and verified Deep Research acquisition are not connected |
| SEC EDGAR / Thesis | [Node gateway](../api/_lib/thesisGateway.js) and [Python SEC source](../../trade-decision-engine/app/thesis/sec.py): fixed hosts, bearer/audience, operator auth, bounded requests/cache; annual deterministic financials | New service files remain unfinished in Python repository; SEC contact and source flags absent locally | Financial/API tests pass. Annual-only model; no live six-company validation, name search, quarterly/TTM, comprehensive industry benchmarks, forecasts, ROIC/CAGR suite or valuation layer yet |
| Earnings / macro / expirations | [Nasdaq proxy](../api/calendar-earnings.js); [legacy calendar](../src/lib/calendar.js); Events defaults to combined chronological list | No verified official macro ingestion. Earnings proxy can fail or serve cached responses; BMO/AMC are windows, not actual release timestamps | Partial/error/empty coverage regressions pass. Economic dates are estimated/manual and expiry dates projected, explicitly disclosed. Holiday/contract/calendar verification required |

## Actual Massive entitlements and shared budget

No new account-data requests were made outside the coordinator. There is no
configured local account scope/quota/reserve/shared Redis admission store, and
hosted metadata access is denied. **Current deployed-key entitlements cannot be
confirmed in this audit.** A connected plugin account must not be assumed to be
the account supplying the application key.

[Historical evidence, 2026-10-25](./market-data/INVENTORY-AND-ENTITLEMENTS.md)
records connector stock snapshots and sampled QQQ/SPY/IWM chain access, one
historical option-quote sample, VIX and NQ/ES snapshot entitlement denials, and
inconclusive empty contract/history queries. That evidence is dated, incomplete,
and not bound to today's deployment profile. Empty data is not entitlement denial.

Massive's current documentation describes **four distinct Financials & Ratios
endpoints** under `/stocks/financials/v1/`: income-statements, balance-sheets,
cash-flow-statements and ratios. The legacy experimental financials endpoint is
deprecated. Options Standard is not evidence of financial-statement rights.
These facts describe product documentation, not this account's purchases.
Sources: [Financials fields and access](https://massive.com/knowledge-base/article/what-fields-can-i-expect-from-massives-financials-api),
[official migration announcement](https://www.massive.com/blog/announcing-polygon-io-financials-balance-sheets-cash-flow-income-statements-and-ratios).

The [reviewed admission policy](./market-data/M2-0-M2-1-IMPLEMENTATION-ADDENDUM.md)
is one Redis-time rolling 60-second parent bucket for every environment sharing
an account, total N, explicit legacy reserve R, four concurrent leases, charged
attempts including retries/pages, no refunds, and fail-closed store errors.
Default N is five when the provider limit is unverified; R must be explicitly
configured and smaller than N. No higher operational quota was established here.
Node and Python use the same Lua policy. Legacy enforcement requires
`MASSIVE_BUDGET_ENFORCED=true` or Unified mode; do not activate a shared-account
producer without confirming enforcement and common scope/store across all hosts.

Required secure configuration names: `MASSIVE_ACCOUNT_BUDGET_SCOPE`,
`MASSIVE_REQUESTS_PER_MINUTE`, `MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE`,
`MASSIVE_BUDGET_REDIS_REST_URL`, `MASSIVE_BUDGET_REDIS_REST_TOKEN`; the existing
KV/Upstash aliases are supported. Use server-only secret storage. Do not put keys
in VITE-prefixed variables, browser storage or frontend requests.

## Risks and broken/incomplete flows

1. **High, confirmed code-level exposure if full Python app is public:**
   [app/main.py](../../trade-decision-engine/app/main.py) legacy analysis and
   notification-settings/test routes have no route-level authentication. The
   middleware measures latency; it is not operator authorization. New Thesis and
   Unified routes are authenticated separately. Actual public reachability is
   unverified. Keep the service private/restricted; review ingress and authorize
   every exposed legacy route before a full-app release.
2. **High, confirmed financial calculation defect in legacy research:**
   [shortThesis.js](../src/lib/shortThesis.js) uses total investing cash flow as
   capital expenditures in `qFCF`. New Python Thesis correctly uses explicit
   capital purchases. Do not use legacy short-thesis FCF for Alpha rankings;
   migrate consumers to one audited calculation source with a regression fixture.
3. **High, confirmed incomplete freshness/admission:** Python
   [capabilities](../../trade-decision-engine/app/market_data/capabilities.py)
   always reports UNKNOWN feed recency; Unified options/intelligence is disabled.
   Normal legacy mode may operate without shared budget enforcement if flags are
   unset. Neither a connected transport nor a plan name proves actionable data.
4. **High, confirmed Company Intelligence scope gap:** ticker-only annual SEC
   analysis does not fulfill the complete prior fundamentals milestone. Name
   search, new Massive financials integration, same-period quarterly/TTM
   comparison, broader metrics/benchmarks, valuations and six real-company
   verification remain pending. UI comparison shows differing fiscal ends rather
   than silently treating them as normalized rankings.
5. **High, confirmed calendar quality gap:** hardcoded 2026 FOMC, old May/June
   one-offs and generated release estimates are not verified macro data. Rule
   based expirations need holiday/product checks. The legacy major-ticker/market-cap filter can omit smaller tracked companies from earnings. Displayed limitations are
   mitigation, not replacement of the missing ingestion.
6. **Medium, runtime verification pending:** Schwab source timestamps, expired
   session handling, hosted Redis availability, Vercel function timeouts/Lua/schema
   packaging, SEC access/contact policy and actual provider recency need E2E tests.
   Root `vercel.json` only declares SPA rewrites; protected-preview config has
   additional function packaging/timeouts and deliberately excludes Thesis and
   Schwab. Do not blindly reuse that market-only allowlist for full Alpha.
7. **Medium, security release dependency:** browser key delivery is retired at
   [ws-auth](../api/polygon/ws-auth.js), including authenticated callers. Existing
   deployed revisions and any historically exposed keys are unchanged. Credential
   revocation/rotation requires separate explicit approval; this branch alone does
   not invalidate old copies or prove deployed retirement.
8. **Medium, performance/design debt:** normal Legacy mode keeps its existing
   hooks alive across sidebar workspaces to preserve state/handoffs, so Company
   research can coexist with market subscriptions. The independent research-only
   fallback mounts no Legacy consumers. Centralize normalized market ownership
   before expanding always-on dashboard data. The large entry bundle remains a
   build warning; further lazy loading is appropriate after state-boundary tests.

## Avoid duplication

- React owns workspace interaction, saved journal/prep and presentation. Keep the
  existing technical trading engine, chart/level workflows and handoffs intact.
- Python owns deterministic financial normalization/scoring and existing technical
  analysis/options eligibility; expose contracts rather than rebuilding these
  calculations inside React or Claude.
- Node owns operator/session admission and provider/broker/AI relays. Reuse the
  existing options normalizer, Python shortlist/quality logic and shared budget.
- Keep broker positions separate from manually marked local journal records;
  account values, option premiums and underlying prices are different quantities.
- Claude interprets a validated evidence packet; it does not supply unverified
  metrics, recommendations, expiry liquidity, dates or missing forecast inputs.

## Prioritized Alpha 1 backlog

| Priority / increment | Acceptance criteria | Dependencies |
|---|---|---|
| P0 — protected ingress and configuration | Enumerate all exposed routes; anonymous and wrong-audience access denied; key-return route never returns keys; no browser/bundle secrets; correct Vercel/API packaging, source revision and rollback recorded | Names-only Vercel access; reviewed private Python ingress; explicit deployment approval later |
| P0 — account-bound entitlements and budgets | Confirm account identity/plan labels without values; all Node/Python producers use common scope/store and approved N/R; concurrent admission and outage tests pass. Probe actual deployment key for new financials, equities, chains, VIX/futures; classify allowed/denied/unknown per endpoint, field and dated symbol | Approved budget configuration and server credentials; correct dated front futures contract; no subscription purchase assumed |
| P1 — reliable Company Intelligence | AMD/NVDA/ORCL/CMG/DUOL/RBLX ticker/name search; source-dated statements; explicit capex, deterministic growth/margins/EPS/FCF/debt/ROIC where valid; industry applicability; no invented figures. Compare 2–5 with aligned periods or explicit unavailable. Valuation needs verified price/shares/debt/cash and assumptions | SEC contact/ingestion; verified Massive financials rights or reviewed SEC coverage; finish Python service files; shared contracts/regressions |
| P1 — trustworthy Personalized Overview | Verified SPY/QQQ/IWM observations with timestamps/session/delay; VIX/NQ/ES remain unavailable unless entitled. Current official events and broker retrieval/source dates, stale/account failure behavior; restart and after-hours E2E tests | Entitlement/recency evidence; official calendar ingestion; authenticated read-only Schwab; budgeted scheduler |
| P2 — research, LEAPS and tactical shorts | Cited Claude packet/output with dates, uncertainty and counterarguments. Deterministic separately reviewed opportunity ranks. LEAPS pagination/horizons >365 days, spread/OI/volume/Greeks/size criteria; shorts need catalysts, borrow/cost or option liquidity and verified technical invalidation | Fundamental/valuation coverage; adjust existing <=365-day options criteria through spec/review; history/depth/borrow data rights |
| P2 — monitored theses | Persist versioned thesis/evidence/invalidation, compare new filings/catalysts, dedupe alerts; no stale-data alert or automatic execution | Durable identity/storage, verified change feeds, notification authorization and delivery budgets |

Release gate: all tests/build plus protected deployed E2E must pass, configuration
and entitlement evidence must match the deployed revision, rollback must disable
new features without destroying journals, and the user must explicitly authorize
any deployment or credential action. No Alpha activation is performed here.

## Validation and UI scope

- Frontend: complete suite 255 passed / 37 files in the final validation; includes
  relay/operator/preview/security/gateway, contrast, Company race/identity, drawer
  navigation and all legacy destination mappings.
- Python: complete suite **437 passed**, none skipped, isolated PostgreSQL;
  focused financial/API/security/provider set **85 passed**. One existing
  Starlette/httpx deprecation warning; no dependency installation.
- Production build passed, with the existing >500 kB chunk warning.
- Headless Chrome: Overview, Trading Desk and Company Intelligence at desktop
  1512×1100 and mobile 390×844, no JavaScript errors, no page overflow, mobile
  drawer Escape/focus/inert checks and Events filter navigation passed. No
  external browser requests or fabricated market observations.
- Independent EGM review found and resolved missing independent research admission;
  final source review has no confirmed Major/Blocker in the UI scope. It is not
  a production security or live provider certification.

See [premium UI implementation](./EDGEIQ-PREMIUM-UI.md) for layout changes and
review screenshots. Existing unfinished Python work and original Thesis notes
remain preserved; no merge, push or deployment is implied by test success.
