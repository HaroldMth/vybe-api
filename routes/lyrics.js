const router = require('express').Router()
const { fetchLyrics } = require('../helpers/lyrics')

router.get('/', async (req, res) => {
  const { q, title, artist } = req.query
  if (!q && !(title && artist)) {
    return res.status(400).json({ success: false, message: 'q or title+artist required' })
  }

  try {
    const result = await fetchLyrics({ q, title, artist })

    if (result.type === 'none') {
      return res.json({ success: false, lyrics: null, data: result })
    }

    res.json({ success: true, data: result })
  } catch (err) {
    res.json({ success: false, lyrics: null, message: err.message })
  }
})

module.exports = router
