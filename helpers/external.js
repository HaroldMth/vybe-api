const axios = require('axios')

const USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT || 'VYBE/1.0.0 (https://example.com)'

const lastfm = axios.create({
  baseURL: 'https://ws.audioscrobbler.com/2.0/',
  timeout: 7000,
})

const audioDb = axios.create({
  baseURL: `https://www.theaudiodb.com/api/v1/json/${process.env.AUDIODB_KEY || '2'}`,
  timeout: 7000,
})

const musicBrainz = axios.create({
  baseURL: 'https://musicbrainz.org/ws/2',
  timeout: 7000,
  headers: {
    'User-Agent': USER_AGENT,
  },
})

const itunes = axios.create({
  baseURL: 'https://itunes.apple.com',
  timeout: 7000,
})

const cleanText = (value = '') =>
  String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const getLastfm = async (method, params = {}) => {
  if (!process.env.LASTFM_KEY) return null

  const { data } = await lastfm.get('/', {
    params: {
      method,
      api_key: process.env.LASTFM_KEY,
      format: 'json',
      autocorrect: 1,
      ...params,
    },
  })

  if (data?.error) throw new Error(data.message || 'Last.fm request failed')
  return data
}

const getArtistBio = async (artistName) => {
  if (!artistName) return null

  const [lastfmResult, audioDbResult, musicBrainzResult] = await Promise.allSettled([
    getLastfm('artist.getinfo', { artist: artistName }),
    audioDb.get('/search.php', { params: { s: artistName } }),
    musicBrainz.get('/artist', {
      params: {
        query: `artist:"${artistName}"`,
        fmt: 'json',
        limit: 1,
      },
    }),
  ])

  const lastfmArtist = lastfmResult.status === 'fulfilled' ? lastfmResult.value?.artist : null
  const audioArtist = audioDbResult.status === 'fulfilled' ? audioDbResult.value?.data?.artists?.[0] : null
  const mbArtist = musicBrainzResult.status === 'fulfilled' ? musicBrainzResult.value?.data?.artists?.[0] : null

  return {
    bio: cleanText(audioArtist?.strBiographyEN || lastfmArtist?.bio?.summary || ''),
    country: audioArtist?.strCountry || mbArtist?.country || null,
    formedYear: audioArtist?.intFormedYear || mbArtist?.['life-span']?.begin?.slice(0, 4) || null,
    disbandedYear: audioArtist?.intDiedYear || mbArtist?.['life-span']?.end?.slice(0, 4) || null,
    genres: [
      audioArtist?.strGenre,
      audioArtist?.strStyle,
      ...(lastfmArtist?.tags?.tag || []).map((tag) => tag.name),
    ].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).slice(0, 8),
    links: {
      website: audioArtist?.strWebsite ? `https://${audioArtist.strWebsite.replace(/^https?:\/\//, '')}` : null,
      lastfm: lastfmArtist?.url || null,
      musicBrainz: mbArtist?.id ? `https://musicbrainz.org/artist/${mbArtist.id}` : null,
      facebook: audioArtist?.strFacebook ? `https://${audioArtist.strFacebook.replace(/^https?:\/\//, '')}` : null,
      twitter: audioArtist?.strTwitter ? `https://${audioArtist.strTwitter.replace(/^https?:\/\//, '')}` : null,
      instagram: audioArtist?.strInstagram ? `https://${audioArtist.strInstagram.replace(/^https?:\/\//, '')}` : null,
    },
    stats: {
      listeners: Number(lastfmArtist?.stats?.listeners) || null,
      playcount: Number(lastfmArtist?.stats?.playcount) || null,
    },
    sourceIds: {
      musicBrainz: mbArtist?.id || null,
      audioDb: audioArtist?.idArtist || null,
    },
  }
}

const getAlbumInfo = async (albumName, artistName) => {
  if (!albumName) return null

  const [audioDbResult, musicBrainzResult] = await Promise.allSettled([
    audioDb.get('/searchalbum.php', { params: { s: artistName || '', a: albumName } }),
    musicBrainz.get('/release-group', {
      params: {
        query: artistName ? `releasegroup:"${albumName}" AND artist:"${artistName}"` : `releasegroup:"${albumName}"`,
        fmt: 'json',
        limit: 1,
      },
    }),
  ])

  const audioAlbum = audioDbResult.status === 'fulfilled' ? audioDbResult.value?.data?.album?.[0] : null
  const mbAlbum = musicBrainzResult.status === 'fulfilled' ? musicBrainzResult.value?.data?.['release-groups']?.[0] : null

  return {
    description: cleanText(audioAlbum?.strDescriptionEN || ''),
    label: audioAlbum?.strLabel || null,
    genre: audioAlbum?.strGenre || null,
    style: audioAlbum?.strStyle || null,
    mood: audioAlbum?.strMood || null,
    musicBrainzId: mbAlbum?.id || null,
    audioDbId: audioAlbum?.idAlbum || null,
  }
}

const getSimilarTracks = async (artist, track, limit = 12) => {
  const data = await getLastfm('track.getsimilar', { artist, track, limit })
  return (data?.similartracks?.track || []).map((item) => ({
    name: item.name,
    artist: item.artist?.name || artist,
    match: Number(item.match) || null,
    url: item.url || null,
  }))
}

const getSimilarArtists = async (artist, limit = 12) => {
  const data = await getLastfm('artist.getsimilar', { artist, limit })
  return (data?.similarartists?.artist || []).map((item) => ({
    name: item.name,
    match: Number(item.match) || null,
    url: item.url || null,
    image: item.image || [],
  }))
}

const getTagTracks = async (tag, limit = 20) => {
  const data = await getLastfm('tag.gettoptracks', { tag, limit })
  return (data?.tracks?.track || []).map((item) => ({
    name: item.name,
    artist: item.artist?.name || '',
    url: item.url || null,
    image: item.image || [],
  }))
}

const searchMusicVideos = async (query, limit = 12) => {
  const { data } = await itunes.get('/search', {
    params: {
      term: query,
      media: 'musicVideo',
      entity: 'musicVideo',
      limit,
    },
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

module.exports = {
  getArtistBio,
  getAlbumInfo,
  getSimilarTracks,
  getSimilarArtists,
  getTagTracks,
  searchMusicVideos,
}
