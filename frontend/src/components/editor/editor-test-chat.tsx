import { X } from 'lucide-react';
import { TestChat } from '@/components/chat/test-chat';

interface EditorTestChatProps {
  agentId: string;
  onClose: () => void;
  draftPayload?: { nodes: unknown[]; saConfigs: unknown[] } | null;
}

export function EditorTestChat({ agentId, onClose, draftPayload }: EditorTestChatProps) {
  return (
    <div className="w-96 border-l border-border-light bg-white flex flex-col shrink-0">
      <div className="h-12 flex items-center justify-between px-3 border-b border-border-light shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">Test Chat</span>
          {draftPayload && (
            <span className="text-[10px] font-medium bg-warning/15 text-warning px-1.5 py-0.5 rounded-full">
              Draft
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TestChat agentId={agentId} draftPayload={draftPayload} />
      </div>
    </div>
  );
}
