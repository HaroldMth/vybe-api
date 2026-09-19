process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_PER_MIN = '6'
process.env.RATE_LIMIT_HEAVY_PER_MIN = '3'

const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')
const { start } = require('./mock-providers')

let mock, server, api

before(async () => {
  mock = await start()
  Object.assign(process.env, {
    DEEZER_BASE: mock.base, APPLE_RSS_BASE: mock.base, WIKI_BASE: mock.base,
    AUDIODB_BASE: mock.base, MUSICBRAINZ_BASE: mock.base, LASTFM_BASE: mock.base,
  })
  const app = require('../server')
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  api = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}/api`, validateStatus: () => true })
})

after(() => { server?.close(); mock?.server.close() })

test('rate limits: heavy routes cap first (429 + Retry-After), general cap applies to the rest, health is exempt', async () => {
  const statuses = []
  for (let i = 0; i < 4; i += 1) statuses.push((await api.get('/fyp')).status)
  assert.deepEqual(statuses, [200, 200, 200, 429])

  const blocked = await api.get('/fyp')
  assert.equal(blocked.data.success, false)
  assert.ok(Number(blocked.headers['retry-after']) >= 1)

  // 5 general hits used so far (4 fyp + the blocked one); the 6th passes, the 7th is limited
  const search = []
  for (let i = 0; i < 3; i += 1) search.push((await api.get('/search/suggest?q=ab')).status)
  assert.deepEqual(search, [200, 429, 429])

  for (let i = 0; i < 12; i += 1) assert.equal((await api.get('/health')).status, 200)
})

test('rateLimit unit: allows `max` requests per window, then answers 429', async () => {
  const { rateLimit } = require('../helpers/ratelimit')
  const hits = []
  const mw = rateLimit({ name: 'unit', max: 2 })
  const res = () => ({ headers: {}, set(h, v) { Object.assign(this.headers, typeof h === 'string' ? { [h]: v } : h); return this }, status(c) { this.code = c; return this }, json(b) { this.body = b } })
  for (let i = 0; i < 3; i += 1) { const r = res(); let passed = false; mw({ ip: '1.2.3.4' }, r, () => { passed = true }); hits.push([passed, r.code]) }
  assert.deepEqual(hits, [[true, undefined], [true, undefined], [false, 429]])
})
