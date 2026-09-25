const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const remindersManager = require('../reminders_manager');
const {
    handleActionIntent,
    getTasks,
    createTask,
    completeTask,
    getGoals,
    createGoal,
    getProjects,
    getDecisions,
    logDecision,
    getMemories,
    clearChatHistory,
    fetchGitHubRepos,
    generateLinkedInDraft,
    generateTwitterThread,
    generateSingleTweet,
    auditSocialMedia,
    tailorCvForJob,
    generateLinkedInJobRadar,
    fetchLiveLinkedInJobs,
    fetchCryptoSourcingRadar,
    generateOptimizedPrompt,
    addNote,
    supabaseRequest
} = require('../actions_handler');
const {
    publishPost,
    publishToLinkedIn,
    publishToTwitter,
    publishToFacebook,
    humanizeContent,
    fitTweetForFreeTier,
    createTwitterIntentUrl
} = require('../social_publisher');
const {
    getSystemInfo,
    searchAllowedFiles,
    executeControlledTerminal,
    checkServiceMonitors,
    privacyControls,
    updatePrivacyControls,
    currentAgentMode,
    setAgentMode,
    openBrowserUrl,
    launchDesktopApp,
    openLocalFolder
} = require('../local_pc_bridge');

const COMMANDER_EMAIL = process.env.COMMANDER_EMAIL || 'miftahurr503@gmail.com';
const COMMANDER_PASSKEY = process.env.COMMANDER_PASSKEY || 'MikasaCommander360!';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqaHJtY3Ricm9icG5vdW16bWp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTkxNTc3NywiZXhwIjoyMTA1NDkxNzc3fQ.0_xov-GTLYTFGnm_gXxO2lmS1w_9Kc-pnWc0-T17UJ8';

function getSessionUuid(id = 'web_commander') {
    const h = crypto.createHash('md5').update('web_' + id).digest('hex');
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
}

function getGeminiApiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
    try {
        const envPath = path.join(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(/GEMINI_API_KEY=([^\r\n]+)/);
            if (match) return match[1].trim();
        }
    } catch (e) {}
    return null;
}

function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitDepth = 16) {
    const dataLen = pcmBuffer.length;
    const buffer = Buffer.alloc(44 + dataLen);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLen, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitDepth / 8), 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLen, 40);
    pcmBuffer.copy(buffer, 44);
    return buffer;
}

function synthesizeGeminiVoice(text, voiceName = 'Kore') {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return Promise.reject(new Error('GEMINI_API_KEY not configured'));

    return new Promise((resolve, reject) => {
        const ttsPrompt = `Read the following text directly as audio: ${text}`;
        const payload = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: ttsPrompt }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voiceName
                        }
                    }
                }
            }
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 10000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) return reject(new Error(json.error.message || 'Gemini TTS error'));
                    const base64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                    if (!base64) return reject(new Error('No audio data returned'));
                    const pcm = Buffer.from(base64, 'base64');
                    const wav = pcmToWav(pcm, 24000, 1, 16);
                    resolve(wav);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Gemini TTS timed out'));
        });
        req.write(payload);
        req.end();
    });
}

// Verify if the incoming HTTP request is authenticated as Commander
async function verifyCommanderRequest(req) {
    // 0. Auto-authenticate requests originating on localhost / loopback
    const remoteIp = req.socket ? req.socket.remoteAddress : '';
    const hostHeader = req.headers['host'] || '';
    if ((remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1') &&
        (hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1'))) {
        return { isCommander: true, user: { email: COMMANDER_EMAIL, name: 'Md. Miftahur Rahman Swapnil (Local PC)' } };
    }

    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
    } else if (req.headers['x-commander-token']) {
        token = req.headers['x-commander-token'].trim();
    }

    // Direct passkey match
    if (token === COMMANDER_PASSKEY || req.headers['x-commander-passkey'] === COMMANDER_PASSKEY) {
        return { isCommander: true, user: { email: COMMANDER_EMAIL, name: 'Md. Miftahur Rahman Swapnil' } };
    }

    if (!token) return { isCommander: false };

    // Verify token with Supabase Auth
    return new Promise((resolve) => {
        const authReq = https.request({
            hostname: 'qjhrmctbrobpnoumzmju.supabase.co',
            path: '/auth/v1/user',
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const user = JSON.parse(data);
                        if (user && user.email && user.email.toLowerCase() === COMMANDER_EMAIL.toLowerCase()) {
                            return resolve({ isCommander: true, user });
                        }
                    } catch (e) {}
                }
                resolve({ isCommander: false });
            });
        });
        authReq.on('error', () => resolve({ isCommander: false }));
        authReq.end();
    });
}

