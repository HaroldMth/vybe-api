const crypto = require('crypto');

const keyString = "CwWWHliRCQdmHPVo4WQLkuwitjNQ402e";
const spotifyUrl = "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

async function run() {
    const iv = crypto.randomBytes(16);
    
    // The gateway_type we want to hit is 'music_batch_download' (which takes an array) or 'query_result'.
    // In the user's curl it was gateway_type: query_result.
    // Let's pass the URL as string for query_result, or an array for music_batch_download.
    // Let's try what the curl sent: "target_type":"SY","gateway_type":"query_result"
    // The payload for query_result was likely just the URL string
    let payloadStr = JSON.stringify(spotifyUrl);
    
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyString), iv);
    let encrypted = cipher.update(payloadStr, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    let btoaEncrypted = encrypted.toString('base64');
    let ivChars = "";
    for (let i=0; i<iv.length; i++) ivChars += String.fromCharCode(iv[i]);
    
    let combined = btoaEncrypted + ":::" + ivChars;
    let cipherText = Buffer.from(combined, 'binary').toString('base64');
    
    console.log("Sending query_result...");
    let res = await fetch("https://member.tunefab.com/api/multimedia/gateway", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            cipher_text: cipherText, vendor: "tunefab", target_type: "SY",
            gateway_type: "query_result", rule_tag: "tf_all_online_v1.0", permission_tag: "smc"
        })
    });
    console.log("query_result Response:", await res.json());

    // Try music_batch_download
    payloadStr = JSON.stringify([spotifyUrl]);
    cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyString), iv);
    encrypted = cipher.update(payloadStr, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    btoaEncrypted = encrypted.toString('base64');
    combined = btoaEncrypted + ":::" + ivChars;
    cipherText = Buffer.from(combined, 'binary').toString('base64');

    console.log("Sending music_batch_download...");
    res = await fetch("https://member.tunefab.com/api/multimedia/gateway", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            cipher_text: cipherText, vendor: "tunefab", target_type: "SY",
            gateway_type: "music_batch_download", rule_tag: "tf_all_online_v1.0", permission_tag: "smc"
        })
    });
    console.log("music_batch_download Response:", await res.json());
}

run();
