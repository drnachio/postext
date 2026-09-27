import type { MathRender, MathPath, MathViewBox } from './types';
import type { MathJaxConverter } from './mathjax';
import {
  IDENTITY,
  multiply,
  parseSvgTransform,
  transformPath,
  type AffineMatrix,
} from './pathTransform';

// ---------------------------------------------------------------------------
// MathJax singleton — lazy init, liteAdaptor so it runs in any environment
// ---------------------------------------------------------------------------

let handle: MathJaxConverter | null = null;
let initPromise: Promise<void> | null = null;
const initListeners = new Set<() => void>();
let warnedWithoutEngine = false;

export function isMathReady(): boolean {
  return handle !== null;
}

export function onMathReady(fn: () => void): () => void {
  if (handle !== null) {
    fn();
    return () => {};
  }
  initListeners.add(fn);
  return () => { initListeners.delete(fn); };
}

/**
 * Load MathJax and start the TeX → SVG converter. Await it before laying
 * out a document with `$…$` / `$$…$$` on the main thread (the layout worker
 * calls it itself): until it resolves, every formula is set as a grey
 * placeholder box. Idempotent; a failed start can be retried.
 */
export async function initMathEngine(): Promise<void> {
  if (handle !== null) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Dynamically import so the ~1.8 MB MathJax bundle is only paid for on
    // documents that actually contain math. The module holds every MathJax
    // piece the engine uses and ships pre-bundled (see ./mathjax.ts).
    try {
      const { createMathJaxConverter } = await import('./mathjax');
      handle = createMathJaxConverter();
    } catch (err) {
      initPromise = null;
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`[postext] the math engine failed to start: ${reason}`, { cause: err });
    }
    for (const fn of initListeners) fn();
    initListeners.clear();
  })();
  return initPromise;
}

/**
 * Called when the layout sets a formula with no engine running, so it gets a
 * grey placeholder box. Warns once, and only when nobody asked for the
 * engine: a host that lays out now and again from `onMathReady` has
 * `initMathEngine` in flight and expects the placeholders.
 */
export function noteMathWithoutEngine(): void {
  if (handle !== null || initPromise !== null || warnedWithoutEngine) return;
  warnedWithoutEngine = true;
  console.warn(
    '[postext] This document contains math, but the math engine is not running, so every formula is laid out as a grey placeholder box. '
    + 'Call `await initMathEngine()` before `buildDocument` (the layout worker does it for you).',
  );
}

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

/** A formula whose box follows its measure (an equation number, `\tag`):
 *  MathJax's markup is converted once and sized per measure. */
interface FullWidthEntry {
  kind: 'fullWidth';
  svgOnly: string;
  error?: string;
  exPx: number;
  byWidth: Map<number, MathRender>;
}

const MAX_CACHE = 512;
/** Measures kept per full-width formula (a book sets them in a handful). */
const MAX_WIDTHS = 8;
const cache = new Map<string, MathRender | FullWidthEntry>();

function cacheKey(tex: string, displayMode: boolean, fontSizePx: number, lineBoxPx: number): string {
  return `${displayMode ? 'D' : 'I'}|${fontSizePx}|${lineBoxPx}|${tex}`;
}

