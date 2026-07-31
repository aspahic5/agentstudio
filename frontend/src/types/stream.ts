export interface WireOptionItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  _changeStatus?: string;
  intent?: string;
  disabled?: string;
}

export interface OptionsConfig {
  type: 'single_select' | 'multi_select';
  items: WireOptionItem[];
  minSelections: number;
  maxSelections: number;
  allowCustomInput: boolean;
  customInputLabel?: string;
  customInputPlaceholder?: string;
  customInputFirst?: boolean;
  defaultSelectAll?: boolean;
}

export interface WebViewContent {
  nodeId: string;
  html: string;
  css?: string;
  js?: string;
  submittedData?: Record<string, unknown> | null;
}

export type ParsedStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string }
  | { type: 'thinking-done' }
  | { type: 'thought-start'; title: string }
  | { type: 'thought-done'; description: string }
  | { type: 'node-title'; nodeId: string; title: string; phase: string; description?: string }
  | { type: 'phase-start'; phase: string; name: string; totalSteps?: number }
  | { type: 'options'; nodeId: string; options: OptionsConfig }
  | { type: 'context-update'; cardType: string; data: Record<string, unknown> }
  | { type: 'turn-complete'; isComplete: boolean; currentNodeId: string; contextData?: Record<string, unknown> }
  | { type: 'webview'; content: WebViewContent }
  | { type: 'semantic-agent-result'; result: unknown; stateName: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
