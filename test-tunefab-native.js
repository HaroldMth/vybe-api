const crypto = require('crypto');

const keyString = "CwWWHliRCQdmHPVo4WQLkuwitjNQ402e";
const spotifyUrl = "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

async function run() {
    // 1. Generate 16 bytes IV
    const iv = crypto.randomBytes(16);
    
    // 2. The payload sent to encrypt is likely just the URL or an object containing the URL.
    // Let's assume it's just the URL string or an array of URLs.
    // Wait, the earlier js code called:
    // yield _.analyseAudio(e, h.target_type, h.permission_tag, h.rule_tag);
    // where e = currentUrl. 
    // Wait, the payload for the gateway might just be the URL. Let's try just the URL string, or an array like [url]
    const payloadObject = [spotifyUrl]; // The downloader function called `_.downloadList([l], ...)`
    const payloadStr = JSON.stringify(payloadObject);
    
    // 3. Encrypt AES-CBC
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyString), iv);
    let encrypted = cipher.update(payloadStr, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // 4. Format cipher_text: btoa( btoa(encrypted) + "::::" + iv_chars )
    // Notice that String.fromCharCode(...iv) in JS just converts byte values to string chars
    const btoaEncrypted = encrypted.toString('base64');
    const ivChars = iv.toString('binary');
    const combined = btoaEncrypted + "::::" + ivChars;
    const cipherText = Buffer.from(combined, 'binary').toString('base64');
    
    const requestBody = {
        cipher_text: cipherText,
        vendor: "tunefab",
        target_type: "SY",
        gateway_type: "music_batch_download", // The snippet said "music_batch_download" for downloadList
        rule_tag: "tf_all_online_v1.0",
        permission_tag: "smc"
    };

    console.log("Sending request to TuneFab...");
    const res = await fetch("https://member.tunefab.com/api/multimedia/gateway", {
        method: "POST",
        headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "origin": "https://www.tunefab.es",
            "referer": "https://www.tunefab.es/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        },
        body: JSON.stringify(requestBody)
    });
    
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
}

run();
