# Original TradeHub Level Map repair candidate

Based on verified Monday readiness `fb51922`, isolated on `fix/tradehub-live-map-workflow` in `/Users/sarahlambertson/Desktop/tradehub-live-map-repair`. Existing worktrees and servers were not changed.

Root causes: `SessionResearch` always showed hard-coded October 30 research using October 29 references above the live ladder. Its Open QQQ live map callback only set the ticker, with no route, destination, focus or visible change when QQQ was already selected. The separate `?desk=live` adapter never entered the original planning workflow.

The candidate connects the original Levels, Tomorrow’s Prep, Chart and Review components to one canonical planning subscription. Plan → Trade → Review and their tool navigation remain visible. The Live Map action opens a symbol-specific Trade/map URL and focus target. Symbol selection, deep links, reload and Back reset mismatched manual fields and stay synchronized. Archived research is confined to Review/history, with a handoff to the current map.

Planning date is distinct from the current Chicago calendar date. Sunday/Monday preparation for November 2 owns Friday October 30 prior regular-session levels. A Friday replay's Thursday references are never reused as Monday's map. Current-session premarket/VWAP/EMA values remain unavailable until valid target-date bars exist; Friday indicators/extended references are separately dated. Reference clusters use actual level bounds within a documented 0.05% span, with no padded/invented levels. Scenarios are deterministic conditional interpretations, not statistically validated signals. Alerts are opt-in, symbol-scoped and gated by source/session freshness; stale current indicator levels cannot trigger alerts.

Verified provider values for the November 2 plan:

| Symbol | Previous high | Previous low | Previous close | Source |
| --- | ---: | ---: | ---: | --- |
| QQQ | 698.63 | 683.45 | 690.49 | Massive daily, 2026-10-30 |
| SPY | 761.46 | 750.36 | 755.72 | Massive daily, 2026-10-30 |
| NVDA | 209.06 | 200.9199 | 204.64 | Massive daily, 2026-10-30 |

Actual browser acceptance passed Plan → Levels → Open QQQ live map → SPY/NVDA → reload/Back → Tomorrow’s Prep Load Market Data → Trade → Review archived reports → current map. Real daily/minute values matched Massive responses. An isolated Monday premarket simulation refreshed high/low without reload at one context poll/minute; a provider-error simulation cleared the map explicitly. Browser errors: none. No legacy market/broker/AI polling was observed. A separate cookie prevents interference with the existing desk on port 4190. The existing approved `.env.local` was read, not copied or changed.

The full regression suite passed (287 tests before final documentation), and both normal and repair-flag builds pass. Independent review confirmed planning-date ownership, history separation, current bar freshness, route/reset handling, cooldown preservation, and isolated auth. Source and browser evidence are saved under ignored `.local/`, including original failure reproduction and repair screenshots.

```bash
cd /Users/sarahlambertson/Desktop/tradehub-live-map-repair
npm run levels:repair
```

Open **http://127.0.0.1:4210/**. The launcher reads the existing approved configuration from the sibling Monday-ready worktree; no credential entry is needed. It binds only to loopback and blocks broker, AI and notification endpoints. It does not deploy or alter the existing Monday desk / Options branches. Use Review for archived reports. No Monday active-session freshness is claimed from Sunday checks.

Verification: `npm test`, `npm run build`, `VITE_VERIFIED_LEVEL_WORKFLOW=true npm run build`, `node scripts/verify-level-map-repair.mjs`. The provider-backed browser check is anchored to this preparation weekend; its synthetic Monday cases are explicitly test-only.

Status: locally testable repair candidate, not a production release. The owner's later canonical consolidation instruction governs its integration into the single TradeHub product.
