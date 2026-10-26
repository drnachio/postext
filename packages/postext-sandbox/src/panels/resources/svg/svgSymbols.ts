/**
 * The symbols of a drawing as avoid zones (#994). A map drawn as an SVG
 * carries its dots and icons as elements; `labelOverlap` compares labels
 * with the picture's `avoid` rectangles, so the elements an author names
 * (by an id prefix, or by a class) are measured once, in a browser, and
 * written as `avoid` zones in fractions of the picture. Nothing is read
 * again at layout time: the zones belong to the picture and serve every
 * edition, and an SVG that changes is read again to add its new symbols.
 */

import type { ResourceSafeArea } from 'postext';

/** Which elements are symbols: those whose `id` starts with `idPrefix`
 *  or whose `class` list holds `className`. */
export interface SymbolSelector {
  idPrefix?: string;
  className?: string;
}

/** One element of the drawing, measured on the picture as shown. */
export interface SvgNode {
  id: string;
  classes: readonly string[];
  /** Index of the parent in the list, -1 for the root. */
  parent: number;
  /** In a definition (`defs`, `clipPath`, `mask`, `symbol`, `pattern`,
   *  `marker`, `title`, `style`): not drawn where it stands. */
  hidden: boolean;
  /** Its box in px, from the picture's top-left corner. */
  box: { x: number; y: number; width: number; height: number };
}

/** A zone is never thinner than this (a fraction of the picture), the
 *  smallest a rectangle of the marks may be. */
const MIN_ZONE = 0.006;
const MAX_ZONES = 500;
const round = (n: number): number => Math.round(n * 10000) / 10000;

const matches = (n: SvgNode, sel: SymbolSelector): boolean =>
  (!!sel.idPrefix && n.id.startsWith(sel.idPrefix)) || (!!sel.className && n.classes.includes(sel.className));

/** The avoid zones of the elements `sel` names: the outermost match of
 *  each branch (a group named as a symbol is one zone, not one per shape
 *  in it), clamped to the picture and never thinner than {@link MIN_ZONE}. */
export function symbolZones(nodes: readonly SvgNode[], picture: { width: number; height: number }, sel: SymbolSelector): ResourceSafeArea[] {
  if (!(picture.width > 0) || !(picture.height > 0) || (!sel.idPrefix && !sel.className)) return [];
  const chosen = new Set<number>();
  const under = (i: number): boolean => {
    for (let p = nodes[i]!.parent; p >= 0; p = nodes[p]!.parent) if (chosen.has(p)) return true;
    return false;
  };
  const out: ResourceSafeArea[] = [];
  for (let i = 0; i < nodes.length && out.length < MAX_ZONES; i++) {
    const n = nodes[i]!;
    if (n.hidden || !matches(n, sel) || under(i)) continue;
    chosen.add(i);
    let x0 = n.box.x / picture.width;
    let y0 = n.box.y / picture.height;
    let w = n.box.width / picture.width;
    let h = n.box.height / picture.height;
    if (![x0, y0, w, h].every(Number.isFinite) || w < 0 || h < 0) continue;
    if (w < MIN_ZONE) { x0 -= (MIN_ZONE - w) / 2; w = MIN_ZONE; }
    if (h < MIN_ZONE) { y0 -= (MIN_ZONE - h) / 2; h = MIN_ZONE; }
    const x1 = Math.min(1, x0 + w);
    const y1 = Math.min(1, y0 + h);
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    if (x1 - x0 < MIN_ZONE / 2 || y1 - y0 < MIN_ZONE / 2) continue;
    out.push({ x: round(x0), y: round(y0), width: round(x1 - x0), height: round(y1 - y0) });
  }
  return out;
}

const area = (r: ResourceSafeArea): number => r.width * r.height;

/** Intersection over union of two rectangles. */
function overlapRatio(a: ResourceSafeArea, b: ResourceSafeArea): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (area(a) + area(b) - inter);
}

/** `existing` with the zones of `added` that it does not hold already
 *  (a zone that covers an old one by nine tenths is the same), and how
 *  many were new. Reading a drawing again adds only what is new. */
export function addZones(existing: readonly ResourceSafeArea[], added: readonly ResourceSafeArea[]): { zones: ResourceSafeArea[]; added: number } {
  const zones = existing.map((z) => ({ ...z }));
  let count = 0;
  for (const z of added) {
    if (zones.some((o) => overlapRatio(o, z) >= 0.9)) continue;
    zones.push({ ...z });
    count++;
  }
  return { zones, added: count };
}

const DEFINITION = new Set(['defs', 'clippath', 'mask', 'symbol', 'pattern', 'marker', 'title', 'desc', 'style', 'metadata', 'lineargradient', 'radialgradient', 'filter']);

/** The picture's size in px: its `viewBox`, else its `width` and `height`. */
function sizeOf(root: Element): { width: number; height: number } | undefined {
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) return { width: vb[2]!, height: vb[3]! };
  const w = parseFloat(root.getAttribute('width') ?? '');
  const h = parseFloat(root.getAttribute('height') ?? '');
  return w > 0 && h > 0 ? { width: w, height: h } : undefined;
}

/** Measure every element of an SVG as the browser draws it, at the size of
 *  its view box with the box stretched to fit (so fractions of that box
 *  are fractions of the picture), through all transforms. Undefined when
 *  `svgText` is not an SVG with a size. Needs a document. */
export function measureSvgNodes(svgText: string): { nodes: SvgNode[]; width: number; height: number } | undefined {
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') return undefined;
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const source = parsed.documentElement;
  if (!source || source.localName !== 'svg' || parsed.querySelector('parsererror')) return undefined;
  const size = sizeOf(source);
  if (!size) return undefined;
  const root = document.importNode(source, true) as unknown as SVGSVGElement;
  root.setAttribute('width', String(size.width));
  root.setAttribute('height', String(size.height));
  root.setAttribute('preserveAspectRatio', 'none');
  root.removeAttribute('style');
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${size.width}px;height:${size.height}px;overflow:hidden;visibility:hidden;pointer-events:none`;
  host.appendChild(root);
  document.body.appendChild(host);
  try {
    const origin = root.getBoundingClientRect();
    const nodes: SvgNode[] = [];
    const index = new Map<Element, number>();
    const walk = (el: Element, parent: number, hidden: boolean): void => {
      const here = hidden || DEFINITION.has(el.localName.toLowerCase());
      const r = el.getBoundingClientRect();
      index.set(el, nodes.length);
      nodes.push({
        id: el.getAttribute('id') ?? '',
        classes: (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean),
        parent,
        hidden: here,
        box: { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height },
      });
      const self = nodes.length - 1;
      for (const child of Array.from(el.children)) walk(child, self, here);
    };
    walk(root, -1, false);
    return { nodes, width: size.width, height: size.height };
  } finally {
    host.remove();
  }
}

/** The avoid zones of the symbols `sel` names in `svgText`; undefined when
 *  the text cannot be measured here. */
export function readSvgSymbols(svgText: string, sel: SymbolSelector): ResourceSafeArea[] | undefined {
  const m = measureSvgNodes(svgText);
  return m ? symbolZones(m.nodes, m, sel) : undefined;
}
