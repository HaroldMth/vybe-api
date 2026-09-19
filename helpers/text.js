const norm = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokens = (value) => norm(value).split(' ').filter(Boolean)

// "Song (feat. X)", "Song - Remastered 2011", "Song [Deluxe]" -> "Song"
const stripDecor = (title = '') =>
  String(title)
    .replace(/\s*[([][^)\]]*\b(feat|ft|with|remaster(ed)?|deluxe|version|edit|mix|bonus|explicit|from|single)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(\d{4}\s+)?(remaster(ed)?|single version|radio edit|explicit|deluxe|bonus track|.*\bversion)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

// Dice coefficient over word tokens: 1 = same words, 0 = nothing shared.
const dice = (a, b) => {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let shared = 0
  A.forEach((t) => { if (B.has(t)) shared += 1 })
  return (2 * shared) / (A.size + B.size)
}

// "Burna Boy" vs "Burna Boy & Ed Sheeran" -> true; "Ye" vs "Yelawolf" -> false.
const sameArtist = (a, b) => {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.length || !B.length) return false
  const [short, long] = A.length <= B.length ? [A, B] : [B, A]
  const longSet = new Set(long)
  return short.every((t) => longSet.has(t))
}

const VARIANT_RE = /\b(karaoke|instrumental|tribute|cover|8d|sped up|slowed|nightcore|reverb|made famous|originally performed|lullaby|piano version|acoustic version|type beat)\b/i

module.exports = { norm, tokens, stripDecor, dice, sameArtist, VARIANT_RE }
