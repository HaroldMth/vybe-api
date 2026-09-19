const memo = require('../memo')
const { client } = require('../http')

const http = client(process.env.LASTFM_BASE || 'https://ws.audioscrobbler.com/2.0/', { timeout: 7000 })
const HOUR = 60 * 60 * 1000

const enabled = () => !!process.env.LASTFM_KEY

const call = (method, params = {}, ttl = 6 * HOUR) => {
  if (!enabled()) return Promise.resolve(null)
  const key = `lfm:${method}:${JSON.stringify(params)}`
  return memo(key, ttl, async () => {
    const { data } = await http.get('/', {
      params: { method, api_key: process.env.LASTFM_KEY, format: 'json', autocorrect: 1, ...params },
    })
    if (data?.error) throw new Error(data.message || 'Last.fm request failed')
    return data
  }, { staleMs: 24 * HOUR })
}

const cleanBio = (html = '') =>
  String(html)
    .replace(/<a [^>]*>.*?<\/a>/gi, '') // drops the trailing "Read more on Last.fm" link and its text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const artistInfo = async (artist) => (await call('artist.getinfo', { artist }, 24 * HOUR))?.artist || null

const trackInfo = async (artist, track) => (await call('track.getinfo', { artist, track }, 24 * HOUR))?.track || null

const similarTracks = async (artist, track, limit = 16) => {
  const data = await call('track.getsimilar', { artist, track, limit })
  return (data?.similartracks?.track || []).map((t) => ({
    name: t.name, artist: t.artist?.name || '', match: Number(t.match) || 0,
  }))
}

const similarArtists = async (artist, limit = 12) => {
  const data = await call('artist.getsimilar', { artist, limit })
  return (data?.similarartists?.artist || []).map((a) => ({ name: a.name, match: Number(a.match) || 0 }))
}

const tagTracks = async (tag, limit = 20) => {
  const data = await call('tag.gettoptracks', { tag, limit })
  return (data?.tracks?.track || []).map((t) => ({ name: t.name, artist: t.artist?.name || '' }))
}

module.exports = { enabled, cleanBio, artistInfo, trackInfo, similarTracks, similarArtists, tagTracks }
