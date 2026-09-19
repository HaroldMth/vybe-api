const memo = require('../memo')
const { client, createLimiter, withRetry } = require('../http')
const { norm } = require('../text')

const http = client(process.env.MUSICBRAINZ_BASE || 'https://musicbrainz.org/ws/2', { timeout: 7000 })
const DAY = 24 * 60 * 60 * 1000

// MusicBrainz asks for at most 1 request/second per client.
const limited = createLimiter({ concurrency: 1, gapMs: 1100 })
const call = (path, params) => withRetry(() => limited(() => http.get(path, { params }).then((r) => r.data)), { retries: 1 })

const artist = (name) =>
  name
    ? memo(`mb:artist:${norm(name)}`, 7 * DAY, async () => {
        const data = await call('/artist', { query: `artist:"${name.replace(/"/g, '')}"`, fmt: 'json', limit: 3 })
        const hit = (data?.artists || []).find((a) => Number(a.score) >= 90 && norm(a.name) === norm(name))
        return hit
          ? {
              id: hit.id,
              type: hit.type || null,
              country: hit.country || hit.area?.name || null,
              begin: hit['life-span']?.begin || null,
              end: hit['life-span']?.end || null,
              ended: !!hit['life-span']?.ended,
              disambiguation: hit.disambiguation || null,
              tags: (hit.tags || []).sort((a, b) => b.count - a.count).map((t) => t.name).slice(0, 6),
            }
          : null
      }, { staleMs: 30 * DAY })
    : Promise.resolve(null)

const albumGroup = (albumName, artistName) =>
  albumName
    ? memo(`mb:rg:${norm(artistName)}|${norm(albumName)}`, 7 * DAY, async () => {
        const q = artistName
          ? `releasegroup:"${albumName.replace(/"/g, '')}" AND artist:"${artistName.replace(/"/g, '')}"`
          : `releasegroup:"${albumName.replace(/"/g, '')}"`
        const data = await call('/release-group', { query: q, fmt: 'json', limit: 3 })
        const hit = (data?.['release-groups'] || []).find((g) => Number(g.score) >= 90 && norm(g.title) === norm(albumName))
        return hit ? { id: hit.id, type: hit['primary-type'] || null, firstRelease: hit['first-release-date'] || null } : null
      }, { staleMs: 30 * DAY })
    : Promise.resolve(null)

const ping = async () => {
  const { data } = await http.get('/artist', { params: { query: 'coldplay', fmt: 'json', limit: 1 } })
  if (!data?.artists) throw new Error('unexpected MusicBrainz response')
}

module.exports = { artist, albumGroup, ping }
