import { createMachine, type AnyStateMachine } from 'xstate';
import type { AgentDefinition, AgentNode } from './types.js';
import { ApplicationError } from './errors.js';

interface AgentMachineContext {
  agentId: string;
  currentNodeId: string;
  contextData: Record<string, unknown>;
}

function buildStateConfig(
  node: AgentNode,
  allNodeIds: string[]
): Record<string, unknown> {
  switch (node.nodeType) {
    case 'intent_parsing':
      return {
        on: {
          TRANSITION: allNodeIds.map((targetId) => ({
            target: targetId,
            guard: ({ event }: { event: { target: string } }) => event.target === targetId,
          })),
        },
        meta: { nodeType: 'intent_parsing', nodeId: node.id, phaseLabel: node.phaseLabel },
      };

    case 'review':
      return {
        on: {
          TRANSITION: allNodeIds.map((targetId) => ({
            target: targetId,
            guard: ({ event }: { event: { target: string } }) => event.target === targetId,
          })),
        },
        meta: {
          nodeType: 'review',
          nodeId: node.id,
          phaseLabel: node.phaseLabel,
          contentContextKey: node.contentContextKey,
        },
      };

    case 'generation':
      return {
        on: { TRANSITION: { target: node.targetNodeId, actions: 'applyContextUpdates' } },
        meta: { nodeType: 'generation', nodeId: node.id, phaseLabel: node.phaseLabel },
      };

    case 'tool':
      return {
        on: { TRANSITION: { target: node.targetNodeId, actions: 'applyContextUpdates' } },
        meta: { nodeType: 'tool', nodeId: node.id, phaseLabel: node.phaseLabel, toolName: node.toolName },
      };

    case 'agentic':
      return {
        on: { TRANSITION: { target: node.targetNodeId, actions: 'applyContextUpdates' } },
        meta: { nodeType: 'agentic', nodeId: node.id, phaseLabel: node.phaseLabel },
      };

    case 'compute':
      return {
        on: { TRANSITION: { target: node.targetNodeId, actions: 'applyContextUpdates' } },
        meta: {
          nodeType: 'compute',
          nodeId: node.id,
          phaseLabel: node.phaseLabel,
          computeScript: node.computeScript,
        },
      };

    case 'conversation':
      return {
        on: { TRANSITION: { target: node.targetNodeId, actions: 'applyContextUpdates' } },
        meta: { nodeType: 'conversation', nodeId: node.id, phaseLabel: node.phaseLabel },
      };

    case 'routing':
      return {
        on: {
          TRANSITION: allNodeIds.map((targetId) => ({
            target: targetId,
            guard: ({ event }: { event: { target: string } }) => event.target === targetId,
          })),
          COMPLETE: '__complete',
        },
        meta: { nodeType: 'routing', nodeId: node.id, phaseLabel: node.phaseLabel },
      };
  }
}

export function buildMachine(agent: AgentDefinition, nodes: AgentNode[]): AnyStateMachine {
  const initialNode = nodes.find((n) => n.id === agent.initialNodeId);
  if (!initialNode) {
    throw new ApplicationError(
      `Agent "${agent.id}" references initial node "${agent.initialNodeId}" which does not exist`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { agentId: agent.id, initialNodeId: agent.initialNodeId } }
    );
  }

  const allNodeIds = nodes.map((n) => n.id);
  const states: Record<string, Record<string, unknown>> = {};
  for (const node of nodes) {
    states[node.id] = buildStateConfig(node, allNodeIds);
  }
  states['__complete'] = { type: 'final' as const };

  const machine = createMachine({
    id: agent.id,
    initial: agent.initialNodeId,
    context: {
      agentId: agent.id,
      currentNodeId: agent.initialNodeId,
      contextData: {},
    } as AgentMachineContext,
    states,
  });

  return machine;
}
