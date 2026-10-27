// Where the comic tools draw: the marks on an SVG group or a canvas, and
// the surface of a page slot of the canvas or the HTML preview (#1276:
// split out of comicEditing.ts).
import { SVG_NS } from './helpers.js';
import type { ComicMark, ComicSurface } from './types.js';

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** Append the marks to an SVG group whose units are sheet px. */
export function drawMarksSvg(group: SVGGElement, marks: readonly ComicMark[], cssToSheet: number): void {
  while (group.firstChild) group.removeChild(group.firstChild);
  for (const m of marks) {
    const el = document.createElementNS(SVG_NS, m.closed ? 'polygon' : 'polyline');
    el.setAttribute('points', m.points.map((p) => `${p.x},${p.y}`).join(' '));
    el.setAttribute('fill', m.closed && m.fill ? m.fill : 'none');
    if (m.stroke) {
      el.setAttribute('stroke', m.stroke);
      el.setAttribute('stroke-width', String((m.width ?? 1) * cssToSheet));
      if (m.dash) el.setAttribute('stroke-dasharray', m.dash.map((d) => d * cssToSheet).join(' '));
      el.setAttribute('stroke-linejoin', 'round');
    }
    group.appendChild(el);
  }
}

/** Draw the marks on a 2D context whose units are sheet px. */
export function drawMarksCanvas(ctx: CanvasRenderingContext2D, marks: readonly ComicMark[], cssToSheet: number): void {
  for (const m of marks) {
    if (m.points.length === 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(m.points[0]!.x, m.points[0]!.y);
    for (const p of m.points.slice(1)) ctx.lineTo(p.x, p.y);
    if (m.closed) ctx.closePath();
    if (m.closed && m.fill) {
      ctx.fillStyle = m.fill;
      ctx.fill();
    }
    if (m.stroke) {
      ctx.strokeStyle = m.stroke;
      ctx.lineWidth = (m.width ?? 1) * cssToSheet;
      ctx.setLineDash(m.dash ? m.dash.map((d) => d * cssToSheet) : []);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The surface of one page slot of the canvas or the HTML preview: an SVG
 * layer over the page (sheet px) for the marks, the slot itself for the
 * floating parts, placed in percent of the page so a zoom keeps them on
 * their points.
 */
export function slotComicSurface(slot: HTMLElement, pageIndex: number, pageWidthPx: number, pageHeightPx: number): ComicSurface {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${pageWidthPx} ${pageHeightPx}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.role = 'comicMarks';
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '5' } satisfies Partial<CSSStyleDeclaration>);
  const group = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(group);
  let attached = false;
  const cssToSheet = () => {
    const w = slot.getBoundingClientRect().width;
    return w > 0 ? pageWidthPx / w : 1;
  };
  return {
    host: slot,
    pages: () => [pageIndex],
    paint(page, marks) {
      if (page !== pageIndex) return;
      if (!marks || marks.length === 0) {
        while (group.firstChild) group.removeChild(group.firstChild);
        return;
      }
      if (!attached || svg.parentNode !== slot) {
        slot.appendChild(svg);
        attached = true;
      }
      drawMarksSvg(group, marks, cssToSheet());
    },
    place(el, page, x, y) {
      if (page !== pageIndex) return false;
      el.style.left = `${(x / pageWidthPx) * 100}%`;
      el.style.top = `${(y / pageHeightPx) * 100}%`;
      // The HTML pages are zoomed with a transform: undo it on the floating
      // part so it keeps its size.
      const rect = slot.getBoundingClientRect();
      const k = slot.offsetWidth > 0 && rect.width > 0 ? rect.width / slot.offsetWidth : 1;
      el.style.transform = Math.abs(k - 1) > 0.01 ? `scale(${1 / k})` : '';
      return true;
    },
    sheetPxPerCssPx: () => cssToSheet(),
  };
}
