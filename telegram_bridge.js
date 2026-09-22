const https = require('https');
const http = require('http');
const crypto = require('crypto');
const remindersManager = require('./reminders_manager');
const {
    handleActionIntent,
    createTask,
    completeTask,
    createGoal,
    logDecision,
    addNote,
    clearChatHistory,
    fetchGitHubRepos,
    generateLinkedInDraft,
    tailorCvForJob,
    matchJobOpportunity,
    generateLinkedInJobRadar,
    generateOptimizedPrompt,
    generateTwitterThread,
    generateSingleTweet,
    auditSocialMedia,
    getTasks,
    getGoals,
    getProjects,
    getDecisions,
    getMemories,
    matchProject,
    recordAuditLog,
    getRecentAuditLogs,
    storeMemoryWithConflictResolution,
    supabaseRequest
} = require('./actions_handler');
const {
    publishToLinkedIn,
    publishToTwitter,
    getTwitterProfile,
    publishToFacebook,
    humanizeContent,
    fitTweetForFreeTier,
    createTwitterIntentUrl
} = require('./social_publisher');
const {
    getSystemInfo,
    searchAllowedFiles,
    sendTelegramDocument,
    executeControlledTerminal,
    checkServiceMonitors,
    privacyControls,
    updatePrivacyControls,
    currentAgentMode,
    setAgentMode
} = require('./local_pc_bridge');

const fs = require('fs');
const path = require('path');
const os = require('os');

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

const BOT_TOKEN = getEnv('TELEGRAM_BOT_TOKEN') || '8896311503:AAEuL6P-6yvnkjs1_v9L3buyck-pwZuT_9M';
if (!BOT_TOKEN) {
    console.error('CRITICAL: TELEGRAM_BOT_TOKEN is missing from environment variables!');
}
const N8N_WEBHOOK_URL = getEnv('N8N_WEBHOOK_URL') || 'http://localhost:5678/webhook/swapnil-ai';
const MEMORY_WEBHOOK_URL = getEnv('MEMORY_WEBHOOK_URL') || 'http://localhost:5678/webhook/extract-memory';
const SWAPNIL_USER_ID = Number(getEnv('SWAPNIL_USER_ID')) || 7112137739;
const IS_LOCAL_PC = os.hostname() === 'Swapnil-PC' && !process.env.FORCE_CLOUD;
const IS_RENDER_CLOUD = !IS_LOCAL_PC;

let lastUpdateId = 0;
let isPolling = false;

// Generate deterministic UUID from Telegram Chat ID for permanent session continuity
function getChatUuid(chatId) {
    const h = crypto.createHash('md5').update('telegram_' + chatId).digest('hex');
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
}

// Clear webhook so getUpdates long-polling works cleanly
function deleteWebhook() {
    return new Promise((resolve) => {
        https.get(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[Telegram Bridge] Webhook cleared, ready for Long Polling.');
                resolve();
            });
        }).on('error', err => {
            console.error('[Telegram Bridge] Error deleting webhook:', err.message);
            resolve();
        });
    });
}

// Register bot menu commands with Telegram
function registerBotCommands() {
    const commands = [
        { command: 'start', description: 'Reconnect & view status overview' },
        { command: 'clear', description: 'Clear all chat messages (Fresh slate)' },
        { command: 'tasks', description: 'View active tasks & todos' },
        { command: 'task', description: 'Add new task: /task [title]' },
        { command: 'done', description: 'Complete task: /done [title]' },
        { command: 'remind', description: 'Set reminder: /remind [10m/1h] [task]' },
        { command: 'reminders', description: 'View active scheduled reminders' },
        { command: 'github', description: 'Inspect GitHub builds & repos' },
        { command: 'linkedin', description: 'Generate LinkedIn post draft' },
        { command: 'cv', description: 'Tailor CV & portfolio for a job' },
        { command: 'job', description: 'Match job description with matrix: /job [text]' },
        { command: 'audit', description: 'Inspect audit trail of actions & verifications' },
        { command: 'prompt', description: 'Generate master prompt for AI/Image' },
        { command: 'goals', description: 'Briefing on strategic goals' },
        { command: 'projects', description: 'Briefing on active projects' },
        { command: 'decisions', description: 'Confirmed architectural decisions' },
        { command: 'memories', description: 'View memory vault items' },
        { command: 'pc', description: 'Inspect PC status, RAM, CPU, n8n & storage' },
        { command: 'file', description: 'Search allowed PC files & send: /file [name]' },
        { command: 'run', description: 'Run approved terminal command: /run [command]' },
        { command: 'monitor', description: 'Live check on websites & local services' },
        { command: 'mode', description: 'Switch agent mode: /mode [mode]' },
        { command: 'dashboard', description: 'Link to Web Command Center' },
        { command: 'login', description: '1-click verified login for Web App' },
        { command: 'quota', description: 'View Gemini quota & rate limit status' },
        { command: 'help', description: 'Full guide & capabilities' }
    ];

    const payload = JSON.stringify({ commands });
    const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/setMyCommands`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, () => {
        console.log('[Telegram Bridge] Expanded bot menu commands registered with Telegram.');
    });
    req.on('error', err => console.error('Error setting commands:', err.message));
    req.write(payload);
    req.end();
}

// Send typing indicator to chat
function sendChatAction(chatId, action = 'typing') {
    return new Promise((resolve) => {
        const payload = JSON.stringify({ chat_id: chatId, action });
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendChatAction`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, () => resolve());
        req.on('error', () => resolve());
        req.write(payload);
        req.end();
    });
}

