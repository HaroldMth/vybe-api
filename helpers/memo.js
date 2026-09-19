// In-memory cache with in-flight de-duplication and stale-if-error.
//   memo(key, ttlMs, fn, { staleMs })
// - concurrent callers for the same key share one call to fn
// - if fn fails and an expired entry is younger than ttl+staleMs, the old value is served instead
const MAX_ENTRIES = Number(process.env.MEMO_MAX_ENTRIES) || 1200

const store = new Map()
const inflight = new Map()

const prune = () => {
  if (store.size <= MAX_ENTRIES) return
  const drop = Math.ceil(MAX_ENTRIES * 0.1)
  const it = store.keys()
  for (let i = 0; i < drop; i += 1) store.delete(it.next().value)
}

const memo = (key, ttlMs, fn, { staleMs = 0 } = {}) => {
  const hit = store.get(key)
  if (hit && Date.now() < hit.expiresAt) return Promise.resolve(hit.value)
  if (inflight.has(key)) return inflight.get(key)

  const promise = (async () => {
    try {
      const value = await fn()
      store.delete(key) // re-insert so the Map order stays roughly oldest-first
      store.set(key, { value, expiresAt: Date.now() + ttlMs, staleUntil: Date.now() + ttlMs + staleMs })
      prune()
      return value
    } catch (err) {
      if (hit && Date.now() < hit.staleUntil) return hit.value
      throw err
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

// Mark an entry as expired but keep it for stale-if-error.
memo.expire = (key) => { const hit = store.get(key); if (hit) hit.expiresAt = 0 }
memo.clear = () => { store.clear(); inflight.clear() }
memo.size = () => store.size

module.exports = memo
