// Related tracks / artists built from several free sources, merged and de-duplicated.
//   Last.fm similar tracks (only if LASTFM_KEY is set)  -> hydrated to Deezer
//   Deezer related artists -> their top tracks           (diversity)
//   Deezer artist radio                                  (same-vibe mix)
//   Deezer seed-artist top tracks                        (light weight)
const { get, soft } = require('./deezer')
const normalize = require('./normalize')
const lastfm = require('./providers/lastfm')
const { resolveTrack, resolveArtist, mapSoft } = require('./resolve')
const { norm, stripDecor, VARIANT_RE } = require('./text')

const SOURCE_WEIGHT = { lastfm: 1.0, relatedArtists: 0.8, radio: 0.7, sameArtist: 0.4 }

const trackKey = (t) => `${norm(t.artists?.primary?.[0]?.name)}|${norm(stripDecor(t.name))}`

const seedFromTrackId = async (id) => {
  const t = await get(`/track/${id}`)
  return {
    id: String(t.id),
    title: t.title,
    artistId: t.artist?.id ? String(t.artist.id) : null,
    artistName: t.artist?.name || '',
    albumId: t.album?.id ? String(t.album.id) : null,
  }
}

const seedFromNames = async (artist, track) => {
  if (track) {
    const hit = await resolveTrack({ title: track, artist })
    if (hit) {
      return {
        id: hit.id,
        title: hit.name,
        artistId: hit.artists.primary[0]?.id || null,
        artistName: hit.artists.primary[0]?.name || artist,
        albumId: hit.album?.id || null,
      }
    }
  }
  const a = await resolveArtist(artist)
  return { id: null, title: track || '', artistId: a?.id || null, artistName: a?.name || artist, albumId: null }
}

const topOf = async (artistId, limit) => (await soft(`/artist/${artistId}/top`, { limit }))?.data || []

const collect = async (seed, wantLastfm) => {
  const jobs = []

  if (wantLastfm && lastfm.enabled() && seed.title) {
    jobs.push((async () => {
      const similar = (await lastfm.similarTracks(seed.artistName, seed.title, 14)).slice(0, 12)
      const hydrated = await mapSoft(similar, (s) => resolveTrack({ title: s.name, artist: s.artist }), 4)
      return hydrated.filter(Boolean).map((track) => ({ source: 'lastfm', track }))
    })())
  }

  if (seed.artistId) {
    jobs.push((async () => {
      const related = (await soft(`/artist/${seed.artistId}/related`, { limit: 8 }))?.data || []
      const lists = await mapSoft(related.slice(0, 6), (a) => topOf(a.id, 4), 3)
      return lists.flatMap((list) => (list || []).map((t) => ({ source: 'relatedArtists', track: normalize.track(t) })))
    })())

    jobs.push((async () => {
      const radio = (await soft(`/artist/${seed.artistId}/radio`, { limit: 30 }))?.data || []
      return radio.map((t) => ({ source: 'radio', track: normalize.track(t) }))
    })())

    jobs.push((async () => {
      const top = await topOf(seed.artistId, 10)
      return top.map((t) => ({ source: 'sameArtist', track: normalize.track(t) }))
    })())
  }

  const settled = await Promise.allSettled(jobs)
  return settled.filter((s) => s.status === 'fulfilled').flatMap((s) => s.value)
}

const merge = (items, seed, { limit, perArtist = 3, seedArtistCap = 2 }) => {
  const seedKey = seed.title ? `${norm(seed.artistName)}|${norm(stripDecor(seed.title))}` : null
  const seedIsVariant = VARIANT_RE.test(seed.title || '')
  const byKey = new Map()

  items.forEach(({ source, track }, index) => {
    if (!track?.id || !track.name) return
    if (seed.id && track.id === seed.id) return
    const key = trackKey(track)
    if (key === seedKey) return
    if (!seedIsVariant && VARIANT_RE.test(track.name)) return

    const bonus = SOURCE_WEIGHT[source] - index * 0.0001
    const entry = byKey.get(key)
    if (entry) {
      entry.score += bonus + 0.25 // agreement between sources is the strongest signal
      entry.sources.add(source)
    } else {
      byKey.set(key, { track, score: bonus, sources: new Set([source]) })
    }
  })

  const ranked = [...byKey.values()].sort((a, b) => b.score - a.score)
  const perArtistCount = new Map()
  const out = []
  for (const entry of ranked) {
    const artist = norm(entry.track.artists?.primary?.[0]?.name)
    const cap = artist === norm(seed.artistName) ? seedArtistCap : perArtist
    const n = perArtistCount.get(artist) || 0
    if (n >= cap) continue
    perArtistCount.set(artist, n + 1)
    out.push({ ...entry.track, relatedVia: [...entry.sources] })
    if (out.length >= limit) break
  }
  return out
}

// getRelatedTracks({ trackId }) or ({ artist, track }) -> { seed, songs, sources }
const getRelatedTracks = async ({ trackId, artist, track, limit = 20 }) => {
  const seed = trackId ? await seedFromTrackId(trackId) : await seedFromNames(artist, track)
  const items = await collect(seed, true)
  const songs = merge(items, seed, { limit })
  const sources = items.reduce((acc, { source }) => ({ ...acc, [source]: (acc[source] || 0) + 1 }), {})
  return { seed, songs, sources }
}

// Related artists from Deezer, boosted/extended with Last.fm when a key is configured.
const getRelatedArtists = async ({ artistId, artist, limit = 12 }) => {
  let id = artistId
  let name = artist
  if (!id) {
    const found = await resolveArtist(artist)
    id = found?.id
    name = found?.name || artist
  } else if (!name) {
    name = (await soft(`/artist/${id}`))?.name
  }

  const [dzRelated, lfm] = await Promise.all([
    id ? soft(`/artist/${id}/related`, { limit: 20 }) : null,
    lastfm.enabled() && name ? lastfm.similarArtists(name, 15).catch(() => []) : [],
  ])

  const seen = new Set()
  const out = []
  const push = (a, via) => {
    const key = norm(a.name)
    if (!key || seen.has(key) || key === norm(name)) return
    seen.add(key)
    out.push({ ...a, relatedVia: via })
  }

  // Last.fm names need resolving to Deezer artists; keep only exact-name hits.
  const resolved = await mapSoft(lfm.slice(0, 10), (a) => resolveArtist(a.name), 4)
  resolved.filter(Boolean).forEach((a) => push(a, 'lastfm'))
  ;(dzRelated?.data || []).map(normalize.artist).forEach((a) => push(a, 'deezer'))
  return out.slice(0, limit)
}

module.exports = { getRelatedTracks, getRelatedArtists, merge }
