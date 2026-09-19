# VYBE API: Feed / Recommendation ("FYP") Docs

Everything here is **stateless**: the server has no user profiles or listening history. It exposes
discovery and similarity endpoints; the app combines them with its own history to build a For You page
(recipe in section 7).

Base URL: `{BASE}` (e.g. `https://your-app.onrender.com`). All routes are `GET`, return JSON.
IDs are Deezer IDs (numeric strings). Sample IDs below: track `3135556`, artist `27`.

Every response: `{ "success": true, "data": ... }` or `{ "success": false, "message": "..." }`.

---

## 1. Home feed

`GET /api/home?country=za`

**No default country.** The country comes from the phone. The app should send its region as `?country=` (or an `X-Country` header). If it doesn't, the server tries, in order: `X-Country` header, `CF-IPCountry` (CDN geo header, if your host adds it), then the region in `Accept-Language` (e.g. `en-ZA`). If none of these gives a country, the country sections are returned empty (`topInCountry.country = null`), nothing is guessed.

| Param | Notes |
|---|---|
| `country` | 2-letter code (device region). Used for the local Apple Music chart. Invalid values are ignored. |

`meta.country` and `meta.countrySource` (`query` / `header` / `geoip` / `accept-language` / `null`) tell you what was used.

**Expo / React Native**
```js
import * as Localization from 'expo-localization'
const region = Localization.getLocales()[0]?.regionCode   // "ZA"
fetch(`${BASE}/api/home${region ? `?country=${region}` : ''}`)
```
(This is the phone's region setting, not GPS, which is what you want for a chart.)

```jsonc
{
  "success": true,
  "data": {
    "trending":       [Track],   // Deezer global chart, 30
    "newReleases":    [Album],   // recent albums from trending artists (see below), max 20
    "playlists":      [Playlist],// Deezer chart playlists, 12
    "artists":        [Artist],  // Deezer chart artists, 15
    "genres":         [Genre],   // all genres except "All"
    "trendingAlbums": [Album],   // Deezer chart albums, 20
    "editorsPicks":   [Album|Playlist], // Deezer editorial; each item has "kind": "album"|"playlist"
    "radios":         [Radio],   // Deezer top radios, 12
    "topInCountry":       { "country": "za", "songs":  [Track] },  // Apple Music chart, matched to Deezer
    "topAlbumsInCountry": { "country": "za", "albums": [Album] },
    "spotlight": [ { "genre": Genre, "songs": [Track], "artists": [Artist] } ] // genres from HOME_SPOTLIGHT
  },
  "meta": {
    "country": "za",
    "countrySource": "query",
    "generatedAt": "2026-09-19T08:00:00.000Z",
    "newReleasesSource": "trending-artists",   // or "chart-albums" when nothing recent was found
    "failed": [ { "section": "topInCountry:za", "error": "..." } ]  // sections that failed/timed out
  }
}
```

**How it behaves**
- Each section is independent. A failing provider empties that section (`[]`) and appears in `meta.failed`; the page still returns 200.
- Sections that failed are re-tried automatically ~20s later (max 2 times), so a second request usually fills them.
- Page cache: 10 min per country (plus one country-less page). If a rebuild fails entirely, the last good page is served for up to 6 h. If nothing has ever succeeded: `500`.
- `newReleases`: albums/EPs/singles released in the last `NEW_RELEASE_DAYS` (120) days by the top 12 trending artists, de-duplicated, newest first.
- `topInCountry`: Apple's most-played chart, each row matched to a real Deezer track. Rows that can't be matched confidently are dropped. `chartPosition` is the Apple rank.
- Server warms the country-less page on boot; each country's page is built on its first request.

---

## 2. Related tracks ("more like this")

```
GET /api/song/:id/related?limit=20
GET /api/recommendations/track/:id?limit=20
GET /api/recommendations/track?id=3135556          (same as above)
GET /api/recommendations/track?artist=Coldplay&track=Yellow&limit=20   (name based, no Deezer ID needed)
```

| Param | Default | Notes |
|---|---|---|
| `limit` | 20 | 1 to 50 |
| `id` / `artist`+`track` | none | one of the two is required (else `400`) |

```jsonc
{
  "success": true,
  "data": {
    "songs": [ { ...Track, "relatedVia": ["radio", "relatedArtists"] } ],
    "seed":  { "id": "3135556", "title": "...", "artistId": "27", "artistName": "...", "albumId": "..." },
    "sources": { "relatedArtists": 24, "radio": 30, "sameArtist": 10, "lastfm": 11 }, // raw candidates per source
    "source": "recommendations"   // name-based & /track/:id routes only: "recommendations" | "fallback" | "empty"
  }
}
```
`source: "fallback"` (name-based route only) means nothing could be resolved and a plain search was returned instead.

### The algorithm

1. **Seed**: from the track ID (`/track/:id`), or by matching `artist + track` to a Deezer track (if that fails, just the artist).
2. **Candidates** (fetched in parallel; any source failing is skipped):

| Source | Weight | What |
|---|---|---|
| `lastfm` | 1.0 | Last.fm "similar tracks" (12 hydrated to Deezer tracks). **Only if `LASTFM_KEY` is set.** |
| `relatedArtists` | 0.8 | Top 4 tracks from each of the first 6 Deezer "related artists" |
| `radio` | 0.7 | Deezer artist radio (30) |
| `sameArtist` | 0.4 | Seed artist's top 10 |

3. **Score**: sum of source weights. A track found by several sources gets **+0.25 per extra source** (agreement is the strongest signal).
4. **Filters**: drops the seed itself (by ID and by artist+title), duplicates (same artist + title ignoring "(feat. ...)", "- Remastered", etc.), and variants (karaoke, instrumental, tribute, cover, 8D, sped up, slowed, nightcore, reverb, lullaby, "made famous by"...) unless the seed is itself one.
5. **Diversity cap**: max **3 tracks per artist**, and max **2 from the seed artist**.
6. Sort by score, take `limit`.

**Matching external names to Deezer tracks** (used for Last.fm and Apple rows): strict Deezer search (`artist:"" track:""`), then loose search. A candidate needs the artist to match (token-subset, so "Burna Boy" matches "Burna Boy & Ed Sheeran") and title similarity >= 0.7 after stripping decorations; variants get a -0.4 penalty; final score must be >= 0.6. No confident match = no result (accuracy over recall). Cached 24 h.

---

## 3. Related artists

```
GET /api/recommendations/artist/:id?limit=12
GET /api/recommendations/artist?artist=Name&limit=12
```
```json
{ "success": true, "data": { "artists": [ { "id": "..", "name": "..", "image": [..], "relatedVia": "deezer" } ] } }
```
Order: Last.fm similar artists first (only with `LASTFM_KEY`, resolved to Deezer artists by exact name), then Deezer related artists. De-duplicated, seed artist excluded. `relatedVia`: `"lastfm"` | `"deezer"`.

---

## 4. Tag / mood

`GET /api/recommendations/tag/:tag?limit=20` (e.g. `chill`, `afrobeats`, `workout`)

```json
{ "success": true, "data": { "tag": "chill", "songs": [Track], "source": "lastfm" } }
```
`source` is `"lastfm"` (tag chart, needs key) or `"deezer-playlists"` (tracks from the top 3 Deezer playlists matching the tag, de-duplicated).

---

## 5. Other feed inputs

| Route | Returns |
|---|---|
| `GET /api/artist/:id` | `data.info` (bio, genres, images, links), `songs` (top 20), `albums` (newest first, max 24), `discography {albums, eps, singles}`, `related` (<= 12 artists, same logic as section 3), `radio` (20 tracks) |
| `GET /api/song/:id` | Track + `isrc`, `bpm`, `releaseDate`, `contributors`, `genres`, `label`, `album{...}`, `tags`, `stats` |
| `GET /api/charts?id=0` | `songs`, `albums`, `artists`, `playlists` for a genre ID (`0` = global) |
| `GET /api/charts/genre/:id` | `genre`, `songs` (<= 30, from genre radios), `artists` |
| `GET /api/genre` , `GET /api/genre/:id` | genre list / one genre with `artists` and `songs` (first radio, <= 20) |
| `GET /api/discovery` | 5 lanes `{id, title, query, songs}`: fresh, throwback, hidden, chill, workout. **These are plain Deezer keyword searches** (e.g. "chill vibes"), so quality is basic. |

---

## 6. Data shapes

```jsonc
// Track
{ "id": "3135556", "name": "..", "duration": 224, "explicit": false, "chartPosition": null,
  "previewUrl": "https://...mp3",   // 30s preview
  "rank": 912345,                   // Deezer popularity
  "artists": { "primary": [ { "id": "27", "name": ".." } ] },
  "image": [ { "quality": "small|medium|large|xl", "url": ".." } ],
  "album": { "id": "..", "name": ".." } }
// Album:    { id, name, recordType, nbTracks, releaseDate, explicit, image[], artists.primary[] }
// Artist:   { id, name, nbAlbum, nbFan, radio, image[] }
// Playlist: { id, name, description, nbTracks, image[] }
// Genre:    { id, name, picture, pictureXl }     Radio: { id, name, image[] }
```

**Errors**: `400` bad/missing params (IDs must be numeric) · `404` not found upstream · `429` Deezer quota exceeded after retries · `500` anything else.

**Caching / limits (server side)**: Deezer calls are cached (charts/editorial/radio 15 min, search 30 min, playlists/genres 1 h, artist/album/track 6 h; stale copies served for 12 h if Deezer errors), limited to 5 concurrent and ~9 req/s, and retried on quota errors. Wikipedia/AudioDB/MusicBrainz lookups are cached 7 days, Apple charts 3 h. All users share the server's Deezer quota, so repeated seeds are cheap but a burst of *new* seeds is not.

---

## 7. Building a For You page in the app (recommended recipe)

The API doesn't know the user, so the app supplies the seeds. Suggested rows, each one call:

| Row | Call |
|---|---|
| "Because you listened to *X*" | `/api/song/{lastPlayedTrackId}/related` (repeat for 2 or 3 recent seeds) |
| "More like *Artist*" | `/api/recommendations/artist/{topArtistId}` |
| "*Artist* radio" | `data.radio` from `/api/artist/{id}` |
| "New from artists you follow" | `data.albums[0..2]` from `/api/artist/{id}` (already newest first) |
| "Trending in your country" | `data.topInCountry.songs` from `/api/home?country=<phone region>` |
| "Vibe: chill" | `/api/recommendations/tag/chill` |

Client-side blending tips:
- Weight seeds by recency and by likes/completed plays; use 3 or 4 seeds max per refresh (keeps you inside the Deezer quota).
- Interleave rows rather than concatenating, drop anything already played, and re-apply a per-artist cap (3) across the whole page.
- Fall back to `home.trending` for brand-new users with no history.

*Not implemented server-side (yet)*: per-user profiles, skip/like feedback, and a single `/api/fyp` endpoint that does this blending for you.

---

## 8. Config (`.env`)

| Var | Purpose |
|---|---|
| `LASTFM_KEY` | Optional. Enables `lastfm` source (best related-track quality) and tag charts |
| `HOME_SPOTLIGHT` | Comma-separated genre names to spotlight (default `africa,afro`) |
| `NEW_RELEASE_DAYS` | Look-back window for `newReleases` (default 120) |
| `MUSICBRAINZ_USER_AGENT` | Contact string Wikipedia/MusicBrainz ask for |
