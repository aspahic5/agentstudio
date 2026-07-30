/**
 * Main PostgreSQL schema — all tables except session_messages.
 *
 * session_messages lives in a separate TimescaleDB instance (see timescale-schema.ts).
 */

import { pgTable, text, integer, real, jsonb, timestamp, unique, index } from 'drizzle-orm/pg-core';

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
}, (t) => [
  index('idx_refresh_tokens_user_id').on(t.userId),
]);

// ============================================================================
// Agents
// ============================================================================

export const agents = pgTable('agents', {
  id:             text('id').primaryKey(),
  name:           text('name').notNull(),
  description:    text('description').notNull().default(''),
  initialNodeId:  text('initial_node_id'),
  currentVersion: text('current_version'),
  createdBy:      text('created_by').notNull().references(() => users.id),
  inputContract:  jsonb('input_contract'),
  metadata:       jsonb('metadata').notNull().default({}),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_agents_created_by').on(t.createdBy),
]);

// ============================================================================
// Agent Nodes — scoped to (agent_id, version)
// ============================================================================

export const agentNodes = pgTable('agent_nodes', {
  id:                    text('id').primaryKey(),
  agentId:               text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:               text('version').notNull(),
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
}, (t) => [
  index('idx_agent_nodes_agent_version').on(t.agentId, t.version),
]);

// ============================================================================
// Semantic Agent Configs — scoped to (agent_id, version)
// ============================================================================

export const semanticAgentConfigs = pgTable('semantic_agent_configs', {
  id:                 text('id').primaryKey(),
  agentId:            text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:            text('version').notNull(),
  nodeId:             text('node_id').notNull(),
  name:               text('name').notNull(),
  systemPrompt:       text('system_prompt').notNull(),
  outputSchemaJson:   jsonb('output_schema_json').notNull().default({}),
  maxRetries:         integer('max_retries').notNull().default(2),
  temperature:        real('temperature').notNull().default(0.7),
  maxOutputTokens:    integer('max_output_tokens'),
  outputFormatting:   text('output_formatting').notNull().default('markdown'),
  outputDensity:      text('output_density').notNull().default('compact'),
  reasoningFormatting: text('reasoning_formatting').notNull().default('concise'),
  thinkingGuidance:   text('thinking_guidance'),
  modelAlias:         text('model_alias'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sa_configs_agent_version').on(t.agentId, t.version),
]);

// ============================================================================
// Tool Definitions — global (not versioned)
// ============================================================================

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
  parametersSchemaJson: jsonb('parameters_schema_json'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Agent Versions — registry of which versions exist
// ============================================================================

export const agentVersions = pgTable('agent_versions', {
  id:        text('id').primaryKey(),
  agentId:   text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:   text('version').notNull(),
  label:     text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_agent_versions_agent_version').on(t.agentId, t.version),
]);

// ============================================================================
// Sessions — pinned to a specific agent version
// ============================================================================

export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),
  agentId:   text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version:   text('version').notNull(),
  userId:    text('user_id').notNull().references(() => users.id),
  status:    text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sessions_user_id').on(t.userId),
  index('idx_sessions_agent_user').on(t.agentId, t.userId),
]);

// ============================================================================
// Session Snapshots — append-only (audit trail)
// ============================================================================

export const sessionSnapshots = pgTable('session_snapshots', {
  id:           text('id').primaryKey(),
  sessionId:    text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  agentId:      text('agent_id').notNull(),
  nodeId:       text('node_id').notNull(),
  machineState: jsonb('machine_state').notNull(),
  context:      jsonb('context').notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_snapshots_session_created').on(t.sessionId, t.createdAt),
]);
