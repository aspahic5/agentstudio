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

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'webview-submit' && !disabledRef.current) {
        onSubmitRef.current?.(e.data.data as Record<string, unknown>);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Inject window.submit bridge before user JS runs
  const bridgeScript = `window.submit=function(d){window.parent.postMessage({type:'webview-submit',data:d},'*')};`;

  const srcdoc = `<!DOCTYPE html>
<html><head><style>${content.css ?? ''}</style></head>
<body>${content.html}<script>${bridgeScript}${content.js ?? ''}<\/script></body></html>`;

  return (
    <iframe
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      title={`WebView ${content.nodeId}`}
      className="w-full border border-border-light rounded-lg"
      style={{ minHeight: 200 }}
    />
  );
}
