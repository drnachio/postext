import type { VDTDocument, ResolvedDebugConfig } from 'postext';
import { SVG_NS } from './dom';
import { sourceToPlainIndex, xForPlainInLine } from './geometry';

export function drawOverlay(
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
  const looseLineGroup = svg.querySelector<SVGGElement>('g[data-role="looseLines"]');
  const cursorRect = cursorGroup?.firstElementChild as SVGRectElement | null;
  if (!selectionGroup || !cursorGroup || !cursorRect) return null;

  while (selectionGroup.firstChild) selectionGroup.removeChild(selectionGroup.firstChild);
  if (looseLineGroup) while (looseLineGroup.firstChild) looseLineGroup.removeChild(looseLineGroup.firstChild);
  cursorRect.style.display = 'none';

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
