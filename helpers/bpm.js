const { get } = require('./deezer')
const normalize = require('./normalize')
const { mapSoftDeadline } = require('./resolve')

// Heuristic tempo lanes (BPM ranges), not genres.
const LANES = [
  { id: 'chill',   title: 'Chill Tempo',   min: 60,  max: 95 },
  { id: 'focus',   title: 'Focus Flow',    min: 95,  max: 115 },
  { id: 'workout', title: 'Workout Pace',  min: 120, max: 150 },
  { id: 'running', title: 'Running Beats', min: 150, max: 185 },
]

// Deezer only exposes BPM on the full track object (/track/:id), not in chart/search lists, so we scan a chart
// pool one track at a time. Each lookup is cached for hours; if the scan can't finish inside the deadline the
// caller gets a partial list (`pending` > 0) and a repeat call continues from cache.
const tracksInBpmRange = async ({ min, max, genre = 0, limit = 20 }) => {
  const chart = await get(`/chart/${genre}/tracks`, { limit: 60 })
  const pool = chart.data || []
  const { results, pending } = await mapSoftDeadline(pool, (t) => get(`/track/${t.id}`), { size: 5, ms: 7000 })

  const songs = []
  let noBpm = 0
  results.forEach((full, i) => {
    if (full === undefined || full === null) return
    const bpm = Number(full.bpm)
    if (!bpm) { noBpm += 1; return } // Deezer reports 0 when it has no tempo for a track
    if (bpm >= min && bpm <= max) songs.push({ ...normalize.track(pool[i]), bpm })
  })

  return {
    songs: songs.slice(0, limit),
    range: { min, max },
    scanned: pool.length - pending,
    pending,
    noBpm,
  }
}

module.exports = { LANES, tracksInBpmRange }
