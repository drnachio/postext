import type { MathRender, MathPath, MathViewBox } from './types';
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

type MJHandle = {
  document: {
    convert: (tex: string, options: {
      display: boolean;
      em: number;
      ex: number;
      containerWidth: number;
    }) => unknown;
  };
  adaptor: {
    outerHTML: (node: unknown) => string;
  };
};

let handle: MJHandle | null = null;
let initPromise: Promise<void> | null = null;
const initListeners = new Set<() => void>();

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

export async function initMathEngine(): Promise<void> {
  if (handle !== null) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Dynamically import so the ~1 MB MathJax bundle is only paid for on
    // documents that actually contain math.
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, allPackages] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: allPackages.AllPackages });
    const svg = new SVG({ fontCache: 'local', exFactor: 0.5 });
    const document = mathjax.document('', { InputJax: tex, OutputJax: svg });
    handle = { document, adaptor } as unknown as MJHandle;
    for (const fn of initListeners) fn();
    initListeners.clear();
  })();
  return initPromise;
}

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

const MAX_CACHE = 512;
const cache = new Map<string, MathRender>();

function cacheKey(tex: string, displayMode: boolean, fontSizePx: number, lineBoxPx: number): string {
  return `${displayMode ? 'D' : 'I'}|${fontSizePx}|${lineBoxPx}|${tex}`;
}

function cacheGet(key: string): MathRender | undefined {
  const v = cache.get(key);
  if (v) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

function cacheSet(key: string, v: MathRender): void {
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
  widthEx: number;
  heightEx: number;
  verticalAlignEx: number;
  paths: MathPath[];
  defs: Map<string, string>;
}

function parseExValue(attr: string | undefined): number | null {
  if (!attr) return null;
  const m = /(-?\d*\.?\d+)ex/.exec(attr);
  return m ? Number(m[1]) : null;
}

function parseStyleVerticalAlign(style: string | undefined): number {
  if (!style) return 0;
  const m = /vertical-align:\s*(-?\d*\.?\d+)ex/.exec(style);
  return m ? Number(m[1]) : 0;
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

// Walk SVG string as a stream of tokens and accumulate a CTM per leaf.
// Emits `<path>` and `<use>` leaves with their resolved transform.
function parseSvg(svgMarkup: string): ParsedSvg | null {
  // Root <svg>
  const svgOpen = /<svg\b([^>]*)>/.exec(svgMarkup);
  if (!svgOpen) return null;
  const rootAttrs = readAttrs(svgOpen[1]!);
  const vb = rootAttrs['viewBox']?.split(/\s+/).map(Number) ?? [0, 0, 0, 0];
  const viewBox: MathViewBox = { minX: vb[0]!, minY: vb[1]!, width: vb[2]!, height: vb[3]! };
  const widthEx = parseExValue(rootAttrs['width']) ?? 0;
  const heightEx = parseExValue(rootAttrs['height']) ?? 0;
  const verticalAlignEx = parseStyleVerticalAlign(rootAttrs['style']);

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

    if (name === 'path' && attrs['d']) {
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

  return { viewBox, widthEx, heightEx, verticalAlignEx, paths, defs };
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

export function renderMath(
  tex: string,
  displayMode: boolean,
  fontSizePx: number,
  options: RenderOptions = {},
): MathRender {
  const lineBoxPx = options.lineBoxPx ?? Number.POSITIVE_INFINITY;
  const key = cacheKey(tex, displayMode, fontSizePx, lineBoxPx === Number.POSITIVE_INFINITY ? 0 : lineBoxPx);
  const cached = cacheGet(key);
  if (cached) return cached;

  if (!handle) {
    const r = placeholderRender(tex, displayMode, fontSizePx);
    // Do NOT cache the placeholder — we want the real render to replace it.
    return r;
  }

  let svgMarkup = '';
  try {
    const em = fontSizePx;
    const ex = fontSizePx * 0.5;
    const node = handle.document.convert(tex, {
      display: displayMode,
      em,
      ex,
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

  const parsed = parseSvg(svgOnly);
  if (!parsed) {
    const r = errorRender(tex, displayMode, fontSizePx, 'Could not parse MathJax SVG output');
    cacheSet(key, r);
    return r;
  }

  const exPx = fontSizePx * 0.5;
  let widthPx = parsed.widthEx * exPx;
  let heightPx = parsed.heightEx * exPx;
  // vertical-align is negative when the depth extends below baseline.
  const depthPx = -parsed.verticalAlignEx * exPx;
  let ascentPx = heightPx - depthPx;
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

  const svgSerialized = serializeForHtml(parsed, svgOnly, widthPx, heightPx, ascentPx);

  const render: MathRender = {
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

  cacheSet(key, render);
  return render;
}

// Re-serialise the MathJax SVG with our computed widthPx/heightPx so the
// HTML backend can embed it directly and get correct layout without having
// to know about ex units.
function serializeForHtml(parsed: ParsedSvg, svgOnly: string, widthPx: number, heightPx: number, _ascentPx: number): string {
  const { viewBox } = parsed;
  // Replace the <svg> open tag's attributes with our px-based sizing so the
  // SVG participates in the surrounding flow as a block of the exact box
  // size we have measured.
  return svgOnly.replace(
    /<svg\b[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" width="${widthPx}" height="${heightPx}">`,
  );
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
