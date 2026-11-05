# Simple Strategy and audible phone alerts

Trade > Simple Strategy is a QQQ-only first-hour midpoint pullback trial.
It uses current regular-session 1-minute bars, constructs completed 5-minute
candles, and computes open-anchored VWAP. No model call or order submission.
The defined rules, including the 3-candle swing stop, cent buffer, 2:1 minimum,
and 1-cent VWAP slope are in `src/lib/simpleStrategy.js`.

## Phone setup required before reliance

The new worker reuses the deployment's Telegram recipient and Polygon key.
Do not enter credentials in browser code or commit them.

Server environment:

- POLYGON_API_KEY, real-time stocks entitlement required
- TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for Sarah's verified private chat
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
- CRON_SECRET, a strong random bearer credential
- SIMPLE_STRATEGY_ENABLED=true, only after testing and deliberate activation
- SIMPLE_STRATEGY_REALTIME_VERIFIED=true, only after independently confirming
  real-time entitlement and market-hours source acceptance. Unknown stays paused.
- Preserve the repair branch operator-auth settings. Status requires its session.
- Existing KV_REST_API_URL / KV_REST_API_TOKEN are also supported for storage.

Configure a trusted external scheduler to GET
`https://<existing-tradehub-host>/api/simple-strategy?mode=check`
every minute, with `Authorization: Bearer <CRON_SECRET>` in a secret header.
Use 14:00-21:00 UTC weekdays year-round, or an equivalent New York-aware
schedule. The worker gates the actual regular session via New York time and
the repaired exchange calendar, including early closes and holidays. The
calendar currently covers 2026 only and fails closed outside that year.
No scheduler is provisioned by this commit. Do not add a minute cron to a
Vercel Hobby deployment, whose cron frequency cannot support this strategy.
A compatible existing external scheduler or Vercel plan is required.

Test the fixed recipient via authenticated POST to
`/api/simple-strategy?mode=test`. This sends only a fixed test message and is
limited to once per minute. Confirm Sarah's phone sounds with its screen
locked and TradeHub closed. Telegram acceptance is not proof of phone sound.
The code cannot override mute, notification permissions, or Focus settings.
The operator-authenticated UI status is GET `/api/simple-strategy?mode=status`; it contains no tokens
or recipient identity. It does not send messages or modify state.

## Notification behavior and limits

- Midpoint-touch heads-up: once per direction per session, based on the latest
  completed minute while a directional setup is forming.
- Confirmation: once per completed confirming 5-minute candle; includes trigger,
  stop, target, reward/risk, expiry, and instruction to skip a missed entry.
- Signals expire after the next 5-minute candle. No old-session replay.
- More than 2 minutes of minute-data lag or any missing/invalid regular-session
  minute pauses evaluation. No historical data fallback.
- Polling is not tick monitoring. Notification/network delay can mean an entry
  is missed; check live price and never chase.
- Redis NX deduplication prevents simultaneous worker invocations sending the
  same signal twice. An ambiguous Telegram timeout is not automatically retried
  for that signal, preventing duplicate alerts. Worker status reports failure.
- This is not SMS or a voice call. No broker orders are generated.
- Browser risk controls hide a plan after its existing app limits are reached.
  The worker cannot read localStorage losses or trade count and may continue
  sending market observations. Stop after two trial attempts. A shared server
  risk ledger is needed before treating alerts as trade permissions.
- Forward-test using paper trades before risking capital. No claimed win rate.

## Release verification

Run `npm test` and `npm run build`. Review the diff before pushing to main,
which auto-deploys this existing Vercel app. After deployment verify the screen,
server config, worker heartbeat, closed-market skip, real-time entitlement,
private recipient and locked-phone sound. Do not call alerts live until those
checks and the scheduler are verified.

## Integration baseline

This branch is based on fix/tradehub-p0-current-levels at f3bd4c2, preserving
its operator gate, source-evidence checks and repaired live-map navigation.
The background worker also requires fresh trade evidence and explicit real-time
verification. This branch does not resolve the baseline preview auth blockers
or grant production promotion. Merge/review against the repair branch first.
