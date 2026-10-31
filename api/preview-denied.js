import { privateResponse } from './_lib/access.js'
export default function handler(req, res) {
  privateResponse(res)
  return res.status(404).json({ error: 'PREVIEW_RESOURCE_UNAVAILABLE' })
}
