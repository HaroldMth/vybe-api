const fs = require('fs');
let code = fs.readFileSync('tunefab-api.js', 'utf8');
const polyfill = `const window = { msCrypto: require("crypto").webcrypto || {} }; const document = { cookie: "" };`;
code = code.replace(/export default class _0x4a0f6f \{[\s\S]*/, `
console.log("vendor string:", _0x563e("0x52", "r3tU"));
console.log("has kbps?", _0x563e("0x19", "Oky2"));
console.log("kbps again?", _0x563e("0x27", "09ns"));
console.log("kbps assign:", _0x563e("0x3d", "HLf7"));
console.log("target_type prefix:", _0x563e("0x20", "iIaV"));
console.log("target_type assign:", _0x563e("0x10", ")q$@"));
console.log("target_type source:", _0x563e("0xe", "HLf7"));
console.log("is_download assign:", _0x563e("0x30", "r3tU")); // wait, is_download wasn't obfuscated
`);
code = code.replace(/\(async \(\) => \{[\s\S]*?\}\)\(\);/, "");
fs.writeFileSync("tunefab-api-eval3.js", polyfill + code);
