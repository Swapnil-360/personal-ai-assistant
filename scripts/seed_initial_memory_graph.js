// scripts/seed_initial_memory_graph.js
// Seeds Swapnil's core relational graph nodes and edges into Supabase

const { upsertNode, upsertEdge, traverseGraph, getGraphStats } = require('../memory_graph_engine');

async function seed() {
    console.log('====================================================');
    console.log('🌱 SEEDING CORE RELATIONAL MEMORY GRAPH');
    console.log('====================================================');

    // 1. Core Nodes
    const nodes = [
        {
            name: 'Swapnil',
            label: 'Person',
            slug: 'swapnil',
            properties: {
                role: 'Commander & Principal Architect',
                bio: 'Product Designer & Builder | AI, Frontend & Automation. BUBT CSE 51st intake.',
                location: 'Dhaka, Bangladesh',
                importance: 10
            }
        },
        {
            name: 'Mikasa',
            label: 'Person',
            slug: 'mikasa',
            properties: {
                role: 'Autonomous AI Operating System',
                loyalty: 'Absolute dedication to Commander Swapnil',
                creator: 'Swapnil',
                importance: 10
            }
        },
        {
            name: 'FC Barcelona',
            label: 'Preference',
            slug: 'fc_barcelona',
            properties: {
                type: 'Football Club',
                league: 'La Liga / UEFA Champions League',
                nicknames: ['Barça', 'Blaugrana'],
                emotional_weight: 'Lifelong passion'
            }
        },
        {
            name: 'Brazil National Football Team',
            label: 'Preference',
            slug: 'brazil',
            properties: {
                type: 'National Football Team',
                nicknames: ['Seleção', 'Canarinho', 'Pentacampeões'],
                emotional_weight: 'Primary international team passion'
            }
        },
        {
            name: 'Playing Football',
            label: 'Preference',
            slug: 'playing_football',
            properties: {
                type: 'Sport & Active Hobby',
                frequency: 'Regular hobby & fitness activity',
                passion: 'Playing on the pitch'
            }
        },
        {
            name: 'Edu51Portal',
            label: 'Project',
            slug: 'edu51portal',
            properties: {
                category: 'Academic Resource Platform',
                description: 'Academic portal serving ~100 active engineering students at BUBT',
                url: 'https://mrswapnil.me',
                status: 'Production / Scaled'
            }
        },
        {
            name: 'CurricuRAG',
            label: 'Project',
            slug: 'curricurag',
            properties: {
                category: 'Research Paper',
                title: 'Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite QA',
                accepted_at: 'IEEE OMLET 2026',
                supervisor: 'Shrabani Das'
            }
        },
        {
            name: 'Supabase',
            label: 'Technology',
            slug: 'supabase',
            properties: {
                type: 'Database & Cloud Backend',
                capabilities: ['PostgreSQL', 'Row-Level Security', 'pgvector', 'Realtime'],
                usage: 'Chosen database for Mikasa OS and Edu51Portal'
            }
        }
    ];

    console.log(`📌 Upserting ${nodes.length} core knowledge nodes...`);
    for (const node of nodes) {
        const saved = await upsertNode(node);
        console.log(`  ✓ Node [${saved.label}]: ${saved.name} (${saved.slug})`);
    }

    // 2. Core Relational Edges
    const edges = [
        {
            source_slug: 'swapnil',
            target_slug: 'fc_barcelona',
            relation: 'SUPPORTS',
            weight: 1.0,
            context: 'Lifelong favorite club team, closely tracks matches and news'
        },
        {
            source_slug: 'swapnil',
            target_slug: 'brazil',
            relation: 'SUPPORTS',
            weight: 1.0,
            context: 'Primary national team supported in world football'
        },
        {
            source_slug: 'swapnil',
            target_slug: 'playing_football',
            relation: 'PLAYS',
            weight: 0.95,
            context: 'Loves playing football on the pitch as a personal sport'
        },
        {
            source_slug: 'swapnil',
            target_slug: 'edu51portal',
            relation: 'CREATED',
            weight: 1.0,
            context: 'Sole architect and developer of Edu51Portal for BUBT students'
        },
        {
            source_slug: 'edu51portal',
            target_slug: 'supabase',
            relation: 'USES',
            weight: 1.0,
            context: 'Leverages Supabase PostgreSQL and Row-Level Security for student data'
        },
        {
            source_slug: 'swapnil',
            target_slug: 'curricurag',
            relation: 'RESEARCHED',
            weight: 1.0,
            context: 'Authored accepted IEEE OMLET 2026 research paper on curriculum graph retrieval'
        },
        {
            source_slug: 'mikasa',
            target_slug: 'swapnil',
            relation: 'PROTECTS',
            weight: 1.0,
            context: 'Mikasa is the personal autonomous AI guardian of Commander Swapnil'
        }
    ];

    console.log(`\n🔗 Upserting ${edges.length} relational edges...`);
    for (const edge of edges) {
        const saved = await upsertEdge(edge);
        console.log(`  ✓ Edge: (${edge.source_slug}) -[${edge.relation}]-> (${edge.target_slug})`);
    }

    // 3. Traversal Smoke Test
    console.log('\n🔎 Testing 2-hop traversal from "swapnil"...');
    const traversal = await traverseGraph('swapnil', 2);
    console.log(`  Connected nodes (${traversal.nodes.length}):`, traversal.nodes.map(n => n.name).join(', '));
    console.log(`  Connected edges (${traversal.edges.length}):`, traversal.edges.map(e => e.relation).join(', '));

    const stats = await getGraphStats();
    console.log('\n📊 Graph Statistics:');
    console.log(`  Total Nodes: ${stats.total_nodes}`);
    console.log(`  Total Edges: ${stats.total_edges}`);
    console.log('  Label Breakdown:', stats.label_breakdown);

    console.log('====================================================');
    console.log('✨ Seed graph successfully planted!');
    console.log('====================================================');
}

if (require.main === module) {
    seed().catch(err => {
        console.error('Seeding failed:', err);
        process.exit(1);
    });
}

module.exports = { seed };
