/**
 * TimescaleDB schema — session_messages only.
 *
 * Lives in a separate TimescaleDB instance. The table is created by
 * docker/timescale-init.sql which also converts it to a hypertable
 * and sets up compression policies.
 *
 * No foreign key to sessions — hypertables don't support inbound FKs.
 * Referential integrity is handled in application code.
 */

import { pgTable, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const sessionMessages = pgTable('session_messages', {
  id:           text('id').notNull(),
  sessionId:    text('session_id').notNull(),
  nodeId:       text('node_id'),
  role:         text('role').notNull(),
  content:      text('content').notNull(),
  reasoning:    text('reasoning'),
  inputTokens:  integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  model:        text('model'),
  metadata:     jsonb('metadata'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
