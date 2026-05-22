// ─────────────────────────────────────────────────────────────────────────────
// bot.js — Trade Hub auto-trigger bot engine
//
// Pure logic, no React. Detects level crosses, fires alerts, and runs a paper
// trade book. Designed to plug into the live price stream from useLiveData and
// the level map from src/lib/levels.js.
//
// Discipline-first design:
//   - Every rule REQUIRES a target and a stop before it can be armed
//   - Paper positions auto-close at target/stop on every tick
//   - Cooldown prevents re-firing within N seconds of last trigger
//   - All trades are logged with full context for end-of-day review
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tradeHub.bot.state.v1";

// ─── Level types ─────────────────────────────────────────────────────────────
export const LEVEL_TYPES = ["VWAP", "P", "R1", "R2", "R3", "S1", "S2", "S3"];

// ─── Trigger types ───────────────────────────────────────────────────────────
export const TRIGGER_TYPES = {
  cross_above: "Cross above",
  cross_below: "Cross below",
  touch_within: "Touch within tolerance",
};

// ─── Action types ────────────────────────────────────────────────────────────
export const ACTION_TYPES = {
  buy_shares: "Buy shares (paper)",
  sell_shares: "Sell shares (paper, opens short)",
  buy_call_alert: "Buy CALL (alert + manual log)",
  buy_put_alert: "Buy PUT (alert + manual log)",
};

// ─── Factory: empty bot state ────────────────────────────────────────────────
export function createInitialState() {
  return {
    enabled: false,
    rules: [],
    positions: [],
    trades: [],     // closed positions
    log: [],        // alert + action history
    lastPrices: {}, // { ticker: lastPrice } for cross detection
    sessionStartedAt: null,
  };
}

// ─── Rule factory ────────────────────────────────────────────────────────────
export function createRule(partial = {}) {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ticker: partial.ticker || "QQQ",
    level: partial.level || "VWAP",
    trigger: partial.trigger || "cross_above",
    touchTolerance: partial.touchTolerance ?? 0.10,
    action: {
      type: partial.action?.type || "buy_shares",
      quantity: partial.action?.quantity ?? 10,
      target: partial.action?.target ?? null,    // dollars from entry; required
      stop: partial.action?.stop ?? null,        // dollars from entry; required
    },
    enabled: partial.enabled ?? true,
    cooldownSec: partial.cooldownSec ?? 300,
    lastFiredAt: null,
    timesFired: 0,
  };
}

// ─── Rule validation ─────────────────────────────────────────────────────────
export function validateRule(rule) {
  const errors = [];
  if (!rule.ticker) errors.push("ticker required");
  if (!LEVEL_TYPES.includes(rule.level)) errors.push("invalid level");
  if (!TRIGGER_TYPES[rule.trigger]) errors.push("invalid trigger");
  if (!ACTION_TYPES[rule.action.type]) errors.push("invalid action type");
  if (!rule.action.quantity || rule.action.quantity <= 0) errors.push("quantity must be > 0");
  if (rule.action.target == null || rule.action.target <= 0) errors.push("target required (dollars from entry)");
  if (rule.action.stop == null || rule.action.stop <= 0) errors.push("stop required (dollars from entry)");
  return errors;
}

// ─── Trigger detection ───────────────────────────────────────────────────────
// Returns true if the cross/touch condition is met given last and current price.
export function shouldTrigger(rule, levelValue, lastPrice, currentPrice) {
  if (levelValue == null || lastPrice == null || currentPrice == null) return false;

  switch (rule.trigger) {
    case "cross_above":
      return lastPrice < levelValue && currentPrice >= levelValue;
    case "cross_below":
      return lastPrice > levelValue && currentPrice <= levelValue;
    case "touch_within":
      return Math.abs(currentPrice - levelValue) <= rule.touchTolerance;
    default:
      return false;
  }
}

// ─── Cooldown check ──────────────────────────────────────────────────────────
function isOnCooldown(rule, now) {
  if (!rule.lastFiredAt) return false;
  return (now - rule.lastFiredAt) / 1000 < rule.cooldownSec;
}

