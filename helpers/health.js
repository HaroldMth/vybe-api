const memo = require('./memo')
const { withTimeout } = require('./http')
const deezer = require('./deezer')
const apple = require('./providers/applecharts')
const wikipedia = require('./providers/wikipedia')
const audiodb = require('./providers/audiodb')
const musicbrainz = require('./providers/musicbrainz')
const lastfm = require('./providers/lastfm')

const PROVIDERS = [
  { id: 'deezer', role: 'core: search, charts, artists, albums, tracks', ping: deezer.ping },
  { id: 'apple', role: 'country charts on home', ping: apple.ping },
  { id: 'wikipedia', role: 'artist/album bios', ping: wikipedia.ping },
  { id: 'audiodb', role: 'artist images, bio fallback', ping: audiodb.ping },
  { id: 'musicbrainz', role: 'artist facts (country, formed year)', ping: musicbrainz.ping },
  { id: 'lastfm', role: 'similar tracks, tags (needs LASTFM_KEY)', ping: lastfm.ping, configured: () => lastfm.enabled() },
]

const check = async (p) => {
  if (p.configured && !p.configured()) return { id: p.id, role: p.role, status: 'not_configured' }
  const started = Date.now()
  try {
    await withTimeout(p.ping(), 5000, p.id)
    return { id: p.id, role: p.role, status: 'up', latencyMs: Date.now() - started }
  } catch (err) {
    return { id: p.id, role: p.role, status: 'down', latencyMs: Date.now() - started, error: err.message }
  }
}

// Cached for 60s so monitors/clients can't hammer the providers through this endpoint.
const providerHealth = () =>
  memo('health:providers', 60 * 1000, async () => {
    const list = await Promise.all(PROVIDERS.map(check))
    const core = list.find((p) => p.id === 'deezer')
    const anyDown = list.some((p) => p.status === 'down')
    return {
      status: core.status === 'down' ? 'down' : anyDown ? 'degraded' : 'ok',
      checkedAt: new Date().toISOString(),
      providers: list,
    }
  })

module.exports = { providerHealth }
