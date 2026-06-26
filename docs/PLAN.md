# Agent Studio — Implementation Plan

## Context

Build a production-grade pipeline execution engine ("agent-studio") with a visual drag-and-drop studio for building and testing AI agent pipelines. Designed for millions of concurrent users running agents simultaneously. This is a greenfield project extracted from Synactic's Conversation Engine (CE) with JSON-configured agents (no TypeScript seeds), agent versioning, role-based access, and a React Flow-based visual editor.

The CE codebase at `/Users/amarspahic/work/synactic/expert-guide-system/src/ce/` is the reference implementation to port from.

### User Model & Access Control (v1)
- All users have full access to agents (create, edit, version, run) — no restrictions on agent operations
- **Admin role**: can view ALL sessions and messages across all users (for debugging, moderation, analytics)
- **Regular users**: can only see their own sessions and messages
- JWT authentication
- First registered user gets `admin` role automatically
- Scale: direct execution in request handler, scale horizontally by adding backend instances

**Future (v2):** Builder/runner roles, organizations, Google Drive-style sharing/permissions, API key auth for external consumers, public/private agent visibility.

### Execution Architecture
- **All pipeline execution logic lives on the backend** — the frontend is a thin client
- The Studio UI for pipeline building has client-side editor logic (React Flow drag-and-drop)
- The Studio UI for pipeline running is a thin client: displays SSE streamed data, passes user input back to backend
- No pipeline logic in any client — backend is the single source of truth for execution
- Future: external consumers (mobile apps, other pages) will call the same backend API via API keys

### Editing & Versioning Model
- **Editing is client-side only** — user loads a version from DB into the React Flow editor, edits locally in Zustand store. No auto-save to DB. Unsaved changes are persisted to `IndexedDB` (via Zustand `persist` middleware) so work survives browser reloads.
- **Testing without persisting** — user can test-run unsaved changes via `POST /api/test-sessions` which sends the full agent config in the request body. Engine runs from this payload, not from DB.
- **Save is explicit** with choices:
  - **First save**: creates version `0.0.1` (writes nodes + SA configs rows to DB)
  - **Update current version**: overwrites the existing version's rows in DB
  - **New version**: creates a new version with user-specified semver string (writes new rows)
- **Sessions are pinned to a version** — even if the agent is updated, running sessions continue on the version they started with
- **Version copy** generates new UUIDs for all nodes and SA configs; transitions/references are rewritten to point to the new IDs

## Tech Stack

- **Backend**: Fastify + TypeScript (ESM)
- **ORM**: Drizzle ORM + drizzle-kit (migrations) + postgres-js driver
- **Frontend**: React + React Flow + shadcn/ui + Tailwind + Zustand
- **Database**: PostgreSQL 17 (main: users, agents, nodes, sessions, snapshots)
- **Message DB**: TimescaleDB (PostgreSQL 17 + hypertable) — dedicated instance for session_messages only
- **Cache**: Redis 7 (ioredis)
- **Vector DB**: Weaviate (for semantic search, RAG, embeddings)
- **LLM Proxy**: LiteLLM (pinned to v1.81.12-stable per memory note)
- **Auth**: jose (JWT HS256), argon2 (argon2id password hashing)
- **MCP**: @modelcontextprotocol/sdk (Streamable HTTP transport)
- **Validation**: zod (request validation + MCP tool schemas)
- **Compute Sandbox**: isolated-vm (V8 isolates)
- **Package Manager**: pnpm (monorepo)

## Project Structure

```
agent-studio/
├── docker/
│   ├── docker-compose.yml          # Full stack (production/CI)
│   ├── docker-compose.infra.yml    # Infra only (dev: postgres, redis, litellm)
│   ├── litellm/
│   │   ├── config.yaml
│   │   └── .env
│   └── .env                        # DB creds for docker services
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts           # Drizzle Kit config (migrations)
│   ├── Dockerfile
│   └── src/
│       ├── index.ts                # Fastify entry point
│       ├── config.ts               # Env validation (fail-fast)
│       ├── db/
│       │   ├── drizzle.ts          # postgres-js + drizzle singleton (main PostgreSQL)
│       │   ├── timescale.ts        # postgres-js + drizzle singleton (TimescaleDB for messages)
│       │   ├── schema.ts           # Main DB table definitions (pgTable)
│       │   ├── timescale-schema.ts # TimescaleDB table definitions (session_messages)
│       │   └── redis.ts            # ioredis singleton
│       ├── engine/
│       │   ├── types.ts
│       │   ├── AgentEngine.ts
│       │   ├── pipeline/
│       │   │   ├── buildMachine.ts           # XState machine builder
│       │   │   └── validateAgent.ts          # All validation (graph + schema + config + mapping)
│       │   ├── executors/ (8 executors + GenericExecutor)
│       │   ├── semantic-agent/
│       │   │   ├── SemanticAgentFactory.ts   # Creates agents from DB configs
│       │   │   ├── SemanticAgentImpl.ts      # LLM call + validation-feedback loop
│       │   │   ├── ResponsePipeline.ts       # 6-step JSON validation (standalone)
│       │   │   ├── JsonSchemaValidator.ts    # Ajv wrapper
│       │   │   ├── RetryFeedback.ts          # Error-categorized feedback messages
│       │   │   └── ThinkingParser.ts         # Thinking marker extraction
│       │   ├── persistence/ (SnapshotRepository, SessionCache)
│       │   ├── utils/ (chunkBuilders, interpolate, httpToolCall, applyActions, loopDetector)
│       │   └── llm/
│       │       └── LiteLLMProvider.ts        # OpenAI-compatible streaming (no retry)
│       ├── auth/
│       │   ├── jwt.ts              # JWT sign/verify helpers
│       │   ├── middleware.ts       # authenticate (JWT) + requireAdmin hooks
│       │   └── password.ts         # argon2id hash/verify
│       ├── mcp/
│       │   ├── server.ts           # McpServer factory + tool registrations
│       │   └── plugin.ts           # Fastify plugin mounting MCP at /mcp with JWT auth
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── agents.ts
│       │   ├── nodes.ts
│       │   ├── semantic-agents.ts
│       │   ├── tools.ts
│       │   ├── versions.ts
│       │   ├── sessions.ts
│       │   ├── admin.ts            # Admin-only routes (all sessions/messages)
│       │   └── ai-editor.ts
│       └── repositories/
│           ├── UserRepository.ts
│           ├── AgentRepository.ts
│           ├── NodeRepository.ts               # All queries scoped to (agent_id, version)
│           ├── SemanticAgentConfigRepository.ts # All queries scoped to (agent_id, version)
│           ├── ToolDefinitionRepository.ts
│           └── VersionRepository.ts            # Publish, restore, list, delete (row copy operations)
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/ (client, agents, nodes, sessions, sse)
│       ├── components/
│       │   ├── layout/ (AppShell, Sidebar, Header)
│       │   ├── flow/ (AgentCanvas, NodePalette, 8 custom nodes, edges)
│       │   ├── panels/ (NodeConfigPanel, AgentSettingsPanel, SemanticAgentPanel, VersionPanel)
│       │   ├── ai-editor/ (AiEditorPanel, DiffView, OperationList, EditSummary)
│       │   ├── chat/ (TestChat, ChatMessage, OptionsSelector, WebViewRenderer)
│       │   └── ui/ (shadcn components)
│       ├── stores/ (agentStore, flowStore, chatStore — Zustand)
│       ├── hooks/ (useAgent, useSSEStream, useVersions)
│       └── pages/ (AgentList, AgentEditor)
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
└── README.md
```

