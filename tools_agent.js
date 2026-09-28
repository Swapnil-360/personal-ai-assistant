const https = require('https');
const fs = require('fs');
const path = require('path');
const { 
    getSystemInfo, 
    searchAllowedFiles, 
    lockWorkstation, 
    toggleVolumeMute, 
    changeVolume, 
    turnOffMonitors,
    checkServiceMonitors 
} = require('./local_pc_bridge');
const { fetchGitHubCommits, getTasks, createTask, completeTask } = require('./actions_handler');
const { searchWeb } = require('./web_search_service');
const remindersManager = require('./reminders_manager');

// 1. Tool Function Declarations for Google Gemini API
const MIKASA_TOOL_DECLARATIONS = [
    {
        name: 'get_pc_status',
        description: 'Get live telemetry and status of Swapnil\'s Windows PC (CPU, RAM usage, battery level, charging state, uptime, and active window).',
        parameters: {
            type: 'OBJECT',
            properties: {},
            required: []
        }
    },
    {
        name: 'lock_pc',
        description: 'Lock Swapnil\'s Windows PC workstation immediately for security.',
        parameters: {
            type: 'OBJECT',
            properties: {
                reason: {
                    type: 'STRING',
                    description: 'Reason for locking the PC.'
                }
            },
            required: []
        }
    },
    {
        name: 'fetch_github_commits',
        description: 'Fetch recent git commits for Swapnil\'s GitHub repositories (e.g. stark-os-portfolio, personal-ai-assistant, CurricuRAG).',
        parameters: {
            type: 'OBJECT',
            properties: {
                repo: {
                    type: 'STRING',
                    description: 'Name of the repository (default is stark-os-portfolio).'
                },
                count: {
                    type: 'NUMBER',
                    description: 'Number of recent commits to fetch (1 to 5, default 3).'
                }
            },
            required: []
        }
    },
    {
        name: 'search_web',
        description: 'Search the live web for real-time information, latest news, technical documentation, or facts that require current internet access.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: {
                    type: 'STRING',
                    description: 'The search query string.'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'manage_reminders',
        description: 'Set, list, or check reminders for Swapnil.',
        parameters: {
            type: 'OBJECT',
            properties: {
                action: {
                    type: 'STRING',
                    description: 'Action to perform: "list" to view pending reminders, "create" to schedule a new reminder.'
                },
                text: {
                    type: 'STRING',
                    description: 'The reminder note/text to remember (required if action is create).'
                },
                time_expression: {
                    type: 'STRING',
                    description: 'Time expression (e.g. "in 30 minutes", "tomorrow at 10 AM", "at 9 PM").'
                }
            },
            required: ['action']
        }
    },
    {
        name: 'manage_tasks',
        description: 'List, create, or complete engineering tasks and todo items in Supabase.',
        parameters: {
            type: 'OBJECT',
            properties: {
                action: {
                    type: 'STRING',
                    description: '"list" to get active tasks, "create" to add a new task, "complete" to mark a task as finished.'
                },
                title: {
                    type: 'STRING',
                    description: 'Title of the task to create or complete.'
                },
                project_name: {
                    type: 'STRING',
                    description: 'Associated project name (e.g. "Personal Portfolio", "CurricuRAG", "Mikasa").'
                }
            },
            required: ['action']
        }
    },
    {
        name: 'search_pc_files',
        description: 'Search for files, documents, presentations, or code on Swapnil\'s local PC in allowed folders (D:\\Projects, D:\\Swapnil, D:\\Final Year, D:\\Documents).',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: {
                    type: 'STRING',
                    description: 'Keywords or file name to search for (e.g. "cv", "presentation", "stark portfolio", "curricurag").'
                },
                limit: {
                    type: 'NUMBER',
                    description: 'Maximum number of results to return (default 5).'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'control_workstation',
        description: 'Execute hardware control actions on Swapnil\'s Windows PC: lock workstation, toggle volume mute, change volume level, or turn off displays.',
        parameters: {
            type: 'OBJECT',
            properties: {
                action: {
                    type: 'STRING',
                    description: 'The control action to execute: "lock", "mute", "volup", "voldown", or "screen_off".'
                }
            },
            required: ['action']
        }
    },
    {
        name: 'check_service_health',
        description: 'Check live status, HTTP code, latency (ms), and SSL certificate validity of Swapnil\'s websites and infrastructure (Swapnil Portfolio mrswapnil.me, Mikasa Web Command Center, n8n engine).',
        parameters: {
            type: 'OBJECT',
            properties: {},
            required: []
        }
    }
];

// 2. Local Tool Execution Dispatcher
async function executeLocalTool(toolName, args = {}, userContext = {}) {
    console.log(`[Mikasa Tool Runner] 🛠️ Executing tool "${toolName}" with args:`, JSON.stringify(args));
    try {
        switch (toolName) {
            case 'get_pc_status': {
                const info = await getSystemInfo();
                return {
                    status: 'online',
                    hostname: info.hostname || 'Swapnil-PC',
                    cpu_percent: info.cpu ? info.cpu.usagePercent : null,
                    ram_used_percent: info.memory ? info.memory.usedPercent : null,
                    battery_percent: info.battery ? info.battery.percent : null,
                    is_charging: info.battery ? info.battery.isCharging : null,
                    uptime_hours: (info.uptimeSeconds / 3600).toFixed(1),
                    active_window: info.activeWindow || 'VS Code',
                    summary: `Swapnil-PC is online. RAM: ${info.memory ? info.memory.usedPercent : '?'}%, Battery: ${info.battery ? info.battery.percent : '?'}% (${info.battery?.isCharging ? 'Charging' : 'On battery'}).`
                };
            }

            case 'lock_pc': {
                const { exec } = require('child_process');
                exec('rundll32.exe user32.dll,LockWorkStation');
                return {
                    success: true,
                    message: 'Workstation locked immediately via user32.dll LockWorkStation.'
                };
            }

            case 'fetch_github_commits': {
                const repo = args.repo || 'stark-os-portfolio';
                const count = Math.min(5, Math.max(1, args.count || 3));
                const commits = await fetchGitHubCommits(repo, 'Swapnil-360', count);
                if (!commits || !commits.length) {
                    return { success: false, message: `No recent commits found for ${repo}.` };
                }
                return {
                    success: true,
                    repo: repo,
                    commits: commits.map(c => ({
                        hash: c.hash,
                        message: c.message,
                        author: c.author,
                        relative_time: c.relativeTime,
                        date: c.date,
                        url: c.url
                    }))
                };
            }

            case 'search_web': {
                if (!args.query) return { error: 'query parameter is required' };
                const results = await searchWeb(args.query, 4);
                return {
                    query: args.query,
                    results: results.map(r => ({
                        title: r.title,
                        snippet: r.snippet,
                        url: r.url
                    }))
                };
            }

            case 'manage_reminders': {
                if (args.action === 'list') {
                    const list = remindersManager.getPendingReminders();
                    return {
                        count: list.length,
                        reminders: list.map(r => ({
                            id: r.id,
                            text: r.text,
                            time: r.time,
                            status: r.status
                        }))
                    };
                } else if (args.action === 'create') {
                    const reminderText = args.text || 'Reminder';
                    const timeExpr = args.time_expression || 'in 1 hour';
                    const chatId = userContext.chatId || 7112137739;
                    const created = remindersManager.scheduleReminder(chatId, reminderText, timeExpr);
                    return {
                        success: true,
                        created: created,
                        message: `Scheduled reminder: "${reminderText}" for ${timeExpr}.`
                    };
                }
                return { error: `Unknown reminder action: ${args.action}` };
            }

            case 'manage_tasks': {
                if (args.action === 'list') {
                    const tasks = await getTasks();
                    return {
                        tasks: (tasks || []).slice(0, 8).map(t => ({
                            id: t.id,
                            title: t.title,
                            project: t.project_name || t.projects?.name,
                            status: t.status,
                            priority: t.priority
                        }))
                    };
                } else if (args.action === 'create') {
                    if (!args.title) return { error: 'Task title is required.' };
                    const created = await createTask(args.title, args.project_name || 'General', 7);
                    return {
                        success: true,
                        task: created,
                        message: `Task created: "${args.title}" under ${args.project_name || 'General'}.`
                    };
                } else if (args.action === 'complete') {
                    if (!args.title) return { error: 'Task title is required to complete.' };
                    const completed = await completeTask(args.title);
                    return {
                        success: true,
                        task: completed,
                        message: `Task marked completed: "${args.title}".`
                    };
                }
                return { error: `Unknown task action: ${args.action}` };
            }

            case 'search_pc_files': {
                if (!args.query) return { error: 'query parameter is required' };
                const limit = args.limit || 5;
                const files = await searchAllowedFiles(args.query, limit);
                return {
                    query: args.query,
                    count: files.length,
                    files: files.map(f => ({
                        name: f.name,
                        size: f.sizeFormatted,
                        path: f.path,
                        modified: f.modified
                    }))
                };
            }

            case 'control_workstation': {
                const act = (args.action || '').toLowerCase();
                if (act === 'lock') {
                    return lockWorkstation();
                } else if (act === 'mute') {
                    return toggleVolumeMute();
                } else if (act === 'volup') {
                    return changeVolume('up');
                } else if (act === 'voldown') {
                    return changeVolume('down');
                } else if (act === 'screen_off') {
                    return turnOffMonitors();
                }
                return { error: `Unknown workstation action: ${args.action}` };
            }

            case 'check_service_health': {
                const monitors = await checkServiceMonitors();
                return {
                    checked_at: new Date().toISOString(),
                    services: monitors
                };
            }

            default:
                return { error: `Tool ${toolName} not implemented.` };
        }
    } catch (err) {
        console.error(`[Mikasa Tool Runner] Error executing ${toolName}:`, err.message);
        return { error: err.message };
    }
}

// 3. Autonomous Tool-Calling Agent Loop
async function callGeminiWithTools(systemPrompt, userMessage, apiKey, conversationHistory = [], userContext = {}, maxTurns = 3) {
    const contents = [];

    // History formatting
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        for (const item of conversationHistory) {
            const role = (item.role === 'assistant' || item.role === 'model') ? 'model' : 'user';
            const textPart = (item.content || '').trim();
            if (!textPart) continue;

            if (contents.length === 0) {
                if (role === 'user') {
                    contents.push({ role: 'user', parts: [{ text: textPart }] });
                }
            } else {
                const last = contents[contents.length - 1];
                if (last.role === role) {
                    last.parts[0].text += '\n' + textPart;
                } else {
                    contents.push({ role, parts: [{ text: textPart }] });
                }
            }
        }
    }

    // Append current user query with multimodal attachment support
    const userParts = [];

    // Multimodal image or PDF attachment
    if (userContext && userContext.attachment && userContext.attachment.base64) {
        const mime = userContext.attachment.mime_type || (userContext.attachment.type === 'image' ? 'image/jpeg' : 'application/pdf');
        if (mime.startsWith('image/') || mime === 'application/pdf') {
            userParts.push({
                inline_data: {
                    mime_type: mime,
                    data: userContext.attachment.base64
                }
            });
        }
    }

    let finalPrompt = userMessage;
    if (userContext && userContext.attachment && userContext.attachment.text_content) {
        finalPrompt = `[ATTACHED FILE: ${userContext.attachment.name || 'document'}]\n${userContext.attachment.text_content}\n[END OF ATTACHED FILE]\n\n${userMessage}`;
    } else if (userContext && userContext.attachment && !userContext.attachment.base64 && userContext.attachment.name) {
        finalPrompt = `[ATTACHED FILE: ${userContext.attachment.name}]\n\n${userMessage}`;
    }

    userParts.push({ text: finalPrompt });

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts.push(...userParts);
    } else {
        contents.push({
            role: 'user',
            parts: userParts
        });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    let turns = 0;
    const executedTools = [];

    while (turns < maxTurns) {
        turns++;
        const payload = JSON.stringify({
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            contents,
            tools: [{
                function_declarations: MIKASA_TOOL_DECLARATIONS
            }],
            tool_config: {
                function_calling_config: {
                    mode: 'AUTO'
                }
            },
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1024
            }
        });

        const resData = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 25000
            }, (res) => {
                let d = '';
                res.on('data', chunk => d += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(d);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Failed to parse Gemini response: ${d.slice(0, 150)}`));
                    }
                });
            });
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Gemini API timed out after 25s'));
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });

        if (resData.error) {
            throw new Error(resData.error.message || 'Gemini Tool API Error');
        }

        const candidate = resData.candidates?.[0];
        if (!candidate || !candidate.content) {
            throw new Error('No candidate content received from Gemini.');
        }

        const parts = candidate.content.parts || [];
        const functionCallPart = parts.find(p => p.functionCall);

        if (!functionCallPart) {
            // No function call: final assistant text response returned!
            const replyText = parts.map(p => p.text || '').join('').trim();
            return {
                reply: replyText,
                tools_used: executedTools,
                engine: model
            };
        }

        // Handle Function Call
        const { name: callName, args: callArgs } = functionCallPart.functionCall;
        console.log(`[Gemini Agent Loop] ⚡ Step ${turns}: Gemini requested tool call "${callName}" with args:`, callArgs);

        // Record the model's tool call in history exactly as returned by Gemini
        contents.push(candidate.content);

        // Execute tool locally
        const toolResult = await executeLocalTool(callName, callArgs, userContext);
        executedTools.push({ tool: callName, args: callArgs, result: toolResult });

        // Supply tool response back to Gemini
        contents.push({
            role: 'user',
            parts: [{
                functionResponse: {
                    name: callName,
                    response: { output: toolResult }
                }
            }]
        });
    }

    throw new Error('Gemini tool execution exceeded maximum turn limit.');
}

module.exports = {
    MIKASA_TOOL_DECLARATIONS,
    executeLocalTool,
    callGeminiWithTools
};
