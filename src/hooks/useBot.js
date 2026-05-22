// ─────────────────────────────────────────────────────────────────────────────
// useBot.js — React hook bridging the bot engine to live data + alerts
//
// Original drop-in template assumed:
//   useLiveData()  → { prices: { TICKER: { last } } } multi-ticker map
//   computeLevels(ticker) → { VWAP, P, R1, R2, R3, S1, S2, S3 }
//   playAlert(kind), notify(title, body) from alerts.js
//
// Actual Trade Hub surface differs:
//   useLiveData(apiKey, ticker, ...) is single-ticker, returns scalar price
//   buildLevelMap(price, opts) returns { levels: [{label, price, ...}] }
//   alerts.js exports Sounds (object of sound functions) and notify (matches)
//
// This hook accepts the data it needs as explicit args from the parent
// (Bot.jsx). Rules for the active ticker get evaluated; rules for other
// tickers stay visible but are skipped with a flag in livePrices so the UI
// can show "no live data" instead of silently doing nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useReducer, useRef, useCallback } from "react";
import {
  createInitialState,
  loadState,
  saveState,
  processTick,
  manualClose as engineManualClose,
  dismissAlert as engineDismissAlert,
  resetSession as engineResetSession,
  createRule,
  validateRule,
} from "../lib/bot.js";

// >>> Adjust these two imports to match your repo if needed:
import { Sounds, notify } from "../lib/alerts.js";

// Local wrappers to match the engine's expected alert surface.
// engine fires kinds: "entry" (rule triggered), "win" (close at target),
// "loss" (close at stop / manual exit underwater).
function playAlert(kind) {
  if (typeof window === "undefined") return;
  try {
    if (kind === "entry") Sounds.levelBreak?.();
    else if (kind === "win") Sounds.clear?.();
    else if (kind === "loss") Sounds.warning?.();
    else Sounds.levelTouch?.();
  } catch (_) {
    // Audio init can throw before any user gesture; ignore silently.
  }
}

// Convert a Trade Hub levelMap (from buildLevelMap) into the
// { VWAP, P, R1, R2, R3, S1, S2, S3 } shape the engine expects.
// Maps label "Pivot" to key "P" since bot.js LEVEL_TYPES uses "P".
function adaptLevels(levelMap) {
  const out = {};
  for (const lvl of levelMap?.levels || []) {
    if (lvl.price == null || isNaN(lvl.price)) continue;
    if (lvl.label === "VWAP") out.VWAP = lvl.price;
    else if (lvl.label === "Pivot") out.P = lvl.price;
    else if (["R1", "R2", "R3", "S1", "S2", "S3"].includes(lvl.label)) out[lvl.label] = lvl.price;
  }
  return out;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return action.state;
    case "REPLACE":
      return action.state;
    case "TOGGLE_BOT":
      return { ...state, enabled: !state.enabled, sessionStartedAt: state.sessionStartedAt || Date.now() };
    case "ADD_RULE":
      return { ...state, rules: [...state.rules, action.rule] };
    case "UPDATE_RULE":
      return {
        ...state,
        rules: state.rules.map((r) => (r.id === action.rule.id ? action.rule : r)),
      };
    case "DELETE_RULE":
      return { ...state, rules: state.rules.filter((r) => r.id !== action.id) };
    case "TOGGLE_RULE":
      return {
        ...state,
        rules: state.rules.map((r) =>
          r.id === action.id ? { ...r, enabled: !r.enabled } : r
        ),
      };
    case "MANUAL_CLOSE":
      return engineManualClose(state, action.positionId, action.exitPrice);
    case "DISMISS_ALERT":
      return engineDismissAlert(state, action.positionId);
    case "RESET_SESSION":
      return engineResetSession(state);
    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────
// Inputs are explicit, supplied by the parent component (Bot.jsx). The Trade
// Hub's useLiveData is single-ticker, so the bot can only process rules for
// the activeTicker. Rules for other tickers stay in state but are skipped
// each tick until that ticker becomes active.
export function useBot({ activeTicker, livePrice, levelMap } = {}) {
  const [state, dispatch] = useReducer(reducer, createInitialState());
  const hydrated = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Hydrate from localStorage once
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const loaded = loadState();
    dispatch({ type: "HYDRATE", state: loaded });
  }, []);

  // Persist on every change after hydration
  useEffect(() => {
    if (hydrated.current) saveState(state);
  }, [state]);

  // Process every price tick for the active ticker only.
  useEffect(() => {
    if (!activeTicker || livePrice == null) return;

    const ticker = activeTicker.toUpperCase();
    const hasMatchingRule = state.rules.some(r => r.ticker === ticker);
    if (!hasMatchingRule) return;

    const levels = adaptLevels(levelMap);
    const { state: nextState, events } = processTick(stateRef.current, ticker, livePrice, levels);

    if (nextState !== stateRef.current) {
      dispatch({ type: "REPLACE", state: nextState });
    }

    for (const e of events) {
      if (e.type === "alert" || e.type === "position_opened") {
        playAlert("entry");
        notify("Trade Hub Bot", e.message);
      } else if (e.type === "position_closed") {
        playAlert(e.position.realizedPL >= 0 ? "win" : "loss");
        notify("Trade Hub Bot", e.message);
      }
    }
  }, [livePrice, activeTicker, levelMap, state.rules, state.enabled]);

  // Expose a livePrices map keyed by ticker for the UI. Only the active
  // ticker has a real value; others return null so the UI can render "—".
  const livePrices = (() => {
    const out = {};
    for (const r of state.rules) {
      out[r.ticker] = r.ticker === (activeTicker || "").toUpperCase()
        ? { last: livePrice, active: true }
        : { last: null, active: false };
    }
    return out;
  })();

  // ─── Public API ────────────────────────────────────────────────────────────
  const toggleBot = useCallback(() => dispatch({ type: "TOGGLE_BOT" }), []);
  const addRule = useCallback((partial) => {
    const rule = createRule(partial);
    const errors = validateRule(rule);
    if (errors.length) return { ok: false, errors };
    dispatch({ type: "ADD_RULE", rule });
    return { ok: true, rule };
  }, []);
  const updateRule = useCallback((rule) => {
    const errors = validateRule(rule);
    if (errors.length) return { ok: false, errors };
    dispatch({ type: "UPDATE_RULE", rule });
    return { ok: true };
  }, []);
  const deleteRule = useCallback((id) => dispatch({ type: "DELETE_RULE", id }), []);
  const toggleRule = useCallback((id) => dispatch({ type: "TOGGLE_RULE", id }), []);
  const closePosition = useCallback(
    (positionId, exitPrice) => dispatch({ type: "MANUAL_CLOSE", positionId, exitPrice }),
    []
  );
  const dismissAlertPos = useCallback(
    (positionId) => dispatch({ type: "DISMISS_ALERT", positionId }),
    []
  );
  const resetSession = useCallback(() => dispatch({ type: "RESET_SESSION" }), []);

  return {
    state,
    livePrices,
    activeTicker: (activeTicker || "").toUpperCase(),
    levels: adaptLevels(levelMap),
    toggleBot,
    addRule,
    updateRule,
    deleteRule,
    toggleRule,
    closePosition,
    dismissAlertPos,
    resetSession,
  };
}
