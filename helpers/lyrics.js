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
  sources: ['musixmatch', 'netease'],
  logLevel: 'warn',
  saveMusixmatchToken: (token) => {
    musixmatchToken = token
    try { fs.writeFileSync(TOKEN_FILE, token, 'utf8') } catch {}
  },
  getMusixmatchToken: () => musixmatchToken,
})

const parseLrcString = (lrcText) => {
  if (!lrcText || typeof lrcText !== 'string') return null
  const lines = lrcText.split('\n')
  const result = []
  
  const timeRegex = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g
  
  for (const line of lines) {
    timeRegex.lastIndex = 0
    const match = timeRegex.exec(line)
    if (match) {
      const mins = parseInt(match[1], 10)
      const secs = parseInt(match[2], 10)
      const msPart = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0
      
      const startTime = (mins * 60 + secs) * 1000 + (match[3] && match[3].length === 2 ? msPart * 10 : msPart)
      const text = line.replace(timeRegex, '').trim()
      
      if (text) {
        result.push({ startTime, text })
      }
    }
  }
  return result.length > 0 ? result : null
}

const fetchLrcLibDirect = async ({ title, artist, album, duration }) => {
  const headers = {
    'User-Agent': 'VybeMusicApp/1.0.0 (https://github.com/HaroldMth/vybe)'
  }

  // 1. Try /api/get if we have both album and duration
  if (album && duration) {
    try {
      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}&album_name=${encodeURIComponent(album)}&duration=${Math.round(duration)}`
      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        if (data && (data.syncedLyrics || data.plainLyrics)) {
          return data
        }
      }
    } catch (err) {
      console.warn(`[lyrics-lrclib] direct /api/get failed: ${err.message}`)
    }
  }

  // 2. Try /api/get with only track_name and artist_name
  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`
    const res = await fetch(url, { headers })
    if (res.ok) {
      const data = await res.json()
      if (data && (data.syncedLyrics || data.plainLyrics)) {
        return data
      }
    }
  } catch (err) {
    console.warn(`[lyrics-lrclib] direct /api/get with title/artist failed: ${err.message}`)
  }

  // 3. Fallback to /api/search
  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`
    const res = await fetch(url, { headers })
    if (res.ok) {
      const list = await res.json()
      if (Array.isArray(list) && list.length > 0) {
        const best = list.find(m => m.syncedLyrics || m.plainLyrics) || list[0]
        if (best.syncedLyrics || best.plainLyrics) {
          return best
        }
      }
    }
  } catch (err) {
    console.warn(`[lyrics-lrclib] direct /api/search failed: ${err.message}`)
  }

  return null
}

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

  const cleanTrack = cleanQuery(track)
  const cleanArtist = parsedArtist ? cleanQuery(parsedArtist) : ''
  const cleanAlbum = album && album !== 'undefined' && album !== 'null' ? cleanQuery(String(album)) : null

  // 1. Try Direct LrcLib Fetch First (bypassing the buggy SyncLyrics library)
  try {
    const directResult = await fetchLrcLibDirect({
      title: cleanTrack,
      artist: cleanArtist,
      album: cleanAlbum,
      duration: duration
    })

    if (directResult) {
      if (directResult.syncedLyrics) {
        const parsed = parseLrcString(directResult.syncedLyrics)
        if (parsed?.length) {
          return {
            type: 'synced',
            lyrics: parsed,
            track: directResult.trackName || track,
            artist: directResult.artistName || parsedArtist || null,
            source: 'lrclib',
          }
        }
      }

      if (directResult.plainLyrics) {
        return {
          type: 'plain',
          lyrics: directResult.plainLyrics,
          track: directResult.trackName || track,
          artist: directResult.artistName || parsedArtist || null,
          source: 'lrclib',
        }
      }
    }
  } catch (err) {
    console.warn(`[lyrics] LrcLib direct flow failed: ${err.message}`)
  }

  let errorReason = null

  try {
    const result = await lyricsManager.getLyrics({
      track,
      artist: parsedArtist || undefined,
      album: cleanAlbum || undefined,
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
