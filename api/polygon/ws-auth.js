// Retired: never return provider credentials, including to authenticated users.
import { providerOperator } from '../_lib/providerAccess.js'
import { sendFailure } from '../_lib/access.js'
export default async function handler(req, res) {
  try {
    await providerOperator(req, res)
    return res.status(410).json({ error: 'STREAMING_CREDENTIAL_DELIVERY_RETIRED', transport: 'REST_POLL' })
  } catch (error) { sendFailure(res, error) }
}
