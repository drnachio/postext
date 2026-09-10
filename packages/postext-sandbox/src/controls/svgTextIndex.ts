// DOM-backed glyph index for SVG text (Part E of the resource-selection
// sync). For each SVG payload the sandbox draws, this builds — once per
// `fileId` — the normalised box of every character of every `<text>` node,
// paired with the character's raw range in the SVG source. The previews use
// it to turn a click on a figure into a caret in the SVG source editor, and
// to paint the editor's selection back onto the figure.
//
// Measuring needs a rendered inline `<svg>`: the source is parsed with
// `DOMParser`, imported into a persistent hidden host (a shadow root, so an
// SVG's own `<style>` cannot leak into the page), sized to its intrinsic size
// — exactly how an `<img>` rasterises it, and both previews stretch that
// image into the figure's `bodyRect`, so page → SVG mapping is linear — and
// walked with `getExtentOfChar`. `getBBox`/`getExtentOfChar` do not exist in
// jsdom, so this module is exercised in the browser only.

import { decodeXmlText, scanSvgTextNodeRanges, type SvgCharBox, type SvgTextIndex, type SvgTextRun } from './svgSource';
import { svgIntrinsicSize } from '../panels/resources/svgIntrinsic';

const indexes = new Map<string, SvgTextIndex>();
const EMPTY: SvgTextIndex = { runs: [] };

/** The index built for a blob, if any. */
export function getSvgTextIndex(fileId: string): SvgTextIndex | undefined {
  return indexes.get(fileId);
}

/** Forget a blob's index (its bytes were replaced or the blob is gone). */
export function dropSvgTextIndex(fileId: string): void {
  indexes.delete(fileId);
}

/** Build (once) and cache the index for `fileId` from its SVG source. */
export function ensureSvgTextIndex(fileId: string, svgText: string): SvgTextIndex {
  const existing = indexes.get(fileId);
  if (existing) return existing;
  const built = buildSvgTextIndex(svgText) ?? EMPTY;
  indexes.set(fileId, built);
  return built;
}

/** Whether an index has at least one glyph — i.e. the figure has text nodes
 *  the editor can edit. */
export function svgIndexHasText(index: SvgTextIndex | undefined): boolean {
  return !!index && index.runs.some((r) => r.boxes.length > 0);
}

let hostRoot: ShadowRoot | null = null;

function getHost(): ShadowRoot | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (hostRoot && hostRoot.host.isConnected) return hostRoot;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.dataset.postextSvgMeasure = '1';
  // Laid out (so glyph geometry exists) but never seen nor hit.
  host.style.cssText = 'position:absolute;left:-100000px;top:0;width:0;height:0;overflow:visible;visibility:hidden;pointer-events:none;';
  document.body.appendChild(host);
  hostRoot = host.attachShadow({ mode: 'open' });
  return hostRoot;
}

/** Natural size an `<img>` gives an SVG without usable intrinsic dimensions. */
const FALLBACK_SIZE = { width: 300, height: 150 };

/** The `<text>` ancestor of a node, if any. */
function closestSvgText(node: Node): SVGTextContentElement | null {
  let el: Node | null = node.parentNode;
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    const e = el as Element;
    if (e.localName === 'text') return e as unknown as SVGTextContentElement;
    el = el.parentNode;
  }
  return null;
}

/** Every text node under a `<text>` element, in document order. */
function textNodesOf(textEl: Element): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/**
 * Map every UTF-16 unit of the element's concatenated text to the index
 * `getExtentOfChar` expects (-1 for units that are not addressable). Browsers
 * count addressable characters after the default `xml:space` whitespace
 * handling (newlines dropped, tabs to spaces, leading/trailing stripped,
 * runs collapsed); some count code points rather than units. The candidate
 * whose length matches `getNumberOfChars()` wins; when none does, the
 * element is left without boxes rather than mis-addressed.
 */
function addressableMap(full: string, preserve: boolean, numberOfChars: number): number[] | null {
  const units = full.length;
  // Candidate A: one addressable char per UTF-16 unit.
  if (numberOfChars === units) return Array.from({ length: units }, (_, i) => i);
  // Candidate B: one per code point.
  const cpMap: number[] = [];
  let cp = 0;
  for (let i = 0; i < units; i++) {
    const code = full.charCodeAt(i);
    const high = code >= 0xd800 && code <= 0xdbff && i + 1 < units;
    cpMap.push(cp);
    if (high) {
      cpMap.push(cp);
      i++;
    }
    cp++;
  }
  if (numberOfChars === cp) return cpMap;
  if (preserve) return null;
  // Candidate C: default whitespace handling, per unit.
  const kept: number[] = new Array<number>(units).fill(-1);
  let idx = 0;
  let pendingSpace = false;
  let started = false;
  for (let i = 0; i < units; i++) {
    const ch = full[i]!;
    if (ch === '\n' || ch === '\r') continue;
    if (ch === ' ' || ch === '\t') {
      pendingSpace = started;
      continue;
    }
    if (pendingSpace) {
      idx++; // the collapsed space that precedes this char
      pendingSpace = false;
    }
    kept[i] = idx++;
    started = true;
  }
  if (numberOfChars === idx) return kept;
  return null;
}

