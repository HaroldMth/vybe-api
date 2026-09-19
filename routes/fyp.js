const router = require('express').Router()
const { buildFyp } = require('../helpers/fyp')
const { detectCountry } = require('../helpers/country')
const { fail } = require('../helpers/respond')

const ids = (value, max) => {
  const list = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(list.map((v) => String(v).trim()).filter((v) => /^\d+$/.test(v)))].slice(0, max)
}

const handle = (read) => async (req, res) => {
  try {
    const src = read(req)
    const { country, source } = detectCountry({ query: { country: src.country }, get: (h) => req.get(h) })
    const result = await buildFyp({
      tracks: ids(src.tracks, 6),
      artists: ids(src.artists, 6),
      played: ids(src.played, 300),
      country,
      limit: Math.min(Math.max(Number(src.limit) || 30, 1), 60),
    })
    res.json({ success: true, data: { feed: result.feed, rows: result.rows }, meta: { ...result.meta, countrySource: source } })
  } catch (err) {
    fail(res, err)
  }
}

// GET  /api/fyp?tracks=1,2,3&artists=4,5&played=..&country=za&limit=30
// POST /api/fyp  { tracks: [], artists: [], played: [], country, limit }   (same fields; better for long "played" lists)
router.get('/', handle((req) => req.query))
router.post('/', handle((req) => req.body || {}))

module.exports = router
