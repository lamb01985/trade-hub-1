import { polygonFetch, requireApiKey, validateProviderRequest } from '../_lib/polygon.js'
import { providerOperator, providerQuota } from '../_lib/providerAccess.js'
import { sendFailure } from '../_lib/access.js'

export default async function handler(req, res) {
  try {
    const operator = await providerOperator(req, res)
    const { path, ...params } = req.query || {}
    validateProviderRequest(path, params)
    requireApiKey()
    await providerQuota(operator, 'rest')
    const result = await polygonFetch(path, params)
    res.setHeader('content-type', result.contentType)
    if (result.retryAfter) res.setHeader('Retry-After', result.retryAfter)
    res.status(result.status).send(result.body)
  } catch (error) { sendFailure(res, error) }
}