/** Client-space corners of a char extent, transformed by the text element's
 *  screen CTM and normalised into the root's client box. */
function normalisedBox(
  rect: DOMRect,
  ctm: DOMMatrix,
  root: DOMRect,
): SvgCharBox {
  const corners = [
    new DOMPoint(rect.x, rect.y),
    new DOMPoint(rect.x + rect.width, rect.y),
    new DOMPoint(rect.x, rect.y + rect.height),
    new DOMPoint(rect.x + rect.width, rect.y + rect.height),
  ].map((p) => p.matrixTransform(ctm));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of corners) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y);
  }
  return {
    x0: (x0 - root.left) / root.width,
    y0: (y0 - root.top) / root.height,
    x1: (x1 - root.left) / root.width,
    y1: (y1 - root.top) / root.height,
  };
}

/** Build the index for one SVG source; null when the source does not parse
 *  or no DOM is available. */
export function buildSvgTextIndex(svgText: string): SvgTextIndex | null {
  const host = getHost();
  if (!host || typeof DOMParser === 'undefined') return null;
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  } catch {
    return null;
  }
  if (parsed.getElementsByTagName('parsererror').length > 0) return null;
  const rootSrc = parsed.documentElement;
  if (!rootSrc || rootSrc.tagName.toLowerCase() !== 'svg') return null;

  const ranges = scanSvgTextNodeRanges(svgText);
  if (ranges.length === 0) return { runs: [] };

  const root = document.importNode(rootSrc, true) as unknown as SVGSVGElement;
  const size = svgIntrinsicSize(svgText) ?? FALLBACK_SIZE;
  root.setAttribute('width', String(size.width));
  root.setAttribute('height', String(size.height));
  host.appendChild(root);
  try {
    const rootRect = root.getBoundingClientRect();
    if (rootRect.width === 0 || rootRect.height === 0) return { runs: [] };
    const runs: SvgTextRun[] = [];
    let nextRange = 0;
    const textEls = Array.from(root.querySelectorAll('text'));
    for (const el of textEls) {
      if (closestSvgText(el) !== null) continue; // nested <text> is invalid; the outer one owns it
      const textEl = el as unknown as SVGTextContentElement;
      const nodes = textNodesOf(el);
      const full = nodes.map((n) => n.data).join('');
      let numberOfChars = 0;
      try { numberOfChars = textEl.getNumberOfChars(); } catch { numberOfChars = 0; }
      const preserve = el.getAttribute('xml:space') === 'preserve';
      const map = addressableMap(full, preserve, numberOfChars);
      let ctm: DOMMatrix | null = null;
      try { ctm = textEl.getScreenCTM(); } catch { ctm = null; }
      let unitBase = 0;
      for (const node of nodes) {
        // Pair the DOM node with the next scanner range that decodes to its
        // data; ranges that never match (CDATA, entities the scanner does not
        // decode) are skipped, keeping later nodes aligned.
        let matched: { start: number; end: number; charStart: number[]; charEnd: number[] } | null = null;
        for (let k = nextRange; k < ranges.length; k++) {
          const r = ranges[k]!;
          const decoded = decodeXmlText(svgText.slice(r.start, r.end));
          if (decoded.text === node.data) {
            matched = {
              start: r.start,
              end: r.end,
              charStart: decoded.charStart.map((o) => o + r.start),
              charEnd: decoded.charEnd.map((o) => o + r.start),
            };
            nextRange = k + 1;
            break;
          }
        }
        const nodeLen = node.data.length;
        if (matched && map && ctm) {
          const boxes: SvgCharBox[] = [];
          let last: SvgCharBox | null = null;
          for (let u = 0; u < nodeLen; u++) {
            const addr = map[unitBase + u] ?? -1;
            let box: SvgCharBox | null = null;
            if (addr >= 0) {
              try {
                box = normalisedBox(textEl.getExtentOfChar(addr), ctm, rootRect);
              } catch {
                box = null;
              }
            }
            // Collapsed whitespace / low surrogates: reuse the neighbouring
            // glyph's box so every unit stays addressable for selection.
            if (!box) box = last ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
            boxes.push(box);
            last = box;
          }
          runs.push({ ...matched, text: node.data, boxes });
        }
        unitBase += nodeLen;
      }
    }
    return { runs };
  } finally {
    host.removeChild(root);
  }
}
