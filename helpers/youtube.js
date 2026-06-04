const axios = require('axios')

const PROVIDERS = [
  {
    name: 'PrinceTech',
    url: process.env.PRINCE_API || 'https://api.princetechn.com/api/download/ytmp3',
    params: (videoUrl) => ({ apikey: process.env.PRINCE_KEY || 'prince', url: videoUrl })
  },
  {
    name: 'GiftedTech',
    url: 'https://api.giftedtech.co.ke/api/download/ytaudio',
    params: (videoUrl) => ({ apikey: 'gifted', url: videoUrl })
  },
  {
    name: 'DavidCyril',
    url: 'https://apis.davidcyril.name.ng/download/ytv3',
    params: (videoUrl) => ({ url: videoUrl })
  }
]

const firstSuccessful = (promises) => {
  return new Promise((resolve, reject) => {
    const errors = []
    let remaining = promises.length

    if (remaining === 0) {
      return reject(new Error('No providers configured'))
    }

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
}

const fetchFromProvider = async (provider, videoUrl, signal) => {
  console.info(`[stream helper] trying provider ${provider.name}`)

  try {
    const params = provider.params(videoUrl)
    const config = { params, timeout: 10000 }
    if (signal) config.signal = signal

    const { data } = await axios.get(provider.url, config)

    if (!data || !data.success || !data.result || !data.result.download_url) {
      throw new Error(`${provider.name} failed to return a valid stream URL`)
    }

    console.info(`[stream helper] provider ${provider.name} succeeded`)

    return {
      url: data.result.download_url,
      title: data.result.title,
      duration: data.result.duration,
      thumbnail: data.result.thumbnail,
      quality: data.result.quality,
      format: data.result.format
    }
  } catch (error) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      console.warn(`[stream helper] provider ${provider.name} aborted`)
    } else {
      console.warn(`[stream helper] provider ${provider.name} failed: ${error.message}`)
    }
    throw error
  }
}

const getYoutubeStreamUrl = async (query) => {
  const YouTube = require('youtube-sr').default
  const results = await YouTube.search(query, { limit: 5, type: 'video' })
  const video = results.find((item) => item.id)
  if (!video) throw new Error('No video found')

  const videoId = video.id
  const videoUrl = `https://youtu.be/${videoId}`

  console.info(`[stream helper] searching stream providers for ${videoUrl}`)

  const controllers = PROVIDERS.map(() => {
    if (typeof AbortController === 'undefined') return null
    return new AbortController()
  })

  const requests = PROVIDERS.map((provider, index) =>
    fetchFromProvider(provider, videoUrl, controllers[index] ? controllers[index].signal : undefined)
  )

  try {
    const result = await firstSuccessful(requests)
    console.info('[stream helper] stream resolved by one provider')
    controllers.forEach((controller) => controller && controller.abort())
    return result
  } catch (err) {
    console.error(`[stream helper] all providers failed: ${err.message}`)
    throw new Error(`Stream fetch failed: ${err.message}`)
  }
}

module.exports = { getYoutubeStreamUrl, getStreamUrl: getYoutubeStreamUrl }
