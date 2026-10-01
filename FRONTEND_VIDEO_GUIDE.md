# Vybe Video Streaming — Frontend Integration Guide

This guide details how the frontend (Android Kotlin / Jetpack Compose) connects with the backend's video streaming pipeline.

---

## 1. Overview & Architecture

YouTube videos cannot be fetched directly from client devices because raw upstream CDN links (`googlevideo.com`) are IP-bound, trigger `403 Forbidden` errors, or lack byte-range seeking headers.

To resolve this, the backend implements a resilient multi-tier pipeline:
1. **SaveTube + Hector Worker Resolution**: Resolves direct 360p MP4 streams via SaveTube with instant Hector Cloudflare Worker stream fallback.
2. **David Cyril Fallback**: Used if SaveTube/Hector are unreachable.
3. **Backend Proxy (`/api/videos/play/:id`)**:
   - Streams the MP4 directly through the Vybe server.
   - Forwards client `Range` requests (`HTTP 206 Partial Content`).
   - Enables fast seeking and smooth scrubbing in Android `VideoView` / `ExoPlayer`.
   - Prevents client IP blocks and header restrictions.

---

## 2. API Endpoints

### Endpoint A: Get Video Stream Metadata

```http
GET /api/videos/stream
```

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `url` | string | YouTube URL, video ID, or search query (e.g. song title) |
| `title` | string (optional) | Song title (used for fuzzy matching) |
| `artist` | string (optional) | Artist name (used for fuzzy matching) |
| `duration` | number (optional) | Expected track duration in seconds |

**Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "url": "http://192.168.0.142:4000/api/videos/play/60ItHLz5WEA",
    "download_url": "http://192.168.0.142:4000/api/videos/play/60ItHLz5WEA",
    "title": "Faded",
    "thumbnail": "https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg",
    "quality": "360p",
    "format": "mp4",
    "type": "video",
    "creator": "SaveTube / Hector",
    "source": "vybe-proxy",
    "youtubeUrl": "https://www.youtube.com/watch?v=60ItHLz5WEA",
    "videoId": "60ItHLz5WEA",
    "durationSec": 213
  }
}
```

---

### Endpoint B: Streaming Proxy Route

```http
GET /api/videos/play/:id
```

- Returns binary MP4 data stream (`video/mp4`).
- Supports `Range: bytes=start-end` returning `206 Partial Content`.
- The URL provided in `data.url` by `GET /api/videos/stream` points directly here.

---

## 3. Frontend Implementation Steps (Android / Kotlin)

### Step 1: Update API Client (`VybeApiClient.kt`)

```kotlin
suspend fun getVideoStream(
    input: String,
    title: String,
    artist: String? = null,
    durationSec: Long = 0L
): VideoStreamData? = withContext(Dispatchers.IO) {
    try {
        val urlBuilder = "$baseUrl/videos/stream".toHttpUrl().newBuilder()
            .addQueryParameter("url", input)
            .addQueryParameter("title", title)
        
        if (!artist.isNullOrBlank()) {
            urlBuilder.addQueryParameter("artist", artist)
        }
        if (durationSec > 0) {
            urlBuilder.addQueryParameter("duration", durationSec.toString())
        }

        val request = Request.Builder().url(urlBuilder.build()).get().build()
        val response = httpClient.newCall(request).execute()
        
        if (response.isSuccessful) {
            val body = response.body?.string() ?: return@withContext null
            val json = JSONObject(body)
            if (json.optBoolean("success")) {
                val data = json.getJSONObject("data")
                return@withContext VideoStreamData(
                    url = data.getString("url"),
                    title = data.optString("title"),
                    thumbnail = data.optString("thumbnail"),
                    quality = data.optString("quality", "360p"),
                    videoId = data.optString("videoId")
                )
            }
        }
    } catch (e: Exception) {
        Log.e("VybeApi", "Failed to fetch video stream", e)
    }
    null
}
```

---

### Step 2: Now Playing Video Toggle (`AppBar.kt`)

When toggling to Video Mode:
1. **Pause audio playback** immediately.
2. Reset audio position if needed.
3. Switch UI state to show the video player in the cover area.

```kotlin
IconButton(
    onClick = {
        val enableVideo = !showVideoMode
        showVideoMode = enableVideo
        
        if (enableVideo) {
            // 1. Immediately pause audio playback
            symphony.radio.pause()
            
            // 2. Fetch video stream if not already cached
            scope.launch {
                isLoadingVideo = true
                val stream = apiClient.getVideoStream(
                    input = currentSong.title,
                    title = currentSong.title,
                    artist = currentSong.artist,
                    durationSec = currentSong.duration / 1000
                )
                videoStreamData = stream
                isLoadingVideo = false
            }
        } else {
            // When exiting video mode, resume audio if desired
            symphony.radio.play()
        }
    }
) {
    Icon(
        imageVector = Icons.Filled.Movie,
        contentDescription = "Toggle Video Mode",
        tint = if (showVideoMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    )
}
```

---

### Step 3: Video Player Composable (`BodyCover.kt`)

Use `AndroidView` wrapping `android.widget.VideoView` or `ExoPlayer`:

```kotlin
@Composable
fun VideoPlayerView(
    videoUrl: String,
    modifier: Modifier = Modifier
) {
    AndroidView(
        factory = { ctx ->
            android.widget.VideoView(ctx).apply {
                val mediaController = android.widget.MediaController(ctx)
                mediaController.setAnchorView(this)
                setMediaController(mediaController)

                setOnPreparedListener { mp ->
                    mp.isLooping = true
                    start()
                }

                setOnErrorListener { _, what, extra ->
                    Log.e("VideoPlayer", "Playback error: what=$what extra=$extra")
                    true
                }

                setVideoURI(android.net.Uri.parse(videoUrl))
            }
        },
        update = { view ->
            view.setVideoURI(android.net.Uri.parse(videoUrl))
            view.start()
        },
        modifier = modifier.fillMaxSize()
    )
}
```

---

### Step 4: Video Search Integration (`Search.kt`)

Ensure video searches display under both the "All" and "Videos" tabs:
- Query: `GET /api/videos/search?q={query}&limit=20`
- Display items with thumbnails, channel names, and durations.
- Tapping a video item navigates to `NowPlaying` with `showVideoMode = true` and `videoData.url` loaded directly.

---

## 4. Key Notes & Testing Checklist

- [x] **Network Security Config**: Ensure `android:usesCleartextTraffic="true"` is set in `AndroidManifest.xml` if using `http://192.168.0.x:4000` for local development.
- [x] **Seeking / Scrubbing**: The proxy supports HTTP Range requests (`206 Partial Content`), allowing scrubbing forward and backward without restarting playback.
- [x] **Audio / Video Exclusivity**: Toggling Video Mode pauses audio player so both do not play simultaneously.
