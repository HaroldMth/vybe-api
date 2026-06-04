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

module.exports = router
