# Swapnil AI — Personal AI Assistant

## Project Overview

This project is a personal AI operating layer built with n8n and Supabase.

The goal is not to build a simple chatbot. The system should understand the user's personal context, retrieve relevant information, reason over that information, use tools, automate workflows, assist with tasks, and maintain long-term memory.

## Core Architecture

The current architecture uses:

* n8n — workflow orchestration and automation
* Supabase — structured database and long-term memory
* PostgreSQL — relational data storage
* pgvector — semantic/vector search
* AI APIs — embeddings and AI reasoning
* Knowledge base — documents and external knowledge
* Memory system — persistent user-specific information
* Context Retrieval — combines relevant information before AI reasoning

## Important Architecture Rule

Do NOT put the entire personal knowledge base into an AI system prompt.

Relevant information should be retrieved dynamically based on the current query.

The system should distinguish between:

1. Stable personal information
2. Current state
3. Projects
4. Project decisions
5. Memories
6. Recent conversation messages
7. Knowledge/documents
8. External/current information

## Current n8n Workflows

The `workflows/` directory contains exported n8n workflow JSON files.

Important workflows include:

* Swapnil AI — Context Retrieval
* Swapnil AI — Knowledge Search
* Swapnil AI — Memory Search
* TEST — Context Retrieval

Other workflows may also exist and should be inspected before making architectural changes.

## Current Retrieval Architecture

Context Retrieval is intended to retrieve multiple types of context:

* Profile
* Current state
* Active goals
* Projects
* Project decisions
* Memories
* Recent messages
* Knowledge

Memory Search and Knowledge Search are separate workflows.

Do NOT confuse them or replace one with the other.

## Knowledge Search

Knowledge Search should:

1. Receive a query
2. Generate an embedding for the query
3. Search the knowledge/document database using semantic/vector search
4. Apply relevant project filtering when provided
5. Apply similarity/threshold logic when configured
6. Limit the number of results
7. Format the results
8. Return them to Context Retrieval

Current embedding configuration:

* Model: `openai/text-embedding-3-small`
* Dimensions: `1536`

## Memory Search

Memory Search is a separate retrieval system for persistent memories.

Do not modify Memory Search while fixing Knowledge Search unless the change is demonstrably required.

## Development Rules

Before modifying any workflow:

1. Read the complete workflow JSON.
2. Understand its nodes and connections.
3. Identify dependencies between workflows.
4. Check expressions and workflow input/output schemas.
5. Preserve existing working behavior.
6. Make the smallest necessary change.
7. Do not invent database tables, RPC functions, columns, IDs, or credentials.
8. Do not replace Supabase with Firebase or another backend.
9. Do not hardcode user-specific queries when a dynamic expression is intended.
10. Do not remove existing functionality without explaining why.

## n8n Safety Rules

Workflow JSON contains important node IDs, connections, expressions, and configuration.

Do not rewrite an entire workflow unnecessarily.

When changing a workflow:

* Preserve node IDs where possible.
* Preserve existing connections.
* Preserve expressions unless they are intentionally being changed.
* Preserve credential references.
* Preserve webhook/trigger configuration.
* Do not expose API keys or credentials.
* Do not create fake credentials.
* Do not assume a credential value from the JSON.

## Antigravity Working Method

When asked to modify a workflow:

### First

Analyze the relevant workflow files.

### Second

Explain:

* What is currently happening
* What is wrong
* Which node is responsible
* What should change

### Third

Propose the exact change.

### Fourth

Only modify files after the requested change is understood.

### Fifth

Show a concise summary of the changes.

Do not make unrelated improvements while fixing a specific problem.

## Source of Truth

The exported workflow JSON files represent the current n8n workflow configuration.

The Supabase database remains the source of truth for stored application data.

Do not assume that information in this README is more current than the actual workflow JSON or database configuration.

If there is a conflict:

1. Current working workflow behavior
2. Workflow JSON
3. Supabase/database configuration
4. This README
5. Assumptions

## Current Development Goal

The current development focus is building and debugging the Personal AI Assistant's context retrieval architecture.

The immediate area of interest is the Knowledge Search → Context Retrieval integration.

The system should eventually provide the AI with only the context relevant to the user's current request rather than loading the entire database into the prompt.

## Important Principle

The assistant shou
