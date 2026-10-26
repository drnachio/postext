// The walk over the SVG tree into the vector items: shapes, text laid
// out in chunks, clips, ids and the viewBox aspect
// (#1276: split out of svgVector.ts).
import { shapedSvgText } from '../../text/shapedText.js';
import { needsComplexShaping, complexShaperReady } from '../../../complexShaping.js';
import { isFontFaceOnlyStyleSheet } from 'postext';
import type { VectorItem, VectorFontResolver, VectorClip, VectorTextRun, PathSeg, VectorPaint, VectorDrawing } from '../svgVector.js';
import { type Matrix, Unsupported, unsupported, parsePathData, rectSegs, ellipseSegs, pointsSegs, mul, parseTransform, transformSegs, lengthScale } from './geometry.js';
import { type Style, parseLength, cascade, type Paint } from './style.js';
import { type XmlEl, localName } from './xml.js';

// ------------------------------------------------------------ conversion

/** Elements that never render and can be skipped with their subtrees. */
const SKIPPED = new Set(['title', 'desc', 'metadata', 'defs', 'clipPath', 'style']);
/** Structural elements traversed like a group. */
const GROUPS = new Set(['g', 'a']);
/** Basic shapes. */
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

export interface Walker {
  byId: Map<string, XmlEl>;
  shapes: VectorItem[];
  depth: number;
  fonts: VectorFontResolver | undefined;
  probe: boolean;
}

/** Walk a child; in probe mode an unsupported subtree is skipped, not fatal. */
function walkChild(w: Walker, el: XmlEl, ctm: Matrix, style: Style, clips: VectorClip[]): void {
  if (!w.probe) {
    walk(w, el, ctm, style, clips);
    return;
  }
  try {
    walk(w, el, ctm, style, clips);
  } catch (err) {
    if (!(err instanceof Unsupported)) throw err;
  }
}

/** Attributes that reposition glyphs individually; none are supported. */
const TEXT_UNSUPPORTED_ATTRS = ['rotate', 'textLength', 'lengthAdjust'];

/** Single numeric value of an `x` / `y` / `dx` / `dy` list, or undefined. */
function singleCoord(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parts = value.trim().split(/[\s,]+/).filter((v) => v !== '');
  if (parts.length === 0) return undefined;
  if (parts.length > 1) unsupported('per-glyph positioning');
  return parseLength(parts[0], 0);
}

/** Collapse whitespace the way `xml:space="default"` does for SVG text. */
function collapseWhitespace(raw: string): string {
  return raw.replace(/[\n\r\t]/g, ' ').replace(/ {2,}/g, ' ');
}

interface TextChunk {
  runs: VectorTextRun[];
  anchor: 'start' | 'middle' | 'end';
  direction: 'ltr' | 'rtl';
  /** Local → root transform of the run that opened the chunk. */
  matrix: Matrix;
}

/** Lay out a `text` element: walks its runs and `tspan`s, positions each run
 *  on the current pen, then applies `text-anchor` per absolutely positioned
 *  chunk. Text in a font the resolver cannot provide bails out. */
