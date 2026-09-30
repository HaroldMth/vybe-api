const fs = require('fs');

let code = fs.readFileSync('tunefab-api.js', 'utf8');

// Polyfill window and document
const polyfill = `
const window = { msCrypto: require('crypto').webcrypto || {} };
const document = { cookie: "" };
let THE_KEY = "";
`;

// Replace export default class with something that captures the key
code = code.replace(/export default class _0x4a0f6f \{[\s\S]*/, `
console.log("Key is:", _0x3e364a);
`);

// Also need to comment out the async IIFE that uses window.crypto
code = code.replace(/\(async \(\) => \{[\s\S]*?\}\)\(\);/, '');

fs.writeFileSync('tunefab-api-eval.js', polyfill + code);
