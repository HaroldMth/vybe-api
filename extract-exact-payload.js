const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Inject a fetch interceptor
    await page.evaluateOnNewDocument(() => {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            if (args[0].includes('multimedia/gateway')) {
                console.log('FETCH_INTERCEPT:', args[1].body);
            }
            return originalFetch.apply(this, args);
        };
    });
    
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('FETCH_INTERCEPT:')) {
            console.log("==> CAPTURED PAYLOAD:\n", JSON.stringify(JSON.parse(text.substring(16)), null, 2));
        }
    });

    console.log("Loading tunefab...");
    await page.goto('https://www.tunefab.es/spotify-converter-online/', { waitUntil: 'networkidle2' });
    
    // Simulate user input
    console.log("Simulating input...");
    await page.type('.online-input input', 'https://open.spotify.com/track/0pqnGHJpmpxLKifKRmU6WP');
    await page.click('.online-btn');
    
    console.log("Waiting 15 seconds for analysis and download requests...");
    await new Promise(r => setTimeout(r, 15000));
    
    await browser.close();
}
run();
