const router = require("express").Router()
const { get } = require("../helpers/deezer")
const normalize = require("../helpers/normalize")
const { getAlbumInfo } = require("../helpers/external")

const totalDuration = (songs) => songs.reduce((sum, song) => sum + (song.duration || 0), 0)

router.get("/:id", async (req, res) => {
  try {
    const [albumDetails, tracksRes] = await Promise.all([
      get(`/album/${req.params.id}`),
      get(`/album/${req.params.id}/tracks`)
    ])

    const normalizedAlbum = normalize.album(albumDetails)
    normalizedAlbum.songs = (tracksRes.data || []).map(t => {
      t.album = {
        id: albumDetails.id,
        title: albumDetails.title,
        cover_small: albumDetails.cover_small,
        cover_medium: albumDetails.cover_medium,
        cover_big: albumDetails.cover_big,
        cover_xl: albumDetails.cover_xl
      }
      return normalize.track(t)
    })

    let extra = null
    try {
      extra = await getAlbumInfo(normalizedAlbum.name, normalizedAlbum.artists?.primary?.[0]?.name)
    } catch (err) {
      console.warn("Album metadata failed:", err.message)
    }

    res.json({
      success: true,
      data: {
        ...normalizedAlbum,
        totalDuration: totalDuration(normalizedAlbum.songs),
        description: extra?.description || "",
        label: extra?.label || albumDetails.label || null,
        genre: extra?.genre || null,
        style: extra?.style || null,
        mood: extra?.mood || null,
        sourceIds: {
          musicBrainz: extra?.musicBrainzId || null,
          audioDb: extra?.audioDbId || null
        }
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
