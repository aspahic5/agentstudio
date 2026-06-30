import { useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NODE_TYPE_META } from '@/lib/node-type-meta';
import type { EditorNodeType } from '@/types/editor';
import { cn } from '@/lib/utils';

const nodeTypes = Object.entries(NODE_TYPE_META) as [EditorNodeType, typeof NODE_TYPE_META[EditorNodeType]][];

export function NodePalette() {
  const [collapsed, setCollapsed] = useState(false);

  function handleDragStart(e: DragEvent, nodeType: EditorNodeType) {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  }

  if (collapsed) {
    return (
      <div className="w-10 border-r border-border-light bg-white flex flex-col items-center pt-2">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 border-r border-border-light bg-white flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-light">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Nodes</span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
        >
          <ChevronLeft size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {nodeTypes.map(([type, meta]) => {
          const Icon = meta.icon;
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              className={cn(
                'flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing',
                'hover:bg-bg-card transition-colors border border-transparent hover:border-border-light',
              )}
            >
              <Icon size={16} className={cn('mt-0.5 shrink-0', meta.textColor)} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{meta.label}</div>
                <div className="text-[11px] text-ink-muted leading-tight">{meta.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
