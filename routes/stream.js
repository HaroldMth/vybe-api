const router = require('express').Router()
const axios = require('axios')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { getStreamUrl } = require('../helpers/stream')

const AUDIO_CACHE_DIR = path.join(__dirname, '..', '.cache', 'audio')
const resolvedStreamCache = new Map()
const pendingDownloads = new Map()

const ensureAudioCacheDir = async () => {
  await fs.promises.mkdir(AUDIO_CACHE_DIR, { recursive: true })
}

const getCacheKey = (query, meta = {}) => {
  const base = meta.spotifyUrl || query.trim().toLowerCase()
  return crypto.createHash('sha1').update(base).digest('hex')
}

const getAudioExtension = (url) => {
  const cleanUrl = url.split('?')[0]
  const ext = path.extname(cleanUrl).toLowerCase()
  return ['.mp3', '.m4a', '.aac', '.ogg', '.wav', '.webm'].includes(ext) ? ext : '.mp3'
}

const getCachePath = (query, url, meta = {}) =>
  path.join(AUDIO_CACHE_DIR, `${getCacheKey(query, meta)}${getAudioExtension(url)}`)

const getPublicAudioUrl = (req, query) => {
  return `${req.protocol}://${req.get('host')}/api/stream/audio?q=${encodeURIComponent(query)}`
}

const resolveStream = async (query) => {
  const key = query.trim().toLowerCase()
  const cached = resolvedStreamCache.get(key)
  if (cached) return cached

  const result = await getStreamUrl(query)
  resolvedStreamCache.set(key, result)
  return result
}

const getCachedFileInfo = async (filePath) => {
  try {
    const stat = await fs.promises.stat(filePath)
    return stat.isFile() && stat.size > 0 ? stat : null
  } catch {
    return null
  }
}

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  const types = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
  }
  return types[ext] || 'audio/mpeg'
}

const downloadToCache = async (query, url, meta = {}) => {
  const cacheKey = getCacheKey(query, meta)
  const pending = pendingDownloads.get(cacheKey)
  if (pending) return pending

  const download = (async () => {
    await ensureAudioCacheDir()
    const filePath = getCachePath(query, url, meta)
    const existing = await getCachedFileInfo(filePath)
    if (existing) return filePath

    const tempPath = `${filePath}.tmp-${Date.now()}`
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'VYBE/1.0',
      },
    })

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tempPath)
      response.data.pipe(writer)
      writer.on('finish', resolve)
      writer.on('error', reject)
      response.data.on('error', reject)
    })

    await fs.promises.rename(tempPath, filePath)
    return filePath
  })().finally(() => {
    pendingDownloads.delete(cacheKey)
  })

  pendingDownloads.set(cacheKey, download)
  return download
}

const sendCachedAudio = (req, res, filePath, stat) => {
  const contentType = getContentType(filePath)
  const range = req.headers.range

  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', contentType)

  if (!range) {
    res.setHeader('Content-Length', stat.size)
    fs.createReadStream(filePath).pipe(res)
    return
  }

  const match = range.match(/bytes=(\d*)-(\d*)/)
  if (!match) {
    res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end()
    return
  }

  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
    res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end()
    return
  }

  res.status(206)
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
  res.setHeader('Content-Length', end - start + 1)
  fs.createReadStream(filePath, { start, end }).pipe(res)
}

const proxyRemoteAudio = async (req, res, url) => {
  const headers = {
    'User-Agent': 'VYBE/1.0',
  }
  if (req.headers.range) headers.Range = req.headers.range

  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 30000,
    headers,
    validateStatus: status => (status >= 200 && status < 300) || status === 416,
  })

  res.status(response.status)
  ;['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((header) => {
    if (response.headers[header]) res.setHeader(header, response.headers[header])
  })
  if (!res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes')
  response.data.pipe(res)
}

router.get('/', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  try {
    const result = await getStreamUrl(q)
    resolvedStreamCache.set(q.trim().toLowerCase(), result)
    res.json({
      success: true,
      data: {
        ...result,
        sourceUrl: result.url,
        url: getPublicAudioUrl(req, q),
        cached: Boolean(await getCachedFileInfo(getCachePath(q, result.url, result))),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/audio', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  try {
    const result = await resolveStream(q)
    const filePath = getCachePath(q, result.url, result)
    const cachedStat = await getCachedFileInfo(filePath)

    if (cachedStat) {
      res.setHeader('X-VYBE-Source', result.source || 'unknown')
      sendCachedAudio(req, res, filePath, cachedStat)
      return
    }

    if (req.headers.range) {
      const cachedPath = await downloadToCache(q, result.url, result)
      const stat = await getCachedFileInfo(cachedPath)
      if (!stat) throw new Error('Cached audio file not available')
      res.setHeader('X-VYBE-Source', result.source || 'unknown')
      sendCachedAudio(req, res, cachedPath, stat)
      return
    }

    downloadToCache(q, result.url, result).catch((error) => {
      console.warn(`[stream route] background cache failed for "${q}": ${error.message}`)
    })
    res.setHeader('X-VYBE-Source', result.source || 'unknown')
    await proxyRemoteAudio(req, res, result.url)
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message })
    } else {
      res.end()
    }
  }
})

module.exports = router
