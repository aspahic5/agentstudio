import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { FlowNode, FlowNodeData } from '@/types/editor';
import { BaseNode } from './base-node';

function ScreenNodeInner({ data }: NodeProps<FlowNode>) {
  const cfg = (data.agentNode.configJson ?? {}) as Record<string, unknown>;
  const content = cfg.content as string | undefined;
  // Strip markdown headings/symbols for a clean preview
  const preview = content
    ?.split('\n')
    .find((l) => l.trim() && !l.startsWith('#'))
    ?.replace(/[*_`]/g, '')
    .slice(0, 50)
    .trim();

  return (
    <BaseNode data={data as FlowNodeData}>
      {preview && <span className="truncate block">{preview}…</span>}
    </BaseNode>
  );
}

export const ScreenNode = memo(ScreenNodeInner);
