import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData } from '@/types/editor';
import { BaseNode } from './base-node';

function GenerationNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const outputKey = cfg.outputContextKey as string | undefined;

  return (
    <BaseNode data={data as FlowNodeData}>
      {outputKey && <span className="truncate block">{outputKey}</span>}
    </BaseNode>
  );
}

export const GenerationNode = memo(GenerationNodeInner);
