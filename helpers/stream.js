const { getSpotifyStreamUrl } = require('./spotify')
const { getYoutubeStreamUrl } = require('./youtube')

const getStreamUrl = async (query, hints = {}) => {
  const trimmed = String(query).trim()
  if (!trimmed) throw new Error('Query is required')

  try {
    const result = await getSpotifyStreamUrl(trimmed, hints)
    console.info('[stream helper] resolved via Spotify')
    return result
  } catch (spotifyErr) {
    console.warn(`[stream helper] Spotify failed (${spotifyErr.message}), falling back to YouTube`)
  }

  try {
    const result = await getYoutubeStreamUrl(trimmed, hints)
    console.info('[stream helper] resolved via YouTube fallback')
    return { ...result, source: 'youtube' }
  } catch (youtubeErr) {
    throw new Error(`Stream fetch failed: ${youtubeErr.message}`)
  }
}

module.exports = { getStreamUrl }