function layoutText(w: Walker, el: XmlEl, m: Matrix, style: Style, clips: VectorClip[]): void {
  if (!w.fonts) unsupported('text (no font resolver)');
  const resolver = w.fonts!;
  const chunks: TextChunk[] = [];
  let pen = { x: 0, y: 0 };
  let chunk: TextChunk | null = null;
  let pendingSpace = false;
  let started = false;
  // Each run's advance, as it was laid out.
  const widths = new Map<VectorTextRun, number>();

  const visit = (node: XmlEl, nm: Matrix, ns: Style, isRoot: boolean): void => {
    for (const a of TEXT_UNSUPPORTED_ATTRS) if (node.attrs[a] !== undefined) unsupported(a);
    if (node.attrs['transform'] !== undefined && !isRoot) unsupported('tspan transform');
    const x = singleCoord(node.attrs['x']);
    const y = singleCoord(node.attrs['y']);
    const dx = singleCoord(node.attrs['dx']) ?? 0;
    const dy = singleCoord(node.attrs['dy']) ?? 0;
    if (x !== undefined) pen = { ...pen, x };
    if (y !== undefined) pen = { ...pen, y };
    pen = { x: pen.x + dx, y: pen.y + dy };
    if (isRoot || x !== undefined || y !== undefined) {
      chunk = { runs: [], anchor: ns.textAnchor, direction: ns.direction, matrix: nm };
      chunks.push(chunk);
    }
    for (const c of node.content) {
      if (typeof c === 'string') {
        let text = collapseWhitespace(c);
        if (text === '') continue;
        if (!started) {
          text = text.replace(/^ +/, '');
          if (text === '') continue;
        }
        if (pendingSpace && !text.startsWith(' ')) text = ' ' + text;
        pendingSpace = text.endsWith(' ');
        text = text.replace(/ +$/, '');
        if (text === '') continue;
        started = true;
        const font = resolver(ns.fontFamilies, ns.fontWeight, ns.italic);
        if (!font) unsupported(`font ${ns.fontFamilies.join(', ') || '(default)'}`);
        const fillPaint = ns.fill === 'none' ? null : ns.fill === 'currentColor' ? ns.color : ns.fill;
        const alpha = fillPaint ? fillPaint.alpha * ns.fillOpacity * ns.opacity : 0;
        if (ns.stroke !== 'none') unsupported('stroked text');
        // Right-to-left and joining scripts are shaped by HarfBuzz, and
        // measured by it; without it they go to the raster embed.
        const complex = needsComplexShaping(text);
        if (complex && !complexShaperReady()) unsupported('complex-script text (HarfBuzz not loaded)');
        const shaped = complex && font!.pdfFont ? shapedSvgText(font!.pdfFont, text, ns.fontSize, ns.direction) : null;
        const width = shaped ? shaped.advance : font!.widthOf(text, ns.fontSize);
        if (fillPaint && alpha > 0 && ns.visible) {
          const run: VectorTextRun = {
            text, font: font!, size: ns.fontSize, x: pen.x, y: pen.y, matrix: nm,
            fill: { hex: fillPaint.hex, alpha },
            ...(complex ? { base: ns.direction } : {}),
          };
          chunk!.runs.push(run);
          widths.set(run, width);
        }
        pen = { x: pen.x + width, y: pen.y };
        continue;
      }
      const { local, foreign } = localName(c.name);
      if (foreign) continue;
      if (local !== 'tspan') unsupported(`text child ${local}`);
      if (c.attrs['display']?.trim() === 'none') continue;
      const cs = cascade(ns, c.attrs);
      visit(c, nm, cs, false);
    }
  };
  visit(el, m, style, true);

  const runs: VectorTextRun[] = [];
  for (const ch of chunks) {
    if (ch.runs.length === 0) continue;
    const first = ch.runs[0]!;
    const last = ch.runs[ch.runs.length - 1]!;
    const width = last.x + (widths.get(last) ?? 0) - first.x;
    // A right-to-left chunk runs leftwards from its start: its `tspan`s
    // take their places from the right, and `start` names its right end.
    const rtl = ch.direction === 'rtl';
    const placed = rtl ? ch.runs.map((r) => ({ ...r, x: first.x + width - (r.x - first.x) - (widths.get(r) ?? 0) })) : ch.runs;
    const anchor = rtl ? (ch.anchor === 'start' ? 'end' : ch.anchor === 'end' ? 'start' : 'middle') : ch.anchor;
    const shift = anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0;
    for (const r of placed) runs.push(shift === 0 ? r : { ...r, x: r.x + shift });
  }
  if (runs.length > 0) w.shapes.push({ kind: 'text', runs, clips });
}

function shapeSegs(el: XmlEl): PathSeg[] {
  const a = el.attrs;
  const len = (name: string, fallback = 0): number => parseLength(a[name], fallback);
  switch (el.name) {
    case 'path': {
      const d = a['d'];
      if (!d || d.trim() === '') return [];
      return parsePathData(d);
    }
    case 'rect': {
      const w = len('width');
      const h = len('height');
      if (w <= 0 || h <= 0) return [];
      let rx = a['rx'] !== undefined && a['rx'] !== 'auto' ? len('rx') : -1;
      let ry = a['ry'] !== undefined && a['ry'] !== 'auto' ? len('ry') : -1;
      if (rx < 0 && ry < 0) rx = ry = 0;
      else if (rx < 0) rx = ry;
      else if (ry < 0) ry = rx;
      return rectSegs(len('x'), len('y'), w, h, rx, ry);
    }
    case 'circle': {
      const r = len('r');
      return r > 0 ? ellipseSegs(len('cx'), len('cy'), r, r) : [];
    }
    case 'ellipse': {
      const rx = a['rx'] === 'auto' ? len('ry') : len('rx');
      const ry = a['ry'] === 'auto' ? len('rx') : len('ry');
      return rx > 0 && ry > 0 ? ellipseSegs(len('cx'), len('cy'), rx, ry) : [];
    }
    case 'line':
      return [['M', len('x1'), len('y1')], ['L', len('x2'), len('y2')]];
    case 'polyline':
      return a['points'] ? pointsSegs(a['points'], false) : [];
    case 'polygon':
      return a['points'] ? pointsSegs(a['points'], true) : [];
    default:
      return unsupported(el.name);
  }
}

