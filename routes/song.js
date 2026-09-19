const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')
const lastfm = require('../helpers/providers/lastfm')
const { getRelatedTracks } = require('../helpers/related')
const { fail, isId } = require('../helpers/respond')

router.get('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'numeric Deezer track id required' })

  try {
    const t = await get(`/track/${req.params.id}`)
    const artistName = t.artist?.name || ''

    const [albumRes, lfmRes] = await Promise.allSettled([
      t.album?.id ? get(`/album/${t.album.id}`) : Promise.resolve(null),
      artistName ? lastfm.trackInfo(artistName, t.title_short || t.title) : Promise.resolve(null),
    ])
    const album = albumRes.status === 'fulfilled' ? albumRes.value : null
    const lfm = lfmRes.status === 'fulfilled' ? lfmRes.value : null

    const base = normalize.track(t)
    res.json({
      success: true,
      data: {
        ...base,
        isrc: t.isrc || null,
        bpm: t.bpm || null,
        releaseDate: t.release_date || album?.release_date || null,
        trackNumber: t.track_position || null,
        discNumber: t.disk_number || null,
        link: t.link || null,
        contributors: (t.contributors || []).map((c) => ({
          id: String(c.id),
          name: c.name,
          role: c.role || null,
          image: c.picture_medium || '',
        })),
        genres: (album?.genres?.data || []).map((g) => g.name),
        label: album?.label || null,
        album: t.album
          ? {
              ...base.album,
              releaseDate: album?.release_date || null,
              nbTracks: album?.nb_tracks ?? null,
              recordType: album?.record_type || null,
            }
          : undefined,
        tags: (lfm?.toptags?.tag || []).map((tag) => tag.name).slice(0, 6),
        stats: {
          listeners: Number(lfm?.listeners) || null,
          playcount: Number(lfm?.playcount) || null,
        },
      },
    })
  } catch (err) {
    fail(res, err)
  }
})

// GET /api/song/:id/related?limit=20
router.get('/:id/related', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'numeric Deezer track id required' })
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)

  try {
    const { seed, songs, sources } = await getRelatedTracks({ trackId: req.params.id, limit })
    res.json({ success: true, data: { songs, seed, sources } })
  } catch (err) {
    fail(res, err)
  }
})

module.exports = router
