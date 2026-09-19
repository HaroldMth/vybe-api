const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
    console.log("Launching headless browser...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    let turnstileToken = null;

    await page.setRequestInterception(true);
    page.on('request', request => {
        const headers = request.headers();
        if (headers['x-turnstile-token']) {
            turnstileToken = headers['x-turnstile-token'];
        }
        request.continue();
    });

    console.log("Navigating to spotyloader.com to bypass Cloudflare...");
    await page.goto('https://spotyloader.com/', { waitUntil: 'networkidle2' });
    
    console.log("Waiting up to 10 seconds to capture fresh Turnstile token...");
    for(let i=0; i<10; i++) {
        if (turnstileToken) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!turnstileToken) {
        console.log("❌ Failed to capture x-turnstile-token. Cloudflare might be blocking the headless browser.");
        await browser.close();
        return;
    }
    console.log("✅ Captured Fresh Turnstile Token: " + turnstileToken.substring(0, 15) + "...");

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const HEADERS = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cookie': cookieString,
        'origin': 'https://spotyloader.com',
        'referer': 'https://spotyloader.com/',
        'user-agent': await browser.userAgent(),
        'x-turnstile-token': turnstileToken
    };

    const spotifyUrl = "https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP";
    console.log(`\n🎵 Testing Spotyloader API using fresh tokens...`);

    try {
        const queueRes = await fetch('https://spotyloader.com/api/spotify/track', {
            method: 'POST',
            headers: { ...HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ url: spotifyUrl, format: "m4a" })
        });
        
        if (!queueRes.ok) throw new Error(`Queue fetch failed: ${queueRes.status}`);
        const queueData = await queueRes.json();
        const jobId = queueData.jobId;
        console.log(`   Job ID received: ${jobId}`);

        let downloadLink = null;
        for (let attempts = 1; attempts <= 15; attempts++) {
            const statusRes = await fetch(`https://spotyloader.com/api/spotify/track/status/${jobId}`, { headers: HEADERS });
            const statusData = await statusRes.json();
            console.log(`   [Attempt ${attempts}] Status: ${statusData.status}`);
            if (statusData.status === "ready" && statusData.downloadLink) {
                downloadLink = statusData.downloadLink;
                break;
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        if (downloadLink) {
            console.log(`\n✅ SUCCESS! Download Link: ${downloadLink}`);
        } else {
            console.log("\n❌ TIMEOUT");
        }
    } catch (e) {
        console.error(`\n❌ ERROR: ${e.message}`);
    }

    await browser.close();
}

run();