function cacheGet(key: string): MathRender | FullWidthEntry | undefined {
  const v = cache.get(key);
  if (v) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

function cacheSet(key: string, v: MathRender | FullWidthEntry): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, v);
  if (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

// ---------------------------------------------------------------------------
// SVG parsing (regex-based — liteAdaptor's output is well-formed and small)
// ---------------------------------------------------------------------------

interface ParsedSvg {
  viewBox: MathViewBox;
  widthPx: number;
  heightPx: number;
  /** Below the baseline, in px (MathJax's negated `vertical-align`). */
  depthPx: number;
  paths: MathPath[];
  /** MathJax's `<text>` elements (characters outside its TeX fonts, such as
   *  the "ó" of `\text{ecuación}`), re-serialised with their whole
   *  transform in the root's user space. Only the flattened HTML markup of a
   *  full-width formula uses them: canvas and PDF paint the paths. */
  texts: string[];
}

const EX_RE = /^\s*(-?\d*\.?\d+)ex\s*$/;
const PERCENT_RE = /^\s*(-?\d*\.?\d+)%\s*$/;

function parseExValue(attr: string | undefined): number | null {
  if (!attr) return null;
  const m = EX_RE.exec(attr);
  return m ? Number(m[1]) : null;
}

function parseStyleEx(style: string | undefined, property: string): number | null {
  if (!style) return null;
  const m = new RegExp(`(?:^|;)\\s*${property}:\\s*(-?\\d*\\.?\\d+)ex`).exec(style);
  return m ? Number(m[1]) : null;
}

/** A length of a nested `<svg>`'s viewport, in the user units of the
 *  viewport it sits in (`ref` for a percentage); undefined when absent or
 *  in a unit the flattener does not follow. */
function viewportLength(attr: string | undefined, ref: number): number | undefined {
  if (attr === undefined) return undefined;
  const pct = PERCENT_RE.exec(attr);
  if (pct) return (Number(pct[1]) / 100) * ref;
  const m = /^\s*(-?\d*\.?\d+)(px)?\s*$/.exec(attr);
  return m ? Number(m[1]) : undefined;
}

/** The transform a nested `<svg>` establishes: its viewBox fitted into its
 *  viewport under `preserveAspectRatio` (SVG 1.1 §7.8). MathJax sets the
 *  equation and its number in such viewports — a 1-unit-wide viewBox
 *  centred (`xMidYMid`) or pushed to the right edge (`xMaxYMid`) of a
 *  full-width box. */
function viewportMatrix(
  viewBox: readonly number[],
  x: number,
  y: number,
  width: number,
  height: number,
  preserveAspectRatio: string | undefined,
): AffineMatrix {
  const [vx = 0, vy = 0, vw = 0, vh = 0] = viewBox;
  if (!(vw > 0) || !(vh > 0)) return [1, 0, 0, 1, x, y];
  const [align = 'xMidYMid', meetOrSlice = 'meet'] = (preserveAspectRatio ?? '').trim().split(/\s+/).filter(Boolean);
  let sx = width / vw;
  let sy = height / vh;
  let tx = x;
  let ty = y;
  if (align !== 'none') {
    const s = meetOrSlice === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = s;
    sy = s;
    const ax = align.slice(0, 4);
    const ay = align.slice(4, 8);
    if (ax === 'xMid') tx += (width - vw * s) / 2;
    else if (ax === 'xMax') tx += width - vw * s;
    if (ay === 'YMid') ty += (height - vh * s) / 2;
    else if (ay === 'YMax') ty += height - vh * s;
  }
  return [sx, 0, 0, sy, tx - vx * sx, ty - vy * sy];
}

const ATTR_RE = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;

function readAttrs(tagText: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tagText)) !== null) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

/** Whether MathJax sized the formula's box by its container (an equation
 *  with a number: `width="100%"`) instead of in `ex`. */
function isFullWidthSvg(svgMarkup: string): boolean {
  const svgOpen = /<svg\b([^>]*)>/.exec(svgMarkup);
  return !!svgOpen && PERCENT_RE.test(readAttrs(svgOpen[1]!)['width'] ?? '');
}

/**
 * Flatten MathJax's SVG into paths and size it in px. `exPx` is one `ex`
 * of MathJax's sizes in px — the TeX font's x-height at the formula's
 * size. A full-width box (an equation with a number) is set
 * `measurePx` wide (never narrower than MathJax's `min-width`): its paths
 * come out in px of that box, the equation and its number placed where a
 * browser would draw them. Returns null when the markup has no `<svg>`, or
 * a size in a form the flattener does not read.
 */
