const axios = require('axios')
const memo = require('./memo')
const { norm } = require('./text')
const { parseQuery, parseDurationToSec, pickBestTrack, isUnwantedTitle } = require('./trackMatch')

const VIDEO_TTL_MS = 60 * 60 * 1000
const MIN_MATCH_SCORE = 90
const YT_ID_RE = /^[\w-]{11}$/
const YT_URL_RE = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i

const DC_YTMP4_URL = process.env.DCYRIL_YTMP4 || 'https://apis.davidcyril.name.ng/download/ytmp4'

const defaultSearch = (searchQuery, limit) => {
  const YouTube = require('youtube-sr').default
  return YouTube.search(searchQuery, { limit, type: 'video' })
}

const toVideo = (item) => ({
  videoId: item.id,
  title: item.title,
  channel: item.channel?.name || '',
  duration: item.durationFormatted || null,
  durationSec: parseDurationToSec(item.durationFormatted),
  thumbnail: item.thumbnail?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
  embedUrl: `https://www.youtube-nocookie.com/embed/${item.id}`,
  watchUrl: `https://www.youtube.com/watch?v=${item.id}`,
})

const isPlayable = (item) => item && YT_ID_RE.test(String(item.id || ''))

// Plain search: several embeddable results for a free-text query.
const searchVideos = (query, { limit = 10, search = defaultSearch } = {}) => {
  const q = String(query || '').trim()
  if (!q) return Promise.resolve([])
  const key = `videos:search:${norm(q)}:${limit}`
  return memo(key, VIDEO_TTL_MS, async () => (await search(q, limit)).filter(isPlayable).map(toVideo), {
    staleMs: VIDEO_TTL_MS,
  })
}

// Song -> its official music video. Resolves to null when nothing matches confidently,
// because showing the wrong video is worse than showing none.
const findOfficialVideo = (
  { query, title, artist, durationSec } = {},
  { search = defaultSearch } = {}
) => {
  const parsed = parseQuery(query || '')
  const expected = {
    title: String(title || parsed.title || '').trim(),
    artist: String(artist || parsed.artist || '').trim(),
    durationSec,
  }
  if (!expected.title) return Promise.reject(new Error('title (or q) required'))

  const key = `videos:song:${norm(expected.artist)}|${norm(expected.title)}|${durationSec || ''}`
  return memo(
    key,
    VIDEO_TTL_MS,
    async () => {
      const searchQuery = `${expected.artist} ${expected.title} official music video`.trim()
      const results = await search(searchQuery, 15)

      // Score on the real channel name: "ColdplayVEVO" / "Coldplay" beat random re-uploaders.
      const candidates = results
        .filter(isPlayable)
        .map((item) => ({ ...toVideo(item), artist: item.channel?.name || '' }))

      const best = pickBestTrack(candidates, expected, { minScore: MIN_MATCH_SCORE, quiet: true })
      if (!best || isUnwantedTitle(best.title, expected.title)) return null

      const { artist: _channelAsArtist, _ranked, _matchScore, ...video } = best
      return { ...video, matchScore: _matchScore }
    },
    { staleMs: VIDEO_TTL_MS }
  )
}

// Detect YouTube URL from URL string, video ID, or search query
const detectYoutubeUrl = async (input, hints = {}, { search = defaultSearch } = {}) => {
  const strInput = String(input || '').trim()

  if (!strInput) {
    if (hints.title || hints.artist || hints.query) {
      const q = `${hints.artist || ''} ${hints.title || hints.query || ''}`.trim()
      const list = await searchVideos(q, { limit: 1, search }).catch(() => [])
      if (list.length > 0 && list[0].watchUrl) return list[0].watchUrl
    }
    throw new Error('url, videoId, or q param required')
  }

  // 1. Check if it's already a YouTube URL
  const match = strInput.match(YT_URL_RE)
  if (match) {
    return `https://www.youtube.com/watch?v=${match[1]}`
  }

  // 2. Check if it's a raw 11-char YouTube ID
  if (YT_ID_RE.test(strInput)) {
    return `https://www.youtube.com/watch?v=${strInput}`
  }

  // 3. Search YouTube directly via youtube-sr search package
  const searchQuery = hints.artist && !strInput.toLowerCase().includes(hints.artist.toLowerCase())
    ? `${hints.artist} ${strInput}`
    : strInput

  const list = await searchVideos(searchQuery, { limit: 5, search }).catch(() => [])
  if (list.length > 0 && list[0].watchUrl) {
    return list[0].watchUrl
  }

  throw new Error(`Could not detect a YouTube video for "${strInput}"`)
}

// Fetch MP4 video download URL from David Cyril API
const fetchVideoFromDavidCyril = async (youtubeUrl) => {
  const headers = process.env.DCYRIL_API_KEY ? { 'X-API-Key': process.env.DCYRIL_API_KEY } : {}
  const { data } = await axios.get(DC_YTMP4_URL, {
    params: { url: youtubeUrl },
    timeout: 45000,
    headers,
  })

  if (!data || !data.success || !data.result || !data.result.download_url) {
    throw new Error('David Cyril API failed to return a valid video download URL')
  }

  return {
    url: data.result.download_url,
    download_url: data.result.download_url,
    title: data.result.title,
    thumbnail: data.result.thumbnail,
    quality: data.result.quality || '480p',
    format: data.result.format || 'mp4',
    type: data.result.type || 'video',
    creator: data.creator || 'David Cyril',
    source: 'david-cyril',
    youtubeUrl,
  }
}

// Get video stream/download URL for given input (URL, ID, or search query)
const getVideoStreamUrl = async (input, hints = {}, options = {}) => {
  const youtubeUrl = await detectYoutubeUrl(input, hints, options)
  return fetchVideoFromDavidCyril(youtubeUrl)
}

module.exports = {
  findOfficialVideo,
  searchVideos,
  detectYoutubeUrl,
  fetchVideoFromDavidCyril,
  getVideoStreamUrl,
}
