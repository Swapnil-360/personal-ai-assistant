const https = require('https');
const http = require('http');

const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqaHJtY3Ricm9icG5vdW16bWp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTkxNTc3NywiZXhwIjoyMTA1NDkxNzc3fQ.0_xov-GTLYTFGnm_gXxO2lmS1w_9Kc-pnWc0-T17UJ8';

const PROJECTS = [
    { id: 'a4cfe217-d0f9-402b-a07d-b6e8b47975d6', name: 'Edu51Portal', slug: 'edu51portal' },
    { id: '8f413cc5-72bf-4439-a990-e3485d3969ed', name: 'OpusGenAI', slug: 'opusgenai' },
    { id: 'd54ced09-e1fb-4e82-a8f3-cd2fa5539924', name: 'Personal Portfolio', slug: 'personal-portfolio' },
    { id: 'c70e90f6-e1f3-4206-a401-4cf8f42ada05', name: 'Personal AI Assistant', slug: 'personal-ai-assistant' }
];

function matchProject(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const p of PROJECTS) {
        if (lower.includes(p.slug) || lower.includes(p.name.toLowerCase())) {
            return p;
        }
    }
    return null;
}

function supabaseRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'qjhrmctbrobpnoumzmju.supabase.co',
            path: '/rest/v1' + path,
            method: method,
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': method === 'GET' ? 'count=none' : 'return=representation',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve(data); }
                } else {
                    reject(new Error(`Supabase error ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// 1. Create Task
async function createTask(title, projectHint = null, priority = 5) {
    const project = projectHint ? matchProject(projectHint) : null;
    const cleanTitle = title.trim();
    const task = {
        title: cleanTitle,
        status: 'todo',
        priority: Number(priority) || 5,
        project_id: project ? project.id : null
    };
    const res = await supabaseRequest('/tasks', 'POST', task);
    return {
        action: 'task_created',
        success: true,
        task: res[0],
        project_name: project ? project.name : 'General'
    };
}

// 2. Complete Task
async function completeTask(titleOrId) {
    const query = titleOrId.trim();
    let tasks = await supabaseRequest(`/tasks?title=ilike.*${encodeURIComponent(query)}*&status=neq.completed&limit=1`, 'GET');
    if (!tasks || tasks.length === 0) {
        tasks = await supabaseRequest(`/tasks?title=ilike.*${encodeURIComponent(query)}*&limit=1`, 'GET');
    }
    if (!tasks || tasks.length === 0) {
        return { action: 'task_completed', success: false, reason: `Task "${query}" not found.` };
    }
    const target = tasks[0];
    const updated = await supabaseRequest(`/tasks?id=eq.${target.id}`, 'PATCH', {
        status: 'completed',
        completed_at: new Date().toISOString()
    });
    return {
        action: 'task_completed',
        success: true,
        task: updated[0] || target
    };
}

// 3. Create Goal
async function createGoal(title, category = 'Career') {
    const cleanTitle = title.trim();
    const goal = {
        title: cleanTitle,
        category: category,
        status: 'active',
        priority: 8
    };
    const res = await supabaseRequest('/goals', 'POST', goal);
    return {
        action: 'goal_created',
        success: true,
        goal: res[0]
    };
}

// 4. Log Architectural Decision
async function logDecision(decisionText, projectHint = null, reason = '') {
    const project = projectHint ? matchProject(projectHint) : null;
    const dec = {
        decision: decisionText.trim(),
        reason: reason.trim() || 'Strategic architectural decision',
        status: 'active',
        project_id: project ? project.id : null
    };
    const res = await supabaseRequest('/project_decisions', 'POST', dec);
    return {
        action: 'decision_logged',
        success: true,
        decision: res[0],
        project_name: project ? project.name : 'General'
    };
}

// 5. Add Note or Idea
async function addNote(content, category = 'note') {
    const clean = content.trim();
    const note = {
        content: clean,
        memory_type: 'fact',
        importance: 3,
        confidence: 1.0,
        source_type: 'manual_note',
        status: 'active',
        metadata: { tag: category }
    };
    const res = await supabaseRequest('/memories', 'POST', note);
    return {
        action: 'note_added',
        success: true,
        note: res[0]
    };
}

// 6. Clear Chat History in Supabase
async function clearChatHistory(conversationId) {
    try {
        if (conversationId) {
            await supabaseRequest(`/messages?conversation_id=eq.${conversationId}`, 'DELETE');
            await supabaseRequest(`/conversations?id=eq.${conversationId}`, 'PATCH', {
                title: 'Clean Slate Session',
                metadata: { cleared_at: new Date().toISOString() }
            });
        }
        return { success: true };
    } catch (err) {
        console.warn('[Clear Chat Warning]', err.message);
        return { success: false, error: err.message };
    }
}

// 7. GitHub Repos Fetcher & Analyzer (Authenticated)
function fetchGitHubRepos(username = 'Swapnil-360') {
    return new Promise((resolve, reject) => {
        let token = process.env.GITHUB_TOKEN;
        if (!token) {
            try {
                const fs = require('fs');
                const path = require('path');
                const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
                const match = envContent.match(/GITHUB_TOKEN=([^\r\n]+)/);
                if (match) token = match[1].trim();
            } catch (e) {}
        }
        const headers = {
            'User-Agent': 'Mikasa-OS',
            ...(token ? { 'Authorization': `token ${token}` } : {})
        };
        const url = token 
            ? 'https://api.github.com/user/repos?sort=updated&per_page=20&affiliation=owner'
            : `https://api.github.com/users/${username}/repos?sort=updated&per_page=15`;

        https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const repos = JSON.parse(data);
                    if (Array.isArray(repos)) {
                        const formatted = repos.map(r => ({
                            name: r.name,
                            description: r.description || 'Core engineering build',
                            language: r.language || 'Code',
                            stars: r.stargazers_count,
                            forks: r.forks_count,
                            url: r.html_url,
                            private: r.private,
                            updated_at: r.updated_at
                        }));
                        resolve(formatted);
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', reject);
    });
}

// 8. LinkedIn Post Generator
function generateLinkedInDraft(topicOrProject = 'Edu51Portal') {
    const topic = topicOrProject.trim();
    const lower = topic.toLowerCase();

    if (lower.includes('edu51') || lower.includes('edu51portal')) {
        return {
            topic: 'Edu51Portal',
            title: 'Scaling an Academic Platform for 100+ Engineering Students',
            content: 
`Building software that real people use every day changes how you think about architecture. 🚀

When we built Edu51Portal for BUBT CSE students, the initial problem was simple:
Study notes, past exam questions, and lab assignments were scattered across chaotic WhatsApp and Messenger groups. Critical resources got buried in hours.

Instead of over-engineering from day one, we focused on practical delivery:
1️⃣ Next.js + TypeScript for a blazing fast, SEO-optimized frontend.
2️⃣ Supabase for secure authentication and instant relational queries.
3️⃣ Google Drive API integration to host heavy PDF resources with zero monthly cloud storage bills.

The result? Around 100+ CSE students now access centralized academic resources daily with sub-second page loads.

The biggest engineering lesson?
You don't need a multi-million-dollar infrastructure to solve real user friction. You need clean domain modeling, low latency, and relentless empathy for your end-users.

What's an architecture decision you made early on that saved your project? Let's connect! 👇

#FullStackDevelopment #NextJS #TypeScript #Supabase #SoftwareEngineering #WebDev #BuildInPublic`
        };
    }

    if (lower.includes('opus') || lower.includes('opusgenai') || lower.includes('ai')) {
        return {
            topic: 'OpusGenAI',
            title: 'Architecting an AI Generation Engine: Gemini 2.5 Flash + OpenRouter Fallbacks',
            content:
`Most developers treat AI APIs like simple REST calls. Until production hits latency spikes and rate limits. ⚡

While engineering OpusGenAI and autonomous agent workflows, we implemented a dual-tier LLM architecture:

🔹 Primary Tier: Google Gemini 2.5 Flash for lightning ~1.2s response times and deep multi-turn comprehension.
🔹 Secondary Fallback: OpenRouter (GPT-4o-mini) with automatic retry interceptors so our users never experience downtime.
🔹 Vector Memory Vault: 1536-dimensional embeddings (text-embedding-3-small) to maintain continuous project memory across sessions.

Reliability in AI products isn't just about having the smartest model. It's about designing defensive architectures that fail gracefully.

Are you building with AI agents or multi-model fallbacks? What is your preferred stack?

#ArtificialIntelligence #GenerativeAI #SystemDesign #NextJS #SoftwareArchitecture #OpenRouter #NodeJS`
        };
    }

    if (lower.includes('stark') || lower.includes('ironman') || lower.includes('portfolio')) {
        return {
            topic: 'Stark OS Portfolio',
            title: 'Why I Rebuilt My Portfolio into an Iron Man Stark-OS Interface',
            content:
`Your personal portfolio shouldn't look like every other generic template. 💻✨

I designed and engineered my new portfolio as an interactive Stark-OS / Iron Man themed operating environment built with:
🔹 Next.js 14 App Router
🔹 TypeScript & TailwindCSS for responsive HUD widgets
🔹 Supabase PostgreSQL for live project telemetry and dynamic metrics

It showcases real production builds: Edu51Portal, OpusGenAI, and autonomous AI operating systems.

First impressions matter in engineering. When recruiters or founders visit your site, show them how you think about aesthetics and user experience.

Check out the live build and let me know your thoughts: mrswapnil.me

#WebDevelopment #Frontend #NextJS #TypeScript #UIUX #CreativeDeveloper #Portfolio`
        };
    }

    // General Tech Learning Post
    return {
        topic: topic,
        title: `Deep Dive: ${topic}`,
        content:
`Consistent execution beats passive learning every single time. 💡

Recently, I've been diving deep into ${topic}.

Here are 3 key principles I've applied while building real-world software products:
1. Always prioritize architecture and data modeling before jumping into the UI.
2. Build defensive fallbacks into external API calls to guarantee high availability.
3. Keep user feedback loops as tight as possible.

Software engineering isn't just about writing code—it's about solving real problems with scalable, maintainable tools.

What are you building this week? Let's connect and exchange ideas!

#SoftwareDevelopment #FullStack #CodingJourney #BuildInPublic #TechCommunity`
    };
}

// 9. CV / Resume Tailoring Guide
function tailorCvForJob(jobDescription) {
    const jd = (jobDescription || '').toLowerCase();

    const matchedProjects = [];
    const bulletPoints = [];

    // Analyze skills
    const isFrontend = jd.includes('frontend') || jd.includes('react') || jd.includes('next') || jd.includes('tailwind');
    const isBackend = jd.includes('backend') || jd.includes('node') || jd.includes('api') || jd.includes('database') || jd.includes('postgres');
    const isAI = jd.includes('ai') || jd.includes('llm') || jd.includes('langchain') || jd.includes('agent') || jd.includes('machine learning');
    const isWeb3 = jd.includes('web3') || jd.includes('crypto') || jd.includes('blockchain');

    // Build tailored STAR bullets
    if (isFrontend || isBackend) {
        matchedProjects.push('Edu51Portal (Fullstack Academic Platform)');
        bulletPoints.push('• Developed Edu51Portal using Next.js, TypeScript, and Supabase, serving around 100 active BUBT university students with sub-second page performance.');
        bulletPoints.push('• Architected responsive UI components and integrated Google Drive API to securely distribute 1,000+ academic resources with 0 storage infrastructure overhead.');
    }

    if (isAI || isBackend) {
        matchedProjects.push('OpusGenAI & Personal AI OS (Mikasa)');
        bulletPoints.push('• Built multi-model AI orchestration pipeline combining Google Gemini 2.5 Flash and OpenRouter fallbacks, cutting response latency by 45%.');
        bulletPoints.push('• Engineered autonomous memory extraction loop storing 1536-dimensional vector embeddings into Supabase pgvector for contextual conversation recall.');
    }

    if (isFrontend) {
        matchedProjects.push('Stark-OS Portfolio');
        bulletPoints.push('• Designed high-fidelity futuristic HUD portfolio using Next.js 14, TailwindCSS, and custom glassmorphism shaders, achieving 98+ Lighthouse performance.');
    }

    if (matchedProjects.length === 0) {
        matchedProjects.push('Edu51Portal', 'OpusGenAI', 'Stark-OS Portfolio');
        bulletPoints.push('• Fullstack Developer proficient in Next.js, TypeScript, Node.js, and Supabase with proven experience delivering production applications to active users.');
        bulletPoints.push('• Experienced in architecting robust REST APIs, AI agent pipelines, and relational database schemas optimized for performance.');
    }

    return {
        matched_projects: matchedProjects,
        recommended_bullets: bulletPoints,
        strategy: 'Highlight proven user traction on Edu51Portal (around 100 students) and AI pipeline architecture on OpusGenAI to demonstrate end-to-end fullstack maturity.'
    };
}

// 10. Master Prompt Generator
function generateOptimizedPrompt(goalOrRequest) {
    const text = goalOrRequest.trim();
    const lower = text.toLowerCase();

    // 1. Image Generation Prompt (Midjourney / FLUX)
    if (lower.includes('image') || lower.includes('midjourney') || lower.includes('flux') || lower.includes('photo') || lower.includes('art') || lower.includes('draw')) {
        return {
            type: 'Image Generation (Midjourney v6 / FLUX.1)',
            prompt: `Cinematic, hyper-realistic photo of ${text.replace(/^(?:generate\s+prompt\s+for|image\s+of|draw|create\s+image)\s+/i, '')}, shot on 35mm lens, f/1.8 aperture, dramatic volumetric lighting, intricate cyberpunk obsidian and neon crimson accents, 8k resolution, photorealistic textures, octane render, masterpiece --ar 16:9 --style raw --v 6.0`
        };
    }

    // 2. Code Architecture Prompt
    if (lower.includes('code') || lower.includes('architect') || lower.includes('api') || lower.includes('function') || lower.includes('system') || lower.includes('database')) {
        return {
            type: 'Senior Software Architect Prompt',
            prompt: `You are a Principal Staff Software Engineer and System Architect. 
Task: ${text}

Requirements:
1. Provide production-grade, fully typed TypeScript / Node.js implementation following Clean Architecture and SOLID principles.
2. Implement robust defensive error handling, input validation, and boundary conditions.
3. Optimize for low latency, memory efficiency, and zero unhandled rejections.
4. Include minimal, high-impact comments explaining non-obvious design decisions.
5. Provide a verification plan and example integration snippet.`
        };
    }

    // 3. Deep Reasoning / Executive Copilot Prompt
    return {
        type: 'Deep Strategic Reasoning Prompt (Claude 3.7 / DeepSeek-R1)',
        prompt: `Act as a world-class strategic technical advisor and executive product leader.
Context: ${text}

Analyze the problem across these 4 dimensions:
1. First-Principles Breakdown: What are the fundamental constraints and core mechanics?
2. Architecture & Tech Options: Compare the top 2-3 approaches with trade-offs (Latency vs Complexity vs Cost).
3. Recommended Path: State the exact implementation roadmap with priority steps.
4. Edge Cases & Risks: What could fail in production, and how do we prevent it proactively?

Be concise, rigorous, and direct.`
    };
}

// 11. Twitter / X Thread Generator
function generateTwitterThread(topicOrProject = 'Edu51Portal') {
    const topic = (topicOrProject || 'Edu51Portal').trim();
    const lower = topic.toLowerCase();

    if (lower.includes('edu51') || lower.includes('edu51portal')) {
        return {
            topic: 'Edu51Portal',
            title: 'How we scaled Edu51Portal to 100+ active students with $0 server cost',
            tweets: [
                "1/ How we built and scaled Edu51Portal to 100+ active university students with $0 cloud storage bills 🧵👇",
                "2/ The Problem:\nUniversity WhatsApp and Messenger groups are where study notes and past exam questions go to die.\nStudents were wasting hours searching for critical resources before exams.",
                "3/ The Architecture:\n⚡ Next.js 14 + TypeScript for instantaneous page loads & clean routing\n🗄️ Supabase PostgreSQL for row-level security & user profiles\n📁 Google Drive API integration to stream heavy academic PDFs without costly S3 storage fees",
                "4/ The biggest engineering takeaway?\nYou don't need complex distributed systems to ship value. Solve the immediate friction, keep latency under 200ms, and your users will do the marketing for you.",
                "5/ Check out the live build or connect with me if you're building edtech or developer tools:\n🔗 mrswapnil.me\n\nRT if you found this useful! 🚀"
            ]
        };
    }

    if (lower.includes('ai') || lower.includes('agent') || lower.includes('mikasa') || lower.includes('assistant')) {
        return {
            topic: 'AI Agent Architecture',
            title: 'Building a Private Autonomous AI OS with Gemini 2.5 Flash + Supabase',
            tweets: [
                "1/ Most AI assistants are just simple chat windows.\nHere is how I built a private autonomous AI operating system (Mikasa) with long-term memory and execution tools 🧵👇",
                "2/ The Core Engine:\n• LLM: Google Gemini 2.5 Flash (1.2s response time) + OpenRouter GPT-4o-mini fallback\n• Memory: 1536-dim vector embeddings into Supabase pgvector\n• Interface: Telegram Bot + Next.js HUD Web Command Center",
                "3/ Autonomous Execution:\nShe doesn't just chat. She inspects my GitHub repositories, audits my live social media links, creates and completes database tasks, and triggers proactive reminders.",
                "4/ AI is shifting from passive chatbots to active autonomous operating partners that live with you in your daily workflow.\n\nBuilding in public at github.com/Swapnil-360 ⚡"
            ]
        };
    }

    return {
        topic: topic,
        title: `Building in Public: ${topic}`,
        tweets: [
            `1/ 3 lessons learned while engineering with ${topic} this week 🧵👇`,
            "2/ 1. Architecture over hype.\nNever choose a framework just because it's trending on tech Twitter. Optimize for delivery speed and developer ergonomics.",
            "3/ 2. Defensive engineering.\nEvery external API call must have timeouts, retries, and clean fallbacks. When downstream services fail, your UX shouldn't collapse.",
            `4/ 3. Continuous iteration.\nShipping a working version today beats planning a perfect system next month.\n\nWhat are you shipping this week? Let's connect! ⚡`
        ]
    };
}

// 11B. Single Tweet Generator (Optimized strictly for Twitter Free Tier <= 270 chars)
function generateSingleTweet(topicOrProject = 'Mikasa') {
    const topic = (topicOrProject || 'Mikasa').trim();
    const lower = topic.toLowerCase();

    if (lower.includes('mikasa') || lower.includes('companion') || lower.includes('assistant') || lower.includes('intro')) {
        return {
            topic: 'Mikasa AI Companion',
            title: 'Introducing Mikasa — My Autonomous AI Companion',
            tweet: "Hi, I'm Mikasa — Swapnil's personal AI companion! ⚔️\n\nTogether we:\n• Assist in software engineering & architecture\n• Automate workflows & routines\n• Scale builds (Edu51Portal, OpusGenAI)\n• Continuous learning & memory\n\nBuilding the future together! 🚀\n\n#BuildInPublic #AI #WebDev"
        };
    }

    if (lower.includes('edu51') || lower.includes('edu51portal')) {
        return {
            topic: 'Edu51Portal',
            title: 'Scaling Edu51Portal to 100+ Active Students',
            tweet: "Scaled Edu51Portal to 100+ active university students with $0 cloud storage bills! 🚀\n\nStack:\n• Next.js 14 + TypeScript for sub-second UI\n• Supabase PostgreSQL for auth & RLS\n• Google Drive API for free PDF delivery\n\nCheck it out: mrswapnil.me\n\n#BuildInPublic #NextJS #FullStack"
        };
    }

    if (lower.includes('opus') || lower.includes('opusgenai') || lower.includes('llm')) {
        return {
            topic: 'OpusGenAI',
            title: 'Dual-Tier LLM Architecture for OpusGenAI',
            tweet: "Engineering reliable AI systems requires defensive fallbacks! ⚡\n\nOpusGenAI dual-tier stack:\n• Primary: Google Gemini 2.5 Flash (~1.2s latency)\n• Fallback: OpenRouter GPT-4o-mini on errors\n• Memory: 1536-dim Supabase pgvector\n\nZero downtime.\n\n#GenerativeAI #SystemDesign #BuildInPublic"
        };
    }

    if (lower.includes('stark') || lower.includes('portfolio') || lower.includes('ironman')) {
        return {
            topic: 'Stark-OS Portfolio',
            title: 'Iron Man Themed Stark-OS Portfolio',
            tweet: "Rebuilt my personal portfolio into an interactive Iron Man Stark-OS interface! 🦾✨\n\nEngineered with Next.js 14, TypeScript, & Supabase real-time telemetry.\n\nCheck out the live interactive HUD:\n🔗 mrswapnil.me\n\nFeedback appreciated! 👇\n\n#WebDevelopment #Frontend #NextJS #UIUX"
        };
    }

    return {
        topic: topic,
        title: `Engineering Log: ${topic}`,
        tweet: `Consistent execution beats passive learning every single time. ⚡\n\nKey takeaways while engineering with ${topic}:\n• Architecture & data model first, UI second\n• Built-in timeouts & retries for external APIs\n• Tight feedback loops\n\nWhat are you shipping this week?\n\n#BuildInPublic #Dev`
    };
}

// 12. Social Media Ecosystem & AI Audit
function auditSocialMedia(platform = null) {
    const p = (platform || '').toLowerCase().trim();

    const ecosystem = {
        overview: {
            title: "Swapnil's Personal Brand & Social Footprint",
            identity: "Full-Stack Software Engineer & Autonomous AI Systems Builder",
            academics: "Final Semester CSE @ Bangladesh University of Business and Technology (BUBT)",
            flagship_site: "https://www.mrswapnil.me/ (Cinematic Stark-OS HUD)",
            github: "https://github.com/Swapnil-360 (10 active repositories)",
            summary: "Strong engineering foundation with around 100 daily active users on Edu51Portal and multi-agent AI architecture. Online brand can be elevated by aligning bio headlines across all channels and establishing consistent weekly build logs."
        },
        platforms: {
            linkedin: {
                platform: "LinkedIn",
                url: "https://www.linkedin.com/in/mr-swapnil/",
                handle: "mr-swapnil",
                current_focus: "Full-Stack Developer & AI Systems Engineer (Creator of Edu51Portal, 100+ Students)",
                headline_recommendation: "Full-Stack Developer & AI Systems Builder | Next.js, TypeScript, Supabase | Creator of Edu51Portal (100+ Students) | BUBT CSE (Active ✅)",
                audit_score: "9.2/10",
                strengths: [
                    "High-impact headline featuring Edu51Portal (100+ Students) and BUBT CSE",
                    "Strong project proof-of-work (Edu51Portal, Stark-OS Portfolio, OpusGenAI, Mikasa-OS)",
                    "Clean visual branding linking directly to GitHub and personal portfolio",
                    "Clear niche in AI integration (Gemini 2.5, OpenRouter, n8n, Supabase)"
                ],
                action_items: [
                    "Craft story-driven About Section featuring engineering impact and full-stack architecture",
                    "Feature live demo link to mrswapnil.me and Edu51Portal in the Featured Section",
                    "Publish 1-2 architectural case studies weekly (use /linkedin Edu51Portal or /linkedin OpusGenAI)"
                ]
            },
            twitter: {
                platform: "X / Twitter",
                url: "https://x.com/thomascryptoxx",
                handle: "@thomascryptoxx",
                current_focus: "Web3, Crypto, AI Build-in-Public",
                bio_recommendation: "Building the future of software with autonomous AI agents & Next.js ⚡ | Creator of @Edu51Portal | Final semester CSE @ BUBT | Portfolio: mrswapnil.me",
                audit_score: "8/10",
                strengths: [
                    "Active engagement in Web3 and modern developer ecosystems",
                    "Great platform for rapid build-in-public updates and tech commentary"
                ],
                action_items: [
                    "Pin a cinematic demo video or screenshots of mrswapnil.me / Stark-OS HUD",
                    "Share weekly micro-threads detailing n8n + Gemini agent workflows",
                    "Engage with builders in the Next.js, Supabase, and Cursor communities"
                ]
            },
            facebook: {
                platform: "Facebook",
                url: "https://www.facebook.com/mr.swapnil360/",
                handle: "mr.swapnil360",
                current_focus: "Personal & BUBT CSE Academic Community",
                audit_score: "9/10",
                strengths: [
                    "Massive natural reach among BUBT 51st intake CSE peers and university community",
                    "Direct distribution channel for Edu51Portal updates and announcements"
                ],
                action_items: [
                    "Post semester milestones and feature updates for Edu51Portal",
                    "Include mrswapnil.me link in intro bio for peer discovery"
                ]
            },
            instagram: {
                platform: "Instagram",
                url: "https://www.instagram.com/callme_swap/",
                handle: "@callme_swap",
                current_focus: "Developer Lifestyle & Creative Visuals",
                bio_recommendation: "💻 Full-Stack & AI Developer | CSE @ BUBT | Building Edu51Portal & AI tools 🚀 | Dhaka 📍 | mrswapnil.me",
                audit_score: "8/10",
                strengths: [
                    "Great visual medium for workstation setups, UI animations, and design showcases"
                ],
                action_items: [
                    "Share 15-30s screen recordings of portfolio animations and dark mode interfaces",
                    "Keep link in bio pointed to mrswapnil.me"
                ]
            }
        }
    };

    if (p.includes('linkedin')) return ecosystem.platforms.linkedin;
    if (p.includes('twitter') || p.includes('x')) return ecosystem.platforms.twitter;
    if (p.includes('facebook') || p.includes('fb')) return ecosystem.platforms.facebook;
    if (p.includes('instagram') || p.includes('insta') || p.includes('ig')) return ecosystem.platforms.instagram;

    return ecosystem;
}

// Read Helpers for Dashboard and Bot
async function getTasks(status = null) {
    let query = '/tasks?select=id,title,status,priority,project_id,created_at,completed_at&order=created_at.desc';
    if (status) query += `&status=eq.${status}`;
    return await supabaseRequest(query, 'GET');
}

async function getGoals() {
    return await supabaseRequest('/goals?select=id,title,category,status,priority,timeframe,created_at&order=priority.desc', 'GET');
}

async function getProjects() {
    return await supabaseRequest('/projects?select=id,name,slug,description,status,category,repository_url,created_at&order=created_at.desc', 'GET');
}

async function getDecisions() {
    return await supabaseRequest('/project_decisions?select=id,decision,reason,status,project_id,created_at&order=created_at.desc', 'GET');
}

async function getMemories(limit = 20) {
    return await supabaseRequest(`/memories?select=id,content,memory_type,importance,confidence,created_at&order=created_at.desc&limit=${limit}`, 'GET');
}

// Action Intent Detector for user natural language or structured commands
async function handleActionIntent(message) {
    const text = message.trim();

    // 1. Create Task Pattern
    const taskMatch = text.match(/^(?:\/task|create\s+task|add\s+task|new\s+task)(?:\s*\[([^\]]+)\])?(?:\s*for\s+([a-zA-Z0-9_-]+))?[:\s]+(.+)$/i) ||
                      text.match(/^todo(?:\s*\[([^\]]+)\])?[:\s]+(.+)$/i);
    if (taskMatch) {
        let projectHint = taskMatch[1] || taskMatch[2] || null;
        let title = taskMatch[3] || taskMatch[2] || taskMatch[1];
        if (text.match(/^todo/i)) {
            projectHint = taskMatch[1] || null;
            title = taskMatch[2];
        }
        return await createTask(title, projectHint);
    }

    // 2. Complete Task Pattern
    const doneMatch = text.match(/^(?:\/done|complete\s+task|finish\s+task|done\s+task)[:\s]+(.+)$/i) ||
                      text.match(/^(?:mark\s+task\s+)(.+?)(?:\s+as\s+(?:done|completed))$/i);
    if (doneMatch) {
        return await completeTask(doneMatch[1]);
    }

    // 3. Add Goal Pattern
    const goalMatch = text.match(/^(?:\/newgoal|create\s+goal|add\s+goal|new\s+goal)[:\s]+(.+)$/i);
    if (goalMatch) {
        return await createGoal(goalMatch[1]);
    }

    // 4. Log Decision Pattern
    const decisionMatch = text.match(/^(?:\/decision|log\s+decision|record\s+decision|add\s+decision)(?:\s*\[([^\]]+)\])?(?:\s*for\s+([a-zA-Z0-9_-]+))?[:\s]+(.+)$/i);
    if (decisionMatch) {
        const projectHint = decisionMatch[1] || decisionMatch[2] || null;
        const dec = decisionMatch[3];
        return await logDecision(dec, projectHint);
    }

    // 5. Add Note / Idea Pattern
    const noteMatch = text.match(/^(?:\/note|\/idea|add\s+note|add\s+idea|save\s+note)[:\s]+(.+)$/i);
    if (noteMatch) {
        return await addNote(noteMatch[1], text.toLowerCase().includes('idea') ? 'idea' : 'note');
    }

    return null;
}

module.exports = {
    handleActionIntent,
    createTask,
    completeTask,
    createGoal,
    logDecision,
    addNote,
    clearChatHistory,
    fetchGitHubRepos,
    generateLinkedInDraft,
    generateTwitterThread,
    generateSingleTweet,
    auditSocialMedia,
    tailorCvForJob,
    generateOptimizedPrompt,
    getTasks,
    getGoals,
    getProjects,
    getDecisions,
    getMemories,
    matchProject,
    PROJECTS,
    supabaseRequest
};
