// TrueType outlines as SVG path data (#1444). Word's and LibreOffice's
// SVG renderers do not read an SVG's `@font-face` rules and do not
// reliably find the fonts a document embeds, so a display figure set in
// the book's face (an exam cover's '1863') came out in a thin fallback
// serif. The export draws such text as paths from the embedded face's
// own outlines instead.

import { readCmap } from '../fonts/cmap.js';
import { readGlyphs, readHmtx } from '../fonts/glyf.js';
import { readSfnt, view } from '../fonts/sfnt.js';
import type { VDTPathCommand } from '../../vdt/design.js';

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME = 0x10;
const Y_SAME = 0x20;

const ARG_1_AND_2_ARE_WORDS = 0x0001;
const ARGS_ARE_XY_VALUES = 0x0002;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

/** A point of a contour in font units. */
interface Pt {
  x: number;
  y: number;
  on: boolean;
}

/** A face read for outlining: its Unicode map, advances and outlines. */
export interface OutlineFace {
  unitsPerEm: number;
  /** Glyph id of a code point (undefined: the face lacks it). */
  glyph(cp: number): number | undefined;
  advance(gid: number): number;
  /** The glyph's contours in font units (y up). */
  contours(gid: number): Pt[][];
}

const F2DOT14 = (v: number): number => v / 16384;

/** The contours of a simple glyph. */
function simpleContours(g: Uint8Array, count: number): Pt[][] {
  const v = view(g);
  const ends: number[] = [];
  for (let i = 0; i < count; i++) ends.push(v.getUint16(10 + i * 2));
  const n = (ends[count - 1] ?? -1) + 1;
  let at = 10 + count * 2;
  at += 2 + v.getUint16(at);
  const flags: number[] = [];
  while (flags.length < n) {
    const f = g[at++]!;
    flags.push(f);
    if (f & REPEAT) {
      let r = g[at++]!;
      while (r-- > 0) flags.push(f);
    }
  }
  const xs: number[] = [];
  let x = 0;
  for (const f of flags) {
    if (f & X_SHORT) x += f & X_SAME ? g[at++]! : -g[at++]!;
    else if (!(f & X_SAME)) {
      x += v.getInt16(at);
      at += 2;
    }
    xs.push(x);
  }
  const out: Pt[][] = [];
  let y = 0;
  let contour: Pt[] = [];
  flags.forEach((f, i) => {
    if (f & Y_SHORT) y += f & Y_SAME ? g[at++]! : -g[at++]!;
    else if (!(f & Y_SAME)) {
      y += v.getInt16(at);
      at += 2;
    }
    contour.push({ x: xs[i]!, y, on: (f & ON_CURVE) !== 0 });
    if (i === ends[out.length]) {
      out.push(contour);
      contour = [];
    }
  });
  return out;
}

/** Read a TrueType face for outlining (undefined: CFF or unreadable). */
export function readOutlineFace(bytes: Uint8Array): OutlineFace | undefined {
  const font = readSfnt(bytes);
  const t = font?.tables;
  const head = t?.get('head');
  const maxp = t?.get('maxp');
  const hhea = t?.get('hhea');
  const loca = t?.get('loca');
  const glyf = t?.get('glyf');
  const hmtx = t?.get('hmtx');
  if (!t || !head || !maxp || !hhea || !loca || !glyf || !hmtx) return undefined;
  const numGlyphs = view(maxp).getUint16(4);
  const glyphs = readGlyphs(loca, glyf, numGlyphs, view(head).getInt16(50) === 1);
  const metrics = readHmtx(hmtx, view(hhea).getUint16(34), numGlyphs);
  const cmap = readCmap(t.get('cmap'));
  const cache = new Map<number, Pt[][]>();
  const contours = (gid: number, depth = 0): Pt[][] => {
    const hit = cache.get(gid);
    if (hit) return hit;
    const g = glyphs[gid];
    let out: Pt[][] = [];
    if (g && g.byteLength >= 10 && depth < 8) {
      try {
        const count = view(g).getInt16(0);
        out = count >= 0 ? simpleContours(g, count) : compositeContours(g, (c) => contours(c, depth + 1));
      } catch {
        out = [];
      }
    }
    cache.set(gid, out);
    return out;
  };
  return {
    unitsPerEm: view(head).getUint16(18) || 1000,
    glyph: (cp) => cmap.get(cp),
    advance: (gid) => metrics[gid]?.[0] ?? 0,
    contours: (gid) => contours(gid),
  };
}

