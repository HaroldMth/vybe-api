const router = require('express').Router()
const { searchMusicVideos } = require('../helpers/external')

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

module.exports = router
