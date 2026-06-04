const axios = require('axios')

const SPOTIFY_TRACK_RE = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/

const SEARCH_URL =
  process.env.GIFTED_SPOTIFY_SEARCH ||
  'https://api.giftedtech.co.ke/api/search/spotifysearch'

const DOWNLOAD_PROVIDERS = [
  {
    name: 'spotifydl',
    url: process.env.SPOTIFY_DL || 'https://apis.davidcyril.name.ng/spotifydl',
    extractUrl: (data) => data?.DownloadLink,
  },
  {
    name: 'spotifydl2',
    url: process.env.SPOTIFY_DL2 || 'https://apis.davidcyril.name.ng/spotifydl2',
    extractUrl: (data) => data?.results?.downloadMP3,
  },
]

const firstSuccessful = (promises) =>
  new Promise((resolve, reject) => {
    const errors = []
    let remaining = promises.length

    if (remaining === 0) return reject(new Error('No Spotify download providers configured'))

    promises.forEach((promise) => {
      promise.then(resolve).catch((error) => {
        errors.push(error)
        remaining -= 1
        if (remaining === 0) {
          reject(new Error(errors.map((e) => e.message).join('; ')))
        }
      })
    })
  })

const extractSpotifyTrackUrl = (input) => {
  const match = String(input).match(SPOTIFY_TRACK_RE)
  return match ? `https://open.spotify.com/track/${match[1]}` : null
}

const searchSpotifyTrack = async (query) => {
  const apikey = process.env.GIFTED_KEY || 'gifted-api_p1r5icplshukpe2x'

  console.info(`[spotify helper] searching for "${query}"`)

  const { data } = await axios.get(SEARCH_URL, {
    params: { apikey, query },
    timeout: 12000,
  })

  if (!data?.success || !Array.isArray(data.results) || data.results.length === 0) {
    throw new Error('No Spotify tracks found')
  }

  const track = data.results[0]
  if (!track?.url) throw new Error('Spotify search returned no track URL')

  return {
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail,
    duration: track.duration,
    spotifyUrl: track.url,
  }
}

const fetchDownloadFromProvider = async (provider, spotifyUrl, signal) => {
  console.info(`[spotify helper] trying download provider ${provider.name}`)

  try {
    const config = {
      params: { url: spotifyUrl },
      timeout: 20000,
    }
    if (signal) config.signal = signal

    const { data } = await axios.get(provider.url, config)

    if (!data?.success) {
      throw new Error(`${provider.name} returned unsuccessful response`)
    }

    const downloadUrl = provider.extractUrl(data)
    if (!downloadUrl) {
      throw new Error(`${provider.name} failed to return a download URL`)
    }

    console.info(`[spotify helper] provider ${provider.name} succeeded`)

    return {
      url: downloadUrl,
      title: data.title || data.results?.title,
      duration: data.duration || data.results?.duration,
      thumbnail: data.thumbnail || data.results?.image,
      format: 'mp3',
      quality: '128kbps',
    }
  } catch (error) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      console.warn(`[spotify helper] provider ${provider.name} aborted`)
    } else {
      console.warn(`[spotify helper] provider ${provider.name} failed: ${error.message}`)
    }
    throw error
  }
}

const getSpotifyDownloadUrl = async (spotifyUrl) => {
  const controllers = DOWNLOAD_PROVIDERS.map(() =>
    typeof AbortController !== 'undefined' ? new AbortController() : null
  )

  const requests = DOWNLOAD_PROVIDERS.map((provider, index) =>
    fetchDownloadFromProvider(
      provider,
      spotifyUrl,
      controllers[index] ? controllers[index].signal : undefined
    )
  )

  try {
    const result = await firstSuccessful(requests)
    controllers.forEach((controller) => controller && controller.abort())
    return result
  } catch (err) {
    throw new Error(`Spotify download failed: ${err.message}`)
  }
}

const getSpotifyStreamUrl = async (query) => {
  const directUrl = extractSpotifyTrackUrl(query)
  const meta = directUrl
    ? { spotifyUrl: directUrl, title: null, artist: null, thumbnail: null, duration: null }
    : await searchSpotifyTrack(query)

  const download = await getSpotifyDownloadUrl(meta.spotifyUrl)

  return {
    url: download.url,
    title: download.title || meta.title,
    artist: meta.artist,
    duration: download.duration || meta.duration,
    thumbnail: download.thumbnail || meta.thumbnail,
    quality: download.quality,
    format: download.format || 'mp3',
    source: 'spotify',
    spotifyUrl: meta.spotifyUrl,
  }
}

module.exports = {
  getSpotifyStreamUrl,
  searchSpotifyTrack,
  extractSpotifyTrackUrl,
}
