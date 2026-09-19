const { get, soft } = require('./deezer')

// All albums for an artist. Deezer doesn't document the sort order, so when the list is longer than one
// page we also read the tail, then sort newest-first ourselves.
const fetchAlbums = async (artistId) => {
  const first = await get(`/artist/${artistId}/albums`, { limit: 50 })
  let items = first.data || []
  if ((first.total || 0) > 50) {
    const tail = await soft(`/artist/${artistId}/albums`, { limit: 50, index: first.total - 50 })
    const seen = new Set(items.map((a) => a.id))
    items = items.concat((tail?.data || []).filter((a) => !seen.has(a.id)))
  }
  return items.sort((a, b) => (Date.parse(b.release_date) || 0) - (Date.parse(a.release_date) || 0))
}

module.exports = { fetchAlbums }
