# Bot integration — Trade Hub

Auto-trigger bot that watches VWAP and pivot levels on QQQ/TQQQ (and any other ticker you add), fires alerts and paper trades on cross/touch, and tracks a live P/L book. Designed to enforce defined-exit discipline: every rule requires a target and a stop before it can be saved.

## Files

```
src/lib/bot.js              # Pure engine (trigger detection, paper trade, stats)
src/hooks/useBot.js         # React hook wiring engine to live data + alerts
src/components/Bot.jsx      # UI tab
```

## Integration steps for Claude Code

Paste this to Claude Code in your `trade-hub` repo:

```
Add the bot to Trade Hub.

1. Drop these three files into the repo:
   - src/lib/bot.js
   - src/hooks/useBot.js
   - src/components/Bot.jsx

2. In src/hooks/useBot.js, verify the imports at the top match the existing surfaces:
   - useLiveData() — does it return { prices: { TICKER: { last } } }? If the shape is different, adjust the price extraction in the tick loop.
   - computeLevels(ticker) — does it return { VWAP, P, R1, R2, R3, S1, S2, S3 }? If your levels lib uses different keys (e.g., pivot.r1 instead of R1), update bot.js LEVEL_TYPES and the lookup in processTick.
   - playAlert(kind) and notify(title, body) — confirm these exist in src/lib/alerts.js. If the function names differ, update the two calls in useBot.js.

3. Register the new tab in src/components/tabs.jsx (or wherever tabs are defined in App.jsx). Add an entry for "Bot" that renders the Bot component.

4. Run npm run build to verify clean compile.

5. git add . && git commit -m "Add auto-trigger bot tab" && git push
```

## How rules work

Each rule = one ticker, one level, one trigger condition, one action.

- **Cross above**: previous tick was below the level, current tick is at or above
- **Cross below**: previous tick was above, current tick is at or below
- **Touch within**: current price is within tolerance dollars of the level

When a rule fires, the bot either:

- **Shares** (buy_shares / sell_shares): opens a paper position with the configured target and stop. The bot auto-closes the position on the next tick that hits target or stop. No discretion mid-trade.
- **Options** (buy_call_alert / buy_put_alert): fires an alert with the underlying price and trigger context, and adds an "alert_only" entry to the open positions list. You log the actual option contract in your broker. When done, click "Logged" to dismiss. (This is the right design for now because Massive's basic plan does not include options chain data, and discretion on contract selection matters.)

## Discipline guardrails baked in

- Cannot save a rule without target and stop (validateRule rejects it)
- Cooldown (default 300s) prevents re-firing the same rule within the cooldown window
- Open positions auto-close at target/stop with no override; manual close is logged with reason="manual" so you can audit
- Session reset clears positions and logs but preserves rules

## State + storage

All state persists to localStorage under `tradeHub.bot.state.v1`. Survives page refresh. Reset session clears the book but keeps rules.

## Suggested first rules for QQQ scalping around VWAP

| Ticker | Level | Trigger      | Action          | Target | Stop |
|--------|-------|--------------|-----------------|--------|------|
| QQQ    | VWAP  | cross_above  | buy_call_alert  | n/a    | n/a  |
| QQQ    | VWAP  | cross_below  | buy_put_alert   | n/a    | n/a  |
| QQQ    | S1    | touch_within | buy_shares      | $0.50  | $0.30 |
| QQQ    | R1    | touch_within | sell_shares     | $0.50  | $0.30 |

Start with alerts only for a few sessions, watch how often the rules fire and where the levels actually catch. Then turn on the paper trade shares actions once the level discipline looks clean.

## Known limitations

- Paper share trades do not model slippage or commissions. Add 1-2 cents of slippage in the engine if you want a more honest backtest.
- Cross detection runs only on ticks delivered by useLiveData. If your WebSocket misses a tick that spans the level, a fast cross can be missed. Massive WebSocket is generally tick-accurate but worth noting.
- Options alerts log the underlying price at trigger, not the option price. If you want options P/L tracked, wire the Black-Scholes engine from your IV tab into a follow-up version (track entry IV + strike + expiry → mark daily).
