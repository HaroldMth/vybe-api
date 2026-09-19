// Works out which country a request is for. No hardcoded default: returns { country: null } if nothing is found.
// Order: app-sent value (from the phone's region setting) > CDN geo header > Accept-Language region.
const two = (v) => (/^[a-z]{2}$/i.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : null)

const fromAcceptLanguage = (header = '') => {
  for (const part of String(header).split(',')) {
    const m = part.trim().match(/^[a-z]{2,3}-([a-z]{2})\b/i) // "en-ZA;q=0.9" -> ZA
    if (m) return m[1].toLowerCase()
  }
  return null
}

const detectCountry = (req) => {
  const attempts = [
    ['query', two(req.query.country)],
    ['header', two(req.get('x-country'))],
    ['geoip', (() => { const c = two(req.get('cf-ipcountry')); return c && c !== 'xx' ? c : null })()],
    ['accept-language', fromAcceptLanguage(req.get('accept-language'))],
  ]
  const hit = attempts.find(([, value]) => value)
  return hit ? { country: hit[1], source: hit[0] } : { country: null, source: null }
}

module.exports = { detectCountry, two, fromAcceptLanguage }
