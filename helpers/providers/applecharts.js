const memo = require('../memo')
const { client } = require('../http')

// Official Apple Marketing Tools RSS: no key, daily updated, per-country. (Old host rss.applemarketingtools.com 301s here.)
const http = client(process.env.APPLE_RSS_BASE || 'https://rss.marketingtools.apple.com', { timeout: 7000 })
const SIZES = [10, 25, 50, 100]

const snapSize = (n) => SIZES.find((s) => s >= n) || 100

// type: 'songs' | 'albums'. Resolves to [] for countries Apple has no chart for.
const chart = (type = 'songs', country = 'us', limit = 25) => {
  const cc = String(country || 'us').toLowerCase()
  if (!/^[a-z]{2}$/.test(cc)) return Promise.resolve([])
  const size = snapSize(limit)
  return memo(`apple:${type}:${cc}:${size}`, 3 * 60 * 60 * 1000, async () => {
    try {
      const { data } = await http.get(`/api/v2/${cc}/music/most-played/${size}/${type}.json`)
      return (data?.feed?.results || []).map((r, i) => ({
        rank: i + 1,
        id: r.id,
        name: r.name,
        artist: r.artistName,
        artwork: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+(bb)?\./, '/600x600bb.') : '',
        genres: (r.genres || []).map((g) => g.name).filter((g) => g && g !== 'Music'),
        releaseDate: r.releaseDate || null,
        url: r.url || null,
      }))
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 400) return []
      throw err
    }
  }, { staleMs: 24 * 60 * 60 * 1000 })
}

const ping = async () => {
  const { data } = await http.get('/api/v2/us/music/most-played/10/songs.json')
  if (!data?.feed?.results?.length) throw new Error('empty chart')
}

module.exports = { chart, ping }
