const fs = require('fs');
let code = fs.readFileSync('tunefab-api.js', 'utf8');

const polyfill = `
const window = { msCrypto: require('crypto').webcrypto || {} };
const document = { cookie: "" };
let THE_SEP = "";
`;

code = code.replace(/export default class _0x4a0f6f \{[\s\S]*/, `
console.log("Separator is:", _0x563e("0x11", "L&Q8"));
`);

code = code.replace(/\(async \(\) => \{[\s\S]*?\}\)\(\);/, '');

fs.writeFileSync('tunefab-api-sep.js', polyfill + code);
