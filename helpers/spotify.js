const axios = require('axios')
const { get } = require('./deezer')
const { parseQuery, parseDurationToSec, pickBestTrack, UNWANTED_TITLE_RE } = require('./trackMatch')
const { resolveSpotifyViaMusicBrainz } = require('./spotifyResolve')

const SPOTIFY_TRACK_RE = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/

const SEARCH_URL =
  process.env.GIFTED_SPOTIFY_SEARCH ||
  'https://api.giftedtech.co.ke/api/search/spotifysearch'

const DOWNLOAD_PROVIDERS = [
  {
    name: 'spotifydl',
    url: process.env.SPOTIFY_DL || 'https://apis.davidcyril.name.ng/spotifydl',
    extractUrl: (data) => data?.DownloadLink,
  },
  {
    name: 'spotifydl2',
    url: process.env.SPOTIFY_DL2 || 'https://apis.davidcyril.name.ng/spotifydl2',
    extractUrl: (data) => data?.results?.downloadMP3,
  },
]

const firstSuccessful = (promises) =>
  new Promise((resolve, reject) => {
    const errors = []
    let remaining = promises.length

    if (remaining === 0) return reject(new Error('No Spotify download providers configured'))

    promises.forEach((promise) => {
      promise.then(resolve).catch((error) => {
        errors.push(error)
        remaining -= 1
        if (remaining === 0) {
          reject(new Error(errors.map((e) => e.message).join('; ')))
        }
      })
    })
  })

const extractSpotifyTrackUrl = (input) => {
  const match = String(input).match(SPOTIFY_TRACK_RE)
  return match ? `https://open.spotify.com/track/${match[1]}` : null
}

const resolveCanonicalFromDeezer = async (query, hints = {}) => {
  if (hints.deezerId) {
    try {
      const track = await get(`/track/${hints.deezerId}`)
      console.info(
        `[spotify helper] deezer track ${hints.deezerId}: "${track.title}" by ${track.artist?.name} (${track.duration}s)`
      )
      return {
        title: hints.title || track.title,
        artist: hints.artist || track.artist?.name || '',
        durationSec: hints.durationSec || track.duration,
        deezerId: track.id,
        isrc: track.isrc || null,
      }
    } catch (err) {
      console.warn(`[spotify helper] deezer track ${hints.deezerId} failed: ${err.message}`)
    }
  }

  try {
    const searchQ =
      hints.title && hints.artist
        ? `track:"${hints.title}" artist:"${hints.artist}"`
        : query

    const data = await get('/search', { q: searchQ, limit: 12 })
    const candidates = (data.data || []).map((track) => ({
      title: track.title,
      artist: track.artist?.name || '',
      duration: track.duration,
      durationSec: track.duration,
      source: 'deezer',
      deezerId: track.id,
    }))

    const expected = {
      title: hints.title || parseQuery(query).title,
      artist: hints.artist || parseQuery(query).artist,
    }

    const best = pickBestTrack(candidates, expected, { minScore: 70 })
    if (best) {
      console.info(
        `[spotify helper] deezer canonical: "${best.title}" by ${best.artist} (${best.durationSec}s, score ${best._matchScore})`
      )
      return {
        title: best.title,
        artist: best.artist,
        durationSec: best.durationSec,
        deezerId: best.deezerId,
        isrc: null,
      }
    }
  } catch (err) {
    console.warn(`[spotify helper] deezer canonical lookup failed: ${err.message}`)
  }

  return {
    title: hints.title || parseQuery(query).title,
    artist: hints.artist || parseQuery(query).artist,
    durationSec: hints.durationSec ?? null,
    deezerId: hints.deezerId || null,
    isrc: null,
  }
}

const searchSpotifyCandidates = async (query) => {
  const apikey = process.env.GIFTED_KEY || 'gifted-api_p1r5icplshukpe2x'

  const { data } = await axios.get(SEARCH_URL, {
    params: { apikey, query },
    timeout: 12000,
  })

  if (!data?.success || !Array.isArray(data.results) || data.results.length === 0) {
    throw new Error('No Spotify tracks found')
  }

  return data.results
}

