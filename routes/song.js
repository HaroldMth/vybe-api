const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')

router.get('/:id', async (req, res) => {
  try {
    const data = await get(`/track/${req.params.id}`)
    res.json({ success: true, data: normalize.track(data) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
