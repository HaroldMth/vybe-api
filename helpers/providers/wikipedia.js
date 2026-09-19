const memo = require('../memo')
const { client } = require('../http')
const { norm, stripDecor, sameArtist } = require('../text')

const http = client(process.env.WIKI_BASE || 'https://en.wikipedia.org', { timeout: 6000 })

const DAY = 24 * 60 * 60 * 1000
const ARTIST_DESC_RE = /(singer|rapper|band|musician|songwriter|record producer|disc jockey|\bdj\b|duo|group|composer|vocalist|instrumentalist|guitarist|pianist|drummer|bassist|artist|trio|quartet|collective)/i
const ALBUM_DESC_RE = /(album|extended play|\bep\b|mixtape|soundtrack|compilation|studio|debut|record)/i
const REJECT_DESC_RE = /(disambiguation|film|television|novel|video game|footballer|politician)/i

// One request: search + intro extract + thumbnail + short description.
const search = async (query) => {
  const { data } = await http.get('/w/api.php', {
    params: {
      action: 'query',
      format: 'json',
      formatversion: 2,
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: 0,
      gsrlimit: 6,
      prop: 'extracts|pageimages|description',
      exintro: 1,
      explaintext: 1,
      exsentences: 6,
      exlimit: 6,
      piprop: 'thumbnail',
      pithumbsize: 600,
      redirects: 1,
    },
  })
  return (data?.query?.pages || []).sort((a, b) => (a.index || 99) - (b.index || 99))
}

const bareTitle = (title = '') => title.replace(/\s*\([^)]*\)\s*$/, '').trim()

const shape = (page) => ({
  title: page.title,
  description: page.description || '',
  extract: (page.extract || '').replace(/\s+/g, ' ').trim(),
  thumbnail: page.thumbnail?.source || null,
  url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
})

// Only accept a page whose title IS the artist and whose short description says it's a music act.
// Returns null rather than a wrong bio (e.g. "Drake" the bird, "Prince" the title).
const getArtistSummary = (artistName) => {
  if (!artistName) return Promise.resolve(null)
  return memo(`wiki:artist:${norm(artistName)}`, 7 * DAY, async () => {
    const pages = await search(`${artistName} musician OR band OR singer OR rapper`)
    const match = pages.find((page) => {
      const desc = page.description || ''
      return (
        norm(bareTitle(page.title)) === norm(artistName) &&
        ARTIST_DESC_RE.test(`${desc} ${page.title}`) &&
        !REJECT_DESC_RE.test(desc) &&
        (page.extract || '').length > 40
      )
    })
    return match ? shape(match) : null
  }, { staleMs: 30 * DAY })
}

const getAlbumSummary = (rawAlbumName, artistName) => {
  const albumName = stripDecor(rawAlbumName || '')
  if (!albumName) return Promise.resolve(null)
  return memo(`wiki:album:${norm(artistName)}|${norm(albumName)}`, 7 * DAY, async () => {
    const pages = await search(`${albumName} ${artistName || ''} album`)
    const wanted = norm(albumName)
    const match = pages.find((page) => {
      const haystack = `${page.description || ''} ${page.extract || ''}`
      return (
        norm(bareTitle(page.title)) === wanted &&
        ALBUM_DESC_RE.test(page.description || '') &&
        (!artistName || sameArtist(artistName, haystack) || norm(haystack).includes(norm(artistName))) &&
        (page.extract || '').length > 40
      )
    })
    return match ? shape(match) : null
  }, { staleMs: 30 * DAY })
}

const ping = async () => {
  const { data } = await http.get('/w/api.php', { params: { action: 'query', meta: 'siteinfo', format: 'json' } })
  if (!data?.query) throw new Error('unexpected Wikipedia response')
}

module.exports = { getArtistSummary, getAlbumSummary, ping }
