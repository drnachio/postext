import type { VDTDocument, ResolvedDebugConfig } from 'postext';
import { SVG_NS } from './dom';
import { sourceToPlainIndex, xForPlainInLine } from './geometry';

/**
 * Paint the baseline grid for a single page into the overlay SVG's
 * `g[data-role="baselines"]` group. Used by the HTML viewer (the canvas
 * viewer paints its grid directly onto the canvas). Mirrors canvas-backend's
 * `renderBaselineGrid`: horizontal lines at `y = contentY + baselineIncrement
 * * 0.8`, spaced by `baselineIncrement`, across the page width. On non-last
 * pages the grid is clipped to the content height actually consumed so no
 * phantom baselines trail below placed blocks.
 */
export function drawBaselines(
  svg: SVGSVGElement,
  doc: VDTDocument,
  pageIndex: number,
  /**
   * First-baseline offset within a line cell, in page-space px. Callers that
   * render text in the browser (HtmlPreview) should pass a runtime-measured
   * offset — the VDT's `0.8 * lineHeight` approximation matches the canvas
   * backend but not the browser's line-box metrics, so the grid would drift
   * a couple of pixels below the visible text baseline otherwise. When
   * omitted, the 0.8 fallback keeps the drawing compatible with canvas-mode
   * callers.
   */
  firstBaselineOffsetPx?: number,
): void {
  const group = svg.querySelector<SVGGElement>('g[data-role="baselines"]');
  if (!group) return;
  while (group.firstChild) group.removeChild(group.firstChild);

  const grid = doc.config.page.baselineGrid;
  if (!grid.enabled) return;

  const page = doc.pages[pageIndex];
  if (!page) return;

  const baselineIncrement = doc.baselineGrid;
  if (!(baselineIncrement > 0)) return;

  // HTML viewer forces margins to 0, so the content area spans the whole
  // page. Page has no margins in HTML mode; fall back to the whole page if
  // we ever generalize.
  const contentX = 0;
  const contentY = 0;
  const contentW = page.width;
  let contentH = page.height;

  const isLastPage = pageIndex === doc.pages.length - 1;
  if (!isLastPage && page.columns.length > 0) {
    const maxUsed = Math.max(
      ...page.columns.map((col) => col.bbox.height - col.availableHeight),
    );
    contentH = maxUsed;
  }

  const maxLines = Math.floor(contentH / baselineIncrement);
  const color = grid.color.hex;
  const lineWidth = 1; // px — thin screen hairline, matches canvas look.
  const firstOffset = firstBaselineOffsetPx ?? baselineIncrement * 0.8;

  for (let i = 0; i < maxLines; i++) {
    const y = contentY + firstOffset + i * baselineIncrement;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(contentX));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(contentX + contentW));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', String(lineWidth));
    line.setAttribute('shape-rendering', 'crispEdges');
    group.appendChild(line);
  }
}

export function drawOverlay(
  svg: SVGSVGElement,
  doc: VDTDocument,
  pageIndex: number,
  selection: { from: number; to: number; head: number },
  debug: ResolvedDebugConfig,
  focused: boolean,
  caretBlockIdx: number,
): SVGRectElement | null {
  const selectionGroup = svg.querySelector<SVGGElement>('g[data-role="selection"]');
  const cursorGroup = svg.querySelector<SVGGElement>('g[data-role="cursor"]');
  const looseLineGroup = svg.querySelector<SVGGElement>('g[data-role="looseLines"]');
  const cursorRect = cursorGroup?.firstElementChild as SVGRectElement | null;
  if (!selectionGroup || !cursorGroup || !cursorRect) return null;

  while (selectionGroup.firstChild) selectionGroup.removeChild(selectionGroup.firstChild);
  if (looseLineGroup) while (looseLineGroup.firstChild) looseLineGroup.removeChild(looseLineGroup.firstChild);
  cursorRect.style.display = 'none';
  cursorRect.style.visibility = 'hidden';

  // Loose-line highlight: paint lines whose justified space ratio exceeds the threshold.
  if (looseLineGroup && debug.looseLineHighlight.enabled) {
    const threshold = debug.looseLineHighlight.threshold;
    const fill = debug.looseLineHighlight.color.hex;
    for (const block of doc.blocks) {
      if (block.pageIndex !== pageIndex) continue;
      for (const line of block.lines) {
        const ratio = line.justifiedSpaceRatio;
        if (ratio === undefined || ratio <= threshold) continue;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(block.bbox.x));
        rect.setAttribute('y', String(line.bbox.y));
        rect.setAttribute('width', String(block.bbox.width));
        rect.setAttribute('height', String(line.bbox.height));
        rect.setAttribute('fill', fill);
        looseLineGroup.appendChild(rect);
      }
    }
  }

  const { from, to, head } = selection;
  const isCollapsed = from === to;
  const cursorActive = debug.cursorSync.enabled && isCollapsed;
  const selectionActive = debug.selectionSync.enabled && !isCollapsed;

  if (!focused) return null;
  if (!cursorActive && !selectionActive) return null;

  // The scroll-target rect is positioned at the selection's `head` (the
  // active end). When the selection is collapsed this coincides with the
  // visible caret; when it isn't, the rect is still positioned but kept
  // invisible so callers can scroll it into view without drawing anything.
  const caretBlock = doc.blocks[caretBlockIdx];
  let cursorPositioned = false;

  if (caretBlock && caretBlock.pageIndex === pageIndex) {
    const prefixLen = caretBlock.plainPrefixLen ?? 0;
    const plainLen = prefixLen + (caretBlock.sourceMap?.length ?? 0);
    let plainCaret: number;
    if (caretBlock.sourceStart !== undefined && head < caretBlock.sourceStart) {
      plainCaret = prefixLen;
    } else {
      const mapped = sourceToPlainIndex(caretBlock, head);
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
      if (cursorActive) {
        cursorRect.style.display = '';
        cursorRect.style.visibility = '';
      } else {
        // Keep the rect in layout so callers can read getBoundingClientRect()
        // for scroll-to-selection, but don't paint it.
        cursorRect.style.display = '';
        cursorRect.style.visibility = 'hidden';
      }
      cursorPositioned = true;
      break;
    }
    if (!selectionActive) return cursorPositioned ? cursorRect : null;
  }

  if (!selectionActive) return cursorPositioned ? cursorRect : null;

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
  return cursorPositioned ? cursorRect : null;
}
