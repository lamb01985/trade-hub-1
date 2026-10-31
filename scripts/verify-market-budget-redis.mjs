// Isolated real-Redis proof. Never point this at a hosted or production store.
import net from 'node:net'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createMarketDataBudget, ADMISSION_LUA } from '../api/_lib/marketDataBudget.js'

const port = Number(process.env.TEST_REDIS_PORT || 56379)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid test port')
function command(...args) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let buffer = Buffer.alloc(0)
    const parse = offset => {
      const end = buffer.indexOf('\r\n', offset)
      if (end < 0) return null
      const type = String.fromCharCode(buffer[offset]), raw = buffer.toString('utf8', offset + 1, end)
      let cursor = end + 2
      if (type === '-') throw new Error(raw)
      if (type === '+' || type === ':') return [type === ':' ? Number(raw) : raw, cursor]
      const length = Number(raw)
      if (length === -1) return [null, cursor]
      if (type === '$') return buffer.length < cursor + length + 2 ? null : [buffer.toString('utf8', cursor, cursor + length), cursor + length + 2]
      if (type === '*') {
        const values = []
        for (let i = 0; i < length; i++) { const item = parse(cursor); if (!item) return null; values.push(item[0]); cursor = item[1] }
        return [values, cursor]
      }
      throw new Error('Unexpected Redis response')
    }
    socket.setTimeout(5000, () => socket.destroy(new Error('Redis test timed out')))
    socket.on('error', reject)
    socket.on('connect', () => socket.write(`*${args.length}\r\n` + args.map(value => { const text = String(value); return `$${Buffer.byteLength(text)}\r\n${text}\r\n` }).join('')))
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      try { const result = parse(0); if (result) { socket.end(); resolve(result[0]) } } catch (error) { socket.destroy(); reject(error) }
    })
  })
}
const pythonPath = process.env.TEST_PYTHON_ADMISSION_LUA || new URL('../../trade-decision-engine/app/market_data/admission.lua', import.meta.url)
assert.equal(ADMISSION_LUA, readFileSync(pythonPath, 'utf8'), 'Node/Python must run identical Lua')
const scope = `isolated_test_${randomUUID().replaceAll('-', '')}`
const base = `md:{${scope}}:`
const keys = ['policy', 'attempts', 'new_attempts', 'leases'].map(key => base + key)
const env = { MASSIVE_ACCOUNT_BUDGET_SCOPE: scope, MASSIVE_REQUESTS_PER_MINUTE: '8', MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE: '2' }
const client = { eval: (script, names, args) => command('EVAL', script, names.length, ...names, ...args), zrem: (key, id) => command('ZREM', key, id) }
const budgets = ['local', 'staging', 'production'].map(profile => createMarketDataBudget({ ...env, MARKET_DATA_DEPLOYMENT_PROFILE: profile }, client))
try {
  await command('HSET', keys[0], 'N', 8, 'R', 2, 'policy_version', 'market-data-budget-v1')
  const attempts = Array.from({ length: 100 }, (_, i) => ({ id: randomUUID(), role: i % 3 ? 'new' : 'legacy', budget: budgets[i % 3] }))
  const results = await Promise.all(attempts.map(async item => ({ ...item, result: await item.budget.admit(scope, item.id, item.role, item.role === 'new' ? 10000 : 20000) })))
  const granted = results.filter(item => item.result.granted)
  assert.equal(granted.length, 4, '100 simultaneous callers cannot exceed four leases')
  assert.equal(await command('ZCARD', keys[1]), 4)
  assert.equal(await command('ZCARD', keys[3]), 4)
  const duplicate = await budgets[0].admit(scope, granted[0].id, granted[0].role, granted[0].role === 'new' ? 10000 : 20000)
  assert.equal(duplicate.reason, 'DUPLICATE_ATTEMPT')
  for (const item of granted) await item.budget.release(scope, item.id)
  assert.equal(await command('ZCARD', keys[1]), 4, 'releasing concurrency must not refund requests')
  for (let i = 0; i < 20; i++) {
    const role = i % 2 ? 'new' : 'legacy'
    const result = await budgets[i % 3].admit(scope, randomUUID(), role, role === 'new' ? 10000 : 20000)
    if (result.granted) await budgets[i % 3].release(scope, result.lease_id)
  }
  assert.equal(await command('ZCARD', keys[1]), 8, 'combined account budget must remain N')
  assert.ok(await command('ZCARD', keys[2]) <= 6, 'new role cannot consume legacy reserve')
  const mismatch = createMarketDataBudget({ ...env, MASSIVE_REQUESTS_PER_MINUTE: '9' }, client)
  assert.equal((await mismatch.admit(scope, randomUUID(), 'new', 10000)).reason, 'POLICY_MISMATCH')
  await command('DEL', keys[1], keys[2], keys[3])
  const time = await command('TIME'), now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000)
  for (let i = 0; i < 4; i++) await command('ZADD', keys[3], now - 1, randomUUID())
  await command('ZADD', keys[1], now - 60001, randomUUID())
  assert.equal((await budgets[0].admit(scope, randomUUID(), 'new', 10000)).granted, true, 'expired attempts and crash leases are recovered')
  console.log('PASS: identical Node/Python Lua; 100 concurrent mixed-environment callers; four leases; account/new limits; no refunds; duplicate IDs; policy mismatch; expired leases/attempts.')
} finally { await command('DEL', ...keys) }
