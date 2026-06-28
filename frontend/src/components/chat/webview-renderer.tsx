import type { WebViewContent } from '@/types/stream';

interface WebViewRendererProps {
  content: WebViewContent;
}

export function WebViewRenderer({ content }: WebViewRendererProps) {
  const srcdoc = `<!DOCTYPE html>
<html><head><style>${content.css ?? ''}</style></head>
<body>${content.html}${content.js ? `<script>${content.js}<\/script>` : ''}</body></html>`;

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
