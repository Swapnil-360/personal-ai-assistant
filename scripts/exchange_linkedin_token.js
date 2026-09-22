const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const CLIENT_ID = '86bg60fr6f65mb';
const REDIRECT_URI = 'https://www.linkedin.com/developers/tools/oauth/redirect';

async function exchangeToken(authCode, clientSecret) {
    if (!authCode || !clientSecret) {
        console.error('Error: authCode and clientSecret are required.');
        process.exit(1);
    }

    console.log('[PATHS/LinkedIn] Exchanging authorization code for Access Token...');

    const postData = querystring.stringify({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: clientSecret
    });

    const tokenResponse = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'www.linkedin.com',
            path: '/oauth/v2/accessToken',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`LinkedIn Token Error (${res.statusCode}): ${JSON.stringify(parsed)}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });

    const accessToken = tokenResponse.access_token;
    const expiresIn = tokenResponse.expires_in;
    console.log(`[PATHS/LinkedIn] ✅ Access Token obtained successfully! (Valid for ${Math.round(expiresIn / 86400)} days)`);

    // Fetch user profile info
    console.log('[PATHS/LinkedIn] Fetching LinkedIn user profile & URN...');
    let personUrn = '';
    let userName = '';
    try {
        const userInfo = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.linkedin.com',
                path: '/v2/userinfo',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': 'PATHS-Mikasa/1.0'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve({});
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });

        if (userInfo.sub) {
            personUrn = `urn:li:person:${userInfo.sub}`;
            userName = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim();
            console.log(`[PATHS/LinkedIn] Authenticated as: ${userName} (${personUrn})`);
        }
    } catch (err) {
        console.warn('[PATHS/LinkedIn] Could not fetch userinfo, will proceed without URN:', err.message);
    }

    // Update .env file
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    const updates = {
        'LINKEDIN_CLIENT_ID': CLIENT_ID,
        'LINKEDIN_CLIENT_SECRET': clientSecret,
        'LINKEDIN_ACCESS_TOKEN': accessToken,
    };
    if (personUrn) {
        updates['LINKEDIN_PERSON_URN'] = personUrn;
    }

    for (const [key, val] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${val}`);
        } else {
            envContent += `\n${key}=${val}`;
        }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    console.log('[PATHS/LinkedIn] ✅ .env updated with LINKEDIN_ACCESS_TOKEN, CLIENT_ID, and PERSON_URN!');

    return {
        success: true,
        userName,
        personUrn,
        expiresIn
    };
}

// Support command-line execution
if (require.main === module) {
    const code = process.argv[2];
    const secret = process.argv[3];
    if (!code || !secret) {
        console.log('Usage: node scripts/exchange_linkedin_token.js <AUTH_CODE> <CLIENT_SECRET>');
        process.exit(1);
    }
    exchangeToken(code, secret)
        .then(res => {
            console.log('\n🎉 SUCCESS! LinkedIn Autonomous Operating Integration is fully activated!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Token exchange failed:', err.message);
            process.exit(1);
        });
}

module.exports = { exchangeToken };
