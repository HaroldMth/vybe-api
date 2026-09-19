process.env.NODE_ENV = 'test'
delete process.env.RATE_LIMIT_PER_MIN
delete process.env.RATE_LIMIT_HEAVY_PER_MIN

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
  await new Promise((resolve) => { server = require('../server').listen(0, '127.0.0.1', resolve) })
  api = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}/api`, validateStatus: () => true })
})

after(() => { server?.close(); mock?.server.close() })

test('no rate limiting unless env vars are set: 150 rapid requests, incl. heavy routes, all succeed', async () => {
  const codes = new Set()
  for (let i = 0; i < 150; i += 1) {
    const path = i % 2 ? '/discovery/bpm/lanes' : '/recommendations/track/100'
    const r = await api.get(path)
    codes.add(r.status)
    assert.equal(r.headers['x-ratelimit-limit'], undefined)
  }
  assert.deepEqual([...codes], [200])
})
