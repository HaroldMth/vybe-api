const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')

const lanes = [
  { id: 'fresh', title: 'Fresh Drops', query: 'new music' },
  { id: 'throwback', title: 'Throwback', query: '2000s hits' },
  { id: 'hidden', title: 'Hidden Gems', query: 'indie alternative' },
  { id: 'chill', title: 'Chill Mode', query: 'chill vibes' },
  { id: 'workout', title: 'High Energy', query: 'workout hits' },
]

router.get('/', async (req, res) => {
  try {
    const results = await Promise.allSettled(
      lanes.map((lane) => get('/search', { q: lane.query, limit: 15 }))
    )

    const data = lanes.map((lane, index) => ({
      ...lane,
      songs: results[index].status === 'fulfilled'
        ? (results[index].value.data || []).map(normalize.track)
        : [],
    }))

    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ---- Tempo lanes -------------------------------------------------------------------------------
const { LANES, tracksInBpmRange } = require('../helpers/bpm')
const { fail } = require('../helpers/respond')

// GET /api/discovery/bpm/lanes
router.get('/bpm/lanes', (req, res) => res.json({ success: true, data: LANES }))

// GET /api/discovery/bpm?lane=running            (or ?min=120&max=150)  &genre=0  &limit=20
router.get('/bpm', async (req, res) => {
  const lane = LANES.find((l) => l.id === req.query.lane)
  const min = Number(lane ? lane.min : req.query.min)
  const max = Number(lane ? lane.max : req.query.max)
  const genre = /^\d+$/.test(String(req.query.genre ?? '0')) ? String(req.query.genre ?? '0') : null

  if (!(min >= 40 && max <= 250 && min < max)) {
    return res.status(400).json({ success: false, message: 'give ?lane=chill|focus|workout|running or ?min=&max= (40-250, min < max)' })
  }
  if (genre === null) return res.status(400).json({ success: false, message: 'genre must be a numeric Deezer genre id' })

  try {
    const data = await tracksInBpmRange({ min, max, genre, limit: Math.min(Math.max(Number(req.query.limit) || 20, 1), 50) })
    res.json({ success: true, data: { lane: lane || null, ...data } })
  } catch (err) {
    fail(res, err)
  }
})

module.exports = router
