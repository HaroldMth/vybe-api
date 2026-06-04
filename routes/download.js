const router = require('express').Router()
const { getStreamUrl } = require('../helpers/stream')

router.get('/', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  try {
    const result = await getStreamUrl(q)
    // same as stream — frontend handles saving to device
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
