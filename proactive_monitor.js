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

// Reliable time and date extraction in Asia/Dhaka (UTC+6) across any host timezone (Windows local, Linux cloud, etc.)
function getDhakaDateAndParts() {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const dateStr = `${map.year}-${map.month}-${map.day}`;
    let hour = parseInt(map.hour, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(map.minute, 10);
    return { dateStr, hour, minute };
}

function resolveChatIds(input) {
    if (!input) return [];
    if (typeof input === 'function') {
        try {
            return resolveChatIds(input());
        } catch (e) {
            return [];
        }
    }
    if (input instanceof Set) {
        return Array.from(input).map(Number).filter(id => !isNaN(id) && id > 0);
    }
    if (Array.isArray(input)) {
        return Array.from(new Set(input.map(Number))).filter(id => !isNaN(id) && id > 0);
    }
    const num = Number(input);
    return (!isNaN(num) && num > 0) ? [num] : [];
}

async function runBatteryCheck(commanderChatIds, sendTelegramMessage, sendTelegramAudioBuffer) {
    const chatIds = resolveChatIds(commanderChatIds);
    if (chatIds.length === 0) return;

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
                console.log(`[Proactive Monitor] ⚠️ Low battery detected: ${percent}% (Discharging). Dispatching alert to ${chatIds.join(', ')}...`);

                const alertText = `⚠️ *Mikasa Hardware Surveillance — Low Battery!* ⚡\n\nSwapnil, your PC (Swapnil-PC) battery is at *${percent}%* and running on battery power. Please plug in the charger so our work and coding sessions stay safe! 🧣`;

                let audioWav = null;
                if (typeof sendTelegramAudioBuffer === 'function') {
                    try {
                        const voiceText = `Commander Swapnil, your PC battery is at ${percent} percent and discharging. Please connect your charger.`;
                        const res = await synthesizeGeminiVoice(voiceText, 'Kore');
                        audioWav = Buffer.isBuffer(res) ? res : res?.wav;
                    } catch (e) {
                        console.warn('[Proactive Monitor] Voice battery alert error:', e.message);
                    }
                }

                for (const chatId of chatIds) {
                    if (typeof sendTelegramMessage === 'function') {
                        await sendTelegramMessage(chatId, alertText);
                    }
                    if (audioWav && typeof sendTelegramAudioBuffer === 'function') {
                        try {
                            await sendTelegramAudioBuffer(chatId, audioWav, 'battery_alert.wav', '🧣 Battery Warning', 'Mikasa Security Alert', 'Mikasa Ackerman');
                        } catch (err) {
                            console.warn(`[Proactive Monitor] Failed sending battery voice to ${chatId}:`, err.message);
                        }
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

async function runMorningBriefing(commanderChatIds, sendTelegramMessage, force = false, claimEvent = null) {
    const chatIds = resolveChatIds(commanderChatIds);
    if (chatIds.length === 0) return;

    const { dateStr, hour, minute } = getDhakaDateAndParts();
    const todayStr = dateStr;

    // Trigger daily between 8:30 AM and 8:45 AM or if explicitly requested (force = true)
    if (force || (hour === 8 && minute >= 30 && minute <= 45 && lastMorningBriefingDate !== todayStr)) {
        if (!force && typeof claimEvent === 'function') {
            const claimed = await claimEvent(`morning_sitrep_${todayStr}`);
            if (!claimed) {
                console.log(`[Proactive Monitor] 🌅 Morning briefing for ${todayStr} already claimed by another active instance. Skipping.`);
                lastMorningBriefingDate = todayStr;
                return;
            }
        }
        if (!force) lastMorningBriefingDate = todayStr;
        console.log(`[Proactive Monitor] 🌅 Triggering ${force ? 'On-Demand' : '8:30 AM'} Morning Sitrep for Commander Swapnil (${chatIds.join(', ')})...`);

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
                "Good morning, Swapnil! ☀️ Hope you had a restful sleep. 🧣",
                "─────────────────────────",
                `🌤️ *Weather in Dhaka:* ${weatherSummary}`,
                "",
                "🎯 *Your Agenda & Active Tasks:*",
                tasksSummary,
                "",
                "⏰ *Scheduled Reminders:*",
                remSummary,
                "",
                gitSummary ? `🐙 *Recent Workstation Activity:*\n${gitSummary}\n` : "",
                "─────────────────────────",
                "_I'm right here beside you. Ready whenever you are to make today great!_ ✨"
            ].filter(Boolean).join('\n');

            for (const chatId of chatIds) {
                if (typeof sendTelegramMessage === 'function') {
                    await sendTelegramMessage(chatId, sitrepLines);
                }
            }
        } catch (err) {
            console.warn('[Proactive Monitor] Morning briefing error:', err.message);
        }
    }
}

async function runLateNightCheck(commanderChatIds, sendTelegramMessage, sendTelegramAudioBuffer, force = false, claimEvent = null) {
    const chatIds = resolveChatIds(commanderChatIds);
    if (chatIds.length === 0) return;

    const { dateStr, hour, minute } = getDhakaDateAndParts();
    const todayStr = dateStr;

    // Trigger at 2:00 AM once per night, or if forced
    if (force || (hour === 2 && minute >= 0 && minute <= 15 && lastLateNightAlertDate !== todayStr)) {
        if (!force && typeof claimEvent === 'function') {
            const claimed = await claimEvent(`late_night_watch_${todayStr}`);
            if (!claimed) {
                console.log(`[Proactive Monitor] 🌙 Late night check for ${todayStr} already claimed by another active instance. Skipping.`);
                lastLateNightAlertDate = todayStr;
                return;
            }
        }
        if (!force) lastLateNightAlertDate = todayStr;
        console.log(`[Proactive Monitor] 🌙 Triggering ${force ? 'On-Demand' : '2:00 AM'} Late Night Rest Alert with over_night.mp3 for: ${chatIds.join(', ')}...`);

        const alertMsg = [
            "Still awake, Swapnil? 🌙",
            "",
            "It's already past 2:00 AM! You worked so hard and built so much today.",
            "Please make sure to wrap up and get some sleep soon so you don't burn out.",
            "",
            "_Don't worry about a thing—I'm staying right here watching over the system while you rest._ 🧣✨"
        ].join('\n');

        const audioPath = path.resolve(__dirname, 'web/audio/over_night.mp3');
        const hasAudio = fs.existsSync(audioPath) && typeof sendTelegramAudioBuffer === 'function';
        let audioBuf = null;
        if (hasAudio) {
            try {
                audioBuf = fs.readFileSync(audioPath);
            } catch (readErr) {
                console.warn('[Proactive Monitor] Could not read over_night.mp3:', readErr.message);
            }
        }

        // Deliver text & audio once to EACH of Commander's Telegram accounts
        for (const chatId of chatIds) {
            if (typeof sendTelegramMessage === 'function') {
                try {
                    await sendTelegramMessage(chatId, alertMsg);
                } catch (msgErr) {
                    console.warn(`[Proactive Monitor] Failed sending late night text to ${chatId}:`, msgErr.message);
                }
            }

            if (audioBuf && typeof sendTelegramAudioBuffer === 'function') {
                try {
                    await sendTelegramAudioBuffer(chatId, audioBuf, 'over_night.mp3', '🌙 Mikasa — Late Night Watch', 'Over Night Protocol', 'Mikasa Ackerman');
                    console.log(`[Proactive Monitor] 🎵 Successfully delivered over_night.mp3 voice note to Commander (${chatId}).`);
                } catch (err) {
                    console.warn(`[Proactive Monitor] Failed sending over_night.mp3 to ${chatId}:`, err.message);
                }
            }
        }
    }
}

function initProactiveMonitor(options = {}) {
    const {
        getCommanderChatId,
        getCommanderChatIds,
        sendTelegramMessage,
        sendTelegramAudioBuffer,
        isLeader,
        claimEvent
    } = options;

    const getTargetChatIds = () => {
        if (typeof getCommanderChatIds === 'function') return resolveChatIds(getCommanderChatIds());
        if (typeof getCommanderChatId === 'function') return resolveChatIds(getCommanderChatId());
        return [7112137739];
    };

    if (monitorInterval) clearInterval(monitorInterval);

    console.log('✅ Proactive Surveillance & Autonomous Monitor initialized');

    // Run periodic checks every 60 seconds
    monitorInterval = setInterval(async () => {
        // Leader check: if Cloud and Local PC is active, Cloud stands down to prevent duplication
        if (typeof isLeader === 'function') {
            try {
                const leader = await isLeader();
                if (!leader) return;
            } catch (e) {}
        }

        const chatIds = getTargetChatIds();
        await runBatteryCheck(chatIds, sendTelegramMessage, sendTelegramAudioBuffer);
        await runMorningBriefing(chatIds, sendTelegramMessage, false, claimEvent);
        await runLateNightCheck(chatIds, sendTelegramMessage, sendTelegramAudioBuffer, false, claimEvent);
    }, 60000);

    // Initial check after 10s
    setTimeout(async () => {
        if (typeof isLeader === 'function') {
            try {
                const leader = await isLeader();
                if (!leader) return;
            } catch (e) {}
        }
        const chatIds = getTargetChatIds();
        await runBatteryCheck(chatIds, sendTelegramMessage, sendTelegramAudioBuffer);
    }, 10000);

    return {
        stop: () => {
            if (monitorInterval) clearInterval(monitorInterval);
        },
        triggerBriefingNow: async (chatId) => {
            const targets = chatId ? resolveChatIds(chatId) : getTargetChatIds();
            await runMorningBriefing(targets, sendTelegramMessage, true);
        },
        triggerLateNightNow: async (chatId) => {
            const targets = chatId ? resolveChatIds(chatId) : getTargetChatIds();
            await runLateNightCheck(targets, sendTelegramMessage, sendTelegramAudioBuffer, true);
        }
    };
}

module.exports = {
    initProactiveMonitor,
    runBatteryCheck,
    runMorningBriefing,
    runLateNightCheck
};
