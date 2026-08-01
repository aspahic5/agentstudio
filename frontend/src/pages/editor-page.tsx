import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { useFlowStore } from '@/stores/flow-store';
import { useAIEditorStore } from '@/stores/ai-editor-store';
import { EditorCanvas } from '@/components/editor/editor-canvas';
import { NodePalette } from '@/components/editor/node-palette';
import { EditorTestChat } from '@/components/editor/editor-test-chat';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { NodeConfigPanel } from '@/components/editor/node-config-panel';
import { AIEditorPanel } from '@/components/editor/ai-editor/ai-editor-panel';
import { AgentSettingsPanel } from '@/components/editor/agent-settings-panel';

export function EditorPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const loadAgent = useFlowStore((s) => s.loadAgent);
  const reset = useFlowStore((s) => s.reset);
  const isLoading = useFlowStore((s) => s.isLoading);
  const error = useFlowStore((s) => s.error);
  const agent = useFlowStore((s) => s.agent);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const isDirty = useFlowStore((s) => s.isDirty);
  const agentNodes = useFlowStore((s) => s.agentNodes);
  const saConfigs = useFlowStore((s) => s.saConfigs);
  const testChatOpen = useFlowStore((s) => s.testChatOpen);
  const closeTestChat = useFlowStore((s) => s.closeTestChat);
  const aiEditorOpen = useAIEditorStore((s) => s.isOpen);
  const agentSettingsOpen = useFlowStore((s) => s.agentSettingsOpen);

  // Stable draft payload — only recomputed when isDirty changes (not on every render)
  const draftPayload = useMemo(
    () => isDirty ? { nodes: Array.from(agentNodes.values()), saConfigs: Array.from(saConfigs.values()) } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDirty],
  );

  useEffect(() => {
    if (agentId) {
      loadAgent(agentId);
    }
    return () => reset();
  }, [agentId, loadAgent, reset]);

  if (isLoading && !agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-ink-muted">Loading editor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-error">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <NodePalette />
      <div className="flex-1 flex flex-col min-w-0">
        <EditorToolbar />
        <div className="flex-1">
          <ReactFlowProvider>
            <EditorCanvas />
          </ReactFlowProvider>
        </div>
      </div>
      {selectedNodeId && <NodeConfigPanel />}
      {aiEditorOpen && <AIEditorPanel />}
      {agentSettingsOpen && <AgentSettingsPanel />}
      {testChatOpen && agentId && (
        <EditorTestChat
          agentId={agentId}
          onClose={closeTestChat}
          draftPayload={draftPayload}
        />
      )}
    </div>
  );
}