## Database Schema (Drizzle ORM)

Defined in `backend/src/db/schema.ts` using Drizzle's `pgTable`. Migrations generated by `drizzle-kit generate` and applied with `drizzle-kit migrate`.

```typescript
// backend/src/db/schema.ts
import { pgTable, text, integer, real, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';

// ============================================================================
// Users & Auth
// ============================================================================

export const users = pgTable('users', {
  id:           text('id').primaryKey(),
  email:        text('email').notNull().unique(),
  name:         text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role:         text('role').notNull().default('user'), // 'admin' | 'user'
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Agents
// ============================================================================

export const agents = pgTable('agents', {
  id:             text('id').primaryKey(),
  name:           text('name').notNull(),
  description:    text('description').notNull().default(''),
  initialNodeId:  text('initial_node_id').notNull(),
  currentVersion: text('current_version').notNull().default('0.0.0'),  // semver string, directly editable
  createdBy:      text('created_by').notNull().references(() => users.id),
  inputContract:  jsonb('input_contract'),
  metadata:       jsonb('metadata').notNull().default({}),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Every node row is scoped to (agent_id, version).
// Multiple versions coexist in the same table.
// Engine loads: WHERE agent_id=X AND version=Y
// Users edit the current version in-place. Creating a new version copies rows with new UUIDs.
// Transitions referencing other nodes are rewritten during copy to point to the new node IDs.
export const agentNodes = pgTable('agent_nodes', {
  id:                    text('id').primaryKey(),
  agentId:               text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:               text('version').notNull(),               // semver string matching agents.currentVersion
  name:                  text('name').notNull(),
  nodeType:              text('node_type').notNull(),
  semanticAgentConfigId: text('semantic_agent_config_id'),
  phaseLabel:            text('phase_label').notNull().default(''),
  progressWeight:        integer('progress_weight').notNull().default(1),
  configJson:            jsonb('config_json').notNull().default({}),
  positionX:             real('position_x').notNull().default(0),
  positionY:             real('position_y').notNull().default(0),
  createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// Index: CREATE INDEX idx_agent_nodes_agent_version ON agent_nodes(agent_id, version);

// Every SA config row is scoped to (agent_id, version), same as nodes.
export const semanticAgentConfigs = pgTable('semantic_agent_configs', {
  id:                 text('id').primaryKey(),
  agentId:            text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:            text('version').notNull(),                  // semver string
  nodeId:             text('node_id').notNull(),                  // references agentNodes.id within same version
  name:               text('name').notNull(),
  systemPrompt:       text('system_prompt').notNull(),
  outputSchemaJson:   jsonb('output_schema_json').notNull().default({}),
  maxRetries:         integer('max_retries').notNull().default(2),
  temperature:        real('temperature').notNull().default(0.7),
  maxOutputTokens:    integer('max_output_tokens'),
  outputFormatting:   text('output_formatting').notNull().default('markdown'),
  outputDensity:      text('output_density').notNull().default('compact'),
  reasoningFormatting:text('reasoning_formatting').notNull().default('concise'),
  thinkingGuidance:   text('thinking_guidance'),
  modelAlias:         text('model_alias'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// Index: CREATE INDEX idx_sa_configs_agent_version ON semantic_agent_configs(agent_id, version);

export const toolDefinitions = pgTable('tool_definitions', {
  id:                  text('id').primaryKey(),
  name:                text('name').notNull().unique(),
  description:         text('description').notNull(),
  urlTemplate:         text('url_template').notNull().default(''),
  method:              text('method').notNull().default('POST'),
  headers:             jsonb('headers'),
  bodyTemplate:        text('body_template'),
  responsePath:        text('response_path'),
  authType:            text('auth_type'),
  parametersSchemaJson:jsonb('parameters_schema_json'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Version registry — tracks which versions exist for an agent + optional label.
// Actual version data lives in agent_nodes and semantic_agent_configs rows.
export const agentVersions = pgTable('agent_versions', {
  id:        text('id').primaryKey(),
  agentId:   text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:   text('version').notNull(),      // semver string e.g. "1.0.0"
  label:     text('label'),                  // optional human-readable label
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.agentId, t.version)]);

// Session is pinned to a specific agent version at creation time.
// Even if the agent is updated, this session continues on the version it started with.
export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),
  agentId:   text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:   text('version').notNull(),      // semver string, pinned at session creation
  userId:    text('user_id').notNull().references(() => users.id),
  status:    text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Append-only snapshots — every save creates a new row (full audit trail).
// On resume: load latest snapshot per session_id (ORDER BY created_at DESC LIMIT 1).
// Context contains pipeline data (not messages — messages are in separate table).
export const sessionSnapshots = pgTable('session_snapshots', {
  id:           text('id').primaryKey(),
  sessionId:    text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  agentId:      text('agent_id').notNull(),
  nodeId:       text('node_id').notNull(),
  machineState: jsonb('machine_state').notNull(),  // XState machine state for restore
  context:      jsonb('context').notNull(),         // Pipeline data (no messages)
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// Index: CREATE INDEX idx_snapshots_session_created ON session_snapshots(session_id, created_at DESC);

// ============================================================================
// session_messages — lives in SEPARATE TimescaleDB instance (not main PostgreSQL)
// ============================================================================
// Defined in backend/src/db/timescale-schema.ts with its own Drizzle connection.
// Converted to hypertable: SELECT create_hypertable('session_messages', 'created_at');
// No foreign key to sessions (hypertables don't support inbound FKs) — referential
// integrity handled in application code.
//
// export const sessionMessages = pgTable('session_messages', {
//   id:           text('id').primaryKey(),
//   sessionId:    text('session_id').notNull(),       // logical ref to sessions.id (no FK)
//   nodeId:       text('node_id'),                    // which node generated/received this message
//   role:         text('role').notNull(),              // 'user' | 'assistant' | 'system'
//   content:      text('content').notNull(),
//   reasoning:    text('reasoning'),                   // optional reasoning/thinking content
//   inputTokens:  integer('input_tokens'),               // tokens sent to LLM (null for user messages)
//   outputTokens: integer('output_tokens'),              // tokens received from LLM (null for user messages)
//   model:        text('model'),                         // model alias used (null for user messages)
//   metadata:     jsonb('metadata'),                     // optional: thinking chunks, tool calls, etc.
//   createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
// });
// After table creation: SELECT create_hypertable('session_messages', 'created_at');
// Compression policy: SELECT add_compression_policy('session_messages', INTERVAL '30 days');
// Retention policy (optional): SELECT add_retention_policy('session_messages', INTERVAL '1 year');
```

