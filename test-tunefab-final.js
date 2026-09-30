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

async function req(gateway, payload, is_download = false) {
    const body = {
        cipher_text: encryptPayload(payload), 
        vendor: "tunefab", 
        target_type: "SY",
        gateway_type: gateway, 
        rule_tag: "tf_all_online_v1.0", 
        permission_tag: "smc"
    };
    
    // The missing parameters that caused the 420 error!
    if (payload.kbps) body.kbps = payload.kbps;
    if (is_download) body.is_download = 1;

    const res = await fetch("https://member.tunefab.com/api/multimedia/gateway", {
        method: "POST", 
        headers: { "content-type": "application/json", "origin": "https://www.tunefab.es" },
        body: JSON.stringify(body)
    });
    return await res.json();
}

async function run() {
    console.log("1. Fetching track metadata...");
    const analyseRes = await req("music_analyse", {
        url: spotifyUrl, target_type: "SY", tag: "smc", rule_tag: "tf_all_online_v1.0"
    });
    const analyseKey = analyseRes.data.key;
    
    let trackUrlToDownload = spotifyUrl; 
    for (let i=0; i<5; i++) {
        const queryRes = await req("query_result", {
            key: analyseKey, type: "music_analyse", tag: "smc", rule_tag: "tf_all_online_v1.0"
        });
        if (queryRes.data?.finish) {
            trackUrlToDownload = queryRes.data.data.list[0].id;
            console.log(`   Found: ${queryRes.data.data.list[0].name} by ${queryRes.data.data.list[0].artist}`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("\n2. Requesting MP3 Conversion...");
    const downloadRes = await req("music_download", {
        url: [trackUrlToDownload], tag: "smc", kbps: "128", rule_tag: "tf_all_online_v1.0", target_type: "SY"
    }, true); // <-- Added the true flag to pass is_download: 1
    
    const downloadKey = downloadRes.data.key;
    
    console.log("\n3. Waiting for conversion to finish...");
    for (let i=1; i<=15; i++) {
        const queryRes = await req("query_result", {
            key: downloadKey, type: "music_batch_download", tag: "smc", rule_tag: "tf_all_online_v1.0", target_type: "SY"
        });
        
        if (queryRes.data?.finish && queryRes.data?.data?.download) {
            console.log(`\n🎉 BOOM! Final MP3 Link:`);
            console.log(queryRes.data.data.download);
            break;
        } else if (queryRes.data?.status === '202' || !queryRes.data?.finish) {
            process.stdout.write(".");
        } else {
            console.log("\nError:", queryRes);
            break;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
}
run();
