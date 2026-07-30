import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { NodeSelector } from './node-selector';
import type { TransitionRule, OptionsConfig, OptionItem } from '@/types/editor';

interface IntentParsingConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function IntentParsingConfig({ nodeId, config, onChange }: IntentParsingConfigProps) {
  const initialPromptTemplate = (config.initialPromptTemplate as string) ?? '';
  const validIntents = (config.validIntents as string[]) ?? [];
  const transitions = (config.transitions ?? {}) as Record<string, TransitionRule>;
  const optionsConfig = (config.optionsConfig ?? {
    type: 'single_select',
    items: [],
    customInput: { enabled: false, label: '', placeholder: '' },
    minSelections: 1,
    maxSelections: 1,
  }) as OptionsConfig;
  const responseTemplates = (config.responseTemplates ?? {}) as Record<string, string>;
  const dynamicOptionsContextKey = (config.dynamicOptionsContextKey as string) ?? '';

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  // --- Intent Management ---
  function addIntent() {
    const name = `intent_${validIntents.length + 1}`;
    onChange({
      ...config,
      validIntents: [...validIntents, name],
      transitions: { ...transitions, [name]: { target: '', actions: [] } },
    });
  }

  function removeIntent(intent: string) {
    const { [intent]: _, ...rest } = transitions;
    const { [intent]: __, ...restTemplates } = responseTemplates;
    onChange({
      ...config,
      validIntents: validIntents.filter((i) => i !== intent),
      transitions: rest,
      responseTemplates: restTemplates,
    });
  }

  function renameIntent(oldName: string, newName: string) {
    if (!newName || newName === oldName) return;
    const newIntents = validIntents.map((i) => (i === oldName ? newName : i));
    const newTransitions = { ...transitions };
    newTransitions[newName] = newTransitions[oldName];
    delete newTransitions[oldName];
    const newTemplates = { ...responseTemplates };
    if (newTemplates[oldName]) {
      newTemplates[newName] = newTemplates[oldName];
      delete newTemplates[oldName];
    }
    onChange({ ...config, validIntents: newIntents, transitions: newTransitions, responseTemplates: newTemplates });
  }

  function updateTransitionTarget(intent: string, target: string) {
    update('transitions', { ...transitions, [intent]: { ...transitions[intent], target, actions: transitions[intent]?.actions ?? [] } });
  }

  function updateResponseTemplate(intent: string, template: string) {
    update('responseTemplates', { ...responseTemplates, [intent]: template });
  }

  // --- Option Item Management ---
  function addOptionItem() {
    const items = [...optionsConfig.items, { id: crypto.randomUUID(), label: '', value: '', intent: '' }];
    update('optionsConfig', { ...optionsConfig, items });
  }

  function removeOptionItem(index: number) {
    const items = optionsConfig.items.filter((_, i) => i !== index);
    update('optionsConfig', { ...optionsConfig, items });
  }

  function updateOptionItem(index: number, updates: Partial<OptionItem>) {
    const items = [...optionsConfig.items];
    items[index] = { ...items[index], ...updates };
    update('optionsConfig', { ...optionsConfig, items });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Initial Prompt Template</Label>
        <Textarea
          value={initialPromptTemplate}
          onChange={(e) => update('initialPromptTemplate', e.target.value)}
          placeholder="Handlebars template shown to the user. Use {{contextKey}} for dynamic content."
          className="text-sm font-mono min-h-[80px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Selection Type</Label>
        <Select
          value={optionsConfig.type}
          onValueChange={(v) => v && update('optionsConfig', { ...optionsConfig, type: v })}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="single_select">Single Select</SelectItem>
            <SelectItem value="multi_select">Multi Select</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Allow Custom Input</Label>
        <Switch
          checked={optionsConfig.customInput.enabled}
          onCheckedChange={(v) => update('optionsConfig', { ...optionsConfig, customInput: { ...optionsConfig.customInput, enabled: v } })}
        />
      </div>

      {optionsConfig.customInput.enabled && (
        <div className="space-y-2 pl-3 border-l-2 border-border-light">
          <div className="space-y-1.5">
            <Label className="text-xs">Custom Input Label</Label>
            <Input
              value={optionsConfig.customInput.label}
              onChange={(e) => update('optionsConfig', { ...optionsConfig, customInput: { ...optionsConfig.customInput, label: e.target.value } })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Custom Input Placeholder</Label>
            <Input
              value={optionsConfig.customInput.placeholder}
              onChange={(e) => update('optionsConfig', { ...optionsConfig, customInput: { ...optionsConfig.customInput, placeholder: e.target.value } })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Dynamic Options Context Key (optional)</Label>
        <Input
          value={dynamicOptionsContextKey}
          onChange={(e) => update('dynamicOptionsContextKey', e.target.value)}
          placeholder="Context key containing array of dynamic options"
          className="h-8 text-sm"
        />
      </div>

      {/* Option Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Option Items</Label>
          <Button size="sm" variant="ghost" onClick={addOptionItem} className="h-6 px-2 text-xs">
            <Plus size={12} className="mr-1" /> Add Option
          </Button>
        </div>
        {optionsConfig.items.map((item, i) => (
          <div key={item.id} className="space-y-1.5 p-2 rounded-lg bg-bg-card border border-border-light">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-ink-muted">Option {i + 1}</span>
              <button onClick={() => removeOptionItem(i)} className="p-0.5 text-ink-muted hover:text-error"><Trash2 size={12} /></button>
            </div>
            <Input value={item.label} onChange={(e) => updateOptionItem(i, { label: e.target.value })} placeholder="Label" className="h-7 text-xs" />
            <Input value={item.value} onChange={(e) => updateOptionItem(i, { value: e.target.value })} placeholder="Value" className="h-7 text-xs" />
            <Input value={item.intent ?? ''} onChange={(e) => updateOptionItem(i, { intent: e.target.value })} placeholder="Intent (maps to transition)" className="h-7 text-xs" />
          </div>
        ))}
      </div>

      {/* Intents & Transitions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Intents & Transitions</Label>
          <Button size="sm" variant="ghost" onClick={addIntent} className="h-6 px-2 text-xs">
            <Plus size={12} className="mr-1" /> Add Intent
          </Button>
        </div>
        {validIntents.map((intent) => (
          <div key={intent} className="space-y-1.5 p-2 rounded-lg bg-bg-card border border-border-light">
            <div className="flex items-center justify-between">
              <Input
                value={intent}
                onChange={(e) => renameIntent(intent, e.target.value)}
                className="h-7 text-xs font-mono flex-1 mr-2"
              />
              <button onClick={() => removeIntent(intent)} className="p-0.5 text-ink-muted hover:text-error"><Trash2 size={12} /></button>
            </div>
            <NodeSelector
              label="Target Node"
              value={transitions[intent]?.target ?? ''}
              onChange={(v) => updateTransitionTarget(intent, v)}
              excludeNodeId={nodeId}
            />
            <div className="space-y-1.5">
              <Label className="text-xs">Response Template (optional)</Label>
              <Textarea
                value={responseTemplates[intent] ?? ''}
                onChange={(e) => updateResponseTemplate(intent, e.target.value)}
                placeholder="Handlebars template for response after this intent"
                className="text-xs min-h-[40px]"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
