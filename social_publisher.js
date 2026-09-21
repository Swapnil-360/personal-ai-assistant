const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { addNote, supabaseRequest } = require('./actions_handler');

// Load environment variables if not present in process.env
function getEnv(key) {
    if (process.env[key]) return process.env[key];
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(new RegExp(`^${key}=([^\\r\\n]+)`, 'm'));
            if (match) return match[1].trim();
        }
    } catch (e) {}
    return null;
}

// 1. Humanizer Engine for Developer Posts
function humanizeContent(rawText) {
    if (!rawText) return '';

    let text = rawText
        // Remove standard AI opening cliches
        .replace(/^(?:In today's fast-paced digital world|In the ever-evolving tech landscape|Delve into|Let's dive deep into)[,:]?\s*/im, '')
        // Replace overused buzzwords with authentic human equivalents
        .replace(/\bdelve\b/gi, 'dig')
        .replace(/\bdelving\b/gi, 'digging')
        .replace(/\btestament to\b/gi, 'proof of')
        .replace(/\bspearhead(?:ed|ing)?\b/gi, 'led')
        .replace(/\brevolutionize\b/gi, 'transform')
        .replace(/\bgame-changer\b/gi, 'huge milestone')
        .replace(/\bsupercharge\b/gi, 'speed up')
        .replace(/\bunleash the power of\b/gi, 'use')
        .replace(/\bseamlessly integrate\b/gi, 'connect')
        .replace(/\btapestry\b/gi, 'foundation')
        .replace(/\bpinnacle\b/gi, 'peak')
        .replace(/\bbeacon\b/gi, 'guide')
        // Clean up markdown headers if any crept in
        .replace(/^(?:#{1,6})\s+(.+)$/gm, '$1')
        .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '')
        .trim();

    return text;
}

// 2. Publish to LinkedIn
async function publishToLinkedIn(content, authorUrn = null) {
    const token = getEnv('LINKEDIN_ACCESS_TOKEN');
    const humanized = humanizeContent(content);

    if (!token) {
        // Token not configured yet — save to approved queue & return share helper
        await addNote(`[Approved LinkedIn Post]\n\n${humanized}`, 'approved_social_post');
        const encoded = encodeURIComponent(humanized);
        const webShareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encoded}`;
        return {
            platform: 'linkedin',
            success: true,
            status: 'queued_and_ready',
            has_direct_api: false,
            message: "Post approved & humanized! Saved to your content pipeline.",
            content: humanized,
            share_url: webShareUrl,
            direct_api_note: "To enable 1-click autonomous posting directly from Telegram without opening LinkedIn, add LINKEDIN_ACCESS_TOKEN in .env"
        };
    }

    // Direct Official LinkedIn API v2 ugcPosts
    return new Promise((resolve) => {
        const payload = JSON.stringify({
            author: authorUrn || getEnv('LINKEDIN_PERSON_URN') || 'urn:li:person:self',
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: humanized },
                    shareMediaCategory: 'NONE'
                }
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
        });

        const req = https.request({
            hostname: 'api.linkedin.com',
            path: '/v2/ugcPosts',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    await addNote(`[Published LinkedIn Post]\n\n${humanized}`, 'published_social_post');
                    resolve({
                        platform: 'linkedin',
                        success: true,
                        status: 'published_live',
                        has_direct_api: true,
                        message: "🚀 Live on LinkedIn!",
                        content: humanized,
                        response: data
                    });
                } else {
                    resolve({
                        platform: 'linkedin',
                        success: false,
                        status: 'api_error',
                        error: `LinkedIn API error (${res.statusCode}): ${data}`,
                        content: humanized
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ platform: 'linkedin', success: false, error: err.message, content: humanized });
        });

        req.write(payload);
        req.end();
    });
}

// 3. Publish to X / Twitter
async function publishToTwitter(contentOrTweets) {
    const bearerToken = getEnv('TWITTER_BEARER_TOKEN');
    const apiKey = getEnv('TWITTER_API_KEY');
    const apiSecret = getEnv('TWITTER_API_SECRET');
    const accessToken = getEnv('TWITTER_ACCESS_TOKEN');
    const accessSecret = getEnv('TWITTER_ACCESS_SECRET');

    const hasOAuth = apiKey && apiSecret && accessToken && accessSecret;
    const tweets = Array.isArray(contentOrTweets) 
        ? contentOrTweets.map(humanizeContent) 
        : [humanizeContent(contentOrTweets)];

    const combinedText = tweets.join('\n\n');

    if (!hasOAuth && !bearerToken) {
        // Save to approved queue & return web intent
        await addNote(`[Approved X/Twitter Thread]\n\n${combinedText}`, 'approved_social_post');
        const firstTweetEncoded = encodeURIComponent(tweets[0]);
        const webIntent = `https://twitter.com/intent/tweet?text=${firstTweetEncoded}`;
        return {
            platform: 'twitter',
            success: true,
            status: 'queued_and_ready',
            has_direct_api: false,
            message: "Thread approved & humanized! Saved to your content pipeline.",
            content: combinedText,
            share_url: webIntent,
            direct_api_note: "To enable 1-click autonomous posting directly from Telegram to X, add TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET in .env"
        };
    }

    // Direct Twitter API v2 POST /2/tweets using OAuth 1.0a
    try {
        let lastTweetId = null;
        const results = [];

        for (const tweetText of tweets) {
            const body = { text: tweetText };
            if (lastTweetId) {
                body.reply = { in_reply_to_tweet_id: lastTweetId };
            }

            const res = await sendTwitterV2Tweet(body, { apiKey, apiSecret, accessToken, accessSecret });
            if (res.data && res.data.id) {
                lastTweetId = res.data.id;
                results.push(res.data);
            } else {
                throw new Error(JSON.stringify(res));
            }
        }

        await addNote(`[Published X Thread]\n\n${combinedText}`, 'published_social_post');
        return {
            platform: 'twitter',
            success: true,
            status: 'published_live',
            has_direct_api: true,
            message: `🚀 Live on X! Published ${results.length} tweets in thread.`,
            post_id: lastTweetId,
            url: `https://x.com/i/web/status/${results[0].id}`,
            content: combinedText
        };
    } catch (err) {
        if (err.message && (err.message.includes('credits depleted') || err.message.includes('402'))) {
            await addNote(`[Approved X/Twitter Thread]\n\n${combinedText}`, 'approved_social_post');
            const firstTweetEncoded = encodeURIComponent(tweets[0]);
            const webIntent = `https://twitter.com/intent/tweet?text=${firstTweetEncoded}`;
            return {
                platform: 'twitter',
                success: true,
                status: 'queued_and_ready',
                has_direct_api: false,
                message: "Post approved & humanized! (Note: X requires prepaid credits or free plan activation on developer.x.com to send via API directly). Tap below to publish with 1 click:",
                content: combinedText,
                share_url: webIntent,
                authenticated_user: "@thomascryptoxx"
            };
        }
        return {
            platform: 'twitter',
            success: false,
            status: 'api_error',
            error: err.message,
            content: combinedText
        };
    }
}

