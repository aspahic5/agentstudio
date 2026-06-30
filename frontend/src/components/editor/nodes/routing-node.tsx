import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData, RoutingRule, RoutingTarget } from '@/types/editor';
import { BaseNode } from './base-node';

function RoutingNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const rules = (cfg.rules ?? []) as RoutingRule[];
  const defaultTarget = cfg.defaultTarget as RoutingTarget | undefined;

  const sourceHandles = [
    ...rules.map(r => ({ id: `rule-${r.condition}`, label: r.condition })),
    ...(defaultTarget?.type === 'node' ? [{ id: 'default', label: 'default' }] : []),
  ];

  return (
    <BaseNode data={data as FlowNodeData} sourceHandles={sourceHandles.length > 0 ? sourceHandles : undefined}>
      <span>{rules.length} rule{rules.length !== 1 ? 's' : ''}{defaultTarget ? ' + default' : ''}</span>
    </BaseNode>
  );
}

export const RoutingNode = memo(RoutingNodeInner);
