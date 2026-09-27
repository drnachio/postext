import { createElement, useEffect, useRef, type CSSProperties, type FC } from 'react';
import type { PostextContent, PostextConfig } from '../types';
import { buildDocument } from '../pipeline';
import { renderToCanvas } from '../canvas-backend';
import { initMathEngine, isMathReady } from '../math';

export interface PostextLayoutProps {
  /** Class of the container `<div>` the page canvases go into. */
  className?: string;
  /** Inline style of that container. */
  style?: CSSProperties;
}

/**
 * A React component that lays `content` out once, when it mounts, and shows
 * every page as a `<canvas>` inside a `<div>`. Pages are painted on the main
 * thread, at the document's resolution, scaled to the container's width.
 * The math engine is started first when the markdown has a `$`. Load the
 * document's fonts before the component mounts: text measured with a
 * fallback font breaks differently.
 *
 * For a live editor, lay out in a worker instead (`postext/worker`).
 */
export function createLayout(content: PostextContent, config?: PostextConfig): FC<PostextLayoutProps> {
  const Layout: FC<PostextLayoutProps> = ({ className, style }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let cancelled = false;

      void (async () => {
        if (!isMathReady() && content.markdown.includes('$')) {
          // A failed start leaves placeholders (and the engine's warning).
          await initMathEngine().catch((err: unknown) => console.error(err));
        }
        if (cancelled) return;
        const doc = buildDocument(content, config);
        const pages = renderToCanvas(doc);
        for (const canvas of pages) {
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '16px';
        }
        container.replaceChildren(...pages);
      })();

      return () => {
        cancelled = true;
        container.replaceChildren();
      };
    }, []);

    return createElement('div', { ref: containerRef, className, style });
  };

  Layout.displayName = 'PostextLayout';
  return Layout;
}
