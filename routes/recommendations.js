const router = require('express').Router()
const { get, soft } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')
const lastfm = require('../helpers/providers/lastfm')
const { getRelatedTracks, getRelatedArtists } = require('../helpers/related')
const { resolveTrack, mapSoft } = require('../helpers/resolve')
const { fail, isId } = require('../helpers/respond')

const clampLimit = (value, fallback = 20) => Math.min(Math.max(Number(value) || fallback, 1), 50)

const respondTracks = async (res, params) => {
  const { seed, songs, sources } = await getRelatedTracks(params)
  res.json({ success: true, data: { songs, seed, sources, source: songs.length ? 'recommendations' : 'empty' } })
}

// GET /api/recommendations/track?artist=Coldplay&track=Yellow   (legacy, name based)
router.get('/track', async (req, res) => {
  const { artist, track, id } = req.query
  const limit = clampLimit(req.query.limit)

  try {
    if (id && isId(id)) return await respondTracks(res, { trackId: id, limit })
    if (!artist || !track) {
      return res.status(400).json({ success: false, message: 'artist and track params required (or id)' })
    }

    const { seed, songs, sources } = await getRelatedTracks({ artist, track, limit })
    if (songs.length) {
      return res.json({ success: true, data: { songs, seed, sources, source: 'recommendations' } })
    }

    // Nothing resolved at all: plain search so the UI still gets something
    const fallback = await get('/search', { q: `${artist} ${track}`, limit })
    res.json({ success: true, data: { songs: (fallback.data || []).map(normalize.track), seed, sources, source: 'fallback' } })
  } catch (err) {
    fail(res, err)
  }
})

// GET /api/recommendations/track/:id
router.get('/track/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'numeric Deezer track id required' })
  try {
    await respondTracks(res, { trackId: req.params.id, limit: clampLimit(req.query.limit) })
  } catch (err) {
    fail(res, err)
  }
})

// GET /api/recommendations/artist?artist=Name   or   /artist/:id
router.get('/artist', async (req, res) => {
  const { artist } = req.query
  if (!artist) return res.status(400).json({ success: false, message: 'artist param required' })
  try {
    const artists = await getRelatedArtists({ artist, limit: clampLimit(req.query.limit, 12) })
    res.json({ success: true, data: { artists } })
  } catch (err) {
    fail(res, err)
  }
})

router.get('/artist/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'numeric Deezer artist id required' })
  try {
    const artists = await getRelatedArtists({ artistId: req.params.id, limit: clampLimit(req.query.limit, 12) })
    res.json({ success: true, data: { artists } })
  } catch (err) {
    fail(res, err)
  }
})

// GET /api/recommendations/tag/:tag
// Last.fm tag charts when LASTFM_KEY is set; otherwise tracks from Deezer playlists that match the tag.
router.get('/tag/:tag', async (req, res) => {
  const tag = req.params.tag
  const limit = clampLimit(req.query.limit)

  try {
    let songs = []
    let source = 'deezer-playlists'

    if (lastfm.enabled()) {
      const tagged = await lastfm.tagTracks(tag, limit).catch(() => [])
      const hydrated = await mapSoft(tagged.slice(0, limit), (t) => resolveTrack({ title: t.name, artist: t.artist }), 4)
      songs = hydrated.filter(Boolean)
      if (songs.length) source = 'lastfm'
    }

    if (!songs.length) {
      const playlists = (await soft('/search/playlist', { q: tag, limit: 3 }))?.data || []
      const lists = await Promise.all(playlists.map((p) => soft(`/playlist/${p.id}/tracks`, { limit: 30 })))
      const seen = new Set()
      songs = lists
        .flatMap((l) => l?.data || [])
        .filter((t) => t?.id && !seen.has(t.id) && seen.add(t.id))
        .slice(0, limit)
        .map(normalize.track)
      source = 'deezer-playlists'
    }

    res.json({ success: true, data: { tag, songs, source } })
  } catch (err) {
    fail(res, err)
  }
})

module.exports = router
