const url = process.argv[2] || "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

const HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    'origin': 'https://spotyloader.com',
    'referer': 'https://spotyloader.com/'
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSpotyloader(spotifyUrl) {
    console.log(`🎵 Testing Spotify URL: ${spotifyUrl}\n`);

    try {
        // 1. Get Info
        console.log("1. Fetching track info...");
        const infoRes = await fetch(`https://spotyloader.com/api/spotify/info?url=${encodeURIComponent(spotifyUrl)}`, { headers: HEADERS });
        if (!infoRes.ok) throw new Error(`Info fetch failed: ${infoRes.status} ${infoRes.statusText}`);
        const info = await infoRes.json();
        console.log(`   Found: ${info.post.name} by ${info.post.artist}\n`);

        // 2. Ping Presence (optional but mimicking your curl)
        console.log("2. Sending presence ping...");
        await fetch('https://spotyloader.com/api/presence', {
            method: 'POST',
            headers: { ...HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ visitorId: "test_visitor_123", event: "ping" })
        });
        console.log("   Ping sent.\n");

        // 3. Queue Download
        console.log("3. Queueing download...");
        const queueRes = await fetch('https://spotyloader.com/api/spotify/track', {
            method: 'POST',
            headers: { ...HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ url: spotifyUrl, format: "m4a" })
        });
        if (!queueRes.ok) throw new Error(`Queue fetch failed: ${queueRes.status} ${queueRes.statusText}`);
        const queueData = await queueRes.json();
        const jobId = queueData.jobId;
        console.log(`   Job ID received: ${jobId}\n`);

        if (!jobId) throw new Error("No Job ID returned!");

        // 4. Poll Status
        console.log("4. Polling status...");
        let downloadLink = null;
        let attempts = 0;
        
        while (attempts < 15) {
            attempts++;
            const statusRes = await fetch(`https://spotyloader.com/api/spotify/track/status/${jobId}`, { headers: HEADERS });
            if (!statusRes.ok) throw new Error(`Status fetch failed: ${statusRes.status}`);
            
            const statusData = await statusRes.json();
            console.log(`   [Attempt ${attempts}] Status: ${statusData.status}`);
            
            if (statusData.status === "ready" && statusData.downloadLink) {
                downloadLink = statusData.downloadLink;
                break;
            }
            
            await sleep(2000); // Wait 2 seconds between polls
        }

        if (downloadLink) {
            console.log(`\n✅ SUCCESS! Download Link: ${downloadLink}`);
        } else {
            console.log("\n❌ TIMEOUT: Could not get download link in time.");
        }

    } catch (e) {
        console.error(`\n❌ ERROR: ${e.message}`);
        console.log("Note: If you get a 403 or Cloudflare error, it means we might need to figure out how to bypass the turnstile/cookies dynamically.");
    }
}

testSpotyloader(url);
