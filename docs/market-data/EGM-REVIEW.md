# Milestone 2 independent EGM review

Target: [main specification](./MILESTONE-2-LIVE-MARKET-DATA-SPEC.md), [inventory](./INVENTORY-AND-ENTITLEMENTS.md), and subsequent [first-increment addendum](./M2-0-M2-1-IMPLEMENTATION-ADDENDUM.md). No implementation is authorized or performed.

Three independent native subagents were launched with no inherited conversation. They read their installed EGM personas and supplied standards, then the draft and source context. This is a focused design/codebase/readiness review using EGM rubrics, not a claim that the separate security workflow completed its remaining stages.

## Initial findings and resolutions

| Finding | Reviewer/severity | Evidence and resolution |
| --- | --- | --- |
| D1 | Design, Major | Legacy browser REST could bypass new account budget. Addendum section 6 requires shared account-scoped admission at Node and Python provider boundaries before Unified activation, including hosted scanner and existing analysis/options routes. External unintegrated clients and browser streaming remain explicit limits. |
| D2 | Design, Nit | Generic positive-price rule could reject an observed zero option bid. Addendum section 5 preserves it as evidence but excludes it from usable two-sided pricing. |
| C1 | Codebase, Major | `options_report` currently produces relative chain-age/15-minute liquidity flags and unconditional pagination_complete. Add a named live output adapter that replaces these quality fields; keep historical behavior unchanged. |
| C2 | Codebase, Major | Existing Python analysis/options/background scanner consumes the same credential outside the new coordinator. Same resolution as D1; budget scope is the actual account, not each key/profile. Frozen strategy rules remain unchanged; admission failures stay explicit. |
| C3 | Codebase, Major | Existing snapshot/analytics timestamps use magnitude heuristics. Add endpoint/field/unit mapping and forbid legacy reinterpretation of normalized live timestamps; separate aggregate starts from event times. |
| R1 | Readiness, Major | M2.0/M2.1 route, parameter, response and service-auth contracts require implementation choices. Addendum sections 2–3 define first-phase resources, fields/statuses and bearer/audience protocol. |
| R2 | Readiness, Major | Calendar/session scope and tolerated future-clock behavior ambiguous. Addendum section 4 selects a pinned calendar for ETF RTH only and defines classification precedence and boundary tests. Later product sessions remain gated. |
| R3 | Readiness, Major | Attempt/page/retry accounting and scheduling ambiguous; old adapter has large page/timeout bounds. Addendum section 6 scopes all attempts, shared admission, ordering, deadlines and a separate bounded method interface. |
| R4 | Readiness, Major | Consumer migration phase ownership ambiguous. Addendum section 1 assigns new-mode guards in M2.1; timestamp-poor coach/setup/scanner tools remain unmounted rather than active during migration. |
| R5 | Readiness, Major | Vite lacks service-variable allowlist and market route mapping. Addendum section 3 names the configuration additions, exact routing and historical-preview rejection tests. |
| R6 | Readiness, Nit | 99% full-session measure has no denominator. Addendum section 7 defines ten-second samples per ETF, failures/startup included, evidence-only halt exclusions and per-symbol release gate. |

All initial reviewers reported no Blocker. Readiness explicitly concluded the initial architecture could be considered conditionally, but its first-phase implementation plan was not ready until these details were supplied. The addendum is the proposed resolution, not a claim of user approval.

## Read evidence

- Design reviewer `milestone2_design`: design critic persona, feature-spec standard; complete original 246-line spec, inventory/root contract; Node transport/report loader, both live hooks, intelligence view; Python provider, freshness/report router and relevant analytics/cutoff/store code; browser request/cache/stream sections.
- Codebase reviewer `milestone2_codebase`: codebase-details persona, re-implementation standard; complete original draft and inventory; Node helper/report loader, client and live hooks, options fetch/Wheel behavior, Vite middleware/archive adapter; Python provider/interfaces, analytics, freshness, serving and futures probe.
- Readiness reviewer `milestone2_readiness`: implementation-readiness persona and standard; complete original draft/inventory/root/security specification, access helper and Vite middleware; full Python Massive provider, base interfaces and freshness module.

No reviewer accessed real environment files, keys, private report contents, production services or provider accounts. Provider capability probes were performed separately by the primary agent through the connected Massive plugin and are scoped in the inventory.

## Follow-up review

Two additional fresh-context reviewers read the revised specification, inventory, this report, the normative addendum, their bundled personas/standards and explicit source context.

- `milestone2_final_design` identified one Major: environment-isolated quota buckets could multiply the same account limit. Resolution: one parent budget/concurrency pool across every integrated environment on that account, with child allocations only and a mixed-environment admission test. After reading the amendment and final sections 6–9, this reviewer confirmed the Major closed and no new design Blocker/Major/Nit.
- `milestone2_final_readiness` initially retained three Majors: shared admission protocol details, exact first-phase wire/required-quote predicate, and undefined daily completion. Resolution: addendum sections 8–9 define account keys, configuration R, atomic transitions, leases/retries/priority scope, identity/field-quality/coverage shapes and a required matching current bid/ask pair. Daily 1d is deferred to M2.2 and explicitly rejected in M2.1. After reading all 117 revised lines, the reviewer confirmed all three closed and no remaining Blocker/Major from readiness review.

**Disposition:** the bounded M2.0/M2.1 plan is sufficiently specified for implementation only after explicit user approval. No user approval has been given. Later phases still require their promised detailed specifications; this review is not a blanket implementation/deployment approval.

## Unresolved factual/release dependencies

- Exact Options Standard plan/account match, actual deployment-key field access, quota and agreements remain unverified; connected-account probes are not billing or production-key evidence.
- VIX and NQ/ES snapshot requests were denied; current futures contract/history resolution remains unverified. No substitution or subscription purchase is approved.
- Security remediation remains unimplemented; current authenticated-browser key exposure is not eliminated by this design document.
- Calendar/dependency acceptance, shared quota configuration across integrated producers, hosting/data-rights/retention decisions and product-specific live-session measurements are required before their corresponding release.

These are explicit gates, not findings silently waived as fixed. The 99% full-session result has not been measured, and no production runtime or application tests were executed as part of this specification-only review.
