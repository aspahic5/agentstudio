import type { EditorAgentNode, FlowEdge, RoutingTarget, TransitionRule, RoutingRule } from '@/types/editor';

export function deriveEdges(nodes: Map<string, EditorAgentNode>): FlowEdge[] {
  const edges: FlowEdge[] = [];
  let counter = 0;
  const nodeIds = new Set(nodes.keys());

  for (const node of nodes.values()) {
    const cfg = (node.configJson ?? {}) as Record<string, unknown>;

    switch (node.nodeType) {
      case 'intent_parsing':
      case 'review': {
        // transitions[intent].target -> edge per intent (skip 'self' and 'complete')
        const transitions = cfg.transitions as Record<string, TransitionRule> | undefined;
        if (transitions) {
          for (const [intent, rule] of Object.entries(transitions)) {
            if (rule.target && rule.target !== 'self' && rule.target !== 'complete' && nodeIds.has(rule.target)) {
              edges.push({
                id: `e-${counter++}`,
                source: node.id,
                target: rule.target,
                sourceHandle: `transition-${intent}`,
                type: 'smoothstep',
                label: intent,
              });
            }
          }
        }
        break;
      }

      case 'generation':
      case 'tool':
      case 'agentic':
      case 'compute':
      case 'conversation':
      case 'screen': {
        // targetNodeId -> single edge
        const targetNodeId = cfg.targetNodeId as string | undefined;
        if (targetNodeId && nodeIds.has(targetNodeId)) {
          edges.push({
            id: `e-${counter++}`,
            source: node.id,
            target: targetNodeId,
            type: 'smoothstep',
          });
        }
        break;
      }

      case 'input': {
        // options[].targetNodeId -> one edge per option (sourceHandle matches handle on node)
        const options = cfg.options as Array<{ id: string; label: string; targetNodeId: string }> | undefined;
        if (options) {
          for (const option of options) {
            if (option.targetNodeId && nodeIds.has(option.targetNodeId)) {
              edges.push({
                id: `e-${counter++}`,
                source: node.id,
                target: option.targetNodeId,
                sourceHandle: `option-${option.id ?? option.label}`,
                type: 'smoothstep',
                label: option.label,
              });
            }
          }
        }
        break;
      }

      case 'routing': {
        // rules[].target (if type='node') -> edge per rule
        const rules = cfg.rules as RoutingRule[] | undefined;
        if (rules) {
          for (const rule of rules) {
            if (rule.target && (rule.target as RoutingTarget).type === 'node') {
              const nodeId = (rule.target as { type: 'node'; nodeId: string }).nodeId;
              if (nodeIds.has(nodeId)) {
                edges.push({
                  id: `e-${counter++}`,
                  source: node.id,
                  target: nodeId,
                  sourceHandle: `rule-${rule.condition}`,
                  type: 'smoothstep',
                  label: rule.condition,
                });
              }
            }
          }
        }

        // defaultTarget -> edge (animated)
        const defaultTarget = cfg.defaultTarget as RoutingTarget | undefined;
        if (defaultTarget?.type === 'node') {
          const nodeId = (defaultTarget as { type: 'node'; nodeId: string }).nodeId;
          if (nodeIds.has(nodeId)) {
            edges.push({
              id: `e-${counter++}`,
              source: node.id,
              target: nodeId,
              sourceHandle: 'default',
              type: 'smoothstep',
              label: 'default',
              animated: true,
            });
          }
        }
        break;
      }
    }
  }

  return edges;
}