const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = 'http://localhost:5678/webhook/swapnil-ai';
const MEMORY_WEBHOOK_URL = 'http://localhost:5678/webhook/extract-memory';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp'
};

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, statusCode, data) {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-commander-token, x-commander-passkey'
    });
    res.end(payload);
}

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
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => console.log('[Dashboard Auto-Memory]:', d));
        });
        req.on('error', () => {});
        req.write(payload);
        req.end();
    } catch (e) {}
}

const server = http.createServer(async (req, res) => {
    // CORS headers for preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-commander-token, x-commander-passkey'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = parsedUrl.pathname;

    try {
        // Helper to enforce Commander-only access on mutating actions
        const requireCommander = async () => {
            const auth = await verifyCommanderRequest(req);
            if (!auth.isCommander) {
                sendJson(res, 403, {
                    success: false,
                    error: "Observer Mode: Only authorized Commander can execute actions or modify state.",
                    public_observer: true
                });
                return false;
            }
            return true;
        };

        // --- AUTH ROUTES ---

        // Commander Login API
        if (pathname === '/api/auth/login' && req.method === 'POST') {
            const body = await parseBody(req);
            const passkey = (body.passkey || body.password || '').trim();
            const email = (body.email || '').trim().toLowerCase();

            // Direct passkey check (MikasaCommander360! allows instant 1-click unlock from landing page)
            if (passkey === COMMANDER_PASSKEY) {
                return sendJson(res, 200, {
                    success: true,
                    access_token: COMMANDER_PASSKEY,
                    user: {
                        email: COMMANDER_EMAIL,
                        name: 'Md. Miftahur Rahman Swapnil',
                        role: 'commander'
                    }
                });
            }

            if (email && email !== COMMANDER_EMAIL.toLowerCase()) {
                return sendJson(res, 403, {
                    success: false,
                    error: "Access restricted. Invalid commander credentials."
                });
            }

            // Verify with Supabase Auth
            const payload = JSON.stringify({ email, password: passkey });
            const tokenRes = await new Promise((resolve) => {
                const r = https.request({
                    hostname: 'qjhrmctbrobpnoumzmju.supabase.co',
                    path: '/auth/v1/token?grant_type=password',
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                }, (res) => {
                    let d = ''; res.on('data', c => d += c);
                    res.on('end', () => {
                        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch (e) { resolve({ status: res.statusCode }); }
                    });
                });
                r.on('error', () => resolve({ status: 500 }));
                r.write(payload);
                r.end();
            });

            if (tokenRes.status === 200 && tokenRes.body?.access_token) {
                return sendJson(res, 200, {
                    success: true,
                    access_token: tokenRes.body.access_token,
                    user: tokenRes.body.user
                });
            } else {
                return sendJson(res, 401, {
                    success: false,
                    error: "Invalid commander credentials. Passkey or password rejected."
                });
            }
        }

        // Verify Session / Token API
        if (pathname === '/api/auth/verify' && req.method === 'GET') {
            const auth = await verifyCommanderRequest(req);
            return sendJson(res, 200, {
                isCommander: auth.isCommander,
                commander_email: COMMANDER_EMAIL,
                user: auth.user || null
            });
        }

        // --- API ROUTES ---

        // System Status
        if (pathname === '/api/status' && req.method === 'GET') {
            let quota = null;
            try {
                const { getGeminiQuotaStatus } = require('../telegram_bridge');
                quota = getGeminiQuotaStatus();
            } catch (e) {}

            return sendJson(res, 200, {
                status: 'operational',
                agent: 'Mikasa Ackerman',
                primary_llm: 'Google Gemini 2.5 Flash',
                fallback_llm: 'OpenRouter GPT-4o-mini',
                embeddings: 'OpenRouter text-embedding-3-small (1536-dim)',
                channels: ['telegram (@mikasa_360_bot)', 'web_command_center'],
                supabase_status: 'connected',
                uptime: process.uptime(),
                quota: quota
            });
        }

        // Live Gemini Quota & Failover Telemetry API
        if (pathname === '/api/quota' && req.method === 'GET') {
            try {
                const { getGeminiQuotaStatus } = require('../telegram_bridge');
                return sendJson(res, 200, getGeminiQuotaStatus());
            } catch (e) {
                return sendJson(res, 200, {
                    primary: 'Google Gemini 2.5 Flash',
                    fallback: 'OpenRouter (GPT-4o-mini)',
                    rpm_limit: 20,
                    rpd_limit: 1500,
                    remaining_this_minute: 20,
                    is_cooldown: false,
                    status: 'ready'
                });
            }
        }

        // GitHub Repos API
        if (pathname === '/api/github' && req.method === 'GET') {
            const repos = await fetchGitHubRepos('Swapnil-360');
            return sendJson(res, 200, repos);
        }

        // Reminders API
        if (pathname === '/api/reminders' && req.method === 'GET') {
            const active = remindersManager.getActiveReminders();
            return sendJson(res, 200, active);
        }
        if (pathname === '/api/reminders' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const created = remindersManager.addReminder(body.text, body.time_str || '15m', 7112137739);
            return sendJson(res, 201, created);
        }

        // Social Media Audit API
        if (pathname === '/api/socials' && req.method === 'GET') {
            const audit = auditSocialMedia();
            return sendJson(res, 200, audit);
        }
        if (pathname === '/api/socials/audit' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const audit = auditSocialMedia(body.platform || null);
            return sendJson(res, 200, audit);
        }

        // Twitter Thread API
        if (pathname === '/api/twitter/thread' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const thread = generateTwitterThread(body.topic || 'Edu51Portal');
            return sendJson(res, 200, thread);
        }

        // Twitter Single Draft API (Strict Free Tier <= 270 chars + 1-Click Link)
        if (pathname === '/api/twitter/draft' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const draft = generateSingleTweet(body.topic || 'Mikasa');
            const fitted = fitTweetForFreeTier(draft.tweet);
            const intentUrl = createTwitterIntentUrl(fitted);
            return sendJson(res, 200, {
                topic: draft.topic,
                title: draft.title,
                raw_tweet: draft.tweet,
                tweet: fitted,
                char_count: fitted.length,
                max_chars: 280,
                free_tier_safe: fitted.length <= 270,
                intent_url: intentUrl
            });
        }

        // LinkedIn Draft API
        if (pathname === '/api/linkedin/draft' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const draft = generateLinkedInDraft(body.topic || 'Edu51Portal');
            draft.content = humanizeContent(draft.content);
            return sendJson(res, 200, draft);
        }

        // Facebook Draft API
        if (pathname === '/api/facebook/draft' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const topic = body.topic || 'Edu51Portal';
            const raw = `🚀 Edu51Portal Update for BUBT CSE 51st Intake!\n\nAll lecture slides, previous exam questions, and lab guides are updated for ${topic}. Fast, centralized, and sub-second access.\n\nCheck it out at mrswapnil.me! Let me know if any resources need updating! 👇`;
            const content = humanizeContent(raw);
            return sendJson(res, 200, { topic, content });
        }

        // Social Media Direct Publish API (LinkedIn, Twitter, Facebook)
        if (pathname === '/api/socials/publish' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const result = await publishPost(body.platform, body.content);
            return sendJson(res, 200, result);
        }

        // CV Tailoring API
        if (pathname === '/api/cv/tailor' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const guide = tailorCvForJob(body.job_description || 'Fullstack Software Engineer');
            return sendJson(res, 200, guide);
        }

        // Live Crypto Sourcing & Discovery Radar API
        if (pathname === '/api/crypto/radar' && req.method === 'GET') {
            try {
                const radar = await fetchCryptoSourcingRadar();
                return sendJson(res, 200, radar);
            } catch (err) {
                return sendJson(res, 500, { error: err.message });
            }
        }

        // Live LinkedIn Jobs & Career Radar API
        if (pathname === '/api/career/jobs' && req.method === 'GET') {
            const q = parsedUrl.searchParams.get('q') || 'Frontend Developer Next.js';
            const loc = parsedUrl.searchParams.get('loc') || 'Dhaka';
            const radar = await generateLinkedInJobRadar(q, loc);
            return sendJson(res, 200, radar);
        }

        // Master Prompt API
        if (pathname === '/api/prompt/generate' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const prompt = generateOptimizedPrompt(body.goal || 'General architecture');
            return sendJson(res, 200, prompt);
        }

        // Clear Chat API
        if (pathname === '/api/clear' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const convId = getSessionUuid(body.conversation_id || 'commander_session');
            await clearChatHistory(convId);
            return sendJson(res, 200, { success: true, message: 'Chat history cleared' });
        }

        // Goals API
        if (pathname === '/api/goals' && req.method === 'GET') {
            const goals = await getGoals();
            return sendJson(res, 200, goals);
        }
        if (pathname === '/api/goals' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const created = await createGoal(body.title, body.category || 'Career');
            return sendJson(res, 201, created);
        }

        // Tasks API
        if (pathname === '/api/tasks' && req.method === 'GET') {
            const tasks = await getTasks();
            return sendJson(res, 200, tasks);
        }
        if (pathname === '/api/tasks' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const created = await createTask(body.title, body.project_hint || null, body.priority || 5);
            return sendJson(res, 201, created);
        }
        if (pathname.startsWith('/api/tasks/') && req.method === 'PATCH') {
            if (!await requireCommander()) return;
            const id = pathname.replace('/api/tasks/', '');
            const body = await parseBody(req);
            const updatePayload = {
                status: body.status,
                completed_at: body.status === 'completed' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            };
            const updated = await supabaseRequest(`/tasks?id=eq.${id}`, 'PATCH', updatePayload);
            return sendJson(res, 200, updated[0]);
        }
        if (pathname.startsWith('/api/tasks/') && req.method === 'DELETE') {
            if (!await requireCommander()) return;
            const id = pathname.replace('/api/tasks/', '');
            await supabaseRequest(`/tasks?id=eq.${id}`, 'DELETE');
            return sendJson(res, 200, { success: true, deleted_id: id });
        }

        // Projects API
        if (pathname === '/api/projects' && req.method === 'GET') {
            const projects = await getProjects();
            return sendJson(res, 200, projects);
        }

        // Decisions API
        if (pathname === '/api/decisions' && req.method === 'GET') {
            const decisions = await getDecisions();
            return sendJson(res, 200, decisions);
        }
        if (pathname === '/api/decisions' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const created = await logDecision(body.decision, body.project_hint || null, body.reason || '');
            return sendJson(res, 201, created);
        }

        // Memories API
        if (pathname === '/api/memories' && req.method === 'GET') {
            const memories = await getMemories(30);
            return sendJson(res, 200, memories);
        }

        // Live Chat with Mikasa
        if (pathname === '/api/chat' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const message = body.message;
            const conversationId = getSessionUuid(body.conversation_id || 'commander_session');

            let replyText = '';
            let actionData = null;

            // Check if message is a direct action intent (e.g. Job Search, Task, Goal, Decision, Browser)
            try {
                const actionRes = await handleActionIntent(message);
                if (actionRes) {
                    actionData = actionRes;
                    if (actionRes.action === 'job_radar') {
                        const r = actionRes.radar;
                        let jobsList = '';
                        if (r.live_jobs && r.live_jobs.length > 0) {
                            jobsList = "\n\n🔥 **Recent Suited Openings Found on LinkedIn:**\n" + 
                                r.live_jobs.map((j, i) => `${i + 1}. **${j.title}** (${j.posted})\n   🏢 ${j.company} • 📍 ${j.location}\n   🔗 [Apply on LinkedIn](${j.url})`).join('\n\n');
                        }
                        replyText = `🎯 **PATHS — Live LinkedIn Opportunity Radar (Sections 19 & 26)**\n🔍 **Query:** _${r.query}_ | 📍 **Location:** _${r.targetLocation}_${jobsList}\n\n━━━━━━━━━━━━━━━━━━━━\n🌐 **Pre-Filtered Live Feeds:**\n` + 
                            r.searches.map(s => `• [${s.title}](${s.url}) — _${s.filter}_`).join('\n') + 
                            `\n\n_Tip: Tell me "tailor cv for [title]" to generate tailored resume bullets immediately!_`;
                    } else if (actionRes.action === 'crypto_radar') {
                        const r = actionRes.radar;
                        let projList = '';
                        if (r.projects && r.projects.length > 0) {
                            projList = "\n\n💎 **Newly Listed & Trending Crypto Projects:**\n" + 
                                r.projects.map((p, i) => `${i + 1}. **${p.name}** ${p.symbol ? `(\`$${p.symbol}\`)` : ''} • _${p.category}_\n   🌐 [Website](${p.website || '#'}) • 💼 [LinkedIn Search](${p.linkedin})${p.twitter ? ` • 🐦 [Twitter](${p.twitter})` : ''}\n   ⛓️ _Ecosystem: ${p.chains}_ • ⏱️ _${p.listed_date}_\n   📝 _${p.description}_`).join('\n\n');
                        }
                        replyText = `💎 **PATHS — Live Crypto Sourcing & Discovery Radar**\n⚡ **Target:** _${r.query}_\n━━━━━━━━━━━━━━━━━━━━${projList}\n\n━━━━━━━━━━━━━━━━━━━━\n🌐 **Live Web3 Sourcing Directories:**\n` + 
                            r.curated_directories.map(d => `• [${d.title}](${d.url}) — _${d.desc}_`).join('\n');
                    } else if (actionRes.action === 'job_matched') {
                        const a = actionRes.analysis;
                        replyText = `🎯 **Job Opportunity Matching Matrix**\nTarget: _${actionRes.job_query}_\n\n\`\`\`\n${a.matrix}\n\`\`\`\n\n**Strategy:** ${a.strategy}`;
                    } else if (actionRes.action === 'task_created') {
                        replyText = `⚔️ Task locked in: **"${actionRes.task.title}"** under project **${actionRes.project_name}**.`;
                    } else if (actionRes.action === 'task_completed') {
                        replyText = `⚔️ Task marked completed: **"${actionRes.task?.title || 'Done'}"**. Well done, Swapnil!`;
                    } else if (actionRes.feedback) {
                        replyText = actionRes.feedback;
                    }
                }
            } catch (actErr) {
                console.warn('[Chat Action Intent Error]:', actErr.message);
            }

            if (!replyText) {
                try {
                    const { callMikasaAgent } = require('../telegram_bridge');
                    const agentRes = await callMikasaAgent(message, conversationId, {
                        user_id: 7112137739,
                        first_name: 'Swapnil',
                        role: 'Commander'
                    });
                    replyText = agentRes.reply || agentRes.text || 'I am right here with you, Swapnil.';
                } catch (agentErr) {
                    console.warn('[Web Chat Fallback Error]:', agentErr.message);
                    replyText = 'Ei to Swapnil, ami ekhane! Local and cloud systems operational.';
                }
            }

            // Non-blocking auto memory extraction
            triggerMemoryExtraction(message, replyText, conversationId);

            return sendJson(res, 200, {
                reply: replyText,
                conversation_id: conversationId,
                actionResult: actionData
            });
        }

        // Public System Telemetry
        if (pathname === '/api/system/public-stats' && req.method === 'GET') {
            try {
                const [tasks, goals, decisions, memories] = await Promise.all([
                    getTasks().catch(() => []),
                    getGoals().catch(() => []),
                    getDecisions().catch(() => []),
                    getMemories(5).catch(() => [])
                ]);
                return sendJson(res, 200, {
                    status: 'operational',
                    commander: 'Md. Miftahur Rahman Swapnil',
                    stats: {
                        active_tasks: tasks.filter(t => t.status !== 'done').length,
                        strategic_goals: goals.length,
                        architectural_decisions: decisions.length,
                        knowledge_nodes: memories.length
                    },
                    channels: {
                        telegram: '@mikasa_360_bot (Active)',
                        web_hud: 'mikasa.mrswapnil.me (Active)',
                        social_pipeline: 'Active (X, LinkedIn, FB)'
                    },
                    uptime_seconds: Math.floor(process.uptime())
                });
            } catch (e) {
                return sendJson(res, 200, { status: 'operational', uptime: process.uptime() });
            }
        }

        // --- PATHS V2: LOCAL PC AGENT & JARVIS LAYER APIS ---

        // PC Telemetry & System Information
        if (pathname === '/api/pc/status' && req.method === 'GET') {
            const info = await getSystemInfo();
            return sendJson(res, 200, info);
        }

        // Allowed File Search & Retrieval
        if (pathname === '/api/pc/files' && req.method === 'GET') {
            const q = parsedUrl.searchParams.get('q') || '';
            const limit = parseInt(parsedUrl.searchParams.get('limit'), 10) || 10;
            const files = await searchAllowedFiles(q, limit);
            return sendJson(res, 200, { query: q, count: files.length, files });
        }

        // Controlled Terminal Execution (Commander Only)
        if (pathname === '/api/pc/terminal' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const cmdResult = await executeControlledTerminal(body.command, body.permission_level || 'READ', body.confirmed || false);
            return sendJson(res, 200, cmdResult);
        }

        // Live Service & Website Monitors
        if (pathname === '/api/pc/monitors' && req.method === 'GET') {
            const monitors = await checkServiceMonitors();
            return sendJson(res, 200, monitors);
        }

        // Privacy Controls
        if (pathname === '/api/pc/privacy' && req.method === 'GET') {
            return sendJson(res, 200, privacyControls);
        }
        if (pathname === '/api/pc/privacy' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const updated = updatePrivacyControls(body);
            return sendJson(res, 200, updated);
        }

        // Agent Modes
        if (pathname === '/api/pc/modes' && req.method === 'GET') {
            return sendJson(res, 200, { mode: currentAgentMode() });
        }
        if (pathname === '/api/pc/modes' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const modeResult = setAgentMode(body.mode);
            return sendJson(res, modeResult.success ? 200 : 400, modeResult);
        }

        // Direct Browser Open API (PATHS v2 Localhost Control)
        if (pathname === '/api/pc/browser/open' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            const resOpen = openBrowserUrl(body.url, body.search || null);
            return sendJson(res, 200, resOpen);
        }

        // Direct Desktop App & Folder Launch API (PATHS v2 Localhost Control)
        if (pathname === '/api/pc/app/launch' && req.method === 'POST') {
            if (!await requireCommander()) return;
            const body = await parseBody(req);
            let resLaunch;
            if (body.folder) {
                resLaunch = openLocalFolder(body.folder);
            } else {
                resLaunch = launchDesktopApp(body.app);
            }
            return sendJson(res, 200, resLaunch);
        }

        // Native Gemini Cute Female Voice TTS API ("Kore" voice)
        if (pathname === '/api/voice/tts' && (req.method === 'GET' || req.method === 'POST')) {
            let textToSpeak = '';
            if (req.method === 'GET') {
                textToSpeak = parsedUrl.searchParams.get('text') || '';
            } else {
                const body = await parseBody(req);
                textToSpeak = body.text || '';
            }

            textToSpeak = (textToSpeak || '').trim().replace(/[*_#`~\[\]\(\)]/g, ' ').replace(/\s+/g, ' ').slice(0, 350);
            if (!textToSpeak) {
                return sendJson(res, 400, { error: 'No text provided' });
            }

            try {
                const wavBuffer = await synthesizeGeminiVoice(textToSpeak, 'Kore');
                res.writeHead(200, {
                    'Content-Type': 'audio/wav',
                    'Content-Length': wavBuffer.length,
                    'Cache-Control': 'no-cache'
                });
                return res.end(wavBuffer);
            } catch (err) {
                console.warn('[Gemini TTS Voice Error]:', err.message);
                return sendJson(res, 502, { error: 'TTS synthesis error', message: err.message });
            }
        }

        // --- STATIC FILE & PAGE ROUTING ---
        // Redirect /app directly to /commander
        if (pathname === '/app') {
            res.writeHead(302, { 'Location': '/commander' });
            return res.end();
        }

        let targetFile = '';
        if (pathname === '/' || pathname === '/index.html' || pathname === '/landing') {
            targetFile = 'index.html';
        } else if (pathname === '/commander' || pathname === '/hud' || pathname === '/dashboard') {
            targetFile = 'app.html';
        } else if (pathname === '/privacy' || pathname === '/privacy-policy') {
            targetFile = 'privacy.html';
        } else if (pathname === '/terms' || pathname === '/terms-of-service') {
            targetFile = 'terms.html';
        } else {
            targetFile = pathname.startsWith('/') ? pathname.slice(1) : pathname;
        }

        let filePath = path.join(__dirname, targetFile);

        if (!fs.existsSync(filePath)) {
            // SPA fallback or 404
            if (!path.extname(pathname)) {
                filePath = path.join(__dirname, 'index.html');
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('404 Not Found');
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const fileStream = fs.createReadStream(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        fileStream.pipe(res);

    } catch (err) {
        console.error('[Server Error]', err);
        sendJson(res, 500, { error: err.message });
    }
});

server.listen(PORT, () => {
    console.log(`⚔️ Mikasa Command Center running at http://localhost:${PORT}`);
});
