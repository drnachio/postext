// Small pieces of the comic page tools: the accent and warning colours,
// drag thresholds, the keys of balloons, tails, panels and splitters, a
// balloon's text, percent text, toolbar icons and the isolation of a
// floating control (#1276: split out of comicEditing.ts).
import type { VDTComicPage, VDTComicBalloon, VDTComicPanel, VDTPoint, VDTComicSplitter } from 'postext';

export const ACCENT = 'rgba(37, 99, 235, 0.95)';
export const ACCENT_BAND = 'rgba(37, 99, 235, 0.16)';
export const ACCENT_CELL = 'rgba(37, 99, 235, 0.07)';
export const WARN_FILL = 'rgba(234, 88, 12, 0.26)';
export const WARN_STROKE = 'rgba(194, 65, 12, 0.95)';
export const GHOST_FILL = 'rgba(37, 99, 235, 0.10)';
export const TIP_BG = 'rgba(15, 23, 42, 0.92)';
export const TIP_WARN_BG = 'rgba(154, 52, 18, 0.95)';
/** The ring a focused keyboard handle shows (whatever the browser's own
 *  focus ring does on an invisible element). */
export const FOCUS_RING = '0 0 0 2px #fff, 0 0 0 4px rgba(37, 99, 235, 0.95)';
/** Screen px a press on a balloon travels before it is a drag (less is a
 *  click: the caret goes to its line). */
export const BALLOON_DRAG_THRESHOLD_PX = 3;
/** The longest pause between the two clicks of a double click (ms). */
export const DOUBLE_CLICK_MS = 450;
/** Screen px past the ends of a line of balloon words that still count as
 *  its glyphs (#595). */
export const GLYPH_SLOP_SCREEN_PX = 2;

/** A balloon group's identity across relayouts: its page's comic and its
 *  first line (an edit of that line leaves its start where it was). */
export function balloonKey(comic: VDTComicPage, first: Pick<VDTComicBalloon, 'sourceStart'>): string {
  return `b${comic.sourceStart}:${first.sourceStart}`;
}

/** A tail's handle: its balloon's line. */
export const tailKey = (comic: VDTComicPage, b: Pick<VDTComicBalloon, 'sourceStart'>): string => `t${comic.sourceStart}:${b.sourceStart}`;

/** A panel's handle: its comic and its place in reading order. */
export const panelKey = (comic: VDTComicPage, panel: Pick<VDTComicPanel, 'index'>): string => `p${comic.sourceStart}:${panel.index}`;

/** A circle as a polygon (sheet px). */
export function ring(c: VDTPoint, r: number, n = 20): VDTPoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
}

/** A balloon's text, for its handle's name. */
export function balloonText(members: readonly VDTComicBalloon[]): string {
  const text = members.flatMap((b) => b.text.flatMap((t) => t.lines.map((l) => l.text))).join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

/** A splitter's identity across relayouts: its page's comic and its place
 *  in the split tree. */
export function splitterKey(comic: VDTComicPage, s: Pick<VDTComicSplitter, 'path' | 'boundary'>): string {
  return `${comic.sourceStart}:${s.path.join('.')}:${s.boundary}`;
}

export const samePath = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function percentText(value: number): string {
  try {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
    return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
  } catch {
    return `${Math.round(value * 10) / 10} %`;
  }
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 20 px toolbar icon: a panel and the line a button draws in it. */
export function icon(kind: 'rows' | 'columns' | 'merge'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  const path = document.createElementNS(SVG_NS, 'path');
  const d = {
    rows: 'M3 3h14v14H3z M3 10h14',
    columns: 'M3 3h14v14H3z M10 3v14',
    merge: 'M3 3h14v14H3z M10 3v4 M10 13v4 M7 10h6 M11 8l2 2-2 2',
  }[kind];
  path.setAttribute('d', d);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/** Stop the page's own pointer and click handling (caret, text drag) at a
 *  floating control. */
export function isolate(el: HTMLElement): void {
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'mousedown']) {
    el.addEventListener(type, (ev) => ev.stopPropagation());
  }
}
