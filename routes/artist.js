const router = require("express").Router()
const { get } = require("../helpers/deezer")
const normalize = require("../helpers/normalize")
const { getArtistBio } = require("../helpers/external")

router.get("/:id", async (req, res) => {
  try {
    const [info, topTracks, albums, related, radio] = await Promise.all([
      get(`/artist/${req.params.id}`),
      get(`/artist/${req.params.id}/top?limit=20`),
      get(`/artist/${req.params.id}/albums?limit=16`),
      get(`/artist/${req.params.id}/related?limit=12`),
      get(`/artist/${req.params.id}/radio?limit=20`)
    ])

    const normalizedInfo = normalize.artist(info)
    let extra = null
    try {
      extra = await getArtistBio(normalizedInfo.name)
    } catch (err) {
      console.warn("Artist metadata failed:", err.message)
    }

    res.json({
      success: true,
      data: {
        info: {
          ...normalizedInfo,
          bio: extra?.bio || "",
          country: extra?.country || null,
          formedYear: extra?.formedYear || null,
          disbandedYear: extra?.disbandedYear || null,
          genres: extra?.genres || [],
          links: extra?.links || {},
          externalStats: extra?.stats || {},
          sourceIds: extra?.sourceIds || {}
        },
        songs: (topTracks.data || []).map(normalize.track),
        albums: (albums.data || []).map(normalize.album),
        related: (related.data || []).map(normalize.artist),
        radio: (radio.data || []).map(normalize.track)
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
