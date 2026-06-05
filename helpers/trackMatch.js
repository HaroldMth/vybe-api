const UNWANTED_TITLE_RE =
  /\b(remix|live|acoustic|cover|karaoke|sped up|slowed|nightcore|8d|reverb|unofficial|tribute|instrumental|edit|extended|demo|bootleg|radio edit|zwette|ti[eë]sto|sxsw|recorded at|re-recorded|piano|guitar|violin|lofi|lo-fi|session|stripped|mashup|ringtone)\b/i

const normalize = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const parseDurationToSec = (value) => {
  if (value == null || value === '' || value === 'N/A') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1000 ? Math.round(value / 1000) : Math.round(value)
  }

  const trimmed = String(value).trim()
  const numeric = Number(trimmed)
  if (!Number.isNaN(numeric) && numeric > 0) return Math.round(numeric)

  const parts = trimmed.split(':').map(Number)
  if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return null
}

const tokenOverlap = (a, b) => {
  const tokensA = new Set(normalize(a).split(' ').filter(Boolean))
  const tokensB = new Set(normalize(b).split(' ').filter(Boolean))
  if (!tokensA.size || !tokensB.size) return 0

  let shared = 0
  tokensA.forEach((token) => {
    if (tokensB.has(token)) shared += 1
  })
  return shared / Math.max(tokensA.size, tokensB.size)
}

const parseQuery = (query = '') => {
  const trimmed = String(query).trim()
  if (!trimmed) return { title: '', artist: '' }

  const dashSplit = trimmed.split(/\s+-\s+/)
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim(),
      title: dashSplit.slice(1).join(' - ').trim(),
    }
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length >= 3) {
    const half = Math.floor(tokens.length / 2)
    const asArtistFirst = {
      artist: tokens.slice(0, half).join(' '),
      title: tokens.slice(half).join(' '),
    }
    const asTitleFirst = {
      title: tokens.slice(0, half).join(' '),
      artist: tokens.slice(half).join(' '),
    }
    return asTitleFirst
  }

  if (tokens.length === 2) {
    return { title: tokens[0], artist: tokens[1] }
  }

  return { title: trimmed, artist: '' }
}

const scoreTitle = (resultTitle, expectedTitle) => {
  const result = normalize(resultTitle)
  const expected = normalize(expectedTitle)
  if (!expected) return result ? 40 : 0
  if (!result) return 0
  if (result === expected) return 120

  if (UNWANTED_TITLE_RE.test(resultTitle)) return 5

  // Handle "Artist - Title" or "Title - Artist" YouTube formats:
  // check every dash-separated segment for an exact match
  const segments = result.split(/\s*-\s*/)
  for (const seg of segments) {
    if (seg.trim() === expected) return 110
  }

  // Expected title appears anywhere inside the result (e.g. after a dash)
  if (result.includes(expected)) {
    const idx = result.indexOf(expected)
    const suffix = result.slice(idx + expected.length).trim()
    if (UNWANTED_TITLE_RE.test(suffix)) return 8
    // favour results where the title is a clean standalone segment
    const prefix = result.slice(0, idx).trim()
    const segmentBoundary = prefix.endsWith('-') || prefix === '' || suffix.startsWith('(')
    return segmentBoundary ? 105 : 60
  }

  // Starts with the expected title
  if (result.startsWith(`${expected} `)) {
    const suffix = result.slice(expected.length).trim()
    if (UNWANTED_TITLE_RE.test(suffix)) return 8
    return 55
  }

  let points = Math.round(tokenOverlap(result, expected) * 70)
  if (/\bofficial\b/i.test(resultTitle)) points += 20
  if (/\blyric(s| video)?\b/i.test(resultTitle) && !/\bofficial\b/i.test(resultTitle)) points -= 10
  return points
}

const scoreArtist = (resultArtist, expectedArtist) => {
  const result = normalize(resultArtist)
  const expected = normalize(expectedArtist)
  if (!expected) return result ? 30 : 0
  if (!result) return 0
  if (result === expected) return 100

  if (result.includes(expected)) {
    if (/(&|,| feat| ft\.? )/i.test(resultArtist) && !/(&|,| feat| ft\.? )/i.test(expectedArtist)) {
      return 45
    }
    return 85
  }

  return Math.round(tokenOverlap(result, expected) * 60)
}

const scoreDuration = (resultDuration, expectedDurationSec) => {
  const resultSec = parseDurationToSec(resultDuration)
  if (!resultSec || !expectedDurationSec) return 0

  const diff = Math.abs(resultSec - expectedDurationSec)
  if (diff <= 2) return 55
  if (diff <= 5) return 40
  if (diff <= 10) return 20
  if (diff <= 20) return 5
  return -25
}

const scoreTrack = (candidate, expected = {}) => {
  const title = candidate.title || ''
  const artist = candidate.artist || ''
  const expectedTitle = expected.title || ''
  const expectedArtist = expected.artist || ''
  const expectedDurationSec = expected.durationSec ?? parseDurationToSec(expected.duration)

  const titlePoints = scoreTitle(title, expectedTitle)
  const artistPoints = scoreArtist(artist, expectedArtist)
  const durationPoints = scoreDuration(candidate.duration, expectedDurationSec)
  const unwantedPenalty = UNWANTED_TITLE_RE.test(title) ? -80 : 0

  const total = titlePoints + artistPoints + durationPoints + unwantedPenalty

  return {
    total,
    titlePoints,
    artistPoints,
    durationPoints,
    unwantedPenalty,
  }
}

const pickBestTrack = (candidates, expected = {}, { minScore = 80 } = {}) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreTrack(candidate, expected),
    }))
    .sort((a, b) => b.score.total - a.score.total)

  const best = ranked[0]

  // Log scoring so mismatches are easy to spot in server logs
  console.info(
    `[trackMatch] top candidates for "${expected.title} - ${expected.artist}":\n` +
    ranked.slice(0, 3).map((r, i) =>
      `  #${i + 1} [${r.score.total}] "${r.candidate.title}" (title:${r.score.titlePoints} artist:${r.score.artistPoints} dur:${r.score.durationPoints})`
    ).join('\n')
  )

  if (!best || best.score.total < minScore) return null

  return { ...best.candidate, _matchScore: best.score.total, _ranked: ranked.slice(0, 3) }
}

module.exports = {
  normalize,
  parseQuery,
  parseDurationToSec,
  scoreTrack,
  pickBestTrack,
  UNWANTED_TITLE_RE,
}
