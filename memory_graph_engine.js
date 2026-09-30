// memory_graph_engine.js
// Episodic Relational Memory Graph Engine for Mikasa OS
// Spec: docs/EPISODIC_MEMORY_GRAPH_SPEC.md

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { supabaseRequest } = require('./actions_handler');

// Load environment variables if not already in process.env
function getEnv(key) {
    if (process.env[key]) return process.env[key].trim();
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(new RegExp(`^${key}=([^\\r\\n]+)`, 'm'));
            if (match) return match[1].trim();
        }
    } catch (e) {}
    return null;
}

// Known entity alias dictionary for normalization
const ALIAS_MAP = {
    'barca': 'fc_barcelona',
    'barcelona': 'fc_barcelona',
    'fc barcelona': 'fc_barcelona',
    'fcb': 'fc_barcelona',
    'blaugrana': 'fc_barcelona',
    'brazil': 'brazil_national_football_team',
    'brazil national football team': 'brazil_national_football_team',
    'selecao': 'brazil_national_football_team',
    'seleção': 'brazil_national_football_team',
    'canarinho': 'brazil_national_football_team',
    'playing football': 'playing_football',
    'football': 'playing_football',
    'cricket': 'cricket',
    'edu51': 'edu51portal',
    'edu51portal': 'edu51portal',
    'curricurag': 'curricurag',
    'smart classroom': 'smart_classroom',
    'smart_classroom': 'smart_classroom',
    'supabase': 'supabase',
    'postgresql': 'supabase',
    'swapnil': 'swapnil',
    'miftahur': 'swapnil',
    'commander swapnil': 'swapnil',
    'mikasa': 'mikasa',
    'mikasa ackerman': 'mikasa'
};

// Node Label Visual Color Tokens (Dark Cyberpunk HUD)
const LABEL_COLORS = {
    'Person': { background: '#0e7490', border: '#06b6d4', text: '#ffffff', highlight: { background: '#0891b2', border: '#22d3ee' } }, // Cyan
    'Project': { background: '#b45309', border: '#f59e0b', text: '#ffffff', highlight: { background: '#d97706', border: '#fbbf24' } }, // Amber
    'Decision': { background: '#6d28d9', border: '#8b5cf6', text: '#ffffff', highlight: { background: '#7c3aed', border: '#a78bfa' } }, // Neon Violet
    'Preference': { background: '#be185d', border: '#ec4899', text: '#ffffff', highlight: { background: '#db2777', border: '#f472b6' } }, // Pink / Crimson
    'Technology': { background: '#1d4ed8', border: '#3b82f6', text: '#ffffff', highlight: { background: '#2563eb', border: '#60a5fa' } }, // Blue
    'Event': { background: '#047857', border: '#10b981', text: '#ffffff', highlight: { background: '#059669', border: '#34d399' } } // Emerald
};

function slugify(name) {
    if (!name) return 'unknown';
    const clean = String(name).trim().toLowerCase();
    if (ALIAS_MAP[clean]) return ALIAS_MAP[clean];
    
    // Normalize string: alphanumeric and underscores
    const slug = clean
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    
    return ALIAS_MAP[slug] || slug || 'entity';
}

// In-memory fast cache
let nodeCache = new Map();
let edgeCache = new Map();
let lastCacheSync = 0;
const CACHE_TTL_MS = 15000; // 15 seconds

let useNativeTables = null; // null: unverified, true: native, false: current_state

async function checkStorageDriver() {
    if (useNativeTables !== null) return useNativeTables;
    try {
        await supabaseRequest('/memory_nodes?limit=1', 'GET');
        useNativeTables = true;
    } catch (e) {
        useNativeTables = false;
    }
    return useNativeTables;
}

// --- NODE OPERATIONS ---

