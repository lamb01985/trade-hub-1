// ─────────────────────────────────────────────────────────────────────────────
// Bot.jsx — thin composer for the coach.
//
// Drives the new useBot hook. No state of its own. Lays out the right-now hero
// card, today's chronological strip, the patterns panel, and the settings
// drawer. Header pulls live session stats from the hook's `patterns.today`.
// ─────────────────────────────────────────────────────────────────────────────

import { useBot } from '../hooks/useBot.js'
import { LIME, RED, YELLOW, BLUE, PANEL, BORDER, MONO, SANS, fmtD } from '../constants.js'
import BotRightNowCard from './BotRightNowCard.jsx'
import BotTodayPanel from './BotTodayPanel.jsx'
import BotPatternsPanel from './BotPatternsPanel.jsx'
import BotSettingsDrawer from './BotSettingsDrawer.jsx'

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
  livePrice = null,
  intradayBars = [],
  levelMap = null,
  mtfAlignment = null,
  prevDay = null,
  rvol = null,
  checklistComplete = false,
  onPaperTrade = null,
}) {
  const bot = useBot({
    activeTicker,
    livePrice,
    intradayBars,
    levelMap,
    mtfAlignment,
    prevDay,
    rvol,
    checklistComplete,
    onPaperTrade,
  })

  const { currentCard, todaysSetups, patterns, state } = bot
  const stateColor = STATE_COLOR[currentCard?.state] || DIM
  const stateLabel = STATE_LABEL[currentCard?.state] || 'Waiting'
  const today = patterns?.today || { taken: 0, wins: 0, losses: 0, realizedPL: 0, skipped: 0, expired: 0 }
  const realizedPL = state?.realizedPL ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <StateChip label={stateLabel} color={stateColor} />
          <span style={{ fontSize: 11, color: DIM, fontFamily: MONO, letterSpacing: '0.14em' }}>
            {activeTicker} {livePrice != null ? <span style={{ color: FG, fontWeight: 800 }}>${Number(livePrice).toFixed(2)}</span> : <span style={{ color: MUTED }}>no live data</span>}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <HeaderStat label="Taken" value={today.taken} />
          <HeaderStat label="Wins" value={today.wins} color={LIME} />
          <HeaderStat label="Losses" value={today.losses} color={RED} />
          <HeaderStat label="Skipped" value={(today.skipped || 0) + (today.expired || 0)} color={YELLOW} />
          <HeaderStat label="Realized" value={fmtD(realizedPL)} color={realizedPL >= 0 ? LIME : RED} />
        </div>
      </div>

      {/* Hero card */}
      <BotRightNowCard
        currentCard={currentCard}
        realizedPL={realizedPL}
        onTakeIt={bot.onTakeIt}
        onSkipIt={bot.onSkipIt}
        onCloseManually={bot.onCloseManually}
        onDismissClosed={bot.onDismissClosed}
        onUnlock={bot.onUnlock}
      />

      {/* Today strip */}
      <BotTodayPanel setups={todaysSetups} />

      {/* Patterns */}
      <BotPatternsPanel patterns={patterns} />

      {/* Settings */}
      <BotSettingsDrawer
        settings={state?.settings}
        onUpdateSettings={bot.onUpdateSettings}
        onResetSession={bot.onResetSession}
      />
    </div>
  )
}
