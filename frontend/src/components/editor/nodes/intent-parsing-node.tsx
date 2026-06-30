import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData, TransitionRule } from '@/types/editor';
import { BaseNode } from './base-node';

function IntentParsingNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const transitions = cfg.transitions as Record<string, TransitionRule> | undefined;
  const intentCount = transitions ? Object.keys(transitions).length : 0;

  const sourceHandles = transitions
    ? Object.keys(transitions)
        .filter(k => {
          const t = transitions[k];
          return t.target !== 'self' && t.target !== 'complete';
        })
        .map(k => ({ id: `transition-${k}`, label: k }))
    : [];

  return (
    <BaseNode data={data as FlowNodeData} sourceHandles={sourceHandles.length > 0 ? sourceHandles : undefined}>
      {intentCount > 0 && <span>{intentCount} intent{intentCount !== 1 ? 's' : ''}</span>}
    </BaseNode>
  );
}

export const IntentParsingNode = memo(IntentParsingNodeInner);