const searchSpotifyTrack = async (query, hints = {}) => {
  const parsed = parseQuery(query)
  const expected = await resolveCanonicalFromDeezer(query, {
    title: hints.title || parsed.title,
    artist: hints.artist || parsed.artist,
    durationSec: hints.durationSec,
    deezerId: hints.deezerId,
  })

  const searchQueries = [
    expected.artist && expected.title ? `${expected.artist} ${expected.title}` : null,
    expected.title && expected.artist ? `${expected.title} ${expected.artist}` : null,
    query,
  ].filter(Boolean)

  const seenUrls = new Set()
  const candidates = []

  const mbMatch = await resolveSpotifyViaMusicBrainz({
    deezerId: expected.deezerId || hints.deezerId,
    isrc: expected.isrc,
    title: expected.title,
    artist: expected.artist,
    durationSec: expected.durationSec,
  })
  if (mbMatch?.spotifyUrl) {
    seenUrls.add(mbMatch.spotifyUrl)
    candidates.push(mbMatch)
  }

  for (const searchQuery of [...new Set(searchQueries)]) {
    console.info(`[spotify helper] searching for "${searchQuery}"`)
    try {
      const results = await searchSpotifyCandidates(searchQuery)
      results.forEach((track) => {
        if (!track?.url || seenUrls.has(track.url)) return
        seenUrls.add(track.url)
        candidates.push(track)
      })
    } catch (err) {
      console.warn(`[spotify helper] search failed for "${searchQuery}": ${err.message}`)
    }
  }

  if (candidates.length === 0) {
    throw new Error('No Spotify tracks found')
  }

  const isAcceptable = (track) => {
    if (!track) return false
    if (UNWANTED_TITLE_RE.test(track.title)) return false
    if (expected.durationSec && track.durationSec) {
      const diff = Math.abs(track.durationSec - expected.durationSec)
      if (diff > 12) return false
    }
    return true
  }

  if (mbMatch?.spotifyUrl && isAcceptable(mbMatch)) {
    console.info(
      `[spotify helper] using MusicBrainz ISRC match → ${mbMatch.spotifyUrl}`
    )
    return {
      title: mbMatch.title,
      artist: mbMatch.artist,
      thumbnail: null,
      duration: mbMatch.duration,
      spotifyUrl: mbMatch.spotifyUrl,
    }
  }

  const mapped = candidates.map((track) => ({
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    durationSec: parseDurationToSec(track.duration),
    thumbnail: track.thumbnail,
    spotifyUrl: track.url,
  }))

  const best = pickBestTrack(mapped, expected, { minScore: 130 })

  const track = isAcceptable(best) ? best : mapped.find(isAcceptable)
  if (!track?.spotifyUrl) {
    throw new Error('No official studio match in Spotify search results')
  }

  console.info(
    `[spotify helper] picked "${track.title}" by ${track.artist} (score ${track._matchScore || 'n/a'})`
  )

  return {
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail,
    duration: track.duration,
    spotifyUrl: track.spotifyUrl || track.url,
  }
}

const fetchDownloadFromProvider = async (provider, spotifyUrl, signal) => {
  console.info(`[spotify helper] trying download provider ${provider.name}`)

  try {
    const config = {
      params: { url: spotifyUrl },
      timeout: 20000,
    }
    if (signal) config.signal = signal

    const { data } = await axios.get(provider.url, config)

    if (!data?.success) {
      throw new Error(`${provider.name} returned unsuccessful response`)
    }

    const downloadUrl = provider.extractUrl(data)
    if (!downloadUrl) {
      throw new Error(`${provider.name} failed to return a download URL`)
    }

    console.info(`[spotify helper] provider ${provider.name} succeeded`)

    return {
      url: downloadUrl,
      title: data.title || data.results?.title,
      duration: data.duration || data.results?.duration,
      thumbnail: data.thumbnail || data.results?.image,
      format: 'mp3',
      quality: '128kbps',
    }
  } catch (error) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      console.warn(`[spotify helper] provider ${provider.name} aborted`)
    } else {
      console.warn(`[spotify helper] provider ${provider.name} failed: ${error.message}`)
    }
    throw error
  }
}

const getSpotifyDownloadUrl = async (spotifyUrl) => {
  const controllers = DOWNLOAD_PROVIDERS.map(() =>
    typeof AbortController !== 'undefined' ? new AbortController() : null
  )

  const requests = DOWNLOAD_PROVIDERS.map((provider, index) =>
    fetchDownloadFromProvider(
      provider,
      spotifyUrl,
      controllers[index] ? controllers[index].signal : undefined
    )
  )

  try {
    const result = await firstSuccessful(requests)
    controllers.forEach((controller) => controller && controller.abort())
    return result
  } catch (err) {
    throw new Error(`Spotify download failed: ${err.message}`)
  }
}

const getSpotifyStreamUrl = async (query, hints = {}) => {
  const directUrl = extractSpotifyTrackUrl(query)
  const meta = directUrl
    ? { spotifyUrl: directUrl, title: null, artist: null, thumbnail: null, duration: null }
    : await searchSpotifyTrack(query, hints)

  const download = await getSpotifyDownloadUrl(meta.spotifyUrl)

  return {
    url: download.url,
    title: download.title || meta.title,
    artist: meta.artist,
    duration: download.duration || meta.duration,
    thumbnail: download.thumbnail || meta.thumbnail,
    quality: download.quality,
    format: download.format || 'mp3',
    source: 'spotify',
    spotifyUrl: meta.spotifyUrl,
  }
}

module.exports = {
  getSpotifyStreamUrl,
  searchSpotifyTrack,
  extractSpotifyTrackUrl,
}
