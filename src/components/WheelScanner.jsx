import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Crosshair, Activity, Plus, X, RefreshCw, Settings, DollarSign, AlertCircle, ChevronRight } from 'lucide-react';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'AMD', 'COST', 'SPY', 'QQQ'];

const TICKER_COLORS = {
  AAPL: '#a3a3a3', MSFT: '#7cb9e8', GOOGL: '#fbbf24', AMZN: '#ff9900',
  NVDA: '#76b900', META: '#0668e1', AMD: '#ed1c24', COST: '#e31837',
  SPY: '#D1FF79', QQQ: '#a78bfa', TQQQ: '#f472b6',
};

const getTickerColor = (t) => TICKER_COLORS[t] || '#D1FF79';

function WheelScanner() {
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [positions, setPositions] = useState([]);
  const [scanResults, setScanResults] = useState({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('hunt');
  const [lastScan, setLastScan] = useState(null);
  const [newTicker, setNewTicker] = useState('');
  const [capital, setCapital] = useState(25000);
  const [scanError, setScanError] = useState(null);
  const [editingPos, setEditingPos] = useState(false);
  const [posDraft, setPosDraft] = useState({ ticker: '', shares: 100, costBasis: '' });
  const [expandedTicker, setExpandedTicker] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const w = await window.storage.get('wheel:watchlist');
        if (w) setWatchlist(JSON.parse(w.value));
      } catch {}
      try {
        const p = await window.storage.get('wheel:positions');
        if (p) setPositions(JSON.parse(p.value));
      } catch {}
      try {
        const c = await window.storage.get('wheel:capital');
        if (c) setCapital(JSON.parse(c.value));
      } catch {}
      try {
        const r = await window.storage.get('wheel:lastResults');
        if (r) {
          const parsed = JSON.parse(r.value);
          setScanResults(parsed.results || {});
          setLastScan(parsed.timestamp || null);
        }
      } catch {}
    })();
  }, []);

  const persistWatchlist = async (list) => {
    setWatchlist(list);
    try { await window.storage.set('wheel:watchlist', JSON.stringify(list)); } catch {}
  };

  const persistPositions = async (list) => {
    setPositions(list);
    try { await window.storage.set('wheel:positions', JSON.stringify(list)); } catch {}
  };

  const persistCapital = async (val) => {
    setCapital(val);
    try { await window.storage.set('wheel:capital', JSON.stringify(val)); } catch {}
  };

  const persistResults = async (results, ts) => {
    try {
      await window.storage.set('wheel:lastResults', JSON.stringify({ results, timestamp: ts }));
    } catch {}
  };

  const analyzeOneTicker = async (ticker, hasPosition, costBasis) => {
    const prompt = `Analyze ${ticker} for wheel strategy options income. Use web search to get the current stock price, recent technical levels, and implied volatility environment. Today is ${new Date().toLocaleDateString()}.

Return ONLY valid JSON with no markdown code fences or commentary. Use this exact schema:

{
  "ticker": "${ticker}",
  "price": <current price as number>,
  "changePct": <today's % change as number>,
  "rsi": <estimated RSI 0-100 based on recent action>,
  "wk52High": <number>,
  "wk52Low": <number>,
  "support": <nearest technical support level>,
  "resistance": <nearest technical resistance>,
  "ivEnv": "low" | "normal" | "elevated" | "high",
  "ivRankEstimate": <0-100 estimate of where current IV sits in 52w range>,
  "trend": "uptrend" | "downtrend" | "sideways",
  "putCandidate": {
    "strike": <suggested put strike, typically 5-10% OTM near support>,
    "estPremium": <estimated premium per contract in dollars>,
    "dte": 30,
    "deltaApprox": <approx delta -0.15 to -0.30>
  },
  "callCandidate": ${hasPosition ? `{
    "strike": <suggested call strike above ${costBasis} cost basis, typically 3-7% OTM>,
    "estPremium": <estimated premium per contract>,
    "dte": 30,
    "deltaApprox": <approx delta 0.20 to 0.35>
  }` : 'null'},
  "putThesis": "<one sentence: why now is or isn't a good moment to sell puts on this name>",
  "callThesis": ${hasPosition ? '"<one sentence: covered call thesis given cost basis>"' : 'null'},
  "confidence": "low" | "medium" | "high"
}

Be honest about confidence. If options data is hard to estimate, use "low" confidence. Premium estimates should reflect typical 30-DTE pricing for the given IV environment.`;

    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    const data = await response.json();
    const fullText = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const cleaned = fullText.replace(/```json|```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
    return JSON.parse(jsonStr);
  };

  const scorePut = (a) => {
    if (!a || !a.putCandidate) return 0;
    let score = 0;
    score += Math.min(30, (a.ivRankEstimate || 0) * 0.3);
    if (a.rsi < 30) score += 25;
    else if (a.rsi < 40) score += 18;
    else if (a.rsi < 50) score += 10;
    else if (a.rsi > 70) score -= 10;
    const distToSupport = Math.abs(a.price - a.support) / a.price;
    if (distToSupport < 0.03) score += 20;
    else if (distToSupport < 0.06) score += 12;
    else if (distToSupport < 0.10) score += 6;
    const yieldPct = (a.putCandidate.estPremium / a.putCandidate.strike) * 100;
    const annualizedYield = yieldPct * (365 / (a.putCandidate.dte || 30));
    if (annualizedYield > 30) score += 25;
    else if (annualizedYield > 20) score += 18;
    else if (annualizedYield > 12) score += 10;
    else score += 4;
    if (a.trend === 'uptrend') score += 5;
    if (a.trend === 'downtrend') score -= 8;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const scoreCall = (a, costBasis) => {
    if (!a || !a.callCandidate) return 0;
    let score = 0;
    score += Math.min(30, (a.ivRankEstimate || 0) * 0.3);
    if (a.rsi > 70) score += 25;
    else if (a.rsi > 60) score += 18;
    else if (a.rsi > 50) score += 10;
    else if (a.rsi < 30) score -= 10;
    const distToResistance = Math.abs(a.resistance - a.price) / a.price;
    if (distToResistance < 0.03) score += 20;
    else if (distToResistance < 0.06) score += 12;
    if (a.callCandidate.strike > costBasis) score += 15;
    else score -= 20;
    const yieldPct = (a.callCandidate.estPremium / costBasis) * 100;
    const annualized = yieldPct * (365 / (a.callCandidate.dte || 30));
    if (annualized > 25) score += 20;
    else if (annualized > 15) score += 12;
    else score += 4;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const phaseForTicker = (ticker, analysis) => {
    const pos = positions.find((p) => p.ticker === ticker);
    if (pos) {
      const cs = scoreCall(analysis, pos.costBasis);
      if (cs >= 65) return { name: 'HARVEST', color: '#D1FF79', desc: 'Sell call now' };
      return { name: 'HOLD', color: '#94a3b8', desc: 'Wait for better setup' };
    }
    const ps = analysis ? scorePut(analysis) : 0;
    if (ps >= 70) return { name: 'ARMED', color: '#D1FF79', desc: 'Sell put now' };
    if (ps >= 50) return { name: 'WATCH', color: '#fbbf24', desc: 'Setting up' };
    return { name: 'HUNT', color: '#64748b', desc: 'No signal yet' };
  };

  const runScan = async () => {
    setIsScanning(true);
    setScanError(null);
    setScanProgress(0);
    const results = {};
    const total = watchlist.length;
    for (let i = 0; i < watchlist.length; i++) {
      const ticker = watchlist[i];
      const pos = positions.find((p) => p.ticker === ticker);
      try {
        const analysis = await analyzeOneTicker(ticker, !!pos, pos?.costBasis);
        results[ticker] = {
          ...analysis,
          putScore: scorePut(analysis),
          callScore: pos ? scoreCall(analysis, pos.costBasis) : null,
        };
      } catch (e) {
        results[ticker] = { error: e.message || 'Scan failed' };
      }
      setScanProgress(Math.round(((i + 1) / total) * 100));
      setScanResults({ ...results });
    }
    const ts = new Date().toISOString();
    setLastScan(ts);
    await persistResults(results, ts);
    setIsScanning(false);
  };

  const addTicker = () => {
    const t = newTicker.trim().toUpperCase();
    if (t && !watchlist.includes(t)) {
      persistWatchlist([...watchlist, t]);
      setNewTicker('');
    }
  };

  const removeTicker = (t) => persistWatchlist(watchlist.filter((x) => x !== t));

  const addPosition = () => {
    if (!posDraft.ticker || !posDraft.costBasis) return;
    const next = [
      ...positions.filter((p) => p.ticker !== posDraft.ticker.toUpperCase()),
      {
        ticker: posDraft.ticker.toUpperCase(),
        shares: Number(posDraft.shares),
        costBasis: Number(posDraft.costBasis),
        opened: new Date().toISOString(),
      },
    ];
    persistPositions(next);
    setPosDraft({ ticker: '', shares: 100, costBasis: '' });
    setEditingPos(false);
  };

  const removePosition = (ticker) => persistPositions(positions.filter((p) => p.ticker !== ticker));

  const sortedHuntResults = watchlist
    .filter((t) => !positions.find((p) => p.ticker === t))
    .map((t) => ({ ticker: t, ...scanResults[t] }))
    .sort((a, b) => (b.putScore || -1) - (a.putScore || -1));

  const sortedHoldResults = positions.map((p) => ({
    ...p,
    ...scanResults[p.ticker],
  }));

  const fmtPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
  const fmtMoney = (n) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  const fmtTime = (iso) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      color: '#e2e8f0',
      fontFamily: "'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace",
      padding: '16px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');
        .serif { font-family: 'Instrument Serif', Georgia, serif; }
        .glow { box-shadow: 0 0 24px rgba(209, 255, 121, 0.15); }
        .scanline { background: linear-gradient(90deg, transparent, #D1FF79, transparent); }
        @keyframes pulse-glow { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .pulse { animation: pulse-glow 1.8s ease-in-out infinite; }
        @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .slide { animation: slide 1.5s linear infinite; }
        input::placeholder { color: #475569; }
        button { transition: all 0.15s ease; }
        button:hover:not(:disabled) { transform: translateY(-1px); }
      `}</style>

      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 2 }}>OPTIONS INCOME SYSTEM</div>
            <h1 className="serif" style={{ fontSize: 44, margin: 0, fontWeight: 400, letterSpacing: -1, lineHeight: 1 }}>
              The Wheel<span style={{ color: '#D1FF79', fontStyle: 'italic' }}>.</span>
            </h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 1 }}>LAST SCAN</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{fmtTime(lastScan)}</div>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, #D1FF79, transparent)', marginBottom: 20 }} />

        {/* Scan bar */}
        <div style={{
          background: '#131826',
          border: '1px solid #1f2937',
          borderRadius: 8,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={runScan}
            disabled={isScanning || watchlist.length === 0}
            style={{
              background: isScanning ? '#1f2937' : '#D1FF79',
              color: isScanning ? '#94a3b8' : '#0a0e1a',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: isScanning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              letterSpacing: 0.5,
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={14} style={{ animation: isScanning ? 'spin 1s linear infinite' : 'none' }} />
            {isScanning ? `SCANNING ${scanProgress}%` : 'RUN SCAN'}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ flex: 1, minWidth: 100, height: 4, background: '#1f2937', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
            {isScanning && (
              <div style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                width: `${scanProgress}%`,
                background: '#D1FF79',
                transition: 'width 0.3s ease',
              }} />
            )}
            {!isScanning && lastScan && (
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '100%', background: '#1f2937' }} />
            )}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {watchlist.length} watch · {positions.length} held
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1f2937' }}>
          {[
            { id: 'hunt', label: 'Hunt', icon: Crosshair, desc: 'Sell puts' },
            { id: 'hold', label: 'Hold', icon: Target, desc: 'Sell calls' },
            { id: 'settings', label: 'Setup', icon: Settings, desc: 'Watchlist' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  color: active ? '#D1FF79' : '#64748b',
                  border: 'none',
                  borderBottom: active ? '2px solid #D1FF79' : '2px solid transparent',
                  padding: '10px 16px',
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                  marginBottom: -1,
                }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* HUNT TAB */}
        {activeTab === 'hunt' && (
          <div>
            {sortedHuntResults.length === 0 && (
              <EmptyState text="Add tickers in Setup to begin hunting" />
            )}
            {sortedHuntResults.map((r) => {
              const hasData = r.price != null;
              const phase = hasData ? phaseForTicker(r.ticker, r) : { name: 'HUNT', color: '#64748b', desc: 'Not scanned yet' };
              const isExpanded = expandedTicker === r.ticker;
              return (
                <div
                  key={r.ticker}
                  onClick={() => setExpandedTicker(isExpanded ? null : r.ticker)}
                  style={{
                    background: '#131826',
                    border: `1px solid ${isExpanded ? phase.color : '#1f2937'}`,
                    borderLeft: `3px solid ${getTickerColor(r.ticker)}`,
                    borderRadius: 6,
                    padding: 14,
                    marginBottom: 8,
                    cursor: 'pointer',
                  }}
                >
                  {/* Row 1: ticker, phase, score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: hasData ? 8 : 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: getTickerColor(r.ticker), minWidth: 60 }}>
                      {r.ticker}
                    </div>
                    {hasData ? (
                      <>
                        <div style={{ flex: 1, fontSize: 13, color: '#e2e8f0' }}>
                          {fmtMoney(r.price)}{' '}
                          <span style={{ color: r.changePct >= 0 ? '#4ade80' : '#ef4444', fontSize: 11 }}>
                            {fmtPct(r.changePct)}
                          </span>
                        </div>
                        <PhaseBadge phase={phase} />
                        <ScoreRing score={r.putScore} color={phase.color} />
                      </>
                    ) : (
                      <div style={{ flex: 1, fontSize: 12, color: '#64748b' }}>Not yet scanned</div>
                    )}
                    <ChevronRight size={14} style={{ color: '#475569', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && hasData && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1f2937' }}>
                      <MetricsGrid r={r} />
                      {r.putCandidate && (
                        <PutCandidateCard candidate={r.putCandidate} thesis={r.putThesis} capital={capital} />
                      )}
                      {r.confidence === 'low' && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, padding: 8, background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: 4 }}>
                          <AlertCircle size={12} style={{ color: '#fbbf24', marginTop: 2, flexShrink: 0 }} />
                          <div style={{ fontSize: 10, color: '#fbbf24', lineHeight: 1.5 }}>
                            Low confidence: verify premiums in your broker before placing the trade.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && r.error && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444' }}>Scan error: {r.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* HOLD TAB */}
        {activeTab === 'hold' && (
          <div>
            {positions.length === 0 && (
              <EmptyState text="No assigned shares yet. Add positions in Setup." />
            )}
            {sortedHoldResults.map((p) => {
              const hasData = p.price != null;
              const phase = hasData ? phaseForTicker(p.ticker, p) : { name: 'HOLD', color: '#94a3b8', desc: 'Not scanned' };
              const pnl = hasData ? ((p.price - p.costBasis) * p.shares) : null;
              const pnlPct = hasData ? (((p.price - p.costBasis) / p.costBasis) * 100) : null;
              return (
                <div
                  key={p.ticker}
                  style={{
                    background: '#131826',
                    border: `1px solid #1f2937`,
                    borderLeft: `3px solid ${getTickerColor(p.ticker)}`,
                    borderRadius: 6,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: getTickerColor(p.ticker), minWidth: 60 }}>
                      {p.ticker}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {p.shares} sh @ {fmtMoney(p.costBasis)}
                    </div>
                    {hasData && (
                      <div style={{ fontSize: 12, color: pnl >= 0 ? '#4ade80' : '#ef4444' }}>
                        {fmtMoney(pnl)} ({fmtPct(pnlPct)})
                      </div>
                    )}
                    <div style={{ flex: 1 }} />
                    {hasData && <PhaseBadge phase={phase} />}
                    {hasData && <ScoreRing score={p.callScore} color={phase.color} />}
                    <button
                      onClick={() => removePosition(p.ticker)}
                      style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                      title="Remove position"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {hasData && (
                    <div style={{ paddingTop: 10, borderTop: '1px solid #1f2937' }}>
                      <MetricsGrid r={p} />
                      {p.callCandidate && (
                        <CallCandidateCard candidate={p.callCandidate} thesis={p.callThesis} costBasis={p.costBasis} shares={p.shares} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div>
            <SectionLabel>Capital allocated</SectionLabel>
            <div style={{ background: '#131826', border: '1px solid #1f2937', borderRadius: 6, padding: 14, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <DollarSign size={16} style={{ color: '#D1FF79' }} />
              <input
                type="number"
                value={capital}
                onChange={(e) => persistCapital(Number(e.target.value))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: 16,
                  fontFamily: 'inherit',
                  flex: 1,
                  outline: 'none',
                }}
              />
              <div style={{ fontSize: 11, color: '#64748b' }}>per put cycle</div>
            </div>

            <SectionLabel>Watchlist</SectionLabel>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                type="text"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTicker()}
                placeholder="Add ticker (e.g. PLTR)"
                style={{
                  flex: 1,
                  background: '#131826',
                  border: '1px solid #1f2937',
                  color: '#e2e8f0',
                  padding: '10px 12px',
                  borderRadius: 6,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={addTicker}
                style={{
                  background: '#D1FF79',
                  color: '#0a0e1a',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
              {watchlist.map((t) => (
                <div
                  key={t}
                  style={{
                    background: '#131826',
                    border: '1px solid #1f2937',
                    borderLeft: `3px solid ${getTickerColor(t)}`,
                    padding: '6px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ color: getTickerColor(t), fontWeight: 600 }}>{t}</span>
                  <button
                    onClick={() => removeTicker(t)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            <SectionLabel>Open positions (for covered calls)</SectionLabel>
            <div style={{ marginBottom: 10 }}>
              {!editingPos && (
                <button
                  onClick={() => setEditingPos(true)}
                  style={{
                    background: 'transparent',
                    color: '#D1FF79',
                    border: '1px dashed #1f2937',
                    padding: '10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Plus size={14} /> ADD POSITION
                </button>
              )}
              {editingPos && (
                <div style={{ background: '#131826', border: '1px solid #1f2937', borderRadius: 6, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, alignItems: 'center' }}>
                  <input
                    placeholder="TICKER"
                    value={posDraft.ticker}
                    onChange={(e) => setPosDraft({ ...posDraft, ticker: e.target.value })}
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="Shares"
                    value={posDraft.shares}
                    onChange={(e) => setPosDraft({ ...posDraft, shares: e.target.value })}
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="Cost basis $"
                    value={posDraft.costBasis}
                    onChange={(e) => setPosDraft({ ...posDraft, costBasis: e.target.value })}
                    style={inputStyle}
                  />
                  <button onClick={addPosition} style={{ ...inputStyle, background: '#D1FF79', color: '#0a0e1a', cursor: 'pointer', fontWeight: 600 }}>SAVE</button>
                  <button onClick={() => setEditingPos(false)} style={{ ...inputStyle, color: '#64748b', cursor: 'pointer' }}>CANCEL</button>
                </div>
              )}
            </div>
            {positions.map((p) => (
              <div key={p.ticker} style={{ background: '#131826', border: '1px solid #1f2937', borderRadius: 6, padding: 10, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: getTickerColor(p.ticker), fontWeight: 600, minWidth: 60 }}>{p.ticker}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{p.shares} sh @ {fmtMoney(p.costBasis)}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => removePosition(p.ticker)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </div>
            ))}

            <div style={{ marginTop: 24, padding: 12, background: 'rgba(209, 255, 121, 0.04)', border: '1px solid rgba(209, 255, 121, 0.15)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: 1, color: '#D1FF79', marginBottom: 6 }}>SCORING LOGIC</div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                <strong style={{ color: '#e2e8f0' }}>Put score</strong> weights: IV rank (30%), RSI oversold (25%), proximity to support (20%), annualized premium yield (25%). Trend adjusts ±10. ARMED ≥ 70, WATCH ≥ 50.
                <br /><br />
                <strong style={{ color: '#e2e8f0' }}>Call score</strong> weights: IV rank (30%), RSI overbought (25%), proximity to resistance (20%), strike above cost basis (15%), annualized yield (10%). HARVEST ≥ 65.
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, padding: 12, borderTop: '1px solid #1f2937', fontSize: 10, color: '#475569', textAlign: 'center', letterSpacing: 1 }}>
          ESTIMATES ARE DIRECTIONAL · VERIFY PREMIUMS AT YOUR BROKER · POSITION SIZE TO YOUR RULES
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  background: '#0a0e1a',
  border: '1px solid #1f2937',
  color: '#e2e8f0',
  padding: '8px 10px',
  borderRadius: 4,
  fontFamily: 'inherit',
  fontSize: 12,
  outline: 'none',
};

function PhaseBadge({ phase }) {
  return (
    <div style={{
      background: `${phase.color}15`,
      border: `1px solid ${phase.color}40`,
      color: phase.color,
      padding: '3px 8px',
      borderRadius: 3,
      fontSize: 10,
      letterSpacing: 1.5,
      fontWeight: 600,
    }}>
      {phase.name}
    </div>
  );
}

function ScoreRing({ score, color }) {
  if (score == null) return null;
  const pct = score / 100;
  const circumference = 2 * Math.PI * 16;
  return (
    <div style={{ position: 'relative', width: 40, height: 40 }}>
      <svg width="40" height="40" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r="16" fill="none" stroke="#1f2937" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 600, color,
      }}>
        {score}
      </div>
    </div>
  );
}

function MetricsGrid({ r }) {
  const cells = [
    { label: 'RSI', value: r.rsi, color: r.rsi < 30 ? '#4ade80' : r.rsi > 70 ? '#ef4444' : '#94a3b8' },
    { label: 'IV RANK', value: r.ivRankEstimate, suffix: '', color: r.ivRankEstimate > 50 ? '#D1FF79' : '#94a3b8' },
    { label: 'TREND', value: r.trend?.toUpperCase(), color: r.trend === 'uptrend' ? '#4ade80' : r.trend === 'downtrend' ? '#ef4444' : '#94a3b8' },
    { label: 'IV ENV', value: r.ivEnv?.toUpperCase(), color: ['elevated', 'high'].includes(r.ivEnv) ? '#D1FF79' : '#94a3b8' },
  ];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {cells.map((c) => (
          <div key={c.label} style={{ padding: 8, background: '#0a0e1a', borderRadius: 4 }}>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: 13, color: c.color, fontWeight: 500 }}>{c.value ?? '—'}{c.suffix}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b', marginBottom: 8 }}>
        <span>SUPPORT <span style={{ color: '#94a3b8' }}>${r.support}</span></span>
        <span>RESISTANCE <span style={{ color: '#94a3b8' }}>${r.resistance}</span></span>
        <span>52W <span style={{ color: '#94a3b8' }}>${r.wk52Low}–${r.wk52High}</span></span>
      </div>
    </>
  );
}

function PutCandidateCard({ candidate, thesis, capital }) {
  const yieldPct = ((candidate.estPremium / candidate.strike) * 100);
  const annualized = yieldPct * (365 / (candidate.dte || 30));
  const contracts = Math.floor(capital / (candidate.strike * 100));
  const totalPremium = contracts * candidate.estPremium * 100;
  return (
    <div style={{ background: '#0a0e1a', border: '1px solid #1f293720', borderLeft: '2px solid #D1FF79', padding: 10, borderRadius: 4 }}>
      <div style={{ fontSize: 10, color: '#D1FF79', letterSpacing: 1, marginBottom: 6 }}>SUGGESTED PUT · {candidate.dte}D</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, color: '#e2e8f0' }}>${candidate.strike}P</div>
        <div style={{ fontSize: 13, color: '#D1FF79' }}>${candidate.estPremium}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {yieldPct.toFixed(2)}% / {annualized.toFixed(1)}% ann
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>Δ {candidate.deltaApprox}</div>
      </div>
      {contracts > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
          ${capital.toLocaleString()} → {contracts} contract{contracts > 1 ? 's' : ''} · <span style={{ color: '#D1FF79' }}>+${totalPremium.toFixed(0)} premium</span>
        </div>
      )}
      {thesis && (
        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5, fontStyle: 'italic', borderTop: '1px solid #1f2937', paddingTop: 6, marginTop: 6 }}>
          {thesis}
        </div>
      )}
    </div>
  );
}

function CallCandidateCard({ candidate, thesis, costBasis, shares }) {
  const yieldPct = ((candidate.estPremium / costBasis) * 100);
  const annualized = yieldPct * (365 / (candidate.dte || 30));
  const contracts = Math.floor(shares / 100);
  const totalPremium = contracts * candidate.estPremium * 100;
  const aboveCost = candidate.strike > costBasis;
  return (
    <div style={{ background: '#0a0e1a', border: '1px solid #1f293720', borderLeft: `2px solid ${aboveCost ? '#D1FF79' : '#ef4444'}`, padding: 10, borderRadius: 4 }}>
      <div style={{ fontSize: 10, color: aboveCost ? '#D1FF79' : '#ef4444', letterSpacing: 1, marginBottom: 6 }}>
        SUGGESTED CALL · {candidate.dte}D {!aboveCost && '· BELOW COST'}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, color: '#e2e8f0' }}>${candidate.strike}C</div>
        <div style={{ fontSize: 13, color: '#D1FF79' }}>${candidate.estPremium}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {yieldPct.toFixed(2)}% / {annualized.toFixed(1)}% ann
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>Δ {candidate.deltaApprox}</div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        {contracts} contract{contracts !== 1 ? 's' : ''} on {shares} shares · <span style={{ color: '#D1FF79' }}>+${totalPremium.toFixed(0)}</span>
      </div>
      {thesis && (
        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5, fontStyle: 'italic', borderTop: '1px solid #1f2937', paddingTop: 6, marginTop: 6 }}>
          {thesis}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: 2, color: '#64748b', marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 12, border: '1px dashed #1f2937', borderRadius: 6 }}>
      {text}
    </div>
  );
}

export default WheelScanner;
