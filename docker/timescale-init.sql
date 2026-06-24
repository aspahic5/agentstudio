-- TimescaleDB initialization for session_messages
-- This runs automatically when the container starts for the first time.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS session_messages (
  id           TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  node_id      TEXT,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  reasoning    TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  model        TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
);

SELECT create_hypertable('session_messages', 'created_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON session_messages (session_id, created_at ASC);

-- Compress chunks older than 30 days
SELECT add_compression_policy('session_messages', INTERVAL '30 days', if_not_exists => TRUE);
