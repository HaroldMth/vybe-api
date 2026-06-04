const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')

// Get all genres
router.get('/', async (req, res) => {
  try {
    const genres = await get('/genre')
    const genreList = (genres.data || [])
      .filter(g => g.id !== 0)
      .map(normalize.genre)
    
    res.json({ success: true, data: genreList })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// Get specific genre info, its top artists, and top tracks
router.get('/:id', async (req, res) => {
  try {
    const genreId = req.params.id
    const [genreDetails, artistsRes, radiosRes] = await Promise.all([
      get(`/genre/${genreId}`),
      get(`/genre/${genreId}/artists`),
      get(`/genre/${genreId}/radios`)
    ])

    // Fetch tracks from the genre's radio if radio exists
    let tracks = []
    if (radiosRes.data && radiosRes.data.length > 0) {
      // Use the first radio ID for this genre to fetch tracks
      const radioId = radiosRes.data[0].id
      try {
        const radioTracks = await get(`/radio/${radioId}/tracks?limit=20`)
        tracks = (radioTracks.data || []).map(normalize.track)
      } catch (e) {
        console.error('Failed to fetch radio tracks for genre', e.message)
      }
    }

    res.json({
      success: true,
      data: {
        genre: normalize.genre(genreDetails),
        artists: (artistsRes.data || []).map(normalize.artist),
        songs: tracks
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
