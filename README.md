# Trade Hub

Personal options trading platform for QQQ/TQQQ 0DTE intraday trading.

Built with React + Vite. Live market data from [Massive.com](https://massive.com) (formerly Polygon.io).

## Features

- **Levels Intelligence**: Real-time price ladder with VWAP, floor pivots, Fibonacci, prev day H/L/C, weekly levels, opening range, supply/demand zones, and confluence detection
- **Live Data**: WebSocket streaming for sub-second price updates, REST fallback for resilience
- **IV Analyzer**: Black-Scholes pricing engine with live options chain from Massive API
- **ORB Calculator**: Opening range breakout levels, entry/stop/target, live price ladder
- **R:R Calculator**: Options-first P&L math (entry/stop/target = contract premium, not underlying)
- **Checklist**: 12-rule pre-trade discipline gate
- **Journal**: Trade logging with P&L math, outcome tracking
- **Stats**: Win rate, expectancy, equity curve
- **Command**: Session clock, daily loss limit, risk controls

## Setup

1. Clone this repo
2. `npm install`
3. `npm run dev`
4. Add your Massive API key in the Command tab

## Deployment

Connected to Vercel. Pushes to `main` auto-deploy.

## Data Source

Massive API (massive.com) — Options Advanced plan required for live options chain data.
WebSocket endpoint: `wss://socket.polygon.io/stocks`

## Notes

- All times displayed in Central Time (CT)
- Entry/stop/target = option contract premium, not underlying price
- Minimum 2:1 R:R on contract premium enforced in Calculator
- Daily loss limit locks the platform when hit
