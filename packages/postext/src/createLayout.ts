import { type FC, useEffect, useRef } from 'react';
import type { PostextContent, PostextConfig } from './types';
import { buildDocument } from './pipeline';
import { renderToCanvas } from './canvas-backend';

export function createLayout(
  content: PostextContent,
  config?: PostextConfig,
): FC {
  const Layout: FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const doc = buildDocument(content, config);
      const pages = renderToCanvas(doc);

      // Clear previous content
      container.innerHTML = '';

      // Display all pages
      for (const canvas of pages) {
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        canvas.style.marginBottom = '16px';
        container.appendChild(canvas);
      }
    }, []);

    return null;
  };

  Layout.displayName = 'PostextLayout';
  return Layout;
}
