import { readFile, stat } from 'node:fs/promises'
import { adaptPythonReport } from '../../src/lib/reportContract.js'
import { AccessError } from './access.js'

const MAX_REPORT_BYTES = 8 * 1024 * 1024
export async function loadSample() {
  const path = process.env.TRADEHUB_REPORT_FILE
  if (!path) throw new AccessError(503, 'report_store_unconfigured')
  try {
    if ((await stat(path)).size > MAX_REPORT_BYTES) throw new Error('oversized')
    const raw = JSON.parse(await readFile(path, 'utf8'))
    if (raw.report_date !== '2026-10-26') throw new Error('wrong sample')
    return adaptPythonReport(raw)
  } catch { throw new AccessError(503, 'report_unavailable') }
}