async function upsertNode({ label, name, slug, properties = {}, status = 'active' }) {
    if (!name) throw new Error('Node name is required');
    const finalSlug = slug ? slugify(slug) : slugify(name);
    const finalLabel = label || 'Concept';
    const isNative = await checkStorageDriver();
    const now = new Date().toISOString();

    if (isNative) {
        // PostgREST native table
        const existing = await supabaseRequest(`/memory_nodes?slug=eq.${encodeURIComponent(finalSlug)}`, 'GET').catch(() => []);
        if (existing && existing.length > 0) {
            const updated = await supabaseRequest(`/memory_nodes?id=eq.${existing[0].id}`, 'PATCH', {
                label: finalLabel,
                name: name,
                properties: { ...(existing[0].properties || {}), ...properties },
                status: status,
                updated_at: now
            });
            const res = updated && updated[0] ? updated[0] : { ...existing[0], label: finalLabel, name, properties: { ...(existing[0].properties || {}), ...properties }, status, updated_at: now };
            nodeCache.set(finalSlug, res);
            return res;
        } else {
            const inserted = await supabaseRequest('/memory_nodes', 'POST', {
                id: crypto.randomUUID(),
                label: finalLabel,
                name: name,
                slug: finalSlug,
                properties: properties,
                status: status,
                created_at: now,
                updated_at: now
            });
            const res = inserted && inserted[0] ? inserted[0] : { id: crypto.randomUUID(), label: finalLabel, name, slug: finalSlug, properties, status, created_at: now, updated_at: now };
            nodeCache.set(finalSlug, res);
            return res;
        }
    } else {
        // Supabase current_state adaptive engine
        const existing = await supabaseRequest(`/current_state?area=eq.memory_node&key=eq.${encodeURIComponent(finalSlug)}`, 'GET').catch(() => []);
        if (existing && existing.length > 0) {
            const prevVal = existing[0].value || {};
            const mergedVal = {
                id: prevVal.id || existing[0].id,
                label: finalLabel,
                name: name,
                slug: finalSlug,
                properties: { ...(prevVal.properties || {}), ...properties },
                status: status,
                created_at: prevVal.created_at || existing[0].created_at || now,
                updated_at: now
            };
            await supabaseRequest(`/current_state?id=eq.${existing[0].id}`, 'PATCH', {
                value: mergedVal,
                status: status,
                updated_at: now
            });
            nodeCache.set(finalSlug, mergedVal);
            return mergedVal;
        } else {
            const newId = crypto.randomUUID();
            const newVal = {
                id: newId,
                label: finalLabel,
                name: name,
                slug: finalSlug,
                properties: properties,
                status: status,
                created_at: now,
                updated_at: now
            };
            await supabaseRequest('/current_state', 'POST', {
                area: 'memory_node',
                key: finalSlug,
                value: newVal,
                status: status,
                created_at: now,
                updated_at: now
            });
            nodeCache.set(finalSlug, newVal);
            return newVal;
        }
    }
}

async function getNode(slug) {
    const finalSlug = slugify(slug);
    if (nodeCache.has(finalSlug)) return nodeCache.get(finalSlug);

    const isNative = await checkStorageDriver();
    if (isNative) {
        const rows = await supabaseRequest(`/memory_nodes?slug=eq.${encodeURIComponent(finalSlug)}&limit=1`, 'GET').catch(() => []);
        if (rows && rows.length > 0) {
            nodeCache.set(finalSlug, rows[0]);
            return rows[0];
        }
    } else {
        const rows = await supabaseRequest(`/current_state?area=eq.memory_node&key=eq.${encodeURIComponent(finalSlug)}&limit=1`, 'GET').catch(() => []);
        if (rows && rows.length > 0) {
            const val = rows[0].value || {};
            nodeCache.set(finalSlug, val);
            return val;
        }
    }
    return null;
}

// --- EDGE OPERATIONS ---

