// "For You" builder. Stateless: the app sends its own signals, we return rows + one blended feed.
//   tracks  : recent plays / likes, MOST RECENT FIRST (first 3 are used as "because you listened to" seeds)
//   artists : followed / most-played artists (first 2 give radio, first 1 gives "fans also like", all give new releases)
//   played  : IDs to hide (already heard)
const { soft } = require('./deezer')
const normalize = require('./normalize')
const { getRelatedTracks, getRelatedArtists } = require('./related')
const { getReleaseRadar } = require('./radar')
const { getHome } = require('./feed')
const { withTimeout } = require('./http')
const { norm, stripDecor } = require('./text')

const WEIGHT = { because: 1.0, radio: 0.45, trending: 0.2 }
const PER_ARTIST_CAP = 3

const buildFyp = async ({ tracks = [], artists = [], played = [], country = null, limit = 30 }) => {
  const failed = []
  const run = async (name, fn, ms = 9000) => {
    try {
      return await withTimeout(Promise.resolve().then(fn), ms, name)
    } catch (err) {
      failed.push({ row: name, error: err.message })
      return null
    }
  }

  const hidden = new Set([...played, ...tracks])
  const fresh = (list = []) => list.filter((t) => t?.id && !hidden.has(t.id))

  const [because, radio, like, radar, home] = await Promise.all([
    Promise.all(tracks.slice(0, 3).map((id) => run(`because:${id}`, () => getRelatedTracks({ trackId: id, limit: 15 })))),
    Promise.all(artists.slice(0, 2).map((id) => run(`radio:${id}`, async () => {
      const [artist, list] = await Promise.all([soft(`/artist/${id}`), soft(`/artist/${id}/radio`, { limit: 20 })])
      return { id, name: artist?.name || 'This artist', tracks: (list?.data || []).map(normalize.track) }
    }))),
    artists[0]
      ? run(`like:${artists[0]}`, async () => {
          const [artist, list] = await Promise.all([soft(`/artist/${artists[0]}`), getRelatedArtists({ artistId: artists[0], limit: 12 })])
          return { id: artists[0], name: artist?.name || 'this artist', artists: list }
        })
      : null,
    artists.length ? run('radar', () => getReleaseRadar({ artistIds: artists, days: 90, limit: 12 })) : null,
    run('trending', () => getHome(country)),
  ])

  const local = home?.topInCountry?.songs?.length ? home.topInCountry.songs : null
  const trendingTracks = fresh(local || home?.trending || [])
  const trendingTitle = local ? 'Trending in your country' : 'Trending now'

  // ---- rows (what the UI renders as shelves)
  const rows = []
  because.forEach((r, i) => {
    const items = fresh(r?.songs).slice(0, 12)
    if (items.length) rows.push({ id: `because-${tracks[i]}`, type: 'tracks', title: `Because you listened to ${r.seed.title}`, seed: { type: 'track', id: tracks[i] }, items })
  })
  if (radar?.releases?.length) rows.push({ id: 'new-releases', type: 'albums', title: 'New from artists you follow', items: radar.releases })
  if (like?.artists?.length) rows.push({ id: 'artists-like', type: 'artists', title: `Fans of ${like.name} also like`, seed: { type: 'artist', id: like.id }, items: like.artists })
  radio.forEach((r) => {
    const items = fresh(r?.tracks).slice(0, 12)
    if (items.length) rows.push({ id: `radio-${r.id}`, type: 'tracks', title: `${r.name} radio`, seed: { type: 'artist', id: r.id }, items })
  })
  const personalized = rows.length > 0
  if (trendingTracks.length) rows.push({ id: 'trending', type: 'tracks', title: trendingTitle, items: trendingTracks.slice(0, 15) })

  // ---- one blended feed ("Made for you")
  const candidates = []
  const add = (list, base, reason) =>
    list.forEach((track, idx) => candidates.push({ track, reason, score: base * (1 - (idx / Math.max(list.length, 1)) * 0.5) }))
  because.forEach((r, i) => r && add(fresh(r.songs), WEIGHT.because / (1 + 0.5 * i), `Because you listened to ${r.seed.title}`))
  radio.forEach((r, i) => r && add(fresh(r.tracks), WEIGHT.radio / (1 + 0.5 * i), `${r.name} radio`))
  add(trendingTracks, WEIGHT.trending, trendingTitle)

  const byKey = new Map()
  for (const c of candidates) {
    const key = `${norm(c.track.artists?.primary?.[0]?.name)}|${norm(stripDecor(c.track.name))}`
    const hit = byKey.get(key)
    if (!hit) byKey.set(key, { ...c, best: c.score })
    else {
      if (c.score > hit.best) { hit.best = c.score; hit.reason = c.reason } // credit the strongest signal
      hit.score += c.score + 0.25 // recommended by more than one signal
    }
  }
  const perArtist = new Map()
  const feed = []
  for (const c of [...byKey.values()].sort((a, b) => b.score - a.score)) {
    const artist = norm(c.track.artists?.primary?.[0]?.name)
    if ((perArtist.get(artist) || 0) >= PER_ARTIST_CAP) continue
    perArtist.set(artist, (perArtist.get(artist) || 0) + 1)
    feed.push({ ...c.track, reason: c.reason })
    if (feed.length >= limit) break
  }

  return {
    feed,
    rows,
    meta: {
      personalized,
      seeds: { tracks: tracks.slice(0, 3), artists: artists.slice(0, 6) },
      country,
      failed,
    },
  }
}

module.exports = { buildFyp }
