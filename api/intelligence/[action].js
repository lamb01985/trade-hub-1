import { AccessError, privateResponse, sendFailure, requireOperator, login, logout, jsonBody, reserve } from '../_lib/access.js'
import { loadSample } from '../_lib/reports.js'

export default async function handler(req, res) {
  privateResponse(res)
  try {
    const action = String(req.query?.action || '')
    if (action === 'session' && req.method === 'GET') {
      try { await requireOperator(req); return res.status(200).json({ authenticated: true }) }
      catch (error) { if ([401, 403].includes(error.status)) return res.status(200).json({ authenticated: false }); throw error }
    }
    if (action === 'login' && req.method === 'POST') {
      await login(req, res, jsonBody(req, 1024).password)
      return res.status(200).json({ authenticated: true })
    }
    if (action === 'logout' && req.method === 'POST') {
      await logout(req, res)
      return res.status(200).json({ authenticated: false })
    }
    if (action !== 'latest') throw new AccessError(404, 'unknown_action')
    if (req.method !== 'GET') throw new AccessError(405, 'method_not_allowed')
    const operator = await requireOperator(req)
    if (!await reserve(`th:report:reads:${operator}:${Math.floor(Date.now() / 60000)}`, 1, 30, 120)) throw new AccessError(429, 'report_rate_limited')
    return res.status(200).json(await loadSample())
  } catch (error) { sendFailure(res, error) }
}
