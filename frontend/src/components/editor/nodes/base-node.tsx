import { memo, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { FlowNodeData } from '@/types/editor';
import { NODE_TYPE_META } from '@/lib/node-type-meta';
import { cn } from '@/lib/utils';

interface BaseNodeProps {
  data: FlowNodeData;
  children?: ReactNode;
  sourceHandles?: { id: string; label?: string }[];
}

function BaseNodeInner({ data, children, sourceHandles }: BaseNodeProps) {
  const { agentNode, isSelected, isHighlighted } = data;
  const meta = NODE_TYPE_META[agentNode.nodeType];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'min-w-[200px] max-w-[280px] rounded-xl bg-white shadow-soft border border-border-light',
        'border-l-4',
        meta.accentColor,
        isSelected && 'ring-2 ring-primary/50',
        isHighlighted === 'added' && 'ring-2 ring-success/50',
        isHighlighted === 'modified' && 'ring-2 ring-warning/50',
        isHighlighted === 'removed' && 'ring-2 ring-error/50 opacity-60',
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-ink-muted !w-3 !h-3 !border-2 !border-white" />

      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} className={meta.textColor} />
          <span className={cn('text-[10px] font-semibold uppercase tracking-wider', meta.textColor)}>
            {meta.label}
          </span>
        </div>
        <div className="text-sm font-medium text-ink truncate">{agentNode.name}</div>
        {children && <div className="mt-1.5 text-xs text-ink-muted">{children}</div>}
      </div>

      {sourceHandles && sourceHandles.length > 0 ? (
        <div className="relative h-4">
          {sourceHandles.map((h, i) => (
            <Handle
              key={h.id}
              type="source"
              position={Position.Bottom}
              id={h.id}
              className="!bg-ink-muted !w-2.5 !h-2.5 !border-2 !border-white"
              style={{ left: `${((i + 1) / (sourceHandles.length + 1)) * 100}%` }}
            />
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!bg-ink-muted !w-3 !h-3 !border-2 !border-white" />
      )}
    </div>
  );
}

export const BaseNode = memo(BaseNodeInner);
