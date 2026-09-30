#!/usr/bin/env bash
# Vybe backend debug dump — run once: bash vybe_debug.sh
# Pastes everything needed to diagnose the album/artist bugs.
set -uo pipefail

BASE="https://vybe-api27.onrender.com/api"
OUT="vybe_debug_out"
mkdir -p "$OUT"

pp() { # pretty-print json from stdin, jq if available else python3, else raw
  if command -v jq >/dev/null 2>&1; then jq .
  elif command -v python3 >/dev/null 2>&1; then python3 -m json.tool
  else cat
  fi
}

get_field() { # get_field <json_string> <python expr on data['...']>
  python3 -c "
import json,sys
try:
    d = json.loads(sys.argv[1])
    v = d.get('data') or {}
    print(eval(sys.argv[2]))
except Exception as e:
    print('')
" "$1" "$2" 2>/dev/null
}

echo "=== 1. search (finding a prolific artist + album) ==="
SEARCH_JSON=$(curl -s "$BASE/search?q=drake")
echo "$SEARCH_JSON" | pp | tee "$OUT/1_search.json"

ARTIST_ID=$(get_field "$SEARCH_JSON" "d['data']['artists'][0]['id']")
if [ -z "$ARTIST_ID" ]; then
  ARTIST_ID=$(get_field "$SEARCH_JSON" "d['data']['songs'][0]['artists']['primary'][0]['id']")
fi
echo ">>> using ARTIST_ID=$ARTIST_ID"

echo
echo "=== 2. full artist payload ==="
ARTIST_JSON=$(curl -s "$BASE/artist/$ARTIST_ID")
echo "$ARTIST_JSON" | pp | tee "$OUT/2_artist.json"
echo ">>> song count in response:"
get_field "$ARTIST_JSON" "len(d['data']['songs'])" 2>/dev/null || \
  python3 -c "import json;d=json.loads('''$ARTIST_JSON''');print(len(d.get('data',{}).get('songs',[])))" 2>/dev/null

ALBUM_ID=$(get_field "$ARTIST_JSON" "d['data']['albums'][0]['id']")
echo ">>> using ALBUM_ID=$ALBUM_ID"

echo
echo "=== 3. artist with limit/offset params (checking for hidden pagination support) ==="
curl -s "$BASE/artist/$ARTIST_ID?limit=50&offset=20" | pp | tee "$OUT/3_artist_limit_offset.json" > /dev/null
echo "saved to $OUT/3_artist_limit_offset.json"

echo
echo "=== 4. artist with page param ==="
curl -s "$BASE/artist/$ARTIST_ID?page=2" | pp | tee "$OUT/4_artist_page2.json" > /dev/null
echo "saved to $OUT/4_artist_page2.json"

echo
echo "=== 5. full album payload ==="
ALBUM_JSON=$(curl -s "$BASE/album/$ALBUM_ID")
echo "$ALBUM_JSON" | pp | tee "$OUT/5_album.json"

echo
echo "=== 6. quick summary ==="
python3 -c "
import json
try:
    a = json.loads('''$ARTIST_JSON''').get('data') or {}
    print('artist.songs length :', len(a.get('songs', [])))
    print('artist.albums length:', len(a.get('albums', [])))
    print('artist.nbFan        :', a.get('info', {}).get('nbFan') if isinstance(a.get('info'), dict) else a.get('nbFan'))
    print('artist.bio present  :', bool((a.get('info', {}) or {}).get('bio') or a.get('bio')))
except Exception as e:
    print('artist summary failed:', e)
try:
    al = json.loads('''$ALBUM_JSON''').get('data') or {}
    print('album.nbTracks      :', al.get('nbTracks'))
    print('album.songs length  :', len(al.get('songs', [])))
    print('album.totalDuration :', al.get('totalDuration'))
except Exception as e:
    print('album summary failed:', e)
"

echo
echo "=== DONE. Files saved under ./$OUT/ — zip or paste them back. ==="
