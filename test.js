const { getLyrics, searchGenius } = require('genius-lyrics-api')

const options = {
  apiKey: 'OUxb5peEwWM5zImn4nhP3XtaSjSUNIMaX5_8z2azQHMYCuNpsd_-30sfC5M0waD6lVslmkO78xd4ZwBLvM0WTA', // free, just register at genius.com/api-clients
  title: 'Dynasty',
  artist: 'MIIA',
  optimizeQuery: true
}

getLyrics(options).then(lyrics => console.log(lyrics))
