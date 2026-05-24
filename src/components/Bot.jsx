// ─────────────────────────────────────────────────────────────────────────────
// Bot.jsx — multi-ticker coach composer.
//
// Drives the multi-ticker useBot hook. Lays out the header (with watchlist
// status counts), the right-now hero card for the primary ticker, the today's
// strip, the patterns panel, and the settings drawer.
//
// Sub-phase 2c only wires the engine to the watchlist. The watchlist editor
// chips + "Also live" pending queue land in sub-phases 3 and 4.
// ─────────────────────────────────────────────────────────────────────────────

import { useBot } from '../hooks/useBot.js'
import { LIME, RED, YELLOW, BLUE, PANEL, BORDER, MONO, SANS, fmtD } from '../constants.js'
import BotRightNowCard from './BotRightNowCard.jsx'
import BotTodayPanel from './BotTodayPanel.jsx'
import BotPatternsPanel from './BotPatternsPanel.jsx'
import BotSettingsDrawer from './BotSettingsDrawer.jsx'
import BotWatchlistChips from './BotWatchlistChips.jsx'
import BotPendingPanel from './BotPendingPanel.jsx'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

function StateChip({ label, color }) {
  return (
    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 3, border: `1px solid ${color}55`, color, fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', fontWeight: 800, textTransform: 'uppercase' }}>
      {label}
    </span>
  )
}

function HeaderStat({ label, value, color = FG }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 14, color, fontFamily: MONO, fontWeight: 800 }}>{value}</span>
    </div>
  )
}

const STATE_COLOR = {
  WAIT:     DIM,
  WATCH:    YELLOW,
  GO:       LIME,
  IN_TRADE: BLUE,
  CLOSED:   '#aaa',
  LOCKED:   RED,
}

const STATE_LABEL = {
  WAIT:     'Waiting',
  WATCH:    'Watching',
  GO:       'GO',
  IN_TRADE: 'In trade',
  CLOSED:   'Just closed',
  LOCKED:   'Locked',
}

export default function Bot({
  activeTicker = 'QQQ',
  checklistComplete = false,
  onPaperTrade = null,
  watchlist = [],
  onWatchlistChange = null,
  liveDataMulti = {},
}) {
  const bot = useBot({
    watchlist,
    liveDataMulti,
    activeTicker,
    checklistComplete,
    onPaperTrade,
  })

  const { currentCard, pendingCards, tickerChips, todaysSetups, patterns, realizedPL, primaryTicker } = bot
  const stateColor = STATE_COLOR[currentCard?.state] || DIM
  const stateLabel = STATE_LABEL[currentCard?.state] || 'Waiting'
  const today = patterns?.today || { taken: 0, wins: 0, losses: 0, realizedPL: 0, skipped: 0, expired: 0 }

  // Pre-bind the primary ticker into the user-action handlers so the existing
  // BotRightNowCard interface (no ticker arg) keeps working.
  const onTakeIt = (opts) => bot.onTakeIt(currentCard?.ticker, opts)
  const onSkipIt = () => bot.onSkipIt(currentCard?.ticker)
  const onCloseManually = (premium) => bot.onCloseManually(currentCard?.ticker, premium)
  const onDismissClosed = () => bot.onDismissClosed(currentCard?.ticker)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <StateChip label={stateLabel} color={stateColor} />
          <span style={{ fontSize: 11, color: DIM, fontFamily: MONO, letterSpacing: '0.14em' }}>
            {primaryTicker || activeTicker} {currentCard?.position?.entryUnderlying != null
              ? <span style={{ color: FG, fontWeight: 800 }}>${Number(currentCard.position.currentUnderlying ?? currentCard.position.entryUnderlying).toFixed(2)}</span>
              : (tickerChips.find(c => c.ticker === (primaryTicker || activeTicker))?.price != null
                ? <span style={{ color: FG, fontWeight: 800 }}>${Number(tickerChips.find(c => c.ticker === (primaryTicker || activeTicker)).price).toFixed(2)}</span>
                : <span style={{ color: MUTED }}>no live data</span>)}
          </span>
          <span style={{ fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Watchlist: {tickerChips.length}
          </span>
          {import.meta.env.DEV && (
            <button
              onClick={() => bot.onDevTriggerTestSetup()}
              title="Dev only. Injects a synthetic GO signal on the primary ticker."
              style={{
                background: 'transparent',
                color: '#C084FC',
                border: '1px solid #C084FC55',
                borderRadius: 3,
                padding: '5px 10px',
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >Dev: trigger GO</button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <HeaderStat label="Taken" value={today.taken} />
          <HeaderStat label="Wins" value={today.wins} color={LIME} />
          <HeaderStat label="Losses" value={today.losses} color={RED} />
          <HeaderStat label="Skipped" value={(today.skipped || 0) + (today.expired || 0)} color={YELLOW} />
          <HeaderStat label="Realized" value={fmtD(realizedPL)} color={realizedPL >= 0 ? LIME : RED} />
        </div>
      </div>

      {/* Watchlist chip editor */}
      <BotWatchlistChips
        chips={tickerChips}
        liveDataMulti={liveDataMulti}
        watchlist={watchlist}
        onWatchlistChange={onWatchlistChange}
        locked={!!bot.state?.lockedAt}
      />

      {/* Hero card for the primary ticker */}
      <BotRightNowCard
        currentCard={currentCard}
        realizedPL={realizedPL}
        onTakeIt={onTakeIt}
        onSkipIt={onSkipIt}
        onCloseManually={onCloseManually}
        onDismissClosed={onDismissClosed}
        onUnlock={bot.onUnlock}
        perTickerBreakdown={patterns?.perTicker || []}
      />

      {/* Also-live pending setups from non-primary tickers */}
      <BotPendingPanel
        pendingCards={pendingCards}
        onTakeIt={bot.onTakeIt}
        onSkipIt={bot.onSkipIt}
      />

      {/* Today strip, flat list across all tickers */}
      <BotTodayPanel setups={todaysSetups} />

      {/* Patterns */}
      <BotPatternsPanel patterns={patterns} />

      {/* Settings */}
      <BotSettingsDrawer
        settings={bot.state?.settings}
        onUpdateSettings={bot.onUpdateSettings}
        onResetSession={bot.onResetSession}
      />
    </div>
  )
}