// ─── Position factory ────────────────────────────────────────────────────────
function createPosition(rule, entryPrice, now) {
  const action = rule.action;
  const isShort = action.type === "sell_shares";
  const isOptionAlert = action.type === "buy_call_alert" || action.type === "buy_put_alert";

  return {
    id: `pos_${now}_${Math.random().toString(36).slice(2, 7)}`,
    ticker: rule.ticker,
    ruleId: rule.id,
    asset: isOptionAlert ? (action.type === "buy_call_alert" ? "call" : "put") : "shares",
    side: isShort ? "short" : "long",
    quantity: action.quantity,
    entryPrice,
    entryTime: now,
    triggeredAt: { level: rule.level, levelValue: entryPrice, trigger: rule.trigger },
    target: isShort ? entryPrice - action.target : entryPrice + action.target,
    stop: isShort ? entryPrice + action.stop : entryPrice - action.stop,
    targetDollars: action.target,
    stopDollars: action.stop,
    status: isOptionAlert ? "alert_only" : "open",
    exitPrice: null,
    exitTime: null,
    exitReason: null,
    notes: "",
  };
}

// ─── Mark-to-market a position ───────────────────────────────────────────────
export function markPosition(position, currentPrice) {
  if (position.status !== "open") return { ...position, unrealizedPL: 0, currentPrice };
  const direction = position.side === "long" ? 1 : -1;
  const unrealizedPL = (currentPrice - position.entryPrice) * direction * position.quantity;
  return { ...position, unrealizedPL, currentPrice };
}

// ─── Check if position should auto-close on this tick ────────────────────────
export function checkExit(position, currentPrice) {
  if (position.status !== "open") return null;
  if (position.side === "long") {
    if (currentPrice >= position.target) return "target";
    if (currentPrice <= position.stop) return "stop";
  } else {
    if (currentPrice <= position.target) return "target";
    if (currentPrice >= position.stop) return "stop";
  }
  return null;
}

// ─── Close a position ────────────────────────────────────────────────────────
export function closePosition(position, exitPrice, exitReason, now) {
  const direction = position.side === "long" ? 1 : -1;
  const realizedPL = (exitPrice - position.entryPrice) * direction * position.quantity;
  return {
    ...position,
    status: "closed",
    exitPrice,
    exitTime: now,
    exitReason,
    realizedPL,
    holdSeconds: Math.round((now - position.entryTime) / 1000),
  };
}

