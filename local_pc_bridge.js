const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec, execSync } = require('child_process');
const { recordAuditLog } = require('./actions_handler');

function getEnv(key, fallback = null) {
    if (process.env[key]) return process.env[key];
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(new RegExp(`^${key}=([^\\r\\n]+)`, 'm'));
            if (match) return match[1].trim();
        }
    } catch (e) {}
    return fallback;
}

// 1. ALLOWED DIRECTORY SYSTEM & SENSITIVE PATH SAFEGUARDS
const ALLOWED_DIRECTORIES = [
    'D:\\Projects',
    'D:\\Swapnil',
    'D:\\Final Year',
    'D:\\Documents',
    'D:\\Downloads\\PATHS',
    'D:\\PATHS-Shared',
    path.resolve(__dirname) // Active repository workspace
];

// Sensitive patterns that must NEVER be accessed, read, or transmitted remotely
const SENSITIVE_PATTERNS = [
    /^\.env(\..+)?$/i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
    /id_ed25519/i,
    /passwords?/i,
    /credentials/i,
    /shadow$/i,
    /sam$/i,
    /system32/i,
    /appdata[\\\/]local[\\\/]google[\\\/]chrome/i,
    /token[s]?\.json$/i
];

// In-Memory Privacy Controls (Section 33)
const privacyControls = {
    microphone: true,
    camera: false,
    screen: false,
    pc_access: true,
    browser: true,
    terminal: 'restricted' // 'restricted', 'disabled', 'confirm_each'
};

// Current Agent Mode (Section 26)
let currentAgentMode = 'PC'; // Conversation, Research, Developer, PC, Browser, Automation, Career, Social, Monitor, Command

// Helper: Check if path is within allowed directories
function isPathAllowed(targetPath) {
    const resolved = path.resolve(targetPath);
    // Check against sensitive patterns first
    const base = path.basename(resolved);
    for (const pat of SENSITIVE_PATTERNS) {
        if (pat.test(base) || pat.test(resolved)) {
            return { allowed: false, reason: `Access to sensitive credential/system file pattern (${pat}) is strictly blocked.` };
        }
    }

    // Check if path is contained in any allowed directory
    const isContained = ALLOWED_DIRECTORIES.some(allowedDir => {
        if (!fs.existsSync(allowedDir)) return false;
        const normAllowed = path.resolve(allowedDir).toLowerCase();
        const normTarget = resolved.toLowerCase();
        return normTarget === normAllowed || normTarget.startsWith(normAllowed + path.sep);
    });

    if (!isContained) {
        return { allowed: false, reason: `Directory '${targetPath}' is outside the PATHS allowlist.` };
    }

    return { allowed: true, resolved };
}

