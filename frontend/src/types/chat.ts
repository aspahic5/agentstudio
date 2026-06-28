import type { OptionsConfig, WebViewContent } from './stream';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  options?: OptionsConfig;
}

export interface ThinkingState {
  content: string;
  thoughts: Array<{ title: string; description?: string }>;
  isActive: boolean;
}

export type ChatEntry =
  | { type: 'message'; message: ChatMessage }
  | { type: 'phase'; id: string; phase: string; name: string; timestamp: number }
  | { type: 'node-title'; id: string; nodeId: string; title: string; phase: string; description?: string; timestamp: number }
  | { type: 'context-update'; id: string; cardType: string; data: Record<string, unknown>; timestamp: number }
  | { type: 'webview'; id: string; content: WebViewContent; timestamp: number }
  | { type: 'completed'; id: string; timestamp: number };
