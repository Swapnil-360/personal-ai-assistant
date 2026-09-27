const fs = require('fs');
const path = require('path');
const { getSystemInfo } = require('./local_pc_bridge');
const { getTasks, fetchGitHubCommits } = require('./actions_handler');
const { getLiveWeather } = require('./weather_service');
const { synthesizeGeminiVoice } = require('./voice_synthesizer');
const remindersManager = require('./reminders_manager');

let monitorInterval = null;
let lastBatteryAlertAt = 0;
let lastMorningBriefingDate = '';
let lastLateNightAlertDate = '';

function getDhakaTime() {
    const now = new Date();
    // Dhaka is UTC+6
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 6));
}

async function runBatteryCheck(commanderChatId, sendTelegramMessage, sendTelegramAudioBuffer) {
    if (!commanderChatId) return;
    try {
        const sys = await getSystemInfo();
        const battery = sys.battery;
        if (!battery || battery.percent === null || battery.percent === undefined) return;

        const percent = Number(battery.percent);
        const isCharging = Boolean(battery.isCharging);
        const now = Date.now();

        // Alert if battery is 20% or less and NOT charging
        if (percent <= 20 && !isCharging) {
            if (now - lastBatteryAlertAt > 45 * 60 * 1000) { // Alert once per 45 min
                lastBatteryAlertAt = now;
                console.log(`[Proactive Monitor] ⚠️ Low battery detected: ${percent}% (Discharging). Dispatching alert...`);

                const alertText = `⚠️ *Mikasa Hardware Surveillance — Low Battery!* ⚡\n\nSwapnil, your PC (Swapnil-PC) battery is at *${percent}%* and running on battery power. Please plug in the charger so our work and coding sessions stay safe! 🧣`;
                if (typeof sendTelegramMessage === 'function') {
                    await sendTelegramMessage(commanderChatId, alertText);
                }

                // Deliver voice warning
                if (typeof sendTelegramAudioBuffer === 'function') {
                    try {
                        const voiceText = `Commander Swapnil, your PC battery is at ${percent} percent and discharging. Please connect your charger.`;
                        const res = await synthesizeGeminiVoice(voiceText, 'Kore');
                        const wav = Buffer.isBuffer(res) ? res : res?.wav;
                        if (wav) {
                            await sendTelegramAudioBuffer(commanderChatId, wav, 'battery_alert.wav', '🧣 Battery Warning', 'Mikasa Security Alert', 'Mikasa Ackerman');
                        }
                    } catch (e) {
                        console.warn('[Proactive Monitor] Voice battery alert error:', e.message);
                    }
                }
            }
        } else if (percent > 30 || isCharging) {
            // Reset throttle if plugged back in
            lastBatteryAlertAt = 0;
        }
    } catch (err) {
        // Silent error for telemetry
    }
}

async function runMorningBriefing(commanderChatId, sendTelegramMessage, force = false) {
    if (!commanderChatId) return;
    const dhakaNow = getDhakaTime();
    const todayStr = dhakaNow.toISOString().slice(0, 10);
    const hour = dhakaNow.getHours();
    const minute = dhakaNow.getMinutes();

    // Trigger daily between 8:30 AM and 8:45 AM or if explicitly requested (force = true)
    if (force || (hour === 8 && minute >= 30 && minute <= 45 && lastMorningBriefingDate !== todayStr)) {
        if (!force) lastMorningBriefingDate = todayStr;
        console.log(`[Proactive Monitor] 🌅 Triggering ${force ? 'On-Demand' : '8:30 AM'} Morning Sitrep for Commander Swapnil...`);

        try {
            // 1. Gather Weather
            let weatherSummary = '28°C, Partly Cloudy in Dhaka';
            try {
                const w = await getLiveWeather('Dhaka');
                if (w) weatherSummary = `${w.temperature_C}°C (${w.condition}, feels like ${w.feelsLike_C}°C)`;
            } catch (e) {}

            // 2. Gather Active Tasks
            let tasksSummary = 'No active tasks found.';
            try {
                const tasks = await getTasks();
                const pending = (tasks || []).filter(t => t.status !== 'completed').slice(0, 4);
                if (pending.length > 0) {
                    tasksSummary = pending.map((t, i) => `${i + 1}. *${t.title}* (${t.projects?.name || 'General'})`).join('\n');
                }
            } catch (e) {}

            // 3. Gather Pending Reminders
            let remSummary = 'None scheduled.';
            try {
                const rems = remindersManager.getPendingReminders();
                if (rems && rems.length > 0) {
                    remSummary = rems.slice(0, 3).map(r => `• "${r.text}" (${r.time})`).join('\n');
                }
            } catch (e) {}

            // 4. Gather Last Git Commit
            let gitSummary = '';
            try {
                const commits = await fetchGitHubCommits('stark-os-portfolio', 'Swapnil-360', 1);
                if (commits && commits.length > 0) {
                    const c = commits[0];
                    const dateStr = c.date ? new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent';
                    gitSummary = `• Last Portfolio Commit: \`${c.sha}\` — _${c.firstLine || c.message}_ (${dateStr})`;
                }
            } catch (e) {}

            const sitrepLines = [
                "🌅 *Good Morning, Commander Swapnil! — Sitrep Briefing* 🧣",
                "─────────────────────────",
                `🌤️ *Weather (Dhaka):* ${weatherSummary}`,
                "",
                "🎯 *High-Priority Engineering Targets:*",
                tasksSummary,
                "",
                "⏰ *Scheduled Reminders:*",
                remSummary,
                "",
                gitSummary ? `🐙 *GitHub Radar:*\n${gitSummary}\n` : "",
                "─────────────────────────",
                "_All systems online and synced. What are we shipping first today, Commander?_ ⚔️"
            ].filter(Boolean).join('\n');

            if (typeof sendTelegramMessage === 'function') {
                await sendTelegramMessage(commanderChatId, sitrepLines);
            }
        } catch (err) {
            console.warn('[Proactive Monitor] Morning briefing error:', err.message);
        }
    }
}

