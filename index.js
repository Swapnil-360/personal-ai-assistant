const os = require('os');
const https = require('https');

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