async function upsertEdge({ source_slug, target_slug, relation, weight = 1.0, context = '', valid_from, valid_until = null }) {
    if (!source_slug || !target_slug || !relation) {
        throw new Error('source_slug, target_slug, and relation are required');
    }
    const sSlug = slugify(source_slug);
    const tSlug = slugify(target_slug);
    const rel = relation.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    const edgeKey = `${sSlug}->${rel}->${tSlug}`;

    // Ensure both nodes exist
    let sourceNode = await getNode(sSlug);
    if (!sourceNode) {
        sourceNode = await upsertNode({ label: 'Concept', name: source_slug, slug: sSlug });
    }
    let targetNode = await getNode(tSlug);
    if (!targetNode) {
        targetNode = await upsertNode({ label: 'Concept', name: target_slug, slug: tSlug });
    }

    const isNative = await checkStorageDriver();
    const now = new Date().toISOString();
    const fromTime = valid_from || now;

    if (isNative) {
        // Query existing active edge
        const existing = await supabaseRequest(
            `/memory_edges?source_id=eq.${sourceNode.id}&target_id=eq.${targetNode.id}&relation=eq.${rel}&valid_until=is.null`,
            'GET'
        ).catch(() => []);

        if (existing && existing.length > 0) {
            const updated = await supabaseRequest(`/memory_edges?id=eq.${existing[0].id}`, 'PATCH', {
                weight: weight,
                context: context || existing[0].context,
                valid_until: valid_until,
                updated_at: now
            });
            const res = updated && updated[0] ? updated[0] : { ...existing[0], weight, context, valid_until, updated_at: now };
            edgeCache.set(edgeKey, res);
            return res;
        } else {
            const inserted = await supabaseRequest('/memory_edges', 'POST', {
                id: crypto.randomUUID(),
                source_id: sourceNode.id,
                target_id: targetNode.id,
                relation: rel,
                weight: weight,
                context: context,
                valid_from: fromTime,
                valid_until: valid_until,
                created_at: now,
                updated_at: now
            });
            const res = inserted && inserted[0] ? inserted[0] : {
                id: crypto.randomUUID(),
                source_id: sourceNode.id,
                target_id: targetNode.id,
                relation: rel,
                weight: weight,
                context: context,
                valid_from: fromTime,
                valid_until: valid_until
            };
            edgeCache.set(edgeKey, res);
            return res;
        }
    } else {
        const existing = await supabaseRequest(`/current_state?area=eq.memory_edge&key=eq.${encodeURIComponent(edgeKey)}`, 'GET').catch(() => []);
        if (existing && existing.length > 0) {
            const prevVal = existing[0].value || {};
            const mergedVal = {
                id: prevVal.id || existing[0].id,
                source_id: sourceNode.id,
                target_id: targetNode.id,
                source_slug: sSlug,
                target_slug: tSlug,
                relation: rel,
                weight: weight,
                context: context || prevVal.context || '',
                valid_from: prevVal.valid_from || fromTime,
                valid_until: valid_until !== undefined ? valid_until : prevVal.valid_until,
                created_at: prevVal.created_at || now,
                updated_at: now
            };
            await supabaseRequest(`/current_state?id=eq.${existing[0].id}`, 'PATCH', {
                value: mergedVal,
                status: valid_until ? 'superseded' : 'active',
                updated_at: now
            });
            edgeCache.set(edgeKey, mergedVal);
            return mergedVal;
        } else {
            const newId = crypto.randomUUID();
            const newVal = {
                id: newId,
                source_id: sourceNode.id,
                target_id: targetNode.id,
                source_slug: sSlug,
                target_slug: tSlug,
                relation: rel,
                weight: weight,
                context: context,
                valid_from: fromTime,
                valid_until: valid_until,
                created_at: now,
                updated_at: now
            };
            await supabaseRequest('/current_state', 'POST', {
                area: 'memory_edge',
                key: edgeKey,
                value: newVal,
                status: valid_until ? 'superseded' : 'active',
                created_at: now,
                updated_at: now
            });
            edgeCache.set(edgeKey, newVal);
            return newVal;
        }
    }
}

