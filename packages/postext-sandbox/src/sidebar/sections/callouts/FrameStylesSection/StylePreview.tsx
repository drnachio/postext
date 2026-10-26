'use client';

import { useEffect, useRef, useState } from 'react';
import type { CalloutStyleConfig, PostextConfig, Resource } from 'postext';
import { inheritedStyle, paintStylePreview, requestStylePreview, type PreviewSample } from '../../../../frameStyles/stylePreview.js';

interface StylePreviewProps {
  style: CalloutStyleConfig;
  config: PostextConfig;
  /** What, besides the style, changes the picture (the book's settings,
   *  its pictures, its fonts). */
  contextKey: string;
  resources: readonly Resource[];
  sample: PreviewSample;
  /** Width of the drawing in CSS px. */
  width: number;
  label: string;
}

/** The style painted by the engine (see `stylePreview.ts`), once the row
 *  scrolls into view. Decorative for screen readers past its label: the
 *  fields of the style say what it shows. */
export function StylePreview({ style, config, contextKey, resources, sample, width, label }: StylePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const configRef = useRef(config);
  configRef.current = config;
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The look of a style based on another (#905) is its parent's too: the key
  // follows the style as it is drawn, so a change in the parent paints again.
  const styleJson = JSON.stringify(inheritedStyle(config, style));
  useEffect(() => {
    if (!visible) return;
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const pixelWidth = Math.round(width * dpr);
    const key = `${contextKey}|${styleJson}|${JSON.stringify(sample)}|${pixelWidth}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = requestStylePreview(
      key,
      () => paintStylePreview(configRef.current, JSON.parse(styleJson) as CalloutStyleConfig, resourcesRef.current, sample, pixelWidth),
      (painted) => {
        const el = canvasRef.current;
        if (!el || !painted) return;
        el.width = painted.canvas.width;
        el.height = painted.canvas.height;
        el.getContext('2d')?.drawImage(painted.canvas, 0, 0);
        setSize({ w: Math.round(painted.canvas.width / dpr), h: Math.round(painted.canvas.height / dpr) });
        // A picture of the style (an icon, a tab) still decoding: once more.
        if (painted.missing && retry < 4) timer = setTimeout(() => setRetry((n) => n + 1), 800);
      },
    );
    return () => {
      cancel();
      if (timer) clearTimeout(timer);
    };
  }, [visible, contextKey, styleJson, sample, width, retry]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className="block max-w-full rounded"
      style={size ? { width: size.w, height: size.h } : { width, height: 32, background: 'var(--surface)' }}
    />
  );
}
