import { X } from 'lucide-react';
import { TestChat } from '@/components/chat/test-chat';

interface EditorTestChatProps {
  agentId: string;
  onClose: () => void;
}

export function EditorTestChat({ agentId, onClose }: EditorTestChatProps) {
  return (
    <div className="w-96 border-l border-border-light bg-white flex flex-col shrink-0">
      <div className="h-12 flex items-center justify-between px-3 border-b border-border-light shrink-0">
        <span className="text-sm font-semibold text-ink">Test Chat</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TestChat agentId={agentId} />
      </div>
    </div>
  );
}
