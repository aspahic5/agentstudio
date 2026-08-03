import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData } from '@/types/editor';
import { BaseNode } from './base-node';

function InputNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const options = cfg.options as Array<{ label: string }> | undefined;
  const prompt = cfg.prompt as string | undefined;

  return (
    <BaseNode data={data as FlowNodeData} sourceHandles={options?.map((o) => ({ id: `option-${o.id ?? o.label}`, label: o.label }))}>
      {prompt && <span className="truncate block">{prompt}</span>}
      {options && options.length > 0 && (
        <span className="block mt-0.5 text-ink-muted">{options.length} opcija</span>
      )}
    </BaseNode>
  );
}

export const InputNode = memo(InputNodeInner);
