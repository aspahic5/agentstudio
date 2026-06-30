import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData } from '@/types/editor';
import { BaseNode } from './base-node';

function AgenticNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const toolNames = (cfg.toolNames ?? []) as string[];

  return (
    <BaseNode data={data as FlowNodeData}>
      {toolNames.length > 0 && <span>{toolNames.length} tool{toolNames.length !== 1 ? 's' : ''}</span>}
    </BaseNode>
  );
}

export const AgenticNode = memo(AgenticNodeInner);