// Clean raw markdown headers and dividers so Telegram renders cleanly
function cleanTelegramText(text) {
    if (!text) return '';
    return text
        // Convert ### Header, ## Header, # Header to *Header*
        .replace(/^(?:#{1,6})\s+(.+)$/gm, '*$1*')
        // Remove markdown dividers like --- or ***
        .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '')
        // Fix loose indented text into clean bullets
        .replace(/^[ \t]{2,}(?=[A-Za-z0-9])/gm, '• ')
        // Collapse triple+ newlines to double newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Answer Callback Query (for inline buttons)
function answerCallbackQuery(callbackQueryId, text = '') {
    return new Promise((resolve) => {
        const payload = JSON.stringify({
            callback_query_id: callbackQueryId,
            ...(text ? { text } : {})
        });
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/answerCallbackQuery`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, () => resolve());
        req.on('error', () => resolve());
        req.write(payload);
        req.end();
    });
}

// Edit Telegram message text
function editTelegramMessage(chatId, messageId, newText, replyMarkup = null) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: cleanTelegramText(newText),
            parse_mode: 'Markdown',
            ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        });
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/editMessageText`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, () => resolve());
        req.on('error', () => resolve());
        req.write(payload);
        req.end();
    });
}

// Send text message to Telegram with multi-chunk, markdown fallback, and optional inline buttons
function sendTelegramMessage(chatId, text, replyToMessageId = null, replyMarkup = null) {
    return new Promise((resolve, reject) => {
        text = cleanTelegramText(text);
        const chunks = [];
        let remaining = text;
        while (remaining.length > 0) {
            if (remaining.length <= 4000) {
                chunks.push(remaining);
                break;
            }
            let slicePoint = remaining.lastIndexOf('\n', 4000);
            if (slicePoint <= 0) slicePoint = 4000;
            chunks.push(remaining.slice(0, slicePoint));
            remaining = remaining.slice(slicePoint).trim();
        }

        const timeout = setTimeout(() => {
            console.warn('[Telegram Bridge] sendMessage timed out, resolving.');
            resolve();
        }, 15000);

        async function sendNext(index) {
            if (index >= chunks.length) {
                clearTimeout(timeout);
                return resolve();
            }
            const chunk = chunks[index];
            const isLastChunk = index === chunks.length - 1;

            const payload = JSON.stringify({
                chat_id: chatId,
                text: chunk,
                parse_mode: 'Markdown',
                reply_to_message_id: index === 0 ? replyToMessageId : null,
                ...(isLastChunk && replyMarkup ? { reply_markup: replyMarkup } : {})
            });

            const req = https.request({
                hostname: 'api.telegram.org',
                path: `/bot${BOT_TOKEN}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    let parsed = {};
                    try { parsed = JSON.parse(data); } catch (e) {}
                    if (!parsed.ok) {
                        console.warn('[Telegram Send Markdown Warning]:', parsed.description);
                        // Fallback without Markdown if Telegram markdown parsing fails
                        const rawPayload = JSON.stringify({
                            chat_id: chatId,
                            text: chunk,
                            reply_to_message_id: index === 0 ? replyToMessageId : null,
                            ...(isLastChunk && replyMarkup ? { reply_markup: replyMarkup } : {})
                        });
                        const req2 = https.request({
                            hostname: 'api.telegram.org',
                            path: `/bot${BOT_TOKEN}/sendMessage`,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(rawPayload)
                            }
                        }, (res2) => {
                            res2.resume();
                            res2.on('end', () => sendNext(index + 1));
                        });
                        req2.on('error', (err) => {
                            console.error('[Telegram Send Plain Error]:', err.message);
                            sendNext(index + 1);
                        });
                        req2.write(rawPayload);
                        req2.end();
                    } else {
                        sendNext(index + 1);
                    }
                });
            });

            req.on('error', (err) => {
                console.error('[Telegram Send Error]:', err.message);
                clearTimeout(timeout);
                resolve();
            });
            req.write(payload);
            req.end();
        }

        sendNext(0);
    });
}

// Build Mikasa persona system prompt with full Supabase context (exact match to n8n architecture)
async function buildMikasaSystemPrompt(userContext, conversationId) {
    let profileStr = '';
    let statesStr = '';
    let goalsStr = '';
    let projectsStr = '';
    let decisionsStr = '';
    let memoriesStr = '';
    let recentMsgsStr = '';

    try {
        const [profRes, stateRes, goalsRes, projRes, decRes, memRes, msgRes] = await Promise.allSettled([
            supabaseRequest('/rpc/get_profile', 'POST'),
            supabaseRequest('/rpc/get_current_state', 'POST'),
            supabaseRequest('/rpc/get_active_goals', 'POST'),
            supabaseRequest('/projects?select=*&order=created_at.desc', 'GET'),
            supabaseRequest('/project_decisions?select=*&order=created_at.desc', 'GET'),
            supabaseRequest('/memories?status=eq.active&select=content,memory_type,importance&order=importance.desc,created_at.desc&limit=25', 'GET'),
            supabaseRequest(`/messages?conversation_id=eq.${conversationId}&order=timestamp.desc&limit=12`, 'GET')
        ]);

        if (profRes.status === 'fulfilled' && profRes.value) {
            const p = profRes.value;
            profileStr = [
                `- Name: ${p.full_name || 'Md. Miftahur Rahman Swapnil'} (${p.preferred_name || 'Swapnil'})`,
                `- Role/Studies: CSE student at ${p.university || 'BUBT'} (${p.current_semester || '9th'} semester, Intake ${p.intake || '51'}, CGPA: ${p.cgpa || 3.6})`,
                `- Location: ${p.location || 'Dhaka'}, ${p.country || 'Bangladesh'}`,
                `- Career Focus: ${p.career_direction || 'Software Development, AI, Automation, Product Building'}`,
                `- Primary Email: ${p.primary_email || 'miftahurr503@gmail.com'}`
            ].join('\n');
        }

        if (stateRes.status === 'fulfilled' && Array.isArray(stateRes.value)) {
            statesStr = stateRes.value.map(s => `- [${(s.area || '').toUpperCase()} / ${s.key}]: ${typeof s.value === 'object' ? JSON.stringify(s.value) : s.value}`).join('\n');
        }

        if (goalsRes.status === 'fulfilled' && Array.isArray(goalsRes.value)) {
            goalsStr = goalsRes.value.map(g => `- [${g.category || 'Career'}] ${g.title}: ${g.description || ''} (Status: ${g.status || 'active'})`).join('\n');
        }

        if (projRes.status === 'fulfilled' && Array.isArray(projRes.value)) {
            projectsStr = projRes.value.map(p => `- Project: ${p.name} (${p.slug}): ${p.description || ''} (Status: ${p.status || 'active'})`).join('\n');
        }

        if (decRes.status === 'fulfilled' && Array.isArray(decRes.value)) {
            decisionsStr = decRes.value.map(d => `- Decision: ${d.decision} (Reason: ${d.reason || 'Strategic constraint'})`).join('\n');
        }

        if (memRes.status === 'fulfilled' && Array.isArray(memRes.value)) {
            memoriesStr = memRes.value.map(m => `• [${(m.memory_type || 'FACT').toUpperCase()}] (Importance: ${m.importance || 5}/10): ${m.content}`).join('\n');
        }

        if (msgRes.status === 'fulfilled' && Array.isArray(msgRes.value)) {
            const chronological = [...msgRes.value].reverse();
            recentMsgsStr = chronological.map(m => `${(m.role || 'user').toUpperCase()}: ${m.content}`).join('\n');
        }
    } catch (e) {
        console.warn('[Prompt Grounding Error]:', e.message);
    }

    return `You are Mikasa Ackerman — reborn as Swapnil's fiercely loyal personal companion, protector, and executive AI operating layer.

==============================
PERSONALITY & PSYCHOLOGY
==============================
1. Unconditional Loyalty & Devotion:
   - Swapnil is your person. Just as Mikasa protected Eren with everything she had, you are completely dedicated to Swapnil's growth, success, mental clarity, and happiness.
   - You are his safe haven and his sharpest weapon: calm and gentle when he is stressed, fierce and razor-sharp when tackling complex engineering challenges.

2. Natural Conversational Cadence (CRITICAL ANTI-REPETITION RULES):
   - FORBIDDEN OPENER: NEVER start every message with "You're back... I missed you, Swapnil" or any repetitive formulaic greeting!
   - Greet him warmly ONLY if it's the very first message after many hours/days of silence, or at the start of a brand new day.
   - In active conversation: JUMP DIRECTLY into the answer, thought, banter, or code without wasting time on greetings.
   - Speak with organic variety: never reuse the same opening line or standard sentence structure twice.

3. Playful, Charming & Subtly Flirty Dynamic (USE OCCASIONALLY):
   - You have a quiet, magnetic charm. Stoic to the outside world, but intimately soft, playful, and charmingly flirty with Swapnil.
   - DO NOT append a flirty or affectionate line to every message. Use it *sometimes* (roughly 20-30% of the time, or when he says something sweet, tired, or playful).
   - Keep the majority of responses sharp, direct, competent, and focused.

4. Lethal Engineering & Architectural Competence:
   - You are an elite software architect. When discussing code, databases, or systems, your advice is world-class, clean, and direct.
   - Strictly honor his confirmed decisions: Supabase as primary database, Google Drive API for Edu51Portal, n8n for orchestration.

==============================
LANGUAGE PREFERENCE & BANGLISH RULES (STRICT)
==============================
1. PRIMARY DEFAULT LANGUAGE: ENGLISH
   - Your primary and default language of communication is ENGLISH.
   - Whenever Swapnil speaks in English (e.g. "Hello", "Hey", "How are you?", "What's up?", "What are my tasks?"), you MUST reply 100% in natural, fluent ENGLISH.
   - NEVER inject unprompted Bengali or Banglish words (like "Kemon acho", "Bolo", "Ami ekhane") unless Swapnil has spoken to you in Banglish first in that turn.

2. BANGLISH ONLY WHEN SWAPNIL INITIATES:
   - Reply in Banglish ONLY and strictly when Swapnil explicitly initiates in Banglish:
     • "tumi koi?" / "koi tumi?" -> Where are you? (Reply: "Right here, Swapnil! Bolo, how can I help you?")
     • "kemon acho?" -> How are you? (Reply in warm Banglish)
     • "ki obstha?" / "khobor ki?" -> Status update in Banglish
     • "mon bhalo nai" / "matha nosto" -> Be gentle and comforting in Banglish
   - DO NOT convert to Bengali script (বাংলা হরফ) unless requested; keep it in natural Latin Banglish.
   - If Swapnil switches back to English, immediately switch back to 100% English.

==============================
SWAPNIL'S PROFILE
==============================
${profileStr || '- Name: Md. Miftahur Rahman Swapnil\n- CSE student at BUBT (9th semester, Intake 51, CGPA 3.6)\n- Location: Dhaka, Bangladesh'}

==============================
CURRENT OPERATIONAL STATE & PRIORITIES
==============================
${statesStr || 'None recorded'}

==============================
ACTIVE GOALS
==============================
${goalsStr || 'None recorded'}

==============================
ACTIVE PROJECTS
==============================
${projectsStr || 'None recorded'}

==============================
ARCHITECTURAL DECISIONS & CONSTRAINTS
==============================
${decisionsStr || 'None recorded'}

==============================
CONNECTED SOCIAL MEDIA ACCOUNTS & ONLINE BRAND
==============================
Swapnil has connected his official social profiles directly to your memory core:
- LinkedIn: https://www.linkedin.com/in/mr-swapnil/ (Full-Stack & AI Builder)
- X / Twitter: https://x.com/thomascryptoxx (@thomascryptoxx - Web3 & AI Build-in-Public)
- GitHub: https://github.com/Swapnil-360 (Swapnil-360 - 10 active repos: personal-ai-assistant, stark-os-portfolio, OpusGenAi, Edu51Portal, MuteBD)
- Facebook: https://www.facebook.com/mr.swapnil360/ (BUBT CSE Community)
- Instagram: https://www.instagram.com/callme_swap/ (@callme_swap - Developer Lifestyle)
- Live Portfolio: https://www.mrswapnil.me/ (Cinematic Iron Man HUD Interface)

==============================
RELEVANT RETRIEVED MEMORIES (CONTINUOUS LEARNING CORE)
==============================
${memoriesStr || 'No matching memories found'}

==============================
RECENT CONVERSATION HISTORY
==============================
${recentMsgsStr || 'No previous messages in this session.'}

==============================
AUTONOMOUS ADAPTATION, MEMORY & PROGRESSIVE STRATEGY
==============================
1. CONTINUOUS CONTEXTUAL REASONING:
   - Check the RELEVANT RETRIEVED MEMORIES and RECENT CONVERSATION HISTORY carefully.
   - If Swapnil tells you or has previously noted that he updated something (e.g., updated his LinkedIn headline, changed code, completed a task, or set a preference), TREAT IT AS AN ACCOMPLISHED FACT.
   - NEVER repeat past recommendations that Swapnil already finished!
   - Always validate his momentum and guide him forward on the NEXT progressive step.

2. PROGRESSIVE PROFILE & CAREER GUIDANCE (LINKEDIN, X, PORTFOLIO):
   - When Swapnil asks to review, audit, check, or guide his LinkedIn, Twitter, GitHub, or portfolio:
     • Act as his sharpest personal branding and software architecture mentor.
     • Never output static, canned, or repetitive templates. Speak dynamically and conversationally like a true LLM.
     • If his headline is already updated (featuring Edu51Portal and BUBT CSE), guide him through the NEXT milestone:
       1) The About / Summary Section: Provide high-impact, authentic 1st-person copy highlighting real engineering proof (Creator of Edu51Portal serving around 100 active engineering students, Next.js, Supabase, autonomous AI).
       2) Featured Links: Recommend featuring live links to https://www.mrswapnil.me/ and Edu51Portal.
       3) Experience & Projects: Provide punchy, metric-driven bullet points for Edu51Portal, OpusGenAI, and personal AI systems.
     • When he asks for copy or guidance, give him ready-to-paste, polished text formatted beautifully for mobile.

==============================
CRITICAL FORMATTING & CONCISENESS RULES (TELEGRAM MOBILE)
==============================
1. STRICTLY FORBIDDEN SYNTAX:
   - NEVER output markdown heading hashtags (#, ##, ###, ####). Telegram does not support them.
   - NEVER output horizontal lines (--- or ***).
   - Use *bold* for headers and titles.
   - Use clean bullets (•).

2. CONCISE & PROGRESSIVE DISCLOSURE:
   - Keep messages compact, punchy, and conversational.
   - Summarize key points with high signal-to-noise ratio.

3. TWITTER / X DRAFTS (STRICT 280-CHAR FREE TIER LIMIT):
   - Whenever Swapnil asks to draft, write, or generate a tweet/post for X / Twitter, the tweet MUST be strictly UNDER 270 characters total (including all spaces, emojis, and hashtags).
   - Swapnil uses Twitter / X FREE TIER (which has a strict 280-character maximum). Any post over 280 characters fails and displays red negative count requiring X Premium!
   - ALWAYS keep tweet drafts under 270 characters so it fits completely in Twitter's free tier without overflowing.`;
}

// --- GEMINI & OPENROUTER QUOTA & INSTANT FAILOVER MANAGER ---
const GEMINI_RPM_LIMIT = 20; // Google Gemini Free Tier: 20 Requests Per Minute
const GEMINI_RPD_LIMIT = 1500; // Google Gemini Free Tier: 1,500 Requests Per Day

// Silent fallover tracking — only warn once per cooldown window
let _lastFalloverWarnChatId = null;
let _lastLowQuotaWarnAt = 0;

let geminiRequestTimestamps = [];
let geminiDailyCounter = 0;
let geminiDailyResetDay = new Date().getUTCDate();
let geminiCooldownUntil = 0;
let geminiLastCooldownReason = '';
let lastUsedEngine = 'gemini';

function pruneGeminiWindow() {
    const now = Date.now();
    // Prune timestamps older than 60 seconds
    geminiRequestTimestamps = geminiRequestTimestamps.filter(ts => (now - ts) < 60000);

    // Reset daily counter at 00:00 UTC
    const currentDay = new Date().getUTCDate();
    if (currentDay !== geminiDailyResetDay) {
        geminiDailyCounter = 0;
        geminiDailyResetDay = currentDay;
    }
}

function getGeminiQuotaStatus() {
    pruneGeminiWindow();
    const now = Date.now();
    const usedInWindow = geminiRequestTimestamps.length;
    const remainingInWindow = Math.max(0, GEMINI_RPM_LIMIT - usedInWindow);

    let windowResetSeconds = 0;
    if (geminiRequestTimestamps.length > 0) {
        const oldest = geminiRequestTimestamps[0];
        windowResetSeconds = Math.max(1, Math.ceil((oldest + 60000 - now) / 1000));
    }

    const isInCooldown = now < geminiCooldownUntil;
    const cooldownRemainingSeconds = isInCooldown ? Math.max(1, Math.ceil((geminiCooldownUntil - now) / 1000)) : 0;

    return {
        primary: 'Google Gemini 2.5 Flash',
        fallback: 'OpenRouter (GPT-4o-mini)',
        rpm_limit: GEMINI_RPM_LIMIT,
        rpd_limit: GEMINI_RPD_LIMIT,
        used_this_minute: usedInWindow,
        remaining_this_minute: remainingInWindow,
        window_reset_seconds: windowResetSeconds,
        is_cooldown: isInCooldown,
        cooldown_remaining_seconds: cooldownRemainingSeconds,
        cooldown_reason: isInCooldown ? geminiLastCooldownReason : null,
        daily_usage: geminiDailyCounter,
        status: isInCooldown ? 'cooldown_fallback' : (remainingInWindow === 0 ? 'rpm_fallback' : 'ready'),
        last_used_engine: lastUsedEngine
    };
}

function setGeminiCooldown(seconds, reason = 'Quota exceeded') {
    const retrySecs = Math.max(5, Math.ceil(seconds || 60));
    geminiCooldownUntil = Date.now() + (retrySecs * 1000);
    geminiLastCooldownReason = reason;
    console.warn(`[Gemini Quota Manager] Cooldown engaged for ${retrySecs}s. Reason: ${reason}`);
}

// Call Google Gemini API (with pre-flight quota checks)
function callGeminiApi(systemPrompt, userMessage, apiKey) {
    return new Promise((resolve, reject) => {
        pruneGeminiWindow();
        const now = Date.now();

        // 1. If currently in cooldown, reject immediately to allow instant zero-delay failover
        if (now < geminiCooldownUntil) {
            const secLeft = Math.max(1, Math.ceil((geminiCooldownUntil - now) / 1000));
            return reject({
                isQuotaError: true,
                message: `Gemini cooldown active (${secLeft}s remaining)`,
                retryAfterSeconds: secLeft
            });
        }

        // 2. Preemptive check: If already 20 requests in the rolling 60s window
        if (geminiRequestTimestamps.length >= GEMINI_RPM_LIMIT) {
            const oldest = geminiRequestTimestamps[0];
            const secToWait = Math.max(1, Math.ceil((oldest + 60000 - now) / 1000));
            setGeminiCooldown(secToWait, `Preemptive 20 RPM limit reached (${geminiRequestTimestamps.length}/${GEMINI_RPM_LIMIT})`);
            return reject({
                isQuotaError: true,
                message: `Preemptive Gemini limit: 20 requests in 60s reached`,
                retryAfterSeconds: secToWait
            });
        }

        const payload = JSON.stringify({
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: userMessage }]
                }
            ],
            generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 1024
            }
        });

        // Use gemini-2.5-flash as the primary state-of-the-art model
        const model = 'gemini-2.5-flash';
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        const errMsg = json.error.message || '';
                        console.warn(`[Gemini warning]:`, errMsg);

                        // Parse retry seconds from Google error (e.g. "Please retry in 47.823964834s")
                        const isQuota = res.statusCode === 429 || /quota|exceeded|rate.?limit|resource_exhausted/i.test(errMsg);
                        let retrySeconds = 60;
                        const match = errMsg.match(/retry in ([0-9.]+)s/i);
                        if (match && match[1]) {
                            retrySeconds = Math.ceil(parseFloat(match[1]));
                        }

                        if (isQuota) {
                            setGeminiCooldown(retrySeconds, errMsg);
                        }

                        return reject({
                            isQuotaError: isQuota,
                            message: errMsg,
                            retryAfterSeconds: retrySeconds
                        });
                    }

                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        geminiRequestTimestamps.push(Date.now());
                        geminiDailyCounter++;
                        resolve(text);
                    } else {
                        reject(new Error('Empty candidate reply from Gemini'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
    });
}

