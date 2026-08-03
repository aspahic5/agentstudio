import { GitBranch, Sparkles, Route, ClipboardCheck, Wrench, Bot, Calculator, MessageCircle, Monitor, ListChecks } from 'lucide-react';
import type { EditorNodeType } from '@/types/editor';

export const NODE_TYPE_META: Record<EditorNodeType, {
  label: string;
  icon: typeof GitBranch;
  description: string;
  accentColor: string;
  textColor: string;
}> = {
  intent_parsing: { label: 'Intent Parsing', icon: GitBranch, description: 'Parse user intent from input', accentColor: 'border-l-info', textColor: 'text-info' },
  generation: { label: 'Generation', icon: Sparkles, description: 'Generate content via LLM', accentColor: 'border-l-success', textColor: 'text-success' },
  routing: { label: 'Routing', icon: Route, description: 'Route flow based on conditions', accentColor: 'border-l-warning', textColor: 'text-warning' },
  review: { label: 'Review', icon: ClipboardCheck, description: 'Review and refine content', accentColor: 'border-l-primary', textColor: 'text-primary' },
  tool: { label: 'Tool', icon: Wrench, description: 'Execute an external tool', accentColor: 'border-l-ink-muted', textColor: 'text-ink-muted' },
  agentic: { label: 'Agentic', icon: Bot, description: 'Multi-step autonomous agent', accentColor: 'border-l-[#7C3AED]', textColor: 'text-[#7C3AED]' },
  compute: { label: 'Compute', icon: Calculator, description: 'Run computation script', accentColor: 'border-l-ink-light', textColor: 'text-ink-light' },
  conversation: { label: 'Conversation', icon: MessageCircle, description: 'Multi-turn conversation', accentColor: 'border-l-[#0EA5E9]', textColor: 'text-[#0EA5E9]' },
  screen: { label: 'Screen', icon: Monitor, description: 'Show content to user', accentColor: 'border-l-[#10B981]', textColor: 'text-[#10B981]' },
  input: { label: 'Input', icon: ListChecks, description: 'Collect user selection', accentColor: 'border-l-[#F59E0B]', textColor: 'text-[#F59E0B]' },
} as const;

export function nodeTypeNeedsSaConfig(nodeType: EditorNodeType): boolean {
  return ['intent_parsing', 'generation', 'review', 'agentic', 'conversation'].includes(nodeType);
}

export function getDefaultConfigJson(nodeType: EditorNodeType): Record<string, unknown> {
  switch (nodeType) {
    case 'intent_parsing':
      return {
        validIntents: [],
        transitions: {},
        initialPromptTemplate: '',
        responseTemplates: {},
        optionsConfig: {
          type: 'single_select',
          items: [],
          customInput: { enabled: false, label: '', placeholder: '' },
          minSelections: 1,
          maxSelections: 1,
        },
      };
    case 'generation':
      return {
        generationPromptTemplate: '',
        outputContextKey: '',
        targetNodeId: '',
      };
    case 'routing':
      return {
        rules: [],
        defaultTarget: { type: 'complete' as const },
      };
    case 'review':
      return {
        contentContextKey: '',
        refinementStateName: '',
        modificationIntents: [],
        refinementInputTemplate: '',
        validIntents: [],
        transitions: {},
        initialPromptTemplate: '',
        responseTemplates: {},
        optionsConfig: {
          type: 'single_select',
          items: [],
          customInput: { enabled: false, label: '', placeholder: '' },
          minSelections: 1,
          maxSelections: 1,
        },
      };
    case 'tool':
      return {
        toolName: '',
        inputContextKeys: [],
        outputContextKey: '',
        targetNodeId: '',
      };
    case 'agentic':
      return {
        toolNames: [],
        maxSteps: 10,
        systemPromptTemplate: '',
        agenticPromptTemplate: '',
        outputContextKey: '',
        targetNodeId: '',
        outputSchema: {},
      };
    case 'compute':
      return {
        computeScript: '',
        inputContextKeys: [],
        outputContextKey: '',
        targetNodeId: '',
      };
    case 'conversation':
      return {
        goalDescription: '',
        completionStrategy: 'llm_decided' as const,
        targetNodeId: '',
        maxStepsPerTurn: 5,
        outputSchema: {},
      };
    case 'screen':
      return { content: '', targetNodeId: '' };
    case 'input':
      return { prompt: '', options: [], outputContextKey: '' };
  }
}
