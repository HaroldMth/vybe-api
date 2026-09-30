const crypto = require('crypto');

const AES_KEY = "CwWWHliRCQdmHPVo4WQLkuwitjNQ402e";
const spotifyUrl = "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

function encryptPayload(payload) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(AES_KEY), iv);
    let encrypted = cipher.update(JSON.stringify(payload), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const btoaEncrypted = encrypted.toString('base64');
    let ivChars = "";
    for (let i = 0; i < iv.length; i++) ivChars += String.fromCharCode(iv[i]);
    
    const combined = btoaEncrypted + ":::" + ivChars;
    return Buffer.from(combined, 'binary').toString('base64');
}

async function tunefabRequest(gatewayType, params, mode = 0) {
    const cipher_text = encryptPayload(params);
    const body = { cipher_text, vendor: "tunefab" };

    if (params.kbps) body.kbps = params.kbps;
    if (params.target_type) body.target_type = params.target_type;

    Object.assign(body, {
        gateway_type: gatewayType,
        rule_tag: params.rule_tag || "tf_all_online_v1.0",
        permission_tag: params.tag || "smc"
    });

    if (mode === 2) {
        body.rules_data = {
            [`incre_value_${body.permission_tag}_music_download`]: params.ids.length
        };
    }

    const res = await fetch("https://member.tunefab.com/api/multimedia/gateway", {
        method: "POST",
        headers: { "content-type": "application/json", "origin": "https://www.tunefab.es" },
        body: JSON.stringify(body)
    });
    return await res.json();
}

async function run() {
    console.log("1. Starting Analysis...");
    const analyseRes = await tunefabRequest("music_analyse", {
        url: spotifyUrl, target_type: "SY", tag: "smc", rule_tag: "tf_all_online_v1.0"
    });
    
    if (!analyseRes.data || !analyseRes.data.key) return console.log("Failed analysis");
    const analyseKey = analyseRes.data.key;

    let trackUrl = spotifyUrl;
    for (let i = 0; i < 10; i++) {
        const q = await tunefabRequest("query_result", {
            key: analyseKey, type: "music_analyse", tag: "smc", rule_tag: "tf_all_online_v1.0"
        });
        if (q.data && q.data.finish) {
            trackUrl = q.data.data.list[0].id;
            console.log(`   Found: ${q.data.data.list[0].name} by ${q.data.data.list[0].artist}`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("\n2. Queueing MP3 Batch Download...");
    const dlRes = await tunefabRequest("music_batch_download", {
        ids: [trackUrl], tag: "smc", kbps: "320", rule_tag: "tf_all_online_v1.0", target_type: "SY"
    }, 2); // Mode 2!

    if (!dlRes.data || !dlRes.data.key) return console.log("Failed download request:", dlRes);
    const dlKey = dlRes.data.key;

    console.log("\n3. Waiting for MP3 conversion to finish...");
    for (let i = 1; i <= 20; i++) {
        const q = await tunefabRequest("query_result", {
            key: dlKey, type: "music_batch_download", tag: "smc", rule_tag: "tf_all_online_v1.0", target_type: "SY"
        });
        
        if (q.data && q.data.finish && q.data.data && q.data.data.download) {
            console.log("\n🎉 SUCCESS! Direct MP3 Link:");
            console.log(q.data.data.download);
            break;
        } else if (q.data && !q.data.finish) {
            process.stdout.write(".");
        } else {
            console.log("\nAPI Error:", q);
            break;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
}
run();
