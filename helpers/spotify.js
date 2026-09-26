const axios = require('axios')
const { get } = require('./deezer')
const { parseQuery, parseDurationToSec, pickBestTrack, scoreTrack, isUnwantedTitle } = require('./trackMatch')
const { resolveSpotifyViaMusicBrainz } = require('./spotifyResolve')
const searchtify = require('./searchtify')
const { stripDecor } = require('./text')

// exact title + exact artist + matching duration scores ~275 in trackMatch; at/above this we stop searching.
const CONFIDENT_SCORE = 250

const SPOTIFY_TRACK_RE = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/

// Some provider file hosts (e.g. api.lempi.lat) ignore requests with default
// axios/curl User-Agents, so every provider call identifies as a browser.
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const SEARCH_URLS = [
  process.env.GIFTED_SPOTIFY_SEARCH,
  'https://api.gifted.co.ke/api/search/spotifysearch',
  'https://api.gifted.co.ke/api/search/spotifylyrics',
].filter(Boolean)
const SEARCH_URL = SEARCH_URLS[0]

const DOWNLOAD_PROVIDERS = [
  {
    name: 'alyacore',
    url: process.env.ALYACORE_URL || 'https://api.alyacore.xyz/dl/spotify',
    params: (spotifyUrl) => ({ url: spotifyUrl, key: process.env.ALYACORE_KEY }),
    isOk: (data) => data?.status === true,
    extractUrl: (data) => data?.data?.dl || data?.dl,
    extractMeta: (data) => ({
      title: data?.data?.title,
      artist: data?.data?.artist,
      thumbnail: data?.data?.cover,
    }),
  },
  {
    // lempi answers fast but throttles file downloads per connection (~10-35 KB/s),
    // so it's a fallback, not the primary.
    name: 'lempi',
    url: process.env.LEMPI_URL || 'https://api.lempi.lat/dl/spotify',
    params: (spotifyUrl) => ({ url: spotifyUrl, apikey: process.env.LEMPI_API_KEY }),
    headers: { 'User-Agent': BROWSER_UA },
    isOk: (data) => data?.status === true,
    extractUrl: (data) => data?.datos?.url || data?.data?.url,
    extractMeta: (data) => ({
      title: data?.titulo || data?.title,
      artist: data?.artista || data?.artist,
      thumbnail: data?.miniatura || data?.cover,
      duration: data?.duracion,
    }),
  },
  {
    name: 'spotifydl',
    url: process.env.SPOTIFY_DL || 'https://apis.davidcyril.name.ng/spotifydl',
    headers: process.env.DCYRIL_API_KEY ? { 'X-API-Key': process.env.DCYRIL_API_KEY } : undefined,
    extractUrl: (data) =>
      data?.DownloadLink ||
      data?.downloadLink ||
      data?.download ||
      data?.result?.download ||
      data?.results?.download,
  },
  {
    name: 'spotifydl2',
    url: process.env.SPOTIFY_DL2 || 'https://apis.davidcyril.name.ng/spotifydl2',
    headers: process.env.DCYRIL_API_KEY ? { 'X-API-Key': process.env.DCYRIL_API_KEY } : undefined,
    extractUrl: (data) =>
      data?.result?.download ||
      data?.results?.downloadMP3 ||
      data?.results?.download ||
      data?.download ||
      data?.DownloadLink,
  },
]

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
  // 1) searchtify (primary)
  try {
    const results = await searchtify.searchTracks(query)
    if (results.length > 0) return results
    console.info(`[spotify helper] searchtify found nothing for "${query}", trying Gifted`)
  } catch (err) {
    console.warn(`[spotify helper] searchtify failed for "${query}": ${err.message}`)
  }

  // 2) Gifted API (fallback)
  const apikey = process.env.GIFTED_KEY

  let lastErr = null
  for (const baseUrl of [...new Set(SEARCH_URLS)]) {
    try {
      const { data } = await axios.get(baseUrl, {
        params: { apikey, query },
        timeout: 12000,
      })

      if (data?.success && Array.isArray(data.results) && data.results.length > 0) {
        return data.results
      }
      lastErr = new Error('No Spotify tracks found')
    } catch (err) {
      lastErr = err
      console.warn(`[spotify helper] search endpoint ${baseUrl} failed for "${query}": ${err.message}`)
    }
  }

  throw lastErr || new Error('No Spotify tracks found')
}

