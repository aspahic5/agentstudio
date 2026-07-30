import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Ajv from 'ajv';
import { parseBody } from '../validation.js';
import { authenticate, requireAdmin } from '../auth/middleware.js';
import { toolDefinitionRepository } from '../repositories/ToolDefinitionRepository.js';

const ajv = new Ajv({ addUsedSchema: false });

const createToolSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  urlTemplate: z.string().max(2000).optional(),
  method: z.string().max(10).optional(),
  headers: z.record(z.string(), z.unknown()).nullable().optional(),
  bodyTemplate: z.string().max(50_000).nullable().optional(),
  responsePath: z.string().max(500).nullable().optional(),
  authType: z.string().max(50).nullable().optional(),
  parametersSchemaJson: z.unknown().optional(),
});

const updateToolSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  urlTemplate: z.string().max(2000).optional(),
  method: z.string().max(10).optional(),
  headers: z.record(z.string(), z.unknown()).nullable().optional(),
  bodyTemplate: z.string().max(50_000).nullable().optional(),
  responsePath: z.string().max(500).nullable().optional(),
  authType: z.string().max(50).nullable().optional(),
  parametersSchemaJson: z.unknown().optional(),
});

function validateParametersSchema(schema: unknown): void {
  try {
    ajv.compile(schema as object);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON Schema';
    throw { statusCode: 400, message: `Invalid parametersSchemaJson: ${message}` };
  }
}

function redactHeaders<T extends { headers: unknown }>(tool: T): Omit<T, 'headers'> & { headers: null } {
  return { ...tool, headers: null };
}

export default async function toolRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/', async (request) => {
    const tools = await toolDefinitionRepository.list();
    if (request.user.role === 'admin') return tools;
    return tools.map(redactHeaders);
  });

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = parseBody(createToolSchema, request.body);
    if (body.parametersSchemaJson !== undefined) {
      validateParametersSchema(body.parametersSchemaJson);
    }
    const tool = await toolDefinitionRepository.create(body);
    return reply.code(201).send(tool);
  });

  app.put('/:toolId', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { toolId } = request.params as { toolId: string };
    const body = parseBody(updateToolSchema, request.body);
    const existing = await toolDefinitionRepository.findById(toolId);
    if (!existing) return reply.code(404).send({ error: 'Tool not found' });
    if (body.parametersSchemaJson !== undefined) {
      validateParametersSchema(body.parametersSchemaJson);
    }
    return toolDefinitionRepository.update(toolId, body);
  });

  app.delete('/:toolId', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { toolId } = request.params as { toolId: string };
    const existing = await toolDefinitionRepository.findById(toolId);
    if (!existing) return reply.code(404).send({ error: 'Tool not found' });
    await toolDefinitionRepository.delete(toolId);
    return reply.code(204).send();
  });
}
