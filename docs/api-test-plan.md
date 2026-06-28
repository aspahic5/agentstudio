# Agent Studio Backend — API Test Plan

Instructions for testing the backend API end-to-end. Run each section in order — later sections depend on IDs from earlier ones.

**Base URL:** `http://localhost:3001`

**Prerequisites:**
- Backend running (`pnpm dev` in `backend/`)
- Docker infra up (`docker compose -f docker-compose.infra.yml up -d` in `docker/`)
- `curl` and `jq` available

---

## 0. Health Check

```bash
curl -s http://localhost:3001/health | jq .
```

**Expect:** `{"status":"ok","timestamp":"..."}`

---

## 1. Register Users

Register a test user. The first user in the DB gets `admin` role.

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","name":"Admin","password":"password1234"}' | jq .
```

**Expect:** 201, `user.role` = `"admin"` (if first user), `accessToken` and `refreshToken` present.

**Save:** `ACCESS_TOKEN`, `USER_ID` from response.

Register a second user (will be `"user"` role):

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user2@test.com","name":"User Two","password":"password1234"}' | jq .
```

**Save:** `SECOND_TOKEN` from response.

### Error cases

| Test | Payload | Expected |
|------|---------|----------|
| Duplicate email | Same email as above | 409 |
| Short password | `{"email":"x@x.com","name":"X","password":"abc"}` | 400 |
| Invalid email | `{"email":"not-email","name":"X","password":"password1234"}` | 400 |
| Missing name | `{"email":"y@y.com","password":"password1234"}` | 400 |

---

## 2. Login

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"password1234"}' | jq .
```

**Expect:** 200, returns `user`, `accessToken`, `refreshToken`.

**Save:** Updated `ACCESS_TOKEN` and `REFRESH_TOKEN`.

### Error cases

| Test | Payload | Expected |
|------|---------|----------|
| Wrong password | `{"email":"admin@test.com","password":"wrong"}` | 401, `"Invalid credentials"` |
| Non-existent | `{"email":"nope@x.com","password":"anything"}` | 401, `"Invalid credentials"` |

---

## 3. Get Current User

```bash
curl -s http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expect:** 200, user object with `email`, `name`, `role`, `createdAt`.

### Error cases

| Test | Headers | Expected |
|------|---------|----------|
| No token | (none) | 401 |
| Bad token | `Authorization: Bearer invalid` | 401 |

---

## 4. Token Refresh

```bash
curl -s -X POST http://localhost:3001/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | jq .
```

**Expect:** 200, new `accessToken` and `refreshToken`.

**Save:** Updated tokens. The old refresh token is now consumed.

### Error cases

| Test | Payload | Expected |
|------|---------|----------|
| Reuse consumed token | Old `REFRESH_TOKEN` | 401 |
| Invalid token | `{"refreshToken":"garbage"}` | 401 |

---

## 5. Agent CRUD

### Create agent

```bash
curl -s -X POST http://localhost:3001/api/agents \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"name":"Test Agent","description":"E2E test","initialNodeId":"gen-node"}' | jq .
```

**Expect:** 201, agent object with `id`, `name`, `initialNodeId`, `createdBy`, `currentVersion: "0.0.0"`.

**Save:** `AGENT_ID` from response.

### List agents

```bash
curl -s http://localhost:3001/api/agents \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expect:** 200, array containing the created agent.

### Get agent

```bash
curl -s http://localhost:3001/api/agents/$AGENT_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expect:** 200, agent object.

### Update agent

```bash
curl -s -X PUT http://localhost:3001/api/agents/$AGENT_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"description":"Updated description"}' | jq .
```

**Expect:** 200, updated agent.

### Error cases

| Test | Details | Expected |
|------|---------|----------|
| Non-owner update | Use `SECOND_TOKEN` | 403 |
| Not found | GET `/api/agents/00000000-0000-0000-0000-000000000000` | 404 |
| Missing name | POST without `name` field | 400 |
| No auth | Any endpoint without token | 401 |

---

## 6. Version Management

### Create version 1.0.0

This creates a minimal valid agent with 2 nodes. `validateAgentGraph` requires at least one routing node.

