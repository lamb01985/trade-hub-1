// /api/schwab/sync
//
//   POST  body: { from, to }      Trigger a Schwab sync over the date range.
//                                 Pulls fills via the schwab adapter, merges
//                                 idempotently into stored fills, re-runs the
//                                 aggregator, persists the new trades and a
//                                 sync summary. Returns the summary.
//
//   GET                           Returns the stored Trade[] for the caller
//                                 plus the last sync meta. No Schwab call,
//                                 cheap to hit from the Journal UI on mount.
//
// Auth: either a Schwab session cookie (browser, manual button) or a
// CRON_SECRET bearer header (Vercel cron). resolveSyncCaller handles both
// and picks the operator session id automatically for the cron path.
//
// Adapter status: the Schwab adapter scaffold throws on call until a real
// sample response is reviewed. This endpoint catches that and records the
// failure into KV so the UI can surface "adapter not configured yet" instead
// of silently returning empty. Once the adapter is implemented in Phase 2,
// the body of runSchwabSync below switches from throwing to actually pulling
// transactions.

import { getSessionId, sendError, schwabFetch, getAccountHandle } from '../_lib/schwab.js'
import {
  resolveSyncCaller,
  ensureOperatorTokens,
  loadStoredFills,
  loadStoredTrades,
  persistSyncResult,
  recordSyncError,
  loadSyncMeta,
} from '../_lib/tradeSync.js'
import { applySyncBatch } from '../../src/lib/tradeSyncCore.js'
import { normalizeSchwabBatch } from '../../src/lib/tradeAggregator/adapters/schwab.js'

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'object') return req.body
  try { return JSON.parse(req.body) } catch { return {} }
}

// Adapter call boundary. Wraps the Schwab transactions fetch and the adapter
// normalization in one place so the swap from "throws" to "real implementation"
// happens here in Phase 2 without touching the orchestration above.
async function fetchAndNormalizeFills(sessionId, { from, to }) {
  const accountHash = await getAccountHandle(sessionId)
  // Phase 2 will populate the path + query. Documenting both candidate
  // endpoints inline so the sample-review can pick one cleanly.
  // const path = `/trader/v1/accounts/${accountHash}/transactions`
  // const query = { types: 'TRADE', startDate: from, endDate: to }
  // const raw = await schwabFetch(sessionId, path, { query })
  const raw = { _placeholder: true, accountHash, from, to }
  return normalizeSchwabBatch(raw)
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { sessionId } = resolveSyncCaller(req, getSessionId)
      const [trades, meta] = await Promise.all([
        loadStoredTrades(sessionId),
        loadSyncMeta(sessionId),
      ])
      res.status(200).json({ trades, meta })
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const { sessionId, caller } = resolveSyncCaller(req, getSessionId)
    const { from, to } = parseBody(req)

    // Hard fail if the refresh token is dead. ensureOperatorTokens throws
    // with a stable .code when Schwab needs re-auth; we let that bubble so
    // the cron logs surface it instead of silently storing empty trades.
    await ensureOperatorTokens(sessionId)

    let incomingFills
    try {
      incomingFills = await fetchAndNormalizeFills(sessionId, { from, to })
    } catch (adapterErr) {
      // Adapter is still a scaffold. Record the failure into KV meta so the
      // UI can render "Adapter pending sample review" without guessing.
      const at = await recordSyncError(sessionId, adapterErr)
      res.status(503).json({
        error: 'adapter_not_configured',
        message: adapterErr?.message,
        meta: at,
        caller,
      })
      return
    }

    const existingFills = await loadStoredFills(sessionId)
    const result = applySyncBatch(existingFills, incomingFills)
    const { at } = await persistSyncResult(sessionId, result)
    res.status(200).json({ ok: true, caller, syncedAt: at, summary: result.summary })
  } catch (err) {
    sendError(res, err)
  }
}
