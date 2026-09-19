const axios = require('axios')

const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT || 'VYBE/1.0.0 (set MUSICBRAINZ_USER_AGENT=VYBE/1.0 (mailto:you@example.com))'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TRANSIENT_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'])

const isTransient = (err) => {
  const status = err?.response?.status
  if (status) return status === 429 || status >= 500
  return TRANSIENT_CODES.has(err?.code)
}

// Retries `fn` with exponential backoff. `shouldRetry` can override what counts as retryable.
const withRetry = async (fn, { retries = 2, baseMs = 500, shouldRetry = isTransient } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err
      await sleep(baseMs * 2 ** attempt + Math.random() * 120)
    }
  }
}

// Caps in-flight calls and enforces a minimum gap between call starts.
const createLimiter = ({ concurrency = 4, gapMs = 0 } = {}) => {
  let active = 0
  let nextSlot = 0
  const queue = []

  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift()
      active += 1
      const startAt = Math.max(Date.now(), nextSlot)
      nextSlot = startAt + gapMs
      setTimeout(() => {
        job.fn().then(job.resolve, job.reject).finally(() => {
          active -= 1
          pump()
        })
      }, startAt - Date.now())
    }
  }

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      pump()
    })
}

const withTimeout = (promise, ms, label = 'operation') =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })

const client = (baseURL, { timeout = 7000, headers = {} } = {}) =>
  axios.create({ baseURL, timeout, headers: { 'User-Agent': USER_AGENT, ...headers } })

module.exports = { USER_AGENT, sleep, isTransient, withRetry, createLimiter, withTimeout, client }
