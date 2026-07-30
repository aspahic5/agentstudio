import { useEffect, useRef } from 'react';
import type { WebViewContent } from '@/types/stream';

interface WebViewRendererProps {
  content: WebViewContent;
  onSubmit?: (data: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function WebViewRenderer({ content, onSubmit, disabled }: WebViewRendererProps) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // The iframe runs with sandbox="allow-scripts" but NOT allow-same-origin,
      // so its origin is the opaque string "null". We validate by comparing
      // e.source to the iframe's contentWindow at handler-call time (not at
      // effect-setup time, since contentWindow may not be set yet at mount).
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'webview-submit' && !disabledRef.current) {
        onSubmitRef.current?.(e.data.data as Record<string, unknown>);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // The iframe's origin is "null" (sandboxed without allow-same-origin), so
  // targetOrigin '*' is required — the iframe cannot post to a specific origin.
  // The e.source check above ensures we only act on messages from our own iframe.
  const bridgeScript = `window.submit=function(d){window.parent.postMessage({type:'webview-submit',data:d},'*')};`;

  const srcdoc = `<!DOCTYPE html>
<html><head><style>${content.css ?? ''}</style></head>
<body>${content.html}<script>${bridgeScript}${content.js ?? ''}<\/script></body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      title={`WebView ${content.nodeId}`}
      className="w-full border border-border-light rounded-lg"
      style={{ minHeight: 200 }}
    />
  );
}