### Drizzle Setup — Two Connections

**Main PostgreSQL** (`backend/src/db/drizzle.ts`):
```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const queryClient = postgres(config.DATABASE_URL);
export const db = drizzle(queryClient, { schema });
```

**TimescaleDB** (`backend/src/db/timescale.ts`):
```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as timescaleSchema from './timescale-schema.js';

const tsClient = postgres(config.TIMESCALE_URL);
export const tsDb = drizzle(tsClient, { schema: timescaleSchema });
```

### Migration Workflow

```bash
# Generate migration from schema changes
pnpm drizzle-kit generate

# Apply migrations
pnpm drizzle-kit migrate

# Dev: push schema directly (no migration files)
pnpm drizzle-kit push
```

## Backend API

```
# Auth (JWT)
POST   /api/auth/register                       Register user
POST   /api/auth/login                          Login -> JWT token
GET    /api/auth/me                             Get current user
POST   /api/auth/refresh                        Refresh access token (rotation: old token invalidated)

# Agents CRUD (all authenticated users, full access in v1)
GET    /api/agents                              List agents
POST   /api/agents                              Create agent
GET    /api/agents/:agentId                     Get agent + nodes + configs
PUT    /api/agents/:agentId                     Update agent
DELETE /api/agents/:agentId                     Delete agent (cascade)
POST   /api/agents/:agentId/duplicate           Deep copy

# Agent version data (load for editing)
GET    /api/agents/:agentId/versions/:version/data   Get full version data (nodes + SA configs) for loading into editor

# Tool Definitions (global)
GET    /api/tools                               List tools
POST   /api/tools                               Create tool
PUT    /api/tools/:toolId                       Update tool
DELETE /api/tools/:toolId                       Delete tool

# Versioning (semver, rows-based)
# Editing is client-side. Save is explicit: update current version OR create new version.
GET    /api/agents/:agentId/versions                        List versions (with labels)
POST   /api/agents/:agentId/versions                        Save as new version (body: {version, nodes, saConfigs} — writes new rows with new UUIDs)
PUT    /api/agents/:agentId/versions/:version                Save/overwrite existing version (body: {nodes, saConfigs} — replaces rows for this version)
PUT    /api/agents/:agentId/versions/:version/label          Update version label
DELETE /api/agents/:agentId/versions/:version                 Delete a version (delete nodes/configs rows for that version)

# Sessions + Chat (SSE streaming, all authenticated users)
POST   /api/agents/:agentId/sessions            Create session (runs from DB, pinned to a version)
GET    /api/agents/:agentId/sessions            List own sessions
GET    /api/sessions/:sessionId/messages         List messages for own session (paginated, from TimescaleDB)
DELETE /api/sessions/:sessionId                 Delete own session
POST   /api/sessions/:sessionId/message         Send message -> SSE stream

# Admin (admin role only) — view all sessions and messages across all users
GET    /api/admin/sessions                      List all sessions (paginated, filterable by user/agent/status)
GET    /api/admin/sessions/:sessionId/messages   List messages for any session (paginated)

# Test sessions (run unsaved changes without persisting to DB)
POST   /api/test-sessions                       Create test session (body: full agent config — nodes, saConfigs, agent metadata)
POST   /api/test-sessions/:sessionId/message    Send message -> SSE stream (engine runs from in-memory config, not DB)

# AI Pipeline Editor (natural language editing with diff preview)
POST   /api/ai-editor/suggest                   Send instruction + current state -> returns EditOperation[] + validation + summary
```

