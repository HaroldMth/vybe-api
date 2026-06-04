const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')

router.get('/', async (req, res) => {
  const { id = '0' } = req.query

  try {
    const chart = await get(`/chart/${id}`)

    res.json({
      success: true,
      data: {
        songs: (chart.tracks?.data || []).map(normalize.track),
        albums: (chart.albums?.data || []).map(normalize.album),
        artists: (chart.artists?.data || []).map(normalize.artist),
        playlists: (chart.playlists?.data || []).map(normalize.playlist),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/genre/:id', async (req, res) => {
  try {
    const [genreDetails, artistsRes, radiosRes] = await Promise.all([
      get(`/genre/${req.params.id}`),
      get(`/genre/${req.params.id}/artists`),
      get(`/genre/${req.params.id}/radios`),
    ])

    let songs = []
    const radioIds = (radiosRes.data || []).slice(0, 3).map((radio) => radio.id)
    const radioResults = await Promise.allSettled(
      radioIds.map((radioId) => get(`/radio/${radioId}/tracks`, { limit: 15 }))
    )

    radioResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        songs = songs.concat((result.value.data || []).map(normalize.track))
      }
    })

    res.json({
      success: true,
      data: {
        genre: normalize.genre(genreDetails),
        songs: songs.slice(0, 30),
        artists: (artistsRes.data || []).map(normalize.artist),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
