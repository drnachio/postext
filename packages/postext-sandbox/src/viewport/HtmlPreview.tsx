'use client';

import { useEffect, useDeferredValue, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { createLayout } from 'postext';
import { useSandbox } from '../context/SandboxContext';
import { useShadowDom } from '../hooks/useShadowDom';

const EDITORIAL_CSS = `
  :host {
    display: block;
    height: 100%;
    overflow: auto;
    padding: 2rem;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    background: #fafaf9;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: Georgia, serif;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.2;
  }
  h1 { font-size: 2em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
  h3 { font-size: 1.25em; }
  p { margin-bottom: 1em; text-align: justify; hyphens: auto; }
  blockquote {
    border-left: 3px solid #ccc;
    padding-left: 1em;
    margin-left: 0;
    color: #666;
    font-style: italic;
  }
  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85em;
    background: #f0f0f0;
    padding: 0.15em 0.3em;
    border-radius: 3px;
  }
  pre {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 1em;
    overflow-x: auto;
    font-size: 0.85em;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; }
  ul, ol { padding-left: 1.5em; margin-bottom: 1em; }
  li { margin-bottom: 0.25em; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  a { color: #2B4ACB; text-decoration: underline; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
`;

export function HtmlPreview() {
  const { state } = useSandbox();
  const { hostRef, shadowRef } = useShadowDom();
  const deferredMarkdown = useDeferredValue(state.markdown);
  const deferredConfig = useDeferredValue(state.config);
  const rootRef = useRef<Root | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize shadow DOM structure once
  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow) return;

    shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = EDITORIAL_CSS;
    shadow.appendChild(style);

    const container = document.createElement('div');
    shadow.appendChild(container);
    containerRef.current = container;

    return () => {
      // Defer unmount to avoid synchronous unmount during render
      const root = rootRef.current;
      if (root) {
        setTimeout(() => root.unmount(), 0);
        rootRef.current = null;
      }
      containerRef.current = null;
    };
  }, [shadowRef]);

  // Update content when markdown or config changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const Layout = createLayout(
        { markdown: deferredMarkdown },
        { ...deferredConfig, renderer: 'web' },
      );

      if (!rootRef.current) {
        rootRef.current = createRoot(container);
      }
      rootRef.current.render(createElement(Layout));
    } catch {
      // If createLayout fails (it's a stub), show raw markdown as fallback
      if (rootRef.current) {
        setTimeout(() => rootRef.current?.unmount(), 0);
        rootRef.current = null;
      }
      container.innerHTML = renderMarkdownFallback(deferredMarkdown);
    }
  }, [deferredMarkdown, deferredConfig]);

  return (
    <div ref={hostRef} className="h-full w-full" />
  );
}

/**
 * Simple markdown-to-HTML fallback for when createLayout returns null.
 * This is a minimal implementation — not a full markdown parser.
 */
function renderMarkdownFallback(md: string): string {
  let html = md
    // Code blocks (must be before other transforms)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Paragraphs (lines not already wrapped in HTML tags)
    .replace(/^(?!<[a-z])((?!^\s*$).+)$/gm, '<p>$1</p>');

  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

  return html;
}
