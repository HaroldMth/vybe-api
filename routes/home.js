const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')

router.get('/', async (req, res) => {
  try {
    // Deezer charts give us trending tracks, albums, artists, and playlists
    // We also fetch editorial selection and genre list to populate a rich dashboard
    const [chartData, editorial, genres] = await Promise.all([
      get('/chart/0'),
      get('/editorial/0/selection'),
      get('/genre')
    ])

    const trendingTracks = (chartData.tracks?.data || []).map(normalize.track)
    const trendingAlbums = (chartData.albums?.data || []).map(normalize.album)
    const trendingArtists = (chartData.artists?.data || []).map(normalize.artist)
    const editorialPlaylists = (editorial.data || []).map(normalize.playlist)
    
    // Filter out 'All' genre (usually id 0)
    const genreList = (genres.data || [])
      .filter(g => g.id !== 0)
      .map(normalize.genre)

    res.json({
      success: true,
      data: {
        trending: trendingTracks,
        newReleases: trendingAlbums, // use chart albums as new/hot releases
        playlists: editorialPlaylists,
        artists: trendingArtists,
        genres: genreList
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