function hrefOf(el: XmlEl): string | undefined {
  return el.attrs['href'] ?? el.attrs['xlink:href'];
}

function resolveClip(w: Walker, attrs: Record<string, string>, ctm: Matrix, style: Style): VectorClip | null {
  const raw = attrs['clip-path'];
  if (raw === undefined) return null;
  const v = raw.trim();
  if (v === 'none' || v === '') return null;
  const m = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(v);
  if (!m) return unsupported(`clip-path ${v}`);
  const target = w.byId.get(m[1]!);
  if (!target || target.name !== 'clipPath') return unsupported('clip-path target');
  const units = target.attrs['clipPathUnits'];
  if (units !== undefined && units !== 'userSpaceOnUse') unsupported('clipPathUnits');
  if (target.attrs['clip-path'] !== undefined) unsupported('nested clip-path');
  const clipCtm = mul(ctm, parseTransform(target.attrs['transform']));
  const clipStyle = cascade(style, target.attrs);
  const segs: PathSeg[] = [];
  let evenOdd = clipStyle.clipEvenOdd;
  const visit = (el: XmlEl, m2: Matrix, s: Style, depth: number): void => {
    if (depth > 16) unsupported('clip recursion');
    const { local, foreign } = localName(el.name);
    if (foreign || local === 'title' || local === 'desc' || local === 'metadata') return;
    const s2 = cascade(s, el.attrs);
    if (el.attrs['display']?.trim() === 'none') return;
    const m3 = mul(m2, parseTransform(el.attrs['transform']));
    if (SHAPES.has(local)) {
      evenOdd = s2.clipEvenOdd;
      segs.push(...transformSegs(shapeSegs({ ...el, name: local }), m3));
    } else if (local === 'use') {
      const href = hrefOf(el);
      const id = href?.startsWith('#') ? href.slice(1) : undefined;
      const ref = id ? w.byId.get(id) : undefined;
      if (!ref) unsupported('use target');
      const m4 = mul(m3, [1, 0, 0, 1, parseLength(el.attrs['x'], 0), parseLength(el.attrs['y'], 0)]);
      visit(ref!, m4, s2, depth + 1);
    } else {
      unsupported(`clipPath child ${local}`);
    }
  };
  for (const child of target.children) visit(child, clipCtm, clipStyle, 0);
  return { segs, evenOdd };
}