function parseSvg(svgMarkup: string, exPx: number, measurePx: number | undefined): ParsedSvg | null {
  // Root <svg>
  const svgOpen = /<svg\b([^>]*)>/.exec(svgMarkup);
  if (!svgOpen) return null;
  const rootAttrs = readAttrs(svgOpen[1]!);
  const widthAttr = rootAttrs['width'];
  const heightEx = parseExValue(rootAttrs['height']) ?? 0;
  const depthPx = -(parseStyleEx(rootAttrs['style'], 'vertical-align') ?? 0) * exPx;
  const heightPx = heightEx * exPx;

  let viewBox: MathViewBox;
  let widthPx: number;
  const fullWidth = PERCENT_RE.exec(widthAttr ?? '');
  if (fullWidth) {
    // No viewBox: user units are px of the box, whose width follows the
    // measure (MathJax scales its internal units down to px itself).
    const minWidthPx = (parseStyleEx(rootAttrs['style'], 'min-width') ?? 0) * exPx;
    const share = (Number(fullWidth[1]) / 100) * (measurePx ?? 0);
    widthPx = Math.max(minWidthPx, share);
    viewBox = { minX: 0, minY: 0, width: widthPx, height: heightPx };
  } else {
    const widthEx = parseExValue(widthAttr);
    // An empty formula is `width="0"`; anything else unread would set a
    // formula of no width (it would vanish from the page).
    if (widthEx === null && widthAttr !== undefined && widthAttr.trim() !== '0') return null;
    widthPx = (widthEx ?? 0) * exPx;
    const vb = rootAttrs['viewBox']?.split(/\s+/).map(Number) ?? [0, 0, 0, 0];
    viewBox = { minX: vb[0]!, minY: vb[1]!, width: vb[2]!, height: vb[3]! };
  }

  const defs = new Map<string, string>();
  // Collect defs: <path id="..." d="..."/>
  const defsBlock = /<defs\b[^>]*>([\s\S]*?)<\/defs>/.exec(svgMarkup);
  if (defsBlock) {
    const inner = defsBlock[1]!;
    const pathRe = /<path\b([^>]*)\/?>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pathRe.exec(inner)) !== null) {
      const a = readAttrs(pm[1]!);
      if (a['id'] && a['d']) defs.set(a['id']!, a['d']!);
    }
  }

  // Walk the tree with a transform stack, ignoring the <defs> block.
  const bodyStart = defsBlock ? defsBlock.index + defsBlock[0].length : svgOpen.index + svgOpen[0].length;
  const body = svgMarkup.slice(bodyStart, svgMarkup.lastIndexOf('</svg>'));

  const paths: MathPath[] = [];
  const texts: string[] = [];
  interface Frame { matrix: AffineMatrix; fill: string; stroke: string; tag: string }
  const stack: Frame[] = [
    { matrix: IDENTITY, fill: 'currentColor', stroke: 'currentColor', tag: '__root__' },
  ];

  // Tokenise into start/end/self-closing tags plus text runs.
  const tagRe = /<(\/?)(\w+)([^>]*?)(\/?)>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(body)) !== null) {
    const [, closing, name, attrText, selfClose] = tm;
    if (closing) {
      // Only pop if the most recently pushed frame was for this tag —
      // leaves like <use> and <path> share closing tags but never pushed.
      if (stack.length > 1 && stack[stack.length - 1]!.tag === name) stack.pop();
      continue;
    }
    const attrs = readAttrs(attrText!);
    const parent = stack[stack.length - 1]!;
    let ctm = parent.matrix;
    if (attrs['transform']) ctm = multiply(ctm, parseSvgTransform(attrs['transform']));
    const fill = attrs['fill'] ?? parent.fill;
    const stroke = attrs['stroke'] ?? parent.stroke;

    if (name === 'svg') {
      // A nested viewport (MathJax's equation / number boxes): its
      // percentages refer to the outer box, and its viewBox is fitted in.
      const x = viewportLength(attrs['x'], viewBox.width) ?? 0;
      const y = viewportLength(attrs['y'], viewBox.height) ?? 0;
      const w = viewportLength(attrs['width'], viewBox.width) ?? viewBox.width;
      const h = viewportLength(attrs['height'], viewBox.height) ?? viewBox.height;
      const vb = attrs['viewBox']?.trim().split(/[\s,]+/).map(Number);
      ctm = multiply(ctm, vb && vb.length === 4 && vb.every(Number.isFinite)
        ? viewportMatrix(vb, x, y, w, h, attrs['preserveAspectRatio'])
        : [1, 0, 0, 1, x, y]);
    } else if (name === 'path' && attrs['d']) {
      const dOut = transformPath(attrs['d']!, ctm);
      paths.push({ d: dOut, fill });
    } else if (name === 'use') {
      const ref = attrs['xlink:href'] ?? attrs['href'] ?? '';
      const id = ref.startsWith('#') ? ref.slice(1) : ref;
      const dRaw = defs.get(id);
      if (dRaw) {
        const dOut = transformPath(dRaw, ctm);
        paths.push({ d: dOut, fill });
      }
    } else if (name === 'text' && !selfClose) {
      // A character MathJax sets as text, not as a glyph path: keep it,
      // with its transform flattened like a path's.
      const close = body.indexOf('</text>', tagRe.lastIndex);
      if (close >= 0) {
        const content = body.slice(tagRe.lastIndex, close);
        tagRe.lastIndex = close + '</text>'.length;
        const kept = Object.entries(attrs)
          .filter(([k]) => k !== 'transform' && k !== 'fill')
          .map(([k, v]) => ` ${k}="${v}"`)
          .join('');
        const matrix = ctm.map((v) => +v.toFixed(4)).join(' ');
        texts.push(`<text transform="matrix(${matrix})" fill="${fill}"${kept}>${content}</text>`);
      }
      continue;
    } else if (name === 'rect') {
      // MathJax emits <rect> for fraction bars, sqrt bars, etc.
      const x = Number(attrs['x'] ?? 0);
      const y = Number(attrs['y'] ?? 0);
      const w = Number(attrs['width'] ?? 0);
      const h = Number(attrs['height'] ?? 0);
      if (w > 0 && h > 0) {
        const rectPath = `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;
        const dOut = transformPath(rectPath, ctm);
        paths.push({ d: dOut, fill: fill === 'none' ? (stroke !== 'none' ? stroke : fill) : fill });
      }
    }

    if (!selfClose && (name === 'g' || name === 'svg')) {
      stack.push({ matrix: ctm, fill, stroke, tag: name });
    }
  }

  return { viewBox, widthPx, heightPx, depthPx, paths, texts };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Body line-box in px. Inline math is scaled down to fit. Display math
   *  is not clamped. */
  lineBoxPx?: number;
  /** Override the default colour (MathJax emits "currentColor" which is a
   *  CSS construct; we substitute here so the SVG is self-contained). */
  color?: string;
  /** Display math: the width of the measure the formula is set in, in px.
   *  A numbered equation (`\tag{…}`) takes this width, the equation
   *  centred and its number flush right; without it, it takes the least
   *  width that holds both. Other formulas keep their own width. */
  containerWidthPx?: number;
}

function errorRender(tex: string, displayMode: boolean, fontSizePx: number, message: string): MathRender {
  // Tiny red box so the error is still spatially present on the page.
  const widthPx = Math.max(8, fontSizePx * 0.8);
  const heightPx = fontSizePx;
  return {
    tex,
    displayMode,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${widthPx}" height="${heightPx}"><rect x="0" y="0" width="10" height="10" fill="#c62828" opacity="0.15"/><rect x="0" y="0" width="10" height="10" fill="none" stroke="#c62828" stroke-width="0.5"/></svg>`,
    paths: [
      { d: 'M0 0L10 0L10 10L0 10Z', fill: '#c6282826' },
    ],
    viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
    widthPx,
    heightPx,
    ascentPx: heightPx * 0.75,
    depthPx: heightPx * 0.25,
    scale: 1,
    error: message,
  };
}

/** Size MathJax's markup at `exPx` per ex (in `measurePx` for a full-width
 *  box) into a render. */
function sizeRender(
  tex: string,
  displayMode: boolean,
  fontSizePx: number,
  svgOnly: string,
  error: string | undefined,
  exPx: number,
  lineBoxPx: number,
  measurePx: number | undefined,
): MathRender {
  const parsed = parseSvg(svgOnly, exPx, measurePx);
  if (!parsed) return errorRender(tex, displayMode, fontSizePx, 'Could not parse MathJax SVG output');

  let widthPx = parsed.widthPx;
  let heightPx = parsed.heightPx;
  // vertical-align is negative when the depth extends below baseline.
  let ascentPx = heightPx - parsed.depthPx;
  let scale = 1;

  // Inline scale-down: keep the grid intact even if the formula is tall.
  if (!displayMode && heightPx > lineBoxPx && lineBoxPx > 0) {
    scale = lineBoxPx / heightPx;
    widthPx *= scale;
    heightPx *= scale;
    ascentPx *= scale;
    // depth scales too
  }

  // Keep paths color-agnostic — backends substitute `currentColor` at paint
  // time (see canvas-backend / html-backend). Baking `options.color` into
  // the cached render would make the LRU cache miss every time the user
  // tweaks the math or body colour, which we want to avoid.
  const resolvedPaths: MathPath[] = parsed.paths.map((p) => ({
    d: p.d,
    fill: p.fill,
  }));

  const svgSerialized = isFullWidthSvg(svgOnly)
    ? serializePaths(parsed.viewBox, resolvedPaths, parsed.texts, widthPx, heightPx)
    : serializeForHtml(parsed.viewBox, svgOnly, widthPx, heightPx);

  return {
    tex,
    displayMode,
    svg: svgSerialized,
    paths: resolvedPaths,
    viewBox: parsed.viewBox,
    widthPx,
    heightPx,
    ascentPx,
    depthPx: heightPx - ascentPx,
    scale,
    ...(error ? { error } : {}),
  };
}

/** A full-width render at `measurePx`, from its cache entry. */
function fullWidthRender(
  entry: FullWidthEntry,
  tex: string,
  displayMode: boolean,
  fontSizePx: number,
  lineBoxPx: number,
  measurePx: number | undefined,
): MathRender {
  const w = measurePx !== undefined && measurePx > 0 ? measurePx : 0;
  const hit = entry.byWidth.get(w);
  if (hit) return hit;
  const r = sizeRender(tex, displayMode, fontSizePx, entry.svgOnly, entry.error, entry.exPx, lineBoxPx, w > 0 ? w : undefined);
  entry.byWidth.set(w, r);
  if (entry.byWidth.size > MAX_WIDTHS) {
    const first = entry.byWidth.keys().next().value;
    if (first !== undefined) entry.byWidth.delete(first);
  }
  return r;
}

/**
 * Typeset TeX as SVG at `fontSizePx`: one em of the formula is
 * `fontSizePx` (MathJax sizes in `ex`, the TeX font's x-height, 0.442 em).
 * Cached; before {@link initMathEngine} resolves it returns a placeholder
 * box instead (not cached).
 */
export function renderMath(
  tex: string,
  displayMode: boolean,
  fontSizePx: number,
  options: RenderOptions = {},
): MathRender {
  const lineBoxPx = options.lineBoxPx ?? Number.POSITIVE_INFINITY;
  const lineBoxKey = lineBoxPx === Number.POSITIVE_INFINITY ? 0 : lineBoxPx;
  const key = cacheKey(tex, displayMode, fontSizePx, lineBoxKey);
  const cached = cacheGet(key);
  if (cached) {
    return 'kind' in cached
      ? fullWidthRender(cached, tex, displayMode, fontSizePx, lineBoxKey, options.containerWidthPx)
      : cached;
  }

  if (!handle) {
    noteMathWithoutEngine();
    const r = placeholderRender(tex, displayMode, fontSizePx);
    // Do NOT cache the placeholder — we want the real render to replace it.
    return r;
  }

  // One ex of MathJax's sizes is the TeX font's x-height. Handing MathJax
  // that ex (not a guessed half em) keeps its scale at 1 and makes 1000
  // font units exactly `fontSizePx`.
  const em = fontSizePx;
  const exPx = fontSizePx * handle.xHeight;
  let svgMarkup = '';
  try {
    const node = handle.document.convert(tex, {
      display: displayMode,
      em,
      ex: exPx,
      containerWidth: 80 * em,
    });
    svgMarkup = handle.adaptor.outerHTML(node);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const r = errorRender(tex, displayMode, fontSizePx, msg);
    cacheSet(key, r);
    return r;
  }

  // MathJax wraps the <svg> in <mjx-container>. Strip that wrapper.
  const inner = /<svg[\s\S]*<\/svg>/.exec(svgMarkup);
  if (!inner) {
    const r = errorRender(tex, displayMode, fontSizePx, 'MathJax did not return an <svg> element');
    cacheSet(key, r);
    return r;
  }
  const svgOnly = inner[0];

  // Check for error markers emitted by MathJax's noerrors/noundefined.
  // merror/mtext with data-merror → error in the TeX source.
  let error: string | undefined;
  const merror = /data-mml-node="merror"[\s\S]*?title="([^"]*)"/.exec(svgOnly);
  if (merror) error = merror[1];
  else if (/data-mml-node="merror"/.test(svgOnly)) error = 'Invalid LaTeX';

  if (isFullWidthSvg(svgOnly)) {
    const entry: FullWidthEntry = { kind: 'fullWidth', svgOnly, exPx, byWidth: new Map(), ...(error ? { error } : {}) };
    cacheSet(key, entry);
    return fullWidthRender(entry, tex, displayMode, fontSizePx, lineBoxKey, options.containerWidthPx);
  }

  const render = sizeRender(tex, displayMode, fontSizePx, svgOnly, error, exPx, lineBoxKey, undefined);
  cacheSet(key, render);
  return render;
}