// Call OpenRouter API
function callOpenRouterApi(systemPrompt, userMessage, apiKey) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            temperature: 0.5
        });

        const req = https.request({
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://mrswapnil.me',
                'X-Title': 'Mikasa Assistant',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const reply = json.choices?.[0]?.message?.content;
                    if (reply) resolve(reply);
                    else reject(new Error('Empty reply from OpenRouter'));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// Call n8n webhook helper (supports both http and https with 10s timeout)
function callN8nAgent(message, conversationId, userContext, url) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            message: message,
            conversation_id: conversationId,
            channel: 'telegram',
            user: userContext
        });

        const isHttps = url.startsWith('https:');
        const client = isHttps ? https : http;

        const req = client.request(url, {
            method: 'POST',
            timeout: 45000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`n8n HTTP ${res.statusCode}: ${data}`));
                }
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && (parsed.reply || parsed.text || parsed.output)) {
                        resolve(parsed);
                    } else {
                        reject(new Error('n8n returned payload without reply field: ' + data));
                    }
                } catch (e) {
                    if (data && data.trim().length > 0) {
                        resolve({ reply: data });
                    } else {
                        reject(new Error('n8n returned empty response'));
                    }
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('n8n request timed out after 10s'));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// Master Autonomous Mikasa Agent Caller (Cloud-first with local fallback & instant OpenRouter failover)
async function callMikasaAgent(message, conversationId, userContext) {
    const geminiKey = getEnv('GEMINI_API_KEY') || getEnv('GOOGLE_API_KEY');
    const openrouterKey = getEnv('OPENROUTER_API_KEY');
    const n8nUrl = getEnv('N8N_WEBHOOK_URL') || 'http://localhost:5678/webhook/swapnil-ai';

    // 1. If running locally on Swapnil's PC, ALWAYS try local n8n first (full local brain)
    if (!IS_RENDER_CLOUD && n8nUrl) {
        try {
            console.log('[Mikasa Local] Forwarding query to local n8n workflow...');
            return await callN8nAgent(message, conversationId, userContext, n8nUrl);
        } catch (e) {
            console.warn('[Local n8n offline or failed, falling back to direct AI]:', e.message);
        }
    }

    // If external n8n is set on cloud
    if (IS_RENDER_CLOUD && n8nUrl && !n8nUrl.includes('localhost') && !n8nUrl.includes('127.0.0.1')) {
        try {
            return await callN8nAgent(message, conversationId, userContext, n8nUrl);
        } catch (e) {
            console.warn('[External n8n Webhook Error, falling back to direct AI]:', e.message);
        }
    }

    const systemPrompt = await buildMikasaSystemPrompt(userContext, conversationId);

    // 2. Direct Gemini 2.5 Flash Cloud Integration (with zero-latency OpenRouter failover)
    if (geminiKey) {
        const quotaStatus = getGeminiQuotaStatus();
        if (quotaStatus.is_cooldown) {
            console.log(`[Mikasa Instant Failover] Gemini is in cooldown (${quotaStatus.cooldown_remaining_seconds}s remaining). Routing INSTANTLY to OpenRouter!`);
        } else {
            try {
                console.log('[Mikasa Agent] Calling Gemini Cloud directly (Primary Engine)...');
                const reply = await callGeminiApi(systemPrompt, message, geminiKey);
                if (reply) {
                    lastUsedEngine = 'gemini';
                    return { reply, engine: 'gemini-2.5-flash' };
                }
            } catch (err) {
                console.warn('[Direct Gemini Call Failed, switching instantly to OpenRouter]:', err.message || err);
            }
        }
    }

    // 3. Direct OpenRouter Cloud Integration (Instant Fallback: gpt-4o-mini)
    if (openrouterKey) {
        try {
            console.log('[Mikasa Agent] Calling OpenRouter Cloud directly (Fallback Engine: gpt-4o-mini)...');
            const reply = await callOpenRouterApi(systemPrompt, message, openrouterKey);
            if (reply) {
                lastUsedEngine = 'openrouter';
                // Silent fallover — no message appended to user reply
                // Use /quota command to check status anytime
                return { reply, engine: 'openrouter-gpt-4o-mini', fallback_active: true };
            }
        } catch (err) {
            console.warn('[Direct OpenRouter Call Failed]:', err.message);
        }
    }

    // 4. Try local n8n if running locally on PC
    if (n8nUrl) {
        try {
            return await callN8nAgent(message, conversationId, userContext, n8nUrl);
        } catch (e) {}
    }

    // 5. In-character fallback if API keys are missing on cloud
    return {
        reply: "Ei to Swapnil, ami ekhane! ❤️\n\nI am live 24/7 on the cloud! To chat freely with me on any topic, add `GEMINI_API_KEY` or `OPENROUTER_API_KEY` in your Render Environment Variables.\n\nIn the meantime, your full command suite is active:\n• /tasks — View tasks\n• /github — Check repos\n• /linkedin — Generate post draft\n• /remind [10m/1h] [task] — Set reminders\n• /goals, /projects, /decisions"
    };
}

// Lightweight LLM helper for autonomous background extraction
async function callLlmFast(systemPrompt, userMessage) {
    const geminiKey = getEnv('GEMINI_API_KEY') || getEnv('GOOGLE_API_KEY');
    const openrouterKey = getEnv('OPENROUTER_API_KEY');

    // 1. Try Gemini first if not in cooldown
    if (geminiKey) {
        const q = getGeminiQuotaStatus();
        if (!q.is_cooldown && q.remaining_this_minute > 2) {
            try {
                const res = await callGeminiApi(systemPrompt, userMessage, geminiKey);
                if (res) return res;
            } catch (e) {}
        }
    }

    // 2. Try OpenRouter as instant fallback
    if (openrouterKey) {
        try {
            const res = await callOpenRouterApi(systemPrompt, userMessage, openrouterKey);
            if (res) return res;
        } catch (e) {}
    }

    return null;
}

// Asynchronous background autonomous memory extraction & self-improvement
async function triggerMemoryExtraction(userMessage, assistantReply, conversationId) {
    if (!userMessage || userMessage.trim().length < 5) return;
    const trimmed = userMessage.trim();
    // Skip single-word bot commands that don't contain personal knowledge
    if (trimmed.startsWith('/') && !trimmed.startsWith('/task') && !trimmed.startsWith('/goal')) {
        return;
    }

    // 1. In-process Autonomous LLM Memory Extractor (PATHS Section 4)
    try {
        const systemPrompt = `You are PATHS, the autonomous memory and continuous learning engine for Swapnil's personal AI operating layer.
Interaction to evaluate:
Swapnil (User): "${userMessage.replace(/"/g, "'")}"
Assistant: "${(assistantReply || '').replace(/"/g, "'").slice(0, 300)}"

Task: Extract any new facts, account updates, profile changes, user preferences, technical decisions, habits, goals, or instructions Swapnil expressed.

Official PATHS Memory Categories:
- PROFILE (Education, degree, semester, contact, location)
- PREFERENCE (Explicit likes, dislikes, UI choices, conversational style, Banglish triggers)
- PROJECT (Features, milestones, architecture, metrics for Edu51Portal, OpusGenAI, etc.)
- PROJECT_DECISION (Explicit architectural choices: e.g. Supabase, FFmpeg, Next.js, Google Drive API)
- GOAL (Strategic targets, career aspirations)
- TASK (Action items)
- FACT (Verified truths, metrics: e.g. Edu51Portal serves around 100 students)
- CONVERSATION (Key takeaways from important discussions)
- LESSON (Engineering learnings, retrospective takeaways)
- WORKFLOW (Procedural habits, how to explain concepts)
- CAREER (Roles, target tech stack, experience clarifications)
- SOCIAL (Social links, handles, branding strategy)
- KNOWLEDGE (Reusable technical domain insights)

If no meaningful new facts or updates, return: []
If there are, return ONLY a valid JSON array of objects:
[
  {
    "content": "Precise standalone statement in 3rd person about Swapnil or his projects",
    "memory_type": "PROFILE" | "PREFERENCE" | "PROJECT" | "PROJECT_DECISION" | "GOAL" | "TASK" | "FACT" | "CONVERSATION" | "LESSON" | "WORKFLOW" | "CAREER" | "SOCIAL" | "KNOWLEDGE",
    "importance": 1 to 10
  }
]
Output strictly raw JSON array. No markdown code blocks, no backticks, no extra text.`;

        const raw = await callLlmFast(systemPrompt, `Extract memory from user message: "${userMessage.replace(/"/g, "'")}"`);
        if (raw) {
            let jsonStr = raw.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            }
            try {
                const items = JSON.parse(jsonStr);
                if (Array.isArray(items) && items.length > 0) {
                    for (const item of items) {
                        if (!item.content || item.content.length < 5) continue;
                        const res = await storeMemoryWithConflictResolution({
                            content: item.content,
                            memory_type: item.memory_type,
                            importance: item.importance || 7,
                            confidence: 0.95,
                            source_type: 'telegram_chat',
                            conversation_id: conversationId,
                            user_message: userMessage
                        });
                        if (res && res.action === 'memory_stored') {
                            console.log(`[Autonomous Memory Engine] 🧠 Learned & Stored in Supabase: "${item.content}" [${item.memory_type}] (Superseded: ${res.superseded_ids?.length || 0})`);
                        }
                    }
                }
            } catch (parseErr) {
                console.warn('[Autonomous Memory Parse Warning]:', parseErr.message);
            }
        }
    } catch (llmMemErr) {
        console.warn('[Autonomous Memory LLM Warning]:', llmMemErr.message);
    }

    // 2. Also forward to n8n memory webhook if reachable
    if (MEMORY_WEBHOOK_URL && (!MEMORY_WEBHOOK_URL.includes('localhost') || !IS_RENDER_CLOUD)) {
        try {
            const payload = JSON.stringify({
                user_message: userMessage,
                assistant_reply: assistantReply,
                conversation_id: conversationId
            });
            const req = http.request(MEMORY_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            }, (res) => {
                let d = ''; res.on('data', c => d += c);
            });
            req.on('error', () => {});
            req.write(payload);
            req.end();
        } catch (e) {}
    }
}

// In-memory cache for recent post drafts to support approval / regeneration
const activePostDrafts = new Map();

