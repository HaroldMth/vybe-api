const router = require('express').Router()
const { get, soft } = require('../helpers/deezer')
const normalize = require('../helpers/normalize')
const { getArtistBio } = require('../helpers/external')
const { fetchAlbums } = require('../helpers/discography')
const { getRelatedArtists } = require('../helpers/related')
const { fail, isId } = require('../helpers/respond')

router.get('/:id', async (req, res) => {
  const { id } = req.params
  if (!isId(id)) return res.status(400).json({ success: false, message: 'numeric Deezer artist id required' })

  try {
    // The artist itself is required; everything else degrades to an empty list.
    const info = await get(`/artist/${id}`)
    const normalizedInfo = normalize.artist(info)

    const [topTracks, albumList, related, radio, extra] = await Promise.all([
      soft(`/artist/${id}/top`, { limit: 20 }),
      fetchAlbums(id).catch(() => []),
      getRelatedArtists({ artistId: id, artist: normalizedInfo.name, limit: 12 }).catch(() => []),
      soft(`/artist/${id}/radio`, { limit: 20 }),
      getArtistBio(normalizedInfo.name).catch((err) => {
        console.warn('Artist metadata failed:', err.message)
        return null
      }),
    ])

    const albums = albumList.map(normalize.album)
    const byType = (type) => albums.filter((a) => a.recordType === type)

    res.json({
      success: true,
      data: {
        info: {
          ...normalizedInfo,
          bio: extra?.bio || '',
          bioSource: extra?.bioSource || null,
          country: extra?.country || null,
          countryCode: extra?.countryCode || null,
          type: extra?.type || null,
          formedYear: extra?.formedYear || null,
          disbandedYear: extra?.disbandedYear || null,
          genres: extra?.genres || [],
          images: extra?.images || {},
          links: extra?.links || {},
          externalStats: extra?.stats || {},
          sourceIds: extra?.sourceIds || {},
        },
        songs: (topTracks?.data || []).map(normalize.track),
        albums: albums.slice(0, 24),
        discography: {
          albums: byType('album'),
          eps: byType('ep'),
          singles: byType('single'),
        },
        related,
        radio: (radio?.data || []).map(normalize.track),
      },
    })
  } catch (err) {
    fail(res, err)
  }
})

module.exports = router
