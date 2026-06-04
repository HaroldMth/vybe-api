const axios = require('axios')
const fs    = require('fs')
const path  = require('path')
const { get } = require('./deezer')

const MUSICBRAINZ_UA =
  process.env.MUSICBRAINZ_USER_AGENT || 'VYBE/1.0 (https://github.com/HaroldMth/vybe-api)'

// ── Persistent disk cache ────────────────────────────────────────────────────
// Survives server restarts so MusicBrainz is only ever called ONCE per ISRC.
const CACHE_DIR  = path.join(__dirname, '..', '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'isrc-spotify.json')

const loadDiskCache = () => {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    }
  } catch {}
  return {}
}

const diskCache = loadDiskCache()

const saveDiskCache = () => {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(diskCache, null, 2))
  } catch (err) {
    console.warn('[spotify resolve] Could not save ISRC cache:', err.message)
  }
}

// In-memory mirror for fast lookups within a session
const memCache = new Map(Object.entries(diskCache))

const cacheGet = (isrc) => memCache.get(isrc)
const cacheSet = (isrc, value) => {
  memCache.set(isrc, value)
  diskCache[isrc] = value
  saveDiskCache()
}

// ── MusicBrainz rate limiter (max 1 req/s as required by their ToS) ──────────
let _mbLastCall = 0

const mbRateLimitedGet = async (url, config) => {
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - _mbLastCall)) // 1.1s gap to be safe
  if (wait > 0) {
    console.info(`[spotify resolve] MusicBrainz rate limit: waiting ${wait}ms`)
    await new Promise((r) => setTimeout(r, wait))
  }
  _mbLastCall = Date.now()
  return axios.get(url, config)
}

// ── ISRC → Spotify URL via MusicBrainz (with retry on timeout) ──────────────
const getSpotifyUrlFromIsrc = async (isrc, retries = 1) => {
  if (!isrc) return null

  const cached = cacheGet(isrc)
  if (cached !== undefined) {
    if (cached) console.info(`[spotify resolve] ISRC cache hit: ${isrc} → ${cached.spotifyUrl}`)
    return cached // null means "definitely not on MusicBrainz"
  }

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.info(`[spotify resolve] MusicBrainz retry ${attempt} for ISRC ${isrc}`)
        await new Promise((r) => setTimeout(r, 1500 * attempt))
      }

      const { data } = await mbRateLimitedGet(
        `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}`,
        {
          params:  { fmt: 'json', inc: 'url-rels' },
          headers: { 'User-Agent': MUSICBRAINZ_UA },
          timeout: 15000,
        }
      )

      for (const recording of data.recordings || []) {
        for (const rel of recording.relations || []) {
          const resource = rel.url?.resource
          if (resource && resource.includes('open.spotify.com/track/')) {
            const result = {
              spotifyUrl:  resource,
              title:       recording.title,
              durationSec: recording.length ? Math.round(recording.length / 1000) : null,
              source:      'musicbrainz-isrc',
            }
            cacheSet(isrc, result)
            return result
          }
        }
      }

      // MusicBrainz responded but has no Spotify link for this ISRC
      cacheSet(isrc, null)
      return null
    } catch (err) {
      lastErr = err
      const code = err.code || err.name || 'UNKNOWN'
      console.warn(`[spotify resolve] MusicBrainz attempt ${attempt + 1} failed (${code}): ${err.message || '(no message)'}`)
    }
  }

  // Don't cache on network error — let it be retried on the next server request
  console.warn(`[spotify resolve] MusicBrainz gave up after ${retries + 1} attempts for ISRC ${isrc}`)
  throw lastErr
}

// ── Public: resolve a Spotify URL from any available hint ───────────────────
const resolveSpotifyViaMusicBrainz = async ({ deezerId, isrc, title, artist, durationSec }) => {
  try {
    let trackIsrc = isrc

    if (!trackIsrc && deezerId) {
      const track = await get(`/track/${deezerId}`)
      trackIsrc = track.isrc
    }

    if (!trackIsrc) return null

    const mb = await getSpotifyUrlFromIsrc(trackIsrc)
    if (!mb?.spotifyUrl) return null

    console.info(`[spotify resolve] MusicBrainz ISRC ${trackIsrc} → ${mb.spotifyUrl}`)

    return {
      title:       title || mb.title,
      artist:      artist || '',
      duration:    durationSec
        ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`
        : mb.durationSec
          ? `${Math.floor(mb.durationSec / 60)}:${String(mb.durationSec % 60).padStart(2, '0')}`
          : null,
      durationSec: durationSec || mb.durationSec,
      spotifyUrl:  mb.spotifyUrl,
      source:      'musicbrainz-isrc',
    }
  } catch (err) {
    const code = err.code || err.name || 'UNKNOWN'
    console.warn(`[spotify resolve] MusicBrainz lookup failed (${code}): ${err.message || '(no message)'}`)
    return null
  }
}

module.exports = {
  getSpotifyUrlFromIsrc,
  resolveSpotifyViaMusicBrainz,
}
