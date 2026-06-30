import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AIEditOperation } from '@/types/ai-editor';

function getOperationIcon(op: AIEditOperation['op']) {
  if (op.startsWith('add_')) {
    return <Plus size={12} className="text-success shrink-0" />;
  }
  if (op.startsWith('update_')) {
    return <Pencil size={12} className="text-warning shrink-0" />;
  }
  return <Trash2 size={12} className="text-error shrink-0" />;
}

function getOperationLabel(operation: AIEditOperation): string {
  switch (operation.op) {
    case 'add_node':
      return `Add ${operation.node.nodeType} node "${operation.node.name}"`;
    case 'update_node':
      return `Update node ${operation.nodeId.slice(0, 8)}...`;
    case 'remove_node':
      return `Remove node ${operation.nodeId.slice(0, 8)}...`;
    case 'add_sa_config':
      return `Add SA config "${operation.saConfig.name}"`;
    case 'update_sa_config':
      return `Update SA config for node ${operation.nodeId.slice(0, 8)}...`;
    case 'update_agent':
      return `Update agent settings`;
    case 'add_transition':
      return `Add transition "${operation.intent}" on ${operation.nodeId.slice(0, 8)}...`;
    case 'update_transition':
      return `Update transition "${operation.intent}" on ${operation.nodeId.slice(0, 8)}...`;
    case 'remove_transition':
      return `Remove transition "${operation.intent}" from ${operation.nodeId.slice(0, 8)}...`;
    case 'add_routing_rule':
      return `Add routing rule on ${operation.nodeId.slice(0, 8)}...`;
    case 'update_routing_rule':
      return `Update routing rule #${operation.ruleIndex} on ${operation.nodeId.slice(0, 8)}...`;
  }
}

interface OperationListProps {
  operations: AIEditOperation[];
  validation: { valid: boolean; violations: string[] } | null;
}

export function OperationList({ operations, validation }: OperationListProps) {
  return (
    <div>
      <ScrollArea className="max-h-[200px]">
        <div className="flex flex-col gap-1">
          {operations.map((operation, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-soft text-xs"
            >
              {getOperationIcon(operation.op)}
              <span className="text-ink truncate">{getOperationLabel(operation)}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
      {validation && validation.violations.length > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded-md bg-warning/5 text-xs text-warning">
          <p className="font-medium mb-1">Validation warnings:</p>
          {validation.violations.map((v, index) => (
            <p key={index} className="text-[11px]">- {v}</p>
          ))}
        </div>
      )}
    </div>
  );
}
