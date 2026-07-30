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
      // Only accept messages originating from our own iframe's contentWindow.
      // When sandbox does not include allow-same-origin the iframe origin is
      // "null"; we verify against the iframe element reference instead of the
      // opaque "null" string so that unrelated null-origin sources are rejected.
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'webview-submit' && !disabledRef.current) {
        onSubmitRef.current?.(e.data.data as Record<string, unknown>);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // The bridge posts to the parent with the explicit parent origin so that
  // only this application can receive the message. Using window.location.origin
  // from inside a sandboxed-without-same-origin iframe would be "null", so the
  // bridge captures the parent origin at srcdoc injection time via a data
  // attribute read, which is unavailable. Instead we pass the origin as a
  // JS constant embedded at render time — this is safe because the value is
  // the server-controlled page origin, not user input.
  const parentOrigin = window.location.origin;
  const bridgeScript = `window.submit=function(d){window.parent.postMessage({type:'webview-submit',data:d},${JSON.stringify(parentOrigin)})};`;

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
