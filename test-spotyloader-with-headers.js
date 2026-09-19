const url = process.argv[2] || "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";

const HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9,fr;q=0.8,fr-FR;q=0.7',
    'cookie': 'ts_session=v1.1789700716.WnPpwS-SMruvclsXvEOoK1zpHhznuy3IG9SmGPQAZeA; hu8935j4i9fq3hpuj9q39=true; s9ifs0idfjlwfie32dekl=0; sb_main_35491c460aa4c61246eb1a11a170a1e4=1; sb_count_35491c460aa4c61246eb1a11a170a1e4=1; imprCounter_386a013cd8c38820172a5fc11bfb7454_expiry=Fri, 18 Sep 2026 03:06:40 GMT; imprCounter_386a013cd8c38820172a5fc11bfb7454=1; vrk4n8fqhwc3jzy7pbsmgt6dx5lha2u9=01a0b244-1123-7e1e-8e1a-bc25c00a68b1_1; dom3ic8zudi28v8lr6fgphwffqoz0j6c=01a0b244-1123-7e1e-8e1a-bc25c00a68b1; sb_main_8f9e065c0321bfe36b292ebb0872db14=1; sb_count_8f9e065c0321bfe36b292ebb0872db14=1',
    'origin': 'https://spotyloader.com',
    'referer': 'https://spotyloader.com/',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    'x-turnstile-token': '1.p0mPFgtJgCFOWrZCIENAxDq1ThWkAlaP0CVefkrYszJvMPDmvlyFzcMnyyEjzhjGs28VpuSMaGLpQhEZZ7s-Pcu8iyy3KcAxVV4X-iXuBg4NAl76dB4KZmIBeDbVtYFVzMkuEeyxSBURzTdXiSSZDlg1MF5G666Lwe7eN6Rz59CGdQFQ2Q-8WZCXA-Le3XVqDtLyCo3wNVrDqPxBENEYUfDD_44EfRUi_KuMMdnHQ2Ad3W2TozfvVWK0Kx5u9bAt4Hl6bhemKtmfIXbroTYXPzbGLUI6YedPHDIEfWuzx8mmEqIXqNmAtr8UMY8mb9O6qPd5RjIsURzJxyE0eH9TMttz_v-yIg8nVs3eUuwY8D6fv9fWHSS5i8fBg_NWp6A-AIKcphiC0cuf-vt2lBVlMuvSgGmqvf1T9sTS-gMKO8k7g1-UhItTwh9AScazzB1qbFHqrRF9jGCME0ZKgMrjmit3sJI9dIX_xaPU0GJ61IqFP5hLGJK8aV-Qxa7u1MhW2MZ8pCUJKvAHmTYhaeWGvJavxfo39VgXH1zO-7B0sUI3ajlScSd4JzOzNpsVqQrNrP1c10xmi8Gvk3pQyg_VVVCZw9HxwwofoblkavYW46owXhwHfZtUgPD6k4ltTc5_aSrlVNA1oc_46hdg0NlFg5EaYHye9uB-R3SeiQbji00.lg89oHGDTgU3Y6qi9hnWjg.81418253606583971db03f4f6c4ec6eb62e9fb280e6467f09b7372f3c2b6bc46'
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSpotyloader(spotifyUrl) {
    console.log(`🎵 Testing Spotify URL with your headers: ${spotifyUrl}\n`);

    try {
        console.log("1. Fetching track info...");
        const infoRes = await fetch(`https://spotyloader.com/api/spotify/info?url=${encodeURIComponent(spotifyUrl)}`, { headers: HEADERS });
        if (!infoRes.ok) throw new Error(`Info fetch failed: ${infoRes.status} ${infoRes.statusText}`);
        const info = await infoRes.json();
        console.log(`   Found: ${info.post.name} by ${info.post.artist}\n`);

        console.log("2. Sending presence ping...");
        await fetch('https://spotyloader.com/api/presence', {
            method: 'POST',
            headers: { ...HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ visitorId: "3n2udkzoassmu6bffv5", event: "ping" })
        });
        console.log("   Ping sent.\n");

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
            
            await sleep(2000); 
        }

        if (downloadLink) {
            console.log(`\n✅ SUCCESS! Download Link: ${downloadLink}`);
        } else {
            console.log("\n❌ TIMEOUT: Could not get download link in time.");
        }

    } catch (e) {
        console.error(`\n❌ ERROR: ${e.message}`);
    }
}

testSpotyloader(url);
