const crypto = require('crypto');

const keyString = "CwWWHliRCQdmHPVo4WQLkuwitjNQ402e";
const spotifyUrl = "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

async function run() {
    const iv = crypto.randomBytes(16);
    
    // In the frontend, the payload is sometimes just the URL string, sometimes an array.
    // In the curl from the user, it was to gateway_type = "query_result".
    // Wait, the user curl used gateway_type="query_result" and the payload was probably something else.
    // Let's try payload as array of strings
    const payloadStr = JSON.stringify([spotifyUrl]);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyString), iv);
    let encrypted = cipher.update(payloadStr, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // JS exact mimic:
    const btoaEncrypted = encrypted.toString('base64');
    let ivChars = "";
    for (let i=0; i<iv.length; i++) {
        ivChars += String.fromCharCode(iv[i]);
    }
    const combined = btoaEncrypted + "::::" + ivChars;
    const cipherText = Buffer.from(combined, 'binary').toString('base64');
    
    // Test with query_result like the user's curl
    const requestBody = {
        cipher_text: cipherText,
        vendor: "tunefab",
        target_type: "SY",
        gateway_type: "query_result", // or "music_batch_download"
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
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        body: JSON.stringify(requestBody)
    });
    
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
}

run();