export function walk(w: Walker, el: XmlEl, ctm: Matrix, parentStyle: Style, clips: VectorClip[]): void {
  if (w.depth > 64) unsupported('nesting depth');
  const { local, foreign } = localName(el.name);
  if (foreign) return; // inkscape:*, sodipodi:*, rdf:* …
  if (SKIPPED.has(local)) {
    // A sheet of `@font-face` rules only (the faces an author embedded,
    // #630) changes no geometry: its text is set in the embedded fonts.
    if (local === 'style' && el.hasText && !isFontFaceOnlyStyleSheet(el.content.filter((c): c is string => typeof c === 'string').join(''))) {
      unsupported('style sheet');
    }
    return;
  }
  const attrs = el.attrs;
  if (attrs['display']?.trim() === 'none') return;
  if (!w.probe) {
    // Painting-only concerns: a probe still wants the text underneath.
    if (attrs['mask'] !== undefined && attrs['mask'].trim() !== 'none') unsupported('mask');
    if (attrs['filter'] !== undefined && attrs['filter'].trim() !== 'none') unsupported('filter');
    if (attrs['marker-start'] || attrs['marker-mid'] || attrs['marker-end']) unsupported('marker');
  }
  const style = cascade(parentStyle, attrs);
  const m = mul(ctm, parseTransform(attrs['transform']));
  const clipHere = w.probe ? null : resolveClip(w, attrs, m, style);
  const nextClips = clipHere ? [...clips, clipHere] : clips;

  if (GROUPS.has(local) || (local === 'svg' && w.depth === 0)) {
    w.depth++;
    for (const child of el.children) walkChild(w, child, m, style, nextClips);
    w.depth--;
    return;
  }
  if (local === 'use') {
    const href = hrefOf(el);
    const id = href?.startsWith('#') ? href.slice(1) : undefined;
    const ref = id ? w.byId.get(id) : undefined;
    if (!ref) return unsupported('use target');
    const refLocal = localName(ref.name).local;
    if (refLocal === 'symbol' || refLocal === 'svg') unsupported('use of symbol');
    const m2 = mul(m, [1, 0, 0, 1, parseLength(attrs['x'], 0), parseLength(attrs['y'], 0)]);
    w.depth++;
    walk(w, ref, m2, style, nextClips);
    w.depth--;
    return;
  }
  if (SHAPES.has(local)) {
    if (!style.visible) return;
    const segs = shapeSegs({ ...el, name: local });
    if (segs.length === 0) return;
    const resolve = (p: Paint): VectorPaint | null => {
      if (p === 'none') return null;
      return p === 'currentColor' ? style.color : p;
    };
    const fillPaint = resolve(style.fill);
    const strokePaint = resolve(style.stroke);
    const fillAlpha = fillPaint ? fillPaint.alpha * style.fillOpacity * style.opacity : 0;
    const strokeAlpha = strokePaint ? strokePaint.alpha * style.strokeOpacity * style.opacity : 0;
    const scale = lengthScale(m);
    const strokeWidth = style.strokeWidth * scale;
    const fillOut = fillPaint && fillAlpha > 0 ? { hex: fillPaint.hex, alpha: fillAlpha } : null;
    const strokeOut = strokePaint && strokeAlpha > 0 && strokeWidth > 0
      ? {
        hex: strokePaint.hex,
        alpha: strokeAlpha,
        width: strokeWidth,
        cap: style.cap,
        join: style.join,
        miterLimit: style.miterLimit,
        dash: style.dash ? style.dash.map((d) => d * scale) : null,
        dashOffset: style.dashOffset * scale,
      }
      : null;
    if (!fillOut && !strokeOut) return;
    w.shapes.push({ kind: 'path', segs: transformSegs(segs, m), fill: fillOut, evenOdd: style.evenOdd, stroke: strokeOut, clips: nextClips });
    return;
  }
  if (local === 'text') {
    layoutText(w, el, m, style, nextClips);
    return;
  }
  if (local === 'image') {
    // A data-URI PNG / JPEG stretched into its box (`preserveAspectRatio`
    // is not honoured: the box is taken as the picture's extent).
    if (!style.visible) return;
    const href = hrefOf(el) ?? '';
    const dm = /^data:image\/(png|jpeg|jpg);base64,([\s\S]*)$/i.exec(href.trim());
    if (!dm) return unsupported('image source');
    const width = parseLength(attrs['width'], 0);
    const height = parseLength(attrs['height'], 0);
    if (width <= 0 || height <= 0) return;
    if (w.probe) return;
    let data: Uint8Array;
    try {
      const bin = atob(dm[2]!.replace(/\s+/g, ''));
      data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    } catch {
      return unsupported('image data');
    }
    w.shapes.push({
      kind: 'image',
      data,
      format: dm[1]!.toLowerCase() === 'png' ? 'png' : 'jpeg',
      x: parseLength(attrs['x'], 0),
      y: parseLength(attrs['y'], 0),
      width,
      height,
      matrix: m,
      clips: nextClips,
    });
    return;
  }
  // tspan outside text, svg (nested), symbol, switch, foreignObject,
  // linearGradient outside defs, pattern, mask, filter, marker, …
  unsupported(local);
}

export function indexIds(el: XmlEl, byId: Map<string, XmlEl>): void {
  const id = el.attrs['id'];
  if (id && !byId.has(id)) byId.set(id, el);
  for (const c of el.children) indexIds(c, byId);
}

export function parseAspect(value: string | undefined): VectorDrawing['aspect'] {
  const v = (value ?? 'xMidYMid meet').trim().split(/\s+/);
  if (v[0] === 'none') return null;
  const m = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(v[0] ?? '');
  if (!m) return unsupported('preserveAspectRatio');
  const pos = (s: string): 0 | 0.5 | 1 => (s === 'Min' ? 0 : s === 'Mid' ? 0.5 : 1);
  return { xAlign: pos(m[1]!), yAlign: pos(m[2]!), slice: v[1] === 'slice' };
}
