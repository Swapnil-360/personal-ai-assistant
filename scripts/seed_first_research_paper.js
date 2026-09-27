// scripts/seed_first_research_paper.js
// Seeds Swapnil's First Research Paper & Supervisor Shrabani Das into Supabase

const { supabaseRequest } = require('../actions_handler');

const RESEARCH_DATA = {
    paper_number: 1,
    designation: "First Research Paper",
    title: "Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite Question Answering",
    short_name: "CurricuRAG",
    supervisor: {
        name: "Shrabani Das",
        role: "Lecturer",
        department: "Department of Computer Science & Engineering",
        institution: "Bangladesh University of Business and Technology (BUBT)"
    },
    authors: [
        "Md. Jahidul Kamal Islam",
        "Md. Miftahur Rahman Swapnil",
        "Md. Asif Ali",
        "Shrabani Das",
        "Shefayatuj Johara Chowdhury"
    ],
    venue: "2026 IEEE International Conference on Optics, Machine Learning and Emerging Technology (OMLET)",
    location: "Nairobi, Kenya",
    dates: "29-31 October 2026",
    paper_id: "1017",
    status: "Accepted with Minor Revision",
    indexing: ["IEEE Xplore", "Scopus"]
};

async function main() {
    console.log('--- Anchoring Swapnil First Research Paper into Supabase ---');

    // 1. Current State
    try {
        console.log('1. Upserting into current_state...');
        await supabaseRequest('/current_state', 'POST', {
            area: 'research',
            key: 'first_research_paper',
            value: RESEARCH_DATA,
            status: 'active'
        }).catch(async (err) => {
            if (err.message && (err.message.includes('409') || err.message.includes('duplicate'))) {
                return await supabaseRequest('/current_state?key=eq.first_research_paper', 'PATCH', {
                    value: RESEARCH_DATA,
                    status: 'active',
                    updated_at: new Date().toISOString()
                });
            }
            throw err;
        });
        console.log('✅ current_state anchored with first research paper.');
    } catch (e) {
        console.warn('⚠️ current_state warning:', e.message);
    }

    // 2. High-importance fact memory
    try {
        console.log('2. Inserting memory...');
        const memContent = "Swapnil's First Research Paper: 'Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite Question Answering' (CurricuRAG). Supervised by Shrabani Das (Lecturer, Department of Computer Science & Engineering, BUBT). Authors: Md. Jahidul Kamal Islam, Md. Miftahur Rahman Swapnil, Md. Asif Ali, Shrabani Das, Shefayatuj Johara Chowdhury. Accepted with Minor Revision at 2026 IEEE OMLET (Paper ID: 1017).";

        await supabaseRequest('/memories', 'POST', {
            content: memContent,
            memory_type: 'fact',
            importance: 10,
            status: 'active',
            created_at: new Date().toISOString()
        });
        console.log('✅ Core research memory stored.');
    } catch (e) {
        console.warn('⚠️ Memory warning:', e.message);
    }

    // 3. Update CurricuRAG Project if exists
    try {
        console.log('3. Updating CurricuRAG project record...');
        const prj = await supabaseRequest('/projects?slug=eq.curricurag', 'GET').catch(() => []);
        if (Array.isArray(prj) && prj.length > 0) {
            const currentMetadata = prj[0].metadata || {};
            await supabaseRequest(`/projects?id=eq.${prj[0].id}`, 'PATCH', {
                description: 'Swapnil\'s First Research Paper: Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite QA. Supervised by Shrabani Das (Lecturer, CSE, BUBT). Accepted at IEEE OMLET 2026.',
                metadata: {
                    ...currentMetadata,
                    is_first_paper: true,
                    supervisor: 'Shrabani Das (Lecturer, Department of CSE, BUBT)',
                    full_title: 'Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite Question Answering'
                },
                updated_at: new Date().toISOString()
            });
            console.log('✅ CurricuRAG project record updated in Supabase.');
        }
    } catch (e) {
        console.warn('⚠️ Project update warning:', e.message);
    }

    // 4. Create Task to Track Portfolio Sync
    try {
        console.log('4. Logging portfolio update task...');
        const taskTitle = 'Update portfolio: Add supervisor Shrabani Das to CurricuRAG research paper (mrswapnil.me)';
        const existingTasks = await supabaseRequest(`/tasks?title=ilike.*Shrabani*&status=neq.completed`, 'GET').catch(() => []);
        if (!Array.isArray(existingTasks) || existingTasks.length === 0) {
            // Find project id for personal-portfolio or general
            const portPrj = await supabaseRequest('/projects?slug=eq.personal-portfolio', 'GET').catch(() => []);
            const projectId = portPrj?.[0]?.id || null;

            await supabaseRequest('/tasks', 'POST', {
                title: taskTitle,
                status: 'in_progress',
                priority: 7,
                project_id: projectId,
                created_at: new Date().toISOString()
            });
            console.log('✅ Task created: "' + taskTitle + '"');
        } else {
            console.log('ℹ️ Task already exists in Supabase.');
        }
    } catch (e) {
        console.warn('⚠️ Task creation warning:', e.message);
    }

    console.log('--- First Research Paper Seeding Complete! ---');
}

if (require.main === module) {
    main().catch(console.error);
}
