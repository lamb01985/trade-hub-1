// ─────────────────────────────────────────────────────────────────────────────
// Bot.jsx — Trade Hub auto-trigger bot UI
//
// Drop-in tab component. Pairs with useBot hook and bot.js engine.
// Matches the existing Trade Hub dark terminal aesthetic.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { useBot } from "../hooks/useBot.js";
import {
  LEVEL_TYPES,
  TRIGGER_TYPES,
  ACTION_TYPES,
  sessionStats,
} from "../lib/bot.js";

// Levels arrive via the useBot hook (adapted from buildLevelMap in App).
// The original template imported computeLevels(ticker) from levels.js;
// this repo does not export that. The active-ticker level snapshot now
// flows in as the levels prop to LiveMonitor / TickerCard.

const ACCENT = "#D1FF79";
const BG = "#0b0f17";
const CARD = "#0d1220";
const BORDER = "#1a2230";
const MUTED = "#5b6577";
const FG = "#e6ebf2";
const RED = "#ff5c7c";
const GREEN = "#3fe09a";

const TICKER_PRESETS = ["QQQ", "TQQQ", "SPY", "IWM"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => (n == null || isNaN(n) ? "—" : Number(n).toFixed(d));
const fmtPL = (n) => {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${fmt(Math.abs(n))}`.replace("+$", "+$").replace("$-", "-$");
};
const timeAgo = (ts) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
};

// ─── Main component ──────────────────────────────────────────────────────────
// Props come from App.jsx so the bot reuses the existing live-data and
// level-map state instead of double-fetching from Polygon.
export default function Bot({ activeTicker = "QQQ", livePrice = null, levelMap = null } = {}) {
  const bot = useBot({ activeTicker, livePrice, levelMap });
  const { state, livePrices, levels: activeLevels, activeTicker: normalizedActive } = bot;
  const stats = useMemo(() => sessionStats(state), [state]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const handleSaveRule = (rule) => {
    const result = rule.id && state.rules.find((r) => r.id === rule.id)
      ? bot.updateRule(rule)
      : bot.addRule(rule);
    if (!result.ok) {
      alert("Rule errors:\n" + result.errors.join("\n"));
      return;
    }
    setShowRuleForm(false);
    setEditingRule(null);
  };

  return (
    <div style={{ background: BG, color: FG, padding: 20, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", minHeight: "100vh" }}>
      <Header bot={bot} stats={stats} />

      <Section title="Live Monitor">
        <LiveMonitor rules={state.rules} livePrices={livePrices} activeTicker={normalizedActive} activeLevels={activeLevels} />
      </Section>

      <Section
        title={`Rules (${state.rules.length})`}
        action={
          <button
            onClick={() => { setEditingRule(null); setShowRuleForm(true); }}
            style={btnPrimary}
          >+ New rule</button>
        }
      >
        {state.rules.length === 0 ? (
          <Empty text="No rules yet. Add one to arm the bot." />
        ) : (
          <RulesList
            rules={state.rules}
            onToggle={bot.toggleRule}
            onDelete={bot.deleteRule}
            onEdit={(rule) => { setEditingRule(rule); setShowRuleForm(true); }}
          />
        )}
      </Section>

      <Section title={`Open positions (${state.positions.length})`}>
        {state.positions.length === 0 ? (
          <Empty text="No open positions." />
        ) : (
          <PositionsList
            positions={state.positions}
            livePrices={livePrices}
            onClose={bot.closePosition}
            onDismiss={bot.dismissAlertPos}
          />
        )}
      </Section>

      <Section title={`Trade log (${state.trades.length} closed)`}>
        {state.trades.length === 0 ? (
          <Empty text="No closed trades this session." />
        ) : (
          <TradesList trades={state.trades.slice(0, 20)} />
        )}
      </Section>

      <Section title="Activity">
        {state.log.length === 0 ? (
          <Empty text="No activity yet." />
        ) : (
          <LogList log={state.log.slice(0, 30)} />
        )}
      </Section>

      {showRuleForm && (
        <RuleFormModal
          initial={editingRule}
          onSave={handleSaveRule}
          onCancel={() => { setShowRuleForm(false); setEditingRule(null); }}
        />
      )}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────
function Header({ bot, stats }) {
  const { state, toggleBot, resetSession } = bot;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, padding: "16px 20px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={toggleBot}
          style={{
            ...btnBase,
            background: state.enabled ? ACCENT : "transparent",
            color: state.enabled ? BG : ACCENT,
            border: `1px solid ${ACCENT}`,
            fontWeight: 700,
            letterSpacing: 1,
            padding: "8px 20px",
          }}
        >
          {state.enabled ? "● BOT ARMED" : "○ BOT OFF"}
        </button>
        <Stat label="Closed" value={stats.tradeCount} />
        <Stat label="Open" value={stats.openCount} />
        <Stat label="Win rate" value={`${Math.round(stats.winRate * 100)}%`} />
        <Stat
          label="Realized"
          value={fmtPL(stats.totalPL)}
          color={stats.totalPL >= 0 ? GREEN : RED}
        />
        <Stat
          label="Unrealized"
          value={fmtPL(stats.unrealized)}
          color={stats.unrealized >= 0 ? GREEN : RED}
        />
      </div>
      <button onClick={() => { if (confirm("Reset session? This clears positions, trades, and log.")) resetSession(); }} style={btnGhost}>
        Reset session
      </button>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
      <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, color: color || FG, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 2, margin: 0 }}>{title}</h3>
        {action}
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12 }}>{children}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ color: MUTED, fontSize: 12, padding: 8, textAlign: "center" }}>{text}</div>;
}

// ─── Live Monitor ────────────────────────────────────────────────────────────
function LiveMonitor({ rules, livePrices, activeTicker, activeLevels }) {
  const tickers = Array.from(new Set(rules.map((r) => r.ticker)));
  if (!tickers.length) return <Empty text="Add a rule to see live levels." />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      {tickers.map((t) => {
        const isActive = t === activeTicker;
        return (
          <TickerCard
            key={t}
            ticker={t}
            price={livePrices[t]?.last ?? null}
            levels={isActive ? activeLevels : {}}
            isActive={isActive}
          />
        );
      })}
    </div>
  );
}

function TickerCard({ ticker, price, levels = {}, isActive = false }) {
  return (
    <div style={{ border: `1px solid ${isActive ? ACCENT + "44" : BORDER}`, borderRadius: 6, padding: 10, opacity: isActive ? 1 : 0.55 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>
          {ticker}
          {!isActive && <span style={{ marginLeft: 6, fontSize: 9, color: MUTED, fontWeight: 400, letterSpacing: 0 }}>not active</span>}
        </span>
        <span style={{ fontSize: 16, color: ACCENT, fontWeight: 600 }}>{price ? fmt(price) : "—"}</span>
      </div>
      {!isActive && (
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 6, lineHeight: 1.5 }}>
          Switch the active ticker in Prep to see live levels and run rules for this name.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4, fontSize: 11 }}>
        {LEVEL_TYPES.map((lvl) => {
          const v = levels[lvl];
          const diff = price && v != null ? price - v : null;
          const pctDiff = price && v ? (diff / v) * 100 : null;
          return (
            <div key={lvl} style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", color: Math.abs(pctDiff || 99) < 0.1 ? ACCENT : FG }}>
              <span style={{ color: MUTED }}>{lvl}</span>
              <span>
                {v != null ? fmt(v) : "—"}
                {diff != null && (
                  <span style={{ color: diff >= 0 ? GREEN : RED, marginLeft: 6 }}>
                    {diff >= 0 ? "+" : ""}{fmt(diff)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Rules List ──────────────────────────────────────────────────────────────
function RulesList({ rules, onToggle, onDelete, onEdit }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rules.map((r) => (
        <div
          key={r.id}
          style={{
            display: "grid",
            gridTemplateColumns: "60px 60px 90px 130px 1fr 140px",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            background: r.enabled ? "transparent" : "rgba(255,255,255,0.02)",
            opacity: r.enabled ? 1 : 0.5,
            fontSize: 12,
          }}
        >
          <button onClick={() => onToggle(r.id)} style={{ ...btnBase, color: r.enabled ? ACCENT : MUTED, padding: "2px 6px" }}>
            {r.enabled ? "ON" : "OFF"}
          </button>
          <span style={{ fontWeight: 700 }}>{r.ticker}</span>
          <span style={{ color: ACCENT }}>{r.level}</span>
          <span style={{ color: MUTED }}>{TRIGGER_TYPES[r.trigger]}</span>
          <span>
            {ACTION_TYPES[r.action.type]}{" "}
            <span style={{ color: MUTED }}>
              qty {r.action.quantity}, tp ${fmt(r.action.target)}, sl ${fmt(r.action.stop)}
            </span>
          </span>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <span style={{ color: MUTED, fontSize: 11 }}>fired {r.timesFired}×</span>
            <button onClick={() => onEdit(r)} style={btnGhost}>Edit</button>
            <button onClick={() => { if (confirm("Delete rule?")) onDelete(r.id); }} style={{ ...btnGhost, color: RED }}>×</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Positions ───────────────────────────────────────────────────────────────
function PositionsList({ positions, livePrices, onClose, onDismiss }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {positions.map((p) => {
        const live = livePrices[p.ticker]?.last ?? livePrices[p.ticker]?.price ?? p.entryPrice;
        const direction = p.side === "long" ? 1 : -1;
        const upl = p.status === "open" ? (live - p.entryPrice) * direction * p.quantity : 0;
        return (
          <div
            key={p.id}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 70px 80px 1fr 110px 110px 90px 120px",
              gap: 8,
              alignItems: "center",
              padding: "8px 10px",
              border: `1px solid ${p.status === "alert_only" ? ACCENT : BORDER}`,
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 700 }}>{p.ticker}</span>
            <span style={{ color: p.side === "long" ? GREEN : RED }}>{p.side.toUpperCase()}</span>
            <span style={{ color: MUTED }}>{p.asset}</span>
            <span style={{ color: MUTED }}>
              x{p.quantity} @ ${fmt(p.entryPrice)} ({p.triggeredAt.level} {p.triggeredAt.trigger.replace("_", " ")})
            </span>
            <span>TP <span style={{ color: GREEN }}>${fmt(p.target)}</span></span>
            <span>SL <span style={{ color: RED }}>${fmt(p.stop)}</span></span>
            <span style={{ color: upl >= 0 ? GREEN : RED, fontWeight: 600 }}>
              {p.status === "alert_only" ? "ALERT" : fmtPL(upl)}
            </span>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              {p.status === "alert_only" ? (
                <button onClick={() => onDismiss(p.id)} style={btnGhost}>Logged</button>
              ) : (
                <button
                  onClick={() => {
                    const px = parseFloat(prompt(`Close ${p.ticker} at price:`, fmt(live)));
                    if (!isNaN(px)) onClose(p.id, px);
                  }}
                  style={btnGhost}
                >Close</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Trades ──────────────────────────────────────────────────────────────────
function TradesList({ trades }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "60px 60px 60px 80px 80px 80px 80px 1fr", gap: 8, color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, padding: "0 10px" }}>
        <span>Ticker</span><span>Side</span><span>Qty</span><span>Entry</span><span>Exit</span><span>P/L</span><span>Reason</span><span>Hold</span>
      </div>
      {trades.map((t) => (
        <div key={t.id} style={{ display: "grid", gridTemplateColumns: "60px 60px 60px 80px 80px 80px 80px 1fr", gap: 8, padding: "4px 10px", borderTop: `1px solid ${BORDER}` }}>
          <span style={{ fontWeight: 600 }}>{t.ticker}</span>
          <span style={{ color: t.side === "long" ? GREEN : RED }}>{t.side}</span>
          <span>{t.quantity}</span>
          <span>${fmt(t.entryPrice)}</span>
          <span>${fmt(t.exitPrice)}</span>
          <span style={{ color: t.realizedPL >= 0 ? GREEN : RED, fontWeight: 600 }}>{fmtPL(t.realizedPL)}</span>
          <span style={{ color: MUTED }}>{t.exitReason}</span>
          <span style={{ color: MUTED }}>{Math.round((t.holdSeconds || 0) / 60)}m</span>
        </div>
      ))}
    </div>
  );
}

// ─── Log ─────────────────────────────────────────────────────────────────────
function LogList({ log }) {
  return (
    <div style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", maxHeight: 240, overflowY: "auto" }}>
      {log.map((l, i) => (
        <div key={i} style={{ padding: "2px 0", color: l.type === "position_closed" ? FG : l.type === "alert" ? ACCENT : MUTED, display: "flex", gap: 8 }}>
          <span style={{ color: MUTED, minWidth: 30 }}>{timeAgo(l.ts)}</span>
          <span>{l.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Rule Form Modal ─────────────────────────────────────────────────────────
function RuleFormModal({ initial, onSave, onCancel }) {
  const [rule, setRule] = useState(
    initial || {
      ticker: "QQQ",
      level: "VWAP",
      trigger: "cross_above",
      touchTolerance: 0.10,
      action: { type: "buy_shares", quantity: 10, target: 0.50, stop: 0.30 },
      enabled: true,
      cooldownSec: 300,
    }
  );

  const update = (patch) => setRule({ ...rule, ...patch });
  const updateAction = (patch) => setRule({ ...rule, action: { ...rule.action, ...patch } });

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: 24, width: 480, maxWidth: "90vw", color: FG,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <h3 style={{ margin: 0, marginBottom: 16, color: ACCENT, fontSize: 14, letterSpacing: 2 }}>
          {initial ? "EDIT RULE" : "NEW RULE"}
        </h3>

        <Field label="Ticker">
          <div style={{ display: "flex", gap: 4 }}>
            {TICKER_PRESETS.map((t) => (
              <button key={t} onClick={() => update({ ticker: t })} style={{ ...btnBase, padding: "4px 8px", background: rule.ticker === t ? ACCENT : "transparent", color: rule.ticker === t ? BG : FG, border: `1px solid ${BORDER}`, fontSize: 11 }}>{t}</button>
            ))}
            <input
              value={rule.ticker}
              onChange={(e) => update({ ticker: e.target.value.toUpperCase() })}
              style={input}
              maxLength={6}
            />
          </div>
        </Field>

        <Field label="Level">
          <select value={rule.level} onChange={(e) => update({ level: e.target.value })} style={input}>
            {LEVEL_TYPES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>

        <Field label="Trigger">
          <select value={rule.trigger} onChange={(e) => update({ trigger: e.target.value })} style={input}>
            {Object.entries(TRIGGER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>

        {rule.trigger === "touch_within" && (
          <Field label="Touch tolerance ($)">
            <input type="number" step="0.01" value={rule.touchTolerance} onChange={(e) => update({ touchTolerance: parseFloat(e.target.value) || 0 })} style={input} />
          </Field>
        )}

        <Field label="Action">
          <select value={rule.action.type} onChange={(e) => updateAction({ type: e.target.value })} style={input}>
            {Object.entries(ACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <Field label="Quantity">
            <input type="number" min={1} value={rule.action.quantity} onChange={(e) => updateAction({ quantity: parseInt(e.target.value) || 0 })} style={input} />
          </Field>
          <Field label="Target ($)">
            <input type="number" step="0.01" value={rule.action.target ?? ""} onChange={(e) => updateAction({ target: parseFloat(e.target.value) || 0 })} style={input} />
          </Field>
          <Field label="Stop ($)">
            <input type="number" step="0.01" value={rule.action.stop ?? ""} onChange={(e) => updateAction({ stop: parseFloat(e.target.value) || 0 })} style={input} />
          </Field>
        </div>

        <Field label="Cooldown (seconds)">
          <input type="number" min={0} value={rule.cooldownSec} onChange={(e) => update({ cooldownSec: parseInt(e.target.value) || 0 })} style={input} />
        </Field>

        <div style={{ fontSize: 11, color: MUTED, marginTop: 8, padding: 8, background: BG, borderRadius: 4 }}>
          Target and stop are distances in dollars from entry. For a long entry at $590 with target $0.50 and stop $0.30, the bot closes at $590.50 (win) or $589.70 (loss).
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
          <button onClick={() => onSave(rule)} style={btnPrimary}>Save rule</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const btnBase = {
  background: "transparent",
  color: FG,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnPrimary = {
  ...btnBase,
  background: ACCENT,
  color: BG,
  border: `1px solid ${ACCENT}`,
  fontWeight: 600,
};

const btnGhost = {
  ...btnBase,
  color: MUTED,
};

const input = {
  width: "100%",
  background: BG,
  color: FG,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
