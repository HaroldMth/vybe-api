const { get, soft } = require('./deezer')

// Deezer's artist-albums items usually don't carry an `artist` field, so callers pass the artist in
// and we stamp it on every album (otherwise the UI shows albums with no artist name).
const stamp = (items, artist) =>
  artist?.id != null
    ? items.map((a) => (a.artist ? a : { ...a, artist: { id: artist.id, name: artist.name || '' } }))
    : items

// All albums for an artist. Deezer doesn't document the sort order, so when the list is longer than one
// page we also read the tail, then sort newest-first ourselves.
const fetchAlbums = async (artistId, artist = null) => {
  const first = await get(`/artist/${artistId}/albums`, { limit: 50 })
  let items = first.data || []
  if ((first.total || 0) > 50) {
    const tail = await soft(`/artist/${artistId}/albums`, { limit: 50, index: first.total - 50 })
    const seen = new Set(items.map((a) => a.id))
    items = items.concat((tail?.data || []).filter((a) => !seen.has(a.id)))
  }
  return stamp(items, artist || { id: artistId })
    .sort((a, b) => (Date.parse(b.release_date) || 0) - (Date.parse(a.release_date) || 0))
}

module.exports = { fetchAlbums }
