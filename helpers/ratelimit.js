// Tiny fixed-window, in-memory rate limiter (per client IP + limiter name). No extra dependency.
// Note: keyed on req.ip. With `trust proxy: true` that is the left-most X-Forwarded-For entry, which a
// determined client can spoof. Fine for stopping buggy/greedy clients; not a defence against an attacker.
const buckets = new Map()

const rateLimit = ({ name, windowMs = 60000, max = 120, skip } = {}) => (req, res, next) => {
  if (skip && skip(req)) return next()
  const now = Date.now()
  const key = `${name}:${req.ip}`
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count += 1

  res.set({
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(Math.max(0, max - bucket.count)),
    'X-RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000)),
  })

  if (bucket.count > max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    res.set('Retry-After', String(retryAfter))
    return res.status(429).json({ success: false, message: 'Too many requests, slow down', retryAfterSeconds: retryAfter })
  }
  return next()
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) if (now >= bucket.resetAt) buckets.delete(key)
}, 60000).unref()

module.exports = { rateLimit }
