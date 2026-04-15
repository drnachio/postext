'use client';

import { useEffect, useRef, useState, useDeferredValue, type Dispatch, type MutableRefObject } from 'react';
import { useSandbox } from '../context/SandboxContext';
import type { SandboxAction } from '../context/SandboxContext';
import type { PanelId } from '../types';
import { buildDocument, renderPageToCanvas, clearMeasurementCache, resolveDebugConfig } from 'postext';
import type { VDTDocument, ResolvedDebugConfig } from 'postext';

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
  const { state, dispatch } = useSandbox();
  const containerRef = useRef<HTMLDivElement>(null);
  // Refs used by click handlers so changing panel/dispatch identity doesn't
  // force a full DOM rebuild of the page slots.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const activePanelRef = useRef(state.activePanel);
  activePanelRef.current = state.activePanel;
  const docRef = useRef<VDTDocument | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const overlayMapRef = useRef<Map<number, SVGSVGElement>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const deferredMarkdown = useDeferredValue(state.markdown);
  const deferredConfig = useDeferredValue(state.config);
  const [resizeKey, setResizeKey] = useState(0);
  const [docVersion, setDocVersion] = useState(0);

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

        // Tear down previous observer + maps, but keep the old DOM in place
        // until the new one is fully built and painted — this avoids a blank
        // flash while the user is typing fast.
        observerRef.current?.disconnect();
        canvasMapRef.current.clear();
        overlayMapRef.current.clear();
        const previouslyRendered = renderedPagesRef.current;
        renderedPagesRef.current = new Set();

        if (doc.pages.length === 0) {
          while (container.firstChild) container.removeChild(container.firstChild);
          return;
        }

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
        const overlayMap = overlayMapRef.current;
        const pageWidthPx = firstPage.width;
        const pageHeightPx = firstPage.height;
        const rows = groupPagesIntoRows(doc.pages.length, viewMode);
        const allSlots: HTMLDivElement[] = [];

        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx]!;
          const rowDiv = document.createElement('div');
          rowDiv.style.display = 'flex';
          rowDiv.style.justifyContent = 'center';
          rowDiv.style.alignItems = 'flex-start';
          const paddingTop = rowIdx === 0 ? padding : gap / 2;
          const paddingBottom = rowIdx === rows.length - 1 ? padding : gap / 2;
          rowDiv.style.padding = `${paddingTop}px ${padding}px ${paddingBottom}px`;
          rowDiv.style.gap = `${gap}px`;
          rowDiv.style.boxSizing = 'border-box';
          rowDiv.style.minHeight = `${displayHeight + paddingTop + paddingBottom}px`;

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
            slot.style.position = 'relative';
            slot.dataset.pageIndex = String(pageIndex);

            const canvas = createPageCanvas(displayWidth, displayHeight);
            slot.appendChild(canvas);
            canvasMap.set(pageIndex, canvas);
            const overlay = createOverlaySvg(displayWidth, displayHeight, pageWidthPx, pageHeightPx);
            slot.appendChild(overlay);
            overlayMap.set(pageIndex, overlay);
            attachSlotClickHandler(slot, pageIndex, displayWidth, displayHeight, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef);
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
              slot.style.position = 'relative';
              slot.dataset.pageIndex = String(pageIndex);

              const canvas = createPageCanvas(displayWidth, displayHeight);
              slot.appendChild(canvas);
              canvasMap.set(pageIndex, canvas);
              const overlay = createOverlaySvg(displayWidth, displayHeight, pageWidthPx, pageHeightPx);
              slot.appendChild(overlay);
              overlayMap.set(pageIndex, overlay);
              attachSlotClickHandler(slot, pageIndex, displayWidth, displayHeight, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef);
              allSlots.push(slot);
              rowDiv.appendChild(slot);
            }
          }

          innerDiv.appendChild(rowDiv);
        }

        // Pre-render pages that were visible in the previous document so the
        // swap from old DOM to new DOM shows already-painted pixels. Any page
        // not in the new doc is simply skipped.
        const renderedSet = new Set<number>();
        for (const pageIndex of previouslyRendered) {
          const canvas = canvasMap.get(pageIndex);
          const page = doc.pages[pageIndex];
          if (!canvas || !page) continue;
          renderPageToCanvas(page, doc, canvas);
          renderedSet.add(pageIndex);
        }
        renderedPagesRef.current = renderedSet;

        // Atomic swap: remove old children and attach the new tree in one go.
        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(innerDiv);

        // Lazy-render pages as they scroll into view
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

        setDocVersion((v) => v + 1);
      } catch (err) {
        console.error('[CanvasPreview] Layout error:', err);
      }
    });

    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
    };
  }, [deferredMarkdown, deferredConfig, resizeKey, zoom, viewMode, fitMode]);

  // Draw cursor/selection overlays whenever selection or debug config changes
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const debug = resolveDebugConfig(state.config.debug);
    const selection = state.selection;
    const focused = state.editorFocused;
    // Find the block that should host the caret. Prefer the block that
    // actually contains the source offset; otherwise fall back to the first
    // block starting at or after the offset (cursor between paragraphs).
    let caretBlockIdx = -1;
    const { from } = selection;
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i]!;
      if (b.sourceStart === undefined || b.sourceEnd === undefined) continue;
      if (from >= b.sourceStart && from < b.sourceEnd) { caretBlockIdx = i; break; }
    }
    if (caretBlockIdx === -1) {
      for (let i = 0; i < doc.blocks.length; i++) {
        const b = doc.blocks[i]!;
        if (b.sourceStart === undefined) continue;
        if (b.sourceStart >= from) { caretBlockIdx = i; break; }
      }
    }
    if (caretBlockIdx === -1 && doc.blocks.length > 0) {
      caretBlockIdx = doc.blocks.length - 1;
    }

    let activeCursorRect: SVGRectElement | null = null;
    for (const [pageIndex, overlay] of overlayMapRef.current) {
      const page = doc.pages[pageIndex];
      if (!page) continue;
      const rect = drawOverlay(overlay, doc, pageIndex, selection, debug, focused, caretBlockIdx);
      if (rect) activeCursorRect = rect;
    }

    const container = containerRef.current;
    const isCollapsed = selection.from === selection.to;
    if (
      activeCursorRect &&
      container &&
      focused &&
      isCollapsed &&
      debug.cursorSync.enabled
    ) {
      const padding = 16;
      const cr = activeCursorRect.getBoundingClientRect();
      const cn = container.getBoundingClientRect();
      if (cr.top < cn.top + padding) {
        container.scrollTop += cr.top - cn.top - padding;
      } else if (cr.bottom > cn.bottom - padding) {
        container.scrollTop += cr.bottom - cn.bottom + padding;
      }
      if (cr.left < cn.left + padding) {
        container.scrollLeft += cr.left - cn.left - padding;
      } else if (cr.right > cn.right - padding) {
        container.scrollLeft += cr.right - cn.right + padding;
      }
    }
  }, [state.selection, state.config.debug, state.editorFocused, docVersion]);

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