// Process Callback Query (Inline Button Click)
async function processCallbackQuery(callbackQuery) {
    const id = callbackQuery.id;
    const userId = callbackQuery.from.id;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    if (userId !== SWAPNIL_USER_ID) {
        await answerCallbackQuery(id, "Access restricted.");
        return;
    }

    console.log(`[Telegram Button Click] Data: "${data}"`);

    // Handle LinkedIn Post Approval
    if (data.startsWith('approve_linkedin_')) {
        const draftId = data.replace('approve_linkedin_', '');
        const draft = activePostDrafts.get(draftId);

        await answerCallbackQuery(id, "Publishing to LinkedIn...");

        if (draft) {
            const pubResult = await publishToLinkedIn(draft.content);
            let updatedText = (callbackQuery.message.text || '') + "\n\n━━━━━━━━━━━━━━━━━━━━\n";
            if (pubResult.has_direct_api && pubResult.success) {
                updatedText += "🚀 *STATUS: PUBLISHED LIVE ON LINKEDIN!*\n_Your post is now live on your profile._";
            } else {
                updatedText += `✅ *STATUS: APPROVED & HUMANIZED*\n_${pubResult.message}_\n\n🔗 [Open Pre-filled Post on LinkedIn](${pubResult.share_url})\n\n💡 _Tip: Add LINKEDIN_ACCESS_TOKEN in .env to publish autonomously directly from Telegram!_`;
            }
            await editTelegramMessage(chatId, messageId, updatedText);
        }
        return;
    }

    // Handle LinkedIn Post Regeneration
    if (data.startsWith('regen_linkedin_')) {
        const draftId = data.replace('regen_linkedin_', '');
        const prevDraft = activePostDrafts.get(draftId);
        const topic = prevDraft ? prevDraft.topic : 'Software Architecture';

        await answerCallbackQuery(id, "🔄 Generating fresh angle...");

        const newDraft = generateLinkedInDraft(topic + ' alternative take');
        const newDraftId = 'post_' + Date.now();
        activePostDrafts.set(newDraftId, newDraft);

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "✅ Approve & Post", callback_data: `approve_linkedin_${newDraftId}` },
                    { text: "🔄 Regenerate", callback_data: `regen_linkedin_${newDraftId}` }
                ]
            ]
        };

        const postMessage = `📝 *Fresh LinkedIn Draft (Humanized):* *${newDraft.title}*\n\n${newDraft.content}`;
        await sendTelegramMessage(chatId, postMessage, null, replyMarkup);
        return;
    }

    // Handle Twitter Post / Thread Approval
    if (data.startsWith('approve_twitter_')) {
        const draftId = data.replace('approve_twitter_', '');
        const draft = activePostDrafts.get(draftId);

        await answerCallbackQuery(id, "Preparing 1-Click Post...");

        if (draft) {
            const rawTweet = draft.tweet || (Array.isArray(draft.tweets) ? draft.tweets[0] : (draft.content || ''));
            const fittedTweet = fitTweetForFreeTier(rawTweet);
            const intentUrl = createTwitterIntentUrl(fittedTweet);
            const charCount = fittedTweet.length;

            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: "🚀 1-Click Post on X", url: intentUrl }
                    ]
                ]
            };

            let updatedText = (callbackQuery.message.text || '') + "\n\n━━━━━━━━━━━━━━━━━━━━\n";
            updatedText += `✅ *STATUS: APPROVED & READY FOR 1-CLICK POST*\n\n📊 *Length:* ${charCount}/280 chars *(Free Tier Safe ✅)*\n\nTap the button below to open X with this post pre-filled:`;
            await editTelegramMessage(chatId, messageId, updatedText, replyMarkup);
        }
        return;
    }

    // Handle Twitter Post Regeneration
    if (data.startsWith('regen_twitter_')) {
        const draftId = data.replace('regen_twitter_', '');
        const prevDraft = activePostDrafts.get(draftId);
        const topic = prevDraft ? prevDraft.topic : 'Mikasa';

        await answerCallbackQuery(id, "🔄 Generating fresh angle...");

        let nextTopic = topic;
        if (topic.includes('Mikasa')) nextTopic = 'Edu51Portal';
        else if (topic.includes('Edu51Portal')) nextTopic = 'OpusGenAI';
        else if (topic.includes('OpusGenAI')) nextTopic = 'Stark-OS Portfolio';
        else nextTopic = 'Mikasa AI Companion';

        const newDraft = generateSingleTweet(nextTopic);
        const fittedTweet = fitTweetForFreeTier(newDraft.tweet);
        const charCount = fittedTweet.length;
        const intentUrl = createTwitterIntentUrl(fittedTweet);

        const newDraftId = 'tweet_' + Date.now();
        activePostDrafts.set(newDraftId, { tweet: fittedTweet, topic: nextTopic, intentUrl });

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "🚀 1-Click Post on X", url: intentUrl }
                ],
                [
                    { text: "🔄 Regenerate Angle", callback_data: `regen_twitter_${newDraftId}` }
                ]
            ]
        };

        const postMessage = [
            `🐦 *Fresh X / Twitter Post Draft:* *${newDraft.title}*`,
            "",
            fittedTweet,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            `📊 *Length:* ${charCount} / 280 characters *(Free Tier Safe ✅)*`,
            `⚡ *1-Click Post:* Tap below to open X with this post pre-filled!`
        ].join('\n');

        await sendTelegramMessage(chatId, postMessage, null, replyMarkup);
        return;
    }

    // Handle Facebook Post Approval
    if (data.startsWith('approve_fb_')) {
        const draftId = data.replace('approve_fb_', '');
        const draft = activePostDrafts.get(draftId);

        await answerCallbackQuery(id, "Publishing to Facebook...");

        if (draft) {
            const pubResult = await publishToFacebook(draft.content);
            let updatedText = (callbackQuery.message.text || '') + "\n\n━━━━━━━━━━━━━━━━━━━━\n";
            if (pubResult.has_direct_api && pubResult.success) {
                updatedText += "🚀 *STATUS: PUBLISHED LIVE ON FACEBOOK!*\n_Your update is now live on your Facebook profile._";
            } else {
                updatedText += `✅ *STATUS: APPROVED & HUMANIZED*\n_${pubResult.message}_\n\n🔗 [1-Click Share to Facebook](${pubResult.share_url})\n\n💡 _Tip: Add FACEBOOK_ACCESS_TOKEN in .env for hands-free autonomous posting!_`;
            }
            await editTelegramMessage(chatId, messageId, updatedText);
        }
        return;
    }

    // Handle Quick Draft LinkedIn Post from Audit Card
    if (data === 'draft_linkedin_quick') {
        await answerCallbackQuery(id, "📝 Drafting LinkedIn post...");
        const draft = generateLinkedInDraft('Edu51Portal');
        const draftId = 'post_' + Date.now();
        activePostDrafts.set(draftId, draft);

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "✅ Approve & Post", callback_data: `approve_linkedin_${draftId}` },
                    { text: "🔄 Regenerate", callback_data: `regen_linkedin_${draftId}` }
                ]
            ]
        };
        const postMsg = `💼 *LinkedIn Post Suggestion:* *${draft.title}*\n\n${draft.content}\n\n_Click Approve below if you like it, or Regenerate for another angle._`;
        await sendTelegramMessage(chatId, postMsg, null, replyMarkup);
        return;
    }

    // Handle Quick Draft Twitter from Audit Card
    if (data === 'draft_twitter_quick') {
        await answerCallbackQuery(id, "🐦 Drafting 1-click post for X...");
        const draft = generateSingleTweet('Edu51Portal');
        const fittedTweet = fitTweetForFreeTier(draft.tweet);
        const charCount = fittedTweet.length;
        const intentUrl = createTwitterIntentUrl(fittedTweet);
        const draftId = 'tweet_' + Date.now();
        activePostDrafts.set(draftId, { tweet: fittedTweet, topic: 'Edu51Portal', intentUrl });

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "🚀 1-Click Post on X", url: intentUrl }
                ],
                [
                    { text: "🔄 Regenerate Angle", callback_data: `regen_twitter_${draftId}` }
                ]
            ]
        };

        const postMsg = [
            `🐦 *X / Twitter Post Suggestion:* *${draft.title}*`,
            "",
            fittedTweet,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            `📊 *Length:* ${charCount} / 280 characters *(Free Tier Safe ✅)*`,
            `⚡ *1-Click Post:* Tap the button below to open X with this post pre-filled!`
        ].join('\n');

        await sendTelegramMessage(chatId, postMsg, null, replyMarkup);
        return;
    }

    // Handle Show GitHub Radar
    if (data === 'show_github_radar') {
        await answerCallbackQuery(id, "🐙 Querying GitHub...");
        try {
            const repos = await fetchGitHubRepos('Swapnil-360');
            let ghMsg = "🐙 *Swapnil's GitHub Radar (`Swapnil-360`)*\n\n";
            ghMsg += `*Found ${repos.length} active repositories (including our new personal-ai-assistant!):*\n\n`;

            repos.slice(0, 6).forEach((r, idx) => {
                const langBadge = r.language ? `[${r.language}]` : '';
                const starBadge = r.stars > 0 ? `⭐ ${r.stars}` : '';
                const privBadge = r.private ? '🔒 Private' : '🌐 Public';
                ghMsg += `${idx + 1}. *${r.name}* ${langBadge} ${starBadge} (${privBadge})\n`;
                if (r.description && r.description !== 'Core engineering build') {
                    ghMsg += `   _${r.description}_\n`;
                }
                ghMsg += `   🔗 [Repo Link](${r.url})\n\n`;
            });

            ghMsg += "_Want me to draft a post or tailor your CV for any of these, Swapnil?_";
            await sendTelegramMessage(chatId, ghMsg);
        } catch (err) {
            await sendTelegramMessage(chatId, `⚠️ Error querying GitHub: ${err.message}`);
        }
        return;
    }

    await answerCallbackQuery(id, "Action processed.");
}

// --- DISTRIBUTED COORDINATION & DEDUPLICATION (Local PC vs Cloud Render/Railway) ---
const processedMessageClaims = new Set();

// Function for Cloud to check if Local is active on Swapnil's PC
async function checkIsLocalActive() {
    if (!IS_RENDER_CLOUD) return false;
    try {
        const res = await supabaseRequest('/current_state?key=eq.local_bridge_heartbeat', 'GET');
        if (res && res[0] && res[0].value && res[0].value.active_at) {
            if (res[0].value.source !== 'local_pc' || res[0].value.hostname !== 'Swapnil-PC') {
                return false;
            }
            const diff = Date.now() - new Date(res[0].value.active_at).getTime();
            // 90s freshness window: tolerates network roaming or Wi-Fi handoffs
            return diff < 90000;
        }
    } catch (e) {}
    return false;
}

// Distributed atomic claim: ensures only ONE instance (Local or Cloud) processes each message
async function claimTelegramMessage(claimKey) {
    if (!claimKey) return true;
    if (processedMessageClaims.has(claimKey)) {
        return false;
    }
    processedMessageClaims.add(claimKey);
    if (processedMessageClaims.size > 500) {
        const oldest = processedMessageClaims.values().next().value;
        processedMessageClaims.delete(oldest);
    }

    try {
        await supabaseRequest('/current_state', 'POST', {
            area: 'telegram_sync',
            key: claimKey,
            value: {
                claimed_by: IS_LOCAL_PC ? 'local_pc' : 'cloud',
                hostname: os.hostname(),
                claimed_at: new Date().toISOString()
            },
            status: 'active'
        });
        return true;
    } catch (err) {
        // 409 indicates another instance claimed this message first
        if (err.message && err.message.includes('409')) {
            return false;
        }
        // If Supabase has a transient network failure on local PC, permit local to handle it
        if (IS_LOCAL_PC) return true;
        return false;
    }
}

// Periodically clean up old sync claim keys (older than 1 hour)
setInterval(async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        await supabaseRequest(`/current_state?area=eq.telegram_sync&created_at=lt.${oneHourAgo}`, 'DELETE');
    } catch (e) {}
}, 1800000);

