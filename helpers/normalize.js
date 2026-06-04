/**
 * normalize.js
 * Converts Deezer API shapes into the consistent shape the VYBE app expects.
 */

const images = (cover_small, cover_medium, cover_big, cover_xl) => [
  { quality: 'small',  url: cover_small  || '' },
  { quality: 'medium', url: cover_medium || '' },
  { quality: 'large',  url: cover_big    || '' },
  { quality: 'xl',     url: cover_xl     || '' },
]

const track = (t) => ({
  id:           String(t.id),
  name:         t.title || t.title_short || '',
  duration:     t.duration || 0,
  explicit:     !!t.explicit_lyrics,
  chartPosition: t.position ?? null,
  artists: {
    primary: [{ name: t.artist?.name || '' }],
  },
  image: images(
    t.album?.cover_small,
    t.album?.cover_medium,
    t.album?.cover_big,
    t.album?.cover_xl,
  ),
  album: t.album ? {
    id:   String(t.album.id),
    name: t.album.title || '',
  } : undefined,
})

const artist = (a) => ({
  id:       String(a.id),
  name:     a.name || '',
  nbAlbum:  a.nb_album  ?? null,
  nbFan:    a.nb_fan    ?? null,
  radio:    !!a.radio,
  image: images(
    a.picture_small,
    a.picture_medium,
    a.picture_big,
    a.picture_xl,
  ),
})

const album = (al) => ({
  id:          String(al.id),
  name:        al.title || '',
  recordType:  al.record_type || 'album',
  nbTracks:    al.nb_tracks ?? null,
  releaseDate: al.release_date || null,
  explicit:    !!al.explicit_lyrics,
  image: images(
    al.cover_small,
    al.cover_medium,
    al.cover_big,
    al.cover_xl,
  ),
  artists: {
    primary: al.artist ? [{ name: al.artist.name }] : [],
  },
})

const genre = (g) => ({
  id:      g.id,
  name:    g.name || '',
  picture: g.picture_medium || g.picture || '',
  pictureXl: g.picture_xl || g.picture_big || '',
})

const playlist = (p) => ({
  id:          String(p.id),
  name:        p.title || '',
  description: p.description || '',
  nbTracks:    p.nb_tracks ?? null,
  image: images(
    p.picture_small,
    p.picture_medium,
    p.picture_big,
    p.picture_xl,
  ),
})

module.exports = { track, artist, album, genre, playlist }
