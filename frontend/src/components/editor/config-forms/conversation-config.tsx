import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { NodeSelector } from './node-selector';
import { WebviewAIAssistant } from './webview-ai-assistant';

interface ConversationConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ConversationConfig({ nodeId, config, onChange }: ConversationConfigProps) {
  const goalDescription = (config.goalDescription as string) ?? '';
  const completionStrategy = (config.completionStrategy as string) ?? 'llm_decided';
  const targetNodeId = (config.targetNodeId as string) ?? '';
  const maxStepsPerTurn = (config.maxStepsPerTurn as number) ?? 5;
  const outputContextKey = (config.outputContextKey as string) ?? '';
  const availableTools = (config.availableTools as string[]) ?? [];
  const reEntryContextKey = (config.reEntryContextKey as string) ?? '';
  const outputSchema = config.outputSchema as Record<string, unknown> | undefined;
  const webviewConfig = config.webviewConfig as { html?: string; css?: string; js?: string } | undefined;
  const webviewEnabled = !!webviewConfig;

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function toggleWebview() {
    if (webviewEnabled) {
      const { webviewConfig: _wv, ...rest } = config;
      onChange(rest);
    } else {
      onChange({ ...config, webviewConfig: { html: '', css: '', js: '' } });
    }
  }

  function updateWebview(key: string, value: string) {
    onChange({ ...config, webviewConfig: { ...(webviewConfig ?? {}), [key]: value } });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Goal Description</Label>
        <Textarea
          value={goalDescription}
          onChange={(e) => update('goalDescription', e.target.value)}
          placeholder="Describe the conversation goal, e.g. 'Understand the client's dietary preferences and restrictions'"
          className="text-sm min-h-[80px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Completion Strategy</Label>
        <Select value={completionStrategy} onValueChange={(v) => v && update('completionStrategy', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="llm_decided">LLM Decided</SelectItem>
            <SelectItem value="user_explicit">User Explicit</SelectItem>
            <SelectItem value="either">Either</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <NodeSelector
        label="Next Node (after completion)"
        value={targetNodeId}
        onChange={(v) => update('targetNodeId', v)}
        excludeNodeId={nodeId}
      />

      <div className="space-y-1.5">
        <Label className="text-xs">Max Steps Per Turn</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={maxStepsPerTurn}
          onChange={(e) => update('maxStepsPerTurn', parseInt(e.target.value) || 5)}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Context Key</Label>
        <Input
          value={outputContextKey}
          onChange={(e) => update('outputContextKey', e.target.value)}
          placeholder="e.g. dietary_profile"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Schema (JSON)</Label>
        <Textarea
          value={outputSchema ? JSON.stringify(outputSchema, null, 2) : '{}'}
          onChange={(e) => {
            try { update('outputSchema', JSON.parse(e.target.value)); } catch { /* allow typing */ }
          }}
          className="text-sm font-mono min-h-[100px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Available Tools (comma-separated)</Label>
        <Input
          value={availableTools.join(', ')}
          onChange={(e) => update('availableTools', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="e.g. recipe_search, nutrition_api"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Re-entry Context Key</Label>
        <Input
          value={reEntryContextKey}
          onChange={(e) => update('reEntryContextKey', e.target.value)}
          placeholder="Optional"
          className="h-8 text-sm"
        />
      </div>

      {/* WebView Form section */}
      <div className="border-t border-border-light pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-medium">WebView Form</Label>
            <p className="text-[10px] text-ink-muted mt-0.5">Custom HTML form shown in chat</p>
          </div>
          <Switch checked={webviewEnabled} onCheckedChange={toggleWebview} />
        </div>

        {webviewEnabled && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">HTML</Label>
              <Textarea
                value={webviewConfig?.html ?? ''}
                onChange={(e) => updateWebview('html', e.target.value)}
                placeholder={'<form id="myForm">\n  <input name="value" />\n  <button type="submit">Submit</button>\n</form>'}
                className="text-sm font-mono min-h-[120px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">CSS <span className="text-ink-muted font-normal">(optional)</span></Label>
              <Textarea
                value={webviewConfig?.css ?? ''}
                onChange={(e) => updateWebview('css', e.target.value)}
                placeholder="form { font-family: sans-serif; padding: 12px; }"
                className="text-sm font-mono min-h-[60px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">JS <span className="text-ink-muted font-normal">(optional)</span></Label>
              <Textarea
                value={webviewConfig?.js ?? ''}
                onChange={(e) => updateWebview('js', e.target.value)}
                placeholder={'document.getElementById(\'myForm\').addEventListener(\'submit\', function(e) {\n  e.preventDefault();\n  var data = Object.fromEntries(new FormData(e.target));\n  window.submit(data);\n});'}
                className="text-sm font-mono min-h-[80px]"
              />
            </div>

            {(webviewConfig?.html) && (
              <div className="space-y-1.5">
                <Label className="text-xs">Preview</Label>
                <iframe
                  key={`${webviewConfig.html}${webviewConfig.css ?? ''}${webviewConfig.js ?? ''}`}
                  srcDoc={`<!DOCTYPE html><html><head><style>${webviewConfig.css ?? ''}</style></head><body>${webviewConfig.html}<script>window.submit=function(d){};${webviewConfig.js ?? ''}<\/script></body></html>`}
                  sandbox="allow-scripts allow-forms"
                  title="WebView Preview"
                  className="w-full border border-border-light rounded-lg bg-white"
                  style={{ minHeight: 200 }}
                />
              </div>
            )}

            <WebviewAIAssistant
              currentHtml={webviewConfig?.html}
              currentCss={webviewConfig?.css}
              currentJs={webviewConfig?.js}
              onApply={(html, css, js) => {
                onChange({ ...config, webviewConfig: { html, css, js } });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
