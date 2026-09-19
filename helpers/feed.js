// Home feed. Every section is independent: one provider failing drops that section, never the whole page.
const { get, soft } = require('./deezer')
const normalize = require('./normalize')
const memo = require('./memo')
const apple = require('./providers/applecharts')
const { resolveTrack, resolveAlbum, mapSoft } = require('./resolve')
const { fetchAlbums } = require('./discography')
const { withTimeout } = require('./http')
const { norm, stripDecor } = require('./text')

const SPOTLIGHT = (process.env.HOME_SPOTLIGHT || 'africa,afro').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const RELEASE_WINDOW_DAYS = Number(process.env.NEW_RELEASE_DAYS) || 120

const data = (res) => res?.data || []

const newReleasesFrom = async (artists) => {
  const cutoff = Date.now() - RELEASE_WINDOW_DAYS * 86400000
  const lists = await mapSoft(artists.slice(0, 12), (a) => fetchAlbums(a.id), 3)
  const seen = new Set()
  return lists
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
    .slice(0, 20)
    .map(normalize.album)
}

const appleSongs = async (country) => {
  const rows = await apple.chart('songs', country, 25)
  if (!rows.length) return []
  const hydrated = await mapSoft(rows.slice(0, 20), (r) => resolveTrack({ title: r.name, artist: r.artist }), 5)
  return hydrated
    .map((track, i) => (track ? { ...track, chartPosition: rows[i].rank } : null))
    .filter(Boolean)
}

const appleAlbums = async (country) => {
  const rows = await apple.chart('albums', country, 25)
  if (!rows.length) return []
  const hydrated = await mapSoft(rows.slice(0, 15), (r) => resolveAlbum({ title: r.name, artist: r.artist }), 5)
  return hydrated.map((album, i) => (album ? { ...album, chartPosition: rows[i].rank } : null)).filter(Boolean)
}

const spotlightFor = async (genres) => {
  const picks = [...new Map(
    SPOTLIGHT.map((term) => genres.find((g) => norm(g.name).includes(term))).filter(Boolean).map((g) => [g.id, g])
  ).values()]
  const blocks = await mapSoft(picks, async (g) => {
    const [tracks, artists] = await Promise.all([
      soft(`/chart/${g.id}/tracks`, { limit: 15 }),
      soft(`/chart/${g.id}/artists`, { limit: 10 }),
    ])
    return {
      genre: normalize.genre(g),
      songs: data(tracks).map(normalize.track),
      artists: data(artists).map(normalize.artist),
    }
  }, 2)
  return blocks.filter((b) => b && (b.songs.length || b.artists.length))
}

const build = async (country) => {
  const failed = []
  const run = async (name, fn, ms = 6000) => {
    try {
      return await withTimeout(Promise.resolve().then(fn), ms, name)
    } catch (err) {
      failed.push({ section: name, error: err.message })
      return null
    }
  }

  // Wave 1: cheap Deezer calls (all cached for 15 min)
  const [tracks, albums, artists, playlists, editorial, genreRes, radios] = await Promise.all([
    run('trending', () => get('/chart/0/tracks', { limit: 30 })),
    run('trendingAlbums', () => get('/chart/0/albums', { limit: 20 })),
    run('trendingArtists', () => get('/chart/0/artists', { limit: 15 })),
    run('playlists', () => get('/chart/0/playlists', { limit: 12 })),
    run('editorsPicks', () => get('/editorial/0/selection')),
    run('genres', () => get('/genre')),
    run('radios', () => get('/radio/top', { limit: 12 })),
  ])

  const genres = data(genreRes).filter((g) => g.id !== 0)
  const trendingArtists = data(artists)

  if (!data(tracks).length && !genres.length && !data(playlists).length) {
    throw new Error('All home providers failed')
  }

  // Wave 2: sections that need more calls. Slow ones time out; what they fetched stays cached for the next request.
  const [fresh, topSongs, topAlbums, spotlight] = await Promise.all([
    run('newReleases', () => newReleasesFrom(trendingArtists), 8000),
    country ? run(`topInCountry:${country}`, () => appleSongs(country), 9000) : null,
    country ? run(`topAlbums:${country}`, () => appleAlbums(country), 9000) : null,
    run('spotlight', () => spotlightFor(genres), 6000),
  ])

  const trendingAlbums = data(albums).map(normalize.album)
  const newReleases = fresh && fresh.length ? fresh : trendingAlbums // never leave the row empty

  return {
    trending: data(tracks).map(normalize.track),
    newReleases,
    playlists: data(playlists).map(normalize.playlist),
    artists: trendingArtists.map(normalize.artist),
    genres: genres.map(normalize.genre),
    trendingAlbums,
    editorsPicks: data(editorial).map(normalize.auto),
    radios: data(radios).map(normalize.radio),
    topInCountry: { country, songs: topSongs || [] },
    topAlbumsInCountry: { country, albums: topAlbums || [] },
    spotlight: spotlight || [],
    meta: {
      country,
      generatedAt: new Date().toISOString(),
      newReleasesSource: fresh && fresh.length ? 'trending-artists' : 'chart-albums',
      failed,
    },
  }
}

const pending = new Set()
const lastScheduled = new Map()

// country: 2-letter code, or null/undefined for the country-less (global) page.
const getHome = async (country = null, depth = 0) => {
  const cc = /^[a-z]{2}$/i.test(country || '') ? country.toLowerCase() : null
  const key = `home:${cc || 'global'}`
  // Cache 10 min; if a rebuild fails, serve the last good page for up to 6 h.
  const page = await memo(key, 10 * 60 * 1000, () => build(cc), { staleMs: 6 * 60 * 60 * 1000 })

  // A slow/failed section leaves a hole in the cached page. Re-check shortly after (max 2 times in a row),
  // when whatever timed out has usually finished and cached its data.
  const recentlyTried = Date.now() - (lastScheduled.get(key) || 0) < 5 * 60 * 1000
  if (page.meta.failed.length && depth < 2 && !pending.has(key) && (depth > 0 || !recentlyTried)) {
    pending.add(key)
    lastScheduled.set(key, Date.now())
    setTimeout(() => {
      pending.delete(key)
      memo.expire(key)
      getHome(cc, depth + 1).catch(() => {})
    }, 20000).unref()
  }
  return page
}

// Warm the global page only; country pages are built on first request from that country.
const warm = () => getHome(null).catch((err) => console.warn('[home warm-up] failed:', err.message))

module.exports = { getHome, warm }