const SVG_NS = 'http://www.w3.org/2000/svg';

function createOverlaySvg(
  displayWidth: number,
  displayHeight: number,
  pageWidthPx: number,
  pageHeightPx: number,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${pageWidthPx} ${pageHeightPx}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = `${displayWidth}px`;
  svg.style.height = `${displayHeight}px`;
  svg.style.pointerEvents = 'none';
  svg.style.mixBlendMode = 'multiply';

  // Persistent groups: selection is redrawn each update; cursor is animated
  // via CSS and updated in place so the blink animation stays in sync.
  const selectionGroup = document.createElementNS(SVG_NS, 'g');
  selectionGroup.dataset.role = 'selection';
  svg.appendChild(selectionGroup);

  const cursorGroup = document.createElementNS(SVG_NS, 'g');
  cursorGroup.dataset.role = 'cursor';
  cursorGroup.setAttribute('class', 'cursor-blink');
  const cursorRect = document.createElementNS(SVG_NS, 'rect');
  cursorRect.style.display = 'none';
  cursorGroup.appendChild(cursorRect);
  svg.appendChild(cursorGroup);

  return svg;
}

/**
 * Convert an absolute source offset (in the original markdown) to a plain-text
 * character index within the given block's plain text. Returns null if the
 * offset is outside the block. Uses the block's per-char sourceMap plus any
 * numbering prefix length.
 */
