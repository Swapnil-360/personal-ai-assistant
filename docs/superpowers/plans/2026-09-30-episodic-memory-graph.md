# Episodic Relational Memory Graph & Visual Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an episodic relational memory graph in Supabase PostgreSQL with asynchronous extraction, multi-hop traversals, AI tool integration, and an interactive Vis.js visual explorer in the Web Command Center.

**Architecture:** 
1. Database Layer: Relational tables `memory_nodes` and `memory_edges` in Supabase with temporal validity tracking and a recursive Common Table Expression (CTE) stored function `traverse_memory_graph`.
2. Engine Layer: Background asynchronous episode extractor (`memory_graph_engine.js`) leveraging Gemini 2.5 Flash for entity-relation extraction and atomic upsertion.
3. Intelligence Layer: `query_memory_graph` native tool in `tools_agent.js` and system prompt grounding.
4. Presentation Layer: Interactive Vis.js canvas inside the Web Command Center (`http://localhost:3000`) with color-coded nodes, label filters, and slide-out node details.

**Tech Stack:** Node.js (CommonJS), Supabase (PostgreSQL, PostgREST, RPC), Google Gemini 2.5 Flash API, Vis.js Network, Vanilla CSS/HTML/JS.

**Spec:** [docs/EPISODIC_MEMORY_GRAPH_SPEC.md](file:///d:/Projects/personal-ai-assistant/docs/EPISODIC_MEMORY_GRAPH_SPEC.md)

---

## Global Constraints

- Storage: Supabase PostgreSQL tables `memory_nodes` and `memory_edges` via existing `supabaseRequest` helper.
- Zero Latency on Chat: Extraction must run strictly asynchronously in the background and must NEVER block or delay user message responses.
- Temporal Integrity: When decisions or preferences update, old relationships receive `valid_until = NOW()`, preserving the full historical audit trail.
- Design Aesthetics: Visual explorer must adhere to the high-end dark cyberpunk HUD palette (amber gold `#f59e0b`, neon cyan `#06b6d4`, electric violet `#8b5cf6`, crimson `#ef4444`).

## Review Focus

1. Duplicate Node Creation: Variations like "Barca", "FC Barcelona", "Barcelona" must cleanly normalize to a single unique slug `fc_barcelona`.
2. Asynchronous Extraction Failure Resilience: If Gemini or Supabase experiences a network glitch during background extraction, it must fail silently without crashing the main process.
3. Empty Graph Fallback: If `memory_nodes` is initially empty or query returns 0 hops, query tools and visualization API must return graceful empty arrays without 500 errors.
4. Scalable Graph Layout: The Vis.js canvas must remain smooth and responsive even with hundreds of nodes through physics stabilization.
5. Bidirectional Traversal: Multi-hop reasoning must be able to traverse incoming and outgoing edges (`source_id` and `target_id`).

---

## Tasks

### Task 1: Database Migration & Schema Creation

**Files:**
- Create: `scripts/migrate_memory_graph.js`
- Test: `scratch/test_graph_schema.js`

- [ ] **Step 1: Write migration script to execute SQL schema on Supabase**
  Create `scripts/migrate_memory_graph.js` that checks for and creates `memory_nodes`, `memory_edges`, indexes, and the `traverse_memory_graph` RPC function using Supabase SQL endpoint / PostgREST.
- [ ] **Step 2: Write test script to verify schema readiness**
  Create `scratch/test_graph_schema.js` that queries `/memory_nodes?limit=1` and `/memory_edges?limit=1` to ensure tables and indexes are healthy.
- [ ] **Step 3: Run migration script and verify database readiness**
  Execute `node scripts/migrate_memory_graph.js` and verify with `node scratch/test_graph_schema.js`.
- [ ] **Step 4: Commit schema migration**
  `git commit -m "feat(database): initialize memory_nodes and memory_edges graph schema"`

---

### Task 2: Seed Core Knowledge Graph from Existing Intelligence

**Files:**
- Create: `scripts/seed_initial_memory_graph.js`
- Test: `scratch/test_seed_traversal.js`

- [ ] **Step 1: Write seed script for Swapnil's core entities and relationships**
  Extract current profile, projects, decisions, and passions into initial graph nodes and edges:
  - Nodes: `Swapnil` (Person), `Mikasa` (AI), `FC Barcelona` (Preference), `Brazil` (Preference), `Playing Football` (Preference), `Edu51Portal` (Project), `CurricuRAG` (Project), `Supabase` (Technology).
  - Edges: `(Swapnil)-[SUPPORTS]->(FC Barcelona)`, `(Swapnil)-[PLAYS]->(Playing Football)`, `(Swapnil)-[SUPPORTS]->(Brazil)`, `(Swapnil)-[CREATED]->(Edu51Portal)`, `(Edu51Portal)-[USES]->(Supabase)`.
- [ ] **Step 2: Run seed script**
  Execute `node scripts/seed_initial_memory_graph.js`.
- [ ] **Step 3: Verify multi-hop traversal**
  Create and run `scratch/test_seed_traversal.js` querying `traverse_memory_graph('swapnil', 2)` and assert that both 1st-hop (`FC Barcelona`) and 2nd-hop (`Supabase`) entities are returned.
- [ ] **Step 4: Commit seed graph**
  `git commit -m "feat(graph): seed initial episodic relational memory graph"`

---

### Task 3: Asynchronous Extraction & Ingestion Engine

**Files:**
- Create: `memory_graph_engine.js`
- Test: `scratch/test_graph_extractor.js`

- [ ] **Step 1: Implement extraction engine with Gemini Flash structured schema**
  In `memory_graph_engine.js`:
  - `extractEntitiesAndRelations(conversationTurns)`: Calls Gemini 2.5 Flash with structured JSON output schema returning nodes and edges.
  - `slugify(name)`: Consistent slug generator with alias resolution (e.g. "Barca" → "fc_barcelona").
  - `upsertGraphNodesAndEdges(nodes, edges)`: Deduplicates nodes by slug and creates edges. If a conflicting relation is detected, sets `valid_until = NOW()` on the old edge.
- [ ] **Step 2: Write test script simulating conversation extraction**
  Create `scratch/test_graph_extractor.js` with sample turns (e.g. *"I decided to use Tailwind for my next landing page"*).
- [ ] **Step 3: Run test and verify graph upsert**
  Execute `node scratch/test_graph_extractor.js` and verify that the new decision node and relationship edge appear in Supabase.
- [ ] **Step 4: Commit extraction engine**
  `git commit -m "feat(engine): implement episodic graph extraction and upsert engine"`

---

### Task 4: AI Native Tool Integration & Chat Pipeline Hook

**Files:**
- Modify: `tools_agent.js`
- Modify: `telegram_bridge.js`
- Test: `scratch/test_graph_tool.js`

- [ ] **Step 1: Add `query_memory_graph` tool to `tools_agent.js`**
  Declare `query_memory_graph` in `MIKASA_TOOL_DECLARATIONS` and implement handler in `executeLocalTool`: accepts `query` or `entity_slug`, invokes `traverse_memory_graph`, and formats the subgraph into human-readable relational bullets.
- [ ] **Step 2: Connect background extraction to conversation completion**
  In `telegram_bridge.js`: after recording conversation turns, trigger `memory_graph_engine.extractFromRecentTurns(conversationId)` asynchronously in a non-blocking `setImmediate` or detached Promise.
- [ ] **Step 3: Test tool execution via script**
  Create `scratch/test_graph_tool.js` to simulate tool execution for query "barcelona" and "decisions".
- [ ] **Step 4: Commit AI tool and chat hook**
  `git commit -m "feat(tools): register query_memory_graph tool and asynchronous extraction hook"`

---

### Task 5: Web Server Graph API Endpoints

**Files:**
- Modify: `web/server.js`
- Test: `scratch/test_graph_endpoints.js`

- [ ] **Step 1: Implement `GET /api/graph/data`**
  Returns `{ nodes, edges }` formatted for Vis.js Network visualization with color tokens based on node labels.
- [ ] **Step 2: Implement `GET /api/graph/stats`**
  Returns `{ total_nodes, total_edges, label_breakdown, top_connected_nodes }`.
- [ ] **Step 3: Implement `POST /api/graph/extract`**
  Allows Commander to manually trigger an extraction on demand from chat history.
- [ ] **Step 4: Verify endpoints with HTTP test script**
  Create and execute `scratch/test_graph_endpoints.js` validating HTTP 200 responses and payload structures.
- [ ] **Step 5: Commit server endpoints**
  `git commit -m "feat(api): expose /api/graph/data, /api/graph/stats, and manual extraction endpoints"`

---

### Task 6: Visual Graph Explorer in Web Command Center

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css`

- [ ] **Step 1: Add "Memory Graph" tab to Web Command Center HUD**
  In `web/index.html`: add navigation button `<button class="nav-tab" data-tab="memory-graph">🧠 Memory Graph</button>` and tab pane containing the graph canvas, filter chips, and search input.
- [ ] **Step 2: Include Vis.js Network library**
  Include CDN link for Vis.js Network (`vis-network.min.js`) in `web/index.html`.
- [ ] **Step 3: Implement interactive canvas and slide-out inspector in `web/app.js`**
  - Initialize Vis.js Network with dark cyberpunk theme options.
  - Implement label filter chips (`All`, `Person`, `Project`, `Decision`, `Preference`, `Technology`).
  - Implement click handler to display connected relationships, timestamps, and context in a side drawer.
- [ ] **Step 4: Style graph canvas and HUD controls in `web/styles.css`**
  Add styles for graph container, filter chips, search bar, and inspection drawer.
- [ ] **Step 5: Commit visual dashboard updates**
  `git commit -m "feat(ui): add interactive visual memory graph explorer to web command center"`

---

### Task 7: End-to-End Verification & Deployment

**Files:**
- Test: `scratch/test_e2e_memory_graph.js`
- Modify: `MIKASA_ASSISTANT_ROADMAP.md`

- [ ] **Step 1: Run comprehensive end-to-end test**
  Verify schema, seed graph, extraction engine, tool query, and HTTP endpoints all work cohesively.
- [ ] **Step 2: Update roadmap status in `MIKASA_ASSISTANT_ROADMAP.md`**
  Mark Episodic Relational Memory Graphing as operational.
- [ ] **Step 3: Commit and push to `origin main` for Cloud deployment**
  `git push origin main`
