// Metadata composition: artist bios, album info, music videos.
// Each provider is optional; slow ones are capped so a page never waits on them for long.
const axios = require('axios')
const wikipedia = require('./providers/wikipedia')
const audiodb = require('./providers/audiodb')
const musicbrainz = require('./providers/musicbrainz')
const lastfm = require('./providers/lastfm')
const { withTimeout } = require('./http')
const { norm } = require('./text')

const itunes = axios.create({ baseURL: 'https://itunes.apple.com', timeout: 7000 })

const cleanText = (value = '') =>
  String(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

const withHttps = (url) => (url ? `https://${String(url).replace(/^https?:\/\//, '')}` : null)

// Providers keep running after the timeout and fill their caches, so the next request is instant.
const settle = (promise, ms) => withTimeout(Promise.resolve(promise), ms, 'provider').catch(() => null)

const NOISE_TAG_RE = /^(seen live|favou?rites?|awesome|albums? i own|under \d+ listeners)$/i

const getArtistBio = async (artistName, { timeoutMs = 4500 } = {}) => {
  if (!artistName) return null

  const [wiki, adb, mb, lfm] = await Promise.all([
    settle(wikipedia.getArtistSummary(artistName), timeoutMs),
    settle(audiodb.artist(artistName), timeoutMs),
    settle(musicbrainz.artist(artistName), timeoutMs),
    settle(lastfm.artistInfo(artistName), timeoutMs),
  ])

  const bios = [
    { source: 'wikipedia', text: cleanText(wiki?.extract) },
    { source: 'theaudiodb', text: cleanText(adb?.strBiographyEN) },
    { source: 'lastfm', text: lastfm.cleanBio(lfm?.bio?.summary) },
  ]
  const bio = bios.find((b) => b.text.length > 40) || { source: null, text: '' }

  const seen = new Set()
  const genres = [
    adb?.strGenre,
    adb?.strStyle,
    ...(lfm?.tags?.tag || []).map((t) => t.name),
    ...(mb?.tags || []),
  ]
    .filter((g) => g && !NOISE_TAG_RE.test(g))
    .filter((g) => (seen.has(norm(g)) ? false : seen.add(norm(g))))
    .slice(0, 8)

  return {
    bio: bio.text,
    bioSource: bio.source,
    country: adb?.strCountry || mb?.country || null,
    countryCode: mb?.country || null,
    type: mb?.type || null,
    formedYear: adb?.intFormedYear || mb?.begin?.slice(0, 4) || null,
    disbandedYear: adb?.intDiedYear || (mb?.ended ? mb.end?.slice(0, 4) : null) || null,
    genres,
    images: {
      wikipedia: wiki?.thumbnail || null,
      banner: adb?.strArtistBanner || null,
      fanart: adb?.strArtistFanart || null,
      thumb: adb?.strArtistThumb || null,
      logo: adb?.strArtistLogo || null,
    },
    links: {
      website: withHttps(adb?.strWebsite),
      wikipedia: wiki?.url || null,
      lastfm: lfm?.url || null,
      musicBrainz: mb?.id ? `https://musicbrainz.org/artist/${mb.id}` : null,
      facebook: withHttps(adb?.strFacebook),
      twitter: withHttps(adb?.strTwitter),
      instagram: withHttps(adb?.strInstagram),
    },
    stats: {
      listeners: Number(lfm?.stats?.listeners) || null,
      playcount: Number(lfm?.stats?.playcount) || null,
    },
    sourceIds: { musicBrainz: mb?.id || null, audioDb: adb?.idArtist || null },
  }
}

const getAlbumInfo = async (albumName, artistName, { timeoutMs = 4500 } = {}) => {
  if (!albumName) return null

  const [wiki, adb, mb] = await Promise.all([
    settle(wikipedia.getAlbumSummary(albumName, artistName), timeoutMs),
    settle(audiodb.album(albumName, artistName), timeoutMs),
    settle(musicbrainz.albumGroup(albumName, artistName), timeoutMs),
  ])

  const wikiText = cleanText(wiki?.extract)
  const adbText = cleanText(adb?.strDescriptionEN)

  return {
    description: wikiText || adbText,
    descriptionSource: wikiText ? 'wikipedia' : adbText ? 'theaudiodb' : null,
    label: adb?.strLabel || null,
    genre: adb?.strGenre || null,
    style: adb?.strStyle || null,
    mood: adb?.strMood || null,
    wikipediaUrl: wiki?.url || null,
    musicBrainzId: mb?.id || null,
    audioDbId: adb?.idAlbum || null,
  }
}

const searchMusicVideos = async (query, limit = 12) => {
  const { data } = await itunes.get('/search', {
    params: { term: query, media: 'musicVideo', entity: 'musicVideo', limit },
  })

  return (data?.results || []).map((item) => ({
    id: String(item.trackId),
    name: item.trackName,
    artist: item.artistName,
    album: item.collectionName || null,
    url: item.trackViewUrl,
    previewUrl: item.previewUrl,
    image: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '',
    releaseDate: item.releaseDate || null,
  }))
}

module.exports = { getArtistBio, getAlbumInfo, searchMusicVideos }
