// Isolated launcher; only this process uses the repair flag, port and cookie.
process.env.TRADEHUB_LEVEL_REPAIR='true'
await import('./live-desk.mjs')