// Re-serialise the MathJax SVG with our computed widthPx/heightPx so the
// HTML backend can embed it directly and get correct layout without having
// to know about ex units.
function serializeForHtml(viewBox: MathViewBox, svgOnly: string, widthPx: number, heightPx: number): string {
  // Replace the <svg> open tag's attributes with our px-based sizing so the
  // SVG participates in the surrounding flow as a block of the exact box
  // size we have measured.
  return svgOnly.replace(
    /<svg\b[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" width="${widthPx}" height="${heightPx}">`,
  );
}

// A full-width formula as the flattened paths: MathJax's markup places the
// equation and its number in nested viewports that need its stylesheet
// (`overflow: visible`) to show, so the HTML gets the paths as they were
// laid out instead — and its `<text>` characters, as the markup of an
// unnumbered formula keeps them.
function serializePaths(viewBox: MathViewBox, paths: MathPath[], texts: string[], widthPx: number, heightPx: number): string {
  const body = paths.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('') + texts.join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" width="${widthPx}" height="${heightPx}">${body}</svg>`;
}

// Provisional render used before MathJax finishes loading. Width heuristic is
// deliberately rough — it exists only so layout doesn't shift by too much
// once the real render arrives.
export function placeholderRender(tex: string, displayMode: boolean, fontSizePx: number): MathRender {
  const widthPx = Math.max(fontSizePx, tex.length * fontSizePx * 0.55);
  const heightPx = displayMode ? fontSizePx * 1.6 : fontSizePx;
  return {
    tex,
    displayMode,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}"><rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="#cccccc" opacity="0.2"/></svg>`,
    paths: [],
    viewBox: { minX: 0, minY: 0, width: widthPx, height: heightPx },
    widthPx,
    heightPx,
    ascentPx: heightPx * 0.75,
    depthPx: heightPx * 0.25,
    scale: 1,
  };
}

export function clearMathCache(): void {
  cache.clear();
}
