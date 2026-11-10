// Reading an element's own attributes and `<Properties>`, and the small
// value shapes IDML repeats: paths, lists, boxes.

import { child, children, isElement, localName, num, textOf, type XmlElement } from '../xml/read.js';
import type { Props } from '../model/document.js';
import type { Path, Point } from '../model/geometry.js';

export function propsOf(el: XmlElement): Props {
  const properties: Record<string, XmlElement> = {};
  for (const p of children(child(el, 'Properties'))) properties[localName(p.name)] = p;
  return { attrs: el.attrs, properties };
}

const point = (s: string | undefined): Point | undefined => {
  if (!s) return undefined;
  const [x, y] = s.trim().split(/\s+/).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x!, y: y! } : undefined;
};

/** `<PathGeometry>` of an element's properties (or of `holder` itself). */
export function pathsOf(holder: XmlElement | undefined): Path[] {
  const geometry = holder && localName(holder.name) === 'PathGeometry' ? holder : child(child(holder, 'Properties'), 'PathGeometry');
  const out: Path[] = [];
  for (const g of children(geometry, 'GeometryPathType')) {
    const points = [];
    for (const p of children(child(g, 'PathPointArray'), 'PathPointType')) {
      const anchor = point(p.attrs.Anchor);
      if (!anchor) continue;
      points.push({ anchor, left: point(p.attrs.LeftDirection) ?? anchor, right: point(p.attrs.RightDirection) ?? anchor });
    }
    if (points.length) out.push({ open: g.attrs.PathOpen === 'true', points });
  }
  return out;
}

/** A property written as `<Name type="list"><ListItem>…</ListItem></Name>`,
 *  as numbers. */
export function listNumbers(prop: XmlElement | undefined): number[] | undefined {
  if (!prop) return undefined;
  const out = children(prop, 'ListItem').map((i) => Number(textOf(i)));
  return out.length && out.every(Number.isFinite) ? out : undefined;
}

/** A property's text (`<AppliedFont type="string">Minion Pro</AppliedFont>`). */
export const propText = (p: Props, name: string): string | undefined => {
  const el = p.properties[name];
  return el ? textOf(el) : undefined;
};

/** A property's number (`<Leading type="unit">14</Leading>`); undefined
 *  for an enumeration (`Auto`). */
export function propNumber(p: Props, name: string): number | undefined {
  const el = p.properties[name];
  if (!el || el.attrs.type === 'enumeration') return undefined;
  const n = Number(textOf(el));
  return Number.isFinite(n) ? n : undefined;
}

/** Four edges written as attributes of a child (`Top`, `Left`, `Bottom`,
 *  `Right`), in that order. */
export function edges(el: XmlElement | undefined): [number, number, number, number] {
  return [num(el, 'Top') ?? 0, num(el, 'Left') ?? 0, num(el, 'Bottom') ?? 0, num(el, 'Right') ?? 0];
}

/** Elements under `el`, depth first, that `match`; does not descend into
 *  those it yields. */
export function findAll(el: XmlElement, match: (e: XmlElement) => boolean, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (!isElement(c)) continue;
    if (match(c)) out.push(c);
    else findAll(c, match, out);
  }
  return out;
}