// ─── Main tick handler ───────────────────────────────────────────────────────
// Called on every price update. Returns a new state and an array of events
// (for the UI to display, play sounds, fire notifications, etc).
export function processTick(state, ticker, currentPrice, levels) {
  const events = [];
  const now = Date.now();
  const lastPrice = state.lastPrices[ticker];

  if (!state.enabled) {
    return { state: { ...state, lastPrices: { ...state.lastPrices, [ticker]: currentPrice } }, events };
  }

  // 1) Mark and check exits on all open positions for this ticker
  let positions = state.positions.map((p) => {
    if (p.ticker !== ticker || p.status !== "open") return p;
    const exitReason = checkExit(p, currentPrice);
    if (exitReason) {
      const closed = closePosition(p, currentPrice, exitReason, now);
      events.push({
        type: "position_closed",
        position: closed,
        message: `${closed.ticker} ${closed.side} closed @ ${currentPrice.toFixed(2)} (${exitReason}), P/L $${closed.realizedPL.toFixed(2)}`,
      });
      return closed;
    }
    return markPosition(p, currentPrice);
  });

  // 2) Move newly-closed positions to trades log
  const newlyClosed = positions.filter(
    (p) => p.status === "closed" && !state.trades.find((t) => t.id === p.id)
  );
  const trades = [...newlyClosed, ...state.trades];
  positions = positions.filter((p) => p.status === "open" || p.status === "alert_only");

  // 3) Check trigger rules
  const rules = state.rules.map((rule) => {
    if (!rule.enabled || rule.ticker !== ticker) return rule;
    if (isOnCooldown(rule, now)) return rule;

    const levelValue = levels?.[rule.level];
    if (!shouldTrigger(rule, levelValue, lastPrice, currentPrice)) return rule;

    // Fire it
    const pos = createPosition(rule, currentPrice, now);
    positions.push(pos);
    events.push({
      type: pos.status === "alert_only" ? "alert" : "position_opened",
      position: pos,
      rule,
      message:
        pos.status === "alert_only"
          ? `ALERT: ${rule.ticker} ${rule.level} ${rule.trigger.replace("_", " ")} @ ${currentPrice.toFixed(2)} → ${ACTION_TYPES[rule.action.type]}`
          : `${rule.action.type === "sell_shares" ? "SHORT" : "LONG"} ${pos.quantity} ${rule.ticker} @ ${currentPrice.toFixed(2)} (${rule.level} ${rule.trigger.replace("_", " ")})`,
    });

    return { ...rule, lastFiredAt: now, timesFired: rule.timesFired + 1 };
  });

  // 4) Append events to log
  const log = [
    ...events.map((e) => ({
      ts: now,
      type: e.type,
      ticker,
      price: currentPrice,
      message: e.message,
    })),
    ...state.log,
  ].slice(0, 500); // keep last 500 entries

  return {
    state: {
      ...state,
      rules,
      positions,
      trades,
      log,
      lastPrices: { ...state.lastPrices, [ticker]: currentPrice },
    },
    events,
  };
}

// ─── Manual position close ───────────────────────────────────────────────────
export function manualClose(state, positionId, exitPrice) {
  const now = Date.now();
  let closedPos = null;
  const positions = state.positions.map((p) => {
    if (p.id !== positionId || p.status !== "open") return p;
    closedPos = closePosition(p, exitPrice, "manual", now);
    return closedPos;
  });
  if (!closedPos) return state;
  return {
    ...state,
    positions: positions.filter((p) => p.status === "open" || p.status === "alert_only"),
    trades: [closedPos, ...state.trades],
    log: [
      {
        ts: now,
        type: "manual_close",
        ticker: closedPos.ticker,
        price: exitPrice,
        message: `Manual close ${closedPos.ticker} @ ${exitPrice.toFixed(2)}, P/L $${closedPos.realizedPL.toFixed(2)}`,
      },
      ...state.log,
    ].slice(0, 500),
  };
}

// ─── Discard an alert-only position (option contract logged elsewhere) ──────
export function dismissAlert(state, positionId) {
  return {
    ...state,
    positions: state.positions.filter((p) => p.id !== positionId),
  };
}

// ─── Session stats ───────────────────────────────────────────────────────────
export function sessionStats(state) {
  const closed = state.trades.filter((t) => t.status === "closed");
  const wins = closed.filter((t) => t.realizedPL > 0);
  const losses = closed.filter((t) => t.realizedPL <= 0);
  const totalPL = closed.reduce((s, t) => s + (t.realizedPL || 0), 0);
  const unrealized = state.positions
    .filter((p) => p.status === "open")
    .reduce((s, p) => s + (p.unrealizedPL || 0), 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.realizedPL, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.realizedPL, 0) / losses.length : 0;
  return {
    tradeCount: closed.length,
    openCount: state.positions.filter((p) => p.status === "open").length,
    winRate: closed.length ? wins.length / closed.length : 0,
    totalPL,
    unrealized,
    avgWin,
    avgLoss,
    expectancy: closed.length ? totalPL / closed.length : 0,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Bot state save failed", e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return { ...createInitialState(), ...parsed };
  } catch {
    return createInitialState();
  }
}

export function resetSession(state) {
  return {
    ...state,
    positions: [],
    trades: [],
    log: [],
    lastPrices: {},
    sessionStartedAt: Date.now(),
    rules: state.rules.map((r) => ({ ...r, lastFiredAt: null, timesFired: 0 })),
  };
}