// 2. LOCAL FILE SYSTEM INTELLIGENCE (Section 4)
async function searchAllowedFiles(query, maxResults = 10) {
    const results = [];
    const seenPaths = new Set();
    const lowerQuery = (query || '').toLowerCase().trim();
    const queryTokens = lowerQuery ? lowerQuery.split(/\s+/).filter(t => t.length > 1) : [];

    function walkDir(currentDir, depth = 0) {
        if (depth > 4) return; // Prevent excessive deep traversal
        if (!fs.existsSync(currentDir)) return;

        let entries;
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch (e) {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const baseName = entry.name;

            // Block sensitive patterns immediately
            let isSensitive = false;
            for (const pat of SENSITIVE_PATTERNS) {
                if (pat.test(baseName) || pat.test(fullPath)) {
                    isSensitive = true;
                    break;
                }
            }
            if (isSensitive) continue;

            if (entry.isDirectory()) {
                if (['node_modules', '.git', '$recycle.bin', 'system volume information', '.gemini'].includes(baseName.toLowerCase())) {
                    continue;
                }
                walkDir(fullPath, depth + 1);
            } else if (entry.isFile()) {
                const normPath = fullPath.toLowerCase();
                if (seenPaths.has(normPath)) continue;

                let matchScore = 0;
                const lowerName = baseName.toLowerCase();
                const lowerFullPath = fullPath.toLowerCase();

                if (!lowerQuery) {
                    matchScore = 1;
                } else if (lowerName === lowerQuery) {
                    matchScore = 100;
                } else if (lowerName.includes(lowerQuery)) {
                    matchScore = 50;
                } else if (lowerFullPath.includes(lowerQuery)) {
                    matchScore = 30;
                } else {
                    for (const token of queryTokens) {
                        if (lowerName.includes(token)) matchScore += 15;
                        else if (lowerFullPath.includes(token)) matchScore += 5;
                    }
                }

                if (matchScore > 0) {
                    try {
                        const stat = fs.statSync(fullPath);
                        seenPaths.add(normPath);
                        results.push({
                            name: baseName,
                            path: fullPath,
                            sizeBytes: stat.size,
                            sizeFormatted: stat.size > 1048576 
                                ? `${(stat.size / 1048576).toFixed(2)} MB`
                                : `${(stat.size / 1024).toFixed(1)} KB`,
                            modifiedAt: stat.mtime,
                            modifiedIso: stat.mtime.toISOString(),
                            score: matchScore
                        });
                    } catch (e) {}
                }
            }
        }
    }

    // Traverse root allowed directories (deduplicated)
    const uniqueRoots = Array.from(new Set(ALLOWED_DIRECTORIES.map(d => path.resolve(d).toLowerCase())));
    for (const dir of uniqueRoots) {
        if (fs.existsSync(dir)) {
            walkDir(dir);
        }
    }

    // Sort by match score first, then recency
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
    });

    return results.slice(0, maxResults);
}

