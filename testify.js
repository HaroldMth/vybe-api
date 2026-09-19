import Spotify from 'searchtify';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const spotify = new Spotify();
const rl = readline.createInterface({ input, output });

async function searchTrack(query) {
  const search = await spotify.search(query, { limit: 1 });
  const track = search.tracksV2.items[0]?.item?.data;

  if (!track) return null;

  const trackId = track.uri.split(':')[2];
  const url = `https://open.spotify.com/track/${trackId}`;
  const artist = track.artists?.items?.[0]?.profile?.name || 'Unknown artist';

  return { name: track.name, artist, uri: track.uri, url };
}

console.log('vybe-api 🎵  — type a song name, or "exit" to quit\n');

while (true) {
  const query = await rl.question('search> ');

  if (!query.trim()) continue;
  if (query.trim().toLowerCase() === 'exit') break;

  try {
    const result = await searchTrack(query);

    if (!result) {
      console.log('No track found.\n');
      continue;
    }

    console.log(`🎶 ${result.name} — ${result.artist}`);
    console.log(`🔗 ${result.url}\n`);
  } catch (err) {
    console.log('Search failed:', err.message, '\n');
  }
}

rl.close();
console.log('bye 👋');
