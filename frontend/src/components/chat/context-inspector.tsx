import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface ContextData {
  currentNodeId: string;
  data: Record<string, unknown>;
  internals: Record<string, unknown>;
}

function JsonValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-ink-muted italic">null</span>;
  }
  if (typeof value === 'object') {
    return (
      <span className="text-ink font-mono break-all text-[11px]">
        {JSON.stringify(value, null, 2)}
      </span>
    );
  }
  return <span className="text-ink break-all">{String(value)}</span>;
}

function DataSection({ title, data, defaultOpen = true }: { title: string; data: Record<string, unknown>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted w-full text-left hover:text-ink"
      >
        {open ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        {title}
      </button>
      {open && (
        <div className="space-y-1 pl-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="text-primary font-medium shrink-0">{key}:</span>
              <JsonValue value={value} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ContextInspectorProps {
  sessionId: string | null;
  refreshTrigger: number;
}

export function ContextInspector({ sessionId, refreshTrigger }: ContextInspectorProps) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<ContextData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getSessionContext(sessionId);
      setContext(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load context';
      // 404 = no snapshot yet, show nothing silently
      const status = (err as { status?: number }).status;
      if (status !== 404 && !msg.includes('No snapshot yet')) {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Auto-fetch when panel is open and trigger fires (after each stream end)
  useEffect(() => {
    if (open && sessionId) {
      fetchContext();
    }
  }, [open, sessionId, refreshTrigger, fetchContext]);

  const hasData = context && (
    Object.keys(context.data).length > 0 ||
    Object.values(context.internals).some((v) => v !== undefined)
  );

  return (
    <div className="border-t border-border-light bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink hover:bg-bg-card/50"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          Context
          {context?.currentNodeId && (
            <span className="ml-1 text-[10px] bg-bg-card text-ink-muted px-1.5 py-0.5 rounded-full font-normal">
              {context.currentNodeId}
            </span>
          )}
        </span>
        {open && (
          <button
            onClick={(e) => { e.stopPropagation(); fetchContext(); }}
            className="p-0.5 hover:text-primary"
            title="Refresh"
          >
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
          </button>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 max-h-48 overflow-y-auto">
          {isLoading && !context && (
            <p className="text-xs text-ink-muted">Loading…</p>
          )}
          {error && (
            <p className="text-xs text-error">{error}</p>
          )}
          {!isLoading && !error && !hasData && (
            <p className="text-xs text-ink-muted">No context data yet.</p>
          )}
          {context && hasData && (
            <>
              <DataSection title="Data" data={context.data} defaultOpen={true} />
              <DataSection title="Internals" data={context.internals} defaultOpen={false} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
