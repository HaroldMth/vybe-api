const { soft } = require('./deezer')
const normalize = require('./normalize')
const { fetchAlbums } = require('./discography')
const { mapSoftDeadline } = require('./resolve')
const { norm, stripDecor } = require('./text')

// New releases from a list of artist IDs (followed/top artists), newest first.
const getReleaseRadar = async ({ artistIds, days = 60, limit = 30 }) => {
  const ids = [...new Set(artistIds)].slice(0, 30)
  const cutoff = Date.now() - days * 86400000

  const { results, pending } = await mapSoftDeadline(
    ids,
    async (id) => fetchAlbums(id, await soft(`/artist/${id}`)),
    { size: 4, ms: 8000 }
  )

  const failed = ids.filter((_, i) => results[i] === null)
  const seen = new Set()
  const releases = results
    .flatMap((list) => list || [])
    .filter((al) => {
      const t = Date.parse(al.release_date)
      return t && t >= cutoff && t <= Date.now()
    })
    .sort((a, b) => Date.parse(b.release_date) - Date.parse(a.release_date))
    .filter((al) => {
      const key = `${norm(al.artist?.name)}|${norm(stripDecor(al.title))}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map(normalize.album)

  return { releases, checked: ids.length - pending - failed.length, pending, failed }
}

module.exports = { getReleaseRadar }
