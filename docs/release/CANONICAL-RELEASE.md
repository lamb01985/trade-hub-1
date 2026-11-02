# TradeHub canonical release candidate — November 1, 2026

## Canonical state

Repository: https://github.com/lamb01985/trade-hub-1.git. GitHub default and Vercel configured production branch: main. Remote main was 74fa8802c1272d21469416c2e5751bf3bc926ba6 at inspection.

The application actually serving https://trade-hub-1.vercel.app is Vercel deployment dpl_6QRHhw9REyUJGQwx9LdaXqo5R15N, source **88fb3671527dd4e8a4d82c56532ed1429bc435d4**, ref **fix/provider-key-containment**. This was verified from authenticated deployment metadata, not inferred from a local branch. Production was not changed.

Existing project: trade-hub-1, prj_QpHmjZ78bqsJNACjYh4HySRR4z4T, owner team_zzSNInMFnOACmXMzHOgRRKCY. Protection is all_except_custom_domains. No new project is authorized or needed.

Candidate: integration/tradehub-canonical-release in ~/Desktop/tradehub-canonical-release. Base 014c6a1 includes Monday fb51922 and remote main. Existing worktrees, owner credentials, servers, and branches are preserved.

## Inventory

“Tested” below distinguishes prior branch evidence from this candidate's current tests. Isolated work is not production delivery. No feature in this candidate has been production verified.

| Work | Implemented | Tested | Integrated here | Preview verified | Production verified |
|---|---|---|---|---|---|
| Monday Massive fb51922 | Yes | Prior provider/browser + current regressions | Canonical adapter and planning feed | Pending hosted auth | No |
| Level Map 014c6a1 | Yes | Current real bars/browser workflow | Plan Levels, Prep, Trade map, Review history | Pending hosted auth | No |
| Options V1 5417232 | Yes | Prior provider sample + current tests | Existing contract inspector + models | Pending hosted auth | No |
| Options V2 7e24595 | Yes | Prior Redis/synthetic evidence + current tests | Positioning, shortlist, scenarios; research admission preserved | Research acquisition blocked by missing budget | No |
| Company UI a75667f | Yes | Prior synthetic + current component tests | Existing Company route with shared presentation | Backend unavailable | No |
| Company M1/M2 5472903 | Backend implemented | Prior request/runtime evidence | Evaluated; incompatible backend layout not copied | No | No |
| Multi-company bd30632 | Backend implemented | Prior six-issuer reconciliation | Deferred: direct operating-company-v1 contract needs deliberate adapter | No | No |
| SEC provenance c0e92f2 | Audit implemented | Prior diagnostic tests | Evaluated; immutable capture and financial acceptance unresolved | No | No |
| Security 279aabc and Monday security | Yes | Prior audit + current auth/provider tests | Operator gate, server-only key, rate limits, budget guards; monorepo service remains deferred | Protection metadata verified; hosted login not yet verified | No |

## Integration choices

There is one application entry. Query flags no longer launch a competing diagnostic desk. The canonical black/neon-green TradeHub header and Plan → Trade → Review tools use the verified Massive planning adapter. Historical reports are accessible only as clearly labeled history. Opening a live map changes route, symbol and focus. Prep reads the same canonical context; it does not issue a second independent provider calculation.

Options Intelligence is embedded in Trade, reusing verified V1/V2 calculations and authenticated proxy. Manual research has bounded pages, body size, timeout, shared account admission and account cooldown. Plan-period bars deliberately cannot qualify as current-session technical confluence. Synthetic demonstrations remain explicit, user-selected and labeled. No demo is an automatic fallback. Stale quotes cannot qualify as executable research.

The Company presentation retains strict report validation. The annual v2 financial policy and its continuing-operations scope registry are copied with their validation tests; incompatible or mixed-scope data is rejected. The authenticated root gateway remains the existing legacy contract. The monorepo request service and newer operating-company backend are not silently wired into that gateway. No new SEC service is activated.

Focus, Wheel, Playbook, Calendar, Movers, Universe, Setups and legacy Calculator retain their navigation but display explicit unavailable messages pending canonical-feed validation. Their independent data consumers stay disabled. Journal, Stats, saved manual Prep and Alerts interface remain. This is a partial consolidation candidate, not acceptance of every original tool.

## Validation

353 regression tests / 53 files pass; production build passes. Build warns about the existing large main bundle.

Actual provider-backed browser acceptance: 2026-11-02T01:25:59Z (November 1 Central). Plan → Levels → QQQ Live Map → SPY/NVDA → reload/Back → Tomorrow’s Prep Load Market Data → Review history → live map passed. Options budget-unavailable and Company backend-unavailable states rendered correctly. No browser errors. No extra legacy, broker or AI polling. Separate local authentication cookie. Owner env file unchanged. Browser responses/requests checked for provider-secret leakage.

| Symbol | Source regular session | High | Low | Close |
|---|---|---:|---:|---:|
| QQQ | 2026-10-30 | 698.63 | 683.45 | 690.49 |
| SPY | 2026-10-30 | 761.46 | 750.36 | 755.72 |
| NVDA | 2026-10-30 | 209.06 | 200.9199 | 204.64 |
| AMD | 2026-10-30 | 520.3956 | 492.21 | 504.8 |