## Engine Design

### Key Differences from CE
- **XState retained** — same `buildMachine` + `createActor` pattern for reliable snapshot restore and retry
- **No Temporal** — PostgreSQL + Redis only for persistence
- **No seed files** — Studio writes directly to DB via API
- **No `@properhealth/structured-llm-client`** — replaced by built-in ResponsePipeline + LiteLLMProvider
- **No exponential backoff in semantic agent** — LiteLLM proxy handles network retries; agent only does validation-feedback retries (Instructor pattern) with no delay between attempts
- **Cross-agent routing** supported from day one (routing node targets `{ type: 'agent', agentId }`)
- **No role restrictions in v1** — all users have full access
- **User-scoped sessions** — each session belongs to a user (user_id on sessions table)
- **JWT auth** — all API routes authenticated (no role checks in v1)
- **Horizontal scaling** — direct execution in request handler, stateless backend, scale by adding instances

### Execution Flow (same pattern as CE `#runPipeline`)
1. Load agent definition for pinned version (in-memory cache keyed by agent_id+version, 30min TTL)
2. Load/create session snapshot (Redis -> PostgreSQL -> fresh)
3. Create/restore XState actor from snapshot or initial node (same as CE's buildMachine + createActor)
4. Build executor deps (SemanticAgentFactory, tool defs, loop detector)
5. Main loop: get node -> executeEntry/executeInput -> apply context -> transition -> save snapshot -> check complete/waiting
6. Cross-agent hops: load target agent def, create new XState machine, map context, continue loop

### Semantic Agent — JSON Validation as Separate Layer

The LLM generates JSON. JSON validation is a completely separate concern from the LLM call itself.

**Architecture** (3 separate components, no `structured-llm-client` dependency):

#### 1. LiteLLMProvider (`engine/llm/LiteLLMProvider.ts`)
- OpenAI-compatible streaming client that talks to LiteLLM proxy
- Single responsibility: stream LLM responses, yield reasoning deltas + content
- No retry logic — LiteLLM proxy handles network retries, failover, rate limiting
- Configuration: model alias, temperature, maxTokens passed per-request

#### 2. ResponsePipeline (`engine/semantic-agent/ResponsePipeline.ts`)
- Standalone validation pipeline — completely decoupled from LLM calls
- Ported from CE's `@properhealth/structured-llm-client/pipeline/ResponsePipeline`
- 6-step pipeline processing raw LLM text into validated typed objects:
  1. **Extract** JSON from markdown (handles ` ```json ` blocks) — uses regex
  2. **Repair** malformed JSON — uses `jsonrepair` library
  3. **Parse** JSON — `JSON.parse()`
  4. **Normalize** enum fields to lowercase (configurable field list)
  5. **Validate** against JSON Schema — Ajv with `allErrors: true` (same as CE's `JsonSchemaValidator`)
  6. **Sanitize** nulls to undefined
- Each step throws typed errors: `JsonExtractionError`, `JsonParseError`, `SchemaValidationError`
- Pure function: `responsePipeline.process(rawText) -> T | throws PipelineError`

#### 3. SemanticAgentImpl (`engine/semantic-agent/SemanticAgentImpl.ts`)
- Orchestrates LiteLLMProvider + ResponsePipeline
- **Validation-feedback retry loop (Instructor pattern):**
  1. Call LiteLLMProvider -> stream response -> accumulate content
  2. Pass content through ResponsePipeline
  3. On `PipelineError`: generate feedback message (categorized by error type), append `[assistant_response, user_feedback]` to messages, retry immediately (NO delay, NO exponential backoff)
  4. On success: return validated `{ result: T, reasoning: string }`
  5. Max attempts = `config.maxRetries + 1` (configurable per semantic agent config in DB)
- The retry here is purely for **JSON structure correction** — asking the LLM to fix its JSON output
- Network-level retries (timeouts, rate limits, 5xx) are handled by LiteLLM proxy config

#### Feedback Generation (`engine/semantic-agent/RetryFeedback.ts`)
Ported from CE's `structured-llm-client/retry/RetryHandler.ts`:
```
extraction error -> "Your response could not be parsed as JSON. Respond with ONLY a valid JSON object..."
parse error      -> "Your JSON was malformed: {message}. Respond with valid JSON..."
validation error -> "Your response had wrong structure: {message}. Return actual DATA matching the schema..."
```

#### JsonSchemaValidator (`engine/semantic-agent/JsonSchemaValidator.ts`)
- Wraps Ajv with `{ parse(data: unknown): T }` interface
- Ported directly from CE's `src/ce/semantic-agent/JsonSchemaValidator.ts`
- Used by ResponsePipeline step 5 and by load-time agent validation

#### Agent Validation (`engine/pipeline/validateAgent.ts`)

Single entry point that runs all validation checks and collects all violations into one error.
Called in two contexts:
1. **Save-time** — when user saves a version via API (backend validates before writing to DB)
2. **Load-time** — when engine loads an agent definition before execution
3. **Test-time** — when test-session receives a full config payload

Returns `{ valid: boolean, violations: string[] }` so the Studio UI can show all issues at once.

##### Graph Integrity Checks (ported from CE `validatePipelineGraph.ts`)

| Check | Description | Applies to |
|-------|-------------|------------|
| **Initial node exists** | `agent.initialNodeId` must reference an existing node | Agent |
| **Intent transition targets exist** | Each `transitions[intent].target` must be a valid node ID, `'self'`, or `'complete'` | `intent_parsing`, `review` |
| **Linear node targets exist** | `targetNodeId` must reference an existing node | `generation`, `tool`, `agentic`, `compute`, `conversation` |
| **Routing rule targets exist** | Each `rule.target` of type `node` must reference an existing node. Type `agent` targets are not validated (target agent may not exist yet) | `routing` |
| **Routing default target exists** | `defaultTarget` of type `node` must reference an existing node | `routing` |
| **At least one routing node** | Agent must have at least one routing node (only way to reach `complete`) | Agent |
| **Reachability** | All nodes must be reachable from `initialNodeId` via transitions (warns about orphaned nodes) | Agent |
| **No self-referencing linear nodes** | `targetNodeId` must not point to the node itself (infinite loop) | `generation`, `tool`, `agentic`, `compute`, `conversation` |
| **Complete is reachable** | At least one routing rule or default target must lead to `{ type: 'complete' }` | Agent |

##### Schema Completeness Checks (ported from CE `validatePipelineSchemas.ts`)

| Check | Description | Applies to |
|-------|-------------|------------|
| **SA config exists** | Every node with a `semanticAgentConfigId` must have a matching SA config | All node types with SA |
| **Output schema defined** | `outputSchemaJson` must be non-empty on the SA config | `agentic`, `conversation` |
| **Output schema is valid JSON Schema** | `outputSchemaJson` must compile with Ajv without errors | All nodes with output schemas |
| **Tool parameters schema defined** | All tools referenced by a node must have `parametersSchemaJson` | `agentic` (toolNames), `conversation` (availableTools) |
| **Tool exists** | All tool names referenced by nodes must exist in tool definitions | `tool` (toolName), `agentic` (toolNames), `conversation` (availableTools) |

##### Node-Specific Config Checks

| Check | Description | Applies to |
|-------|-------------|------------|
| **Valid intents match transitions** | Every entry in `validIntents` must have a corresponding key in `transitions` | `intent_parsing`, `review` |
| **Response templates match intents** | Every intent must have a `responseTemplates` entry | `intent_parsing`, `review` |
| **Options config valid** | `minSelections <= maxSelections`, items have unique IDs | `intent_parsing`, `review` |
| **Generation has output key** | `outputContextKey` must be non-empty | `generation` |
| **Compute has script** | `computeScript` must be non-empty (no `computeFnName` in agent-studio — all compute is script-based) | `compute` |
| **Agentic has max steps** | `maxSteps` must be > 0 | `agentic` |
| **Conversation has goal** | `goalDescription` must be non-empty | `conversation` |
| **Routing rules have conditions** | Each rule must have a non-empty `condition` | `routing` |

##### Configurable Field Value Checks

| Check | Valid values | Applies to |
|-------|-------------|------------|
| **nodeType valid** | `'intent_parsing'`, `'generation'`, `'routing'`, `'review'`, `'tool'`, `'agentic'`, `'compute'`, `'conversation'` | All nodes |
| **outputFormatting valid** | `'plain'`, `'markdown'`, `'markdown_clinical'` | SA config |
| **outputDensity valid** | `'compact'`, `'spacious'` | SA config |
| **reasoningFormatting valid** | `'concise'`, `'structured'`, `'clinical_verbose'`, `'thinking_markers'` | SA config |
| **temperature in range** | `0.0 <= temperature <= 2.0` | SA config |
| **maxRetries in range** | `0 <= maxRetries <= 10` | SA config |
| **maxOutputTokens valid** | `null` or `> 0` | SA config |
| **progressWeight valid** | `>= 0` | All nodes |
| **completionStrategy valid** | `'llm_decided'`, `'user_explicit'`, `'either'` | `conversation` |
| **options type valid** | `'single_select'`, `'multi_select'` | `intent_parsing`, `review` |
| **tool method valid** | `'GET'`, `'POST'`, `'PUT'`, `'PATCH'`, `'DELETE'` | Tool definitions |
| **tool authType valid** | `null`, `'bearer'`, `'api_key'`, `'basic'` | Tool definitions |
| **routing target type valid** | `'node'`, `'agent'`, `'complete'` | Routing rules |
| **transition action type valid** | `'set_context'`, `'increment_context'` | Transition actions |
| **iteration concurrency valid** | `> 0` | Nodes with `iteration` config |
| **maxSteps valid** | `> 0` | `agentic` |
| **maxStepsPerTurn valid** | `> 0` | `conversation` |

##### Context Mapping Checks (for cross-agent routing)

| Check | Description | Applies to |
|-------|-------------|------------|
| **Mapping keys non-empty** | `sourceKey` and `targetKey` must be non-empty strings | Routing rules with `contextMapping` |
| **No duplicate target keys** | Multiple mappings must not write to the same `targetKey` | Routing rules with `contextMapping` |

**File layout:**
```
engine/
├── llm/
│   └── LiteLLMProvider.ts              # OpenAI-compatible streaming to LiteLLM (no retry)
├── semantic-agent/
│   ├── SemanticAgentFactory.ts         # Creates agents from DB configs + JsonSchemaValidator
│   ├── SemanticAgentImpl.ts            # Orchestrator: LLM call + validation-feedback loop
│   ├── ResponsePipeline.ts             # 6-step JSON validation (extract->repair->parse->normalize->validate->sanitize)
│   ├── JsonSchemaValidator.ts          # Ajv wrapper with parse() interface
│   ├── RetryFeedback.ts               # Error-categorized feedback messages for LLM
│   └── ThinkingParser.ts              # Extracts thinking_start/thinking_end markers
├── pipeline/
│   ├── buildMachine.ts                 # XState machine builder (direct port)
│   └── validateAgent.ts               # All validation: graph integrity + schema completeness + node config + context mapping
```

### Session Resume (ported from CE)

Same session ID continues where it left off, even days later. Ported from CE's `ConversationEngineModule.#loadSnapshot()` + `#runPipeline()`.

**Two-tier snapshot load:**
1. **Redis cache** (hot path, ~1-5ms): `SessionCache.get(sessionId)` — 30min TTL
2. **PostgreSQL** (cold path, source of truth): `SnapshotRepository.load(sessionId)` — latest row by `created_at DESC`
3. If found: restore XState actor from `machineState`, restore pipeline context from `context`
4. If not found: create fresh session at agent's `initialNodeId`

**Resume flow:**
1. Client sends `POST /sessions/:sessionId/message` with same session ID
2. Engine loads snapshot (Redis -> PostgreSQL)
3. `createActor(machine, { snapshot: machineState })` restores XState to exact previous state
4. Conversation history loaded from `session_messages` table (not from snapshot)
5. Pipeline continues from where it was paused (waiting for user input)

**Append-only snapshots:**
- Every `#saveSnapshot()` creates a NEW row in `session_snapshots` (no updates)
- Provides full audit trail — can reconstruct any point in the conversation
- Latest snapshot is definitive state

**Session lifecycle:**
- Sessions live until explicitly deleted (no idle timeout)
- `sessions.status` tracks `'active'` | `'completed'` | `'deleted'`
- Deleted sessions cannot be resumed (guard check before snapshot load)

### Message Persistence (improvement over CE)

CE stores messages inside the snapshot JSONB (`conversationHistory`). This gets heavy as conversations grow.

**Agent-studio improvement:** Messages stored in a separate `session_messages` table.

**Benefits:**
- Snapshots stay lean (only pipeline state + context data, no message history)
- Efficient pagination for long conversations
- Messages are independently queryable (search, analytics, debugging)
- Separate table can be partitioned by time if needed for scale

**Write flow (on every node execution):**
1. User message received -> insert row with `role: 'user'`
2. LLM responds -> insert row with `role: 'assistant'` (+ optional `reasoning`)
3. System messages -> insert row with `role: 'system'`
4. Snapshot saved separately (context data only, no messages)

**Read flow (on session resume):**
1. Load snapshot from Redis/PostgreSQL (pipeline state + context)
2. Load recent messages from `session_messages WHERE session_id=X ORDER BY created_at ASC`
3. Build `conversationHistory` array from messages for LLM context
4. Use context window config to limit how many messages are sent to LLM (same as CE's `contextWindowConfig`)

### Intent Parsing — Unclear Intent Handling (improvement over CE)

In CE, when intent parsing returns `unclear`, it transitions to `self` (re-shows the node) with a static `responseTemplates.unclear` message. The user sees "Please select one of the paths" with no explanation of what went wrong.

**Agent-studio improvement:** When the LLM classifies intent as `unclear`, the executor:
1. Uses the LLM's `responseToUser` field (which explains what was unclear) instead of the static template
2. Falls back to `responseTemplates.unclear` only if the LLM didn't provide a `responseToUser`
3. The SA config's system prompt for intent parsing should instruct the LLM to explain what was unclear when returning the `unclear` intent

This gives users actionable feedback ("I couldn't tell if you wanted to start Health Habits or Health Plan. Please select one of the options below.") instead of a generic retry message.

**Implementation change in IntentParsingExecutor.buildIntentResult():** For the `unclear` intent specifically, prefer `parsedFields.responseToUser` over `responseTemplates.unclear`.

### Compute Nodes (isolated-vm)
- V8 isolates with 32MB memory limit, 5s timeout
- Code stored as string in `config_json.computeScript`
- Inputs injected as read-only globals
- No Node.js API access (no fs, net, process)

### WebView Option
- Nodes can have `webviewConfig` in `config_json`: `{ html, css, js }`
- Sent to client as `extensions.type: 'webview'` chunk
- Client renders in sandboxed iframe with `srcdoc` + `sandbox="allow-scripts"`
- JS in webview communicates back via `window.parent.postMessage()`

## Key Source Files to Port From

| CE File | Agent Studio Target | Notes |
|---------|-------------------|-------|
| `src/ce/types.ts` | `engine/types.ts` | Remove CE-specific, add WebView types |
| `src/ce/ConversationEngineModule.ts` | `engine/AgentEngine.ts` | Strip multi-tenancy, Temporal; keep XState |
| `src/ce/executors/*` | `engine/executors/*` | Direct port, ComputeExecutor rewritten with isolated-vm. IntentParsingExecutor improved: `unclear` intent uses LLM's `responseToUser` with explanation of what was unclear instead of static template |
| `src/ce/semantic-agent/SemanticAgentFactory.ts` | `engine/semantic-agent/SemanticAgentFactory.ts` | Port, use Drizzle queries instead of raw SQL |
| `src/ce/semantic-agent/SemanticAgentImpl.ts` | `engine/semantic-agent/SemanticAgentImpl.ts` | Rewrite: use LiteLLMProvider + ResponsePipeline, no structured-llm-client, no exponential backoff |
| `src/ce/semantic-agent/JsonSchemaValidator.ts` | `engine/semantic-agent/JsonSchemaValidator.ts` | Direct port (Ajv wrapper) |
| `src/ce/semantic-agent/ThinkingParser.ts` | `engine/semantic-agent/ThinkingParser.ts` | Direct port |
| `structured-llm-client/pipeline/ResponsePipeline.ts` | `engine/semantic-agent/ResponsePipeline.ts` | Port 6-step validation pipeline as standalone module (no library dependency) |
| `structured-llm-client/retry/RetryHandler.ts` | `engine/semantic-agent/RetryFeedback.ts` | Port feedback generation only (no retry timing logic) |
| `src/ce/pipeline/buildMachine.ts` | `engine/pipeline/buildMachine.ts` | Direct port — XState retained |
| `src/ce/pipeline/validatePipelineGraph.ts` + `validatePipelineSchemas.ts` | `engine/pipeline/validateAgent.ts` | Merged + expanded: graph integrity, schema completeness, node config, context mapping checks |
| `src/ce/utils/*` | `engine/utils/*` | Strip domain-specific helpers |
| `src/ce/persistence/*` | `engine/persistence/*` | Simplify (no domainId/appId), use Drizzle |
| `src/ce/loop-detection/LoopDetector.ts` | `engine/utils/loopDetector.ts` | Direct port |

## Implementation Phases

### Phase 1: Project Scaffold + Infrastructure (COMPLETED)
- Init standalone project at `/Users/amarspahic/work/agent-studio/` (NOT inside monorepo)
- pnpm monorepo with `backend/` and `frontend/` packages
- Backend: Fastify + TypeScript (ESM), `pnpm dev` working
- Frontend: Vite + React + TypeScript, `pnpm dev` working
- Docker Compose: `docker/docker-compose.infra.yml` (postgres 17, timescaledb, redis 7, weaviate, litellm v1.81.12-stable)
- Docker Compose: `docker/docker-compose.yml` (full stack for production/CI)
- LiteLLM config with model aliases
- Backend: Drizzle ORM setup — main PostgreSQL (schema.ts, drizzle.ts, drizzle.config.ts)
- Backend: Drizzle ORM setup — TimescaleDB (timescale-schema.ts, timescale.ts) + `create_hypertable` + compression policy
- Backend: Redis client (ioredis singleton)
- Backend: `drizzle-kit push` for main DB + raw SQL init for TimescaleDB hypertable
- Backend: Config validation (fail-fast on missing env vars)
- Backend: Health endpoint + pino logger
- CLAUDE.md with project conventions
- README.md with env vars list and setup instructions
- .gitignore, .env.example

### Phase 2: Auth System + MCP Server (COMPLETED)
- JWT auth via `jose`: register, login, me, refresh routes at `/api/auth`
- Password hashing: argon2id (OWASP recommended over bcrypt — memory-hard so resistant to GPU/ASIC attacks, no 72-byte password truncation; settings: m=64MB, t=3, p=4)
- Access tokens: 15min, refresh tokens: 7 days with rotation (SHA-256 hashed in DB)
- Auth middleware: `authenticate` (JWT Bearer) + `requireAdmin` hooks
- First registered user gets `admin` role automatically
- Admin can view all sessions and messages; regular users only their own
- MCP server at `/mcp` via Streamable HTTP transport with JWT Bearer auth
- MCP tools registered as stubs (list_agents, create_session, send_message, get_session_messages, list_sessions) — implementations in Phase 3
- Same JWT layer shared between REST API and MCP server
- **Pre-production security items:**
  - No rate limiting on auth endpoints (`/register`, `/login`, `/refresh`) — add `@fastify/rate-limit` before production
  - CORS wide open (`origin: true`) — restrict to specific frontend origins before production
  - MCP transport Map unbounded — add max session cap or TTL-based eviction to prevent memory exhaustion from abandoned sessions

### Phase 3: Backend CRUD API
- All repositories using Drizzle (User, Agent, Node, SAConfig, ToolDef, Version)
- All CRUD routes with auth (agents, nodes, semantic-agents, tools)
- All authenticated users see all agents and have full access (v1)
- Versioning routes: save as new version (row write), overwrite existing version, list, delete
- Session routes (create with version pinning, list, delete) — user-scoped
- Test session routes: create from full config payload (no DB), send message
- Validate with curl

### Phase 4: Execution Engine
- Port types.ts (remove CE-specific fields, add WebView types)
- Port buildMachine.ts (XState, direct port)
- Port + expand validateAgent.ts (graph integrity + schema completeness + node config + context mapping — see detailed checks in Engine Design section)
- **LLM layer**: LiteLLMProvider — OpenAI-compatible streaming to LiteLLM, no retry logic
- **JSON validation layer** (separate from LLM):
  - ResponsePipeline — 6-step pipeline (extract -> repair -> parse -> normalize -> validate -> sanitize)
  - JsonSchemaValidator — Ajv wrapper with `parse()` interface
  - RetryFeedback — error-categorized feedback messages for Instructor-pattern retries
- **Semantic agent**: SemanticAgentImpl orchestrates LiteLLMProvider + ResponsePipeline with validation-feedback loop (max N attempts, NO exponential backoff, NO delay between retries — LiteLLM handles network retries)
- SemanticAgentFactory — creates agents from DB configs
- ThinkingParser — marker-based reasoning extraction
- Port utils: interpolate, applyActions, chunkBuilders, httpToolCall, loopDetector
- Port all 8 executors (ComputeExecutor rewritten with isolated-vm)
- GenericExecutor dispatcher
- SnapshotRepository + SessionCache (using Drizzle for DB, ioredis for cache)
- AgentEngine main loop
- Cross-agent routing

### Phase 5: SSE Streaming + Test Chat
- `POST /sessions/:sessionId/message` -> SSE stream via @fastify/sse
- Frontend SSE parser (port from CE)
- TestChat component (messages, streaming, thinking)
- OptionsSelector (single/multi select, custom input)
- WebViewRenderer (sandboxed iframe)
- Session lifecycle in UI

### Phase 6: Frontend — Visual Agent Editor
- Login/register pages, JWT token management, auth store
- All users see full Studio (no role restrictions in v1)
- React Flow canvas with 8 custom node types (builder view)
- Node palette (drag-to-create)
- Node config panel (right sidebar, forms per node type)
- Semantic agent config panel
- Edge derivation from transitions/targetNodeId
- Zustand stores + API client
- Agent list page + agent editor page (all users, full access)
- Version panel (save as new version, overwrite current version, list versions, load version into editor, delete version)
- Test chat: run unsaved editor state via test-session API (no DB persistence needed)

### Phase 7: AI Pipeline Editor

An AI assistant that edits pipeline definitions through natural language chat, displayed as a side panel alongside the visual React Flow editor.

#### UX Flow
1. User opens agent editor -> visual editor (React Flow) is primary, AI chat panel on the right side
2. User types natural language: "Add an intent parsing node after the first node that asks the user about their dietary preferences with options: vegan, vegetarian, omnivore"
3. Backend sends request to LLM with:
   - The **current pipeline state** (all nodes, SA configs, transitions — from Zustand store)
   - The **AI skill/system prompt** (describes all node types, valid configs, validation rules)
   - The **user's instruction**
   - The **conversation history** (for multi-turn editing)
4. LLM returns **structured edit operations** (JSON)
5. Backend validates the proposed changes against `validateAgent()`
6. Frontend receives: proposed changes + validation result + human-readable summary
7. Frontend shows a **diff view**: what nodes/configs changed, added, or removed
8. User can **accept** (applies to Zustand store -> updates React Flow canvas) or **reject** (discards)
9. Changes are still unsaved (client-side only) — user must explicitly save via version routes

#### Backend: AI Editor Endpoint

```
POST /api/ai-editor/suggest
Body: {
  agent: { id, name, initialNodeId, ... },
  nodes: [...],                              // current nodes from client
  saConfigs: [...],                          // current SA configs from client
  toolDefinitions: [...],                    // available tools
  instruction: "Add a generation node...",   // user's natural language request
  conversationHistory: [...]                 // prior turns for multi-turn editing
}
Response: {
  operations: EditOperation[],               // structured edit ops
  summary: string,                           // human-readable description of changes
  validation: { valid: boolean, violations: string[] },
  conversationHistory: [...]                 // updated history for next turn
}
```

#### Edit Operations (structured output from LLM)

The LLM returns an array of typed edit operations. This is the output schema enforced via Ajv:

```typescript
type EditOperation =
  | { op: 'add_node', node: NodeConfig, saConfig?: SAConfig, position?: { x: number, y: number } }
  | { op: 'update_node', nodeId: string, changes: Partial<NodeConfig> }
  | { op: 'remove_node', nodeId: string }
  | { op: 'add_sa_config', saConfig: SAConfig }
  | { op: 'update_sa_config', nodeId: string, changes: Partial<SAConfig> }
  | { op: 'update_agent', changes: Partial<AgentConfig> }
  | { op: 'add_transition', nodeId: string, intent: string, rule: TransitionRule }
  | { op: 'update_transition', nodeId: string, intent: string, rule: TransitionRule }
  | { op: 'remove_transition', nodeId: string, intent: string }
  | { op: 'update_routing_rule', nodeId: string, ruleIndex: number, rule: RoutingRule }
  | { op: 'add_routing_rule', nodeId: string, rule: RoutingRule };
```

Operations are applied in order to the current state. The backend applies them to a copy, validates the result, and returns both the operations and the validated final state.

#### AI Skill (System Prompt)

The LLM needs a comprehensive system prompt that serves as its "skill" — knowledge of what it can do. Stored in DB as a dedicated SA config with model alias `studio-editor`.

The skill includes:
- **All 8 node types** with their full config schemas (every field, valid values, required vs optional)
- **Transition patterns** per node type (intent_parsing/review: intent->target map; generation/tool/etc: targetNodeId; routing: rules array)
- **SA config fields** with valid enum values (outputFormatting, outputDensity, reasoningFormatting, etc.)
- **Options config** structure (single_select/multi_select, items, customInput)
- **Routing target types** (node, agent, complete) and context mapping
- **Tool definition structure** (for referencing existing tools)
- **Validation rules** summary (so the LLM avoids producing invalid configs)
- **Edit operation schema** (exact JSON structure it must return)
- **Common patterns** / examples: "here's how to add an intent parsing node with options", "here's how to wire a generation -> routing -> complete flow"

This skill prompt is generated/maintained as part of the agent-studio codebase. When node types or validation rules change, the skill prompt must be updated to match.

#### Frontend: Diff View

When the AI proposes changes:
- **Added nodes**: shown in green on the React Flow canvas (ghost nodes) + listed in diff panel
- **Modified nodes**: highlighted in yellow on canvas + field-level diff in panel (old value -> new value)
- **Removed nodes**: shown in red/strikethrough on canvas + listed in diff panel
- **SA config changes**: shown as field-level diffs in the config panel
- **Transition changes**: shown as edge additions/removals on canvas

User actions:
- **Accept all**: apply all operations to Zustand store
- **Accept individual**: cherry-pick specific operations (future enhancement)
- **Reject**: discard all proposed changes
- **Ask follow-up**: continue the conversation ("Actually, make it multi_select instead of single_select")

#### Validation Pipeline

```
User instruction
    |
LLM generates EditOperation[] (via ResponsePipeline — same JSON validation as semantic agent)
    |
Apply operations to copy of current state
    |
Run validateAgent() on the resulting state
    |
If valid: return operations + summary + validated state
If invalid: return operations + violations (UI shows warnings, user can still accept with caveats or ask AI to fix)
```

#### LiteLLM Model Alias

Add `studio-editor` alias in LiteLLM config:
```yaml
- model_name: studio-editor
  litellm_params:
    model: gemini/gemini-3-pro-preview
```

### Phase 8: Polish
- Agent duplication
- contextDigest, toolCallCache, diffTracking
- Production Dockerfiles (multi-stage builds)
- Error handling, logging (pino)
- Agent import/export (JSON)

## Verification

1. `docker compose -f docker/docker-compose.infra.yml up` — all infra starts
2. `cd backend && pnpm dev` — backend starts, connects to postgres/redis/litellm
3. `cd frontend && pnpm dev` — Vite dev server starts
4. Create agent via API -> shows in frontend list
5. Open agent editor -> drag nodes -> configure -> save -> persists to DB
6. Create version -> restore version -> verify state matches
7. Open test chat -> send message -> SSE stream renders in UI
8. Pipeline executes: intent_parsing -> generation -> routing -> complete
9. Compute node runs sandboxed JS via isolated-vm
10. Cross-agent routing: agent A routes to agent B, context maps correctly
