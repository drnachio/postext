/**
 * Editing a shape's nodes on the cover's canvas: moving a node (its
 * handles with it) or one of its handles, curving a corner or
 * straightening a curve, adding a node halfway along a side, deleting one,
 * and fitting the element's box to the path again afterwards. Points are
 * in fractions of the element's box, as the path keeps them.
 */

import { coverPathBounds, type CoverPath, type CoverPathNode, type CoverPoint, type SheetRect } from 'postext';

/** Which node: its subpath and its place in it. */
export interface NodeRef {
  sub: number;
  i: number;
}

const clone = (path: CoverPath): CoverPath => path.map((s) => ({ closed: s.closed, nodes: s.nodes.map((n) => ({ ...n, ...(n.in ? { in: { ...n.in } } : {}), ...(n.out ? { out: { ...n.out } } : {}) })) }));

const add = (p: CoverPoint, d: CoverPoint): CoverPoint => ({ x: p.x + d.x, y: p.y + d.y });

/** The node moved by `d`, its handles with it. */
export function moveNode(path: CoverPath, at: NodeRef, d: CoverPoint): CoverPath {
  const out = clone(path);
  const n = out[at.sub]?.nodes[at.i];
  if (!n) return path;
  n.x += d.x;
  n.y += d.y;
  if (n.in) n.in = add(n.in, d);
  if (n.out) n.out = add(n.out, d);
  return out;
}

/** One of a node's handles put at `p`; with `smooth`, the other turns to
 *  stay in line with it, at its own length. */
export function moveHandle(path: CoverPath, at: NodeRef, which: 'in' | 'out', p: CoverPoint, smooth: boolean): CoverPath {
  const out = clone(path);
  const n = out[at.sub]?.nodes[at.i];
  if (!n) return path;
  n[which] = { x: p.x, y: p.y };
  const other = which === 'in' ? 'out' : 'in';
  const o = n[other];
  if (smooth && o) {
    const len = Math.hypot(o.x - n.x, o.y - n.y);
    const dx = n.x - p.x;
    const dy = n.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    n[other] = { x: n.x + (dx / d) * len, y: n.y + (dy / d) * len };
  }
  return out;
}

/** A corner made a curve (handles along the line through its neighbours,
 *  a third of the way to each), or a curve made a corner. */
export function toggleCurve(path: CoverPath, at: NodeRef): CoverPath {
  const out = clone(path);
  const sub = out[at.sub];
  const n = sub?.nodes[at.i];
  if (!sub || !n) return path;
  if (n.in || n.out) {
    delete n.in;
    delete n.out;
    return out;
  }
  const len = sub.nodes.length;
  const prev = sub.nodes[(at.i - 1 + len) % len]!;
  const next = sub.nodes[(at.i + 1) % len]!;
  const first = !sub.closed && at.i === 0;
  const last = !sub.closed && at.i === len - 1;
  const a = first ? n : prev;
  const b = last ? n : next;
  const t = { x: (b.x - a.x) / 6, y: (b.y - a.y) / 6 };
  if (!first) n.in = { x: n.x - t.x, y: n.y - t.y };
  if (!last) n.out = { x: n.x + t.x, y: n.y + t.y };
  return out;
}

/** The side that leaves node `at`, split at its middle by a new node (a
 *  curve split so its shape stays). */
export function insertNode(path: CoverPath, at: NodeRef): CoverPath {
  const out = clone(path);
  const sub = out[at.sub];
  if (!sub) return path;
  const len = sub.nodes.length;
  if (!sub.closed && at.i >= len - 1) return path;
  const a = sub.nodes[at.i]!;
  const b = sub.nodes[(at.i + 1) % len]!;
  const mid = (p: CoverPoint, q: CoverPoint): CoverPoint => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  let node: CoverPathNode;
  if (!a.out && !b.in) {
    node = mid(a, b);
  } else {
    // De Casteljau at t = 1/2.
    const p1 = a.out ?? a;
    const p2 = b.in ?? b;
    const q0 = mid(a, p1);
    const q1 = mid(p1, p2);
    const q2 = mid(p2, b);
    const r0 = mid(q0, q1);
    const r1 = mid(q1, q2);
    node = { ...mid(r0, r1), in: r0, out: r1 };
    if (a.out) a.out = q0;
    if (b.in) b.in = q2;
  }
  sub.nodes.splice(at.i + 1, 0, node);
  return out;
}

/** The node taken out, while its subpath keeps enough to be a shape
 *  (three nodes closed, two open). */
export function deleteNode(path: CoverPath, at: NodeRef): CoverPath {
  const sub = path[at.sub];
  if (!sub || sub.nodes.length <= (sub.closed ? 3 : 2)) return path;
  const out = clone(path);
  out[at.sub]!.nodes.splice(at.i, 1);
  return out;
}

/** The middle of the side that leaves each node (where a click adds one),
 *  in fractions. */
export function sideMiddles(path: CoverPath): (NodeRef & CoverPoint)[] {
  const out: (NodeRef & CoverPoint)[] = [];
  path.forEach((sub, s) => {
    const len = sub.nodes.length;
    for (let i = 0; i < (sub.closed ? len : len - 1); i++) {
      const a = sub.nodes[i]!;
      const b = sub.nodes[(i + 1) % len]!;
      if (!a.out && !b.in) {
        out.push({ sub: s, i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        continue;
      }
      const p1 = a.out ?? a;
      const p2 = b.in ?? b;
      out.push({ sub: s, i, x: (a.x + 3 * p1.x + 3 * p2.x + b.x) / 8, y: (a.y + 3 * p1.y + 3 * p2.y + b.y) / 8 });
    }
  });
  return out;
}

/** The element's box fitted to its path again (after its points moved
 *  out of it or away from its edges), and the path in fractions of the
 *  new box. `rect` is the box on the sheet, mm. A line (no height or no
 *  width) keeps a sliver of box so it stays a box. */
export function refitPath(rect: SheetRect, path: CoverPath): { rect: SheetRect; path: CoverPath } {
  const b = coverPathBounds(path);
  if (!b) return { rect, path };
  const MIN = 0.5;
  const w = Math.max(b.width * rect.width, MIN);
  const h = Math.max(b.height * rect.height, MIN);
  const x = rect.x + b.x * rect.width - (w - b.width * rect.width) / 2;
  const y = rect.y + b.y * rect.height - (h - b.height * rect.height) / 2;
  const map = (p: CoverPoint): CoverPoint => ({
    x: Math.round((((rect.x + p.x * rect.width) - x) / w) * 10000) / 10000,
    y: Math.round((((rect.y + p.y * rect.height) - y) / h) * 10000) / 10000,
  });
  const out: CoverPath = path.map((s) => ({
    closed: s.closed,
    nodes: s.nodes.map((n) => ({ ...map(n), ...(n.in ? { in: map(n.in) } : {}), ...(n.out ? { out: map(n.out) } : {}) })),
  }));
  return { rect: { x, y, width: w, height: h }, path: out };
}

/** A traced outline as a path of corners, so its points can be moved. */
export function outlineAsPath(outline: readonly { x: number; y: number }[][]): CoverPath {
  return outline.map((poly) => ({ closed: true, nodes: poly.map((p) => ({ x: p.x, y: p.y })) }));
}
