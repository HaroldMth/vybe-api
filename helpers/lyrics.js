const { SyncLyrics } = require('@stef-0012/synclyrics')
const { getLyrics } = require('genius-lyrics-api')

let musixmatchToken

const lyricsManager = new SyncLyrics({
  sources: ['musixmatch', 'lrclib', 'netease'],
  saveMusixmatchToken: (token) => {
    musixmatchToken = token
  },
  getMusixmatchToken: () => musixmatchToken,
})

const cleanQuery = (value = '') =>
  String(value)
    .replace(
      /\s*[\(\[][^)]*?(feat|with|prod|explicit|remaster|radio|edit|version|single|mix|deluxe|lyric)[^)]*?[\)\]]/gi,
      ''
    )
    .replace(/\s*-\s*(feat|with|prod|explicit|remaster|radio|edit|version|single|mix|deluxe|lyric).*$/gi, '')
    .trim()

const parseTrackArtist = ({ q, title, artist }) => {
  if (title && artist) {
    return { track: cleanQuery(title), artist: cleanQuery(artist) }
  }

  const cleaned = cleanQuery(q || '')
  if (!cleaned) return { track: '', artist: '' }

  const dashSplit = cleaned.split(/\s+-\s+/)
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim(),
      track: dashSplit.slice(1).join(' - ').trim(),
    }
  }

  return { track: cleaned, artist: '' }
}

const fetchLyrics = async ({ q, title, artist } = {}) => {
  const { track, artist: parsedArtist } = parseTrackArtist({ q, title, artist })

  if (!track) {
    return { type: 'none', lyrics: null, track: null, artist: null }
  }

  try {
    const result = await lyricsManager.getLyrics({
      track,
      artist: parsedArtist || undefined,
    })
    const lineSynced = result?.lyrics?.lineSynced
    const parsed =
      typeof lineSynced?.parse === 'function' ? lineSynced.parse() : null

    if (parsed?.length) {
      const lyrics = parsed
        .filter((line) => line.text && line.text.trim())
        .map((line) => ({
          startTime: Math.round(line.time * 1000),
          text: line.text.trim(),
        }))

      if (lyrics.length) {
        return {
          type: 'synced',
          lyrics,
          track: result.track || track,
          artist: result.artist || parsedArtist || null,
          source: lineSynced.source || null,
        }
      }
    }
  } catch (err) {
    console.warn(`[lyrics helper] synclyrics failed: ${err.message}`)
  }

  if (!process.env.GENIUS) {
    return { type: 'none', lyrics: null, track, artist: parsedArtist || null }
  }

  try {
    const plain = await getLyrics({
      apiKey: process.env.GENIUS,
      title: track,
      artist: parsedArtist || '',
      optimizeQuery: true,
    })

    if (plain) {
      return {
        type: 'plain',
        lyrics: plain,
        track,
        artist: parsedArtist || null,
        source: 'genius',
      }
    }
  } catch (err) {
    console.warn(`[lyrics helper] genius fallback failed: ${err.message}`)
  }

  return { type: 'none', lyrics: null, track, artist: parsedArtist || null }
}

module.exports = { fetchLyrics, parseTrackArtist }
