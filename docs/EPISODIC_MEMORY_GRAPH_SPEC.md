# Specification: Episodic Relational Memory Graph & Visual Explorer

**Status:** Proposed  
**Author:** Mikasa & Swapnil  
**Architecture Type:** Architectural Subsystem  
**Scope:** Distributed Graph Memory (Supabase PostgreSQL) + Extraction Engine + Interactive Visualization  

---

## 1. System Overview & Objective

The **Episodic Relational Memory Graph** evolves Mikasa's memory layer from flat, unstructured text logs into an interconnected semantic graph. 

### Core Goals:
1. **Multi-Hop Relational Reasoning:** Answer complex contextual queries (e.g., *"What decisions have we made about Edu51Portal's backend, and what was the reason?"*) by traversing connected nodes rather than doing keyword scans.
2. **Temporal Validity:** Track when preferences or decisions were created, modified, or superseded (`valid_from`, `valid_until`).
3. **Instant Retrieval:** 1-to-3 hop traversals executed in `<15ms` directly inside PostgreSQL via Common Table Expressions (CTEs).
4. **Interactive Visual Dashboard:** A dedicated interactive visual graph canvas inside the Web Command Center (`http://localhost:3000`) where Swapnil can inspect nodes, relationships, and cluster filters.

---

## 2. Database Schema (Supabase PostgreSQL)

We leverage Supabase's native PostgreSQL engine with two dedicated tables:

### 2.1 Table: `memory_nodes`
Represents entities, concepts, decisions, projects, people, and conversation episodes.

```sql
CREATE TABLE IF NOT EXISTS memory_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(50) NOT NULL, -- 'Person', 'Project', 'Decision', 'Preference', 'Technology', 'Event'
    name VARCHAR(255) NOT NULL, -- e.g., 'FC Barcelona', 'Edu51Portal', 'Score Prediction on Matchdays'
    slug VARCHAR(255) NOT NULL, -- Normalized identifier for deduplication (e.g., 'fc_barcelona')
    properties JSONB DEFAULT '{}'::jsonb, -- Flexible metadata (importance, tags, quotes)
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'archived', 'superseded'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_nodes_slug ON memory_nodes (slug);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_label ON memory_nodes (label);
```

### 2.2 Table: `memory_edges`
Represents directional relationships between nodes.

```sql
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
```

### 2.3 Traversal RPC: `traverse_memory_graph`
A recursive PostgreSQL CTE function that returns all connected nodes and edges up to `depth` hops (default 2 hops):

```sql
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
```

---

## 3. Extraction & Ingestion Pipeline (`memory_graph_engine.js`)

### 3.1 Asynchronous Episode Ingestion
1. **Trigger Condition:** Fired in the background after any conversation session ends or every 5 message turns. Runs without blocking the chat response.
2. **Schema-Constrained LLM Extraction:**
   * Uses Gemini 2.5 Flash with structured JSON schema:
     * `nodes`: `[{ label, name, slug, properties }]`
     * `edges`: `[{ source_slug, target_slug, relation, context, weight }]`
3. **Atomic Upsert & Deduplication:**
   * Entities are resolved against existing slugs (e.g. `"FC Barcelona"`, `"Barca"`, `"Blaugrana"` resolve to `fc_barcelona`).
   * When a decision or preference changes (e.g. *"I switched from Python to Node.js for this tool"*), the old edge receives `valid_until = NOW()` and the new edge is inserted with `valid_from = NOW()`.

---

## 4. Query & Retrieval Engine

### 4.1 Native Tool: `query_memory_graph`
Added to [tools_agent.js](file:///d:/Projects/personal-ai-assistant/tools_agent.js):
* **Parameters:** `query` (string), `focus_entity` (optional slug or label).
* **Behavior:** Resolves entity, executes `traverse_memory_graph`, and returns the subgraph of related decisions, preferences, and people.

### 4.2 System Prompt Dynamic Grounding
In [telegram_bridge.js](file:///d:/Projects/personal-ai-assistant/telegram_bridge.js), the system prompt fetches top relational clusters for Swapnil's active projects, passions, and critical decisions.

---

## 5. Visual Dashboard in Web Command Center

### 5.1 Interactive Graph Canvas
* **Location:** New **"Memory Graph"** tab in Web Command Center (`http://localhost:3000` / `/commander`).
* **Visual Library:** Vis.js Network (lightweight, zero bundle build required, smooth physics animation, color-coded node labels, pinch-to-zoom).
* **Features:**
  * **Color Coding:**
    * 👤 `Person`: Emerald / Cyan
    * 🚀 `Project`: Cyberpunk Yellow / Amber
    * 💡 `Decision`: Neon Violet / Purple
    * ❤️ `Preference`: Crimson / Pink (e.g., FC Barcelona, Brazil)
    * ⚙️ `Technology`: Electric Blue
  * **Controls:**
    * Filter by label (Show only Decisions, Show only Preferences, Show all).
    * Search node input.
    * Click node to inspect details, connected edges, and timestamps in a slide-out drawer.
  * **API Endpoints in [web/server.js](file:///d:/Projects/personal-ai-assistant/web/server.js):**
    * `GET /api/graph/data` — Returns entire active memory graph or filtered subgraph.
    * `GET /api/graph/stats` — Total nodes, edges, top clusters.
    * `POST /api/graph/extract` — Manual trigger to re-index recent chat history.

---

## 6. Verification & Quality Acceptance Criteria

1. **Schema Integrity:** Database tables and indexes created in Supabase with foreign keys and cascade rules.
2. **Extraction Accuracy:** Test extraction accurately maps:
   * Swapnil → `[SUPPORTS]` → FC Barcelona
   * Swapnil → `[SUPPORTS]` → Brazil
   * Swapnil → `[PLAYS]` → Football
   * Swapnil → `[DECIDED]` → Supabase over Firebase for Edu51Portal
3. **Multi-Hop Traversal:** Calling `traverse_memory_graph('swapnil', 2)` returns both 1st-degree (Barça, Brazil) and 2nd-degree nodes in `<20ms`.
4. **Visual Dashboard Rendering:** Web Command Center renders the graph with smooth drag, zoom, and node inspection.
5. **Zero Downtime / Zero Latency:** Extraction runs strictly asynchronously in the background without adding a single millisecond of delay to Telegram or Web chat replies.
