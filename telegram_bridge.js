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
    getTasks,
    getGoals,
    getProjects,
    getDecisions,
    getMemories,
    matchProject
} = require('./actions_handler');

const BOT_TOKEN = '8896311503:AAFPBIf1-0w72q6fIIg1QbosrmrJzsWkqZk';
const N8N_WEBHOOK_URL = 'http://localhost:5678/webhook/swapnil-ai';
const MEMORY_WEBHOOK_URL = 'http://localhost:5678/webhook/extract-memory';
const SWAPNIL_USER_ID = 7112137739;

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

        async function sendNext(index) {
            if (index >= chunks.length) return resolve();
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
                    const parsed = JSON.parse(data || '{}');
                    if (!parsed.ok && parsed.description && parsed.description.includes("can't parse entities")) {
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
                        }, () => sendNext(index + 1));
                        req2.write(rawPayload);
                        req2.end();
                    } else {
                        sendNext(index + 1);
                    }
                });
            });

            req.on('error', reject);
            req.write(payload);
            req.end();
        }

        sendNext(0);
    });
}

// Call Mikasa Agent on local n8n
function callMikasaAgent(message, conversationId, userContext) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            message: message,
            conversation_id: conversationId,
            channel: 'telegram',
            user: userContext
        });

        const req = http.request(N8N_WEBHOOK_URL, {
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

        await answerCallbackQuery(id, "✅ Post Approved!");

        const updatedText = (callbackQuery.message.text || '') + "\n\n━━━━━━━━━━━━━━━━━━━━\n✅ *Status: APPROVED & QUEUED FOR LINKEDIN*\n_I've saved this post in your content pipeline, Swapnil!_";
        await editTelegramMessage(chatId, messageId, updatedText);

        // Save approved post to Supabase memories
        if (draft) {
            await addNote(`Approved LinkedIn Post: ${draft.title}\n\n${draft.content}`, 'linkedin_post');
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

        const postMessage = `📝 *Fresh LinkedIn Draft:* *${newDraft.title}*\n\n${newDraft.content}`;
        await sendTelegramMessage(chatId, postMessage, null, replyMarkup);
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

    // 3. Handle /clear Command (Wipe all chat history)
    if (text === '/clear' || text.toLowerCase() === 'clear chat' || text.toLowerCase() === 'clear all chat') {
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

    // 4. Handle /github Command (Inspect Repos & Analyze)
    if (text === '/github' || text.toLowerCase().startsWith('check my github') || text.toLowerCase().startsWith('see my github')) {
        await sendChatAction(chatId, 'typing');
        try {
            const repos = await fetchGitHubRepos('Swapnil-360');
            let ghMsg = "🐙 *Swapnil's GitHub Radar (`Swapnil-360`)*\n\n";
            ghMsg += `*Found ${repos.length} active repositories:*\n\n`;

            repos.slice(0, 6).forEach((r, idx) => {
                const langBadge = r.language ? `[${r.language}]` : '';
                const starBadge = r.stars > 0 ? `⭐ ${r.stars}` : '';
                ghMsg += `${idx + 1}. *${r.name}* ${langBadge} ${starBadge}\n`;
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
            "• `/github` — Inspect your GitHub repos (`Swapnil-360`) & recent activity",
            "• `/linkedin [project]` — Draft viral tech post with 1-click Telegram approval",
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

    console.log('[Telegram Bridge] 🚀 Long polling active with Full Copilot Suites (/clear, /github, /linkedin, /cv, /prompt, /remind)...');
    isPolling = true;

    while (isPolling) {
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
