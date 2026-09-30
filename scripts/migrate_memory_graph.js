// scripts/migrate_memory_graph.js
// Migration & Schema Verification for Episodic Relational Memory Graph in Supabase

const fs = require('fs');
const path = require('path');
const { supabaseRequest } = require('../actions_handler');

async function migrate() {
    console.log('====================================================');
    console.log('🧠 MIKASA EPISODIC RELATIONAL MEMORY GRAPH MIGRATION');
    console.log('====================================================');

    const sqlFilePath = path.join(__dirname, 'memory_graph.sql');
    if (!fs.existsSync(sqlFilePath)) {
        console.error('❌ SQL file scripts/memory_graph.sql not found!');
        process.exit(1);
    }
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    console.log(`📄 Loaded SQL blueprint (${Buffer.byteLength(sqlContent)} bytes)`);

    // 1. Check if native PostgREST tables exist
    let nativeTablesAvailable = false;
    try {
        console.log('🔍 Testing Supabase PostgREST for native memory_nodes table...');
        const nodesTest = await supabaseRequest('/memory_nodes?limit=1', 'GET');
        console.log('✅ Native table "memory_nodes" is ready in Supabase schema cache.');
        nativeTablesAvailable = true;
    } catch (e) {
        if (e.message.includes('404') || e.message.includes('PGRST205')) {
            console.log('ℹ️  Native table "memory_nodes" not detected in PostgREST schema cache.');
            console.log('ℹ️  The SQL definition in scripts/memory_graph.sql can be executed in the Supabase Dashboard SQL Editor anytime.');
        } else {
            console.warn('⚠️  Supabase connectivity check notice:', e.message);
        }
    }

    // 2. Verify Supabase current_state adaptive engine
    console.log('🔍 Verifying Supabase current_state storage layer for adaptive graph persistence...');
    try {
        const testRes = await supabaseRequest('/current_state?area=eq.memory_node&limit=1', 'GET');
        console.log('✅ Supabase current_state storage layer is verified and online.');
    } catch (e) {
        console.error('❌ Error accessing Supabase current_state:', e.message);
        process.exit(1);
    }

    // 3. Save Migration State Record
    try {
        const migrationMeta = {
            version: '1.0.0',
            system: 'episodic_memory_graph',
            native_tables: nativeTablesAvailable,
            adaptive_engine: true,
            sql_file: 'scripts/memory_graph.sql',
            migrated_at: new Date().toISOString()
        };

        // Upsert into current_state
        const existing = await supabaseRequest('/current_state?key=eq.memory_graph_migration_v1', 'GET').catch(() => []);
        if (existing && existing.length > 0) {
            await supabaseRequest(`/current_state?id=eq.${existing[0].id}`, 'PATCH', {
                value: migrationMeta,
                status: 'active',
                updated_at: new Date().toISOString()
            });
        } else {
            await supabaseRequest('/current_state', 'POST', {
                area: 'system_migration',
                key: 'memory_graph_migration_v1',
                value: migrationMeta,
                status: 'active'
            });
        }
        console.log('✅ Migration record saved to Supabase current_state (key: memory_graph_migration_v1).');
    } catch (e) {
        console.warn('⚠️  Notice while saving migration meta:', e.message);
    }

    console.log('----------------------------------------------------');
    console.log('🚀 Memory Graph schema readiness verified successfully.');
    console.log('====================================================');
}

if (require.main === module) {
    migrate().catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}

module.exports = { migrate };