```bash
curl -s -X POST http://localhost:3001/api/agents/$AGENT_ID/versions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "version": "1.0.0",
    "label": "initial",
    "nodes": [
      {
        "id": "gen-node",
        "name": "Generate Response",
        "nodeType": "generation",
        "semanticAgentConfigId": "gen-config",
        "phaseLabel": "generation",
        "progressWeight": 1,
        "configJson": {
          "targetNodeId": "router-node",
          "outputContextKey": "generated_response",
          "generationPromptTemplate": "Respond to the user: {{userMessage}}"
        }
      },
      {
        "id": "router-node",
        "name": "Route to Complete",
        "nodeType": "routing",
        "phaseLabel": "routing",
        "progressWeight": 1,
        "configJson": {
          "rules": [],
          "defaultTarget": {"type": "complete"}
        }
      }
    ],
    "saConfigs": [
      {
        "id": "gen-config",
        "nodeId": "gen-node",
        "name": "Generation Config",
        "systemPrompt": "You are a helpful test assistant. Respond briefly.",
        "maxRetries": 1,
        "temperature": 0.3
      }
    ]
  }' | jq .
```

**Expect:** 201, `{"version":"1.0.0"}`.

**Key rules:**
- Node IDs in `configJson` (like `targetNodeId`) must reference other node IDs in the same payload
- `semanticAgentConfigId` on a node must match a `saConfig.id` in the same payload
- `nodeId` on a saConfig must match a `node.id` in the same payload
- All IDs are remapped to UUIDs server-side

### List versions

```bash
curl -s http://localhost:3001/api/agents/$AGENT_ID/versions \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expect:** 200, array with version 1.0.0.

### Get version data

```bash
curl -s http://localhost:3001/api/agents/$AGENT_ID/versions/1.0.0/data \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expect:** 200, `{version: {...}, nodes: [2 items], saConfigs: [1 item]}`.

### Update label

```bash
curl -s -X PUT http://localhost:3001/api/agents/$AGENT_ID/versions/1.0.0/label \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"label":"production"}' | jq .
```

**Expect:** 200, version with `label: "production"`.

### Overwrite version

Replaces all nodes and configs for the version:

```bash
curl -s -X PUT http://localhost:3001/api/agents/$AGENT_ID/versions/1.0.0 \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "nodes": [
      {"id":"gen-node","name":"Generate v2","nodeType":"generation","semanticAgentConfigId":"gen-config","phaseLabel":"generation","progressWeight":1,"configJson":{"targetNodeId":"router-node","outputContextKey":"generated_response","generationPromptTemplate":"v2: {{userMessage}}"}},
      {"id":"router-node","name":"Route v2","nodeType":"routing","phaseLabel":"routing","progressWeight":1,"configJson":{"rules":[],"defaultTarget":{"type":"complete"}}}
    ],
    "saConfigs": [
      {"id":"gen-config","nodeId":"gen-node","name":"Config v2","systemPrompt":"You are version 2. Respond briefly.","maxRetries":1,"temperature":0.5}
    ]
  }' | jq .
```

**Expect:** 200. Verify with GET version data — node names should show "v2".

### Delete version

Create 2.0.0 (same payload as 1.0.0 but with `"version":"2.0.0"`), then delete it:

```bash
curl -s -X DELETE http://localhost:3001/api/agents/$AGENT_ID/versions/2.0.0 \
  -H "Authorization: Bearer $ACCESS_TOKEN" -w '\n%{http_code}'
```

**Expect:** 204. GET that version should return 404.

### Error cases

| Test | Details | Expected |
|------|---------|----------|
| Duplicate version | POST 1.0.0 again | 409 |
| Invalid format | GET `/versions/abc/data` | 400 |
| Non-existent agent | GET versions for fake agent ID | 404 |

---

## 7. Tool Definitions

**Note:** Create/update/delete require `admin` role.

### Create tool

```bash
curl -s -X POST http://localhost:3001/api/tools \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "test-search",
    "description": "A test search tool",
    "urlTemplate": "https://example.com/api/search",
    "method": "POST",
    "parametersSchemaJson": {"type":"object","properties":{"query":{"type":"string"}}}
  }' | jq .
```

**Expect:** 201, tool object with `id`.

**Save:** `TOOL_ID`.

### List tools

