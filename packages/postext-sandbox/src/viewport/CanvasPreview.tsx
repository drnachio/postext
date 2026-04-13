'use client';

import { useEffect, useRef, useState, useDeferredValue } from 'react';
import { useSandbox } from '../context/SandboxContext';
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'postext';
import type { VDTDocument } from 'postext';

type ViewMode = 'single' | 'spread';
type FitMode = 'none' | 'width' | 'height';

interface CanvasPreviewProps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
}

/**
 * Groups pages into rows for display.
 * Single mode: one page per row.
 * Spread mode: page 0 alone (on the right, like a book recto),
 * then pairs [1,2], [3,4], ... Last unpaired page goes on the left.
 */
function groupPagesIntoRows(pageCount: number, viewMode: ViewMode): number[][] {
  if (viewMode === 'single') {
    return Array.from({ length: pageCount }, (_, i) => [i]);
  }
  const rows: number[][] = [];
  if (pageCount > 0) rows.push([0]);
  for (let i = 1; i < pageCount; i += 2) {
    if (i + 1 < pageCount) {
      rows.push([i, i + 1]);
    } else {
      rows.push([i]);
    }
  }
  return rows;
}

/**
 * Canvas preview that renders the document using the postext layout engine.
 * Builds a VDT at the configured DPI (default 300), then lazily renders
 * only the pages visible in the scroll viewport via IntersectionObserver.
 */
export function CanvasPreview({ zoom, viewMode, fitMode }: CanvasPreviewProps) {
  const { state } = useSandbox();
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<VDTDocument | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const deferredMarkdown = useDeferredValue(state.markdown);
  const deferredConfig = useDeferredValue(state.config);
  const [resizeKey, setResizeKey] = useState(0);

  // Resize observer — triggers repaint when container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setResizeKey((k) => k + 1);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build document and set up lazy rendering via IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return;

    let cancelled = false;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      clearMeasurementCache();

      try {
        const doc = buildDocument(
          { markdown: deferredMarkdown },
          deferredConfig,
        );
        docRef.current = doc;

        // Tear down previous state
        observerRef.current?.disconnect();
        canvasMapRef.current.clear();
        while (container.firstChild) container.removeChild(container.firstChild);

        if (doc.pages.length === 0) return;

        // Compute uniform CSS display dimensions (all pages share the same size)
        const padding = 32;
        const gap = 24;
        const firstPage = doc.pages[0]!;
        const aspectRatio = firstPage.height / firstPage.width;

        let displayWidth: number;
        const isSpread = viewMode === 'spread';

        if (fitMode === 'width') {
          if (isSpread) {
            displayWidth = (rect.width - padding * 2 - gap) / 2;
          } else {
            displayWidth = rect.width - padding * 2;
          }
        } else if (fitMode === 'height') {
          const containerHeight = rect.height - padding * 2;
          displayWidth = containerHeight / aspectRatio;
          if (isSpread) {
            const maxPerPage = (rect.width - padding * 2 - gap) / 2;
            displayWidth = Math.min(displayWidth, maxPerPage);
          }
        } else {
          const base = Math.min(rect.width - padding * 2, 800);
          displayWidth = base * zoom;
        }

        displayWidth = Math.max(displayWidth, 50);
        const displayHeight = displayWidth * aspectRatio;

        // Inner wrapper centers content via auto margins, enabling full
        // horizontal scroll in both directions when zoomed in
        const pagesPerRow = isSpread ? 2 : 1;
        const innerWidth = displayWidth * pagesPerRow + gap * (pagesPerRow - 1) + padding * 2;
        const innerDiv = document.createElement('div');
        innerDiv.style.width = `${innerWidth}px`;
        innerDiv.style.margin = '0 auto';

        const canvasMap = canvasMapRef.current;
        const rows = groupPagesIntoRows(doc.pages.length, viewMode);
        const allSlots: HTMLDivElement[] = [];

        for (const row of rows) {
          const rowDiv = document.createElement('div');
          rowDiv.style.display = 'flex';
          rowDiv.style.justifyContent = 'center';
          rowDiv.style.alignItems = 'flex-start';
          rowDiv.style.padding = `${padding}px`;
          rowDiv.style.gap = `${gap}px`;
          rowDiv.style.boxSizing = 'border-box';
          rowDiv.style.minHeight = `${displayHeight + padding * 2}px`;

          if (isSpread && row.length === 1) {
            const pageIndex = row[0]!;
            const isFirstPage = pageIndex === 0;

            // First page (cover) goes on the RIGHT (recto in book terms)
            // Trailing unpaired page goes on the LEFT (verso)
            if (isFirstPage) {
              // Spacer on the left
              const spacer = document.createElement('div');
              spacer.style.width = `${displayWidth}px`;
              spacer.style.flexShrink = '0';
              rowDiv.appendChild(spacer);
            }

            const slot = document.createElement('div');
            slot.style.flexShrink = '0';
            slot.dataset.pageIndex = String(pageIndex);

            const canvas = createPageCanvas(displayWidth, displayHeight);
            slot.appendChild(canvas);
            canvasMap.set(pageIndex, canvas);
            allSlots.push(slot);
            rowDiv.appendChild(slot);

            if (!isFirstPage) {
              // Spacer on the right for trailing unpaired page
              const spacer = document.createElement('div');
              spacer.style.width = `${displayWidth}px`;
              spacer.style.flexShrink = '0';
              rowDiv.appendChild(spacer);
            }
          } else {
            for (const pageIndex of row) {
              const slot = document.createElement('div');
              slot.style.flexShrink = '0';
              slot.dataset.pageIndex = String(pageIndex);

              const canvas = createPageCanvas(displayWidth, displayHeight);
              slot.appendChild(canvas);
              canvasMap.set(pageIndex, canvas);
              allSlots.push(slot);
              rowDiv.appendChild(slot);
            }
          }

          innerDiv.appendChild(rowDiv);
        }

        container.appendChild(innerDiv);

        // Lazy-render pages as they scroll into view
        const renderedSet = new Set<number>();
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
              const canvas = canvasMap.get(idx);
              if (!canvas || !docRef.current) continue;

              if (entry.isIntersecting && !renderedSet.has(idx)) {
                renderPageToCanvas(docRef.current.pages[idx]!, docRef.current, canvas);
                renderedSet.add(idx);
              } else if (!entry.isIntersecting && renderedSet.has(idx)) {
                // Release GPU memory for off-screen pages
                canvas.width = 1;
                canvas.height = 1;
                renderedSet.delete(idx);
              }
            }
          },
          { root: container, rootMargin: '200px 0px 200px 0px' },
        );
        observerRef.current = observer;

        for (const slot of allSlots) {
          observer.observe(slot);
        }
      } catch (err) {
        console.error('[CanvasPreview] Layout error:', err);
      }
    });

    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
    };
  }, [deferredMarkdown, deferredConfig, resizeKey, zoom, viewMode, fitMode]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: 'var(--surface)', overflow: 'auto' }}
    />
  );
}

function createPageCanvas(displayWidth: number, displayHeight: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)';
  canvas.style.borderRadius = '2px';
  canvas.style.backgroundColor = '#ffffff';
  return canvas;
}