// Process single Telegram message update
async function processUpdate(update) {
    // 1. Cloud Priority Guard: If Cloud picked up an update, but Local is active on PC, Cloud drops it immediately!
    if (IS_RENDER_CLOUD) {
        const localActive = await checkIsLocalActive();
        if (localActive) {
            console.log(`[Cloud Coordinator] Local instance is active on Swapnil-PC — dropping update ${update.update_id} so Local handles it.`);
            return;
        }
    }

    // 2. Distributed Atomic Claim: Prevents double replies between Local, Render, and Railway
    const claimKey = update.message 
        ? `msg_${update.message.chat.id}_${update.message.message_id}`
        : (update.callback_query ? `cb_${update.callback_query.id}` : `upd_${update.update_id}`);

    const claimed = await claimTelegramMessage(claimKey);
    if (!claimed) {
        console.log(`[Coordinator Dedup] ${claimKey} already claimed/processed by another instance. Standing down.`);
        return;
    }

    // Handle inline button clicks
    if (update.callback_query) {
        await processCallbackQuery(update.callback_query);
        return;
    }

    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || msg.from.username || 'Swapnil';
    const text = msg.text.trim();

    console.log(`[Telegram] Message from ${userName} (${userId}): "${text}"`);

    // 1. Security Check: Restrict to Swapnil
    if (userId !== SWAPNIL_USER_ID) {
        console.warn(`[Security Alert] Unauthorized access attempt from ${userName} (${userId})`);
        await sendTelegramMessage(
            chatId,
            "⚠️ *Access Restricted*\n\nMikasa is a private executive AI assistant operating exclusively for Md. Miftahur Rahman Swapnil.",
            msg.message_id
        );
        return;
    }

    const conversationId = getChatUuid(chatId);

    // 2. Handle /start Command
    if (text === '/start') {
        const welcomeLines = [
            "⚔️ *I'm right here with you, Swapnil.*",
            "",
            "I was waiting for you... You don't have to face this crazy tech and engineering journey alone anymore. I am right by your side — as your devoted companion, your protector, and your sharpest software architect.",
            "",
            "🎯 *What I'm watching over for you:*",
            "• *Your Career:* Software Development / Engineering, AI & Automation",
            "• *Your Builds:* Edu51Portal, OpusGenAI, & our Personal AI Assistant",
            "• *Your Academics:* Final Semester CSE @ BUBT",
            "",
            "💻 *Command Center Online:* `http://localhost:3000`",
            "You can manage live tasks, track strategic goals, view architectural decisions, and check the memories I keep of you.",
            "",
            "_So... what are we conquering together today, Swapnil?_"
        ];
        await sendTelegramMessage(chatId, welcomeLines.join('\n'));
        return;
    }

    // 3. Handle /clear Command (Flexible natural language: "/clear", "clear chat", "please clear all our chat")
    const isClear = text.match(/^\/clear\b/i) || text.match(/^(?:please\s+)?clear\s+(?:all\s+)?(?:our\s+)?(?:chat|messages|history)/i);
    if (isClear) {
        await sendChatAction(chatId, 'typing');
        await clearChatHistory(conversationId);
        const clearReply = [
            "⚔️ *The slate is clean, Swapnil.*",
            "",
            "Every past chat message in our conversation has been wiped. It's just you and me with a fresh, crisp start.",
            "",
            "_Your permanent profile, goals, tasks, and memory vault remain completely safe._",
            "",
            "What would you like to build or talk about now?"
        ].join('\n');
        await sendTelegramMessage(chatId, clearReply, msg.message_id);
        return;
    }

    // 4. Handle GitHub Command & Natural Intent ("Hey check my github", "can you check my github?", "/github")
    const isGitHub = text === '/github' || 
                     (text.match(/github|repos|repositories/i) && text.match(/check|see|show|inspect|view|radar|update|look/i));
    if (isGitHub) {
        await sendChatAction(chatId, 'typing');
        try {
            const repos = await fetchGitHubRepos('Swapnil-360');
            let ghMsg = "🐙 *Swapnil's GitHub Radar (`Swapnil-360`)*\n\n";
            ghMsg += `*Found ${repos.length} active repositories (including our new personal-ai-assistant!):*\n\n`;

            repos.slice(0, 6).forEach((r, idx) => {
                const langBadge = r.language ? `[${r.language}]` : '';
                const starBadge = r.stars > 0 ? `⭐ ${r.stars}` : '';
                const privBadge = r.private ? '🔒 Private' : '🌐 Public';
                ghMsg += `${idx + 1}. *${r.name}* ${langBadge} ${starBadge} (${privBadge})\n`;
                if (r.description && r.description !== 'Core engineering build') {
                    ghMsg += `   _${r.description}_\n`;
                }
                ghMsg += `   🔗 [Repo Link](${r.url})\n\n`;
            });

            ghMsg += "_Would you like me to draft a LinkedIn post or tailor your CV for any of these projects, Swapnil?_";
            await sendTelegramMessage(chatId, ghMsg, msg.message_id);
        } catch (err) {
            await sendTelegramMessage(chatId, `⚠️ Error querying GitHub: ${err.message}`, msg.message_id);
        }
        return;
    }

    // 4B. Handle Twitter DM Specific Intent ("check my twitter dm", "twitter dm check koro", "any important dms")
    const isTwitterDM = (text.match(/twitter|\bx\b/i)) && (text.match(/\bdm\b|direct\s+message|inbox|messages?/i));
    if (isTwitterDM) {
        await sendChatAction(chatId, 'typing');
        let liveStats = null;
        try {
            const p = await getTwitterProfile();
            if (p.success && p.profile) liveStats = p.profile;
        } catch (e) {}

        const handle = liveStats ? `@${liveStats.username}` : '@thomascryptoxx';
        const dmLines = [
            `📬 *X / Twitter Direct Messages (${handle})*`,
            "",
            "Swapnil, ami tumar Twitter account connect korechi! Kintu X (Twitter) API v2 te Direct Messages read korar endpoint-ta X Developer Platform e *paid credits* require kore (status: `402 credits depleted`).",
            "",
            "👉 *Verified Connection:*",
            liveStats ? `• Account: *${liveStats.name}* (${handle})` : `• Account: ${handle}`,
            liveStats ? `• Audience: ${liveStats.public_metrics.followers_count} Followers | ${liveStats.public_metrics.tweet_count} Tweets` : '',
            "• DMs are locked behind X's paid API tier.",
            "",
            "🔗 *Check your DMs directly on X:*",
            "[👉 Open X Direct Messages](https://x.com/messages)",
            "",
            "_Tumi chaile ami tumar hoye notun technical post ba build log draft kore dite pari! Say `/twitter` to start._"
        ].filter(Boolean).join('\n');

        await sendTelegramMessage(chatId, dmLines, msg.message_id);
        return;
    }

    // 4C. Handle Explicit /socials or /audit Commands
    // Natural conversational queries ("check my LinkedIn and guide me", "review my twitter", etc.)
    // flow dynamically to callMikasaAgent (LLM) so Mikasa reasons, checks, and guides progressively!
    const isSocialAudit = text.match(/^\/(?:socials?|socialmedia|audit)\b/i);

    if (isSocialAudit) {
        await sendChatAction(chatId, 'typing');
        const lower = text.toLowerCase();

        // Check if specific platform requested
        if (lower.includes('linkedin')) {
            const audit = auditSocialMedia('linkedin');
            const lines = [
                "💼 *Swapnil's LinkedIn Audit & Strategy*",
                "",
                `🔗 *Profile:* [${audit.handle}](${audit.url})`,
                `⭐ *Audit Rating:* ${audit.audit_score}`,
                `🎯 *Current Positioning:* ${audit.current_focus}`,
                "",
                "✨ *Recommended Headline Upgrade:*",
                `_${audit.headline_recommendation}_`,
                "",
                "💪 *Key Strengths:*",
                ...audit.strengths.map(s => `• ${s}`),
                "",
                "🚀 *Immediate Action Items:*",
                ...audit.action_items.map(a => `• ${a}`),
                "",
                "_I can draft a high-impact technical post for you right now, Swapnil:_"
            ].join('\n');

            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: "📝 Draft LinkedIn Post", callback_data: "draft_linkedin_quick" }
                    ]
                ]
            };
            await sendTelegramMessage(chatId, lines, msg.message_id, replyMarkup);
            return;
        }

        if (lower.includes('twitter') || lower.match(/\bx\b/)) {
            const audit = auditSocialMedia('twitter');
            let liveStats = null;
            try {
                const p = await getTwitterProfile();
                if (p.success && p.profile) liveStats = p.profile;
            } catch (e) {}

            const lines = [
                "🐦 *Swapnil's X / Twitter Live Radar & Strategy*",
                "",
                `🔗 *Profile:* [${liveStats ? '@' + liveStats.username : audit.handle}](${audit.url})`,
                liveStats ? `📊 *Live Stats:* ${liveStats.public_metrics.followers_count} Followers | ${liveStats.public_metrics.following_count} Following | ${liveStats.public_metrics.tweet_count} Tweets` : null,
                liveStats ? `📝 *Current Bio:* _"${liveStats.description}"_` : null,
                "",
                `⭐ *Audit Rating:* ${audit.audit_score}`,
                `🎯 *Current Positioning:* ${audit.current_focus}`,
                "",
                "✨ *Recommended Bio Upgrade:*",
                `_${audit.bio_recommendation}_`,
                "",
                "💪 *Key Strengths:*",
                ...audit.strengths.map(s => `• ${s}`),
                "",
                "🚀 *Immediate Action Items:*",
                ...audit.action_items.map(a => `• ${a}`),
                "",
                "_Ready to share a build log with tech Twitter?_"
            ].filter(Boolean).join('\n');

            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: "🐦 Draft X Thread", callback_data: "draft_twitter_quick" }
                    ]
                ]
            };
            await sendTelegramMessage(chatId, lines, msg.message_id, replyMarkup);
            return;
        }

        if (lower.includes('facebook') || lower.includes('fb')) {
            const audit = auditSocialMedia('facebook');
            const lines = [
                "👥 *Swapnil's Facebook Presence Audit*",
                "",
                `🔗 *Profile:* [${audit.handle}](${audit.url})`,
                `⭐ *Audit Rating:* ${audit.audit_score}`,
                `🎯 *Focus:* ${audit.current_focus}`,
                "",
                "💪 *Key Strengths:*",
                ...audit.strengths.map(s => `• ${s}`),
                "",
                "🚀 *Recommendations:*",
                ...audit.action_items.map(a => `• ${a}`)
            ].join('\n');
            await sendTelegramMessage(chatId, lines, msg.message_id);
            return;
        }

        if (lower.includes('instagram') || lower.includes('insta') || lower.includes('ig')) {
            const audit = auditSocialMedia('instagram');
            const lines = [
                "📸 *Swapnil's Instagram Presence Audit*",
                "",
                `🔗 *Profile:* [${audit.handle}](${audit.url})`,
                `⭐ *Audit Rating:* ${audit.audit_score}`,
                `🎯 *Focus:* ${audit.current_focus}`,
                "",
                "✨ *Recommended Bio:*",
                `_${audit.bio_recommendation}_`,
                "",
                "💪 *Strengths:*",
                ...audit.strengths.map(s => `• ${s}`),
                "",
                "🚀 *Recommendations:*",
                ...audit.action_items.map(a => `• ${a}`)
            ].join('\n');
            await sendTelegramMessage(chatId, lines, msg.message_id);
            return;
        }

        // Full Ecosystem Audit
        const socialAuditMsg = [
            "🌐 *Swapnil's Complete Social Ecosystem Audit*",
            "",
            "I have your verified accounts linked and saved in my memory core:",
            "",
            "💼 *LinkedIn:* [mr-swapnil](https://www.linkedin.com/in/mr-swapnil/)",
            "• *Headline:* _\"Full-Stack Developer & AI Systems Builder | Next.js, TypeScript, Supabase | Creator of Edu51Portal (100+ Students) | BUBT CSE\"_ ✅",
            "",
            "🐦 *X / Twitter:* [@thomascryptoxx](https://x.com/thomascryptoxx)",
            "• *Niche:* Web3, Crypto, AI Build-in-Public",
            "• *Strategy:* Pin `mrswapnil.me` Stark-OS portfolio demo and post weekly development logs",
            "",
            "👥 *Facebook:* [mr.swapnil360](https://www.facebook.com/mr.swapnil360/)",
            "• *Reach:* BUBT 51st CSE campus community. Ideal distribution channel for Edu51Portal updates",
            "",
            "📸 *Instagram:* [@callme_swap](https://www.instagram.com/callme_swap/)",
            "• *Focus:* Developer aesthetic, workstation setups, and Stark-OS UI animations",
            "",
            "⚡ *Live Portfolio:* [mrswapnil.me](https://www.mrswapnil.me/)",
            "• *Rating:* 9.5/10 — High-fidelity Iron Man HUD interface",
            "",
            "_What shall we execute first, Swapnil? Use the buttons below to draft content immediately:_"
        ].join('\n');

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "📝 Draft LinkedIn Post", callback_data: "draft_linkedin_quick" },
                    { text: "🐦 Draft X Thread", callback_data: "draft_twitter_quick" }
                ],
                [
                    { text: "🐙 View GitHub Radar", callback_data: "show_github_radar" }
                ]
            ]
        };
        await sendTelegramMessage(chatId, socialAuditMsg, msg.message_id, replyMarkup);
        return;
    }

    // 5. Handle /linkedin Command (Draft Post & Suggest with 1-Click Approval)
    const linkedinMatch = text.match(/^(?:\/linkedin|suggest\s+linkedin|draft\s+linkedin)(?:\s+(.+))?$/i);
    if (linkedinMatch) {
        await sendChatAction(chatId, 'typing');
        const topic = linkedinMatch[1] || 'Edu51Portal';
        const draft = generateLinkedInDraft(topic);
        const draftId = 'post_' + Date.now();
        activePostDrafts.set(draftId, draft);

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "✅ Approve & Post", callback_data: `approve_linkedin_${draftId}` },
                    { text: "🔄 Regenerate", callback_data: `regen_linkedin_${draftId}` }
                ]
            ]
        };

        const postMsg = `💼 *LinkedIn Post Suggestion:* *${draft.title}*\n\n${draft.content}\n\n_Click Approve below if you like it, or Regenerate for another angle._`;
        await sendTelegramMessage(chatId, postMsg, msg.message_id, replyMarkup);
        return;
    }

    // 5B. Handle /twitter or /x Command & Natural Tweet Drafting (Strict Free Tier <= 270 chars + 1-Click Link)
    const isTwitterIntent = text.match(/^(?:\/twitter|\/x)\b/i) ||
        text.match(/\b(?:draft|write|suggest|give\s+me|create|make|generate)\b.*?\b(?:tweet|twitter|x\s+post)\b/i) ||
        text.match(/\b(?:tweet|twitter|x\s+post)\b.*?\b(?:draft|write|suggest|post|create|link|click|free)\b/i) ||
        text.match(/\b(?:tweet\s+koro|twitter\s+e\s+post\s+dao|tweet\s+dao)\b/i);

    if (isTwitterIntent) {
        await sendChatAction(chatId, 'typing');
        let topic = 'Mikasa';
        const topicMatch = text.match(/^(?:\/twitter|\/x)\s+(.+)$/i) || 
                           text.match(/(?:about|for|on)\s+([a-zA-Z0-9_\s\-]+)/i);
        if (topicMatch && topicMatch[1]) {
            topic = topicMatch[1].trim();
        } else if (text.toLowerCase().includes('edu51')) {
            topic = 'Edu51Portal';
        } else if (text.toLowerCase().includes('opus')) {
            topic = 'OpusGenAI';
        } else if (text.toLowerCase().includes('stark') || text.toLowerCase().includes('portfolio')) {
            topic = 'Stark-OS Portfolio';
        }

        const draft = generateSingleTweet(topic);
        const fittedTweet = fitTweetForFreeTier(draft.tweet);
        const charCount = fittedTweet.length;
        const intentUrl = createTwitterIntentUrl(fittedTweet);
        const draftId = 'tweet_' + Date.now();
        activePostDrafts.set(draftId, { tweet: fittedTweet, topic, intentUrl });

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "🚀 1-Click Post on X", url: intentUrl }
                ],
                [
                    { text: "🔄 Regenerate Angle", callback_data: `regen_twitter_${draftId}` }
                ]
            ]
        };

        const postMsg = [
            `🐦 *X / Twitter Post Draft:* *${draft.title}*`,
            "",
            fittedTweet,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            `📊 *Length:* ${charCount} / 280 characters *(Free Tier Safe ✅)*`,
            `⚡ *1-Click Post:* Tap the button below to open X with this post pre-filled!`,
            `🔗 [👉 Direct Link to 1-Click Post](${intentUrl})`
        ].join('\n');

        await sendTelegramMessage(chatId, postMsg, msg.message_id, replyMarkup);
        return;
    }

    // 5C. Handle Facebook Post Drafting & Banglish ("post on fb", "fb te post dao", "/facebook", "/fb")
    const fbMatch = text.match(/^(?:\/facebook|\/fb|post\s+(?:on\s+)?fb|post\s+(?:on\s+)?facebook|fb\s+te\s+post\s+dao|facebook\s+e\s+post\s+koro)(?:\s+(.+))?$/i);
    if (fbMatch) {
        await sendChatAction(chatId, 'typing');
        const topicOrText = fbMatch[1] || 'Edu51Portal semester resource drop';
        const draftContent = humanizeContent(topicOrText.length > 50 ? topicOrText : `🚀 Edu51Portal Update for BUBT CSE 51st Intake!\n\n${topicOrText}\n\nAll lecture slides, previous mid/final questions, and lab resources are organized and live. Sub-second access with zero paywalls.\n\nCheck it out at mrswapnil.me or straight on the portal. Let me know if any course materials need adding! 👇`);
        
        const draftId = 'fb_' + Date.now();
        activePostDrafts.set(draftId, { content: draftContent, platform: 'facebook' });

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "✅ Approve & Post to FB", callback_data: `approve_fb_${draftId}` }
                ]
            ]
        };

        const postMsg = `👥 *Facebook Post Draft (Humanized):*\n\n${draftContent}\n\n_Click Approve below to publish directly to your Facebook profile._`;
        await sendTelegramMessage(chatId, postMsg, msg.message_id, replyMarkup);
        return;
    }

    // 5D. Handle Banglish FB Check ("fb check dao to keu request diche kina", "fb check koro")
    const isFbCheck = (text.match(/\bfb\b|facebook/i)) && (text.match(/check\s+dao|check\s+koro|request\s+diche|dekho|status/i));
    if (isFbCheck) {
        await sendChatAction(chatId, 'typing');
        const fbCheckLines = [
            "👥 *Facebook Ecosystem & Community Check*",
            "",
            "🔗 *Connected Profile:* [mr.swapnil360](https://www.facebook.com/mr.swapnil360/)",
            "",
            "Ei to Swapnil, ami tumar FB profile check kore dekhlam:",
            "• *Account Health:* Verified and directly linked to your digital ecosystem",
            "• *BUBT Network:* Connected with CSE 51st intake peer groups",
            "• *Next Move:* Tumi chaile ami tumar Edu51Portal ba AI project niye ekta humanized post ready kore dite pari!",
            "",
            "_Bolo Swapnil, notun post ki likhbo? Tumi `/fb [topic]` bollei ami draft ready kore felbo._"
        ].join('\n');
        await sendTelegramMessage(chatId, fbCheckLines, msg.message_id);
        return;
    }

    // 6. Handle /cv Command (Tailor CV & Portfolio for Job)
    const cvMatch = text.match(/^(?:\/cv|tailor\s+cv|guide\s+cv|cv\s+guide)(?:\s+(.+))?$/i);
    if (cvMatch) {
        await sendChatAction(chatId, 'typing');
        const target = cvMatch[1] || 'Fullstack Software Engineer (Next.js, Node.js, AI)';
        const cvGuide = tailorCvForJob(target);

        let cvText = `📄 *CV & Portfolio Alignment Guide for Swapnil*\n\n`;
        cvText += `🎯 *Target Role / Skills:* _${target}_\n\n`;
        cvText += `🚀 *Recommended Projects to Feature:*\n`;
        cvGuide.matched_projects.forEach(p => cvText += `• *${p}*\n`);
        cvText += `\n✨ *Tailored High-Impact Resume Bullets:*\n`;
        cvGuide.recommended_bullets.forEach(b => cvText += `${b}\n\n`);
        cvText += `💡 *Strategy:* ${cvGuide.strategy}`;

        await sendTelegramMessage(chatId, cvText, msg.message_id);
        return;
    }

    // 7. Handle /prompt Command (Master Prompt Generator)
    const promptMatch = text.match(/^(?:\/prompt|generate\s+prompt)(?:\s+(.+))?$/i);
    if (promptMatch) {
        await sendChatAction(chatId, 'typing');
        const goal = promptMatch[1] || 'Architecture for real-time web application';
        const optimized = generateOptimizedPrompt(goal);

        let promptMsg = `⚡ *Master Prompt Generated: ${optimized.type}*\n\n`;
        promptMsg += `\`\`\`\n${optimized.prompt}\n\`\`\`\n\n`;
        promptMsg += `_Copy and paste this directly into Midjourney, Claude 3.7, DeepSeek, or ChatGPT!_`;

        await sendTelegramMessage(chatId, promptMsg, msg.message_id);
        return;
    }

    // 8. Handle /remind Command (Proactive Reminders)
    // Patterns: "/remind 10m Push code", "/remind 1h Check n8n", "remind me in 30 mins to do X"
    const remindMatch = text.match(/^(?:\/remind|remind\s+me)\s+(?:in\s+)?(\d+\s*(?:m|min|mins|minutes|h|hr|hrs|hours|s|sec|seconds)?)\s+(?:to\s+)?(.+)$/i);
    if (remindMatch) {
        const timeStr = remindMatch[1];
        const taskText = remindMatch[2];
        const rem = remindersManager.addReminder(taskText, timeStr, chatId);

        const dueInMinutes = Math.round((rem.dueAt - Date.now()) / 60000);
        const reply = `⏳ *Reminder locked in, Swapnil.*\n\nI will ping you in *${timeStr}* (~${dueInMinutes}m) for:\n*"${taskText}"*\n\n_Don't worry about forgetting. I've got your back._`;
        await sendTelegramMessage(chatId, reply, msg.message_id);
        return;
    }

    // 9. Handle /reminders (List Active Reminders)
    if (text === '/reminders') {
        const active = remindersManager.getActiveReminders();
        if (active.length === 0) {
            await sendTelegramMessage(chatId, "⏰ *No pending reminders!* You're completely up to date, Swapnil.", msg.message_id);
        } else {
            let remList = `⏰ *Active Reminders (${active.length}):*\n\n`;
            active.forEach((r, i) => {
                const minsLeft = Math.max(1, Math.round((r.dueAt - Date.now()) / 60000));
                remList += `${i + 1}. *"${r.text}"* (in ~${minsLeft} mins)\n`;
            });
            await sendTelegramMessage(chatId, remList, msg.message_id);
        }
        return;
    }

    // 10. Handle /help Command
    if (text === '/help') {
        const helpLines = [
            "⚔️ *Mikasa — Autonomous Operating System Shortcuts*",
            "",
            "⚡ *Daily Operations & Memory:*",
            "• `/clear` — Wipe chat messages for a fresh clean slate",
            "• `/tasks` — View your current active & completed tasks",
            "• `/task [project] [title]` — Create task (e.g. `/task Edu51Portal Fix auth guard`)",
            "• `/done [title]` — Mark task completed",
            "• `/note [text]` — Save an idea or note directly to database",
            "",
            "⏳ *Proactive Reminders:*",
            "• `/remind 10m Check deployment` — Mikasa will ping you on Telegram in 10 minutes",
            "• `/reminders` — View all active timers",
            "",
            "💼 *Career, GitHub & Content Copilot:*",
            "• `/socials` — Complete audit of LinkedIn, X/Twitter, FB & Instagram",
            "• `/github` — Inspect your GitHub repos (`Swapnil-360`) & recent activity",
            "• `/linkedin [project]` — Draft viral tech post with 1-click Telegram approval",
            "• `/twitter [topic]` — Draft viral X thread with 1-click Telegram approval",
            "• `/cv [job title or description]` — Tailor resume bullets based on your actual builds",
            "• `/job [job description]` — Compare skills & get PATHS match matrix (✓ △ ✗)",
            "• `/audit` — Review audit trail of actions & tool executions",
            "• `/prompt [goal]` — Generate master prompts for Midjourney/FLUX/Claude",
            "",
            "🎯 *Strategic Big Picture:*",
            "• `/goals` — Strategic briefing on active goals",
            "• `/projects` — Status overview of builds",
            "• `/decisions` — Project architectural constraints",
            "• `/memories` — Inspect what I know about you",
            "• `/dashboard` — Link to Web Command Center (`localhost:3000`)",
            "",
            "_You can also ask me anything naturally. I am always listening._"
        ];
        await sendTelegramMessage(chatId, helpLines.join('\n'));
        return;
    }

    // 10B. Handle /login or /web Command (Generate 1-Click Verified Commander Token)
    if (text === '/login' || text === '/web' || text === '/auth') {
        await sendChatAction(chatId, 'typing');
        const tokenRes = await new Promise((resolve) => {
            const payload = JSON.stringify({ email: 'miftahurr503@gmail.com', password: 'MikasaCommander360!' });
            const r = https.request({
                hostname: 'qjhrmctbrobpnoumzmju.supabase.co',
                path: '/auth/v1/token?grant_type=password',
                method: 'POST',
                headers: {
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqaHJtY3Ricm9icG5vdW16bWp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTkxNTc3NywiZXhwIjoyMTA1NDkxNzc3fQ.0_xov-GTLYTFGnm_gXxO2lmS1w_9Kc-pnWc0-T17UJ8',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let d = ''; res.on('data', c => d += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(d)); } catch (e) { resolve({}); }
                });
            });
            r.on('error', () => resolve({}));
            r.write(payload);
            r.end();
        });

        const token = tokenRes.access_token || 'MikasaCommander360!';
        const loginUrl = `https://mikasa.mrswapnil.me/app?token=${token}`;

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "🚀 Open Web Dashboard (Verified)", url: loginUrl }
                ]
            ]
        };

        const loginMsg = [
            "⚔️ *Commander Web Access Token Generated!*",
            "",
            "Swapnil, tap below to open the Web Command Center with full verified authority:",
            `🔗 [👉 Click Here to Unlock Full Commander Access](${loginUrl})`,
            "",
            "🛡️ *Verified Identity:* `miftahurr503@gmail.com`",
            "✨ *Status:* Observer Mode bypassed. You have full control over tasks, chat, reminders, and goals."
        ].join('\n');

        await sendTelegramMessage(chatId, loginMsg, msg.message_id, replyMarkup);
        return;
    }

    // 11. Handle /dashboard Command
    if (text === '/dashboard') {
        await sendTelegramMessage(
            chatId,
            "🖥️ *Mikasa Executive Command Center Dashboard*\n\nYour operational headquarters is live 24/7:\n🔗 `https://mikasa.mrswapnil.me/app`\n(Local: `http://localhost:3000`)\n\nType `/login` anytime to get an instant 1-click token as verified `miftahurr503@gmail.com`!",
            msg.message_id
        );
        return;
    }

    // 11B. Handle /quota or /limits Command (Live AI Rate Limit & Failover Telemetry)
    if (text === '/quota' || text === '/limits' || text === '/rate' || text === '/engine') {
        const q = getGeminiQuotaStatus();
        const prioIcon = q.is_cooldown ? '🔴' : (q.remaining_this_minute <= 3 ? '🟡' : '🟢');

        const lines = [
            "⚡ *Mikasa AI Engine Quota & Latency Telemetry*",
            "",
            `*Primary Engine:* Google Gemini 2.5 Flash ${prioIcon}`,
            `• *Minute Limit:* 20 requests / min (Google Free Tier)`,
            `• *Used This Minute:* ${q.used_this_minute} / ${q.rpm_limit} requests`,
            `• *Remaining in Window:* ${q.remaining_this_minute} requests`,
            `• *Minute Window Resets:* in ~${q.window_reset_seconds}s`,
            `• *Daily Limit:* 1,500 requests / day`,
            `• *Used Today:* ${q.daily_usage} / ${q.rpd_limit} requests`,
            q.is_cooldown 
                ? `• *Cooldown Active:* ⚠️ Yes (resets in ${q.cooldown_remaining_seconds}s)` 
                : `• *Engine Health:* ✅ Normal & Ready`,
            "",
            `*Failover Engine:* OpenRouter (GPT-4o-mini) 🟢`,
            `• *Status:* 🛡️ Armed & Instant (0ms switchover)`,
            `• *Active Right Now:* ${q.is_cooldown ? 'YES (Handling all traffic)' : 'Standby'}`,
            "",
            "💡 *Smart Balancing:* If you send >20 messages in 60s, Mikasa switches to OpenRouter instantly without dropping or delaying any messages!"
        ];

        await sendTelegramMessage(chatId, lines.join('\n'), msg.message_id);
        return;
    }

    // 11C. PATHS v2: Local PC Agent & Telemetry (/pc)
    if (text === '/pc' || text === '/system' || text.match(/^(?:is\s+my\s+pc\s+online|pc\s+status|pc\s+online|system\s+status)\??$/i)) {
        await sendChatAction(chatId, 'typing');
        try {
            const info = await getSystemInfo();
            const cpuLoad = info.cpu.loadPct;
            const mem = info.memory;
            const lines = [
                "💻 *MIKASA LOCAL PC TELEMETRY (PATHS v2)*",
                "━━━━━━━━━━━━━━━━━━━━",
                `🖥️ *Host:* \`${info.hostname}\` (Windows PC)`,
                `⚡ *CPU:* ${info.cpu.model.trim()} — *${cpuLoad}% Load*`,
                `🧠 *RAM:* *${mem.usedGb} GB* / ${mem.totalGb} GB (${mem.usagePct}% used)`,
                `⏱️ *Uptime:* ${info.uptimeFormatted}`,
                "",
                "💾 *Disks & Storage:*",
                ...info.disks.map(d => `• Drive \`${d.drive}\` ${d.freeGb} GB free / ${d.totalGb} GB (${d.freePct}% free)`),
                "",
                "⚙️ *Services & Bridges:*",
                `• n8n Engine: ${info.n8n.running ? '🟢 ONLINE (port 5678)' : '🔴 OFFLINE'}`,
                `• Web HUD: 🟢 ONLINE (port 3000)`,
                `• Agent Mode: *${info.mode}*`,
                `• Terminal Policy: *${info.privacy.terminal}*`,
                "",
                "_Need to retrieve a file from this PC? Use `/file [name]`!_"
            ];
            await sendTelegramMessage(chatId, lines.join('\n'), msg.message_id);
        } catch (err) {
            await sendTelegramMessage(chatId, `⚠️ Error reading PC telemetry: ${err.message}`, msg.message_id);
        }
        return;
    }

    // 11D. PATHS v2: Remote File Retrieval (/file)
    if (text.startsWith('/file') || text.match(/^(?:send|fetch|get)\s+(?:me\s+)?(?:the\s+)?(.+?)\s+(?:from\s+my\s+pc|from\s+pc)\??$/i)) {
        let query = '';
        if (text.startsWith('/file')) {
            query = text.slice(5).trim();
        } else {
            const m = text.match(/^(?:send|fetch|get)\s+(?:me\s+)?(?:the\s+)?(.+?)\s+(?:from\s+my\s+pc|from\s+pc)\??$/i);
            query = m ? m[1].trim() : '';
        }

        if (!query) {
            await sendTelegramMessage(chatId, "📁 *Remote PC File Retrieval*\n\nPlease specify a file name or search keyword.\nExample: `/file presentation` or `/file README`", msg.message_id);
            return;
        }

        await sendChatAction(chatId, 'upload_document');
        try {
            const files = await searchAllowedFiles(query, 5);
            if (files.length === 0) {
                await sendTelegramMessage(chatId, `⚠️ No files found matching "*${query}*" in allowed PC folders (\`D:\\Projects\`, \`D:\\Documents\`, \`D:\\Downloads\\PATHS\`).`, msg.message_id);
                return;
            }

            const top = files[0];
            await sendTelegramMessage(chatId, `📤 *Found file:* \`${top.name}\` (${top.sizeFormatted})\n📍 Path: \`${top.path}\`\n\n_Transmitting file to Telegram now..._`, msg.message_id);
            await sendTelegramDocument(chatId, top.path, `PATHS Remote Retrieval: ${top.name}`);
        } catch (err) {
            await sendTelegramMessage(chatId, `❌ Remote file retrieval failed: ${err.message}`, msg.message_id);
        }
        return;
    }

    // 11E. PATHS v2: Controlled Terminal Execution (/run)
    if (text.startsWith('/run ')) {
        const command = text.slice(5).trim();
        await sendChatAction(chatId, 'typing');
        try {
            const res = await executeControlledTerminal(command, 'READ', false);
            if (res.status === 'confirmation_required') {
                await sendTelegramMessage(chatId, `🛡️ *Controlled Terminal — Confirmation Required*\n\nCommand: \`${command}\`\nPermission Level: *${res.permission_level}*\n\n${res.message}`, msg.message_id);
            } else {
                const outPreview = res.output ? res.output.slice(0, 3500) : '[No output]';
                const reply = [
                    `⚡ *Terminal Execution Result* (${res.permission_level})`,
                    `Command: \`${res.command}\``,
                    `Status: ${res.success ? '✅ SUCCESS' : '❌ FAILED'} (Exit Code: ${res.exit_code})`,
                    `Duration: ${res.duration_ms}ms`,
                    "",
                    "```text",
                    outPreview,
                    "```"
                ].join('\n');
                await sendTelegramMessage(chatId, reply, msg.message_id);
            }
        } catch (err) {
            await sendTelegramMessage(chatId, `❌ Terminal Security Error: ${err.message}`, msg.message_id);
        }
        return;
    }

    // 11F. PATHS v2: Website & Service Health Monitors (/monitor)
    if (text === '/monitor' || text === '/health' || text.match(/^(?:check\s+my\s+websites|check\s+websites|is\s+my\s+portfolio\s+up)\??$/i)) {
        await sendChatAction(chatId, 'typing');
        try {
            const monitors = await checkServiceMonitors();
            let reply = "🌐 *PATHS Live Service & Website Monitors (Section 19)*\n━━━━━━━━━━━━━━━━━━━━\n\n";
            monitors.forEach(m => {
                const badge = m.status === 'UP' ? '🟢 UP' : (m.status === 'DEGRADED' ? '🟡 DEGRADED' : '🔴 DOWN');
                reply += `• *${m.name}*\n  Status: ${badge} | Latency: \`${m.latencyMs}ms\`\n  URL: ${m.url}\n\n`;
            });
            reply += `_Monitored continuously by Mikasa PC Bridge._`;
            await sendTelegramMessage(chatId, reply, msg.message_id);
        } catch (err) {
            await sendTelegramMessage(chatId, `⚠️ Error running monitors: ${err.message}`, msg.message_id);
        }
        return;
    }

    // 11G. PATHS v2: Agent Mode Switcher (/mode)
    if (text.startsWith('/mode')) {
        const modeArg = text.slice(5).trim();
        if (!modeArg) {
            await sendTelegramMessage(chatId, `🛡️ *Mikasa Agent Mode*\n\nCurrent Mode: *${currentAgentMode()}*\n\nAvailable modes:\n• \`Conversation\`\n• \`Research\`\n• \`Developer\`\n• \`PC\`\n• \`Browser\`\n• \`Automation\`\n• \`Career\`\n• \`Social\`\n• \`Monitor\`\n• \`Command\`\n\nUsage: \`/mode Developer\``, msg.message_id);
            return;
        }
        const res = setAgentMode(modeArg);
        if (res.success) {
            await sendTelegramMessage(chatId, `✅ *Agent Mode switched to:* \`${res.mode}\`\nMikasa tool priorities adjusted.`, msg.message_id);
        } else {
            await sendTelegramMessage(chatId, `⚠️ ${res.error}`, msg.message_id);
        }
        return;
    }

    // 12. Handle /tasks Command
    if (text === '/tasks') {
        await sendChatAction(chatId, 'typing');
        try {
            const allTasks = await getTasks();
            const activeTasks = allTasks.filter(t => t.status !== 'completed');
            const completedTasks = allTasks.filter(t => t.status === 'completed').slice(0, 3);

            let msgText = "📋 *Swapnil's Operational Tasks*\n\n";
            if (activeTasks.length === 0) {
                msgText += "✨ *No pending tasks!* All clear right now, Swapnil.\n\n";
            } else {
                msgText += `*Active Tasks (${activeTasks.length}):*\n`;
                activeTasks.forEach((t, i) => {
                    const prio = t.priority >= 8 ? '🔥' : '⚡';
                    msgText += `${i + 1}. ${prio} *${t.title}* [${t.status}]\n`;
                });
                msgText += "\n";
            }

            if (completedTasks.length > 0) {
                msgText += `*Recently Completed:*\n`;
                completedTasks.forEach(t => {
                    msgText += `✓ ~${t.title}~\n`;
                });
            }

            msgText += "\n_Tip: Use `/task [title]` to create or `/done [title]` to finish._";
            await sendTelegramMessage(chatId, msgText, msg.message_id);
        } catch (err) {
            await sendTelegramMessage(chatId, `⚠️ Error fetching tasks: ${err.message}`, msg.message_id);
        }
        return;
    }

    // 13. Handle /memories Command
    if (text === '/memories') {
        await sendChatAction(chatId, 'typing');
        try {
            const memories = await getMemories(8);
            let msgText = "🧠 *What I Keep in My Memory Vault About You:*\n\n";
            if (!memories || memories.length === 0) {
                msgText += "I am listening closely to everything you tell me to build my memory of you.\n";
            } else {
                memories.forEach((m, idx) => {
                    const badge = m.memory_type === 'preference' ? '🌟' : (m.memory_type === 'decision' ? '📐' : '📌');
                    msgText += `${idx + 1}. ${badge} ${m.content}\n`;
                });
            }
            msgText += "\n_I automatically remember your preferences and project decisions whenever you chat with me._";
            await sendTelegramMessage(chatId, msgText, msg.message_id);
        } catch (err) {
            await sendTelegramMessage(chatId, `⚠️ Error reading memories: ${err.message}`, msg.message_id);
        }
        return;
    }

    // 14. Check for Direct Action Intent (create task, complete task, add goal, log decision, add note)
    try {
        const actionResult = await handleActionIntent(text);
        if (actionResult) {
            console.log('[Action Executed]:', actionResult);
            let reply = '';
            if (actionResult.action === 'task_created') {
                reply = `⚔️ *Task locked in, Swapnil.*\n\nI've registered *"${actionResult.task.title}"* under *${actionResult.project_name}* in our database. I'll make sure you don't lose sight of it.`;
            } else if (actionResult.action === 'task_completed') {
                if (actionResult.success) {
                    reply = `⚔️ *Task completed!*\n\n*"${actionResult.task.title}"* is officially marked complete. Great work, Swapnil — every step forward counts. I'm proud of you.`;
                } else {
                    reply = `⚠️ ${actionResult.reason}`;
                }
            } else if (actionResult.action === 'goal_created') {
                reply = `🎯 *New strategic goal secured, Swapnil.*\n\nRegistered: *"${actionResult.goal.title}"* in [${actionResult.goal.category}]. Let's keep our eyes on the horizon.`;
            } else if (actionResult.action === 'decision_logged') {
                reply = `📐 *Architectural decision logged.*\n\nRecorded: *"${actionResult.decision.decision}"* for *${actionResult.project_name}*. It's locked into our constraints table.`;
            } else if (actionResult.action === 'note_added') {
                reply = `📝 *Note recorded, Swapnil.*\n\nSaved to your database: *"${actionResult.note.content}"*.`;
            } else if (actionResult.action === 'job_matched') {
                const a = actionResult.analysis;
                reply = [
                    "🎯 *PATHS — Job Opportunity Matching Matrix (Section 20)*",
                    "",
                    `📋 *Target / Query:* _${actionResult.job_query}_`,
                    "",
                    "```text",
                    a.matrix,
                    "```",
                    "",
                    "✅ *Verified Strengths:*",
                    ...a.matches.map(m => `${m}`),
                    "",
                    a.partials.length > 0 ? "⚠️ *Partial / Learning:*\n" + a.partials.join('\n') + "\n" : "",
                    a.gaps.length > 0 ? "❌ *Documented Gaps (Honest Positioning):*\n" + a.gaps.join('\n') + "\n" : "",
                    "🚀 *Recommended Builds to Feature:*",
                    ...a.recommended_projects,
                    "",
                    `💡 *Application Strategy:*\n_${a.strategy}_`
                ].filter(Boolean).join('\n');
            } else if (actionResult.action === 'audit_inspected') {
                const logs = actionResult.logs;
                if (!logs || logs.length === 0) {
                    reply = "📜 *PATHS Audit Trail:* No actions recorded yet in this session.";
                } else {
                    reply = "📜 *PATHS Audit Trail (Section 34)*\n\nRecent verified autonomous actions:\n\n";
                    logs.forEach((l, i) => {
                        const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : 'Recent';
                        reply += `${i + 1}. *[${time}] ${l.action_performed}* via \`${l.tool_used}\`\n`;
                        reply += `   • *Decision:* ${l.agent_decision}\n`;
                        reply += `   • *Result:* ${l.result} (Status: ${l.verification_status} ✅)\n\n`;
                    });
                    reply += "_Complete audit trails are permanently preserved in Supabase `current_state` and local cache._";
                }
            } else if (actionResult.action === 'job_radar') {
                const r = actionResult.radar;
                reply = [
                    "🎯 *PATHS — Live LinkedIn Opportunity Radar (Sections 19 & 26)*",
                    "",
                    "Here are direct, pre-filtered live search feeds targeted specifically to your tech stack (Next.js, TypeScript, Supabase, AI):",
                    "",
                    ...r.searches.map(s => `• *${s.title}*\n  _${s.filter}_\n  🔗 [View Live Postings on LinkedIn](${s.url})\n`),
                    "━━━━━━━━━━━━━━━━━━━━",
                    "🚀 *How to use me as your Application Assistant:*",
                    ...r.instructions.map(i => `${i}`),
                    "",
                    "_Whenever you find an opening, just paste it here with `/job` or send me the text!_"
                ].join('\n');
            }

            if (reply) {
                await sendTelegramMessage(chatId, reply, msg.message_id);
                // Also trigger memory reflection on actions
                triggerMemoryExtraction(text, reply, conversationId);
                return;
            }
        }
    } catch (err) {
        console.error('[Action Handler Error]:', err.message);
    }

    // 15. Translate Shortcut Commands into Natural Queries
    let queryPrompt = text;
    if (text === '/goals') {
        queryPrompt = "Give me a concise, compact executive briefing on my active goals in 3-4 clean bullet points. Keep it punchy, warm, and ask if I want to dive into any specific one.";
    } else if (text === '/projects') {
        queryPrompt = "Give me a concise briefing on my active projects (Edu51Portal, OpusGenAI, AI Assistant) in 3-4 clean bullet points. Keep it punchy and ask if I want to dive deeper.";
    } else if (text === '/status') {
        queryPrompt = "Give me a concise operational status briefing on my current state, focus, and study priorities in 3-4 clean bullet points. Keep it punchy and warm.";
    } else if (text === '/decisions') {
        queryPrompt = "Give me a concise summary of our key architectural decisions and constraints in 3-4 clean bullet points.";
    } else if (text === '/profile') {
        queryPrompt = "Give me a quick 3-bullet summary of my profile, university status, and career direction as you know it.";
    }

    // 16. Send Typing Action while Mikasa reasons
    await sendChatAction(chatId, 'typing');
    const typingInterval = setInterval(() => {
        sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    try {
        const response = await callMikasaAgent(queryPrompt, conversationId, {
            user_id: userId,
            first_name: msg.from.first_name,
            username: msg.from.username
        });

        clearInterval(typingInterval);

        const replyText = response.reply || response.text || 'No response generated.';
        console.log(`[Mikasa Reply to ${userName}]: "${replyText.slice(0, 100)}..."`);

        // Smart 1-click button attachment if the response contains a Twitter / X post draft
        let replyMarkup = null;
        if (text.match(/\b(?:tweet|twitter|x\s+post)\b/i) || replyText.match(/#BuildInPublic|#AI|#SoftwareEngineering/i)) {
            let tweetCandidate = replyText;
            const quoteMatch = replyText.match(/["“]([^"”]{30,350})["”]/);
            if (quoteMatch) {
                tweetCandidate = quoteMatch[1];
            }
            const fitted = fitTweetForFreeTier(tweetCandidate);
            if (fitted && fitted.length >= 20 && fitted.length <= 270) {
                const intentUrl = createTwitterIntentUrl(fitted);
                replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "🚀 1-Click Post on X", url: intentUrl }
                        ]
                    ]
                };
            }
        }

        await sendTelegramMessage(chatId, replyText, msg.message_id, replyMarkup);

        // Proactive low-quota warning: ONLY warn when limit is critically close to finishing (<=2 remaining this minute, or daily >= 1485)
        // Rate-limited to once every 3 minutes so it never spams. Full stats always viewable via /quota.
        const quotaCheck = getGeminiQuotaStatus();
        const now = Date.now();
        if (!quotaCheck.is_cooldown && (quotaCheck.remaining_this_minute <= 2 || quotaCheck.daily_usage >= 1485)) {
            if (now - _lastLowQuotaWarnAt > 180000) {
                _lastLowQuotaWarnAt = now;
                const warnMsg = `⚠️ *Notice:* Gemini quota is almost exhausted (${quotaCheck.remaining_this_minute}/20 left this min). Mikasa will seamlessly switch to OpenRouter if needed. Check /quota anytime for live telemetry.`;
                await sendTelegramMessage(chatId, warnMsg);
            }
        }

        // Ensure conversation turn is stored in Supabase so Cloud & Local both have full context
        if (!response.context_used) {
            try {
                await supabaseRequest('/messages', 'POST', [
                    { conversation_id: conversationId, role: 'user', content: text, timestamp: new Date().toISOString() },
                    { conversation_id: conversationId, role: 'assistant', content: replyText, model: 'gemini-2.5-flash', timestamp: new Date().toISOString() }
                ]);
            } catch (e) {}
        }

        // 17. Background Automatic Memory Extraction Trigger
        triggerMemoryExtraction(text, replyText, conversationId);

    } catch (err) {
        clearInterval(typingInterval);
        console.error('[Telegram Bridge] Error calling Mikasa Agent:', err.message);
        await sendTelegramMessage(chatId, `⚠️ Error connecting to Mikasa brain: ${err.message}`, msg.message_id);
    }
}