// Invalidate or supersede an existing relationship
async function supersedeEdge({ source_slug, target_slug, relation }) {
    const sSlug = slugify(source_slug);
    const tSlug = slugify(target_slug);
    const rel = relation.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    const edgeKey = `${sSlug}->${rel}->${tSlug}`;
    const now = new Date().toISOString();

    const isNative = await checkStorageDriver();
    if (isNative) {
        const sourceNode = await getNode(sSlug);
        const targetNode = await getNode(tSlug);
        if (sourceNode && targetNode) {
            await supabaseRequest(
                `/memory_edges?source_id=eq.${sourceNode.id}&target_id=eq.${targetNode.id}&relation=eq.${rel}&valid_until=is.null`,
                'PATCH',
                { valid_until: now, updated_at: now }
            ).catch(() => {});
        }
    } else {
        const existing = await supabaseRequest(`/current_state?area=eq.memory_edge&key=eq.${encodeURIComponent(edgeKey)}`, 'GET').catch(() => []);
        if (existing && existing.length > 0) {
            const val = { ...(existing[0].value || {}), valid_until: now, updated_at: now };
            await supabaseRequest(`/current_state?id=eq.${existing[0].id}`, 'PATCH', {
                value: val,
                status: 'superseded',
                valid_until: now,
                updated_at: now
            }).catch(() => {});
        }
    }
    edgeCache.delete(edgeKey);
}

// --- FETCH ALL ACTIVE GRAPH DATA ---

async function getAllGraphData() {
    const isNative = await checkStorageDriver();
    let rawNodes = [];
    let rawEdges = [];

    if (isNative) {
        rawNodes = await supabaseRequest('/memory_nodes?status=eq.active&select=*', 'GET').catch(() => []);
        rawEdges = await supabaseRequest('/memory_edges?valid_until=is.null&select=*', 'GET').catch(() => []);
    } else {
        const nodeRows = await supabaseRequest('/current_state?area=eq.memory_node&status=eq.active&select=*', 'GET').catch(() => []);
        rawNodes = nodeRows.map(r => r.value || {}).filter(n => n.name && n.slug);

        const edgeRows = await supabaseRequest('/current_state?area=eq.memory_edge&status=eq.active&select=*', 'GET').catch(() => []);
        rawEdges = edgeRows.map(r => r.value || {}).filter(e => e.source_id && e.target_id && !e.valid_until);
    }

    // Map id-to-node for fast lookup
    const nodeById = new Map();
    const nodeBySlug = new Map();
    rawNodes.forEach(n => {
        if (n.id) nodeById.set(n.id, n);
        if (n.slug) nodeBySlug.set(n.slug, n);
    });

    // Format for Vis.js Network
    const visNodes = rawNodes.map(n => {
        const colors = LABEL_COLORS[n.label] || { background: '#334155', border: '#64748b', text: '#ffffff' };
        return {
            id: n.id,
            label: n.name,
            group: n.label,
            slug: n.slug,
            properties: n.properties || {},
            color: colors,
            shape: 'box',
            margin: 10,
            font: { color: colors.text, size: 14, face: 'Inter, system-ui, sans-serif' },
            shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 5, x: 2, y: 2 }
        };
    });

    const visEdges = rawEdges.map(e => {
        return {
            id: e.id,
            from: e.source_id,
            to: e.target_id,
            label: e.relation,
            title: e.context || e.relation,
            arrows: { to: { enabled: true, scaleFactor: 0.8 } },
            font: { color: '#94a3b8', size: 11, align: 'middle', background: '#090d16' },
            color: { color: '#334155', highlight: '#06b6d4', hover: '#38bdf8' },
            smooth: { type: 'curvedCW', roundness: 0.15 },
            width: Math.max(1, (e.weight || 1) * 1.5)
        };
    });

    return {
        nodes: visNodes,
        edges: visEdges,
        raw_nodes: rawNodes,
        raw_edges: rawEdges
    };
}

// --- MULTI-HOP RELATIONAL TRAVERSAL ---

