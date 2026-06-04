const { getLyrics } = require('genius-lyrics-api');

const options = {
  apiKey: 'ioD-iOimOlnjnUVmHDTwkHIsAFojNkiDPH9ZJbH8lFZ_6R_Qx9SoGPjXC9pTihuq',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  optimizeQuery: true
};

getLyrics(options).then(lyrics => console.log(lyrics)).catch(err => console.error(err));
