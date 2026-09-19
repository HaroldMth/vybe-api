const router = require('express').Router()
const { getHome } = require('../helpers/feed')
const { fail } = require('../helpers/respond')
const { detectCountry } = require('../helpers/country')

// GET /api/home?country=za
// The app should send the phone's region as ?country= (or an X-Country header). If it doesn't, the server tries
// CDN geo headers and Accept-Language. If nothing is found, country sections are left empty (no guessing).
router.get('/', async (req, res) => {
  try {
    const { country, source } = detectCountry(req)
    const { meta, ...data } = await getHome(country)
    res.json({ success: true, data, meta: { ...meta, country, countrySource: source } })
  } catch (err) {
    fail(res, err)
  }
})

module.exports = router
