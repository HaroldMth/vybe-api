const crypto = require('crypto');

const keyString = "CwWWHliRCQdmHPVo4WQLkuwitjNQ402e";
const spotifyUrl = "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

function encryptPayload(obj) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyString), iv);
    let encrypted = cipher.update(JSON.stringify(obj), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const btoaEncrypted = encrypted.toString('base64');
    let ivChars = "";
    for (let i=0; i<iv.length; i++) ivChars += String.fromCharCode(iv[i]);
    const combined = btoaEncrypted + ":::" + ivChars;
    return Buffer.from(combined, 'binary').toString('base64');
}

async function sendGatewayRequest(gateway_type, payloadObj) {
    const cipherText = encryptPayload(payloadObj);
    const res = await fetch("https://member.tunefab.com/api/multimedia/gateway", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            cipher_text: cipherText, vendor: "tunefab", target_type: "SY",
            gateway_type: gateway_type, rule_tag: "tf_all_online_v1.0", permission_tag: "smc"
        })
    });
    return await res.json();
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    console.log("1. Requesting download task...");
    const downloadRes = await sendGatewayRequest("music_download", {
        url: [spotifyUrl],
        tag: "smc",
        kbps: "128",
        rule_tag: "tf_all_online_v1.0",
        target_type: "SY"
    });
    console.log("Download Res:", downloadRes);
    
    if (downloadRes.status !== 200 || !downloadRes.data || !downloadRes.data.key) {
        return console.log("Failed to get task key.");
    }
    const taskKey = downloadRes.data.key;
    
    // The frontend also calls createSearchTask / executeSearchTask. 
    // Wait, let's just poll query_result with this key for "music_batch_download"
    console.log("\n2. Polling query_result...");
    for (let i=1; i<=15; i++) {
        const queryRes = await sendGatewayRequest("query_result", {
            key: taskKey,
            type: "music_batch_download",
            tag: "smc",
            rule_tag: "tf_all_online_v1.0",
            target_type: "SY"
        });
        console.log(`[Attempt ${i}] Status:`, queryRes.data?.status, "Finish:", queryRes.data?.finish);
        if (queryRes.data && queryRes.data.finish && queryRes.data.data && queryRes.data.data.download) {
            console.log("\n✅ SUCCESS! Download URL:", queryRes.data.data.download);
            break;
        }
        await sleep(2000);
    }
}

run();
