const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const axios = require('axios')
const { start } = require('./mock-providers')

let mock, api, httpServer

before(async () => {
  mock = await start()
  Object.assign(process.env, {
    DEEZER_BASE: mock.base,
    APPLE_RSS_BASE: mock.base,
    WIKI_BASE: mock.base,
    AUDIODB_BASE: mock.base,
    MUSICBRAINZ_BASE: mock.base,
    LASTFM_BASE: mock.base,
    DEFAULT_COUNTRY: 'us',
    HOME_SPOTLIGHT: 'africa,afro',
  })
  delete process.env.LASTFM_KEY

  const app = express()
  app.use('/api/home', require('../routes/home'))
  app.use('/api/song', require('../routes/song'))
  app.use('/api/artist', require('../routes/artist'))
  app.use('/api/album', require('../routes/album'))
  app.use('/api/recommendations', require('../routes/recommendations'))
  await new Promise((resolve) => { httpServer = app.listen(0, '127.0.0.1', resolve) })
  api = axios.create({ baseURL: `http://127.0.0.1:${httpServer.address().port}/api`, validateStatus: () => true })
})

after(() => { httpServer?.close(); mock?.server.close() })

test('deezer client retries a quota error (HTTP 200 + error code 4) and then succeeds', async () => {
  const { get } = require('../helpers/deezer')
  const res = await get('/quota-test')
  assert.deepEqual(res.data, ['ok'])
  assert.equal(mock.calls.quota, 2)
})

test('resolveTrack rejects karaoke + wrong-artist hits and returns the real track', async () => {
  const { resolveTrack } = require('../helpers/resolve')
  const t = await resolveTrack({ title: 'Blinding Lights', artist: 'The Weeknd' })
  assert.equal(t.id, '1003')
  assert.equal(await resolveTrack({ title: 'Unfindable Song', artist: 'Nobody' }), null)
})

test('home: legacy keys keep their shape, new sections are filled, playlists/editorial have images', async () => {
  const r = await api.get('/home')
  assert.equal(r.status, 200)
  const d = r.data.data
  for (const k of ['trending', 'newReleases', 'playlists', 'artists', 'genres']) assert.ok(Array.isArray(d[k]) && d[k].length, k)
  assert.equal(d.playlists[0].image[1].url, 'ppm')
  assert.equal(d.editorsPicks[0].kind, 'album')
  assert.equal(d.editorsPicks[0].image[1].url, 'pickm') // album objects rendered with cover_* art
  assert.equal(d.radios[0].name, 'Hits Radio')
  assert.ok(d.genres.every((g) => g.id !== '0'))
  // new releases = recent albums of trending artists, de-duplicated, old ones excluded
  assert.deepEqual(d.newReleases.map((a) => a.name), ['Tems Single', 'Fresh Single'])
  assert.equal(r.data.meta.newReleasesSource, 'trending-artists')
  // Apple chart hydrated to real Deezer tracks; the unmatched row is dropped, rank kept
  assert.deepEqual(d.topInCountry.songs.map((s) => [s.id, s.chartPosition]), [['1003', 1], ['301', 2]])
  assert.equal(d.topAlbumsInCountry.albums[0].name, 'Fresh Album')
  assert.equal(d.spotlight[0].genre.name, 'Africa')
  assert.equal(d.spotlight[0].songs[0].name, 'Afro Hit')
})

test('home: a failing provider (Apple returns 500 for GB) drops only that section', async () => {
  const r = await api.get('/home?country=gb')
  assert.equal(r.status, 200)
  assert.ok(r.data.data.trending.length)
  assert.deepEqual(r.data.data.topInCountry.songs, [])
  assert.ok(r.data.meta.failed.some((f) => f.section.startsWith('topInCountry')))
})

