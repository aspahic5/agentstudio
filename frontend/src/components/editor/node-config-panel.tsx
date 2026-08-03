import { X, Trash2, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useFlowStore } from '@/stores/flow-store';
import { NODE_TYPE_META, nodeTypeNeedsSaConfig } from '@/lib/node-type-meta';
import { SaConfigPanel } from './sa-config-panel';
import {
  ConversationConfig,
  GenerationConfig,
  IntentParsingConfig,
  RoutingConfig,
  ReviewConfig,
  ToolConfig,
  AgenticConfig,
  ComputeConfig,
  ScreenConfig,
  InputConfig,
} from './config-forms';
import type { EditorNodeType } from '@/types/editor';

function NodeTypeConfigForm({
  nodeId,
  nodeType,
  config,
  onChange,
}: {
  nodeId: string;
  nodeType: EditorNodeType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  switch (nodeType) {
    case 'conversation':
      return <ConversationConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'generation':
      return <GenerationConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'intent_parsing':
      return <IntentParsingConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'routing':
      return <RoutingConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'review':
      return <ReviewConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'tool':
      return <ToolConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'agentic':
      return <AgenticConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'compute':
      return <ComputeConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'screen':
      return <ScreenConfig nodeId={nodeId} config={config} onChange={onChange} />;
    case 'input':
      return <InputConfig nodeId={nodeId} config={config} onChange={onChange} />;
  }
}

export function NodeConfigPanel() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const agentNodes = useFlowStore((s) => s.agentNodes);
  const saConfigs = useFlowStore((s) => s.saConfigs);
  const updateNode = useFlowStore((s) => s.updateNode);
  const updateSaConfig = useFlowStore((s) => s.updateSaConfig);
  const removeNode = useFlowStore((s) => s.removeNode);
  const duplicateNode = useFlowStore((s) => s.duplicateNode);
  const selectNode = useFlowStore((s) => s.selectNode);

  if (!selectedNodeId) return null;

  const node = agentNodes.get(selectedNodeId);
  if (!node) return null;

  const meta = NODE_TYPE_META[node.nodeType];
  const needsSaConfig = nodeTypeNeedsSaConfig(node.nodeType);

  // Find SA configs for this node
  const nodeConfigs = Array.from(saConfigs.values()).filter((c) => c.nodeId === selectedNodeId);
  const primaryConfig = nodeConfigs.find((c) => c.id === node.semanticAgentConfigId);
  const secondaryConfigs = nodeConfigs.filter((c) => c.id !== node.semanticAgentConfigId);

  return (
    <div className="w-96 border-l border-border-light bg-white flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-border-light shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="secondary" className={`text-[10px] ${meta.textColor}`}>
            {meta.label}
          </Badge>
          <span className="text-sm font-medium text-ink truncate">{node.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => duplicateNode(selectedNodeId!)}
            className="p-1.5 rounded-md text-ink-muted hover:text-primary hover:bg-primary/5"
            title="Duplicate node"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={() => { removeNode(selectedNodeId!); }}
            className="p-1.5 rounded-md text-ink-muted hover:text-error hover:bg-error/5"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => selectNode(null)}
            className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <Tabs defaultValue="node" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 mx-3 mt-2">
          <TabsTrigger value="node">Node Config</TabsTrigger>
          {needsSaConfig && primaryConfig && <TabsTrigger value="sa">SA Config</TabsTrigger>}
          {node.nodeType === 'review' && secondaryConfigs.length > 0 && (
            <TabsTrigger value="sa2">Refinement SA</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="node" className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">
              {/* Shared fields */}
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={node.name}
                  onChange={(e) => updateNode(selectedNodeId!, { name: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Phase Label</Label>
                <Input
                  value={node.phaseLabel ?? ''}
                  onChange={(e) => updateNode(selectedNodeId!, { phaseLabel: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Progress Weight</Label>
                <Input
                  type="number"
                  value={node.progressWeight ?? 1}
                  onChange={(e) => updateNode(selectedNodeId!, { progressWeight: parseFloat(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>

              {/* Node-type specific config form */}
              <NodeTypeConfigForm
                nodeId={selectedNodeId!}
                nodeType={node.nodeType}
                config={(node.configJson ?? {}) as Record<string, unknown>}
                onChange={(configJson) => updateNode(selectedNodeId!, { configJson })}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        {needsSaConfig && primaryConfig && (
          <TabsContent value="sa" className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-3">
                <SaConfigPanel
                  config={primaryConfig}
                  onChange={(updates) => updateSaConfig(primaryConfig.id, updates)}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        )}

        {node.nodeType === 'review' && secondaryConfigs.length > 0 && (
          <TabsContent value="sa2" className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-3">
                <SaConfigPanel
                  config={secondaryConfigs[0]}
                  onChange={(updates) => updateSaConfig(secondaryConfigs[0].id, updates)}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
