import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData } from '@/types/editor';
import { BaseNode } from './base-node';

function ToolNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const toolName = cfg.toolName as string | undefined;

  return (
    <BaseNode data={data as FlowNodeData}>
      {toolName && <span className="truncate block">{toolName}</span>}
    </BaseNode>
  );
}

export const ToolNode = memo(ToolNodeInner);
