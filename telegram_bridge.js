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
    generateOptimizedPrompt,
    generateTwitterThread,
    auditSocialMedia,
    getTasks,
    getGoals,
    getProjects,
    getDecisions,
    getMemories,
    matchProject,
    supabaseRequest
} = require('./actions_handler');
const {
    publishToLinkedIn,
    publishToTwitter,
    getTwitterProfile,
    publishToFacebook,
    humanizeContent
} = require('./social_publisher');

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

const BOT_TOKEN = getEnv('TELEGRAM_BOT_TOKEN');
if (!BOT_TOKEN) {
    console.error('CRITICAL: TELEGRAM_BOT_TOKEN is missing from environment variables!');
}
const N8N_WEBHOOK_URL = getEnv('N8N_WEBHOOK_URL') || 'http://localhost:5678/webhook/swapnil-ai';
const MEMORY_WEBHOOK_URL = getEnv('MEMORY_WEBHOOK_URL') || 'http://localhost:5678/webhook/extract-memory';
const SWAPNIL_USER_ID = Number(getEnv('SWAPNIL_USER_ID')) || 7112137739;
const IS_RENDER_CLOUD = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.IS_CLOUD || process.env.IS_RENDER_CLOUD);

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
        { command: 'prompt', description: 'Generate master prompt for AI/Image' },
        { command: 'goals', description: 'Briefing on strategic goals' },
        { command: 'projects', description: 'Briefing on active projects' },
        { command: 'decisions', description: 'Confirmed architectural decisions' },
        { command: 'memories', description: 'View memory vault items' },
        { command: 'dashboard', description: 'Link to Web Command Center' },
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
            supabaseRequest('/memories?select=content,memory_type,importance&order=created_at.desc&limit=8', 'GET'),
            supabaseRequest(`/messages?conversation_id=eq.${conversationId}&order=created_at.desc&limit=6`, 'GET')
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
            memoriesStr = memRes.value.map(m => `- [Memory]: ${m.content}`).join('\n');
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
RELEVANT RETRIEVED MEMORIES
==============================
${memoriesStr || 'No matching memories found'}

