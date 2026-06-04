const axios = require('axios')
const SAAVN = process.env.SAAVN_URL

const get = async (path) => {
  const { data } = await axios.get(`${SAAVN}${path}`)
  return data
}

module.exports = { get }
