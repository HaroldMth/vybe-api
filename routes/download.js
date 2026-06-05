const router = require('express').Router()
const { getStreamUrl } = require('../helpers/stream')

router.get('/', async (req, res) => {
  const { q, title, artist, duration, deezerId } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })
  const durationSec = duration ? Number(duration) : undefined
  const parsedDeezerId = deezerId ? Number(deezerId) : undefined
  const hints = {
    title: title ? String(title).trim() : undefined,
    artist: artist ? String(artist).trim() : undefined,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
    deezerId: Number.isFinite(parsedDeezerId) && parsedDeezerId > 0 ? parsedDeezerId : undefined,
  }

  try {
    const result = await getStreamUrl(q, hints)
    // same as stream — frontend handles saving to device
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
