const { supabaseRequest } = require('../actions_handler');

async function seed() {
    console.log('Seeding Researcher Profile & Papers into Supabase...');

    // 1. Insert or update CurricuRAG project
    const existingCurricu = await supabaseRequest('/projects?slug=eq.curricurag', 'GET');
    let curricuId = 'b8e5c1d2-7a4f-4e9b-9c3a-1d5e7f8a9b0c';
    if (!existingCurricu || existingCurricu.length === 0) {
        const res = await supabaseRequest('/projects', 'POST', {
            id: curricuId,
            name: 'CurricuRAG',
            slug: 'curricurag',
            description: 'Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite Question Answering (OMLET 2026 IEEE, Accepted with Minor Revision, Paper ID: 1017)',
            category: 'Research',
            status: 'active',
            priority: 10,
            visibility: 'public',
            tech_stack: ['Python', 'PyTorch', 'R-GCN', 'DistMult', 'Sentence-BERT', 'Neo4j', 'Qwen2.5-7B-Instruct', '4-bit NF4', 'Knowledge Graphs', 'RAG'],
            metadata: {
                paper_id: '1017',
                conference: 'OMLET 2026',
                location: 'Nairobi, Kenya',
                dates: '29–31 October 2026',
                status: 'Accepted with Minor Revision',
                indexing: 'IEEE Xplore, Scopus',
                authors: ['Md. Jahidul Kamal Islam', 'Md. Miftahur Rahman', 'Md. Asif Ali', 'Shrabani Das', 'Shefayatuj Johara Chowdhury']
            }
        });
        console.log('CurricuRAG project created:', res[0]?.name || 'Created');
    } else {
        curricuId = existingCurricu[0].id;
        console.log('CurricuRAG project already exists:', curricuId);
    }

    // 2. Update Smart Classroom project in Supabase
    await supabaseRequest('/projects?slug=eq.smart-classroom', 'PATCH', {
        description: 'AI-Enabled Smart Classroom Monitoring and Safety Automation (Supervised by Sadah Anjum Shanto, Assistant Professor, BUBT)',
        category: 'Research',
        tech_stack: ['ESP32 DevKit', 'ESP32-CAM', 'Expo Android App', 'Firebase Realtime Database', 'DHT11', 'PIR', 'HC-SR04', 'Servo Motor', 'Sound Sensor', 'LDR', 'Edge AI', 'Computer Vision'],
        metadata: {
            supervisor: 'Sadah Anjum Shanto',
            institution: 'BUBT CSE',
            authors: ['Nishat Anjum Sara', 'Sheikh Shamia Hasan Nila', 'Md. Asif Ali', 'Md. Jahidul Kamal Islam', 'Md. Miftahur Rahman Swapnil'],
            modes: ['Normal Mode', 'Lecture Mode']
        }
    }).catch(e => console.warn('Smart Classroom patch warning:', e.message));
    console.log('Smart Classroom project updated.');

    // 3. Insert Architectural Decision
    await supabaseRequest('/project_decisions', 'POST', {
        project_id: curricuId,
        decision: 'Strict separation of CurricuRAG and Smart Classroom research projects.',
        reason: 'CurricuRAG (AI + KG + RAG + GNN + LLM) and Smart Classroom (IoT + ESP32 + CV + Safety Automation) are independent research efforts. Do not merge their architectures, datasets, results, or technologies unless explicitly requested.',
        status: 'active'
    }).catch(e => console.warn('Decision insert warning:', e.message));

    // 4. Save to current_state area: 'research_profile'
    const researchProfileState = {
        researcher: {
            name: 'Md. Miftahur Rahman Swapnil',
            institution: 'Bangladesh University of Business and Technology (BUBT)',
            department: 'Department of Computer Science and Engineering (CSE)',
            role: 'CSE Student and Undergraduate Researcher',
            country: 'Bangladesh',
            domains: [
                'Artificial Intelligence and Large Language Models',
                'Knowledge Graphs and Retrieval-Augmented Generation',
                'Graph Neural Networks and relation-aware retrieval',
                'IoT and AI-enabled smart environments',
                'Computer vision and edge devices',
                'EEG-based AI research (target 2026)',
                'Intelligent educational systems',
                'Applied machine learning'
            ]
        },
        paper_01: {
            title: 'Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite Question Answering',
            short_name: 'CurricuRAG',
            conference: '2026 IEEE International Conference on Optics, Machine Learning and Emerging Technology (OMLET)',
            location: 'Nairobi, Kenya',
            dates: '29–31 October 2026',
            paper_id: '1017',
            status: 'Accepted with Minor Revision',
            admin_status: 'Publication fees settled, IEEE Electronic Publication Agreement signed by Shrabani Das on 10-09-2026',
            indexing: 'IEEE Xplore, Scopus',
            authors: ['Md. Jahidul Kamal Islam', 'Md. Miftahur Rahman', 'Md. Asif Ali', 'Shrabani Das', 'Shefayatuj Johara Chowdhury'],
            kg_stats: { nodes: 418, concepts: 305, courses: 113, edges: 558, auxiliary_triples: 95, verification: 'Neo4j' },
            architecture: { encoder: '2-layer R-GCN (384-d Sentence-BERT)', decoder: 'DistMult', generator: 'Qwen2.5-7B-Instruct (4-bit NF4 local)' },
            results: { exact_set_match: '45.5%', text_rag: '22.7%', closed_book_llm: '12.7%', entity_f1: '63.8%', correct_abstention_rate: '100% (24/24)', precision: '52.2%', unseen_triple_exact_match: '37.7% (vs 3-5% baselines)' }
        },
        paper_02: {
            title: 'AI-Enabled Smart Classroom Monitoring and Safety Automation',
            institution: 'BUBT CSE',
            supervisor: 'Sadah Anjum Shanto (Assistant Professor)',
            authors: ['Nishat Anjum Sara', 'Sheikh Shamia Hasan Nila', 'Md. Asif Ali', 'Md. Jahidul Kamal Islam', 'Md. Miftahur Rahman Swapnil'],
            hardware: { controller: 'ESP32 DevKit', camera: 'ESP32-CAM', backend: 'Firebase Realtime Database', app: 'Expo Android' },
            pinout: { DHT11: 4, Sound: 5, PIR: 13, HC_SR04_Trig: 12, HC_SR04_Echo: 14, Servo: 15, Alert_Buzzer: 19, Emergency_Buzzer: 18, LEDs: [21, 22, 23], Touch: 27, LDR: 34 },
            modes: ['Normal Mode', 'Lecture Mode']
        },
        pipeline: {
            upcoming: 'EEG-based AI research paper targeted for 2026 completion (details strictly to be added once finalized, do not invent)'
        },
        updated_at: new Date().toISOString()
    };

    try {
        await supabaseRequest('/current_state', 'POST', {
            area: 'research_profile',
            key: 'swapnil_research_portfolio',
            value: researchProfileState,
            status: 'active'
        });
        console.log('Saved research profile state.');
    } catch(e) {
        if (e.message && e.message.includes('409')) {
            await supabaseRequest('/current_state?key=eq.swapnil_research_portfolio', 'PATCH', {
                value: researchProfileState
            });
            console.log('Patched research profile state.');
        }
    }

    // 5. Insert structured memories into Supabase memories table
    const memoryItems = [
        {
            content: 'Swapnil is an undergraduate CSE researcher at BUBT (Bangladesh University of Business and Technology). Active research portfolio spans AI/LLMs, Knowledge Graphs, GNNs, IoT smart environments, edge computer vision, and biomedical AI. He is currently working toward completing an additional EEG-based research paper within 2026.',
            memory_type: 'fact',
            importance: 10,
            confidence: 1.0,
            metadata: { domain: 'research', tag: 'researcher_profile', institution: 'BUBT' }
        },
        {
            content: 'Research Paper 01: "Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite Question Answering" (CurricuRAG). Authors: Md. Jahidul Kamal Islam, Md. Miftahur Rahman, Md. Asif Ali, Shrabani Das, Shefayatuj Johara Chowdhury (BUBT CSE). Accepted with Minor Revision at 2026 IEEE OMLET (Nairobi, Kenya, 29-31 Oct 2026). Paper ID: 1017. Fees settled, IEEE Electronic Publication Agreement signed by Shrabani Das on 10-09-2026. Scheduled for IEEE Xplore & Scopus.',
            memory_type: 'fact',
            importance: 10,
            confidence: 1.0,
            metadata: { domain: 'research', tag: 'curricurag', conference: 'OMLET 2026', paper_id: '1017' }
        },
        {
            content: 'CurricuRAG Knowledge Graph & Architecture: Curriculum KG built deterministically from departmental layouts, verified in Neo4j. 418 nodes (305 concepts, 113 courses), 558 typed edges (PREREQUISITE_OF, PART_OF, TAUGHT_IN, REQUIRES), 95 auxiliary training-split triples to prevent data leakage. Retriever: 2-layer Relational Graph Convolution Network (R-GCN) encoder with 384-d Sentence-BERT node embeddings + DistMult decoder (relation-specific Wr parameters, 0 query-time LLM calls, no LLM fine-tuning). Generator: Qwen2.5-7B-Instruct (local inference, 4-bit NF4) with strict fact-list grounding & 100% correct abstention mechanism.',
            memory_type: 'fact',
            importance: 10,
            confidence: 1.0,
            metadata: { domain: 'research', tag: 'curricurag_architecture', model: 'R-GCN, Qwen2.5-7B-Instruct' }
        },
        {
            content: 'CurricuRAG Key Experimental Results: On 220 held-out questions: Exact-set match 45.5% (vs Text-RAG 22.7% and Closed-Book LLM 12.7%). Entity F1: 63.8%. Correct abstention rate on 24 unanswerable questions: 100% (24/24 correct). Precision: 52.2%. On 61 unseen-triple subset: CurricuRAG achieved 37.7% exact-set match evaluating structural generalization (vs baselines achieving ~3%-5%).',
            memory_type: 'fact',
            importance: 10,
            confidence: 1.0,
            metadata: { domain: 'research', tag: 'curricurag_results', metrics: '45.5% exact-set, 100% abstention' }
        },
        {
            content: 'Research Paper 02: "AI-Enabled Smart Classroom Monitoring and Safety Automation". BUBT CSE. Supervisor: Sadah Anjum Shanto (Assistant Professor). Authors: Nishat Anjum Sara, Sheikh Shamia Hasan Nila, Md. Asif Ali, Md. Jahidul Kamal Islam, Md. Miftahur Rahman Swapnil. Controller: ESP32 DevKit, Visual: ESP32-CAM, App: Expo Android, DB: Firebase Realtime Database. GPIOs: DHT11 (GPIO 4), Sound (GPIO 5), PIR (GPIO 13), HC-SR04 Trig (GPIO 12)/Echo (GPIO 14), Servo (GPIO 15; 110 open, 0 closed), Alert buzzer (GPIO 19), Emergency buzzer (GPIO 18), LEDs (GPIO 21, 22, 23), Touch (GPIO 27), LDR (GPIO 34). Operating modes: Normal Mode & Lecture Mode. Focus: Environmental monitoring & safety automation (avoid describing as behavior monitoring).',
            memory_type: 'fact',
            importance: 10,
            confidence: 1.0,
            metadata: { domain: 'research', tag: 'smart_classroom', supervisor: 'Sadah Anjum Shanto' }
        },
        {
            content: 'Academic Research Style Guidelines for Swapnil: 1) Strict project distinction: CurricuRAG (AI+KG+RAG+GNN+LLM) and Smart Classroom (IoT+ESP32+CV+Safety) are strictly separate projects; never merge their architectures or datasets. 2) Never fabricate datasets, experimental results, citations, or author details. 3) Preserve exact reported numbers. 4) Explain concept first, then how it applies to researcher\'s system. 5) Upcoming EEG research paper is targeting 2026 completion (do not invent architecture/results until finalized).',
            memory_type: 'fact',
            importance: 10,
            confidence: 1.0,
            metadata: { domain: 'research', tag: 'guidelines', audience: 'Swapnil' }
        }
    ];

    for (const m of memoryItems) {
        try {
            await supabaseRequest('/memories', 'POST', {
                ...m,
                source_type: 'researcher_profile_seed',
                status: 'active'
            });
            console.log('Inserted memory:', m.metadata.tag);
        } catch(e) {
            console.warn('Memory insert warning for', m.metadata.tag, e.message);
        }
    }

    console.log('All research profile data seeded successfully into Supabase!');
}

seed().catch(console.error);
