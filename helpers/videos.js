const dns = require('dns')
try {
  dns.setDefaultResultOrder('ipv4first')
} catch (_) {}

const axios = require('axios')
const { execFile } = require('child_process')
const os = require('os')
const path = require('path')
const memo = require('./memo')
const { norm } = require('./text')
const { parseQuery, parseDurationToSec, pickBestTrack, isUnwantedTitle } = require('./trackMatch')

const VIDEO_TTL_MS = 60 * 60 * 1000
const MIN_MATCH_SCORE = 90
const YT_ID_RE = /^[\w-]{11}$/
const YT_URL_RE = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i

const DC_YTMP4_URL = process.env.DCYRIL_YTMP4 || 'https://apis.davidcyril.name.ng/download/ytmp4'
const OMEGATECH_URL = process.env.OMEGATECH_URL || 'https://api.omegatech.app/api/download/yt-dl'
// 360p = itag 18, the only muxed (video+audio) MP4 these APIs return; higher itags are video-only DASH and play silent.
const VIDEO_STREAM_QUALITY = '360p'

const defaultSearch = async (searchQuery, limit = 10) => {
  try {
    const { data: html } = await axios.get('https://www.youtube.com/results', {
      params: { search_query: searchQuery },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000
    })

    const jsonMatch = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)
    if (!jsonMatch) return []
    const data = JSON.parse(jsonMatch[1])
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || []

    return contents
      .filter(c => c.videoRenderer && c.videoRenderer.videoId)
      .slice(0, limit)
      .map(c => {
        const v = c.videoRenderer
        return {
          id: v.videoId,
          title: v.title?.runs?.[0]?.text || '',
          channel: { name: v.ownerText?.runs?.[0]?.text || '' },
          durationFormatted: v.lengthText?.simpleText || '',
          thumbnail: { url: v.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` }
        }
      })
  } catch (err) {
    console.error('YouTube search scraper error:', err.message)
    return []
  }
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

// Extract 11-character YouTube video ID
const extractVideoId = (input) => {
  const strInput = String(input || '').trim()
  const match = strInput.match(YT_URL_RE)
  if (match) return match[1]
  if (YT_ID_RE.test(strInput)) return strInput
  return null
}

// In-memory cache for resolved upstream video stream objects: videoId -> { data, expiresAt }
const upstreamCache = new Map()
const UPSTREAM_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const SAVETUBE_KEY_HEX = 'C5D58EF67A7584E4A29F6C35BBC4EB12'
const savetubeKeyBuf = Buffer.from(SAVETUBE_KEY_HEX, 'hex')

const decryptSaveTube = (b64) => {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, 16)
  const ct = buf.subarray(16)
  const d = require('crypto').createDecipheriv('aes-128-cbc', savetubeKeyBuf, iv)
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'))
}

const SAVETUBE_HEADERS = {
  'content-type': 'application/json',
  'origin': 'https://save-tube.com',
  'referer': 'https://save-tube.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
}

// Resolve video stream via SaveTube / Hector Cloudflare Worker
const fetchVideoFromSaveTubeAndHector = async (youtubeUrl) => {
  const videoId = extractVideoId(youtubeUrl)
  let cdn = 'cdn401.savetube.vip'
  try {
    const { data: cdnData } = await axios.get('https://media.savetube.vip/api/random-cdn', {
      headers: SAVETUBE_HEADERS,
      timeout: 3000,
    })
    if (cdnData?.cdn) cdn = cdnData.cdn
  } catch (err) {
    console.warn('[Video] random-cdn lookup failed, using fallback', cdn)
  }

  const { data: infoRes } = await axios.post(
    `https://${cdn}/v2/info`,
    { url: youtubeUrl },
    { headers: SAVETUBE_HEADERS, timeout: 6000 }
  )

  const info = decryptSaveTube(infoRes.data)
  // SaveTube's googlevideo.com URLs are IP-locked to SaveTube's servers (returns 403 when proxied).
  // Only use directMp4 if it's hosted on SaveTube CDN (e.g. cdn4XX.savetube.vip/media/...)
  const directMp4 = info.video_formats?.find((f) => f.url && !f.url.includes('googlevideo.com'))?.url

  const hectorStreamUrl = `https://yt-dl.officialhectormanuel.workers.dev/stream?id=${info.id}&format=360&key=${info.key}&title=${encodeURIComponent(info.title)}`

  return {
    streamUrl: directMp4 || hectorStreamUrl,
    directMp4,
    hectorStreamUrl,
    title: info.title,
    thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    quality: '360p',
    format: 'mp4',
    type: 'video',
    creator: 'SaveTube / Hector',
    source: 'savetube-hector',
    youtubeUrl,
    videoId: videoId || info.id,
    durationSec: info.duration,
  }
}

// Resolve video stream via Omegatech (fast fallback: ~2s resolution, googlevideo MP4 proxies fine with
// Range support — but its cache can serve dead links, hence the proxy's 403 rotation)
const fetchVideoFromOmegatech = async (youtubeUrl) => {
  const videoId = extractVideoId(youtubeUrl)
  const { data } = await axios.get(OMEGATECH_URL, {
    params: { action: 'download', url: youtubeUrl, quality: VIDEO_STREAM_QUALITY },
    timeout: 12000,
  })

  const info = data?.data
  const downloadUrl =
    info?.downloadUrl ||
    info?.allMedias?.find((m) => String(m.quality || '').toLowerCase().includes('360'))?.url

  if (data?.success === false || !downloadUrl) {
    throw new Error(data?.error || data?.message || 'Omegatech returned no downloadUrl')
  }

  return {
    url: downloadUrl,
    download_url: downloadUrl,
    streamUrl: downloadUrl,
    title: info.title || '',
    thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    quality: VIDEO_STREAM_QUALITY,
    format: 'mp4',
    type: 'video',
    creator: 'Omegatech',
    source: 'omegatech',
    youtubeUrl,
    videoId,
    durationSec: Number.isFinite(info.durationSeconds) ? info.durationSeconds : undefined,
  }
}

// Resolve video stream locally via yt-dlp (PRIMARY provider). Links are minted for THIS server's IP, so there is no
// third-party staleness and no IP-lock: they cannot 403 on us the way cached provider links do.
// The android/mweb/web_embedded player clients expose the muxed itag 18 MP4 (video+audio);// the default web client only returns video-only DASH formats.
const YTDL_CLIENTS = ['android', 'mweb', 'web_embedded']
const YTDL_TIMEOUT_MS = 20000

const execFileAsync = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: YTDL_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '')
        return reject(err)
      }
      resolve(String(stdout || ''))
    })
  })

