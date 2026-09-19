// Spotify search through `searchtify` (no credentials; talks to Spotify's web-player endpoints).
// Primary search provider for the Spotify stream helper; the Gifted API stays as fallback.
//
// searchtify scrapes web-player secrets and Spotify changes those often, so this wrapper is defensive:
//  - lazy-loads the package (server still boots if it's missing)
//  - results cached 1 h, concurrency capped, small gap between calls (bursts from one IP get flagged)
//  - circuit breaker: 3 failures in a row => skipped for 5 min (and the client is rebuilt afterwards)
const { createLimiter, withTimeout } = require('./http')
const memo = require('./memo')
const { norm } = require('./text')

const FAILS_TO_OPEN = 3
const COOLDOWN_MS = 5 * 60 * 1000
const CACHE_MS = 60 * 60 * 1000

const limited = createLimiter({ concurrency: 3, gapMs: 150 })

let client = null
let fails = 0
let openUntil = 0

const getClient = () => {
  if (!client) {
    const mod = require('searchtify')
    const Spotify = mod.default || mod
    client = new Spotify()
  }
  return client
}

const fmtDuration = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

// searchtify track -> the candidate shape spotify.js already ranks (same as the Gifted results).
const toCandidate = (t) => {
  const id = t.id || String(t.uri || '').split(':')[2]
  if (!id || !t.name) return null
  const artists = (t.artists?.items || []).map((a) => a?.profile?.name).filter(Boolean)
  const sec = t.duration?.totalMilliseconds ? Math.round(t.duration.totalMilliseconds / 1000) : null
  const cover = (t.albumOfTrack?.coverArt?.sources || []).slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]

  return {
    title: t.name,
    artist: artists.join(' & '),
    duration: sec ? fmtDuration(sec) : null,
    durationSec: sec,
    thumbnail: cover?.url || null,
    url: `https://open.spotify.com/track/${id}`,
    album: t.albumOfTrack?.name || null,
    explicit: t.contentRating?.label === 'EXPLICIT',
    source: 'searchtify',
  }
}

const isOpen = () => Date.now() < openUntil

const failed = (err) => {
  fails += 1
  if (fails >= FAILS_TO_OPEN) {
    openUntil = Date.now() + COOLDOWN_MS
    fails = 0
    client = null // rebuild (re-fetch secrets/tokens) after the cooldown
    console.warn(`[searchtify] ${FAILS_TO_OPEN} failures in a row (${err.message}); pausing for ${COOLDOWN_MS / 60000} min, using fallback`)
  }
}

const searchTracks = (query, { limit = 10 } = {}) => {
  if (isOpen()) return Promise.reject(new Error('searchtify paused after repeated failures'))

  const key = `searchtify:${limit}:${norm(query)}`
  return memo(key, CACHE_MS, () =>
    limited(async () => {
      try {
        const res = await withTimeout(getClient().search(query, { limit }), 12000, 'searchtify')
        const items = (res?.tracksV2?.items || [])
          .map((wrapper) => wrapper?.item?.data)
          .filter((t) => t && String(t.uri || '').startsWith('spotify:track:'))
          .map(toCandidate)
          .filter(Boolean)
        fails = 0
        return items
      } catch (err) {
        failed(err)
        throw err
      }
    })
  ).then((items) => {
    if (!items.length) memo.expire(key) // don't pin an empty answer for an hour
    return items
  })
}

// test helpers
const _setClient = (fake) => { client = fake }
const _reset = () => { client = null; fails = 0; openUntil = 0 }

module.exports = { searchTracks, toCandidate, _setClient, _reset }
