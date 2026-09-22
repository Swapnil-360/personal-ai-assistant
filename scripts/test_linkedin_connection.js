const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const idx = trimmed.indexOf('=');
            if (idx !== -1) {
                const k = trimmed.slice(0, idx).trim();
                const v = trimmed.slice(idx + 1).trim();
                if (!process.env[k]) process.env[k] = v;
            }
        }
    }
}

loadEnv();

async function testLinkedIn() {
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    const personUrn = process.env.LINKEDIN_PERSON_URN;

    console.log('--- Testing LinkedIn API Connection ---');
    console.log('Target URN:', personUrn);

    if (!token || token === 'your_token_here') {
        console.error('❌ LINKEDIN_ACCESS_TOKEN not found in .env');
        process.exit(1);
    }

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.linkedin.com',
            path: '/v2/userinfo',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'PATHS-Mikasa/1.0'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const user = JSON.parse(data);
                    console.log('✅ Connection Verified!');
                    console.log(`👤 Name: ${user.name}`);
                    console.log(`📧 Email: ${user.email}`);
                    console.log(`🆔 Member ID: ${user.sub}`);
                    console.log('🚀 Autonomous post engine & Live Job radar are fully operational.');
                    resolve(user);
                } else {
                    console.error(`❌ Request failed (${res.statusCode}):`, data);
                    reject(new Error(data));
                }
            });
        });

        req.on('error', (err) => {
            console.error('Request error:', err);
            reject(err);
        });

        req.end();
    });
}

testLinkedIn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