test('song info: enriched fields present', async () => {
  const r = await api.get('/song/100')
  const d = r.data.data
  assert.equal(d.isrc, 'GBAYE0000567')
  assert.equal(d.bpm, 173)
  assert.deepEqual(d.genres, ['Rock'])
  assert.equal(d.label, 'Parlophone')
  assert.equal(d.contributors[0].role, 'Main')
  assert.equal(d.previewUrl, 'https://p/100.mp3')
  assert.equal((await api.get('/song/abc')).status, 400)
})

test('related tracks: no seed, no dupes, no karaoke, per-artist cap, multi-source agreement ranks first', async () => {
  const r = await api.get('/song/100/related?limit=20')
  const songs = r.data.data.songs
  const ids = songs.map((s) => s.id)
  assert.ok(!ids.includes('100'), 'seed excluded')
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids')
  assert.ok(songs.every((s) => !/karaoke/i.test(s.name)), 'variants filtered')
  const perArtist = songs.reduce((m, s) => ({ ...m, [s.artists.primary[0].name]: (m[s.artists.primary[0].name] || 0) + 1 }), {})
  assert.ok(perArtist.Keane <= 3 && (perArtist.Coldplay || 0) <= 2, JSON.stringify(perArtist))
  assert.equal(songs[0].id, '201') // Keane track appears via relatedArtists AND radio
  assert.deepEqual(songs[0].relatedVia.sort(), ['radio', 'relatedArtists'])
  assert.ok(r.data.data.sources.radio >= 1)
})

test('related (legacy name-based route) works without a Last.fm key', async () => {
  const r = await api.get('/recommendations/track?artist=Coldplay&track=Yellow')
  assert.equal(r.data.data.source, 'recommendations')
  assert.ok(r.data.data.songs.length > 3)
  assert.equal((await api.get('/recommendations/track')).status, 400)
})

test('related artists + tag fallback', async () => {
  const a = await api.get('/recommendations/artist/1')
  assert.deepEqual(a.data.data.artists.map((x) => x.name), ['Keane', 'Tems'])
  const t = await api.get('/recommendations/tag/chill')
  assert.equal(t.data.data.source, 'deezer-playlists')
  assert.equal(t.data.data.songs[0].name, 'Playlist Song')
})

test('artist: validated Wikipedia bio wins; decoy pages are rejected; AudioDB is the fallback', async () => {
  const r = await api.get('/artist/1')
  const d = r.data.data
  assert.equal(d.info.bioSource, 'wikipedia')
  assert.match(d.info.bio, /British rock band/)
  assert.equal(d.info.links.wikipedia, 'https://en.wikipedia.org/wiki/Coldplay')
  assert.equal(d.info.countryCode, 'GB')
  assert.equal(d.songs.length, 4)
  assert.deepEqual(d.albums.map((a) => a.name), ['Fresh Single', 'Old One']) // newest first
  assert.equal(d.discography.singles.length, 1)
  assert.deepEqual(d.related.map((x) => x.name), ['Keane', 'Tems'])

  const k = await api.get('/artist/2') // Wikipedia only has a surname page for "Keane"
  assert.equal(k.data.data.info.bioSource, 'theaudiodb')
  assert.equal(k.data.data.info.images.banner, 'https://a/banner.jpg')
})

test('artist: a required Deezer failure is a clean 4xx/5xx, optional failures are not', async () => {
  const r = await api.get('/artist/99999') // mock 404s the artist itself
  assert.ok(r.status >= 400)
  assert.equal(r.data.success, false)
})

test('album: Deezer fields + Wikipedia description', async () => {
  const r = await api.get('/album/500')
  const d = r.data.data
  assert.equal(d.label, 'Parlophone')
  assert.deepEqual(d.genres, ['Rock'])
  assert.equal(d.descriptionSource, 'wikipedia')
  assert.equal(d.songs.length, 1)
  assert.equal(d.songs[0].artists.primary[0].name, 'Coldplay')
})

test('lastfm.cleanBio strips the "Read more" link and its text', () => {
  const { cleanBio } = require('../helpers/providers/lastfm')
  assert.equal(cleanBio('Nice band. <a href="https://x">Read more on Last.fm</a>'), 'Nice band.')
})
