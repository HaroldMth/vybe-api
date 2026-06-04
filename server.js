require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/home',     require('./routes/home'))
app.use('/api/search',   require('./routes/search'))
app.use('/api/song',     require('./routes/song'))
app.use('/api/artist',   require('./routes/artist'))
app.use('/api/album',    require('./routes/album'))
app.use('/api/genre',    require('./routes/genre'))
app.use('/api/lyrics',   require('./routes/lyrics'))
app.use('/api/stream',   require('./routes/stream'))
app.use('/api/download', require('./routes/download'))
app.use('/api/recommendations', require('./routes/recommendations'))
app.use('/api/videos', require('./routes/videos'))
app.use('/api/charts', require('./routes/charts'))
app.use('/api/discovery', require('./routes/discovery'))

app.get('/', (req, res) => res.json({ app: 'VYBE API', status: 'running' }))

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`VYBE API running on port ${PORT}`))
