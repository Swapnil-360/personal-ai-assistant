// scripts/seed_deep_context.js
// Seeds Swapnil's Deep Context Profile (September 2026) into Supabase

const { supabaseRequest } = require('../actions_handler');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('--- Seeding Swapnil Deep Context Profile into Supabase ---');

    // 1. Update Profile Metadata
    try {
        const profiles = await supabaseRequest('/profiles?select=*', 'GET');
        if (profiles && profiles.length > 0) {
            const profile = profiles[0];
            const updatedMetadata = {
                ...(profile.metadata || {}),
                full_name: 'Md. Miftahur Rahman Swapnil',
                preferred_name: 'Swapnil',
                institution: 'Bangladesh University of Business and Technology (BUBT)',
                degree: 'Bachelor of Science in Computer Science & Engineering',
                current_stage: 'Final year / 9th semester',
                cgpa: 3.60,
                official_headline: 'Product Designer & Builder | Turning Real-World Problems into Digital Products | AI, Frontend & Automation | Creator of Edu51Portal | Final year CSE at BUBT',
                positioning: 'Product-oriented builder combining frontend development, AI, automation, product design, experimentation and problem solving.',
                core_philosophy: 'Problem → idea → prototype → experiment → deployment → improvement',
                learning_preference: 'What → Why → How → Example → Exact next step. No fluffy consultant talk.',
                scope_guard: 'Is this necessary for the current milestone?',
                coding_style: 'Build fast → understand critical parts deeply. Vibe coding workflow with architectural depth.'
            };

            await supabaseRequest(`/profiles?id=eq.${profile.id}`, 'PATCH', {
                career_direction: 'AI Product Engineer / Product Engineer',
                metadata: updatedMetadata,
                updated_at: new Date().toISOString()
            });
            console.log('✅ Profile table updated.');
        }
    } catch (e) {
        console.warn('Profile update warning:', e.message);
    }

    // 2. Upsert Current State for Deep Context
    try {
        const contextFilePath = path.join(__dirname, '..', 'SWAPNIL_DEEP_CONTEXT.md');
        const contextRaw = fs.readFileSync(contextFilePath, 'utf8');

        await supabaseRequest('/current_state', 'POST', {
            area: 'deep_context',
            key: 'swapnil_deep_profile_v2026',
            value: {
                version: 'September 2026',
                summary: 'Product Designer & Builder | Turning Real-World Problems into Digital Products',
                builder_mentality: 'Notices friction and asks whether software can remove it.',
                operating_principles: [
                    'Context → Accuracy → Practicality → Action',
                    'Ask "Is this necessary for the current milestone?" before scope expands',
                    'Build fast → understand critical parts deeply',
                    'Direct, human communication (never AI consultant buzzwords like delve, leverage, robust)',
                    'Trusted technical partner + personal assistant, not an obedient agree-bot'
                ]
            },
            status: 'active'
        }).catch(err => {
            if (err.message && err.message.includes('409')) {
                return supabaseRequest('/current_state?key=eq.swapnil_deep_profile_v2026', 'PATCH', {
                    value: {
                        version: 'September 2026',
                        summary: 'Product Designer & Builder | Turning Real-World Problems into Digital Products',
                        builder_mentality: 'Notices friction and asks whether software can remove it.',
                        operating_principles: [
                            'Context → Accuracy → Practicality → Action',
                            'Ask "Is this necessary for the current milestone?" before scope expands',
                            'Build fast → understand critical parts deeply',
                            'Direct, human communication (never AI consultant buzzwords like delve, leverage, robust)',
                            'Trusted technical partner + personal assistant, not an obedient agree-bot'
                        ]
                    },
                    updated_at: new Date().toISOString()
                });
            }
            throw err;
        });
        console.log('✅ current_state deep context anchored.');
    } catch (e) {
        console.warn('State anchoring warning:', e.message);
    }

    // 3. Insert Definitive Core Memories
    const coreMemories = [
        {
            content: "Swapnil's Core Identity: Product Designer & Builder who turns real-world problems into digital products through AI, frontend development, and automation. Final-year CSE at BUBT (Intake 51, CGPA 3.60). Never describe him as a generic full-stack developer.",
            memory_type: "fact",
            importance: 10
        },
        {
            content: "Mikasa's Role: Personal operating layer for Swapnil (Human → AI interface → memory → reasoning → automation → external systems). Mikasa must reduce cognitive load, provide honest technical critique, and challenge weak assumptions rather than being an agreeable chatbot.",
            memory_type: "instruction",
            importance: 10
        },
        {
            content: "Growth Challenge & Scope Guard: Swapnil tends to expand scope (Idea → build → solve → add feature → add another capability). Mikasa must guard against scope creep by asking: 'Is this necessary for the current milestone?' before allowing scope to expand.",
            memory_type: "preference",
            importance: 10
        },
        {
            content: "Communication Rules: Never use corporate consultant jargon ('delve into', 'leverage', 'robust solution', 'game changer', 'holistic approach', 'in today's fast-paced world'). Avoid excessive emojis and AI-sounding writing. Prefer: What → Why → How → Example → Exact next step.",
            memory_type: "preference",
            importance: 10
        },
        {
            content: "Coding Approach: 'Vibe coding' / AI-assisted development. Principle: 'Build fast → understand critical parts deeply.' Always explain the underlying architecture for security, backend, and critical logic.",
            memory_type: "workflow",
            importance: 9
        },
        {
            content: "Edu51Portal: Student academic platform for BUBT. Tech stack is Next.js/React, Supabase, Google Drive API, and Vercel. Supabase is the backend database — NEVER describe Edu51Portal as a Firebase project.",
            memory_type: "fact",
            importance: 10
        },
        {
            content: "OpusGenAI (opusgenai.com): AI-powered product photography & video generation SaaS using Next.js and Seedance API. Core principle: The user's uploaded product must remain the visual hero.",
            memory_type: "fact",
            importance: 9
        },
        {
            content: "Research Profile: 1) Smart Classroom (IEEE i-COSTE 2026, CoreWe5 team, ESP32 + Firebase RTDB for energy efficiency; do NOT call it behavior monitoring). 2) CurricuRAG (OMLET 2026, Paper ID 1017, Curriculum Knowledge Graphs + Graph Retrieval). 3) Active EEG biomedical AI research.",
            memory_type: "fact",
            importance: 10
        },
        {
            content: "Web3 Experience: Several years in crypto/community management/BD (including Biconomy listing partner). Swapnil's '3+ years experience' refers to Web3/community operations, not full-time software engineering.",
            memory_type: "experience",
            importance: 9
        },
        {
            content: "Accounts Map: Personal website https://www.mrswapnil.me/, GitHub https://github.com/Swapnil-360, Telegram @Swapnil3600 & @swapnil360, LinkedIn https://www.linkedin.com/in/mr-swapnil/, X @thomascryptoxx.",
            memory_type: "fact",
            importance: 9
        }
    ];

    console.log(`\n3. Inserting ${coreMemories.length} definitive core memories...`);
    for (const mem of coreMemories) {
        try {
            await supabaseRequest('/memories', 'POST', {
                ...mem,
                status: 'active',
                created_at: new Date().toISOString()
            });
            console.log(` - Saved memory [${mem.memory_type}]: ${mem.content.slice(0, 60)}...`);
        } catch (e) {
            console.warn(` - Could not save memory: ${e.message}`);
        }
    }

    console.log('\n--- Seeding Complete: Deep Context Profile successfully rooted in Mikasa! ---');
}

if (require.main === module) {
    main().catch(console.error);
}
