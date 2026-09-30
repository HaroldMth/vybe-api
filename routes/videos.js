const router = require('express').Router()
const { searchMusicVideos } = require('../helpers/external')
const { findOfficialVideo, searchVideos, getVideoStreamUrl } = require('../helpers/videos')
const { fail } = require('../helpers/respond')

const str = (value) => (value == null ? '' : String(Array.isArray(value) ? value[0] : value).trim())

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
// GET /api/videos/for-song?title=Yellow&artist=Coldplay&duration=269   (or ?q=Coldplay - Yellow)
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
// GET /api/videos/search?q=coldplay&limit=8
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

// Video stream/download resolution using David Cyril ytmp4 API
// GET /api/videos/stream?url=https://www.youtube.com/watch?v=...
// GET /api/videos/stream?q=Rick+Astley+Never+Gonna+Give+You+Up
// GET /api/videos/download?url=...
const handleVideoStream = async (req, res) => {
  const input = str(req.query.url || req.query.q || req.query.v || req.query.id || req.query.videoId)
  const title = str(req.query.title)
  const artist = str(req.query.artist)

  if (!input && !title) {
    return res.status(400).json({ success: false, message: 'url, q, v, id, or title param required' })
  }

  const duration = Number(str(req.query.duration))

  try {
    const streamData = await getVideoStreamUrl(input, {
      title,
      artist,
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    })
    res.json({ success: true, data: streamData })
  } catch (err) {
    fail(res, err)
  }
}

router.get('/stream', handleVideoStream)
router.get('/download', handleVideoStream)

module.exports = router
