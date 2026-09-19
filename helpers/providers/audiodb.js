const memo = require('../memo')
const { client } = require('../http')
const { norm } = require('../text')

// '2' is TheAudioDB's public test key (rate limited). Set AUDIODB_KEY if you have a supporter key.
const http = client(process.env.AUDIODB_BASE || `https://www.theaudiodb.com/api/v1/json/${process.env.AUDIODB_KEY || '2'}`, { timeout: 6000 })
const DAY = 24 * 60 * 60 * 1000

const artist = (name) =>
  name
    ? memo(`adb:artist:${norm(name)}`, 7 * DAY, async () => {
        const { data } = await http.get('/search.php', { params: { s: name } })
        const hit = (data?.artists || []).find((a) => norm(a.strArtist) === norm(name))
        return hit || null
      }, { staleMs: 30 * DAY })
    : Promise.resolve(null)

const album = (albumName, artistName) =>
  albumName
    ? memo(`adb:album:${norm(artistName)}|${norm(albumName)}`, 7 * DAY, async () => {
        const { data } = await http.get('/searchalbum.php', { params: { s: artistName || '', a: albumName } })
        const hit = (data?.album || []).find((a) => norm(a.strAlbum) === norm(albumName))
        return hit || null
      }, { staleMs: 30 * DAY })
    : Promise.resolve(null)

module.exports = { artist, album }
