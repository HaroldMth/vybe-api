// Maps upstream failures to sensible HTTP codes instead of a blanket 500.
const fail = (res, err) => {
  const status =
    err?.code === 800 ? 404 :               // Deezer: data not found
    err?.code === 4 ? 429 :                 // Deezer: quota exceeded (after retries)
    err?.response?.status === 404 ? 404 :
    500
  res.status(status).json({ success: false, message: err?.message || 'Request failed' })
}

const isId = (value) => /^\d+$/.test(String(value))

module.exports = { fail, isId }
