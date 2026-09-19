const axios = require('axios')
const { createLimiter, withRetry, isTransient } = require('./http')
const memo = require('./memo')

const BASE = process.env.DEEZER_BASE || 'https://api.deezer.com'
const dz = axios.create({ baseURL: BASE, timeout: 8000 })

// Deezer allows roughly 50 requests / 5s per IP and answers over-quota calls with HTTP 200 + {error:{code:4}}.
const limited = createLimiter({ concurrency: 5, gapMs: 110 })

class DeezerError extends Error {
  constructor(error = {}) {
    super(`Deezer error: ${error.message || 'unknown'}`)
    this.code = error.code
    this.retryable = error.code === 4 || error.code === 700 // quota exceeded / service busy
  }
}

const request = (path, params) =>
  withRetry(
    () =>
      limited(async () => {
        const { data } = await dz.get(path, { params })
        if (data?.error) throw new DeezerError(data.error)
        return data
      }),
    { retries: 2, baseMs: 900, shouldRetry: (err) => err.retryable || isTransient(err) }
  )

const HOUR = 60 * 60 * 1000
const ttlFor = (path) => {
  if (/^\/(chart|editorial|radio)/.test(path)) return 15 * 60 * 1000
  if (/^\/search/.test(path)) return 30 * 60 * 1000
  if (/^\/(playlist|genre)/.test(path)) return HOUR
  return 6 * HOUR // artist / album / track metadata barely changes
}

const keyFor = (path, params) => {
  const qs = Object.keys(params || {}).sort().map((k) => `${k}=${params[k]}`).join('&')
  return `dz:${path}?${qs}`
}

// get(path, params, { ttl }) -> Deezer JSON. Cached, de-duplicated, rate limited, retried.
const get = (path, params = {}, { ttl } = {}) =>
  memo(keyFor(path, params), ttl ?? ttlFor(path), () => request(path, params), { staleMs: 12 * HOUR })

// Same as get() but resolves to null instead of throwing (for optional sections).
const soft = (path, params = {}, opts) => get(path, params, opts).catch(() => null)

module.exports = { get, soft, DeezerError }
