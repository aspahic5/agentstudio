import type { AgentDefinition, AgentNode, ToolDefinition } from './types.js';
import { ApplicationError } from './errors.js';

export function validateAgentSchemas(
  nodes: Map<string, AgentNode>,
  toolDefinitions: Map<string, ToolDefinition>
): void {
  const violations: string[] = [];

  for (const node of nodes.values()) {
    if (node.nodeType === 'agentic') {
      if (!node.outputSchema) {
        violations.push(`Agentic node "${node.id}" is missing outputSchema`);
      }

      for (const toolName of node.toolNames) {
        const toolDef = toolDefinitions.get(toolName);
        if (toolDef && !toolDef.parametersSchemaJson) {
          violations.push(
            `Agentic node "${node.id}" references tool "${toolName}" which has no parametersSchemaJson`
          );
        }
      }
    }

    if (node.nodeType === 'conversation') {
      if (!node.outputSchema) {
        violations.push(`Conversation node "${node.id}" is missing outputSchema`);
      }

      if (node.availableTools) {
        for (const toolName of node.availableTools) {
          const toolDef = toolDefinitions.get(toolName);
          if (toolDef && !toolDef.parametersSchemaJson) {
            violations.push(
              `Conversation node "${node.id}" references tool "${toolName}" which has no parametersSchemaJson`
            );
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new ApplicationError(
      `[validateAgentSchemas] Agent schema validation failed:\n${violations.map(v => `  - ${v}`).join('\n')}`,
      { code: 'CONFIGURATION_ERROR', context: { violations } }
    );
  }
}

export function validateAgentGraph(agent: AgentDefinition, nodes: AgentNode[]): void {
  const nodeIds = new Set(nodes.map((n) => n.id));

  if (!nodeIds.has(agent.initialNodeId)) {
    throw new ApplicationError(
      `Agent "${agent.id}": initial node "${agent.initialNodeId}" not found`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { agentId: agent.id, initialNodeId: agent.initialNodeId } }
    );
  }

  for (const node of nodes) {
    if (node.nodeType === 'intent_parsing' || node.nodeType === 'review') {
      for (const [intent, rule] of Object.entries(node.transitions)) {
        if (rule.target !== 'self' && rule.target !== 'complete' && !nodeIds.has(rule.target)) {
          throw new ApplicationError(
            `Node "${node.id}": transition for intent "${intent}" targets non-existent node "${rule.target}"`,
            { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id, intent, targetNodeId: rule.target } }
          );
        }
      }
    } else if (
      node.nodeType === 'generation' ||
      node.nodeType === 'tool' ||
      node.nodeType === 'agentic' ||
      node.nodeType === 'compute' ||
      node.nodeType === 'conversation'
    ) {
      if (!nodeIds.has(node.targetNodeId)) {
        throw new ApplicationError(
          `Node "${node.id}": targets non-existent node "${node.targetNodeId}"`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id, targetNodeId: node.targetNodeId } }
        );
      }
    } else if (node.nodeType === 'routing') {
      for (const rule of node.rules) {
        if (rule.target.type === 'node' && !nodeIds.has(rule.target.nodeId)) {
          throw new ApplicationError(
            `Node "${node.id}": routing rule targets non-existent node "${rule.target.nodeId}"`,
            { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id, targetNodeId: rule.target.nodeId } }
          );
        }
      }
      if (node.defaultTarget.type === 'node' && !nodeIds.has(node.defaultTarget.nodeId)) {
        throw new ApplicationError(
          `Node "${node.id}": defaultTarget targets non-existent node "${node.defaultTarget.nodeId}"`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id, targetNodeId: node.defaultTarget.nodeId } }
        );
      }
    }
  }

}
