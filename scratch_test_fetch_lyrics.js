const { fetchLyrics } = require('./helpers/lyrics');

async function test() {
  console.log('--- Testing fetchLyrics for "blue" by "yung kai" ---');
  const result = await fetchLyrics({
    title: 'blue',
    artist: 'yung kai'
  });
  console.log('Result type:', result.type);
  console.log('Result source:', result.source);
  console.log('Result reason:', result.reason);
  console.log('Result track:', result.track);
  console.log('Result artist:', result.artist);
  console.log('Result lyrics length:', Array.isArray(result.lyrics) ? result.lyrics.length : result.lyrics?.length || 0);
  if (Array.isArray(result.lyrics)) {
    console.log('First line:', result.lyrics[0]);
  }
}

test();