const isAcceptableTrack = (track, expected) => {
  if (!track) return false
  if (isUnwantedTitle(track.title, expected?.title)) return false
  if (expected?.durationSec && track.durationSec) {
    const diff = Math.abs(track.durationSec - expected.durationSec)
    if (diff > 12) return false
  }
  return true
}

const rankSpotifyCandidates = (candidates, expected, { quiet = false } = {}) => {
  const mapped = candidates.map((track) => ({
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    durationSec:
      track.durationSec ?? parseDurationToSec(track.duration),
    thumbnail: track.thumbnail || null,
    spotifyUrl: track.spotifyUrl || track.url,
  }))

  const acceptable = mapped.filter((t) => isAcceptableTrack(t, expected))
  if (acceptable.length === 0) return []

  // Score all acceptable tracks; best score first.
  // If nothing passes minScore, fall back to original order (MB first, then search order).
  const best = pickBestTrack(acceptable, expected, { minScore: 130, quiet })
  if (!best) return acceptable

  const rest = acceptable
    .filter((t) => t.spotifyUrl !== best.spotifyUrl)
    .sort((a, b) => scoreTrack(b, expected).total - scoreTrack(a, expected).total)
  return [best, ...rest]
}

const findSpotifyCandidates = async (query, hints = {}) => {
  const parsed = parseQuery(query)
  const expected = await resolveCanonicalFromDeezer(query, {
    title: hints.title || parsed.title,
    artist: hints.artist || parsed.artist,
    durationSec: hints.durationSec,
    deezerId: hints.deezerId,
  })

  // First query drops "(feat. ...)" / "- Remastered" noise: Spotify's search matches the plain title better.
  const searchQueries = [
    expected.artist && expected.title ? `${expected.artist} ${stripDecor(expected.title) || expected.title}` : null,
    expected.title && expected.artist ? `${expected.title} ${expected.artist}` : null,
    query,
  ].filter(Boolean)
  const [firstQuery, ...otherQueries] = [...new Set(searchQueries)]

  const seenUrls = new Set()
  const candidates = []
  const addAll = (results) =>
    results.forEach((track) => {
      if (!track?.url || seenUrls.has(track.url)) return
      seenUrls.add(track.url)
      candidates.push(track)
    })
  const runSearch = async (searchQuery) => {
    console.info(`[spotify helper] searching for "${searchQuery}"`)
    try {
      addAll(await searchSpotifyCandidates(searchQuery))
    } catch (err) {
      console.warn(`[spotify helper] search failed for "${searchQuery}": ${err.message}`)
    }
  }
  // True when the best candidate so far is a confident match (stop searching).
  const confident = () => rankSpotifyCandidates(candidates, expected, { quiet: true })[0]?._matchScore >= CONFIDENT_SCORE

  // 1) fast path: one search is usually enough
  await runSearch(firstQuery)
  let done = confident()

  // 2) MusicBrainz ISRC link: exact but slow (1 req/s), so only when the search wasn't conclusive
  if (!done) {
    const mbMatch = await resolveSpotifyViaMusicBrainz({
      deezerId: expected.deezerId || hints.deezerId,
      isrc: expected.isrc,
      title: expected.title,
      artist: expected.artist,
      durationSec: expected.durationSec,
    })
    if (mbMatch?.spotifyUrl && !seenUrls.has(mbMatch.spotifyUrl)) {
      seenUrls.add(mbMatch.spotifyUrl)
      candidates.unshift(mbMatch)
    }
    done = confident()
  }

  // 3) remaining query variants
  for (const searchQuery of otherQueries) {
    if (done) break
    await runSearch(searchQuery)
    done = confident()
  }

  if (candidates.length === 0) {
    throw new Error('No Spotify tracks found')
  }

  const ranked = rankSpotifyCandidates(candidates, expected) // logs the top candidates once
  if (ranked.length === 0) {
    throw new Error('No official studio match in Spotify search results')
  }

  console.info(
    `[spotify helper] ranked ${ranked.length} candidates, top: "${ranked[0].title}" by ${ranked[0].artist} (${ranked[0].spotifyUrl})`
  )

  return { expected, ranked }
}

