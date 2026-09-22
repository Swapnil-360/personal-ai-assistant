const http = require('http');

function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data
            }));
        });
        req.on('error', reject);
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

async function verify() {
    console.log('--- 1. Testing GET /app Redirect ---');
    const redirectRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/app',
        method: 'GET'
    });
    console.log('Status code:', redirectRes.statusCode);
    console.log('Location header:', redirectRes.headers['location']);
    if (redirectRes.statusCode === 302 && redirectRes.headers['location'] === '/commander') {
        console.log('PASS: /app redirects (302) to /commander');
    } else {
        console.error('FAIL: Expected 302 redirect to /commander');
    }

    console.log('\n--- 2. Testing GET /commander ---');
    const commanderRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/commander',
        method: 'GET'
    });
    console.log('Status code:', commanderRes.statusCode);
    console.log('Content preview:', commanderRes.body.slice(0, 150));
    if (commanderRes.statusCode === 200 && commanderRes.body.includes('Mikasa Command Center')) {
        console.log('PASS: /commander serves Command Center HTML');
    } else {
        console.error('FAIL: Expected 200 OK with app HTML');
    }

    console.log('\n--- 3. Testing POST /api/auth/login with MikasaCommander360! ---');
    const loginPayload = JSON.stringify({ passkey: 'MikasaCommander360!' });
    const loginRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(loginPayload)
        }
    }, loginPayload);
    console.log('Login Status code:', loginRes.statusCode);
    console.log('Login Body:', loginRes.body);
    const loginJson = JSON.parse(loginRes.body);
    if (loginJson.success && loginJson.access_token === 'MikasaCommander360!') {
        console.log('PASS: Master passkey login successful');
    } else {
        console.error('FAIL: Login failed');
    }

    console.log('\n--- 4. Testing GET /api/auth/verify with Commander Token ---');
    const verifyRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/verify',
        method: 'GET',
        headers: {
            'Authorization': 'Bearer MikasaCommander360!'
        }
    });
    console.log('Verify Status code:', verifyRes.statusCode);
    console.log('Verify Body:', verifyRes.body);
    const verifyJson = JSON.parse(verifyRes.body);
    if (verifyJson.isCommander) {
        console.log('PASS: Commander authority verified');
    } else {
        console.error('FAIL: Verify authority failed');
    }

    console.log('\n--- 5. Testing Landing Page Modal Unlock Script ---');
    const landingRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/',
        method: 'GET'
    });
    if (landingRes.body.includes('commanderModal') &&
        landingRes.body.includes('MikasaCommander360!') &&
        landingRes.body.includes('/commander?token=')) {
        console.log('PASS: Landing page includes Commander modal and instant unlock logic');
    } else {
        console.error('FAIL: Landing page missing modal unlock logic');
    }

    console.log('\nALL VERIFICATION CHECKS COMPLETE.');
}

verify().catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
});