```bash
curl -s http://localhost:3001/api/tools \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expect:** 200, array.

### Update tool

```bash
curl -s -X PUT http://localhost:3001/api/tools/$TOOL_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"description":"Updated description"}' | jq .
```

**Expect:** 200, updated tool.

### Delete tool

```bash
curl -s -X DELETE http://localhost:3001/api/tools/$TOOL_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" -w '\n%{http_code}'
```

**Expect:** 204.

### Error cases

| Test | Details | Expected |
|------|---------|----------|
| Non-admin create | Use `SECOND_TOKEN` | 403, `"Admin access required"` |
| Not found | PUT fake tool ID | 404 |
| No auth | GET without token | 401 |

---

## 8. Sessions

### Create session

```bash
curl -s -X POST http://localhost:3001/api/agents/$AGENT_ID/sessions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{}' | jq .
```

**Expect:** 201, session with `id`, `agentId`, `version` (defaults to agent's `currentVersion`), `userId`, `status: "active"`.

**Save:** `SESSION_ID`.

### Create with explicit version

```bash
curl -s -X POST http://localhost:3001/api/agents/$AGENT_ID/sessions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"version":"1.0.0"}' | jq .
```

**Expect:** 201, `version: "1.0.0"`.

### List sessions

```bash
curl -s http://localhost:3001/api/agents/$AGENT_ID/sessions \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expect:** 200, array filtered to current user's sessions.

### Delete session

```bash
curl -s -X DELETE http://localhost:3001/api/sessions/$SESSION_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" -w '\n%{http_code}'
```

**Expect:** 204 (owner), 403 (non-owner with `SECOND_TOKEN`).

### Error cases

| Test | Details | Expected |
|------|---------|----------|
| Bad version | `{"version":"99.99.99"}` | 404 |
| Non-existent agent | POST to fake agent ID | 404 |
| Non-owner delete | Use `SECOND_TOKEN` | 403 |
| Not found | DELETE fake session ID | 404 |

---

## 9. Send Message (SSE Streaming)

This is the core engine test. Create a fresh session first, then send a message.

```bash
curl -s -N -X POST http://localhost:3001/api/sessions/$SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"message":"Hello, say test ok"}'
```

**Expect:** Server-Sent Events stream:
- Multiple `data: {...}\n\n` lines (engine chunks)
- Look for chunks with `"type":"phase-start"`, `"type":"node-title"`, `"type":"text"`, `"type":"turn-complete"`
- Stream ends with `data: [DONE]\n\n`
- The `turn-complete` chunk has `currentNodeId` and `done` flag

### With initial context

```bash
curl -s -N -X POST http://localhost:3001/api/sessions/$SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"message":"What is the project?","initialContext":{"projectName":"Synactic"}}'
```

### Null message (trigger entry execution without user input)

```bash
curl -s -N -X POST http://localhost:3001/api/sessions/$SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"message":null}'
```

### Error cases

| Test | Details | Expected |
|------|---------|----------|
| Non-existent session | POST to fake session ID | 404 |
| Wrong user | Use `SECOND_TOKEN` | 403 |
| No auth | No token | 401 |

---

## 10. Cleanup

Delete in reverse order (or just delete the agent — cascades to versions, nodes, configs, sessions):

```bash
curl -s -X DELETE http://localhost:3001/api/agents/$AGENT_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" -w '\n%{http_code}'
```

**Expect:** 204. All versions, nodes, saConfigs, and sessions for this agent are cascade-deleted.

Users cannot be deleted via API — they remain in the database.

---

## Quick Reference

| Endpoint | Method | Auth | Notes |
|----------|--------|------|-------|
| `/health` | GET | No | |
| `/api/auth/register` | POST | No | First user = admin |
| `/api/auth/login` | POST | No | |
| `/api/auth/me` | GET | Yes | |
| `/api/auth/refresh` | POST | No | Consumes old refresh token |
| `/api/agents` | GET, POST | Yes | |
| `/api/agents/:id` | GET, PUT, DELETE | Yes | PUT/DELETE: owner or admin |
| `/api/agents/:id/versions` | GET, POST | Yes | |
| `/api/agents/:id/versions/:ver` | PUT, DELETE | Yes | PUT = overwrite all nodes |
| `/api/agents/:id/versions/:ver/data` | GET | Yes | Returns nodes + configs |
| `/api/agents/:id/versions/:ver/label` | PUT | Yes | |
| `/api/tools` | GET, POST | Yes | POST: admin only |
| `/api/tools/:id` | PUT, DELETE | Yes | Admin only |
| `/api/agents/:id/sessions` | GET, POST | Yes | |
| `/api/sessions/:id` | DELETE | Yes | Owner only |
| `/api/sessions/:id/messages` | POST | Yes | SSE stream, owner only |
