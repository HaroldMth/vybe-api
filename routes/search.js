const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')

router.get('/', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  try {
    const [tracksResult, artistsResult, albumsResult, playlistsResult] = await Promise.allSettled([
      get('/search', { q, limit: 15 }),
      get('/search/artist', { q, limit: 5 }),
      get('/search/album', { q, limit: 5 }),
      get('/search/playlist', { q, limit: 8 })
    ])

    const tracksRes = tracksResult.status === 'fulfilled' ? tracksResult.value : { data: [] }
    const artistsRes = artistsResult.status === 'fulfilled' ? artistsResult.value : { data: [] }
    const albumsRes = albumsResult.status === 'fulfilled' ? albumsResult.value : { data: [] }
    const playlistsRes = playlistsResult.status === 'fulfilled' ? playlistsResult.value : { data: [] }

    res.json({
      success: true,
      data: {
        songs: (tracksRes.data || []).map(normalize.track),
        artists: (artistsRes.data || []).map(normalize.artist),
        albums: (albumsRes.data || []).map(normalize.album),
        playlists: (playlistsRes.data || []).map(normalize.playlist)
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