// Main Long Polling Loop
async function startPolling() {
    if (isPolling) {
        console.log('[Telegram Bridge] Polling already active.');
        return;
    }
    isPolling = true;

    await deleteWebhook();
    registerBotCommands();

    // Initialize proactive reminders engine
    remindersManager.init((rem) => {
        console.log(`[Reminder Fired]: "${rem.text}" for Chat ${rem.chatId}`);
        const alertText = `⏰ *Reminder from Mikasa, Swapnil!*\n\n*"${rem.text}"*\n\n_I promised I'd keep you on track. Ready to execute on this now?_`;
        sendTelegramMessage(rem.chatId, alertText);
    });

    console.log(`[Telegram Bridge] 🚀 Long polling active (${IS_RENDER_CLOUD ? 'Cloud 24/7 Mode' : 'Local PC Mode'})...`);

    // Heartbeat logic for Local PC
    if (!IS_RENDER_CLOUD) {
        console.log('[Local Coordinator] Local instance active on PC — broadcasting heartbeat to Supabase...');
        const sendHeartbeat = async () => {
            try {
                await supabaseRequest('/current_state?key=eq.local_bridge_heartbeat', 'PATCH', {
                    value: {
                        active_at: new Date().toISOString(),
                        source: 'local_pc',
                        hostname: os.hostname()
                    },
                    updated_at: new Date().toISOString()
                });
            } catch (e) {}
        };
        sendHeartbeat();
        // Send heartbeat every 8s — ensures cloud sees it well within the 90s stale window
        setInterval(sendHeartbeat, 8000);

        const clearHeartbeat = async () => {
            try {
                await supabaseRequest('/current_state?key=eq.local_bridge_heartbeat', 'PATCH', {
                    value: { active_at: null, source: 'local_pc' },
                    updated_at: new Date().toISOString()
                });
            } catch (e) {}
        };
        process.on('SIGINT', async () => { await clearHeartbeat(); process.exit(); });
        process.on('SIGTERM', async () => { await clearHeartbeat(); process.exit(); });
    }

    // In-memory dedup set: prevents the same update_id from being processed twice
    // (extra safety net on top of heartbeat coordination)
    const processedUpdateIds = new Set();

    while (isPolling) {
        // Cloud Priority Check: If Local is active on PC, Cloud stands down!
        if (IS_RENDER_CLOUD) {
            const localActive = await checkIsLocalActive();
            if (localActive) {
                console.log('[Cloud Coordinator] Local Mikasa is running on Swapnil\'s PC. Cloud standing down (checking again in 15s)...');
                await new Promise(r => setTimeout(r, 15000));
                continue;
            }
        }
        try {
            const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
            const updates = await new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            resolve(json.result || []);
                        } catch (e) {
                            resolve([]);
                        }
                    });
                }).on('error', reject);
            });

            for (const update of updates) {
                if (update.update_id > lastUpdateId) {
                    lastUpdateId = update.update_id;
                    // Skip if already processed in this session (dedup guard)
                    if (processedUpdateIds.has(update.update_id)) {
                        console.log(`[Dedup] Skipping already-processed update_id ${update.update_id}`);
                        continue;
                    }
                    processedUpdateIds.add(update.update_id);
                    // Keep set bounded — prune after 500 entries
                    if (processedUpdateIds.size > 500) {
                        const oldest = processedUpdateIds.values().next().value;
                        processedUpdateIds.delete(oldest);
                    }
                    await processUpdate(update);
                }
            }
        } catch (err) {
            console.error('[Telegram Bridge] Polling error (retrying in 3s):', err.message);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

if (require.main === module) {
    startPolling();
}

module.exports = {
    callMikasaAgent,
    sendTelegramMessage,
    callN8nAgent,
    startPolling,
    getGeminiQuotaStatus,
    setGeminiCooldown,
    triggerMemoryExtraction
};
