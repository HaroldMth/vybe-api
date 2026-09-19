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
  previewUrl:   t.preview || null,
  rank:         t.rank ?? null,
  artists: {
    primary: [{
      id: t.artist?.id != null ? String(t.artist.id) : '',
      name: t.artist?.name || '',
    }],
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
    al.cover_small  || al.picture_small,
    al.cover_medium || al.picture_medium,
    al.cover_big    || al.picture_big,
    al.cover_xl     || al.picture_xl,
  ),
  artists: {
    primary: al.artist ? [{
      id: al.artist.id != null ? String(al.artist.id) : '',
      name: al.artist.name || '',
    }] : [],
  },
})

const genre = (g) => ({
  id:      String(g.id),
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
    p.picture_small  || p.cover_small,
    p.picture_medium || p.cover_medium,
    p.picture_big    || p.cover_big,
    p.picture_xl     || p.cover_xl,
  ),
})

const radio = (r) => ({
  id:    String(r.id),
  name:  r.title || r.name || '',
  image: images(r.picture_small, r.picture_medium, r.picture_big, r.picture_xl),
})

// Deezer tags most objects with `type`; use it when a list can mix kinds (e.g. editorial selection).
const auto = (o) => {
  switch (o?.type) {
    case 'album':    return { kind: 'album',    ...album(o) }
    case 'playlist': return { kind: 'playlist', ...playlist(o) }
    case 'artist':   return { kind: 'artist',   ...artist(o) }
    case 'track':    return { kind: 'track',    ...track(o) }
    default:         return { kind: o?.type || 'unknown', ...(o?.cover_medium ? album(o) : playlist(o)) }
  }
}

module.exports = { track, artist, album, genre, playlist, radio, auto }
