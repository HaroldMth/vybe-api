const crypto = require('crypto');
const keyString = "CwWWHliRCQdmHPVo4WQLkuwitjNQ402e";
const spotifyUrl = "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

function encryptPayload(obj) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyString), iv);
    let encrypted = cipher.update(JSON.stringify(obj), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return Buffer.from(encrypted.toString('base64') + ":::" + Array.from(iv).map(b => String.fromCharCode(b)).join(''), 'binary').toString('base64');
}

async function req(gateway, payload) {
    const res = await fetch("https://member.tunefab.com/api/multimedia/gateway", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
            cipher_text: encryptPayload(payload), vendor: "tunefab", target_type: "SY",
            gateway_type: gateway, rule_tag: "tf_all_online_v1.0", permission_tag: "smc"
        })
    });
    return await res.json();
}

async function run() {
    console.log("1. analyseAudio...");
    const analyseRes = await req("music_analyse", {
        url: spotifyUrl, target_type: "SY", tag: "smc", rule_tag: "tf_all_online_v1.0"
    });
    console.log("Analyse:", analyseRes);
    
    if(!analyseRes.data || !analyseRes.data.key) return;
    const analyseKey = analyseRes.data.key;
    
    console.log("\n2. Polling query_result for music_analyse...");
    let trackUrlToDownload = spotifyUrl; // default
    for (let i=0; i<10; i++) {
        const queryRes = await req("query_result", {
            key: analyseKey, type: "music_analyse", tag: "smc", rule_tag: "tf_all_online_v1.0"
        });
        console.log(`Analyse Poll ${i}: status=`, queryRes.data?.status, "finish=", queryRes.data?.finish);
        if (queryRes.data?.finish) {
            console.log("Data:", JSON.stringify(queryRes.data.data, null, 2));
            // Usually returns a list of songs with their canonical URLs
            if (queryRes.data.data && queryRes.data.data[0] && queryRes.data.data[0].url) {
                trackUrlToDownload = queryRes.data.data[0].url;
            }
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("\n3. Requesting music_download with trackUrl =", trackUrlToDownload);
    const downloadRes = await req("music_download", {
        url: [trackUrlToDownload], tag: "smc", kbps: "128", rule_tag: "tf_all_online_v1.0", target_type: "SY"
    });
    console.log("Download:", downloadRes);
    
    if(!downloadRes.data || !downloadRes.data.key) return;
    const downloadKey = downloadRes.data.key;
    
    console.log("\n4. Polling query_result for music_batch_download...");
    for (let i=0; i<20; i++) {
        const queryRes = await req("query_result", {
            key: downloadKey, type: "music_batch_download", tag: "smc", rule_tag: "tf_all_online_v1.0", target_type: "SY" // Wait, target_type is needed for executeSearchTask
        });
        console.log(`Download Poll ${i}: status=`, queryRes.data?.status, "finish=", queryRes.data?.finish);
        if (queryRes.data?.finish && queryRes.data?.data?.download) {
            console.log("\n✅ SUCCESS! Download URL:", queryRes.data.data.download);
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}
run();