function sourceToPlainIndex(
  block: VDTDocument['blocks'][number],
  srcOffset: number,
): number | null {
  if (!block.sourceMap || block.sourceStart === undefined || block.sourceEnd === undefined) return null;
  const prefixLen = block.plainPrefixLen ?? 0;
  if (srcOffset < block.sourceStart) return null;
  if (srcOffset >= block.sourceEnd) return prefixLen + block.sourceMap.length;
  // Binary search: smallest i with sourceMap[i] >= srcOffset
  let lo = 0;
  let hi = block.sourceMap.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (block.sourceMap[mid]! < srcOffset) lo = mid + 1;
    else hi = mid;
  }
  return prefixLen + lo;
}

/**
 * Given a line and an in-line plain-char offset, compute the exact x
 * coordinate (in page-space px) using per-segment widths and, for justified
 * non-last lines, distributing the slack over space segments.
 */
function xForPlainInLine(
  block: VDTDocument['blocks'][number],
  line: VDTDocument['blocks'][number]['lines'][number],
  inLineOffset: number,
): number {
  const blockRight = block.bbox.x + block.bbox.width;
  const lineLen = Math.max(0, (line.plainEnd ?? 0) - (line.plainStart ?? 0));
  const justifyFill = block.textAlign === 'justify' && line.isLastLine === false;
  const segs = line.segments;

  if (!segs || segs.length === 0) {
    const renderedWidth = justifyFill
      ? Math.max(line.bbox.width, blockRight - line.bbox.x)
      : line.bbox.width;
    const ratio = lineLen > 0 ? inLineOffset / lineLen : 0;
    return line.bbox.x + ratio * renderedWidth;
  }

  let naturalWidth = 0;
  let spaceCount = 0;
  for (const seg of segs) {
    naturalWidth += seg.width;
    if (seg.kind === 'space') spaceCount++;
  }
  const renderedWidth = justifyFill
    ? Math.max(naturalWidth, blockRight - line.bbox.x)
    : naturalWidth;
  const extraPerSpace = justifyFill && spaceCount > 0
    ? Math.max(0, (renderedWidth - naturalWidth) / spaceCount)
    : 0;

  const lastIdx = segs.length - 1;
  let x = line.bbox.x;
  let cum = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const isLastSeg = i === lastIdx;
    const segPlainLen = (isLastSeg && line.hyphenated && seg.text.endsWith('-'))
      ? Math.max(0, seg.text.length - 1)
      : seg.text.length;
    const segRendered = seg.width + (seg.kind === 'space' ? extraPerSpace : 0);
    if (inLineOffset <= cum + segPlainLen) {
      const within = inLineOffset - cum;
      const ratio = segPlainLen > 0 ? within / segPlainLen : 0;
      return x + ratio * segRendered;
    }
    x += segRendered;
    cum += segPlainLen;
  }
  return x;
}

