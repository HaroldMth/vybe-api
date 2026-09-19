require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
const express = require('express')
const cors = require('cors')
const app = express()
app.set('trust proxy', true)

app.use(cors())
app.use(express.json())

// Rate limits (per IP, per minute). Audio streaming/download are exempt: a single playback makes many range requests.
const { rateLimit } = require('./helpers/ratelimit')
const general = Number(process.env.RATE_LIMIT_PER_MIN) || 120
const heavy = Number(process.env.RATE_LIMIT_HEAVY_PER_MIN) || 20
app.use('/api', rateLimit({ name: 'general', max: general, skip: (req) => /^\/(stream|download|health)(\/|$)/.test(req.path) }))
const heavyLimit = rateLimit({ name: 'heavy', max: heavy })

app.use('/api/health',   require('./routes/health'))
app.use('/api/fyp',      heavyLimit, require('./routes/fyp'))
app.use('/api/radar',    heavyLimit, require('./routes/radar'))
app.use('/api/discovery/bpm', heavyLimit)
app.use('/api/recommendations', heavyLimit)
app.use(/^\/api\/song\/\d+\/related/, heavyLimit)

app.use('/api/home',     require('./routes/home'))
app.use('/api/search',   require('./routes/search'))
app.use('/api/song',     require('./routes/song'))
app.use('/api/artist',   require('./routes/artist'))
app.use('/api/album',    require('./routes/album'))
app.use('/api/playlist', require('./routes/playlist'))
app.use('/api/genre',    require('./routes/genre'))
app.use('/api/lyrics',   require('./routes/lyrics'))
app.use('/api/stream',   require('./routes/stream'))
app.use('/api/download', require('./routes/download'))
app.use('/api/recommendations', require('./routes/recommendations'))
app.use('/api/videos', require('./routes/videos'))
app.use('/api/charts', require('./routes/charts'))
app.use('/api/discovery', require('./routes/discovery'))

app.get('/', (req, res) => res.json({ app: 'VYBE API', status: 'running' }))

module.exports = app // for tests

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => {
    console.log(`VYBE API running on port ${PORT}`)
    // Pre-build the home feed so the first visitor doesn't pay for a cold cache.
    require('./helpers/feed').warm()
  })
}
