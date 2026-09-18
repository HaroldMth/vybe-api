const router = require('express').Router()
const { get } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')

router.get('/:id', async (req, res) => {
  try {
    const [playlistDetails, tracksRes] = await Promise.all([
      get(`/playlist/${req.params.id}`),
      get(`/playlist/${req.params.id}/tracks`, { limit: 100 }),
    ])

    const normalized = normalize.playlist(playlistDetails)
    const songs = (tracksRes.data || []).map((track) => {
      if (!track.album && playlistDetails.picture_medium) {
        track.album = {
          id: playlistDetails.id,
          title: playlistDetails.title,
          cover_small: playlistDetails.picture_small,
          cover_medium: playlistDetails.picture_medium,
          cover_big: playlistDetails.picture_big,
          cover_xl: playlistDetails.picture_xl,
        }
      }
      return normalize.track(track)
    })

    res.json({
      success: true,
      data: {
        ...normalized,
        songs,
        creator: playlistDetails.creator?.name || null,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