// 3. REMOTE FILE RETRIEVAL (Section 5)
// Streams an allowed file to Telegram chat via multipart/form-data
async function sendTelegramDocument(chatId, filePath, caption = '') {
    const allowedCheck = isPathAllowed(filePath);
    if (!allowedCheck.allowed) {
        await recordAuditLog({
            action: 'remote_file_retrieval_blocked',
            target: filePath,
            details: allowedCheck.reason,
            verified: false
        });
        throw new Error(`Security Exception: ${allowedCheck.reason}`);
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const token = getEnv('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');

    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);

    // Build multipart body
    const parts = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
    if (caption) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(fileData);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const payload = Buffer.concat(parts);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${token}/sendDocument`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.ok) {
                        await recordAuditLog({
                            action: 'remote_file_transferred',
                            target: fileName,
                            details: `Sent ${fileName} (${(fileData.length / 1024).toFixed(1)} KB) to Telegram chat ${chatId}`,
                            verified: true
                        });
                        resolve({ success: true, messageId: parsed.result.message_id, file: fileName });
                    } else {
                        reject(new Error(`Telegram sendDocument failed: ${parsed.description || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Telegram response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function sendTelegramDocumentBuffer(chatId, buffer, fileName, caption = '') {
    const token = getEnv('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');

    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);

    const parts = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
    if (caption) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`));
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const payload = Buffer.concat(parts);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${token}/sendDocument`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.ok) {
                        await recordAuditLog({
                            action: 'remote_buffer_transferred',
                            target: fileName,
                            details: `Sent buffer ${fileName} (${(buffer.length / 1024).toFixed(1)} KB) to Telegram chat ${chatId}`,
                            verified: true
                        });
                        resolve({ success: true, messageId: parsed.result.message_id, file: fileName });
                    } else {
                        reject(new Error(`Telegram sendDocument failed: ${parsed.description || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Telegram response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// 4. LOCAL SYSTEM INFORMATION & TELEMETRY (Section 6)
async function getSystemInfo() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = ((usedMem / totalMem) * 100).toFixed(1);

    let cpuLoadPct = 0;
    let disks = [];
    let topProcesses = [];
    let n8nRunning = false;

    // Check disk usage via PowerShell
    try {
        const diskOut = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, FreeSpace, Size"', { timeout: 3000 }).toString();
        const lines = diskOut.trim().split('\n').filter(l => l.trim().length > 0);
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            if (parts.length >= 3) {
                const dev = parts[0];
                const free = Number(parts[1]);
                const size = Number(parts[2]);
                if (size > 0) {
                    disks.push({
                        drive: dev,
                        totalGb: (size / (1024 ** 3)).toFixed(1),
                        freeGb: (free / (1024 ** 3)).toFixed(1),
                        usedGb: ((size - free) / (1024 ** 3)).toFixed(1),
                        freePct: ((free / size) * 100).toFixed(1)
                    });
                }
            }
        }
    } catch (e) {}

    // Check CPU load
    try {
        const cpuOut = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).LoadPercentage"', { timeout: 2500 }).toString().trim();
        const parsedCpu = Number(cpuOut);
        if (!isNaN(parsedCpu)) cpuLoadPct = parsedCpu;
    } catch (e) {}

    // Check top memory processes
    try {
        const procOut = execSync('powershell -NoProfile -Command "Get-Process | Sort-Object WS -Descending | Select-Object -First 5 ProcessName, WS"', { timeout: 3000 }).toString();
        const lines = procOut.trim().split('\n').filter(l => l.trim().length > 0);
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            if (parts.length >= 2) {
                const name = parts[0];
                const ws = Number(parts[1]);
                if (!isNaN(ws)) {
                    topProcesses.push({
                        name,
                        ramMb: (ws / (1024 * 1024)).toFixed(1)
                    });
                }
            }
        }
    } catch (e) {}

    // Check n8n health on port 5678 (try 127.0.0.1 first for zero-latency IPv4, fallback to localhost)
    try {
        n8nRunning = await new Promise((resolve) => {
            const req = http.get('http://127.0.0.1:5678/healthz', { timeout: 3000 }, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on('error', () => {
                const req2 = http.get('http://localhost:5678/healthz', { timeout: 2000 }, (res2) => {
                    res2.resume();
                    resolve(res2.statusCode === 200);
                });
                req2.on('error', () => resolve(false));
                req2.on('timeout', () => { req2.destroy(); resolve(false); });
            });
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
    } catch (e) {
        n8nRunning = false;
    }

    return {
        hostname: os.hostname(),
        platform: os.platform(),
        uptimeSec: os.uptime(),
        uptimeFormatted: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
        cpu: {
            model: os.cpus()[0]?.model || 'Unknown CPU',
            cores: os.cpus().length,
            loadPct: cpuLoadPct
        },
        memory: {
            totalGb: (totalMem / (1024 ** 3)).toFixed(1),
            usedGb: (usedMem / (1024 ** 3)).toFixed(1),
            freeGb: (freeMem / (1024 ** 3)).toFixed(1),
            usagePct: memUsagePct
        },
        disks,
        topProcesses,
        n8n: {
            port: 5678,
            running: n8nRunning,
            url: 'http://localhost:5678'
        },
        pcAgentOnline: true,
        mode: currentAgentMode,
        privacy: privacyControls
    };
}

// 5. CONTROLLED TERMINAL EXECUTION LAYER & PERMISSION MATRIX (Section 7, 27)
const SAFE_READ_COMMANDS = [
    /^git\s+(status|log|branch|diff|remote|config\s+--get)/i,
    /^(dir|ls)(\s+.*)?$/i,
    /^tasklist(\s+.*)?$/i,
    /^netstat\s+-an/i,
    /^node\s+(-v|--version)/i,
    /^npm\s+(-v|--version|list|outdated)/i,
    /^docker\s+(ps|images|version)/i,
    /^whoami$/i,
    /^hostname$/i,
    /^uptime$/i,
    /^echo\s+/i
];

const APPROVED_EXECUTE_COMMANDS = [
    /^npm\s+(test|run\s+(test|build|lint|dev)|audit)/i,
    /^git\s+(pull|fetch|checkout|status)/i,
    /^node\s+scripts[\\\/][a-zA-Z0-9_\-\.]+\.js/i,
    /^python\s+[a-zA-Z0-9_\-\.]+\.py/i
];

const STRICT_BLOCKED_COMMANDS = [
    /format\s+/i,
    /rmdir\s+[\/\\]s/i,
    /del\s+[\/\\]f\s+[\/\\]s/i,
    /rm\s+-rf\s+[\/\\]/i,
    /reg\s+(add|delete)/i,
    /net\s+user/i,
    /shutdown/i,
    /diskpart/i,
    /powershell\s+.*-(enc|encodedcommand)/i,
    /curl.*\|\s*(bash|sh|cmd|powershell)/i
];

async function executeControlledTerminal(command, requestedLevel = 'READ', confirmed = false) {
    if (privacyControls.terminal === 'disabled') {
        throw new Error('Terminal access is currently DISABLED in Mikasa Privacy Controls.');
    }

    const trimmed = (command || '').trim();
    if (!trimmed) throw new Error('Command cannot be empty.');

    // 1. Check strict blacklist
    for (const bl of STRICT_BLOCKED_COMMANDS) {
        if (bl.test(trimmed)) {
            await recordAuditLog({
                action: 'terminal_command_blocked',
                target: trimmed,
                details: 'Blocked by strict destructive command filter.',
                verified: false
            });
            throw new Error(`CRITICAL: Command matched destructive blocklist pattern (${bl}). Execution denied.`);
        }
    }

    // 2. Classify command
    let isSafeRead = SAFE_READ_COMMANDS.some(r => r.test(trimmed));
    let isApprovedExec = APPROVED_EXECUTE_COMMANDS.some(r => r.test(trimmed));

    let assignedLevel = isSafeRead ? 'READ' : (isApprovedExec ? 'EXECUTE' : 'CONFIRM');

    if (assignedLevel === 'CONFIRM' && !confirmed) {
        return {
            status: 'confirmation_required',
            command: trimmed,
            permission_level: 'CONFIRM',
            message: `Command '${trimmed}' requires explicit commander confirmation before execution. Re-run with confirmed: true.`
        };
    }

    // 3. Execute with timeout
    const startTime = Date.now();
    return new Promise((resolve) => {
        exec(trimmed, {
            cwd: path.resolve(__dirname),
            timeout: 15000,
            maxBuffer: 1024 * 512
        }, async (err, stdout, stderr) => {
            const durationMs = Date.now() - startTime;
            const success = !err;
            const output = (stdout || '') + (stderr ? `\n[STDERR]:\n${stderr}` : '');

            await recordAuditLog({
                action: 'terminal_executed',
                target: trimmed,
                permission_level: assignedLevel,
                details: `Executed in ${durationMs}ms with exit code ${err ? (err.code || 1) : 0}`,
                verified: success
            });

            resolve({
                command: trimmed,
                permission_level: assignedLevel,
                success,
                exit_code: err ? (err.code || 1) : 0,
                duration_ms: durationMs,
                output: output.trim() || (success ? '[Command completed with no output]' : '[Error during execution]')
            });
        });
    });
}

// 6. WEBSITE & SERVICE MONITORING (Section 19, 20)
const MONITORED_SERVICES = [
    { name: 'Mikasa Web Command Center (Local)', url: 'http://localhost:3000/api/status', type: 'http' },
    { name: 'Mikasa Cloud Portal', url: 'https://mikasa.mrswapnil.me', type: 'https' },
    { name: 'Swapnil Hub / Portfolio', url: 'https://mrswapnil.me', type: 'https' },
    { name: 'Local n8n Workflow Engine', url: 'http://localhost:5678/healthz', type: 'http' }
];

async function checkServiceMonitors() {
    const results = [];

    for (const service of MONITORED_SERVICES) {
        const start = Date.now();
        const isHttps = service.url.startsWith('https');
        const client = isHttps ? https : http;

        const resObj = await new Promise((resolve) => {
            try {
                const req = client.get(service.url, { timeout: 4000 }, (res) => {
                    res.resume();
                    const latency = Date.now() - start;
                    resolve({
                        name: service.name,
                        url: service.url,
                        status: res.statusCode >= 200 && res.statusCode < 400 ? 'UP' : 'DEGRADED',
                        statusCode: res.statusCode,
                        latencyMs: latency,
                        ssl: isHttps ? 'VALID' : 'N/A'
                    });
                });
                req.on('error', (err) => {
                    resolve({
                        name: service.name,
                        url: service.url,
                        status: 'DOWN',
                        statusCode: null,
                        latencyMs: Date.now() - start,
                        error: err.message
                    });
                });
                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        name: service.name,
                        url: service.url,
                        status: 'TIMEOUT',
                        statusCode: 408,
                        latencyMs: 4000
                    });
                });
            } catch (err) {
                resolve({
                    name: service.name,
                    url: service.url,
                    status: 'ERROR',
                    error: err.message
                });
            }
        });

        results.push(resObj);
    }

    return results;
}

// 7. PRIVACY & MODE MANAGEMENT (Section 26, 33)
function updatePrivacyControls(updates) {
    for (const [key, val] of Object.entries(updates)) {
        if (key in privacyControls) {
            privacyControls[key] = val;
        }
    }
    return { ...privacyControls };
}

function setAgentMode(mode) {
    const validModes = ['Conversation', 'Research', 'Developer', 'PC', 'Browser', 'Automation', 'Career', 'Social', 'Monitor', 'Command'];
    const matched = validModes.find(m => m.toLowerCase() === (mode || '').toLowerCase());
    if (matched) {
        currentAgentMode = matched;
        return { success: true, mode: currentAgentMode };
    }
    return { success: false, error: `Invalid mode. Allowed: ${validModes.join(', ')}` };
}

// 8. LOCAL BROWSER & DESKTOP PC CONTROLS (PATHS v2)
function openBrowserUrl(targetUrl, searchTerms = null) {
    let finalUrl = (targetUrl || '').trim();
    if (searchTerms) {
        if (finalUrl.includes('youtube')) {
            finalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerms)}`;
        } else {
            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerms)}`;
        }
    } else if (!finalUrl) {
        finalUrl = 'https://www.google.com';
    } else if (!/^https?:\/\//i.test(finalUrl)) {
        if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(finalUrl)) {
            finalUrl = 'https://' + finalUrl;
        } else {
            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
        }
    }

    try {
        // Specifically launch using Microsoft Edge (user's default) with graceful fallbacks
        const safeUrl = finalUrl.replace(/"/g, '\\"');
        const edgeCmd = `start msedge "${safeUrl}" || start "" "${safeUrl}"`;
        exec(edgeCmd, (err) => {
            if (err) {
                console.warn('[Edge Direct Launch Error, fallback to PowerShell]:', err.message);
                const psUrl = finalUrl.replace(/'/g, "''");
                exec(`powershell -NoProfile -Command "Start-Process msedge '${psUrl}'"`, (psErr) => {
                    if (psErr) {
                        exec(`powershell -NoProfile -Command "Start-Process '${psUrl}'"`, () => {});
                    }
                });
            }
        });
        return { success: true, url: finalUrl, message: `Opened ${finalUrl} in Microsoft Edge.` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getVsCodeLaunchCommand() {
    const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Administrator\\AppData\\Local';
    const possiblePaths = [
        path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft VS Code', 'Code.exe')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return `start "" "${p}" -n "${path.resolve(__dirname)}"`;
        }
    }
    return `code -n "${path.resolve(__dirname)}" || start code || code .`;
}

function launchDesktopApp(appName) {
    const raw = (appName || '').trim().toLowerCase().replace(/[\s\-_]+/g, '');
    const vsCodeCmd = getVsCodeLaunchCommand();
    const apps = {
        'vscode': vsCodeCmd,
        'code': vsCodeCmd,
        'visualstudiocode': vsCodeCmd,
        'bscode': vsCodeCmd,
        'terminal': 'start wt || start powershell || start cmd',
        'windowsterminal': 'start wt || start powershell',
        'cmd': 'start cmd',
        'commandprompt': 'start cmd',
        'powershell': 'start powershell',
        'notepad': 'start notepad',
        'calc': 'start calc',
        'calculator': 'start calc',
        'explorer': 'start explorer .',
        'fileexplorer': 'start explorer .',
        'files': 'start explorer .',
        'edge': 'start msedge',
        'msedge': 'start msedge',
        'browser': 'start msedge',
        'chrome': 'start chrome',
        'brave': 'start brave',
        'discord': 'start discord || start "" "https://discord.com/app"',
        'telegram': 'start telegram || start "" "https://web.telegram.org"',
        'spotify': 'start spotify || start "" "https://open.spotify.com"',
        'settings': 'start ms-settings:',
        'taskmgr': 'start taskmgr',
        'taskmanager': 'start taskmgr',
        'postman': 'start postman',
        'figma': 'start figma || start "" "https://www.figma.com"',
        'docker': 'start "Docker Desktop"',
        'dockerdesktop': 'start "Docker Desktop"',
        'slack': 'start slack || start "" "https://slack.com"',
        'obsidian': 'start obsidian',
        'gitbash': 'start "" "C:\\Program Files\\Git\\git-bash.exe" || start git-bash',
        'word': 'start winword',
        'winword': 'start winword',
        'excel': 'start excel'
    };

    if (apps[raw]) {
        try {
            exec(apps[raw], { cwd: path.resolve(__dirname) }, (err) => {
                if (err) {
                    console.warn(`[App Launch '${raw}' primary failed, trying PowerShell]:`, err.message);
                    exec(`powershell -NoProfile -Command "Start-Process '${raw}'"`, () => {});
                }
            });
            return { success: true, app: raw, message: `⚔️ Launched ${raw} on your desktop, Swapnil.` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // Generic safe Windows application launch
    if (/^[a-zA-Z0-9_\-]+$/.test(raw)) {
        try {
            exec(`start "" "${raw}" || powershell -NoProfile -Command "Start-Process '${raw}'"`, (err) => {
                if (err) console.warn('[Generic App Launch Warning]:', err.message);
            });
            return { success: true, app: raw, message: `⚔️ Dispatched launch command for '${raw}' on your desktop, Swapnil.` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    return { success: false, error: `App '${appName}' could not be launched.` };
}

function openLocalFolder(folderPath) {
    const target = (folderPath || '').trim();
    const check = isPathAllowed(target);
    if (!check.allowed) {
        return { success: false, error: check.reason };
    }

    try {
        exec(`explorer "${check.resolved}"`, (err) => {
            if (err) console.error('[Explorer Launch Error]:', err.message);
        });
        return { success: true, path: check.resolved, message: `Opened folder ${check.resolved} in Windows Explorer.` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    ALLOWED_DIRECTORIES,
    SENSITIVE_PATTERNS,
    isPathAllowed,
    searchAllowedFiles,
    sendTelegramDocument,
    sendTelegramDocumentBuffer,
    getSystemInfo,
    executeControlledTerminal,
    checkServiceMonitors,
    privacyControls,
    updatePrivacyControls,
    currentAgentMode: () => currentAgentMode,
    setAgentMode,
    openBrowserUrl,
    launchDesktopApp,
    openLocalFolder
};