// OAuth 1.0a Helper for Twitter v2 API
function sendTwitterV2Tweet(bodyObj, creds) {
    return new Promise((resolve, reject) => {
        const url = 'https://api.twitter.com/2/tweets';
        const method = 'POST';
        const payload = JSON.stringify(bodyObj);

        const oauthParams = {
            oauth_consumer_key: creds.apiKey,
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_token: creds.accessToken,
            oauth_version: '1.0'
        };

        const signatureBase = [
            method,
            encodeURIComponent(url),
            encodeURIComponent(
                Object.keys(oauthParams)
                    .sort()
                    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
                    .join('&')
            )
        ].join('&');

        const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');
        oauthParams.oauth_signature = signature;

        const authHeader = 'OAuth ' + Object.keys(oauthParams)
            .sort()
            .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
            .join(', ');

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// 3b. Fetch Authenticated X / Twitter Profile & Live Metrics
function getTwitterProfile() {
    return new Promise((resolve) => {
        const apiKey = getEnv('TWITTER_API_KEY');
        const apiSecret = getEnv('TWITTER_API_SECRET');
        const accessToken = getEnv('TWITTER_ACCESS_TOKEN');
        const accessSecret = getEnv('TWITTER_ACCESS_SECRET');

        if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
            return resolve({ success: false, error: 'Twitter API credentials not configured in .env' });
        }

        const baseUrl = 'https://api.twitter.com/2/users/me';
        const url = `${baseUrl}?user.fields=description,public_metrics,created_at`;
        const oauthParams = {
            oauth_consumer_key: apiKey,
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_token: accessToken,
            oauth_version: '1.0'
        };

        const allParams = { ...oauthParams, 'user.fields': 'description,public_metrics,created_at' };
        const signatureBase = [
            'GET',
            encodeURIComponent(baseUrl),
            encodeURIComponent(
                Object.keys(allParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&')
            )
        ].join('&');

        const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
        oauthParams.oauth_signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

        const authHeader = 'OAuth ' + Object.keys(oauthParams)
            .sort()
            .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
            .join(', ');

        const req = https.request(url, {
            method: 'GET',
            headers: { 'Authorization': authHeader }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200 && parsed.data) {
                        resolve({ success: true, profile: parsed.data });
                    } else {
                        resolve({ success: false, error: data, statusCode: res.statusCode });
                    }
                } catch (e) {
                    resolve({ success: false, error: data });
                }
            });
        });

        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.end();
    });
}

