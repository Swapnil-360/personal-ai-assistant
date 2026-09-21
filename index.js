// Main Entrypoint for 24/7 Cloud Deployment (Render, Railway, VPS)
// Starts both the Web Command Center and the Telegram Autonomous Bridge

process.env.IS_CLOUD = 'true';
process.env.IS_RENDER_CLOUD = 'true';

console.log('==============================================');
console.log('🚀 Launching Mikasa Autonomous Assistant (Cloud)');
console.log('==============================================');

// 1. Start Telegram Bridge in background
try {
    require('./telegram_bridge.js');
    console.log('✅ Telegram Bridge polling initialized');
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
