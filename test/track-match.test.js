const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isUnwantedTitle, scoreTrack, pickBestTrack } = require('../helpers/trackMatch')

// Regression: the spam-title blocklist used to reject real songs whose titles
// contain blocked words ("Beat It" matched \bbeat\b in UNWANTED_TITLE_RE), which
// pushed the resolver to discard the correct track and pick a different song
// entirely ("Billie Jean") in the YouTube emergency fallback.

test('blocklist does not reject song titles that contain blocked words', () => {
  assert.equal(isUnwantedTitle('Beat It', 'Beat It'), false)
  assert.equal(isUnwantedTitle('Dance Monkey', 'Dance Monkey'), false)
  assert.equal(isUnwantedTitle('Live and Let Die', 'Live and Let Die'), false)
  assert.equal(isUnwantedTitle('Session', 'Session'), false)
  assert.equal(isUnwantedTitle('Michael Jackson - Beat It (Official Video 4K)', 'Beat It'), false)
})

test('blocklist still rejects actual spam variants of those songs', () => {
  assert.equal(isUnwantedTitle('Beat It (Sped Up)', 'Beat It'), true)
  assert.equal(isUnwantedTitle('Beat It - Type Beat', 'Beat It'), true)
  assert.equal(isUnwantedTitle('Beat It (Remix)', 'Beat It'), true)
  assert.equal(isUnwantedTitle('Dance Monkey Cover', 'Dance Monkey'), true)
  assert.equal(isUnwantedTitle('Live and Let Die (Live at Wembley)', 'Live and Let Die'), true)
  assert.equal(isUnwantedTitle('Session Instrumental', 'Session'), true)
})

test('blocklist behaves as before when no expected title is known', () => {
  assert.equal(isUnwantedTitle('Beat It', ''), true)
  assert.equal(isUnwantedTitle('Some Random Type Beat', ''), true)
})

test('Beat It outranks Billie Jean for the same artist (wrong-pick regression)', () => {
  const expected = { title: 'Beat It', artist: 'Michael Jackson', durationSec: 258 }
  const beatIt = scoreTrack({ title: 'Beat It', artist: 'Michael Jackson', duration: 258 }, expected)
  const billieJean = scoreTrack({ title: 'Billie Jean', artist: 'Michael Jackson', duration: 295 }, expected)
  assert.ok(beatIt.total > billieJean.total)
  assert.ok(beatIt.unwantedPenalty === 0, 'Beat It must not take the spam penalty')
})

test('pickBestTrack returns the real track for a blocked-word title', () => {
  const expected = { title: 'Beat It', artist: 'Michael Jackson', durationSec: 258 }
  const candidates = [
    { title: 'Beat It', artist: 'Michael Jackson', duration: 258 },
    { title: 'Billie Jean', artist: 'Michael Jackson', duration: 295 },
    { title: 'Beat It (Sped Up)', artist: 'sped up sounds', duration: 220 },
  ]
  const best = pickBestTrack(candidates, expected, { minScore: 130 })
  assert.ok(best, 'a confident match should exist')
  assert.equal(best.title, 'Beat It')
})
