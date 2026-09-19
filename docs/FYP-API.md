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

## 5b. For You, release radar, tempo lanes, search, health

### `GET|POST /api/fyp`: one call, blended For You feed

```
GET  /api/fyp?tracks=1,2,3&artists=4,5&played=9,8,7&country=za&limit=30
POST /api/fyp   { "tracks": [], "artists": [], "played": [], "country": "za", "limit": 30 }   // better for long lists
```
| Field | Meaning |
|---|---|
| `tracks` | recent plays / likes, **most recent first** (max 6; the first 3 become "because you listened to" seeds) |
| `artists` | followed / most-played artists (max 6): first 2 give radio, first 1 gives "fans also like", all give new releases |
| `played` | IDs to hide (max 300). Seed tracks are hidden automatically |
| `country`, `limit` | same detection as `/api/home`; `limit` 1 to 60, default 30 |

```jsonc
{ "success": true,
  "data": {
    "feed": [ { ...Track, "reason": "Because you listened to Yellow" } ],   // one blended list
    "rows": [                                                              // ready-made shelves
      { "id": "because-3135556", "type": "tracks",  "title": "Because you listened to ..", "seed": {"type":"track","id":".."}, "items": [Track] },
      { "id": "new-releases",     "type": "albums",  "title": "New from artists you follow", "items": [Album] },
      { "id": "artists-like",     "type": "artists", "title": "Fans of X also like", "items": [Artist] },
      { "id": "radio-27",         "type": "tracks",  "title": "X radio", "items": [Track] },
      { "id": "trending",         "type": "tracks",  "title": "Trending in your country", "items": [Track] } ] },
  "meta": { "personalized": true, "seeds": {"tracks": [".."], "artists": [".."]}, "country": "za", "countrySource": "query", "failed": [] } }
```
- **Cold start** (no valid IDs): `personalized: false`, one `trending` row and a trending feed.
- **Blend**: each row's items score `weight x rank position` (because = 1.0 divided by `1 + 0.5 x seed index`, artist radio = 0.45, trending = 0.2); a track suggested by several signals gets +0.25 each time; duplicates collapse; max 3 per artist; `reason` is the strongest signal.
- Rows that time out (9s) are skipped and listed in `meta.failed`. First call for brand-new seeds can take a few seconds (many Deezer lookups); repeats are cached.

### `GET|POST /api/radar`: new releases from followed artists
`GET /api/radar?artists=1,2,3&days=60&limit=30`, newest first, de-duplicated, future dates excluded.
```json
{ "success": true, "data": { "releases": [Album], "checked": 3, "pending": 0, "failed": ["99999"] } }
```
`pending > 0` = ran out of time (8s), call again to continue from cache. `failed` = artist IDs that errored. Max 30 artists, `days` 1 to 365.

### `GET /api/discovery/bpm`: tempo lanes
```
GET /api/discovery/bpm/lanes                         -> chill 60-95, focus 95-115, workout 120-150, running 150-185
GET /api/discovery/bpm?lane=running&limit=20         (or ?min=120&max=150, optional &genre=<deezer genre id>, default 0)
```
```json
{ "success": true, "data": { "lane": {..}, "songs": [ { ...Track, "bpm": 152 } ], "range": {"min":150,"max":185}, "scanned": 58, "pending": 2, "noBpm": 9 } }
```
Deezer only exposes BPM per track (not in lists), so this scans the top 60 of that genre's chart one by one. `noBpm` = tracks Deezer has no tempo for (reported as 0, skipped). `pending > 0` = partial, repeat the call. Deezer BPMs are sometimes half/double time, so treat lanes as a guide.

### Search extras
- `GET /api/search/suggest?q=cold` -> `{ suggestions: [ { type: "artist"|"song"|"album", id, text, subtitle, image } ] }` (max 8; `q` needs 2+ chars; debounce on the client).
- `GET /api/search?q=..` now also returns `top`: `{ type: "artist"|"album"|"song", item }` (exact artist > exact album > exact song title > first song), or `null`.

### `GET /api/health` and `GET /api/health/providers`
`/api/health` = process alive. `/api/health/providers` pings Deezer, Apple, Wikipedia, AudioDB, MusicBrainz and Last.fm (cached 60 s):
```json
{ "success": true, "status": "ok|degraded|down", "checkedAt": "..",
  "providers": [ { "id": "deezer", "role": "..", "status": "up|down|not_configured", "latencyMs": 120, "error": "only when down" } ] }
```
HTTP `200` for ok/degraded, `503` only when Deezer (core) is down, so it works as an uptime-monitor URL.

### Rate limits
Per client IP, per minute, `429` with `Retry-After` and `X-RateLimit-*` headers.
- **General** (all `/api`): 120/min. `/api/stream`, `/api/download`, `/api/health` are exempt.
- **Heavy** (one shared budget of 20/min): `/api/fyp`, `/api/radar`, `/api/recommendations/*`, `/api/song/:id/related`, `/api/discovery/bpm`.
- Caveat: keyed on `req.ip`; with `trust proxy` on, a client can spoof `X-Forwarded-For`. It stops buggy or greedy clients, not a determined attacker.

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

**Easiest: one call to `POST /api/fyp`** (section 5b) with the app's recent plays and followed artists. It returns ready-made rows and a blended feed. Or assemble it yourself, one call per row:

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

*Not implemented server-side (yet)*: stored per-user profiles and skip/like feedback. The app keeps the history and sends it with each `/api/fyp` call.

---

## 8. Config (`.env`)

| Var | Purpose |
|---|---|
| `LASTFM_KEY` | Optional. Enables `lastfm` source (best related-track quality) and tag charts |
| `HOME_SPOTLIGHT` | Comma-separated genre names to spotlight (default `africa,afro`) |
| `NEW_RELEASE_DAYS` | Look-back window for `newReleases` (default 120) |
| `MUSICBRAINZ_USER_AGENT` | Contact string Wikipedia/MusicBrainz ask for |
| `RATE_LIMIT_PER_MIN` | General per-IP limit (default 120) |
| `RATE_LIMIT_HEAVY_PER_MIN` | Shared limit for FYP/radar/recommendations/BPM (default 20) |
