import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'agent-studio', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.tool('list_agents', 'List available agents', {}, async () => {
    return { content: [{ type: 'text', text: 'Not yet implemented — available after Phase 3' }], isError: true };
  });

  server.tool('create_session', 'Create a session for an agent', { agentId: z.string() }, async () => {
    return { content: [{ type: 'text', text: 'Not yet implemented — available after Phase 3' }], isError: true };
  });

  server.tool('send_message', 'Send a message to a session', {
    sessionId: z.string(),
    message: z.string(),
  }, async () => {
    return { content: [{ type: 'text', text: 'Not yet implemented — available after Phase 3' }], isError: true };
  });

  server.tool('get_session_messages', 'Get message history for a session', { sessionId: z.string() }, async () => {
    return { content: [{ type: 'text', text: 'Not yet implemented — available after Phase 3' }], isError: true };
  });

  server.tool('list_sessions', "List the authenticated user's sessions", {}, async () => {
    return { content: [{ type: 'text', text: 'Not yet implemented — available after Phase 3' }], isError: true };
  });

  return server;
}
