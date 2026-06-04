const { SyncLyrics } = require('@stef-0012/synclyrics');

let mxmToken;
const lm = new SyncLyrics({
  sources: ['musixmatch', 'lrclib', 'netease'],
  saveMusixmatchToken: (t) => { mxmToken = t; },
  getMusixmatchToken: () => mxmToken,
});

lm.getLyrics({ track: 'Seven Years', artist: 'Lukas Graham' })
  .then(d => console.log(d.lyrics.lineSynced?.lyrics))
  .catch(console.error);
