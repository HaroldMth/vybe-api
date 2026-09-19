const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')
const { norm } = require('../helpers/text')

// Best single match for the query: exact artist > exact album > exact track title > first song.
const pickTop = (q, { songs, artists, albums }) => {
  const n = norm(q)
  const artist = artists.find((a) => norm(a.name) === n)
  if (artist) return { type: 'artist', item: artist }
  const album = albums.find((a) => norm(a.name) === n)
  if (album) return { type: 'album', item: album }
  const song = songs.find((s) => norm(s.name) === n)
  if (song) return { type: 'song', item: song }
  return songs[0] ? { type: 'song', item: songs[0] } : null
}

// GET /api/search/suggest?q=cold  -> up to 8 typeahead suggestions (artists first, then songs, then albums)
router.get('/suggest', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json({ success: true, data: { suggestions: [] } })

  const [artists, songs, albums] = await Promise.allSettled([
    get('/search/artist', { q, limit: 3 }),
    get('/search', { q, limit: 5 }),
    get('/search/album', { q, limit: 2 }),
  ])
  const list = (r) => (r.status === 'fulfilled' ? r.value.data || [] : [])

  const seen = new Set()
  const suggestions = [
    ...list(artists).map((a) => ({ type: 'artist', id: String(a.id), text: a.name, subtitle: 'Artist', image: a.picture_medium || '' })),
    ...list(songs).map((t) => ({ type: 'song', id: String(t.id), text: t.title_short || t.title, subtitle: t.artist?.name || '', image: t.album?.cover_medium || '' })),
    ...list(albums).map((a) => ({ type: 'album', id: String(a.id), text: a.title, subtitle: a.artist?.name || 'Album', image: a.cover_medium || '' })),
  ]
    .filter((s) => s.text && !seen.has(`${s.type}:${norm(s.text)}:${norm(s.subtitle)}`) && seen.add(`${s.type}:${norm(s.text)}:${norm(s.subtitle)}`))
    .slice(0, 8)

  res.json({ success: true, data: { suggestions } })
})

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

    const data = {
      songs: (tracksRes.data || []).map(normalize.track),
      artists: (artistsRes.data || []).map(normalize.artist),
      albums: (albumsRes.data || []).map(normalize.album),
      playlists: (playlistsRes.data || []).map(normalize.playlist),
    }

    res.json({ success: true, data: { top: pickTop(q, data), ...data } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