async function traverseGraph(rootSlug, maxDepth = 2) {
    const slug = slugify(rootSlug);
    const { raw_nodes, raw_edges } = await getAllGraphData();

    const nodeById = new Map();
    const nodeBySlug = new Map();
    raw_nodes.forEach(n => {
        nodeById.set(n.id, n);
        nodeBySlug.set(n.slug, n);
    });

    const rootNode = nodeBySlug.get(slug);
    if (!rootNode) {
        return { root: null, nodes: [], edges: [], summary: `No entity found matching slug "${slug}"` };
    }

    // Adjacency mapping: node_id -> array of { neighbor_id, edge }
    const adj = new Map();
    raw_edges.forEach(e => {
        if (!adj.has(e.source_id)) adj.set(e.source_id, []);
        if (!adj.has(e.target_id)) adj.set(e.target_id, []);
        adj.get(e.source_id).push({ neighbor_id: e.target_id, edge: e, direction: 'outgoing' });
        adj.get(e.target_id).push({ neighbor_id: e.source_id, edge: e, direction: 'incoming' });
    });

    // BFS Traversal up to maxDepth
    const visitedNodes = new Set([rootNode.id]);
    const visitedEdges = new Map(); // edge_id -> edge
    let currentQueue = [rootNode.id];
    let depth = 0;

    while (currentQueue.length > 0 && depth < maxDepth) {
        const nextQueue = [];
        for (const currId of currentQueue) {
            const neighbors = adj.get(currId) || [];
            for (const { neighbor_id, edge } of neighbors) {
                if (!visitedEdges.has(edge.id)) {
                    visitedEdges.set(edge.id, edge);
                }
                if (!visitedNodes.has(neighbor_id)) {
                    visitedNodes.add(neighbor_id);
                    nextQueue.push(neighbor_id);
                }
            }
        }
        currentQueue = nextQueue;
        depth++;
    }

    const resultNodes = Array.from(visitedNodes).map(id => nodeById.get(id)).filter(Boolean);
    const resultEdges = Array.from(visitedEdges.values());

    return {
        root: rootNode,
        nodes: resultNodes,
        edges: resultEdges,
        depth: depth,
        total_connected: resultNodes.length - 1
    };
}

// --- GRAPH STATISTICS ---

async function getGraphStats() {
    const { raw_nodes, raw_edges } = await getAllGraphData();

    const labelBreakdown = {};
    raw_nodes.forEach(n => {
        labelBreakdown[n.label] = (labelBreakdown[n.label] || 0) + 1;
    });

    // Degree counting
    const degrees = new Map();
    raw_edges.forEach(e => {
        degrees.set(e.source_id, (degrees.get(e.source_id) || 0) + 1);
        degrees.set(e.target_id, (degrees.get(e.target_id) || 0) + 1);
    });

    const topNodes = raw_nodes
        .map(n => ({
            name: n.name,
            slug: n.slug,
            label: n.label,
            connections: degrees.get(n.id) || 0
        }))
        .sort((a, b) => b.connections - a.connections)
        .slice(0, 10);

    return {
        total_nodes: raw_nodes.length,
        total_edges: raw_edges.length,
        label_breakdown: labelBreakdown,
        top_connected_nodes: topNodes
    };
}

// --- ASYNCHRONOUS EXTRACTION WITH GEMINI FLASH ---

async function callGeminiExtraction(promptText) {
    const apiKey = getEnv('GEMINI_API_KEY');
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const payload = JSON.stringify({
        contents: [
            {
                role: 'user',
                parts: [{ text: promptText }]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
        }
    });

    return new Promise((resolve, reject) => {
        const model = getEnv('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 20000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) return reject(new Error(json.error.message || 'Gemini API error'));
                    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
                    resolve(JSON.parse(rawText));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Extraction request timed out'));
        });
        req.write(payload);
        req.end();
    });
}