// 4. Publish to Facebook
async function publishToFacebook(content, pageOrUserId = 'me') {
    const token = getEnv('FACEBOOK_ACCESS_TOKEN');
    const humanized = humanizeContent(content);

    if (!token) {
        await addNote(`[Approved Facebook Post]\n\n${humanized}`, 'approved_social_post');
        const encoded = encodeURIComponent(humanized);
        const webShare = `https://www.facebook.com/sharer/sharer.php?quote=${encoded}&u=https://www.mrswapnil.me`;
        return {
            platform: 'facebook',
            success: true,
            status: 'queued_and_ready',
            has_direct_api: false,
            message: "Facebook post approved & humanized! Saved to your pipeline.",
            content: humanized,
            share_url: webShare,
            direct_api_note: "To enable 1-click autonomous publishing directly to Facebook, add FACEBOOK_ACCESS_TOKEN in .env"
        };
    }

    return new Promise((resolve) => {
        const payload = JSON.stringify({ message: humanized });
        const req = https.request({
            hostname: 'graph.facebook.com',
            path: `/v19.0/${pageOrUserId}/feed`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    await addNote(`[Published Facebook Post]\n\n${humanized}`, 'published_social_post');
                    resolve({
                        platform: 'facebook',
                        success: true,
                        status: 'published_live',
                        has_direct_api: true,
                        message: "🚀 Live on Facebook!",
                        content: humanized,
                        response: data
                    });
                } else {
                    resolve({
                        platform: 'facebook',
                        success: false,
                        status: 'api_error',
                        error: `Facebook API error (${res.statusCode}): ${data}`,
                        content: humanized
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ platform: 'facebook', success: false, error: err.message, content: humanized });
        });

        req.write(payload);
        req.end();
    });
}

// 5. Unified Social Dispatcher
async function publishPost(platform, content) {
    const p = (platform || '').toLowerCase().trim();
    if (p.includes('linkedin')) return await publishToLinkedIn(content);
    if (p.includes('twitter') || p.includes('x')) return await publishToTwitter(content);
    if (p.includes('facebook') || p.includes('fb')) return await publishToFacebook(content);

    return {
        success: false,
        error: `Unknown platform: "${platform}". Supported: linkedin, twitter, facebook`
    };
}

module.exports = {
    humanizeContent,
    publishToLinkedIn,
    publishToTwitter,
    getTwitterProfile,
    publishToFacebook,
    publishPost,
    getEnv
};
