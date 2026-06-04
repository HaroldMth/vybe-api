const axios = require('axios')

const BASE = 'https://api.deezer.com'

const dz = axios.create({
  baseURL: BASE,
  timeout: 8000,
})

const get = async (path, params = {}) => {
  const { data } = await dz.get(path, { params })
  if (data.error) throw new Error(`Deezer error: ${data.error.message}`)
  return data
}

module.exports = { get }
