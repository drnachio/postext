/**
 * Special inks on a canvas (#1563, #1564): one hook on the painting
 * context instead of a check in every painter.
 *
 * Every painter of the backend sets `fillStyle` and `strokeStyle` before it
 * paints, so a setter defined on the context instance (over the one its
 * prototype has) sees every colour the page paints: text, rules, boxes,
 * bands, swatches, comic panels, composed decoration. The screen uses it to
 * leave a varnish out ({@link screenFinishPaints}); the finish mask to paint
 * each ink in its mask colour (`finishMask.ts`). Nothing is installed on a
 * page of a document without special inks.
 */

import type { VDTDocument } from '../vdt.js';
import { varnishHexes } from '../color/finishInks.js';

/** What a context's `fillStyle` or `strokeStyle` holds. */
export type PaintValue = string | CanvasGradient | CanvasPattern;

/** A paint that lays down nothing. */
export const NO_PAINT = 'rgba(0, 0, 0, 0)';

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;

const byte = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** A colour as an opaque `#rrggbb` (lower case) and its alpha (0..1), or
 *  `undefined` for what is not a hex or `rgb()` colour (a gradient, a
 *  pattern, a named colour). A short hex is widened. */
export function parsePaint(value: unknown): { hex: string; alpha: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  const h = HEX.exec(v);
  if (h) {
    let d = h[1]!.toLowerCase();
    if (d.length <= 4) d = [...d].map((c) => c + c).join('');
    return { hex: `#${d.slice(0, 6)}`, alpha: d.length === 8 ? parseInt(d.slice(6, 8), 16) / 255 : 1 };
  }
  const m = RGB.exec(v);
  if (!m) return undefined;
  const a = m[4];
  const alpha = a === undefined ? 1 : a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a);
  return { hex: `#${byte(Number(m[1]))}${byte(Number(m[2]))}${byte(Number(m[3]))}`, alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1 };
}

/** `rgba()` of a colour given as bytes, at `alpha`. */
export function rgbaPaint(r: number, g: number, b: number, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

type PaintProp = 'fillStyle' | 'strokeStyle';

function findDescriptor(obj: object | null, prop: string): PropertyDescriptor | undefined {
  for (let o = obj; o; o = Object.getPrototypeOf(o) as object | null) {
    const d = Object.getOwnPropertyDescriptor(o, prop);
    if (d) return d;
  }
  return undefined;
}

/** Route `prop` of `ctx` through `map`; returns what puts it back. A
 *  setter installed before (another hook) still runs, after `map`. */
function installPaint(ctx: object, prop: PaintProp, map: (value: PaintValue) => PaintValue): () => void {
  const own = Object.getOwnPropertyDescriptor(ctx, prop);
  const base = own ?? findDescriptor(Object.getPrototypeOf(ctx) as object | null, prop);
  let stored: unknown = base && 'value' in base ? base.value : undefined;
  const get = base?.get ? () => base.get!.call(ctx) as unknown : () => stored;
  const set = base?.set ? (v: unknown) => base.set!.call(ctx, v) : (v: unknown) => { stored = v; };
  Object.defineProperty(ctx, prop, {
    configurable: true,
    enumerable: true,
    get,
    set: (v: PaintValue) => set(map(v)),
  });
  return () => {
    if (!own) delete (ctx as Record<string, unknown>)[prop];
    else if ('value' in own) Object.defineProperty(ctx, prop, { ...own, value: stored });
    else Object.defineProperty(ctx, prop, own);
  };
}

/** Route the context's `fillStyle` and `strokeStyle` through `map` until
 *  the returned function is called. */
export function overridePaints(ctx: object, map: (value: PaintValue) => PaintValue): () => void {
  const undoFill = installPaint(ctx, 'fillStyle', map);
  const undoStroke = installPaint(ctx, 'strokeStyle', map);
  return () => {
    undoStroke();
    undoFill();
  };
}

/** How many finish masks are being painted: the screen rule stays off
 *  while one is, since the mask paints varnish on purpose. */
let maskPaints = 0;

/** Run `paint` with the screen rule off (a finish mask's own paint). */
export function withScreenFinishesOff<T>(paint: () => T): T {
  maskPaints++;
  try {
    return paint();
  } finally {
    maskPaints--;
  }
}

/**
 * The screen rule of special inks (#1563): a varnish puts no colour on the
 * page, so a paint in a varnish's hex is made transparent and what lies
 * under it shows. Returns what takes the hook off, or `undefined` when the
 * document has no varnish (no hook, no cost).
 */
export function screenFinishPaints(ctx: object, doc: Pick<VDTDocument, 'config' | 'printColors'>): (() => void) | undefined {
  if (maskPaints > 0) return undefined;
  const varnish = varnishHexes(doc);
  if (varnish.size === 0) return undefined;
  return overridePaints(ctx, (value) => {
    const p = parsePaint(value);
    return p && varnish.has(p.hex) ? NO_PAINT : value;
  });
}
