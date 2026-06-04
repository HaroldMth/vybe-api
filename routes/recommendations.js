const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')
const { getSimilarTracks, getSimilarArtists, getTagTracks } = require('../helpers/external')

const hydrateTracks = async (items) => {
  const settled = await Promise.allSettled(
    items.slice(0, 16).map((item) =>
      get('/search', { q: `${item.artist} ${item.name}`, limit: 1 })
    )
  )

  return settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value?.data?.[0])
    .filter(Boolean)
    .map(normalize.track)
}

const hydrateArtists = async (items) => {
  const settled = await Promise.allSettled(
    items.slice(0, 12).map((item) =>
      get('/search/artist', { q: item.name, limit: 1 })
    )
  )

  return settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value?.data?.[0])
    .filter(Boolean)
    .map(normalize.artist)
}

router.get('/track', async (req, res) => {
  const { artist, track } = req.query
  if (!artist || !track) {
    return res.status(400).json({ success: false, message: 'artist and track params required' })
  }

  try {
    const similar = await getSimilarTracks(artist, track, 16)
    let songs = await hydrateTracks(similar)

    if (songs.length === 0) {
      const fallback = await get('/search', { q: artist, limit: 16 })
      songs = (fallback.data || []).map(normalize.track)
    }

    res.json({ success: true, data: { songs, source: songs.length ? 'recommendations' : 'fallback' } })
  } catch (err) {
    try {
      const fallback = await get('/search', { q: `${artist} ${track}`, limit: 16 })
      res.json({ success: true, data: { songs: (fallback.data || []).map(normalize.track), source: 'fallback' } })
    } catch (fallbackErr) {
      res.status(500).json({ success: false, message: err.message })
    }
  }
})

router.get('/artist', async (req, res) => {
  const { artist } = req.query
  if (!artist) return res.status(400).json({ success: false, message: 'artist param required' })

  try {
    const similar = await getSimilarArtists(artist, 12)
    let artists = await hydrateArtists(similar)

    if (artists.length === 0) {
      const fallback = await get('/search/artist', { q: artist, limit: 12 })
      artists = (fallback.data || []).map(normalize.artist)
    }

    res.json({ success: true, data: { artists } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/tag/:tag', async (req, res) => {
  try {
    const tagged = await getTagTracks(req.params.tag, 20)
    let songs = await hydrateTracks(tagged)

    if (songs.length === 0) {
      const fallback = await get('/search', { q: req.params.tag, limit: 20 })
      songs = (fallback.data || []).map(normalize.track)
    }

    res.json({ success: true, data: { tag: req.params.tag, songs } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
