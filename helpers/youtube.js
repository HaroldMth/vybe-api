const axios = require('axios')
const { parseQuery, parseDurationToSec, pickBestTrack, UNWANTED_TITLE_RE } = require('./trackMatch')

const PROVIDERS = [
  {
    name: 'PrinceTech',
    url: process.env.PRINCE_API || 'https://api.princetechn.com/api/download/ytmp3',
    params: (videoUrl) => ({ apikey: process.env.PRINCE_KEY || 'prince', url: videoUrl }),
  },
  {
    name: 'GiftedTech',
    url: 'https://api.giftedtech.co.ke/api/download/ytaudio',
    params: (videoUrl) => ({ apikey: process.env.GIFTED_KEY || 'gifted-api_p1r5icplshukpe2x', url: videoUrl }),
  },
  {
    name: 'DavidCyril',
    url: 'https://apis.davidcyril.name.ng/download/ytv3',
    params: (videoUrl) => ({ url: videoUrl }),
  },
]

const firstSuccessful = (promises) =>
  new Promise((resolve, reject) => {
    const errors = []
    let remaining = promises.length

    if (remaining === 0) return reject(new Error('No providers configured'))

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

const fetchFromProvider = async (provider, videoUrl, signal) => {
  console.info(`[youtube helper] trying provider ${provider.name}`)

  try {
    const params = provider.params(videoUrl)
    const config = { params, timeout: 10000 }
    if (signal) config.signal = signal

    const { data } = await axios.get(provider.url, config)

    if (!data || !data.success || !data.result || !data.result.download_url) {
      throw new Error(`${provider.name} failed to return a valid stream URL`)
    }

    console.info(`[youtube helper] provider ${provider.name} succeeded`)

    return {
      url: data.result.download_url,
      title: data.result.title,
      duration: data.result.duration,
      thumbnail: data.result.thumbnail,
      quality: data.result.quality,
      format: data.result.format,
    }
  } catch (error) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      console.warn(`[youtube helper] provider ${provider.name} aborted`)
    } else {
      console.warn(`[youtube helper] provider ${provider.name} failed: ${error.message}`)
    }
    throw error
  }
}

const pickYoutubeVideo = async (query, hints = {}) => {
  const YouTube = require('youtube-sr').default
  const parsed = parseQuery(query)
  const expected = {
    title: hints.title || parsed.title,
    artist: hints.artist || parsed.artist,
    durationSec: hints.durationSec,
  }

  const searchQuery =
    expected.artist && expected.title
      ? `${expected.artist} ${expected.title} official audio`
      : `${query} official audio`

  console.info(`[youtube helper] searching YouTube for "${searchQuery}"`)

  const results = await YouTube.search(searchQuery, { limit: 20, type: 'video' })
  const candidates = results
    .filter((item) => item.id)
    .map((item) => ({
      title: item.title,
      artist: expected.artist || item.channel?.name || '',
      duration: item.durationFormatted,
      durationSec: parseDurationToSec(item.durationFormatted),
      videoId: item.id,
      thumbnail: item.thumbnail?.url,
    }))

  if (candidates.length === 0) throw new Error('No YouTube videos found')

  const isAcceptable = (video) => video && !UNWANTED_TITLE_RE.test(video.title)

  // First pass: high-confidence match (score ≥ 110)
  let best = pickBestTrack(candidates, expected, { minScore: 110 })

  // Second pass: relax threshold to 50 — still scored, just more lenient
  if (!isAcceptable(best)) {
    console.info('[youtube helper] high-confidence match failed, retrying with minScore=50')
    best = pickBestTrack(candidates, expected, { minScore: 50 })
  }

  // Last resort: first candidate that isn't a cover/remix, then absolute first
  if (!isAcceptable(best)) {
    console.warn('[youtube helper] scored match failed — using first acceptable candidate (emergency fallback)')
    best = candidates.find(isAcceptable) || candidates[0]
  }

  console.info(`[youtube helper] picked "${best.title}" (${best.duration})`)

  return best
}

const getYoutubeStreamUrl = async (query, hints = {}) => {
  const video = await pickYoutubeVideo(query, hints)
  const videoUrl = `https://youtu.be/${video.videoId}`

  console.info(`[youtube helper] downloading audio from ${videoUrl}`)

  const controllers = PROVIDERS.map(() =>
    typeof AbortController !== 'undefined' ? new AbortController() : null
  )

  const requests = PROVIDERS.map((provider, index) =>
    fetchFromProvider(provider, videoUrl, controllers[index] ? controllers[index].signal : undefined)
  )

  try {
    const result = await firstSuccessful(requests)
    controllers.forEach((controller) => controller && controller.abort())
    return {
      ...result,
      title: result.title || video.title,
      thumbnail: result.thumbnail || video.thumbnail,
    }
  } catch (err) {
    throw new Error(`Stream fetch failed: ${err.message}`)
  }
}

module.exports = { getYoutubeStreamUrl, getStreamUrl: getYoutubeStreamUrl }
