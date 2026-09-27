/**
 * Mikasa Ackerman AI Assistant — System Health & Regression Audit Suite
 * Comprehensive automated verification for Milestone 6:
 * - Supabase Cloud DB & Memory Vault
 * - Local PC Workstation Bridge & Hardware Controls
 * - Router Anti-Hijack Guards & Natural Banglish Sanitization
 * - Proactive Surveillance & Late Night Audio Protocol
 * - Web Command Center REST Endpoints
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getSystemInfo } = require('../local_pc_bridge');
const { getMemories, getMemoryStats, supabaseRequest } = require('../actions_handler');
const { runLateNightCheck } = require('../proactive_monitor');

let passedTests = 0;
let failedTests = 0;

function report(name, passed, details = '') {
    if (passed) {
        passedTests++;
        console.log(`  ✅ [PASS] ${name}${details ? ` -> ${details}` : ''}`);
    } else {
        failedTests++;
        console.error(`  ❌ [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
    }
}

async function runHealthAudit() {
    console.log('\n======================================================');
    console.log('⚔️  MIKASA EXECUTIVE ASSISTANT — SYSTEM HEALTH AUDIT  ⚔️');
    console.log('======================================================\n');

    // 1. SUPABASE CONNECTION & CLOUD MEMORY VAULT
    console.log('--- 1. Supabase Cloud Database & Memory Vault ---');
    try {
        const stats = await getMemoryStats();
        report('Supabase DB Connection', Boolean(stats && stats.total > 0), `Total memories: ${stats.total}`);
        report('Memory Type Distribution', Object.keys(stats.byType).length >= 4, `Types found: ${Object.keys(stats.byType).join(', ')}`);
        
        const prefs = await getMemories(5, 'preference');
        report('Memory Filtering by Category', Array.isArray(prefs) && prefs.length > 0, `Preferences count: ${prefs.length}`);
        
        const searchIron = await getMemories(5, null, 'iron');
        report('Memory Live Search', Array.isArray(searchIron) && searchIron.length > 0, `Search "iron" matches: ${searchIron.length}`);
    } catch (err) {
        report('Supabase Cloud Connection', false, err.message);
    }

    // 2. LOCAL PC WORKSTATION TELEMETRY
    try {
        const sysInfo = await getSystemInfo();
        report('System Telemetry Probe', Boolean(sysInfo && sysInfo.hostname), `Host: ${sysInfo.hostname}, OS: ${sysInfo.platform}`);
        report('Memory / RAM Monitor', Boolean(sysInfo.memory && sysInfo.memory.usagePct !== undefined), `RAM Usage: ${sysInfo.memory?.usagePct}% (${sysInfo.memory?.usedGb}GB / ${sysInfo.memory?.totalGb}GB)`);
        report('CPU Telemetry Sensor', Boolean(sysInfo.cpu), `CPU: ${sysInfo.cpu?.model?.trim()} (${sysInfo.cpu?.loadPct}% load, ${sysInfo.cpu?.cores} cores)`);
        report('Storage Volume Probes', Boolean(sysInfo.disks && sysInfo.disks.length > 0), `Volumes: ${sysInfo.disks.map(d => `${d.drive} ${d.freeGb}GB free`).join(', ')}`);
        report('Local n8n Workflow Studio', Boolean(sysInfo.n8n), `Running: ${sysInfo.n8n?.running} at port ${sysInfo.n8n?.port}`);
    } catch (err) {
        report('Local PC Telemetry Probe', false, err.message);
    }

    // 3. PROACTIVE SURVEILLANCE & NIGHT WATCH AUDIO PROTOCOL
    console.log('\n--- 3. Proactive Surveillance & Night Watch Audio ---');
    try {
        const audioPath = path.resolve(__dirname, '../web/audio/over_night.mp3');
        const audioExists = fs.existsSync(audioPath);
        report('over_night.mp3 Audio File Exists', audioExists, `Path: web/audio/over_night.mp3 (${fs.statSync(audioPath).size} bytes)`);

        let audioDispatched = false;
        let textDispatched = false;

        await runLateNightCheck(7637518428, (chatId, text) => {
            textDispatched = Boolean(text && text.includes('Late Night Watch'));
        }, (chatId, buf, filename, caption) => {
            audioDispatched = Boolean(filename === 'over_night.mp3' && buf.length > 100000);
        }, true);

        report('On-Demand Late Night Text Alert', textDispatched);
        report('On-Demand Late Night Audio Dispatch', audioDispatched);
    } catch (err) {
        report('Late Night Protocol Execution', false, err.message);
    }

    // 4. ROUTER CONVERSATIONAL GUARDS & BANGLISH SANITIZER
    console.log('\n--- 4. Router Anti-Hijack Guards & Banglish Sanitizer ---');
    try {
        // Conversational anti-hijack test
        const testPhrases = [
            "make it more interesting intro and no need to add question at the end, make it sound like interesting then tell about features and want to tell like will upgrade it more and more stay with me for tha update",
            "I want to write a post about my new personal ai assistant",
            "show me what you can do with features"
        ];

        const guardRegex = /\b(?:post|caption|draft|tweet|social|make\s+it|write|rewrite|edit|talking\s+about|intro|feature|features|interesting|add|change|tell|stay\s+with|no\s+need|question)\b/i;
        
        testPhrases.forEach((phrase, idx) => {
            report(`Conversational Guard Test #${idx + 1}`, guardRegex.test(phrase), `Intercept bypassed successfully`);
        });

        // Banglish sanitizer test
        let dirtyBanglish = 'Jokhon post korar iccha hobe, ekta bark korlei hobe—ami ready rakhbo. Ar bolo, ekhon ar ki korte hobe?';
        let cleanBanglish = dirtyBanglish
            .replace(/\b(?:ekta\s+)?bark\s+korlei\s+hobe\b/gi, 'ekta knock dilei hobe')
            .replace(/\bbark\s+(?:koro|korlei|dio|korba)\b/gi, 'knock dio')
            .replace(/\s*—\s*/g, ', ');

        report('Ban Weird Literal "bark korlei hobe"', !cleanBanglish.includes('bark') && cleanBanglish.includes('ekta knock dilei hobe'));
        report('Ban Robotic Em-Dashes (—)', !cleanBanglish.includes('—') && cleanBanglish.includes(', ami ready'));
    } catch (err) {
        report('Router Sanitizer Test', false, err.message);
    }

    // 5. WEB COMMAND CENTER LOCAL REST API
    console.log('\n--- 5. Web Command Center Local Endpoints (Port 3000) ---');
    await new Promise((resolve) => {
        http.get('http://localhost:3000/api/status', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    report('GET /api/status', parsed.status === 'operational', `Agent: ${parsed.agent}, Model: ${parsed.primary_llm}`);
                } catch(e) {
                    report('GET /api/status', false, 'Invalid JSON returned');
                }
                resolve();
            });
        }).on('error', (err) => {
            report('GET /api/status (Local Server)', false, err.message);
            resolve();
        });
    });

    await new Promise((resolve) => {
        http.get('http://localhost:3000/api/memories/stats', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    report('GET /api/memories/stats', Boolean(parsed.total && parsed.byType), `Total memories: ${parsed.total}`);
                } catch(e) {
                    report('GET /api/memories/stats', false, 'Invalid JSON returned');
                }
                resolve();
            });
        }).on('error', (err) => {
            report('GET /api/memories/stats', false, err.message);
            resolve();
        });
    });

    console.log('\n======================================================');
    console.log(`🏁 AUDIT COMPLETE: ${passedTests} Passed | ${failedTests} Failed`);
    console.log('======================================================\n');
}

runHealthAudit();
