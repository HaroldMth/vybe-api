// Offline stand-ins for Deezer / Apple / Wikipedia / AudioDB / MusicBrainz / Last.fm.
// The response shapes follow the providers' documented formats, but they are hand-written:
// passing tests prove the logic, not that the live APIs behave identically.
const http = require('http')

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const art = (id, name) => ({ id, name, picture_medium: `pm${id}`, picture_xl: `px${id}`, type: 'artist' })
const trk = (id, title, artist, extra = {}) => ({
  id, title, title_short: title, rank: 500000, duration: 200, preview: `https://p/${id}.mp3`,
  artist: art(artist.id, artist.name), album: { id: 500, title: 'Album', cover_medium: 'cm', cover_xl: 'cx' }, type: 'track', ...extra,
})

const A = { id: 1, name: 'Coldplay' }
const B = { id: 2, name: 'Keane' }
const C = { id: 3, name: 'Tems' }

const RUN_ID = Date.now()
const calls = {}
const hit = (k) => { calls[k] = (calls[k] || 0) + 1; return calls[k] }

const routes = {
  // ---- Deezer
  '/chart/0/tracks': () => ({ data: [trk(10, 'Trend One', A), trk(11, 'Trend Two', C)] }),
  '/chart/0/albums': () => ({ data: [{ id: 900, title: 'Chart Album', cover_medium: 'cam', artist: art(1, 'Coldplay'), type: 'album' }] }),
  '/chart/0/artists': () => ({ data: [art(1, 'Coldplay'), art(3, 'Tems')] }),
  '/chart/0/playlists': () => ({ data: [{ id: 700, title: 'Hits', picture_medium: 'ppm', nb_tracks: 50, type: 'playlist' }] }),
  '/editorial/0/selection': () => ({ data: [{ id: 901, title: 'Pick', cover_medium: 'pickm', artist: art(2, 'Keane'), type: 'album' }] }),
  '/genre': () => ({ data: [{ id: 0, name: 'All' }, { id: 2, name: 'Africa', picture_medium: 'gm' }, { id: 132, name: 'Pop' }] }),
  '/radio/top': () => ({ data: [{ id: 30, title: 'Hits Radio', picture_medium: 'rm' }] }),
  '/chart/2/tracks': () => ({ data: [trk(20, 'Afro Hit', C)] }),
  '/chart/2/artists': () => ({ data: [art(3, 'Tems')] }),
  '/track/77': () => trk(77, 'Yellow', A, { isrc: `TESTNOTFOUND${RUN_ID}` }),
  '/track/78': () => trk(78, 'Van Dale (feat. Philly & MocroManiac)', { id: 9, name: 'Woody' }, { isrc: `TESTFEAT${RUN_ID}` }),
  '/track/10': () => trk(10, 'Trend One', A, { bpm: 152 }),
  '/track/11': () => trk(11, 'Trend Two', C, { bpm: 0 }),
  '/api/v2/us/music/most-played/10/songs.json': () => { const e = new Error('nope'); e.status = 404; throw e },
  '/artist/1': () => art(1, 'Coldplay'),
  '/artist/1/albums': () => ({
    total: 2,
    data: [
      { id: 801, title: 'Old One', release_date: '2011-01-01', record_type: 'album', cover_medium: 'c1' },
      { id: 802, title: 'Fresh Single', release_date: daysAgo(10), record_type: 'single', cover_medium: 'c2' },
    ],
  }),
  '/artist/3/albums': () => ({ total: 1, data: [{ id: 803, title: 'Tems Single', release_date: daysAgo(5), record_type: 'single', cover_medium: 'c3' }] }),
  '/artist/1/top': () => ({ data: [trk(101, 'Yellow', A), trk(102, 'Clocks', A), trk(103, 'Fix You', A), trk(104, 'Magic', A)] }),
  '/artist/2/top': () => ({ data: [trk(201, 'Somewhere Only We Know', B), trk(202, 'Everybody Changing', B), trk(203, 'Bedshaped', B), trk(204, 'Crystal Ball', B)] }),
  '/artist/3/top': () => ({ data: [trk(301, 'Free Mind', C), trk(302, 'Yellow (Karaoke Version)', C)] }),
  '/artist/1/related': () => ({ data: [art(2, 'Keane'), art(3, 'Tems')] }),
  '/artist/1/radio': () => ({ data: [trk(201, 'Somewhere Only We Know', B), trk(401, 'Yellow - Karaoke Version', { id: 9, name: 'Karaoke Kings' })] }),
  '/artist/2': () => art(2, 'Keane'),
  '/artist/3': () => art(3, 'Tems'),
  '/artist/4/albums': () => ({ total: 0, data: [] }),
  '/track/100': () => trk(100, 'Yellow', A, {
    isrc: 'GBAYE0000567', bpm: 173, release_date: '2000-06-26', track_position: 5, disk_number: 1, link: 'https://dz/100',
    contributors: [{ id: 1, name: 'Coldplay', role: 'Main', picture_medium: 'pc' }],
  }),
  '/album/500': () => ({ id: 500, title: 'Parachutes', release_date: '2000-07-10', nb_tracks: 10, record_type: 'album', label: 'Parlophone', duration: 2400, fans: 5, upc: '123', link: 'https://dz/a500', genres: { data: [{ id: 152, name: 'Rock' }] }, cover_medium: 'cm', artist: art(1, 'Coldplay') }),
  '/album/500/tracks': () => ({ data: [{ id: 100, title: 'Yellow', duration: 269, preview: 'p' }] }),
  '/search/artist': (q) => ({ data: /keane/i.test(q.q) ? [art(2, 'Keane')] : /coldplay/i.test(q.q) ? [art(1, 'Coldplay')] : [] }),
  '/search/album': (q) => ({ data: /fresh/i.test(q.q) ? [{ id: 990, title: 'Fresh Album', artist: art(3, 'Tems'), cover_medium: 'fa' }] : [] }),
  '/search/playlist': () => ({ data: [{ id: 700 }] }),
  '/playlist/700/tracks': () => ({ data: [trk(601, 'Playlist Song', A)] }),
  '/quota-test': () => (hit('quota') === 1 ? { error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } } : { data: ['ok'] }),
  '/search': (q) => {
    const s = q.q || ''
    if (/Blinding Lights/i.test(s)) {
      return { data: [
        trk(1001, 'Blinding Lights (Karaoke Version)', { id: 50, name: 'The Weeknd' }),
        trk(1002, 'Blinding Lights', { id: 51, name: 'Some Cover Band' }),
        trk(1003, 'Blinding Lights', { id: 52, name: 'The Weeknd' }, { rank: 900000 }),
      ] }
    }
    if (/Free Mind/i.test(s)) return { data: [trk(301, 'Free Mind', C)] }
    if (/Yellow/i.test(s)) return { data: [trk(100, 'Yellow', A)] }
    return { data: [] }
  },
  // ---- Apple RSS
  '/api/v2/us/music/most-played/25/songs.json': () => ({ feed: { results: [
    { id: '1', name: 'Blinding Lights', artistName: 'The Weeknd', artworkUrl100: 'https://x/100x100bb.jpg', genres: [{ name: 'Pop' }], url: 'u' },
    { id: '2', name: 'Free Mind', artistName: 'Tems', artworkUrl100: 'https://x/100x100bb.jpg', genres: [{ name: 'R&B' }] },
    { id: '3', name: 'Unfindable Song', artistName: 'Nobody', artworkUrl100: '', genres: [] },
  ] } }),
  '/api/v2/us/music/most-played/25/albums.json': () => ({ feed: { results: [{ id: '9', name: 'Fresh Album (Deluxe)', artistName: 'Tems', artworkUrl100: '', genres: [] }] } }),
  // ---- Wikipedia (query string decides)
  '/w/api.php': (q) => {
    const s = q.gsrsearch || ''
    const page = (title, description, extract, index) => ({ pageid: index, title, description, extract, index, thumbnail: { source: 'https://w/thumb.jpg' } })
    if (/Coldplay/.test(s) && !/album/.test(s)) return { query: { pages: [
      page('Coldplay (album)', 'Album by someone', 'x'.repeat(80), 1),
      page('Coldplay', 'British rock band', 'Coldplay are a British rock band formed in London in 1997. They have sold many records worldwide.', 2),
    ] } }
    if (/Keane/.test(s)) return { query: { pages: [page('Keane', 'Surname', 'Keane is a surname of Irish origin used by many people.', 1)] } }
    if (/Parachutes/.test(s)) return { query: { pages: [page('Parachutes (album)', 'Debut studio album by Coldplay', 'Parachutes is the debut studio album by the British rock band Coldplay, released in 2000.', 1)] } }
    return { query: { pages: [] } }
  },
  // ---- AudioDB
  '/search.php': (q) => (/keane/i.test(q.s)
    ? { artists: [{ idArtist: '77', strArtist: 'Keane', strBiographyEN: 'Keane are an English rock band formed in Battle, East Sussex in 1995.', strGenre: 'Alternative Rock', strCountry: 'England', intFormedYear: '1995', strArtistBanner: 'https://a/banner.jpg' }] }
    : /coldplay/i.test(q.s) ? { artists: [{ idArtist: '1', strArtist: 'Coldplay' }] } : { artists: null }),
  '/searchalbum.php': () => ({ album: null }),
  // ---- MusicBrainz
  '/artist': (q) => ({ artists: [{ id: 'mb-1', score: 100, name: /keane/i.test(q.query) ? 'Keane' : 'Coldplay', country: 'GB', type: 'Group', 'life-span': { begin: '1997', ended: false }, tags: [{ name: 'britpop', count: 3 }] }] }),
  '/release-group': () => ({ 'release-groups': [] }),
}

const start = () => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const q = Object.fromEntries(url.searchParams)
    const handler = routes[url.pathname]
    if (req.url.includes('/us2/')) { res.statusCode = 500; return res.end('boom') }
    if (url.pathname.startsWith('/api/v2/gb/')) { res.statusCode = 500; return res.end('boom') }
    if (!handler) { res.statusCode = 404; return res.end('{}') }
    res.setHeader('content-type', 'application/json')
    try { res.end(JSON.stringify(handler(q))) } catch (e) { res.statusCode = e.status || 500; res.end('{}') }
  })
  server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}`, calls }))
})

module.exports = { start }