const searchSpotifyTrack = async (query, hints = {}) => {
  const { ranked } = await findSpotifyCandidates(query, hints)
  const track = ranked[0]

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
      params: provider.params
        ? provider.params(spotifyUrl)
        : { url: spotifyUrl },
      timeout: 20000,
    }
    if (provider.headers) config.headers = { 'User-Agent': BROWSER_UA, ...provider.headers }
    if (signal) config.signal = signal

    const { data } = await axios.get(provider.url, config)

    const ok = provider.isOk ? provider.isOk(data) : data?.success
    if (!ok) {
      const apiMessage = data?.message || data?.error
      throw new Error(apiMessage ? `${provider.name}: ${apiMessage}` : `${provider.name} returned unsuccessful response`)
    }

    const downloadUrl = provider.extractUrl(data)
    if (!downloadUrl) {
      throw new Error(`${provider.name} failed to return a download URL`)
    }

    console.info(`[spotify helper] provider ${provider.name} succeeded`)

    const meta = provider.extractMeta ? provider.extractMeta(data) : {}

    return {
      url: downloadUrl,
      title: meta.title || data.title || data.result?.title || data.results?.title,
      artist: meta.artist || data.artist || data.result?.artist || data.results?.artist,
      duration: meta.duration || data.duration || data.result?.duration || data.results?.duration,
      thumbnail: meta.thumbnail || data.thumbnail || data.result?.cover || data.result?.image || data.results?.image,
      format: data.result?.format || 'mp3',
      quality: '128kbps',
    }
  } catch (error) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      console.warn(`[spotify helper] provider ${provider.name} aborted`)
    } else {
      // Surface the API's own message (e.g. monthly quota / invalid key) instead of a bare status code
      const apiMessage = error.response?.data?.message
      const detail = apiMessage ? `${error.message} (${apiMessage})` : error.message
      console.warn(`[spotify helper] provider ${provider.name} failed: ${detail}`)
      if (apiMessage) error.message = detail
    }
    throw error
  }
}

const getSpotifyDownloadUrl = async (spotifyUrl) => {
  // Sequential, not a parallel race: a fast-but-throttled provider (lempi) answers
  // quicker than the good primary (alyacore) and would otherwise "win" with a slow file.
  const errors = []
  for (const provider of DOWNLOAD_PROVIDERS) {
    try {
      return await fetchDownloadFromProvider(provider, spotifyUrl)
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        throw error // caller aborted the whole request; stop immediately
      }
      errors.push(`${provider.name}: ${error.message}`)
    }
  }
  throw new Error(`No Spotify download provider succeeded (${errors.join('; ')})`)
}

const getSpotifyStreamUrl = async (query, hints = {}) => {
  const directUrl = extractSpotifyTrackUrl(query)
  if (directUrl) {
    const download = await getSpotifyDownloadUrl(directUrl)
    return {
      url: download.url,
      title: download.title,
      artist: null,
      duration: download.duration,
      thumbnail: download.thumbnail,
      quality: download.quality,
      format: download.format || 'mp3',
      source: 'spotify',
      spotifyUrl: directUrl,
    }
  }

  const { ranked } = await findSpotifyCandidates(query, hints)

  // Try each Spotify candidate until a download succeeds.
  // This handles cases where the top (e.g. MusicBrainz ISRC) URL points at
  // a compilation/region variant the download providers can't fetch.
  const errors = []
  for (const meta of ranked.slice(0, 4)) {
    try {
      console.info(`[spotify helper] trying download for ${meta.spotifyUrl} ("${meta.title}")`)
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
    } catch (err) {
      console.warn(`[spotify helper] download failed for ${meta.spotifyUrl}: ${err.message}`)
      errors.push(`${meta.spotifyUrl}: ${err.message}`)
    }
  }

  throw new Error(`Spotify download failed: ${errors.join('; ')}`)
}

module.exports = {
  getSpotifyStreamUrl,
  getSpotifyDownloadUrl,
  searchSpotifyTrack,
  findSpotifyCandidates,
  extractSpotifyTrackUrl,
}
