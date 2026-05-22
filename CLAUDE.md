# CLAUDE.md

Project context and working agreement for any Claude Code session in this repo.

## Project

Trade Hub, a personal QQQ/TQQQ 0DTE options day trading app for Sarah Lambertson.
Internal use only, single operator, not customer facing.

## Stack

- React 18 + Vite
- No external UI library, all inline styles
- localStorage for client persistence
- Deployed on Vercel, auto deploys on push to main
- GitHub repo: github.com/lamb01985/trade-hub-1
- Local path: ~/Downloads/trade-hub 4

## Key paths

- `src/App.jsx`: tab routing, top level state, header, FAB, modals
- `src/components/`: tab components and shared UI (Card, Btn, Pill, etc.)
- `src/lib/`: pure logic with no React (Massive client, levels, alerts, bot engine, structure, sectors, calendar, premarket, Schwab client, short thesis)
- `src/hooks/`: data hooks (`useLiveData`, `useBot`, `useStore`)
- `api/`: Vercel serverless functions for the Schwab OAuth flow and API proxy

## Data sources

- Massive.com API (formerly Polygon.io), equity tier, no options chain available.
  Used for live price WebSocket, intraday and daily aggregates, snapshots, news,
  financials, sector ETFs, ticker details.
- Anthropic Claude API, used in the Prep tab for morning brief generation and in
  the Journal tab for EOD coaching. Key entered in Command tab, lives in
  localStorage, calls go directly to api.anthropic.com.
- Charles Schwab API, optional, via the four Vercel serverless functions in
  `api/`. Provides live option ask price, buying power, day trade count, order
  staging, and journal sync. Credentials live in localStorage, OAuth flow keeps
  the token exchange off the browser.

## Build and deploy

- Always run `npm run build` before any commit.
- Fix any compile or lint errors before pushing.
- Vercel auto deploys on `git push origin main`. Build hash changes confirm a
  fresh deploy is live.

## Writing style

No em dashes anywhere, in code comments, commit messages, log strings, UI copy,
or any reply text you generate. Use commas, colons, parentheses, or rewrite the
sentence. This applies to every file you touch and every message you send.

## Workflow rules

- Before destructive actions (git reset, force push, deleting files, removing
  components, dropping localStorage keys), ask first.
- Before pushing to main, show the diff summary and wait for approval.
- For multi phase work, complete one phase and wait for explicit OK before
  starting the next.
- If you need to deviate from my instructions, stop and explain why. Do not
  silently choose a different approach.
- When making changes, prefer editing existing files over creating new ones.
- When implementing tunable thresholds, define them as named constants at the
  top of the relevant file so they can be adjusted without code spelunking.
- Add code comments only when the why is non obvious. Do not narrate the what.

## Tab structure (current, as of v31)

The app currently has 16 tabs registered in App.jsx. A planned restructure into
PLAN, TRADE, REVIEW is in progress. Until that ships, the current tabs are:
Watchlist, Prep, Playbook, Command, Calendar, Levels, Check, Chart, ORB, IV,
Checklist (older variant), Calculator, Journal, Stats, Short Thesis, Bot.

## localStorage keys used

The app relies on these keys. Do not change names without a migration plan:
`th-apikey`, `th-anthropic-key`, `th-trades`, `th-settings`, `th-prep`,
`th-saved-preps`, `th-eod-notes`, `th-playbook`, `th-short-universe`,
`th-short-explainer`, `th-short-theses`, `th-scanner-tickers`,
`th-auto-scan-time`, `th-scanner-time`, `th-iv-rank-input`, `th-schwab-creds`,
`th-schwab-token`, `th-schwab-account`, `th-sector-cache`, `checkLog`,
`tradeHub.bot.state.v1`.