function drawOverlay(
  svg: SVGSVGElement,
  doc: VDTDocument,
  pageIndex: number,
  selection: { from: number; to: number },
  debug: ResolvedDebugConfig,
  focused: boolean,
  caretBlockIdx: number,
): SVGRectElement | null {
  const selectionGroup = svg.querySelector<SVGGElement>('g[data-role="selection"]');
  const cursorGroup = svg.querySelector<SVGGElement>('g[data-role="cursor"]');
  const cursorRect = cursorGroup?.firstElementChild as SVGRectElement | null;
  if (!selectionGroup || !cursorGroup || !cursorRect) return null;

  while (selectionGroup.firstChild) selectionGroup.removeChild(selectionGroup.firstChild);
  cursorRect.style.display = 'none';

  const { from, to } = selection;
  const isCollapsed = from === to;
  const cursorActive = debug.cursorSync.enabled && isCollapsed;
  const selectionActive = debug.selectionSync.enabled && !isCollapsed;

  if (!focused) return null;
  if (!cursorActive && !selectionActive) return null;

  const caretBlock = cursorActive ? doc.blocks[caretBlockIdx] : undefined;
  let cursorDrawn = false;

  // Cursor: draw once on the pre-identified caret block if it lives on this page.
  if (cursorActive && caretBlock && caretBlock.pageIndex === pageIndex) {
    const prefixLen = caretBlock.plainPrefixLen ?? 0;
    const plainLen = prefixLen + (caretBlock.sourceMap?.length ?? 0);
    // Clamp: if `from` is before the block (cursor between paragraphs) snap to start.
    let plainCaret: number;
    if (caretBlock.sourceStart !== undefined && from < caretBlock.sourceStart) {
      plainCaret = prefixLen;
    } else {
      const mapped = sourceToPlainIndex(caretBlock, from);
      plainCaret = mapped === null ? prefixLen : Math.min(mapped, plainLen);
    }
    for (const line of caretBlock.lines) {
      const lineStart = line.plainStart;
      const lineEnd = line.plainEnd;
      if (lineStart === undefined || lineEnd === undefined) continue;
      if (plainCaret < lineStart || plainCaret > lineEnd) continue;
      const x = xForPlainInLine(caretBlock, line, plainCaret - lineStart);
      cursorRect.setAttribute('x', String(x - 1.5));
      cursorRect.setAttribute('y', String(line.bbox.y));
      cursorRect.setAttribute('width', '3');
      cursorRect.setAttribute('height', String(line.bbox.height));
      cursorRect.setAttribute('fill', debug.cursorSync.color.hex);
      cursorRect.style.display = '';
      cursorDrawn = true;
      break;
    }
    if (!selectionActive) return cursorDrawn ? cursorRect : null;
  }

  if (!selectionActive) return cursorDrawn ? cursorRect : null;

  const blocks = doc.blocks.filter((b) => b.pageIndex === pageIndex);
  for (const block of blocks) {
    if (block.sourceStart === undefined || block.sourceEnd === undefined) continue;
    if (block.sourceEnd <= from) continue;
    if (block.sourceStart > to) continue;

    const prefixLen = block.plainPrefixLen ?? 0;
    const plainEnd = prefixLen + (block.sourceMap?.length ?? 0);
    const plainFrom = from <= block.sourceStart ? prefixLen : (sourceToPlainIndex(block, from) ?? prefixLen);
    const plainTo = to >= block.sourceEnd ? plainEnd : (sourceToPlainIndex(block, to) ?? plainEnd);

    for (const line of block.lines) {
      const lineStart = line.plainStart;
      const lineEnd = line.plainEnd;
      if (lineStart === undefined || lineEnd === undefined) continue;

      {
        const lo = Math.max(plainFrom, lineStart);
        const hi = Math.min(plainTo, lineEnd);
        if (hi <= lo) continue;
        const x1 = xForPlainInLine(block, line, lo - lineStart);
        const x2 = xForPlainInLine(block, line, hi - lineStart);
        const w = Math.max(1, x2 - x1);
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(x1));
        rect.setAttribute('y', String(line.bbox.y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(line.bbox.height));
        rect.setAttribute('fill', debug.selectionSync.color.hex);
        selectionGroup.appendChild(rect);
      }
    }
  }
  return cursorDrawn ? cursorRect : null;
}

/**
 * Reverse hit-test: given page-space pixel coordinates, find the source offset
 * in the markdown document that corresponds to the clicked glyph. Returns null
 * when the click lands on page background (outside any block).
 */
