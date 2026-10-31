import { AccessError, privateResponse, requireOperator, reserve } from './access.js'

export async function providerOperator(req, res, method = 'GET') {
  privateResponse(res)
  if (req.method !== method) throw new AccessError(405, 'method_not_allowed')
  return requireOperator(req)
}
export async function providerQuota(operator, channel) {
  const minute = Math.floor(Date.now() / 60000)
  if (!await reserve(`th:provider:${channel}:${operator}:${minute}`, 1, channel === 'rest' ? 1200 : 10, 120)) {
    throw new AccessError(429, 'rate_limited')
  }
}