Completed minute arrays were compared to provider responses; dated historical VWAP/EMAs use those bars. Current Monday bar arrays were empty and indicators unavailable on Sunday. Simulated Monday premarket high changed on the one-minute context poll; provider error cleared the map. Simulations are not claims of observed Monday trading.

Local private evidence: .local/canonical-acceptance.json, screenshots, consolidation-tests.log, build.log. Licensed responses, credentials, private reports and local evidence are excluded from Git and deployment artifacts.

## Local startup

```sh
cd ~/Desktop/tradehub-canonical-release
npm ci
npm run release:local
```

Open http://127.0.0.1:4214/ . Launcher reads only existing approved market configuration from ../tradehub-monday-readiness/.env.local, never copies or logs the key, and creates only an ephemeral loopback read-only session. Override TRADEHUB_SERVER_ENV_DIR to an existing approved env directory if needed. No persistent password or credential is created. Local cookie is th_canonical_operator; active desk cookies and ports are unchanged. Broker, AI and notification API requests are blocked locally. Company status requires the local operator session and returns disabled. Full V2 flow/history proxy routes remain disabled in this limited launcher.

## Release gates and owner actions

**Do not promote this candidate to production.** A protected preview is for inspection, not permission to bypass application authentication.

1. Existing project has no TRADEHUB_OPERATOR_ID, TRADEHUB_OPERATOR_PASSWORD_HASH or TRADEHUB_APP_ORIGIN configuration. The candidate fails closed. Owner must approve/provision the existing application-auth configuration and its approved secure origin; this task does not create/change credentials.
2. Paginated options research has no approved shared Massive account scope/quota/reserved legacy quota or matching Redis admission policy. Owner must confirm account-wide budget participation and approve configuration; legacy samples do not prove full options trade/quote-history entitlement.
3. Company backend service URL/token/profile and SEC configuration are absent. Resolve backend/contract integration, immutable provenance acceptance and six-issuer financial browser acceptance before enabling that feature.
4. Complete hosted authenticated workflows and validate market open/premarket transition with real contemporaneous provider timestamps. Sunday historical acceptance does not verify Monday live entitlements/delay.
5. Restore and validate held original tools before calling consolidation complete.
6. After all gates pass, review the exact candidate diff and hosted results. Owner must explicitly approve production promotion; release owner then promotes the approved immutable deployment in the existing Vercel project, verifies the production alias/commit, and retains the prior deployment as rollback. No promotion has been authorized or performed.

## Final provider smoke and deployment packaging

At 2026-11-02T01:29:16Z, all ten normalized stock/ETF records matched an independent Massive snapshot response, including trade/quote identity and timestamps. Their source trades were Friday October 30 at approximately 23:58–00:00 UTC; these are stale/closed observations on Sunday, not live Sunday prices. Equity delay remains UNVERIFIED because snapshots do not establish the subscribed delay. AMD prior-session OHLCV matched the provider; Monday current bars remained empty. A bounded five-contract QQQ snapshot succeeded; quote timeframe REAL-TIME in the source does not make Friday quotes current on Sunday. VIX returned NOT_ENTITLED; ES/NQ remain CONTRACT_AND_ENTITLEMENT_UNVERIFIED. No entitlement upgrade or broader options history entitlement is inferred.

The first protected-preview attempt built successfully but Vercel rejected its output for exceeding the existing Hobby 12-function cap. No plan was changed. The candidate packaging now excludes inactive broker, AI, notification, calendar, and retired websocket functions rather than activating those services. Active authenticated desk, proxy, intelligence, market and thesis routes remain. package.json explicitly declares ESM so server modules preserve import.meta and their traced admission Lua resource.

Independent source review found no unsafe fallback, current-session relabeling, or budget bypass. Unavailable-tab, financial-policy and thesis-status-authentication findings were remediated and reviewed again. This does not certify Monday's live feed or unresolved financial acceptance.

## Protected preview result

Application commit **57863ff31f0bcaeb1c6e466ab6d12035219c20e3** is READY at:

https://trade-hub-1-27dofny6y-sarah-lambertsons-projects.vercel.app

Deployment dpl_FXsp68ojrSLtWiW8ZW66tXfFDkco belongs to the existing canonical project, targets preview (no production target or alias), and reports branch integration/tradehub-canonical-release and the exact commit above. Unauthenticated HEAD at 2026-11-02T01:32:32Z returned HTTP 302 to Vercel SSO, no-store, HSTS and X-Frame-Options DENY. This verifies perimeter protection, not application authentication. No bypass secret or new credential was created. Hosted sign-in, market routes and Company research acceptance remain BLOCKED by the configuration gates above; they are not marked preview-verified. Existing production alias still resolves to dpl_6QRHhw9REyUJGQwx9LdaXqo5R15N. No merge or production promotion occurred.

The code branch was pushed to the canonical GitHub remote. Later documentation-only commits do not change the immutable preview application commit. Recommendation: GO for local historical Monday preparation with the verified Level Map; NO-GO for production promotion or treating the incomplete consolidated workstation as fully accepted.