function pixelToSourceOffset(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): number | null {
  // 1. Find a block on this page whose bbox contains the click.
  let hitBlock: VDTDocument['blocks'][number] | undefined;
  for (const b of doc.blocks) {
    if (b.pageIndex !== pageIndex) continue;
    const bx = b.bbox.x;
    const by = b.bbox.y;
    if (xPage < bx || xPage > bx + b.bbox.width) continue;
    if (yPage < by || yPage > by + b.bbox.height) continue;
    hitBlock = b;
    break;
  }
  if (!hitBlock) return null;

  // 2. Find the line whose vertical band contains yPage; snap to nearest if
  //    click is in the gap between lines.
  let hitLine: VDTDocument['blocks'][number]['lines'][number] | undefined;
  let bestDy = Infinity;
  for (const line of hitBlock.lines) {
    const top = line.bbox.y;
    const bot = top + line.bbox.height;
    if (yPage >= top && yPage <= bot) {
      hitLine = line;
      break;
    }
    const dy = yPage < top ? top - yPage : yPage - bot;
    if (dy < bestDy) {
      bestDy = dy;
      hitLine = line;
    }
  }
  if (!hitLine || hitLine.plainStart === undefined || hitLine.plainEnd === undefined) {
    return hitBlock.sourceStart ?? null;
  }

  // 3. Walk segments to find the plain-char offset within the line. Mirror the
  //    justify-fill math from xForPlainInLine.
  const blockRight = hitBlock.bbox.x + hitBlock.bbox.width;
  const justifyFill = hitBlock.textAlign === 'justify' && hitLine.isLastLine === false;
  const segs = hitLine.segments;
  const lineLen = Math.max(0, hitLine.plainEnd - hitLine.plainStart);
  let inLineOffset: number;

  if (!segs || segs.length === 0) {
    const renderedWidth = justifyFill
      ? Math.max(hitLine.bbox.width, blockRight - hitLine.bbox.x)
      : hitLine.bbox.width;
    const rel = Math.max(0, Math.min(renderedWidth, xPage - hitLine.bbox.x));
    const ratio = renderedWidth > 0 ? rel / renderedWidth : 0;
    inLineOffset = Math.round(ratio * lineLen);
  } else {
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segs) {
      naturalWidth += seg.width;
      if (seg.kind === 'space') spaceCount++;
    }
    const renderedWidth = justifyFill
      ? Math.max(naturalWidth, blockRight - hitLine.bbox.x)
      : naturalWidth;
    const extraPerSpace = justifyFill && spaceCount > 0
      ? Math.max(0, (renderedWidth - naturalWidth) / spaceCount)
      : 0;

    const lastIdx = segs.length - 1;
    let x = hitLine.bbox.x;
    let cum = 0;
    // Clamp click to the line's rendered horizontal extent.
    const clampedX = Math.max(hitLine.bbox.x, Math.min(xPage, hitLine.bbox.x + renderedWidth));
    let resolved = false;
    let result = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const isLastSeg = i === lastIdx;
      const segPlainLen = (isLastSeg && hitLine.hyphenated && seg.text.endsWith('-'))
        ? Math.max(0, seg.text.length - 1)
        : seg.text.length;
      const segRendered = seg.width + (seg.kind === 'space' ? extraPerSpace : 0);
      if (clampedX <= x + segRendered) {
        const within = clampedX - x;
        const ratio = segRendered > 0 ? within / segRendered : 0;
        result = cum + Math.round(ratio * segPlainLen);
        resolved = true;
        break;
      }
      x += segRendered;
      cum += segPlainLen;
    }
    inLineOffset = resolved ? result : cum;
  }

  const plainCharIndex = hitLine.plainStart + inLineOffset;

  // 4. Map plain-char back to source offset via the block's sourceMap.
  const prefixLen = hitBlock.plainPrefixLen ?? 0;
  const mapIdx = plainCharIndex - prefixLen;
  if (!hitBlock.sourceMap) return hitBlock.sourceStart ?? null;
  if (mapIdx < 0) return hitBlock.sourceStart ?? null;
  if (mapIdx >= hitBlock.sourceMap.length) return hitBlock.sourceEnd ?? null;
  return hitBlock.sourceMap[mapIdx] ?? null;
}

/**
 * Wire a click listener on a page slot. Background clicks (outside any block)
 * and active text-selection drags are ignored.
 */
function attachSlotClickHandler(
  slot: HTMLDivElement,
  pageIndex: number,
  displayWidth: number,
  displayHeight: number,
  pageWidthPx: number,
  pageHeightPx: number,
  docRef: MutableRefObject<VDTDocument | null>,
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>,
  activePanelRef: MutableRefObject<PanelId | null>,
): void {
  slot.style.cursor = 'text';

  const resolveOffset = (ev: MouseEvent): number | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const rect = slot.getBoundingClientRect();
    const scaleX = pageWidthPx / displayWidth;
    const scaleY = pageHeightPx / displayHeight;
    const xPage = (ev.clientX - rect.left) * scaleX;
    const yPage = (ev.clientY - rect.top) * scaleY;
    return pixelToSourceOffset(doc, pageIndex, xPage, yPage);
  };

  const focusEditor = (offset: number, selectWord: boolean): void => {
    const dispatch = dispatchRef.current;
    if (activePanelRef.current !== 'markdown') {
      dispatch({ type: 'SET_PANEL', payload: 'markdown' });
    }
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { offset, selectWord } });
  };

  slot.addEventListener('click', (ev) => {
    if (ev.detail === 0) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
    const offset = resolveOffset(ev);
    if (offset === null) return;
    focusEditor(offset, false);
  });

  slot.addEventListener('dblclick', (ev) => {
    const offset = resolveOffset(ev);
    if (offset === null) return;
    ev.preventDefault();
    focusEditor(offset, true);
  });
}