const resolveYtDlpBin = async () => {
  const primary = process.env.YTDLP_PATH || 'yt-dlp'
  try {
    await execFileAsync(primary, ['--version'])
    return primary
  } catch (err) {
    if (process.env.YTDLP_PATH) {
      throw new Error(`yt-dlp at YTDLP_PATH "${primary}" is not runnable: ${err.message}`)
    }
    if (err.code !== 'ENOENT') return primary // binary exists; --version itself hiccuped
    const fallback = path.join(os.homedir(), '.local/bin/yt-dlp')
    if (fallback === primary) throw new Error('yt-dlp binary not found')
    await execFileAsync(fallback, ['--version'])
    return fallback
  }
}

const fetchVideoFromYtDlp = async (youtubeUrl) => {
  const videoId = extractVideoId(youtubeUrl)
  const bin = await resolveYtDlpBin()
  let lastErr = new Error('yt-dlp did not return a URL')

  for (const client of YTDL_CLIENTS) {
    let out = ''
    try {
      out = await execFileAsync(bin, [
        '--extractor-args', `youtube:player_client=${client}`,
        '-f', '18/b', '-g', '--no-warnings', '--no-playlist', youtubeUrl,
      ])
    } catch (err) {
      const detail = err.stderr.split('\n').filter(Boolean).pop() || err.message
      lastErr = new Error(`${client}: ${detail}`)
      continue
    }
    const url = out.split('\n').map((line) => line.trim()).find((line) => /^https?:\/\//.test(line))
    if (!url) {
      lastErr = new Error(`${client}: yt-dlp returned no URL`)
      continue
    }

    return {
      url,
      download_url: url,
      streamUrl: url,
      title: '',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      quality: '360p',
      format: 'mp4',
      type: 'video',
      creator: 'yt-dlp (local)',
      source: 'yt-dlp',
      youtubeUrl,
      videoId,
    }
  }

  throw lastErr
}

// Fetch MP4 video download URL with multi-provider strategy.
// excludeSources lets the caller (the proxy's 403-rotation) drop a provider that just served a
// dead link instead of getting the same corpse back from its cache.
const fetchVideoInfo = async (youtubeUrl, { forceRefresh = false, excludeSources = [] } = {}) => {
  const videoId = extractVideoId(youtubeUrl)
  const now = Date.now()

  if (!forceRefresh && videoId && upstreamCache.has(videoId)) {
    const cached = upstreamCache.get(videoId)
    if (cached.expiresAt > now && !excludeSources.includes(cached.data?.source)) {
      return cached.data
    }
    if (cached.expiresAt <= now) {
      upstreamCache.delete(videoId)
    }
  }

  const providers = [
    { source: 'yt-dlp', run: () => fetchVideoFromYtDlp(youtubeUrl) },
    { source: 'omegatech', run: () => fetchVideoFromOmegatech(youtubeUrl) },
    { source: 'savetube-hector', run: () => fetchVideoFromSaveTubeAndHector(youtubeUrl) },
    { source: 'david-cyril', run: () => fetchVideoFromDavidCyril(youtubeUrl, { forceRefresh }) },
  ]

  const failures = []
  for (const provider of providers) {
    if (excludeSources.includes(provider.source)) continue
    try {
      const result = await provider.run()
      const data = { ...result, source: result.source || provider.source }
      if (videoId) {
        upstreamCache.set(videoId, {
          data,
          expiresAt: now + UPSTREAM_CACHE_TTL_MS,
        })
      }
      return data
    } catch (err) {
      failures.push(`${provider.source}: ${err.message}`)
      console.warn(`[Video] ${provider.source} failed for "${youtubeUrl}": ${err.message} - trying next provider`)
    }
  }

  throw new Error(
    failures.length
      ? `All video providers failed -> ${failures.join(' | ')}`
      : `No video providers available (excluded: ${excludeSources.join(', ')})`
  )
}

// Fetch MP4 video download URL from David Cyril API with in-memory caching
const fetchVideoFromDavidCyril = async (youtubeUrl, { forceRefresh = false } = {}) => {
  const videoId = extractVideoId(youtubeUrl)
  const headers = process.env.DCYRIL_API_KEY ? { 'X-API-Key': process.env.DCYRIL_API_KEY } : {}
  const { data } = await axios.get(DC_YTMP4_URL, {
    params: { url: youtubeUrl },
    timeout: 15000,
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
    videoId: videoId || extractVideoId(youtubeUrl),
  }
}

// Get video upstream URL by video ID (resolves or returns cached), plus which provider served it.
// excludeSources drops providers (e.g. one that just returned a 403'd link) for this resolution.
const getVideoUpstream = async (videoId, { forceRefresh = false, excludeSources = [] } = {}) => {
  const cleanId = String(videoId || '').trim()
  if (!YT_ID_RE.test(cleanId)) {
    throw new Error(`Invalid YouTube video ID "${cleanId}"`)
  }
  const youtubeUrl = `https://www.youtube.com/watch?v=${cleanId}`
  const info = await fetchVideoInfo(youtubeUrl, { forceRefresh, excludeSources })
  const url = info.streamUrl || info.download_url
  if (!url) {
    throw new Error(`Video provider "${info.source || 'unknown'}" returned no stream URL`)
  }
  return { url, source: info.source || 'unknown' }
}

const getVideoUpstreamUrl = async (videoId, opts) => (await getVideoUpstream(videoId, opts)).url

// Drop a cached upstream URL so the next resolution picks a different (working) provider.
const invalidateUpstreamCache = (videoId) => {
  const cleanId = String(videoId || '').trim()
  return cleanId ? upstreamCache.delete(cleanId) : false
}

// Get video metadata with proxy URL for /api/videos/stream
const getVideoStreamUrl = async (input, hints = {}, { host = 'localhost:4000', protocol = 'http' } = {}) => {
  const youtubeUrl = await detectYoutubeUrl(input, hints)
  const videoId = extractVideoId(youtubeUrl)
  if (!videoId) {
    throw new Error(`Could not extract video ID for "${input}"`)
  }

  // Pre-warm upstream link fetch in background without blocking response
  fetchVideoInfo(youtubeUrl).catch(() => null)

  const proxyUrl = `${protocol}://${host}/api/videos/play/${videoId}`

  return {
    url: proxyUrl,
    download_url: proxyUrl,
    title: hints.title || input,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    quality: '360p',
    format: 'mp4',
    type: 'video',
    creator: 'SaveTube / Hector',
    source: 'vybe-proxy',
    youtubeUrl,
    videoId,
    durationSec: hints.durationSec,
  }
}

module.exports = {
  findOfficialVideo,
  searchVideos,
  detectYoutubeUrl,
  extractVideoId,
  fetchVideoFromDavidCyril,
  getVideoUpstream,
  getVideoUpstreamUrl,
  invalidateUpstreamCache,
  getVideoStreamUrl,
}