async function extractEntitiesAndRelations(conversationText) {
    if (!conversationText || conversationText.trim().length < 10) {
        return { nodes: [], edges: [] };
    }

    const extractionPrompt = `You are the knowledge graph extraction engine for Mikasa OS.
Analyze the following conversation turn(s) between Commander Swapnil and Mikasa.
Identify significant entities (People, Projects, Decisions, Preferences, Technologies, Events) and the directional relationships between them.

Swapnil's Known Core Context:
- Swapnil: Software Engineer, AI builder, researcher at BUBT (51st intake).
- Passions: FC Barcelona (Barça), Brazil National Football Team, Playing football, Cricket.
- Active Projects: Edu51Portal, CurricuRAG (first research paper), Personal AI Assistant (Mikasa OS).
- Decisions: Architecture choices, technology preferences, design approvals.

Instructions:
1. Extract explicit or strong implicit entities. Categorize each label strictly as one of:
   - "Person"
   - "Project"
   - "Decision"
   - "Preference"
   - "Technology"
   - "Event"
2. Extract directional relationships. Relations must be concise uppercase verbs, e.g.:
   - SUPPORTS, PLAYS, CREATED, USES, DECIDED_ON, PREFERS, COLLABORATES_WITH, PART_OF, SUPERSEDES.
3. Return STRICT JSON with this exact structure:
{
  "nodes": [
    { "name": "Exact Entity Name", "label": "LabelCategory", "properties": { "description": "Short note", "confidence": 0.95 } }
  ],
  "edges": [
    { "source": "Source Entity Name", "target": "Target Entity Name", "relation": "RELATION_NAME", "context": "Short context explanation", "weight": 1.0 }
  ]
}

Conversation Content:
"""
${conversationText.slice(0, 3000)}
"""`;

    try {
        const extracted = await callGeminiExtraction(extractionPrompt);
        const nodes = extracted.nodes || [];
        const edges = extracted.edges || [];

        const savedNodes = [];
        const savedEdges = [];

        // Upsert nodes
        for (const n of nodes) {
            if (n.name && n.label) {
                const savedNode = await upsertNode({
                    label: n.label,
                    name: n.name,
                    slug: slugify(n.name),
                    properties: n.properties || {}
                });
                savedNodes.push(savedNode);
            }
        }

        // Upsert edges
        for (const e of edges) {
            if (e.source && e.target && e.relation) {
                const savedEdge = await upsertEdge({
                    source_slug: slugify(e.source),
                    target_slug: slugify(e.target),
                    relation: e.relation,
                    context: e.context || '',
                    weight: e.weight || 1.0
                });
                savedEdges.push(savedEdge);
            }
        }

        return {
            nodes: savedNodes,
            edges: savedEdges
        };
    } catch (e) {
        console.warn('[MemoryGraphEngine] Extraction error:', e.message);
        return { nodes: [], edges: [], error: e.message };
    }
}

// Background asynchronous extraction hook (zero latency guarantee)
function extractFromRecentTurnsAsync(conversationId, turnsText = '') {
    setImmediate(async () => {
        try {
            let textToProcess = turnsText;
            if (!textToProcess && conversationId) {
                const messages = await supabaseRequest(
                    `/messages?conversation_id=eq.${conversationId}&order=timestamp.desc&limit=6`,
                    'GET'
                ).catch(() => []);
                if (messages && messages.length > 0) {
                    textToProcess = messages.reverse().map(m => `${m.role || 'user'}: ${m.content}`).join('\n');
                }
            }

            if (textToProcess && textToProcess.trim().length > 15) {
                console.log(`[MemoryGraphEngine] Running background graph extraction for conversation ${conversationId || 'turn'}...`);
                const res = await extractEntitiesAndRelations(textToProcess);
                console.log(`[MemoryGraphEngine] Extracted ${res.nodes.length} nodes and ${res.edges.length} edges successfully.`);
            }
        } catch (e) {
            console.warn('[MemoryGraphEngine] Background extraction failed non-critically:', e.message);
        }
    });
}

module.exports = {
    slugify,
    upsertNode,
    getNode,
    upsertEdge,
    supersedeEdge,
    getAllGraphData,
    traverseGraph,
    getGraphStats,
    extractEntitiesAndRelations,
    extractFromRecentTurnsAsync,
    LABEL_COLORS
};