/** The contours of a composite glyph: its components moved and scaled. */
function compositeContours(g: Uint8Array, part: (gid: number) => Pt[][]): Pt[][] {
  const v = view(g);
  const out: Pt[][] = [];
  let at = 10;
  for (;;) {
    const flags = v.getUint16(at);
    const gid = v.getUint16(at + 2);
    at += 4;
    let dx = 0;
    let dy = 0;
    if (flags & ARG_1_AND_2_ARE_WORDS) {
      dx = v.getInt16(at);
      dy = v.getInt16(at + 2);
      at += 4;
    } else {
      dx = v.getInt8(at);
      dy = v.getInt8(at + 1);
      at += 2;
    }
    // Point-matched components (args are point numbers) are rare in
    // text faces: they are placed unmoved.
    if (!(flags & ARGS_ARE_XY_VALUES)) dx = dy = 0;
    let [a, b, c, d] = [1, 0, 0, 1];
    if (flags & WE_HAVE_A_SCALE) {
      a = d = F2DOT14(v.getInt16(at));
      at += 2;
    } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
      a = F2DOT14(v.getInt16(at));
      d = F2DOT14(v.getInt16(at + 2));
      at += 4;
    } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
      a = F2DOT14(v.getInt16(at));
      b = F2DOT14(v.getInt16(at + 2));
      c = F2DOT14(v.getInt16(at + 4));
      d = F2DOT14(v.getInt16(at + 6));
      at += 8;
    }
    for (const contour of part(gid)) out.push(contour.map((p) => ({ x: a * p.x + c * p.y + dx, y: b * p.x + d * p.y + dy, on: p.on })));
    if (!(flags & MORE_COMPONENTS)) break;
  }
  return out;
}

const num = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Contours as path commands, each point mapped by `map`: quadratic
 *  B-splines with implied on-curve midpoints, as TrueType draws them. */
export function contourCommands(contours: Pt[][], map: (x: number, y: number) => [number, number]): VDTPathCommand[][] {
  const out: VDTPathCommand[][] = [];
  for (const raw of contours) {
    if (raw.length < 2) continue;
    const pts = raw.map((p) => {
      const [x, y] = map(p.x, p.y);
      return { x, y, on: p.on };
    });
    // Start on an on-curve point (or the midpoint of two off-curve ones).
    const first = pts.findIndex((p) => p.on);
    const last = pts[pts.length - 1]!;
    const ring = first >= 0 ? [...pts.slice(first), ...pts.slice(0, first)] : [{ x: (last.x + pts[0]!.x) / 2, y: (last.y + pts[0]!.y) / 2, on: true }, ...pts];
    const cmds: VDTPathCommand[] = [{ op: 'M', x: ring[0]!.x, y: ring[0]!.y }];
    let ctrl: { x: number; y: number } | undefined;
    for (let i = 1; i <= ring.length; i++) {
      const p = i === ring.length ? { ...ring[0]!, on: true } : ring[i]!;
      if (p.on) {
        cmds.push(ctrl ? { op: 'Q', x1: ctrl.x, y1: ctrl.y, x: p.x, y: p.y } : { op: 'L', x: p.x, y: p.y });
        ctrl = undefined;
      } else if (ctrl) {
        cmds.push({ op: 'Q', x1: ctrl.x, y1: ctrl.y, x: (ctrl.x + p.x) / 2, y: (ctrl.y + p.y) / 2 });
        ctrl = p;
      } else ctrl = p;
    }
    cmds.push({ op: 'Z' });
    out.push(cmds);
  }
  return out;
}

/** SVG path data of contours (see {@link contourCommands}). */
export function contoursPath(contours: Pt[][], map: (x: number, y: number) => [number, number]): string {
  let d = '';
  for (const sp of contourCommands(contours, map)) {
    for (const c of sp) {
      if (c.op === 'M' || c.op === 'L') d += `${c.op}${num(c.x)} ${num(c.y)}`;
      else if (c.op === 'Q') d += `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`;
      else if (c.op === 'C') d += `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`;
      else d += 'Z';
    }
  }
  return d;
}
