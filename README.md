# Agent Studio

Production-grade pipeline execution engine with a visual drag-and-drop studio for building and testing AI agent pipelines.

## Quick Start

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### 1. Start Infrastructure

```bash
docker compose -f docker/docker-compose.infra.yml up -d
```

This starts: PostgreSQL 17, TimescaleDB, Redis 7, Weaviate, LiteLLM.

### 2. Configure Environment

```bash
cp .env.example backend/.env
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Push Database Schema

```bash
cd backend
pnpm drizzle-kit push
```

TimescaleDB is initialized automatically via `docker/timescale-init.sql` on first container start.

### 5. Start Development Servers

```bash
# Both backend and frontend
pnpm dev

# Or individually
pnpm dev:backend   # Fastify on http://localhost:3001
pnpm dev:frontend  # Vite on http://localhost:5173
```

### 6. Verify

```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"..."}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Main PostgreSQL connection string |
| `TIMESCALE_URL` | Yes | — | TimescaleDB connection string (session_messages) |
| `REDIS_URL` | Yes | — | Redis connection string (session snapshot cache) |
| `LITELLM_BASE_URL` | Yes | — | LiteLLM proxy URL |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens |
| `PORT` | No | `3001` | Backend server port |
| `HOST` | No | `0.0.0.0` | Backend server host |
| `NODE_TLS_REJECT_UNAUTHORIZED` | No | — | Set to `0` for local Docker with self-signed certs |

## Docker Compose Files

| File | Purpose |
|------|---------|
| `docker/docker-compose.infra.yml` | Dev infrastructure only (postgres, timescaledb, redis, weaviate, litellm) |
| `docker/docker-compose.yml` | Full stack including backend and frontend (production/CI) |

## Tech Stack

- **Backend**: Fastify + TypeScript (ESM)
- **Frontend**: React + Vite + TypeScript
- **ORM**: Drizzle ORM + postgres-js
- **Database**: PostgreSQL 17 + TimescaleDB (hypertable for messages)
- **Cache**: Redis 7
- **Vector DB**: Weaviate
- **LLM Proxy**: LiteLLM v1.81.12-stable
- **Package Manager**: pnpm (monorepo)

## Auth API

All auth routes are at `/api/auth`. First registered user gets `admin` role automatically.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Register user (returns access + refresh tokens) |
| POST | `/api/auth/login` | No | Login (returns access + refresh tokens) |
| GET | `/api/auth/me` | Bearer | Get current user |
| POST | `/api/auth/refresh` | No | Refresh access token (rotation: old token invalidated) |

Access tokens expire in 15 minutes. Refresh tokens expire in 7 days.

## MCP Server

Agent Studio exposes an MCP (Model Context Protocol) server at `/mcp` via Streamable HTTP transport. AI agents (Claude, GPT, Cursor, etc.) can connect using JWT Bearer token authentication.

Available tools (implementations coming in Phase 3):
- `list_agents` — List available agents
- `create_session` — Create a session for an agent
- `send_message` — Send a message to a session
- `get_session_messages` — Get message history
- `list_sessions` — List user's sessions

## Project Structure

```
agent-studio/
├── backend/          # Fastify API server
│   └── src/
│       ├── db/       # Drizzle schemas, connections, Redis client
│       ├── auth/     # JWT (jose), password hashing (argon2id), middleware
│       ├── routes/   # API routes (auth)
│       ├── repositories/  # Data access layer (UserRepository)
│       ├── mcp/      # MCP server (Streamable HTTP + Bearer auth)
│       ├── engine/   # Pipeline execution engine (future)
│       └── ...
├── frontend/         # React + Vite client
├── docker/           # Docker Compose + init scripts
└── docs/             # Implementation plan
```

See `docs/PLAN.md` for the full implementation plan.
