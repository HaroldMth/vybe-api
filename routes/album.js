const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')
const { getAlbumInfo } = require('../helpers/external')
const { fail, isId } = require('../helpers/respond')

const totalDuration = (songs) => songs.reduce((sum, song) => sum + (song.duration || 0), 0)

router.get('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'numeric Deezer album id required' })

  try {
    const [albumDetails, tracksRes] = await Promise.all([
      get(`/album/${req.params.id}`),
      get(`/album/${req.params.id}/tracks`, { limit: 100 }),
    ])

    const normalizedAlbum = normalize.album(albumDetails)
    normalizedAlbum.songs = (tracksRes.data || []).map((t) => {
      t.album = {
        id: albumDetails.id,
        title: albumDetails.title,
        cover_small: albumDetails.cover_small,
        cover_medium: albumDetails.cover_medium,
        cover_big: albumDetails.cover_big,
        cover_xl: albumDetails.cover_xl,
      }
      // defensive: make sure every track carries an artist
      if (!t.artist && albumDetails.artist) t.artist = albumDetails.artist
      return normalize.track(t)
    })

    let extra = null
    try {
      extra = await getAlbumInfo(normalizedAlbum.name, normalizedAlbum.artists?.primary?.[0]?.name)
    } catch (err) {
      console.warn('Album metadata failed:', err.message)
    }

    const deezerGenres = (albumDetails.genres?.data || []).map((g) => g.name)

    res.json({
      success: true,
      data: {
        ...normalizedAlbum,
        totalDuration: albumDetails.duration || totalDuration(normalizedAlbum.songs),
        fans: albumDetails.fans ?? null,
        upc: albumDetails.upc || null,
        genres: deezerGenres,
        description: extra?.description || '',
        descriptionSource: extra?.descriptionSource || null,
        label: albumDetails.label || extra?.label || null,
        genre: deezerGenres[0] || extra?.genre || null,
        style: extra?.style || null,
        mood: extra?.mood || null,
        links: { wikipedia: extra?.wikipediaUrl || null, deezer: albumDetails.link || null },
        sourceIds: {
          musicBrainz: extra?.musicBrainzId || null,
          audioDb: extra?.audioDbId || null,
        },
      },
    })
  } catch (err) {
    fail(res, err)
  }
})

module.exports = router
