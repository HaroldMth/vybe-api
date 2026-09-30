process.env.NODE_ENV = 'test'

const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')
const memo = require('../helpers/memo')
const { findOfficialVideo, searchVideos, detectYoutubeUrl } = require('../helpers/videos')

const yt = (id, title, channel, durationFormatted) => ({
  id, title, durationFormatted, channel: { name: channel }, thumbnail: { url: `https://i.ytimg.com/vi/${id}/hq.jpg` },
})

const YELLOW_RESULTS = [
  yt('aaaaaaaaaaa', 'Yellow (Live in Sydney) - Coldplay', 'Coldplay Fans', '5:40'),
  yt('bbbbbbbbbbb', 'Coldplay - Yellow (Lyric Video)', 'Random Uploads', '4:30'),
  yt('ccccccccccc', 'Coldplay - Yellow (Official Video)', 'Coldplay', '4:29'),
  yt('ddddddddddd', 'Yellow (Piano Cover)', 'PianoGuy', '4:10'),
  { id: 'short', title: 'bad id', channel: { name: 'x' } },
]
const fakeSearch = (results) => async () => results

before(() => memo.clear())

test('findOfficialVideo picks the official upload over live/lyric/cover results', async () => {
  const video = await findOfficialVideo(
    { title: 'Yellow', artist: 'Coldplay', durationSec: 269 },
    { search: fakeSearch(YELLOW_RESULTS) }
  )
  assert.equal(video.videoId, 'ccccccccccc')
  assert.equal(video.embedUrl, 'https://www.youtube-nocookie.com/embed/ccccccccccc')
  assert.equal(video.watchUrl, 'https://www.youtube.com/watch?v=ccccccccccc')
  assert.ok(video.matchScore > 0)
  assert.equal(video._ranked, undefined)
})

test('findOfficialVideo accepts a single "Artist - Title" query', async () => {
  memo.clear()
  const video = await findOfficialVideo({ query: 'Coldplay - Yellow' }, { search: fakeSearch(YELLOW_RESULTS) })
  assert.equal(video.videoId, 'ccccccccccc')
})

test('findOfficialVideo returns null instead of guessing the wrong song', async () => {
  memo.clear()
  const other = [yt('eeeeeeeeeee', 'Totally Different Song (Official Video)', 'Someone Else', '3:00')]
  const video = await findOfficialVideo({ title: 'Yellow', artist: 'Coldplay', durationSec: 269 }, { search: fakeSearch(other) })
  assert.equal(video, null)
})

test('findOfficialVideo rejects when there is no title', async () => {
  await assert.rejects(findOfficialVideo({}, { search: fakeSearch([]) }), /title/)
})

test('searchVideos drops entries without a valid video id and maps embed urls', async () => {
  memo.clear()
  const list = await searchVideos('coldplay', { search: fakeSearch(YELLOW_RESULTS) })
  assert.equal(list.length, 4)
  assert.ok(list.every((v) => v.embedUrl.startsWith('https://www.youtube-nocookie.com/embed/')))
  assert.deepEqual(await searchVideos('   ', { search: fakeSearch(YELLOW_RESULTS) }), [])
})

test('detectYoutubeUrl parses URLs, video IDs, and search queries correctly', async () => {
  memo.clear()
  // Full YouTube URL
  assert.equal(
    await detectYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  )
  // Short URL
  assert.equal(
    await detectYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  )
  // 11-char Video ID
  assert.equal(
    await detectYoutubeUrl('dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  )
  // Query search
  assert.equal(
    await detectYoutubeUrl('Coldplay - Yellow', {}, { search: fakeSearch(YELLOW_RESULTS) }),
    'https://www.youtube.com/watch?v=ccccccccccc'
  )
})

test('routes validate their params', async () => {
  const app = require('../server')
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  try {
    const api = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}/api/videos`, validateStatus: () => true })
    assert.equal((await api.get('/for-song')).status, 400)
    assert.equal((await api.get('/search')).status, 400)
    assert.equal((await api.get('/')).status, 400)
    assert.equal((await api.get('/stream')).status, 400)
    assert.equal((await api.get('/download')).status, 400)
  } finally {
    server.close()
  }
})
