import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData } from '@/types/editor';
import { BaseNode } from './base-node';

function ConversationNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const strategy = cfg.completionStrategy as string | undefined;

  return (
    <BaseNode data={data as FlowNodeData}>
      {strategy && <span>{strategy.replace(/_/g, ' ')}</span>}
    </BaseNode>
  );
}

export const ConversationNode = memo(ConversationNodeInner);