async function runLateNightCheck(commanderChatId, sendTelegramMessage, sendTelegramAudioBuffer, force = false) {
    if (!commanderChatId) return;
    const dhakaNow = getDhakaTime();
    const todayStr = dhakaNow.toISOString().slice(0, 10);
    const hour = dhakaNow.getHours();
    const minute = dhakaNow.getMinutes();

    // Trigger at 2:00 AM once per night, or if forced
    if (force || (hour === 2 && minute >= 0 && minute <= 15 && lastLateNightAlertDate !== todayStr)) {
        if (!force) lastLateNightAlertDate = todayStr;
        console.log(`[Proactive Monitor] 🌙 Triggering ${force ? 'On-Demand' : '2:00 AM'} Late Night Rest Alert with over_night.mp3...`);

        const alertMsg = [
            "🌙 *Mikasa Security Protocol — Late Night Watch* 🧣",
            "",
            "Swapnil, it is past 2:00 AM. You have pushed code and built relentlessly today.",
            "Make sure to save your work and get proper rest so your mind stays sharp tomorrow.",
            "",
            "_I will keep watch over the server and perimeter while you sleep._ ⚔️"
        ].join('\n');

        if (typeof sendTelegramMessage === 'function') {
            await sendTelegramMessage(commanderChatId, alertMsg);
        }

        // Send over_night.mp3 voice/audio note
        const audioPath = path.resolve(__dirname, 'web/audio/over_night.mp3');
        if (fs.existsSync(audioPath) && typeof sendTelegramAudioBuffer === 'function') {
            try {
                const buf = fs.readFileSync(audioPath);
                await sendTelegramAudioBuffer(commanderChatId, buf, 'over_night.mp3', '🌙 Mikasa — Late Night Watch', 'Over Night Protocol', 'Mikasa Ackerman');
                console.log('[Proactive Monitor] 🎵 Successfully delivered over_night.mp3 voice note to Commander.');
            } catch (err) {
                console.warn('[Proactive Monitor] Failed sending over_night.mp3:', err.message);
            }
        }
    }
}

function initProactiveMonitor(options = {}) {
    const {
        getCommanderChatId,
        sendTelegramMessage,
        sendTelegramAudioBuffer
    } = options;

    if (monitorInterval) clearInterval(monitorInterval);

    console.log('✅ Proactive Surveillance & Autonomous Monitor initialized');

    // Run periodic checks every 60 seconds
    monitorInterval = setInterval(async () => {
        const chatId = typeof getCommanderChatId === 'function' ? getCommanderChatId() : (getCommanderChatId || 7112137739);
        await runBatteryCheck(chatId, sendTelegramMessage, sendTelegramAudioBuffer);
        await runMorningBriefing(chatId, sendTelegramMessage);
        await runLateNightCheck(chatId, sendTelegramMessage, sendTelegramAudioBuffer);
    }, 60000);

    // Initial check after 10s
    setTimeout(async () => {
        const chatId = typeof getCommanderChatId === 'function' ? getCommanderChatId() : (getCommanderChatId || 7112137739);
        await runBatteryCheck(chatId, sendTelegramMessage, sendTelegramAudioBuffer);
    }, 10000);

    return {
        stop: () => {
            if (monitorInterval) clearInterval(monitorInterval);
        },
        triggerBriefingNow: async (chatId) => {
            await runMorningBriefing(chatId, sendTelegramMessage, true);
        },
        triggerLateNightNow: async (chatId) => {
            await runLateNightCheck(chatId, sendTelegramMessage, sendTelegramAudioBuffer, true);
        }
    };
}

module.exports = {
    initProactiveMonitor,
    runBatteryCheck,
    runMorningBriefing,
    runLateNightCheck
};
