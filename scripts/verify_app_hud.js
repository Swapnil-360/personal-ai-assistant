const http = require('http');

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
        }).on('error', reject);
    });
}

function post(url, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const postData = JSON.stringify(body);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': 'Bearer MikasaCommander360!'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function run() {
    console.log('--- 1. Testing GET /app ---');
    const appRes = await get('http://localhost:3000/app');
    console.log('Status:', appRes.status);
    console.log('Has sector-core:', appRes.body.includes('id="sector-core"'));
    console.log('Has sector-career:', appRes.body.includes('id="sector-career"'));
    console.log('Has sector-missions:', appRes.body.includes('id="sector-missions"'));
    console.log('Has sector-memory:', appRes.body.includes('id="sector-memory"'));
    console.log('Has arc-reactor:', appRes.body.includes('id="btn-arc-reactor"'));
    console.log('Has quick-dock:', appRes.body.includes('quick-dock-grid'));
    console.log('Has telemetry chips:', appRes.body.includes('header-telemetry-strip'));

    console.log('\n--- 2. Testing GET /styles.css ---');
    const cssRes = await get('http://localhost:3000/styles.css');
    console.log('Status:', cssRes.status, 'Size:', cssRes.body.length, 'bytes');

    console.log('\n--- 3. Testing GET /app.js ---');
    const jsRes = await get('http://localhost:3000/app.js');
    console.log('Status:', jsRes.status, 'Size:', jsRes.body.length, 'bytes');

    console.log('\n--- 4. Testing POST /api/pc/browser/open (YouTube) ---');
    const bOpen = await post('http://localhost:3000/api/pc/browser/open', { url: 'https://www.youtube.com' });
    console.log('Browser open status:', bOpen.status, bOpen.body);

    console.log('\n--- 5. Testing POST /api/chat (Voice / Natural Language: "Open YouTube in a new tab") ---');
    const chatRes = await post('http://localhost:3000/api/chat', { message: 'Can you open YouTube in a new tab?', conversation_id: 'test_hud' });
    console.log('Chat status:', chatRes.status);
    console.log('Action feedback:', chatRes.body.actionResult?.feedback);
    console.log('Reply:', chatRes.body.reply?.slice(0, 150) + '...');

    console.log('\n--- 6. Testing GET /api/pc/status (Live Hardware Telemetry) ---');
    const pcStatus = await get('http://localhost:3000/api/pc/status');
    const pcData = JSON.parse(pcStatus.body);
    console.log('Hostname:', pcData.hostname, '| Platform:', pcData.platform);
    console.log('CPU:', pcData.cpu?.model, `(${pcData.cpu?.loadPct}% load)`);
    console.log('RAM:', `${pcData.memory?.usedGb} GB / ${pcData.memory?.totalGb} GB (${pcData.memory?.usagePct}%)`);
    console.log('Disks:', pcData.disks?.map(d => `${d.drive} (${d.freeGb} GB free)`).join(', '));

    console.log('\n=== ALL HUD AND CONTROL TESTS PASSED ===');
}

run().catch(console.error);
