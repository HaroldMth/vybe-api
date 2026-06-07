const { SyncLyrics } = require('@stef-0012/synclyrics')
const { getLyrics } = require('genius-lyrics-api')
const fs = require('fs')
const path = require('path')

// Persist token to disk so Musixmatch works on cold restarts
const TOKEN_FILE = path.join(__dirname, '../.musixmatch_token')

let musixmatchToken = (() => {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim() || undefined }
  catch { return undefined }
})()

const lyricsManager = new SyncLyrics({
  sources: ['lrclib', 'musixmatch', 'netease'],
  logLevel: 'warn',
  saveMusixmatchToken: (token) => {
    musixmatchToken = token
    try { fs.writeFileSync(TOKEN_FILE, token, 'utf8') } catch {}
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
    return { artist: dashSplit[0].trim(), track: dashSplit.slice(1).join(' - ').trim() }
  }
  return { track: cleaned, artist: '' }
}

const fetchLyrics = async ({ q, title, artist, album, duration } = {}) => {
  const { track, artist: parsedArtist } = parseTrackArtist({ q, title, artist })

  if (!track) return { type: 'none', lyrics: null, track: null, artist: null, reason: 'Empty track title' }

  let errorReason = null

  try {
    const result = await lyricsManager.getLyrics({
      track,
      artist: parsedArtist || undefined,
      album: album ? cleanQuery(String(album)) : undefined,
      length: duration ? Number(duration) * 1000 : undefined, // synclyrics needs ms, deezer gives seconds
    })

    const lineSynced = result?.lyrics?.lineSynced
    const parsed = typeof lineSynced?.parse === 'function' ? lineSynced.parse() : null

    if (parsed?.length) {
      const lyrics = parsed
        .filter((line) => line.text && line.text.trim())
        .map((line) => ({ startTime: Math.round(line.time * 1000), text: line.text.trim() }))

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

    if (result?.lyrics?.plain) {
      return {
        type: 'plain',
        lyrics: result.lyrics.plain,
        track: result.track || track,
        artist: result.artist || parsedArtist || null,
        source: result.lyrics.source || null,
      }
    }

    errorReason = 'No lyrics found on LrcLib, Musixmatch, or Netease'
  } catch (err) {
    console.warn(`[lyrics] synclyrics failed: ${err.message}`)
    errorReason = `SyncLyrics error: ${err.message}`
  }

  if (!process.env.GENIUS) {
    return { type: 'none', lyrics: null, track, artist: parsedArtist || null, reason: errorReason || 'Lyrics not found' }
  }

  try {
    const plain = await getLyrics({
      apiKey: process.env.GENIUS,
      title: track,
      artist: parsedArtist || '',
      optimizeQuery: true,
    })
    if (plain) {
      return { type: 'plain', lyrics: plain, track, artist: parsedArtist || null, source: 'genius' }
    }
    errorReason = 'No matching lyrics found on Genius fallback'
  } catch (err) {
    console.warn(`[lyrics] genius fallback failed: ${err.message}`)
    errorReason = `Genius fallback error: ${err.message}`
  }

  return { type: 'none', lyrics: null, track, artist: parsedArtist || null, reason: errorReason }
}

module.exports = { fetchLyrics, parseTrackArtist }
