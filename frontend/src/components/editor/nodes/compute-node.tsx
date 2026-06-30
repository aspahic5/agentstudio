import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData } from '@/types/editor';
import { BaseNode } from './base-node';

function ComputeNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const script = cfg.computeScript as string | undefined;

  return (
    <BaseNode data={data as FlowNodeData}>
      {script && <span className="truncate block font-mono text-[10px]">{script.slice(0, 30)}{script.length > 30 ? '...' : ''}</span>}
    </BaseNode>
  );
}

export const ComputeNode = memo(ComputeNodeInner);
