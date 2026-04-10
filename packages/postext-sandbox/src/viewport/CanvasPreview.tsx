'use client';

import { useEffect, useRef, useState, useDeferredValue } from 'react';
import { useSandbox } from '../context/SandboxContext';

/**
 * Canvas preview that renders a rasterized version of the document.
 * For now, this renders a simple text-based preview onto a canvas.
 * When the postext engine is fully implemented, this will render the
 * actual laid-out document at pixel precision.
 */
export function CanvasPreview() {
  const { state } = useSandbox();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredMarkdown = useDeferredValue(state.markdown);
  const [resizeKey, setResizeKey] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw a page-like area
    const pageMargin = 40;
    const pageWidth = Math.min(600, rect.width - pageMargin * 2);
    const pageX = (rect.width - pageWidth) / 2;
    const pageY = pageMargin;

    // Page shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(pageX + 3, pageY + 3, pageWidth, rect.height - pageMargin * 2);

    // Page background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pageX, pageY, pageWidth, rect.height - pageMargin * 2);

    // Page border
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.strokeRect(pageX, pageY, pageWidth, rect.height - pageMargin * 2);

    // Render text lines
    const contentMargin = 32;
    const lineHeight = 20;
    const maxWidth = pageWidth - contentMargin * 2;
    let y = pageY + contentMargin;

    ctx.textBaseline = 'top';

    const lines = deferredMarkdown.split('\n');
    for (const line of lines) {
      if (y > rect.height - pageMargin - contentMargin) break;

      const trimmed = line.trim();

      if (trimmed.startsWith('# ')) {
        ctx.font = 'bold 22px Georgia, serif';
        ctx.fillStyle = '#1a1a1a';
        y += 8;
        wrapText(ctx, trimmed.slice(2), pageX + contentMargin, y, maxWidth, lineHeight + 6);
        y += measureWrappedHeight(ctx, trimmed.slice(2), maxWidth, lineHeight + 6) + 12;
      } else if (trimmed.startsWith('## ')) {
        ctx.font = 'bold 18px Georgia, serif';
        ctx.fillStyle = '#1a1a1a';
        y += 12;
        wrapText(ctx, trimmed.slice(3), pageX + contentMargin, y, maxWidth, lineHeight + 4);
        y += measureWrappedHeight(ctx, trimmed.slice(3), maxWidth, lineHeight + 4) + 8;
        // Underline
        ctx.strokeStyle = '#ddd';
        ctx.beginPath();
        ctx.moveTo(pageX + contentMargin, y - 4);
        ctx.lineTo(pageX + contentMargin + maxWidth, y - 4);
        ctx.stroke();
      } else if (trimmed.startsWith('### ')) {
        ctx.font = 'bold 16px Georgia, serif';
        ctx.fillStyle = '#1a1a1a';
        y += 8;
        wrapText(ctx, trimmed.slice(4), pageX + contentMargin, y, maxWidth, lineHeight + 2);
        y += measureWrappedHeight(ctx, trimmed.slice(4), maxWidth, lineHeight + 2) + 6;
      } else if (trimmed.startsWith('> ')) {
        ctx.font = 'italic 14px Georgia, serif';
        ctx.fillStyle = '#666';
        // Draw quote bar
        ctx.fillStyle = '#ccc';
        ctx.fillRect(pageX + contentMargin, y, 3, lineHeight);
        ctx.fillStyle = '#666';
        wrapText(ctx, trimmed.slice(2), pageX + contentMargin + 12, y, maxWidth - 12, lineHeight);
        y += measureWrappedHeight(ctx, trimmed.slice(2), maxWidth - 12, lineHeight) + 4;
      } else if (trimmed.startsWith('```')) {
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(pageX + contentMargin, y, maxWidth, lineHeight);
        y += lineHeight + 2;
      } else if (trimmed === '') {
        y += lineHeight / 2;
      } else if (trimmed.startsWith('- ') || /^\d+\. /.test(trimmed)) {
        ctx.font = '14px Georgia, serif';
        ctx.fillStyle = '#333';
        const bullet = trimmed.startsWith('- ') ? '\u2022 ' : trimmed.match(/^\d+\. /)?.[0] ?? '';
        const text = trimmed.replace(/^(?:- |\d+\. )/, '');
        wrapText(ctx, `${bullet}${text}`, pageX + contentMargin + 16, y, maxWidth - 16, lineHeight);
        y += measureWrappedHeight(ctx, `${bullet}${text}`, maxWidth - 16, lineHeight) + 2;
      } else {
        ctx.font = '14px Georgia, serif';
        ctx.fillStyle = '#333';
        // Strip markdown formatting for plain render
        const plain = trimmed
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/_(.+?)_/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .replace(/\[(.+?)\]\(.+?\)/g, '$1');
        wrapText(ctx, plain, pageX + contentMargin, y, maxWidth, lineHeight);
        y += measureWrappedHeight(ctx, plain, maxWidth, lineHeight) + 2;
      }
    }
  }, [deferredMarkdown, resizeKey]);

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

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

function measureWrappedHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let lines = 1;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      line = word;
      lines++;
    } else {
      line = testLine;
    }
  }

  return lines * lineHeight;
}
