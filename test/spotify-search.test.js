const path = require('path')
const fs = require('fs')
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')
const { start } = require('./mock-providers')

let mock
let mbCalls = 0
let mbMode = '404'
let giftedResults = null
const realGet = axios.get

before(async () => {
  mock = await start()
  process.env.DEEZER_BASE = mock.base
  process.env.GIFTED_SPOTIFY_SEARCH = 'http://gifted.test/search'
  // Intercept the two outside services the Spotify helper calls with the static axios.get
  axios.get = async (url, cfg) => {
    if (String(url).includes('musicbrainz')) {
      mbCalls += 1
      throw Object.assign(new Error('Not Found'), { response: { status: 404 } })
    }
    if (String(url).includes('gifted')) {
      if (!giftedResults) throw new Error('gifted not mocked')
      return { data: { success: true, results: giftedResults } }
    }
    return realGet.call(axios, url, cfg)
  }
})

after(() => {
  axios.get = realGet
  mock?.server.close()
  // remove the fake ISRC entries this test wrote to the on-disk MusicBrainz cache
  const file = path.join(__dirname, '..', '.cache', 'isrc-spotify.json')
  try {
    const cache = JSON.parse(fs.readFileSync(file, 'utf8'))
    Object.keys(cache).filter((k) => k.startsWith('TEST')).forEach((k) => delete cache[k])
    fs.writeFileSync(file, JSON.stringify(cache, null, 2))
  } catch {}
})

beforeEach(() => {
  require('../helpers/memo').clear()
  require('../helpers/searchtify')._reset()
  mbCalls = 0
  giftedResults = null
})

const item = (id, name, artists, ms) => ({
  item: { data: {
    id, uri: `spotify:track:${id}`, name,
    artists: { items: artists.map((n) => ({ profile: { name: n } })) },
    duration: { totalMilliseconds: ms },
    albumOfTrack: { name: 'Album', coverArt: { sources: [{ url: 'small', width: 64 }, { url: 'big', width: 640 }] } },
    contentRating: { label: 'NONE' }, playability: { playable: true },
  } },
})
const fake = (fn) => ({ calls: [], async search(q) { this.calls.push(q); return fn(q) } })
const found = (...items) => ({ tracksV2: { items } })
// hints the app sends with a stream request (title, artist, duration, deezerId)
const YELLOW = { title: 'Yellow', artist: 'Coldplay', durationSec: 200, deezerId: 100 }

test('searchtify adapter: maps to the candidate shape, caches results, never caches an empty answer', async () => {
  const st = require('../helpers/searchtify')
  const client = fake(() => found(item('ID1', 'Yellow', ['Coldplay', 'Someone'], 200000), { item: { data: { uri: 'spotify:episode:x', name: 'nope' } } }))
  st._setClient(client)

  const [c] = await st.searchTracks('Coldplay Yellow')
  assert.deepEqual(
    { title: c.title, artist: c.artist, duration: c.duration, durationSec: c.durationSec, thumbnail: c.thumbnail, url: c.url },
    { title: 'Yellow', artist: 'Coldplay & Someone', duration: '3:20', durationSec: 200, thumbnail: 'big', url: 'https://open.spotify.com/track/ID1' }
  )
  assert.equal((await st.searchTracks('Coldplay Yellow')).length, 1)
  assert.equal(client.calls.length, 1, 'second call served from cache; non-track rows dropped')

  const empty = fake(() => found())
  st._setClient(empty)
  await st.searchTracks('nothing here'); await st.searchTracks('nothing here')
  assert.equal(empty.calls.length, 2, 'empty results are not cached')
})

test('searchtify adapter: circuit breaker opens after 3 failures in a row and stops calling the client', async () => {
  const st = require('../helpers/searchtify')
  const broken = fake(() => { throw new Error('secrets scrape failed') })
  st._setClient(broken)
  for (const q of ['a1', 'a2', 'a3']) await assert.rejects(st.searchTracks(q), /secrets scrape failed/)
  await assert.rejects(st.searchTracks('a4'), /paused/)
  assert.equal(broken.calls.length, 3)
})

test('stream helper fast path: one confident searchtify hit, no MusicBrainz call, no extra searches', async () => {
  const st = require('../helpers/searchtify')
  const client = fake(() => found(item('ID1', 'Yellow', ['Coldplay'], 200000)))
  st._setClient(client)
  const { findSpotifyCandidates } = require('../helpers/spotify')

  const { ranked } = await findSpotifyCandidates('Coldplay Yellow', YELLOW)
  assert.equal(ranked[0].spotifyUrl, 'https://open.spotify.com/track/ID1')
  assert.deepEqual(client.calls, ['Coldplay Yellow'])
  assert.equal(mbCalls, 0)
})

test('stream helper: "(feat. ...)" is dropped from the first query only', async () => {
  const st = require('../helpers/searchtify')
  const client = fake(() => found(item('V1', 'Van Dale (feat. Philly & MocroManiac)', ['Woody'], 200000)))
  st._setClient(client)
  const { findSpotifyCandidates } = require('../helpers/spotify')

  const { ranked } = await findSpotifyCandidates('Woody Van Dale', { title: 'Van Dale (feat. Philly & MocroManiac)', artist: 'Woody', durationSec: 200, deezerId: 78 })
  assert.equal(client.calls[0], 'Woody Van Dale')
  assert.equal(ranked[0].spotifyUrl, 'https://open.spotify.com/track/V1')
})

test('stream helper: unsure match -> MusicBrainz asked once (a 404 is final, not retried) -> other query variants tried', async () => {
  const st = require('../helpers/searchtify')
  const client = fake(() => found(item('COV1', 'Yellow', ['Some Cover Band'], 200000)))
  st._setClient(client)
  const { findSpotifyCandidates } = require('../helpers/spotify')

  const { ranked } = await findSpotifyCandidates('yellow by coldplay', { ...YELLOW, deezerId: 77 })
  assert.ok(ranked.length >= 1)
  assert.equal(mbCalls, 1, 'one MusicBrainz call, no retry on 404')
  assert.deepEqual(client.calls, ['Coldplay Yellow', 'Yellow Coldplay', 'yellow by coldplay'])

  await findSpotifyCandidates('yellow by coldplay', { ...YELLOW, deezerId: 77 })
  assert.equal(mbCalls, 1, 'the 404 answer is cached')
})

test('stream helper: searchtify down -> Gifted API fallback still finds the track', async () => {
  const st = require('../helpers/searchtify')
  const client = fake(() => { throw new Error('blocked') })
  st._setClient(client)
  giftedResults = [{ title: 'Yellow', artist: 'Coldplay', duration: '3:20', thumbnail: 't', url: 'https://open.spotify.com/track/GIFT1' }]
  const { findSpotifyCandidates } = require('../helpers/spotify')

  const { ranked } = await findSpotifyCandidates('Coldplay Yellow', YELLOW)
  assert.equal(client.calls.length, 1)
  assert.equal(ranked[0].spotifyUrl, 'https://open.spotify.com/track/GIFT1')
  assert.equal(mbCalls, 0)
})
