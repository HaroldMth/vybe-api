const fs = require('fs');

async function rip() {
    console.log("Fetching tunefab.es...");
    const htmlRes = await fetch("https://www.tunefab.es/");
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
            }
        } catch(e) {
            console.log("Failed to fetch", src);
        }
    }
}
rip();
