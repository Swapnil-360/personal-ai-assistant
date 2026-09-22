const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// Load .env variables into process.env if present
try {
    const envPath = path.join(__dirname, '.env');
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
} catch (e) {}

// Detect environment: Local PC vs 24/7 Cloud (Render, Railway, VPS)
const isLocalPC = os.hostname() === 'Swapnil-PC' && !process.env.FORCE_CLOUD;

if (isLocalPC) {
    delete process.env.IS_CLOUD;
    delete process.env.IS_RENDER_CLOUD;
    console.log('==============================================');
    console.log('💻 Launching Mikasa Autonomous Assistant (Local PC Mode: Swapnil-PC)');
    console.log('==============================================');
} else {
    process.env.IS_CLOUD = 'true';
    process.env.IS_RENDER_CLOUD = 'true';
    console.log('==============================================');
    console.log('☁️ Launching Mikasa Autonomous Assistant (24/7 Cloud Mode: Render)');
    console.log('==============================================');

    // Render Free Tier Sleep Prevention (pings /api/status every 10 minutes to stay awake 24/7)
    const keepAliveUrl = 'https://mikasa-assistant.onrender.com/api/status';
    setInterval(() => {
        https.get(keepAliveUrl, (res) => {
            console.log(`[Cloud KeepAlive] Ping to ${keepAliveUrl} -> ${res.statusCode}`);
        }).on('error', (err) => {
            console.warn('[Cloud KeepAlive Warning]:', err.message);
        });
    }, 10 * 60 * 1000);
}

// 1. Start Telegram Bridge in background
try {
    const bridge = require('./telegram_bridge.js');
    if (bridge && typeof bridge.startPolling === 'function') {
        bridge.startPolling();
        console.log('✅ Telegram Bridge initialized & long polling started');
    } else {
        console.log('✅ Telegram Bridge initialized');
    }
} catch (err) {
    console.error('❌ Failed to start Telegram Bridge:', err);
}

// 2. Start Web Server
try {
    require('./web/server.js');
    console.log('✅ Web Command Center initialized');
} catch (err) {
    console.error('❌ Failed to start Web Server:', err);
}
