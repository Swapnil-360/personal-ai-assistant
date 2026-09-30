-- Episodic Relational Memory Graph Schema for Supabase PostgreSQL
-- Spec: docs/EPISODIC_MEMORY_GRAPH_SPEC.md

-- 1. memory_nodes: Entities, projects, decisions, preferences, technologies
CREATE TABLE IF NOT EXISTS memory_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(50) NOT NULL, -- 'Person', 'Project', 'Decision', 'Preference', 'Technology', 'Event'
    name VARCHAR(255) NOT NULL, -- e.g., 'FC Barcelona', 'Edu51Portal', 'Mikasa'
    slug VARCHAR(255) NOT NULL, -- Normalized identifier (e.g., 'fc_barcelona')
    properties JSONB DEFAULT '{}'::jsonb, -- Flexible metadata (importance, tags, quotes)
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'archived', 'superseded'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_nodes_slug ON memory_nodes (slug);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_label ON memory_nodes (label);

-- 2. memory_edges: Directional relationships between nodes
CREATE TABLE IF NOT EXISTS memory_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
    relation VARCHAR(100) NOT NULL, -- e.g., 'SUPPORTS', 'DECIDED_ON', 'PREFERS', 'USES', 'PART_OF'
    weight FLOAT DEFAULT 1.0, -- Confidence or emotional strength (0.1 to 1.0)
    context TEXT, -- Short explanation of why this edge exists
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ, -- NULL if currently valid; timestamp if superseded
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON memory_edges (source_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_target ON memory_edges (target_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_relation ON memory_edges (relation);

-- 3. Recursive Graph Traversal RPC: traverse_memory_graph
CREATE OR REPLACE FUNCTION traverse_memory_graph(
    root_slug TEXT,
    max_depth INT DEFAULT 2
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    WITH RECURSIVE graph_walk AS (
        SELECT id, label, name, slug, properties, 0 AS depth
        FROM memory_nodes
        WHERE slug = root_slug AND status = 'active'
        
        UNION
        
        SELECT n.id, n.label, n.name, n.slug, n.properties, gw.depth + 1
        FROM memory_nodes n
        JOIN memory_edges e ON (e.target_id = n.id OR e.source_id = n.id)
        JOIN graph_walk gw ON (gw.id = e.source_id OR gw.id = e.target_id)
        WHERE gw.depth < max_depth AND n.status = 'active' AND (e.valid_until IS NULL)
    ),
    distinct_nodes AS (
        SELECT DISTINCT id, label, name, slug, properties FROM graph_walk
    ),
    connected_edges AS (
        SELECT DISTINCT e.id, e.source_id, e.target_id, e.relation, e.weight, e.context
        FROM memory_edges e
        JOIN distinct_nodes sn ON e.source_id = sn.id
        JOIN distinct_nodes tn ON e.target_id = tn.id
        WHERE e.valid_until IS NULL
    )
    SELECT json_build_object(
        'nodes', (SELECT COALESCE(json_agg(distinct_nodes), '[]'::json) FROM distinct_nodes),
        'edges', (SELECT COALESCE(json_agg(connected_edges), '[]'::json) FROM connected_edges)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;
