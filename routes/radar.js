const router = require('express').Router()
const { getReleaseRadar } = require('../helpers/radar')
const { fail } = require('../helpers/respond')

const ids = (value) => {
  const list = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(list.map((v) => String(v).trim()).filter((v) => /^\d+$/.test(v)))].slice(0, 30)
}

const handle = (read) => async (req, res) => {
  const src = read(req)
  const artistIds = ids(src.artists)
  if (!artistIds.length) return res.status(400).json({ success: false, message: 'artists param required (comma-separated Deezer artist IDs, max 30)' })

  try {
    const data = await getReleaseRadar({
      artistIds,
      days: Math.min(Math.max(Number(src.days) || 60, 1), 365),
      limit: Math.min(Math.max(Number(src.limit) || 30, 1), 60),
    })
    res.json({ success: true, data })
  } catch (err) {
    fail(res, err)
  }
}

// GET /api/radar?artists=1,2,3&days=60&limit=30     (POST with the same fields as JSON also works)
router.get('/', handle((req) => req.query))
router.post('/', handle((req) => req.body || {}))

module.exports = router
