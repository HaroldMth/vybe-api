const router = require('express').Router()
const { getHome } = require('../helpers/feed')
const { fail } = require('../helpers/respond')

// GET /api/home?country=cm   (country = 2-letter code for the local Apple Music chart; defaults to DEFAULT_COUNTRY)
router.get('/', async (req, res) => {
  try {
    const { meta, ...data } = await getHome(req.query.country)
    res.json({ success: true, data, meta })
  } catch (err) {
    fail(res, err)
  }
})

module.exports = router
