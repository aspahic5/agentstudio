import { useEffect } from 'react';
import { useParams } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { useFlowStore } from '@/stores/flow-store';
import { EditorCanvas } from '@/components/editor/editor-canvas';

export function EditorPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const loadAgent = useFlowStore((s) => s.loadAgent);
  const reset = useFlowStore((s) => s.reset);
  const isLoading = useFlowStore((s) => s.isLoading);
  const error = useFlowStore((s) => s.error);
  const agent = useFlowStore((s) => s.agent);
  const agentNodes = useFlowStore((s) => s.agentNodes);
  const activeVersion = useFlowStore((s) => s.activeVersion);

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
      {/* Node palette will go here (Task 7) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Editor toolbar will go here (Task 8) */}
        <div className="flex-1">
          <ReactFlowProvider>
            <EditorCanvas />
          </ReactFlowProvider>
        </div>
      </div>
      {/* Config panel will go here (Task 9) */}
      {/* Test chat will go here (Task 12) */}
    </div>
  );
}
