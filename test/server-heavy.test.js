process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_PER_MIN = '100'
process.env.RATE_LIMIT_HEAVY_PER_MIN = '2'

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

test('heavy limiter covers recommendations, related, bpm and radar (one shared budget); cheap routes are untouched', async () => {
  assert.equal((await api.get('/recommendations/track/100')).status, 200)
  assert.equal((await api.get('/song/100/related')).status, 200)
  assert.equal((await api.get('/discovery/bpm?lane=running')).status, 429) // budget of 2 already spent

  assert.equal((await api.get('/radar?artists=1')).status, 429)
  assert.equal((await api.get('/recommendations/artist/1')).status, 429)

  // not heavy
  assert.equal((await api.get('/song/100')).status, 200)
  assert.equal((await api.get('/discovery')).status, 200)
  assert.equal((await api.get('/album/500')).status, 200)
})
