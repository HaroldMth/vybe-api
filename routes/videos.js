const router = require('express').Router()
const axios = require('axios')
const { searchMusicVideos } = require('../helpers/external')
const { findOfficialVideo, searchVideos, getVideoStreamUrl, getVideoUpstreamUrl } = require('../helpers/videos')
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
    res.json({ success: true, data: streamData })
  } catch (err) {
    fail(res, err)
  }
}

router.get('/stream', handleVideoStream)
router.get('/download', handleVideoStream)

// Proxy video stream: GET /api/videos/play/:id
router.get('/play/:id', async (req, res) => {
  const id = str(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: 'Video ID required' })

  if (activeProxyStreams >= MAX_CONCURRENT_PROXIES) {
    return res.status(503).json({ success: false, message: 'Server busy: max video stream concurrency reached' })
  }

  activeProxyStreams++
  let isClosed = false
  const clientRange = req.headers.range

  console.log(`[VideoProxy] Request for id="${id}" | Range="${clientRange || 'none'}" | Active=${activeProxyStreams}`)

  const cleanup = () => {
    if (!isClosed) {
      isClosed = true
      activeProxyStreams = Math.max(0, activeProxyStreams - 1)
    }
  }

  req.on('close', cleanup)
  res.on('finish', cleanup)

  let cancelSource = axios.CancelToken.source()

  req.on('aborted', () => {
    cancelSource.cancel('Client aborted request')
  })

  try {
    let upstreamUrl = await getVideoUpstreamUrl(id)

    const fetchUpstream = async (url) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      }
      if (clientRange) {
        headers['Range'] = clientRange
      }

      return axios({
        method: 'get',
        url,
        headers,
        responseType: 'stream',
        timeout: 45000,
        cancelToken: cancelSource.token,
        validateStatus: (status) => (status >= 200 && status < 300) || status === 206,
      })
    }

    let upstreamRes
    try {
      upstreamRes = await fetchUpstream(upstreamUrl)
    } catch (err) {
      const status = err.response?.status
      if (status === 403 || status === 410) {
        console.log(`[VideoProxy] Upstream returned ${status} for "${id}". Retrying once with fresh link...`)
        upstreamUrl = await getVideoUpstreamUrl(id, { forceRefresh: true })
        cancelSource = axios.CancelToken.source()
        req.on('close', () => cancelSource.cancel('Client disconnected'))
        upstreamRes = await fetchUpstream(upstreamUrl)
      } else {
        throw err
      }
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

    upstreamRes.data.pipe(res)
  } catch (err) {
    cleanup()
    if (!res.headersSent) {
      console.error(`[VideoProxy] Failed for "${id}":`, err.message)
      res.status(502).json({ success: false, message: `Video proxy stream failed: ${err.message}` })
    }
  }
})

module.exports = router
