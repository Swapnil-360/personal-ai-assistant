const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const remindersManager = require('../reminders_manager');
const {
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
    tailorCvForJob,
    generateOptimizedPrompt,
    addNote,
    supabaseRequest
} = require('../actions_handler');

function getSessionUuid(id = 'web_commander') {
    const h = crypto.createHash('md5').update('web_' + id).digest('hex');
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
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
    '.ico': 'image/x-icon'
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
        'Access-Control-Allow-Headers': 'Content-Type'
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
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = parsedUrl.pathname;

    try {
        // --- API ROUTES ---

        // System Status
        if (pathname === '/api/status' && req.method === 'GET') {
            return sendJson(res, 200, {
                status: 'operational',
                agent: 'Mikasa Ackerman',
                primary_llm: 'Google Gemini 2.5 Flash',
                fallback_llm: 'OpenRouter GPT-4o-mini',
                embeddings: 'OpenRouter text-embedding-3-small (1536-dim)',
                channels: ['telegram (@mikasa_360_bot)', 'web_command_center'],
                supabase_status: 'connected',
                uptime: process.uptime()
            });
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
            const body = await parseBody(req);
            const created = remindersManager.addReminder(body.text, body.time_str || '15m', 7112137739);
            return sendJson(res, 201, created);
        }

        // LinkedIn Draft API
        if (pathname === '/api/linkedin/draft' && req.method === 'POST') {
            const body = await parseBody(req);
            const draft = generateLinkedInDraft(body.topic || 'Edu51Portal');
            return sendJson(res, 200, draft);
        }

        // CV Tailoring API
        if (pathname === '/api/cv/tailor' && req.method === 'POST') {
            const body = await parseBody(req);
            const guide = tailorCvForJob(body.job_description || 'Fullstack Software Engineer');
            return sendJson(res, 200, guide);
        }

        // Master Prompt API
        if (pathname === '/api/prompt/generate' && req.method === 'POST') {
            const body = await parseBody(req);
            const prompt = generateOptimizedPrompt(body.goal || 'General architecture');
            return sendJson(res, 200, prompt);
        }

        // Clear Chat API
        if (pathname === '/api/clear' && req.method === 'POST') {
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
            const body = await parseBody(req);
            const created = await createTask(body.title, body.project_hint || null, body.priority || 5);
            return sendJson(res, 201, created);
        }
        if (pathname.startsWith('/api/tasks/') && req.method === 'PATCH') {
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
            const body = await parseBody(req);
            const message = body.message;
            const conversationId = getSessionUuid(body.conversation_id || 'commander_session');

            const n8nPayload = JSON.stringify({
                message: message,
                conversation_id: conversationId,
                channel: 'web_dashboard',
                user: {
                    user_id: 7112137739,
                    first_name: 'Swapnil',
                    role: 'Commander'
                }
            });

            const agentRes = await new Promise((resolve, reject) => {
                const n8nReq = http.request(N8N_WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(n8nPayload)
                    }
                }, (agentResp) => {
                    let d = '';
                    agentResp.on('data', chunk => d += chunk);
                    agentResp.on('end', () => {
                        try { resolve(JSON.parse(d)); } catch (e) { resolve({ reply: d }); }
                    });
                });
                n8nReq.on('error', reject);
                n8nReq.write(n8nPayload);
                n8nReq.end();
            });

            const replyText = agentRes.reply || agentRes.text || 'I am right here with you, Swapnil.';

            // Non-blocking auto memory extraction
            triggerMemoryExtraction(message, replyText, conversationId);

            return sendJson(res, 200, {
                reply: replyText,
                conversation_id: conversationId
            });
        }

        // --- STATIC FILE SERVING ---
        let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

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
