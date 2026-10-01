const router = require('express').Router()
const axios = require('axios')
const { searchMusicVideos } = require('../helpers/external')
const { findOfficialVideo, searchVideos, getVideoStreamUrl, getVideoUpstream, invalidateUpstreamCache } = require('../helpers/videos')
const { fail } = require('../helpers/respond')

const str = (value) => (value == null ? '' : String(Array.isArray(value) ? value[0] : value).trim())

let activeProxyStreams = 0
const MAX_CONCURRENT_PROXIES = 15

// Apple music-video catalogue (30s previews) - unchanged.
router.get('/', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  try {
    const videos = await searchMusicVideos(q, 12)
    res.json({ success: true, data: videos })
  } catch (err) {
    res.json({ success: true, data: [], message: err.message })
  }
})

// Song -> its official music video, as YouTube embed metadata.
router.get('/for-song', async (req, res) => {
  const q = str(req.query.q)
  const title = str(req.query.title)
  if (!q && !title) return res.status(400).json({ success: false, message: 'title or q param required' })

  const duration = Number(str(req.query.duration))
  try {
    const video = await findOfficialVideo({
      query: q,
      title,
      artist: str(req.query.artist),
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    })
    if (!video) return res.status(404).json({ success: false, message: 'No matching music video found' })
    res.json({ success: true, data: video })
  } catch (err) {
    fail(res, err)
  }
})

// Free-text search returning several embeddable YouTube videos.
router.get('/search', async (req, res) => {
  const q = str(req.query.q)
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })
  const limit = Math.min(Math.max(parseInt(str(req.query.limit), 10) || 10, 1), 20)

  try {
    res.json({ success: true, data: await searchVideos(q, { limit }) })
  } catch (err) {
    fail(res, err)
  }
})

// Video stream/download resolution
const handleVideoStream = async (req, res) => {
  const input = str(req.query.url || req.query.q || req.query.v || req.query.id || req.query.videoId)
  const title = str(req.query.title)
  const artist = str(req.query.artist)

  console.log(`[VideoApi] GET /stream request: input="${input}" title="${title}" artist="${artist}"`)

  if (!input && !title) {
    return res.status(400).json({ success: false, message: 'url, q, v, id, or title param required' })
  }

  const duration = Number(str(req.query.duration))

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Video resolution timeout')), 45000)
    )

    const streamPromise = getVideoStreamUrl(
      input,
      {
        title,
        artist,
        durationSec: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      },
      {
        host: req.get('host') || 'localhost:4000',
        protocol: req.protocol || 'http',
      }
    )

    const streamData = await Promise.race([streamPromise, timeoutPromise])
    console.log(`[VideoApi] Stream resolved successfully for "${input}": url=${streamData.url}`)
    res.json({ success: true, data: streamData })
  } catch (err) {
    console.error(`[VideoApi] Stream resolution failed for "${input}": ${err.message}`)
    fail(res, err)
  }
}

router.get('/stream', handleVideoStream)
router.get('/download', handleVideoStream)

// Proxy video stream: GET /api/videos/play/:id
router.get('/play/:id', async (req, res) => {
  const id = str(req.params.id)
  const clientIp = req.ip || req.socket.remoteAddress
  if (!id) return res.status(400).json({ success: false, message: 'Video ID required' })

  if (activeProxyStreams >= MAX_CONCURRENT_PROXIES) {
    console.warn(`[VideoProxy] 503 Busy: max concurrency (${MAX_CONCURRENT_PROXIES}) reached for client ${clientIp}`)
    return res.status(503).json({ success: false, message: 'Server busy: max video stream concurrency reached' })
  }

  activeProxyStreams++
  let isClosed = false
  const clientRange = req.headers.range

  console.log(`[VideoProxy] ▶ START id="${id}" | Range="${clientRange || 'none'}" | Client=${clientIp} | Active=${activeProxyStreams}`)

  const cleanup = (reason) => {
    if (!isClosed) {
      isClosed = true
      activeProxyStreams = Math.max(0, activeProxyStreams - 1)
      console.log(`[VideoProxy] ■ END id="${id}" (${reason}) | Active=${activeProxyStreams}`)
    }
  }

  req.on('close', () => cleanup('req close'))
  res.on('finish', () => cleanup('res finish'))

  let cancelSource = axios.CancelToken.source()

  req.on('aborted', () => {
    console.log(`[VideoProxy] Client aborted request for id="${id}"`)
    cancelSource.cancel('Client aborted request')
  })

  try {
    const t0 = Date.now()
    console.log(`[VideoProxy] Resolving upstream URL for id="${id}"...`)
    let current = await getVideoUpstream(id)
    console.log(`[VideoProxy] Upstream URL resolved in ${Date.now() - t0}ms via "${current.source}" -> ${current.url}`)

    const fetchUpstream = async (url) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      }
      if (clientRange) {
        headers['Range'] = clientRange
      }

      console.log(`[VideoProxy] Connecting upstream -> ${url.substring(0, 90)}... (Range: ${clientRange || 'none'})`)
      return axios({
        method: 'get',
        url,
        headers,
        responseType: 'stream',
        timeout: 15000,
        cancelToken: cancelSource.token,
        validateStatus: (status) => (status >= 200 && status < 300) || status === 206,
      })
    }

    // On ANY upstream failure (403 from a stale cached link, timeout, 5xx): drop the cached URL,
    // exclude the provider that just failed, and rotate to the next one — up to 4 providers total.
    const failedSources = []
    let upstreamRes = null
    let lastUpstreamErr = null

    for (let attempt = 0; attempt < 4 && !upstreamRes; attempt++) {
      if (attempt > 0) {
        current = await getVideoUpstream(id, { excludeSources: failedSources })
        console.log(`[VideoProxy] Rotating to provider "${current.source}" (excluded: ${failedSources.join(', ')}) -> ${current.url.substring(0, 90)}...`)
      }
      try {
        upstreamRes = await fetchUpstream(current.url)
        console.log(`[VideoProxy] Upstream connected! Status=${upstreamRes.status} Content-Type=${upstreamRes.headers['content-type']} Content-Length=${upstreamRes.headers['content-length']}`)
      } catch (err) {
        if (axios.isCancel(err)) throw err
        const status = err.response?.status
        console.warn(`[VideoProxy] Upstream fetch failed via "${current.source}" for "${id}": status=${status || 'none'} err=${err.message}`)
        failedSources.push(current.source)
        invalidateUpstreamCache(id)
        lastUpstreamErr = err
      }
    }

    if (!upstreamRes) {
      throw lastUpstreamErr || new Error('no upstream video provider available')
    }

    res.status(upstreamRes.status)

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Accept-Ranges', 'bytes')

    if (upstreamRes.headers['content-range']) {
      res.setHeader('Content-Range', upstreamRes.headers['content-range'])
    }
    if (upstreamRes.headers['content-length']) {
      res.setHeader('Content-Length', upstreamRes.headers['content-length'])
    }

    console.log(`[VideoProxy] Piping stream to client for id="${id}" (HTTP ${upstreamRes.status})...`)
    upstreamRes.data.pipe(res)
  } catch (err) {
    cleanup('error')
    if (!res.headersSent) {
      console.error(`[VideoProxy] ERROR for "${id}":`, err.message)
      res.status(502).json({ success: false, message: `Video proxy stream failed: ${err.message}` })
    }
  }
})

module.exports = router
