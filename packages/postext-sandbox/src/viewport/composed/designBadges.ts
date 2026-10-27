/**
 * How each frame of a composed page is sized, drawn on it in Design mode
 * (#868), in the canvas overlay only: «auto» where its height (or width)
 * follows its content, a line at its minimum and one at its maximum
 * height with their values, and a pin where the frame keeps its declared
 * box whatever the frames around it do (`pin: true`). What the template
 * says, so the reader sees why a box grew or stayed when the text changed.
 */

import { resolvePageTemplate, type PageTemplateSource, type VDTDocument, type VDTFrame, type VDTPage } from 'postext';
import { dimensionToMm } from '../../templates/frameGeometry.js';
import { SVG_NS } from '../canvas/CanvasPreview/dom.js';
import { fill } from '../../print/fillTokens.js';
import { localNumber } from './reflowText.js';

export interface DesignBadgeLabels {
  /** «auto» */
  auto: string;
  /** «min __mm__ mm» */
  min: string;
  /** «max __mm__ mm» */
  max: string;
  /** «pinned» */
  pinned: string;
}

export interface DesignBadge {
  frame: VDTFrame;
  /** The height follows the content (`height: 'auto'`, or a fixed height
   *  that may grow to a `maxHeight`); `autoWidth` the same across. */
  autoHeight: boolean;
  autoWidth: boolean;
  /** The minimum and maximum heights, mm, and where they fall on the
   *  sheet (px from the top of the frame's laid box). */
  min?: { mm: number; offsetPx: number };
  max?: { mm: number; offsetPx: number };
  pinned: boolean;
  /** The badge's words. */
  text: string;
}

/** The badges of one page's frames, in template order. */
export function designBadgesFor(
  doc: Pick<VDTDocument, 'config'>,
  page: Pick<VDTPage, 'composed'>,
  labels: DesignBadgeLabels,
  locale?: string,
): DesignBadge[] {
  const c = page.composed;
  if (!c) return [];
  const template = resolvePageTemplate(doc.config as unknown as PageTemplateSource, c.template, { ...(c.variant ? { parity: c.variant } : {}), ...(c.modules ? { modules: c.modules } : {}) });
  if (!template) return [];
  const dpi = doc.config.page?.dpi ?? 300;
  const pxPerMm = dpi / 25.4;
  const out: DesignBadge[] = [];
  for (const frame of c.frames) {
    if (frame.facingBlocks && frame.blockIds.length === 0) continue;
    const rf = template.frames.find((f) => f.name === frame.name);
    if (!rf) continue;
    const autoHeight = rf.height === 'auto' || (typeof rf.height === 'object' && 'unit' in rf.height && rf.maxHeight !== undefined);
    const autoWidth = rf.width === 'auto';
    const min = rf.minHeight ? dimensionToMm(rf.minHeight) : undefined;
    const max = rf.maxHeight ? dimensionToMm(rf.maxHeight) : undefined;
    const words: string[] = [];
    if (autoHeight || autoWidth) words.push(labels.auto);
    if (min !== undefined) words.push(fill(labels.min, { mm: localNumber(min, locale) }));
    if (max !== undefined) words.push(fill(labels.max, { mm: localNumber(max, locale) }));
    if (rf.pin) words.push(labels.pinned);
    if (words.length === 0) continue;
    out.push({
      frame,
      autoHeight,
      autoWidth,
      ...(min !== undefined ? { min: { mm: min, offsetPx: min * pxPerMm } } : {}),
      ...(max !== undefined ? { max: { mm: max, offsetPx: max * pxPerMm } } : {}),
      pinned: rf.pin,
      text: words.join(' · '),
    });
  }
  return out;
}

const INK = '#1c7c54';

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** A pin, drawn at `(x, y)` (its point) `size` tall. */
function pin(x: number, y: number, size: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.dataset.part = 'pin';
  const r = size * 0.28;
  g.appendChild(el('line', { x1: x, y1: y, x2: x, y2: y - size * 0.55, stroke: INK, 'stroke-width': size * 0.1, 'stroke-linecap': 'round' }));
  g.appendChild(el('circle', { cx: x, cy: y - size * 0.55 - r * 0.8, r, fill: INK }));
  return g;
}

/** Draw the badges into a Design-mode frame mark (`item`, the frame's
 *  group in the overlay, already turned with the frame). */
export function drawDesignBadge(item: SVGGElement, badge: DesignBadge, fs: number, unit: number, placed: { x: number; y: number; w: number }[] = []): void {
  const { rect } = badge.frame;
  const small = fs * 0.85;
  // The size lines: across the frame at its minimum and maximum height,
  // from its laid top, with the value at the end edge.
  for (const [line, word] of [[badge.min, 'min'], [badge.max, 'max']] as const) {
    if (!line) continue;
    const y = rect.y + line.offsetPx;
    const l = el('line', { x1: rect.x, y1: y, x2: rect.x + rect.width, y2: y, stroke: INK, 'stroke-width': unit * 1.1, 'stroke-dasharray': `${unit * 2} ${unit * 2}` });
    l.dataset.part = word;
    item.appendChild(l);
    // Ticks at both ends, a handle to read the line by.
    for (const x of [rect.x, rect.x + rect.width]) item.appendChild(el('line', { x1: x - unit * 3, y1: y, x2: x + unit * 3, y2: y, stroke: INK, 'stroke-width': unit * 2 }));
  }
  // The words, at the frame's foot on its start side (the name is at its
  // top start corner, the fit marks at its end corners), on a white ground.
  const w = small * (0.6 * badge.text.length + 1.1) + (badge.pinned ? small * 1.2 : 0);
  const x = rect.x + unit * 3;
  let y = Math.max(rect.y + unit * 3, rect.y + rect.height - small * 1.5 - unit * 3);
  // Two frames whose feet meet (a frame of photos inside its box): the
  // later badge goes above the earlier one.
  while (placed.some((p) => x < p.x + p.w && p.x < x + w && Math.abs(p.y - y) < small * 1.6)) y -= small * 1.7;
  placed.push({ x, y, w });
  const ground = el('rect', { x, y, width: w, height: small * 1.5, rx: small * 0.3, fill: '#ffffff', stroke: INK, 'stroke-width': unit });
  ground.dataset.part = 'badge';
  item.appendChild(ground);
  const t = el('text', { x: x + small * 0.45, y: y + small * 1.08, 'font-size': small, 'font-family': 'system-ui, sans-serif', 'font-weight': 600, fill: INK });
  t.textContent = badge.text;
  item.appendChild(t);
  try {
    const measured = t.getComputedTextLength();
    if (measured > 0) ground.setAttribute('width', String(measured + small * 0.9 + (badge.pinned ? small * 1.2 : 0)));
  } catch {
    // Not laid out: the estimate stays.
  }
  if (badge.pinned) item.appendChild(pin(x + Number(ground.getAttribute('width')) - small * 0.7, y + small * 1.25, small * 1.1));
}
