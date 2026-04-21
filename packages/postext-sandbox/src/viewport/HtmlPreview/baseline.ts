import type { VDTDocument } from 'postext';

// Minimal CSS.escape fallback — block IDs only use [a-zA-Z0-9-].
export function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

/**
 * Measure the actual pixel offset of the text baseline within a `.pt-line`
 * cell. The VDT's own `line.baseline` is `lineY + 0.8 * lineHeight`, which
 * matches how the canvas backend paints glyphs but not how the browser
 * positions inline text inside a line-box (the result depends on the
 * font's ascent metric and the default `line-height: normal`). We append a
 * zero-sized inline-block to a body paragraph's line — its `bottom` aligns
 * with the line-box baseline — and take the delta against the line's top.
 * Returns null when no body line is available (e.g. empty document), in
 * which case callers fall back to the 0.8 approximation.
 */
export function measureBodyBaselineOffset(
  scroll: HTMLElement,
  doc: VDTDocument,
): number | null {
  // Prefer a paragraph block so headings / list bullets don't skew the
  // measurement — the grid is sized to the body line-height.
  const bodyBlock = doc.blocks.find(
    (b) => b.type === 'paragraph' && b.lines.length > 0,
  );
  if (!bodyBlock) return null;
  const selector = `.pt-line[data-block="${cssEscape(bodyBlock.id)}"]`;
  const lineEl = scroll.querySelector<HTMLElement>(selector);
  if (!lineEl) return null;
  const marker = document.createElement('span');
  marker.style.cssText =
    'display:inline-block;width:0;height:0;visibility:hidden;vertical-align:baseline;';
  lineEl.appendChild(marker);
  const lineRect = lineEl.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  lineEl.removeChild(marker);
  if (lineRect.height === 0) return null;
  return markerRect.bottom - lineRect.top;
}
