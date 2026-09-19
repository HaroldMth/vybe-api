// Turns "artist + title" (from Last.fm, Apple charts, ...) into a real Deezer object.
// Accuracy over recall: a wrong match is worse than no match.
const { get } = require('./deezer')
const memo = require('./memo')
const normalize = require('./normalize')
const { norm, stripDecor, dice, sameArtist, VARIANT_RE } = require('./text')

const DAY = 24 * 60 * 60 * 1000
const clean = (s = '') => String(s).replace(/"/g, ' ').replace(/\s+/g, ' ').trim()

const titleScore = (candidateTitle, wantedTitle) => {
  const a = norm(stripDecor(candidateTitle))
  const b = norm(stripDecor(wantedTitle))
  if (!a || !b) return 0
  return a === b ? 1 : dice(a, b)
}

const pickTrack = (candidates, { title, artist }) => {
  let best = null
  candidates.forEach((c, position) => {
    if (!c?.id || !c.title) return
    if (artist && !sameArtist(c.artist?.name, artist)) return
    const ts = titleScore(c.title_short || c.title, title)
    if (ts < 0.7) return
    const variantPenalty = VARIANT_RE.test(c.title) && !VARIANT_RE.test(title) ? 0.4 : 0
    // Deezer's own ranking as a gentle tiebreaker (earlier + more popular wins)
    const score = ts - variantPenalty - position * 0.01 + Math.min(c.rank || 0, 1e6) / 1e8
    if (score >= 0.6 && (!best || score > best.score)) best = { score, track: c }
  })
  return best?.track || null
}

const resolveTrack = ({ title, artist }) => {
  const t = stripDecor(title)
  if (!t) return Promise.resolve(null)
  return memo(`resolve:track:${norm(artist)}|${norm(t)}`, DAY, async () => {
    const strict = await get('/search', { q: `artist:"${clean(artist)}" track:"${clean(t)}"`, limit: 6 })
    let found = pickTrack(strict.data || [], { title: t, artist })
    if (!found) {
      const loose = await get('/search', { q: `${clean(artist)} ${clean(t)}`, limit: 8 })
      found = pickTrack(loose.data || [], { title: t, artist })
    }
    return found ? normalize.track(found) : null
  }, { staleMs: 7 * DAY })
}

const resolveArtist = (name) => {
  if (!name) return Promise.resolve(null)
  return memo(`resolve:artist:${norm(name)}`, DAY, async () => {
    const res = await get('/search/artist', { q: clean(name), limit: 5 })
    const exact = (res.data || []).find((a) => norm(a.name) === norm(name))
    return exact ? normalize.artist(exact) : null
  }, { staleMs: 7 * DAY })
}

const resolveAlbum = ({ title, artist }) => {
  const t = stripDecor(title)
  if (!t) return Promise.resolve(null)
  return memo(`resolve:album:${norm(artist)}|${norm(t)}`, DAY, async () => {
    const res = await get('/search/album', { q: `artist:"${clean(artist)}" album:"${clean(t)}"`, limit: 6 })
    const hit = (res.data || []).find(
      (a) => titleScore(a.title, t) >= 0.75 && (!artist || sameArtist(a.artist?.name, artist))
    )
    return hit ? normalize.album(hit) : null
  }, { staleMs: 7 * DAY })
}

// Run `fn` over `items` keeping at most `size` in flight; failures become null.
const mapSoft = async (items, fn, size = 5) => {
  const out = new Array(items.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try { out[i] = await fn(items[i], i) } catch { out[i] = null }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return out
}

// Like mapSoft, but stops taking new work after `ms` and returns what it has:
//   results[i]: value | null (failed) | undefined (not reached). Finished lookups stay cached, so a retry continues where this stopped.
const mapSoftDeadline = async (items, fn, { size = 5, ms = 7000 } = {}) => {
  const results = new Array(items.length).fill(undefined)
  let next = 0
  let cancelled = false
  const worker = async () => {
    while (!cancelled && next < items.length) {
      const i = next++
      try { results[i] = await fn(items[i], i) } catch { results[i] = null }
    }
  }
  let timer
  const deadline = new Promise((resolve) => { timer = setTimeout(resolve, ms) })
  await Promise.race([Promise.all(Array.from({ length: Math.min(size, items.length) }, worker)), deadline])
  clearTimeout(timer)
  cancelled = true
  return { results, pending: results.filter((r) => r === undefined).length }
}

module.exports = { resolveTrack, resolveArtist, resolveAlbum, mapSoft, mapSoftDeadline, pickTrack }
