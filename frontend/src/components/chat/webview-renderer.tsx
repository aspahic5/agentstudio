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
      if (e.data?.type !== 'webview-submit') return;
      // Sandboxed iframes (no allow-same-origin) have opaque "null" origin.
      // Accept only if source matches our iframe OR origin is "null" (sandboxed).
      const fromOurIframe = e.source === iframeRef.current?.contentWindow;
      const fromSandboxed = e.origin === 'null';
      if (!fromOurIframe && !fromSandboxed) return;
      if (!disabledRef.current) {
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
