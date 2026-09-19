const fs = require('fs');

async function rip() {
    console.log("Fetching tunefab converter page...");
    const htmlRes = await fetch("https://www.tunefab.es/spotify-converter-online/");
    const html = await htmlRes.text();
    
    // Find all <script src="...">
    const scriptRegex = /<script[^>]+src=['"]([^'"]+)['"]/g;
    let match;
    const scripts = [];
    while ((match = scriptRegex.exec(html)) !== null) {
        let src = match[1];
        if (src.startsWith('//')) src = "https:" + src;
        else if (src.startsWith('/')) src = "https://www.tunefab.es" + src;
        scripts.push(src);
    }
    
    console.log("Found scripts:", scripts.length);
    
    for (const src of scripts) {
        try {
            const res = await fetch(src);
            const text = await res.text();
            
            if (text.includes('cipher_text') || text.includes('gateway_type') || text.includes('crypto')) {
                console.log("\n🔥🔥🔥 FOUND MATCH IN:", src);
                if (text.includes('cipher_text')) {
                   const index = text.indexOf('cipher_text');
                   const start = Math.max(0, index - 500);
                   const end = Math.min(text.length, index + 500);
                   console.log("Snippet:\n", text.substring(start, end));
                   fs.writeFileSync('/home/harold/vybe-api/tunefab-crypto.js', text);
                }
            }
        } catch(e) {
            console.log("Failed to fetch", src);
        }
    }
}
rip();