==============================
RECENT CONVERSATION HISTORY
==============================
${recentMsgsStr || 'No previous messages in this session.'}

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
   - Summarize key points with high signal-to-noise ratio.`;
}

// Call Google Gemini API
function callGeminiApi(systemPrompt, userMessage, apiKey) {
    return new Promise((resolve, reject) => {
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

        const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];

        function tryModel(idx) {
            if (idx >= models.length) return reject(new Error('All Gemini models failed'));
            const model = models[idx];
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
                            console.warn(`[Gemini ${model} warning]:`, json.error.message);
                            return tryModel(idx + 1);
                        }
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) resolve(text);
                        else tryModel(idx + 1);
                    } catch (e) {
                        tryModel(idx + 1);
                    }
                });
            });

            req.on('error', () => tryModel(idx + 1));
            req.write(payload);
            req.end();
        }

        tryModel(0);
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

// Call n8n webhook helper
function callN8nAgent(message, conversationId, userContext, url) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            message: message,
            conversation_id: conversationId,
            channel: 'telegram',
            user: userContext
        });

        const req = http.request(url, {
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
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    resolve({ reply: data || 'Received empty response from Mikasa.' });
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// Master Autonomous Mikasa Agent Caller (Cloud-first with local fallback)
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

    // 2. Direct Gemini 2.5/1.5 Flash Cloud Integration
    if (geminiKey) {
        try {
            console.log('[Mikasa Agent] Calling Gemini Cloud directly with full profile & grounding...');
            const reply = await callGeminiApi(systemPrompt, message, geminiKey);
            if (reply) return { reply };
        } catch (err) {
            console.warn('[Direct Gemini Call Failed, trying fallback]:', err.message);
        }
    }

    // 3. Direct OpenRouter Cloud Integration
    if (openrouterKey) {
        try {
            console.log('[Mikasa Agent] Calling OpenRouter Cloud directly...');
            const reply = await callOpenRouterApi(systemPrompt, message, openrouterKey);
            if (reply) return { reply };
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

// Asynchronous background memory extraction trigger (fire-and-forget)
function triggerMemoryExtraction(userMessage, assistantReply, conversationId) {
    try {
        const payload = JSON.stringify({
            user_message: userMessage,
            assistant_reply: assistantReply,
            conversation_id: conversationId
        });

        const req = http.request(MEMORY_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('[Auto-Memory Extractor] Result:', data);
                }
            });
        });

        req.on('error', (err) => {
            console.warn('[Auto-Memory Extractor Warning]', err.message);
        });

        req.write(payload);
        req.end();
    } catch (e) {
        console.warn('[Auto-Memory Trigger Error]', e.message);
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

    // Handle Twitter Thread Approval
    if (data.startsWith('approve_twitter_')) {
        const threadId = data.replace('approve_twitter_', '');
        const thread = activePostDrafts.get(threadId);

        await answerCallbackQuery(id, "Publishing to X / Twitter...");

        if (thread) {
            const pubResult = await publishToTwitter(thread.tweets);
            let updatedText = (callbackQuery.message.text || '') + "\n\n━━━━━━━━━━━━━━━━━━━━\n";
            if (pubResult.has_direct_api && pubResult.success) {
                updatedText += `🚀 *STATUS: PUBLISHED LIVE ON X!*\n_Your thread is live: [View Thread](${pubResult.url})_`;
            } else if (pubResult.share_url) {
                updatedText += `✅ *STATUS: APPROVED & READY*\n_${pubResult.message}_\n\n🔗 [👉 Tap to Publish on X](${pubResult.share_url})`;
            } else {
                updatedText += `⚠️ *STATUS: ERROR*\n_${pubResult.error || 'Failed to post'}_`;
            }
            await editTelegramMessage(chatId, messageId, updatedText);
        }
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

    // Handle Quick Draft Twitter Thread from Audit Card
    if (data === 'draft_twitter_quick') {
        await answerCallbackQuery(id, "🐦 Drafting X thread...");
        const thread = generateTwitterThread('Edu51Portal');
        const threadId = 'thread_' + Date.now();
        activePostDrafts.set(threadId, thread);

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "✅ Approve & Queue", callback_data: `approve_twitter_${threadId}` }
                ]
            ]
        };
        let threadMsg = `🐦 *X / Twitter Thread Suggestion:* *${thread.title}*\n\n`;
        thread.tweets.forEach(t => threadMsg += `${t}\n\n`);
        threadMsg += `_Click Approve below to save into your content pipeline._`;
        await sendTelegramMessage(chatId, threadMsg, null, replyMarkup);
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

// Process single Telegram message update
async function processUpdate(update) {
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

    // 4C. Handle Social Media Audit Intent ("checkout my social media", "check my socials", "review my twitter", etc.)
    const isSocialAudit = text.match(/^\/(?:socials?|socialmedia|audit)\b/i) || 
                          ((text.match(/social|socials|social media|online presence|brand|profile|profiles|linkedin|twitter|\bx\b|facebook|fb|instagram|insta|ig/i)) && 
                           (text.match(/check|checkout|review|audit|see|view|inspect|look|status|examine/i)));

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
            "• *Status:* Full-Stack & AI Systems Builder",
            "• *Headline Upgrade:* _\"Full-Stack Developer & AI Systems Builder | Next.js, TypeScript, Supabase | Creator of Edu51Portal (500+ Users)\"_",
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

    // 5B. Handle /twitter or /x Command (Draft Twitter Thread)
    const twitterMatch = text.match(/^(?:\/twitter|\/x|suggest\s+tweet|draft\s+tweet|tweet\s+thread)(?:\s+(.+))?$/i);
    if (twitterMatch) {
        await sendChatAction(chatId, 'typing');
        const topic = twitterMatch[1] || 'Edu51Portal';
        const thread = generateTwitterThread(topic);
        const threadId = 'thread_' + Date.now();
        activePostDrafts.set(threadId, thread);

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: "✅ Approve & Post to X", callback_data: `approve_twitter_${threadId}` }
                ]
            ]
        };

        let threadMsg = `🐦 *X / Twitter Thread Suggestion (Humanized):* *${thread.title}*\n\n`;
        thread.tweets.forEach(t => threadMsg += `${t}\n\n`);
        threadMsg += `_Click Approve below to publish to your X profile._`;
        await sendTelegramMessage(chatId, threadMsg, msg.message_id, replyMarkup);
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

    // 11. Handle /dashboard Command
    if (text === '/dashboard') {
        await sendTelegramMessage(
            chatId,
            "🖥️ *Mikasa Executive Command Center Dashboard*\n\nYour private operational headquarters is running locally:\n🔗 `http://localhost:3000`\n\nFeatures available:\n• Real-time Live Chat with Mikasa\n• Interactive Strategic Goals Tracker\n• Real-time Task Board with Completion Toggles\n• Project Decisions & Constraints Matrix\n• Neural Memory Vault Viewer",
            msg.message_id
        );
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
        await sendTelegramMessage(chatId, replyText, msg.message_id);

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
    await deleteWebhook();
    registerBotCommands();

    // Initialize proactive reminders engine
    remindersManager.init((rem) => {
        console.log(`[Reminder Fired]: "${rem.text}" for Chat ${rem.chatId}`);
        const alertText = `⏰ *Reminder from Mikasa, Swapnil!*\n\n*"${rem.text}"*\n\n_I promised I'd keep you on track. Ready to execute on this now?_`;
        sendTelegramMessage(rem.chatId, alertText);
    });

    console.log(`[Telegram Bridge] 🚀 Long polling active (${IS_RENDER_CLOUD ? 'Cloud 24/7 Mode' : 'Local PC Mode'})...`);
    isPolling = true;

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
        setInterval(sendHeartbeat, 10000);

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

    // Function for Cloud to check if Local is active
    async function checkIsLocalActive() {
        if (!IS_RENDER_CLOUD) return false;
        try {
            const res = await supabaseRequest('/current_state?key=eq.local_bridge_heartbeat', 'GET');
            if (res && res[0] && res[0].value && res[0].value.active_at) {
                // Must be specifically stamped by Swapnil's PC
                if (res[0].value.source !== 'local_pc' || res[0].value.hostname !== 'Swapnil-PC') {
                    return false;
                }
                const diff = Date.now() - new Date(res[0].value.active_at).getTime();
                return diff < 30000; // Local sent a heartbeat within the last 30s
            }
        } catch (e) {}
        return false;
    }

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
                    await processUpdate(update);
                }
            }
        } catch (err) {
            console.error('[Telegram Bridge] Polling error (retrying in 3s):', err.message);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

startPolling();
