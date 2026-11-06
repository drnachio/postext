// IDML export: the laid-out pages as an InDesign Markup package, for
// finishing in InDesign. Built on the page display list (#1388), as the
// formatted Word export is: every page becomes a spread of one page;
// rules, boxes, paths and pictures become native page items; the text of
// each composed-page frame becomes one text frame with one story (frames
// chained by `next` share one story), with the frame's callout style as
// paragraph style. Chips that carry a form field become InDesign form
// fields (`fields.ts`). InDesign sets the text again with its own composer:
// frames, styles, text and first baselines match, line breaks may not.

import { strToU8, zipSync, type Zippable } from 'fflate';
import { pageDisplayList } from '../paint/displayList/page.js';
import type { DisplayItem, DisplayLine, DisplayPage, DisplayRect, DisplayRun } from '../paint/displayList/types.js';
import type { VDTPathCommand } from '../vdt/design.js';
import type { VDTDocument } from '../vdt/document.js';
import type { VDTFrame } from '../vdt/pages/composed.js';
import { authoredCmykColors } from '../color/authored.js';
import { bitmapInfo, svgSize } from '../bundle/manifest/sizes.js';
import { CHIP_PLACEHOLDER } from '../parse/inlineFormatting/inlineDirectives.js';
import { escapeXml } from '../word/xml.js';
import { fieldXml } from './fields.js';
import {
  attr,
  BACKING_STORY_XML,
  CONTAINER_XML,
  designMapXml,
  DOM_VERSION,
  fontsXml,
  graphicXml,
  IDML_MIMETYPE,
  masterSpreadXml,
  num,
  PKG_NS,
  preferencesXml,
  styleSelf,
  stylesXml,
  textPropsAttrs,
  XML_HEAD,
  type ParagraphStyleDef,
  type Swatch,
  type TextProps,
} from './parts.js';

export interface IdmlWarning {
  code: string;
  message: string;
}

export interface IdmlOptions {
  /** The laid-out documents (chapters), in book order. */
  docs: readonly VDTDocument[];
  /** Bytes of a picture by its file id (`DisplayItem.fileId`). */
  resourceBytes?: (fileId: string) => Uint8Array | undefined;
  /** `embed` (default): pictures inside the IDML; `link`: linked to
   *  `Links/<name>`, returned in `links` for the caller to write beside it. */
  images?: 'embed' | 'link';
  title?: string;
  /** InDesign's style name of a face (`Regular`, `Bold Italic`…); the
   *  default derives it from weight and slant. */
  fontStyleName?: (family: string, weight: number, italic: boolean) => string;
  /** Paragraph style names for text outside composed frames, by display
   *  list role (`body`, `heading`, `list`…); a heading's name gets its
   *  level. Defaults: `Body`, `Heading`, `List`, `Quote`, `Caption`,
   *  `Footnote`, `Header`, `Footer`, `Design`; other roles keep the role. */
  styleNames?: Partial<Record<string, string>>;
  /** Chips that carry a form field (`field="…"`) become InDesign form
   *  fields (default `true`); `false` writes them as any chip, the value
   *  as text. */
  forms?: boolean;
  onWarning?: (w: IdmlWarning) => void;
}

export interface IdmlResult {
  bytes: Uint8Array;
  /** Linked pictures (`images: 'link'`): path relative to the IDML file. */
  links: { path: string; bytes: Uint8Array }[];
}

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

export function defaultFontStyleName(_family: string, weight: number, italic: boolean): string {
  const w = WEIGHT_NAMES[Math.round(weight / 100) * 100] ?? 'Regular';
  if (!italic) return w;
  return w === 'Regular' ? 'Italic' : `${w} Italic`;
}

interface CssFont {
  family: string;
  weight: number;
  italic: boolean;
  sizePx: number;
}

/** `italic 700 16px "EB Garamond", serif` → its parts. */
export function parseCssFont(s: string): CssFont {
  const m = /([\d.]+)px(?:\s*\/\s*\S+)?\s+(.+)$/.exec(s);
  const head = m ? s.slice(0, m.index) : '';
  const family = (m?.[2] ?? 'Times').split(',')[0]!.trim().replace(/^["']|["']$/g, '');
  let weight = 400;
  let italic = false;
  for (const t of head.trim().split(/\s+/)) {
    if (t === 'italic' || t === 'oblique') italic = true;
    else if (t === 'bold') weight = 700;
    else if (/^\d{3}$/.test(t)) weight = Number(t);
  }
  return { family, weight, italic, sizePx: m ? Number(m[1]) : 16 };
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` → 0–255 and alpha 0–1. */
export function parseColor(s: string | undefined): { r: number; g: number; b: number; a: number } | undefined {
  if (!s || s === 'transparent' || s === 'none') return undefined;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s.trim());
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s.trim());
  if (fn) {
    const p = fn[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p[3] ?? 1 };
  }
  return undefined;
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

interface Writer {
  next: () => string;
  k: number;
  /** Sheet px → spread pt. */
  ox: number;
  oy: number;
  pageH: number;
  swatches: Map<string, Swatch>;
  cmyk: Map<string, { c: number; m: number; y: number; k: number }>;
  palette: Map<string, string>;
  fonts: Map<string, Set<string>>;
  paraStyles: Map<string, ParagraphStyleDef>;
  stories: { id: string; xml: string }[];
  media: Map<string, { path: string; bytes: Uint8Array }>;
  opts: IdmlOptions;
  warn: (code: string, message: string) => void;
}

/** A colour as a swatch reference: authored CMYK (palette names when the
 *  configuration names it), else RGB. */
function swatch(w: Writer, color: string | undefined): { ref: string; opacity: number } | undefined {
  const c = parseColor(color);
  if (!c) return undefined;
  if (c.a === 0) return undefined;
  const key = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  const cmyk = w.cmyk.get(key);
  if (cmyk && cmyk.c === 0 && cmyk.m === 0 && cmyk.y === 0 && cmyk.k === 100) return { ref: 'Color/Black', opacity: c.a };
  if (cmyk && cmyk.c === 0 && cmyk.m === 0 && cmyk.y === 0 && cmyk.k === 0) return { ref: 'Color/Paper', opacity: c.a };
  let s = w.swatches.get(key);
  if (!s) {
    const fallback = cmyk ? `C=${num(cmyk.c)} M=${num(cmyk.m)} Y=${num(cmyk.y)} K=${num(cmyk.k)}` : `R=${c.r} G=${c.g} B=${c.b}`;
    const name = w.palette.get(key) ?? fallback;
    s = cmyk
      ? { self: `Color/${name}`, name, space: 'CMYK', value: [cmyk.c, cmyk.m, cmyk.y, cmyk.k] }
      : { self: `Color/${name}`, name, space: 'RGB', value: [c.r, c.g, c.b] };
    w.swatches.set(key, s);
  }
  return { ref: s.self, opacity: c.a };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

const toSpread = (w: Writer, x: number, y: number): Pt => ({ x: (x - w.ox) * w.k, y: (y - w.oy) * w.k - w.pageH / 2 });

const pp = (a: Pt, l: Pt = a, r: Pt = a): string =>
  `<PathPointType Anchor="${num(a.x)} ${num(a.y)}" LeftDirection="${num(l.x)} ${num(l.y)}" RightDirection="${num(r.x)} ${num(r.y)}"/>`;

function pathGeometry(paths: { points: string[]; open: boolean }[]): string {
  return `<Properties><PathGeometry>${paths.map((p) => `<GeometryPathType PathOpen="${p.open}"><PathPointArray>${p.points.join('')}</PathPointArray></GeometryPathType>`).join('')}</PathGeometry></Properties>`;
}

/** A box `r` (sheet px) turned `rotate`° clockwise about its centre: its
 *  item transform and its outline in its own frame (centred, pt). */
function boxGeometry(w: Writer, r: DisplayRect, rotate = 0): { transform: string; geometry: string; width: number; height: number } {
  const c = toSpread(w, r.x + r.width / 2, r.y + r.height / 2);
  const hw = (r.width * w.k) / 2;
  const hh = (r.height * w.k) / 2;
  const t = (rotate * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const transform = `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(c.x)} ${num(c.y)}`;
  const points = [pp({ x: -hw, y: -hh }), pp({ x: -hw, y: hh }), pp({ x: hw, y: hh }), pp({ x: hw, y: -hh })];
  return { transform, geometry: pathGeometry([{ points, open: false }]), width: hw * 2, height: hh * 2 };
}

function opacityXml(opacity: number): string {
  return opacity < 1 ? `<TransparencySetting><BlendingSetting Opacity="${num(opacity * 100)}"/></TransparencySetting>` : '';
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

type RectItem = Extract<DisplayItem, { kind: 'rect' }>;

function rectXml(w: Writer, item: Pick<RectItem, 'rect' | 'fill' | 'stroke' | 'strokeWidthPx' | 'radius' | 'rotate' | 'frame'>, name?: string): string {
  const fill = swatch(w, item.fill);
  const stroke = item.strokeWidthPx ? swatch(w, item.stroke) : undefined;
  if (!fill && !stroke) return '';
  const g = boxGeometry(w, item.rect, item.rotate);
  return (
    `<Rectangle${attr('Self', w.next())} ContentType="Unassigned" ItemLayer="ulayer"${attr('ItemTransform', g.transform)} AppliedObjectStyle="ObjectStyle/$ID/[None]"` +
    `${paintAttrs(w, fill, stroke, item.strokeWidthPx, item.radius)}${attr('Name', name ?? (item.frame ? `${frameName(item.frame)} (box)` : undefined))}>` +
    `${g.geometry}${opacityXml(fill?.opacity ?? stroke?.opacity ?? 1)}</Rectangle>`
  );
}

/** Fill, stroke (inside the edge) and rounded corners of a box. */
function paintAttrs(w: Writer, fill: { ref: string } | undefined, stroke: { ref: string } | undefined, strokeWidthPx: number | undefined, radiusPx: number | undefined): string {
  const radius = radiusPx ? radiusPx * w.k : 0;
  const corners = radius > 0 ? ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].map((c) => `${attr(`${c}CornerOption`, 'RoundedCorner')}${attr(`${c}CornerRadius`, radius)}`).join('') : '';
  return (
    `${attr('FillColor', fill?.ref ?? 'Swatch/None')}${attr('StrokeColor', stroke?.ref ?? 'Swatch/None')}${attr('StrokeWeight', stroke ? strokeWidthPx! * w.k : 0)}` +
    `${stroke ? ' StrokeAlignment="InsideAlignment"' : ''}${corners}`
  );
}

/** The sheet box of a chip whose box starts on `run` of `line`. */
function chipRect(run: DisplayRun, line: DisplayLine): DisplayRect | undefined {
  const b = run.inline?.kind === 'chip' ? run.inline.box : undefined;
  return b ? { x: run.x + b.dx, y: line.baseline - b.ascent, width: b.width, height: b.ascent + b.descent } : undefined;
}

/** The boxes of a text item's chips (a label's fill, an outline) as
 *  rectangles on the page, behind the text, which carries the chips'
 *  words (`paragraphRuns`). An underline-only chip is left to the text. */
function chipRects(w: Writer, item: TextItem): string[] {
  const out: string[] = [];
  for (const line of item.lines) {
    for (const run of line.runs) {
      const b = run.inline?.kind === 'chip' ? run.inline.box : undefined;
      const rect = chipRect(run, line);
      if (!b || !rect || (!b.fill && !(b.stroke && b.strokeWidthPx)) || isField(w, run)) continue;
      out.push(rectXml(w, { fill: b.fill, stroke: b.stroke, strokeWidthPx: b.strokeWidthPx, radius: b.radius, rect }));
    }
  }
  return out;
}

/** A chip that is written as a form field. */
const isField = (w: Writer, run: DisplayRun): boolean => run.inline?.kind === 'chip' && !!run.inline.field && w.opts.forms !== false;

/** The form fields of a text item's chips, over the text (#1445). The
 *  field's value is the chip's words. */
function chipFields(w: Writer, item: TextItem, frame: VDTFrame | undefined): string[] {
  const out: string[] = [];
  for (const line of item.lines) {
    line.runs.forEach((run, i) => {
      const field = run.inline?.kind === 'chip' ? run.inline.field : undefined;
      const b = run.inline?.box;
      const rect = chipRect(run, line);
      if (!field || !b || !rect || !isField(w, run)) return;
      if (item.rotate) w.warn('field.rotated', `Form field "${field.name}" stands in turned text; it is written unturned`);
      const end = rect.x + rect.width;
      const value = [run, ...line.runs.slice(i + 1).filter((r) => !r.inline && r.x < end - 0.01)].map((r) => r.text).join('').replaceAll(CHIP_PLACEHOLDER, '').trim();
      if (value && field.kind !== 'checkbox') w.warn('field.value', 'InDesign form fields have no default value: a field\'s value is kept as its script label postext:value');
      if (field.format || field.calc) w.warn('field.script', 'InDesign form fields have no number format or calculation: they are kept as the script labels postext:format and postext:calc');
      const c = toSpread(w, rect.x + rect.width / 2, rect.y + rect.height / 2);
      const fill = swatch(w, b.fill);
      const stroke = b.strokeWidthPx ? swatch(w, b.stroke) : undefined;
      const sizePx = field.sizePx ?? (parseCssFont(run.fontString).sizePx || 12);
      out.push(
        fieldXml(w.next, field, value, {
          cx: c.x,
          cy: c.y,
          hw: (rect.width * w.k) / 2,
          hh: (rect.height * w.k) / 2,
          paint: paintAttrs(w, fill, stroke, b.strokeWidthPx, b.radius),
          ink: swatch(w, run.color)?.ref ?? 'Color/Black',
          sizePt: sizePx * w.k * (frame?.scale ?? 1),
        }),
      );
    });
  }
  return out;
}

function ruleXml(w: Writer, item: Extract<DisplayItem, { kind: 'rule' }>): string {
  const stroke = swatch(w, item.color);
  if (!stroke || item.widthPx <= 0) return '';
  const a = toSpread(w, item.x1, item.y1);
  const b = toSpread(w, item.x2, item.y2);
  const dash = item.dash?.length ? ` StrokeType="StrokeStyle/$ID/Dashed"${attr('StrokeDashAndGap', item.dash.map((d) => num(d * w.k)).join(' '))}` : '';
  return (
    `<GraphicLine${attr('Self', w.next())} ContentType="Unassigned" ItemLayer="ulayer" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]"` +
    ` FillColor="Swatch/None"${attr('StrokeColor', stroke.ref)}${attr('StrokeWeight', item.widthPx * w.k)}${dash} LeftLineEnd="None" RightLineEnd="None">` +
    `${pathGeometry([{ points: [pp(a), pp(b)], open: true }])}${opacityXml(stroke.opacity)}</GraphicLine>`
  );
}

/** Path commands (sheet px) as IDML path points: each point's left
 *  direction is the handle coming in, its right one the handle going out. */
function subpathPoints(w: Writer, cmds: VDTPathCommand[]): { points: string[]; open: boolean } {
  type P = { a: Pt; l: Pt; r: Pt };
  const pts: P[] = [];
  let open = true;
  const at = (x: number, y: number) => toSpread(w, x, y);
  for (const c of cmds) {
    if (c.op === 'M' || c.op === 'L') {
      const a = at(c.x, c.y);
      pts.push({ a, l: a, r: a });
    } else if (c.op === 'C') {
      const last = pts[pts.length - 1];
      if (last) last.r = at(c.x1, c.y1);
      const a = at(c.x, c.y);
      pts.push({ a, l: at(c.x2, c.y2), r: a });
    } else if (c.op === 'Q') {
      const last = pts[pts.length - 1];
      const p0 = last?.a ?? at(c.x1, c.y1);
      const q = at(c.x1, c.y1);
      const a = at(c.x, c.y);
      if (last) last.r = { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) };
      pts.push({ a, l: { x: a.x + (2 / 3) * (q.x - a.x), y: a.y + (2 / 3) * (q.y - a.y) }, r: a });
    } else if (c.op === 'Z') {
      open = false;
    }
  }
  if (!open && pts.length > 1) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (Math.abs(first.a.x - last.a.x) < 1e-3 && Math.abs(first.a.y - last.a.y) < 1e-3) {
      first.l = last.l;
      pts.pop();
    }
  }
  return { points: pts.map((p) => pp(p.a, p.l, p.r)), open };
}

function pathXml(w: Writer, item: Extract<DisplayItem, { kind: 'path' }>): string {
  const fill = swatch(w, item.fill);
  const stroke = item.stroke && item.stroke.widthPx > 0 ? swatch(w, item.stroke.color) : undefined;
  if (!fill && !stroke) return '';
  const paths = item.subpaths.filter((s) => s.length > 1).map((s) => subpathPoints(w, s));
  if (!paths.length) return '';
  const dash = item.stroke?.dash?.length ? ` StrokeType="StrokeStyle/$ID/Dashed"${attr('StrokeDashAndGap', item.stroke.dash.map((d) => num(d * w.k)).join(' '))}` : '';
  const cap = item.stroke?.cap === 'round' ? ' EndCap="RoundEndCap"' : item.stroke?.cap === 'square' ? ' EndCap="ProjectingEndCap"' : '';
  const join = item.stroke?.join === 'round' ? ' EndJoin="RoundEndJoin"' : item.stroke?.join === 'bevel' ? ' EndJoin="BevelEndJoin"' : '';
  return (
    `<Polygon${attr('Self', w.next())} ContentType="Unassigned" ItemLayer="ulayer" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]"` +
    `${attr('FillColor', fill?.ref ?? 'Swatch/None')}${attr('StrokeColor', stroke?.ref ?? 'Swatch/None')}${attr('StrokeWeight', stroke ? item.stroke!.widthPx * w.k : 0)}${dash}${cap}${join}>` +
    `${pathGeometry(paths)}${opacityXml(fill?.opacity ?? stroke?.opacity ?? 1)}</Polygon>`
  );
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

function imageXml(w: Writer, item: Extract<DisplayItem, { kind: 'image' }>, pageIndex: number): string {
  const usePdf = item.imageKind === 'svg' && item.pdfFileId && w.opts.resourceBytes?.(item.pdfFileId);
  const fileId = usePdf ? item.pdfFileId! : item.fileId;
  const bytes = w.opts.resourceBytes?.(fileId);
  const g = boxGeometry(w, item.rect, item.rotate);
  const frameOpen = `<Rectangle${attr('Self', w.next())} ContentType="GraphicType" ItemLayer="ulayer"${attr('ItemTransform', g.transform)} AppliedObjectStyle="ObjectStyle/$ID/[None]" FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0"${attr('Name', item.alt || (fileId.startsWith('data:') ? undefined : fileId))}>${g.geometry}`;
  if (!bytes) {
    w.warn('image.missing', `Page ${pageIndex + 1}: no bytes for picture ${fileId.slice(0, 80)}; an empty graphics frame stands in its place`);
    return `${frameOpen}</Rectangle>`;
  }
  // The picture's own size in pt, as InDesign reads it from the file.
  let pw: number;
  let ph: number;
  let kind: 'Image' | 'PDF' = 'Image';
  if (usePdf) {
    kind = 'PDF';
    const mb = /\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/.exec(new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 200000))));
    pw = mb ? Number(mb[3]) - Number(mb[1]) : g.width;
    ph = mb ? Number(mb[4]) - Number(mb[2]) : g.height;
  } else if (item.imageKind === 'svg') {
    const size = svgSize(new TextDecoder().decode(bytes));
    pw = size?.width ?? g.width;
    ph = size?.height ?? g.height;
    w.warn('image.svg', `Page ${pageIndex + 1}: ${fileId.slice(0, 80)} is an SVG; InDesign 2020 and later place SVG, older versions do not`);
  } else {
    const info = bitmapInfo(bytes);
    const ppiX = info?.resolution?.x ?? 72;
    const ppiY = info?.resolution?.y ?? 72;
    pw = ((info?.width ?? 1) * 72) / ppiX;
    ph = ((info?.height ?? 1) * 72) / ppiY;
  }
  const crop = item.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const sx = g.width / (crop.width * pw);
  const sy = g.height / (crop.height * ph);
  const tx = item.flipH ? g.width / 2 + crop.x * pw * sx : -g.width / 2 - crop.x * pw * sx;
  const ty = -g.height / 2 - crop.y * ph * sy;
  const transform = `${num(item.flipH ? -sx : sx)} 0 0 ${num(sy)} ${num(tx)} ${num(ty)}`;

  // A picture given as a data: URL (one the host prepared) has no file
  // name: it is numbered, with the extension of its type.
  const dataType = /^data:image\/([a-z+]+)[;,]/i.exec(fileId)?.[1]?.toLowerCase();
  const name = dataType
    ? `picture-${w.media.size + 1}.${dataType === 'jpeg' ? 'jpg' : dataType === 'svg+xml' ? 'svg' : dataType}`
    : (fileId.split('/').pop() ?? fileId).replace(/[^\w.\-]+/g, '_');
  let media = w.media.get(fileId);
  if (!media) {
    let path = `Links/${name}`;
    for (let i = 2; [...w.media.values()].some((m) => m.path === path); i++) path = `Links/${i}-${name}`;
    media = { path, bytes };
    w.media.set(fileId, media);
  }
  const embed = (w.opts.images ?? 'embed') === 'embed';
  const contents = embed ? `<Contents><![CDATA[${base64(bytes)}]]></Contents>` : '';
  const link = `<Link${attr('Self', w.next())}${attr('LinkResourceURI', `file:${media.path}`)} StoredState="${embed ? 'Embedded' : 'Normal'}" LinkClassID="35906" LinkClientID="257" LinkResourceModified="false" ShowInUI="true" CanEmbed="true" CanUnembed="true" CanPackage="true" ImportPolicy="NoAutoImport" ExportPolicy="NoAutoExport"/>`;
  const graphicBounds = `<GraphicBounds Left="0" Top="0"${attr('Right', pw)}${attr('Bottom', ph)}/>`;
  const inner =
    kind === 'PDF'
      ? `<PDF${attr('Self', w.next())}${attr('ItemTransform', transform)}><Properties>${contents}${graphicBounds}</Properties><PDFAttribute PageNumber="1" PDFCrop="CropContentVisibleLayers" TransparentBackground="true"/>${link}</PDF>`
      : `<Image${attr('Self', w.next())}${attr('ItemTransform', transform)}><Properties>${contents}${graphicBounds}</Properties>${link}</Image>`;
  return `${frameOpen}${inner}</Rectangle>`;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TextItem = Extract<DisplayItem, { kind: 'text' }>;
/** A text item in a story: `joinsPrevious` when it is the rest of the
 *  paragraph the item before it holds (a paragraph a frame break split). */
type StoryItem = TextItem & { joinsPrevious?: boolean };

function runProps(w: Writer, run: DisplayRun): TextProps {
  const f = parseCssFont(run.fontString);
  const fontStyle = (w.opts.fontStyleName ?? defaultFontStyleName)(f.family, run.bold && f.weight < 600 ? 700 : f.weight, run.italic || f.italic);
  let styles = w.fonts.get(f.family);
  if (!styles) w.fonts.set(f.family, (styles = new Set()));
  styles.add(fontStyle);
  const sizePt = f.sizePx * w.k;
  const p: TextProps = {
    font: f.family,
    fontStyle,
    size: sizePt,
    color: swatch(w, run.color)?.ref ?? 'Color/Black',
    tracking: run.tracking && f.sizePx ? Math.round((run.tracking / f.sizePx) * 1000) : 0,
  };
  if (run.smallCaps) p.capitalization = 'SmallCaps';
  if (run.script === 'sup') p.position = 'Superscript';
  if (run.script === 'sub') p.position = 'Subscript';
  if (run.baselineShift) p.baselineShift = run.baselineShift * w.k;
  return p;
}

const sameProps = (a: TextProps, b: TextProps) =>
  a.font === b.font && a.fontStyle === b.fontStyle && Math.abs(a.size - b.size) < 0.01 && a.color === b.color && a.tracking === b.tracking && a.capitalization === b.capitalization && a.position === b.position && a.baselineShift === b.baselineShift;

/** What a range sets beyond its paragraph style. */
function overrides(p: TextProps, style: TextProps): string {
  const d: Partial<TextProps> = {};
  if (p.fontStyle !== style.fontStyle || p.font !== style.font) d.fontStyle = p.fontStyle;
  if (Math.abs(p.size - style.size) >= 0.01) d.size = p.size;
  if (p.color !== style.color) d.color = p.color;
  if (p.tracking !== style.tracking) d.tracking = p.tracking;
  if (p.capitalization !== style.capitalization) d.capitalization = p.capitalization;
  if (p.position !== style.position) d.position = p.position;
  if (p.baselineShift !== style.baselineShift) d.baselineShift = p.baselineShift;
  return textPropsAttrs(d);
}

const JUSTIFICATION: Record<string, string> = { left: 'LeftAlign', right: 'RightAlign', center: 'CenterAlign', justify: 'LeftJustified' };

/** The paragraph's alignment; undefined when its lines cannot tell (a
 *  justified paragraph of one line reads ragged left). */
function paragraphJustification(lines: DisplayLine[]): string | undefined {
  if (lines.some((l) => l.align === 'justify')) return JUSTIFICATION.justify!;
  if (lines.every((l) => l.last) && lines[0]?.align === 'left') return undefined;
  return JUSTIFICATION[lines[0]?.align ?? 'left'] ?? 'LeftAlign';
}

/** Thin spaces (U+2009, about a fifth of an em) filling `px` at `sizePx`. */
const thinSpaces = (px: number | undefined, sizePx: number): string => ' '.repeat(Math.max(0, Math.round((px ?? 0) / (sizePx * 0.2))));

/** The runs of a text item as the paragraph reads: added and repeated
 *  hyphens dropped, the space a break swallowed put back. A chip's words
 *  join the text (its box is a rectangle of its own, `chipRects`), its
 *  gap, border and padding as thin spaces; an empty chip (a blank to fill
 *  in) is its box's width in thin spaces. */
function paragraphRuns(w: Writer, item: TextItem): { text: string; props: TextProps }[] {
  const out: { text: string; props: TextProps }[] = [];
  const push = (text: string, props: TextProps) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && sameProps(last.props, props)) last.text += text;
    else out.push({ text, props });
  };
  item.lines.forEach((line, li) => {
    // A form field's chip is room for the field (`chipFields`): its box's
    // width in thin spaces, its words left out.
    let fieldEnd = -Infinity;
    const runs = line.runs.filter((r) => {
      if (isField(w, r)) {
        const rect = chipRect(r, line);
        fieldEnd = rect ? rect.x + rect.width : r.x + r.width;
        return true;
      }
      if (!r.inline && r.x < fieldEnd - 0.01) return false;
      return !r.inline || r.inline.kind === 'chip';
    });
    if (line.runs.some((r) => r.inline && r.inline.kind !== 'chip')) w.warn('text.inline', `Inline content (maths, music, swatches) is left out: "${line.text.slice(0, 40)}"`);
    runs.forEach((run, ri) => {
      let text = run.text;
      if (run.inline?.kind === 'chip' || run.padStart || run.padEnd) {
        const sizePx = parseCssFont(run.fontString).sizePx || 12;
        const words = text.replaceAll(CHIP_PLACEHOLDER, '');
        text = run.inline?.kind === 'chip' && (!words.trim() || isField(w, run)) ? thinSpaces(run.inline.box?.width, sizePx) : `${thinSpaces(run.padStart, sizePx)}${words}${thinSpaces(run.padEnd, sizePx)}`;
      }
      if (li > 0 && ri === 0 && line.repeatedHyphen) text = text.replace(/^[-‐]/, '');
      if (ri === runs.length - 1 && line.addedHyphen) text = text.replace(/[-‐­]$/, '');
      push(text, runProps(w, run));
    });
    const next = item.lines[li + 1];
    if (!next || !runs.length) return;
    const lastProps = out[out.length - 1]?.props ?? runProps(w, runs[0]!);
    if (line.hardBreak) push(' ', lastProps);
    else if (!line.addedHyphen) {
      const end = [...line.map].reverse().find((m) => m >= 0);
      const start = next.map.find((m) => m >= 0);
      const tail = line.text.slice(-1);
      const gap = end !== undefined && start !== undefined ? start - end > 1 : !/[\s\-‐–—\/]$/.test(tail);
      if (gap && !/\s$/.test(line.text) && !/^\s/.test(next.text)) push(' ', lastProps);
    }
  });
  return out;
}

/** Characters InDesign shows as a missing glyph when the face lacks them
 *  and that set nothing: the word joiner and the zero-width no-break
 *  space. (A soft hyphen stays: InDesign reads it as a discretionary
 *  hyphen.) */
const NO_GLYPH = /[\u2060\uFEFF]/g;

/** A frame's name in its template (`cp3:body` → `body`). */
const frameName = (id: string) => id.replace(/^cp\d+:/, '');

const STYLE_NAMES: Record<string, string> = { body: 'Body', heading: 'Heading', list: 'List', quote: 'Quote', caption: 'Caption', footnote: 'Footnote', header: 'Header', footer: 'Footer', design: 'Design' };

function paragraphStyleName(w: Writer, item: TextItem, frame: VDTFrame | undefined): string {
  const names = { ...STYLE_NAMES, ...w.opts.styleNames };
  if (item.role === 'heading') return `${names.heading ?? 'Heading'} ${item.level ?? 1}`;
  if (frame) return frame.styleId ?? frameName(frame.name);
  return names[item.role] ?? item.role;
}

function paragraphStyle(w: Writer, name: string, first: TextProps, leading: number, justification: string): ParagraphStyleDef {
  let s = w.paraStyles.get(name);
  if (!s) w.paraStyles.set(name, (s = { self: styleSelf('ParagraphStyle', name), name, props: first, leading, justification }));
  return s;
}

/** A story: one paragraph per text item. A list item's marker joins its
 *  item's paragraph (marker, tab, text, hanging indent); the rest of a
 *  paragraph a frame break split joins its paragraph; sizes and leading
 *  follow the frame's text scale (`fit.shrinkText`). */
function storyXml(w: Writer, id: string, items: StoryItem[], frame: VDTFrame | undefined): string {
  const paras: string[] = [];
  let prev: StoryItem | undefined;
  const sc = frame?.scale ?? 1;
  const scaled = (runs: { text: string; props: TextProps }[]) =>
    sc === 1 ? runs : runs.map((r) => ({ ...r, props: { ...r.props, size: r.props.size * sc, ...(r.props.baselineShift ? { baselineShift: r.props.baselineShift * sc } : {}) } }));
  const textLeft = Math.min(...items.map((i) => i.bbox.x));
  let marker: { runs: { text: string; props: TextProps }[]; x: number } | undefined;
  items.forEach((item, i) => {
    if (item.role === 'marker') {
      marker = { runs: scaled(paragraphRuns(w, item)), x: item.lines[0]?.runs[0]?.x ?? item.bbox.x };
      return;
    }
    let runs = scaled(paragraphRuns(w, item));
    let hang: { left: number; first: number } | undefined;
    if (marker) {
      runs = [...marker.runs.map((r) => ({ ...r, text: `${r.text}\t` })), ...runs];
      // The item's text starts where its lines do (the block's box takes in the marker).
      const textX = Math.min(...item.lines.map((l) => l.runs[0]?.x ?? item.bbox.x));
      hang = { left: (textX - textLeft) * w.k, first: (marker.x - textX) * w.k };
      marker = undefined;
    }
    if (!runs.length) return;
    const joins = item.joinsPrevious && paras.length > 0;
    if (joins) {
      // No paragraph return between the two parts; the word space the
      // frame break swallowed comes back unless a hyphen split a word.
      paras[paras.length - 1] = paras[paras.length - 1]!.replace(/<Br\/><\/CharacterStyleRange><\/ParagraphStyleRange>$/, '</CharacterStyleRange></ParagraphStyleRange>');
      const before = prev?.lines[prev.lines.length - 1];
      if (before && !before.addedHyphen && !/\s$/.test(before.text) && !/^\s/.test(runs[0]!.text)) runs[0] = { ...runs[0]!, text: ` ${runs[0]!.text}` };
    }
    const lines = item.lines;
    const leading = (lines[0]?.lineHeight ?? 0) * w.k * sc;
    const justification = paragraphJustification(lines);
    // The style takes the look most of the paragraph's text has (a bold
    // lead-in does not make the style bold).
    const weight = new Map<TextProps, number>();
    for (const r of runs) {
      const same = [...weight.keys()].find((p) => sameProps(p, r.props)) ?? r.props;
      weight.set(same, (weight.get(same) ?? 0) + r.text.trim().length);
    }
    const dominant = [...weight].sort((a, b) => b[1] - a[1])[0]![0];
    const style = paragraphStyle(w, paragraphStyleName(w, item, frame), dominant, leading, justification ?? 'LeftAlign');
    let local = '';
    if (Math.abs(style.leading - leading) >= 0.01) local += attr('Leading', leading);
    if (justification && style.justification !== justification) local += attr('Justification', justification);
    if (hang) local += attr('LeftIndent', hang.left) + attr('FirstLineIndent', hang.first);
    const prevLast = prev?.lines[prev.lines.length - 1];
    if (!joins && prevLast && lines[0] && prev?.frame === item.frame) {
      // Baseline to baseline = leading + space before (InDesign).
      const before = (lines[0].baseline - prevLast.baseline) * w.k - leading;
      if (before > 0.05) local += attr('SpaceBefore', before);
    }
    prev = item;
    const ranges = runs.map((r, ri) => {
      const br = ri === runs.length - 1 && i < items.length - 1 ? '<Br/>' : '';
      const o = overrides(r.props, style.props);
      const font = r.props.font !== style.props.font ? `<Properties><AppliedFont type="string">${escapeXml(r.props.font)}</AppliedFont></Properties>` : '';
      const content = r.text.replace(NO_GLYPH, '').split(' ').map((t) => (t ? `<Content>${escapeXml(t)}</Content>` : '')).join('<Content> </Content>');
      return `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"${o}>${font}${content}${br}</CharacterStyleRange>`;
    });
    // Styles do not hyphenate (InDesign does by default); a paragraph the
    // composer hyphenated does.
    if (lines.some((l) => l.addedHyphen)) local += ' Hyphenation="true"';
    // The tab after a list marker stops at the text's indent, not at
    // InDesign's default stops.
    const tabs = hang
      ? `<Properties><TabList type="list"><ListItem type="record"><Alignment type="enumeration">LeftAlign</Alignment><AlignmentCharacter type="string">.</AlignmentCharacter><Leader type="string"></Leader><Position type="unit">${num(hang.left)}</Position></ListItem></TabList></Properties>`
      : '';
    paras.push(`<ParagraphStyleRange${attr('AppliedParagraphStyle', style.self)}${local}>${tabs}${ranges.join('')}</ParagraphStyleRange>`);
  });
  return (
    `${XML_HEAD}<idPkg:Story xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<Story${attr('Self', id)} AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">` +
    '<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>' +
    '<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false"/>' +
    paras.join('') +
    '</Story></idPkg:Story>'
  );
}

const union = (rects: DisplayRect[]): DisplayRect => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
};

/** A frame of a chain: its own id, its neighbours', the chain's story
 *  (written with the chain's first frame on the page) and its items. */
interface ChainLink {
  self: string;
  story: string;
  prev?: string;
  next?: string;
  write: boolean;
  storyItems: StoryItem[];
}

/** One text frame: a composed frame's text, or a single text item outside
 *  frames, with its own story or its chain's. The box is the frame's (or
 *  the item's), the left and right insets put the text where Postext set
 *  it, and a fixed first-baseline offset puts the first baseline exactly. */
function textFrameXml(w: Writer, items: TextItem[], frame: VDTFrame | undefined, link?: ChainLink): string {
  const withLines = items.filter((i) => i.lines.length);
  if (!withLines.length && !(link && frame)) return '';
  // A frame of a chain that holds no text of its own on this page.
  const measured: { bbox: DisplayRect; lines: { baseline: number; lineHeight: number }[]; rotate?: number }[] = withLines.length ? withLines : [{ bbox: { ...frame!.rect }, lines: [{ baseline: frame!.rect.y, lineHeight: 0 }], rotate: 0 }];
  const text = union(measured.map((i) => i.bbox));
  const box = frame ? { ...frame.rect } : { ...text };
  const rotate = frame?.rotate ?? measured[0]!.rotate ?? 0;
  // Room below for InDesign's own composer.
  if (!frame) box.height += (measured[0]!.lines[0]?.lineHeight ?? 0) * 0.5;
  const g = boxGeometry(w, box, rotate);
  const left = Math.max(0, (text.x - box.x) * w.k);
  const right = Math.max(0, (box.x + box.width - (text.x + text.width)) * w.k);
  const firstBaseline = measured[0]!.lines[0]!.baseline;
  const top = Math.max(0, (text.y - box.y) * w.k);
  const baselineOffset = Math.max(0, (firstBaseline - text.y) * w.k);
  const storyId = link?.story ?? w.next();
  if (!link || link.write) w.stories.push({ id: storyId, xml: storyXml(w, storyId, link?.storyItems ?? withLines, frame) });
  return (
    `<TextFrame${attr('Self', link?.self ?? w.next())}${attr('ParentStory', storyId)}${attr('PreviousTextFrame', link?.prev ?? 'n')}${attr('NextTextFrame', link?.next ?? 'n')} ContentType="TextType" ItemLayer="ulayer"` +
    `${attr('ItemTransform', g.transform)} AppliedObjectStyle="ObjectStyle/$ID/[None]" FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0"${attr('Name', frame ? frameName(frame.name) : undefined)}>` +
    g.geometry +
    `<TextFramePreference TextColumnCount="1" FirstBaselineOffset="FixedHeight"${attr('MinimumFirstBaselineOffset', baselineOffset)} VerticalJustification="TopAlign"${attr('InsetSpacing', `${num(top)} ${num(left)} 0 ${num(right)}`)} AutoSizingType="Off" IgnoreWrap="false"/>` +
    '</TextFrame>'
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** The frames of the chain `f` belongs to on this page, in order. */
function chainOf(f: VDTFrame, frames: Map<string, VDTFrame>): VDTFrame[] {
  let head = f;
  const seen = new Set([head.id]);
  while (head.continuedFrom && frames.has(head.continuedFrom) && !seen.has(head.continuedFrom)) {
    head = frames.get(head.continuedFrom)!;
    seen.add(head.id);
  }
  const chain = [head];
  for (let c = head; c.continuesTo && frames.has(c.continuesTo) && !chain.some((x) => x.id === c.continuesTo); ) {
    c = frames.get(c.continuesTo)!;
    chain.push(c);
  }
  return chain;
}

function spreadXml(w: Writer, id: string, page: DisplayPage, frames: Map<string, VDTFrame>, index: number, gap: number): string {
  const out: string[] = [];
  // The text of one frame (of one chain of frames) goes into one story,
  // written where its first item paints; the rest of the items keep the
  // display list's order.
  const byFrame = new Map<string, TextItem[]>();
  for (const it of page.items) if (it.kind === 'text' && it.frame && frames.has(it.frame)) byFrame.set(it.frame, [...(byFrame.get(it.frame) ?? []), it]);
  const done = new Set<string>();
  // Outside frames a list item's marker shares its item's text frame.
  const markerFor = new Map<TextItem, TextItem>();
  const held = new Set<TextItem>();
  page.items.forEach((it, i) => {
    if (it.kind !== 'text' || it.role !== 'marker' || (it.frame && byFrame.has(it.frame))) return;
    const item = page.items.slice(i + 1).find((x): x is TextItem => x.kind === 'text');
    if (item && item.role !== 'marker' && !(item.frame && byFrame.has(item.frame)) && item.source?.blockKey === it.source?.blockKey) {
      markerFor.set(item, it);
      held.add(it);
    }
  });
  for (const it of page.items) {
    switch (it.kind) {
      case 'rect':
        out.push(rectXml(w, it));
        break;
      case 'rule':
        out.push(ruleXml(w, it));
        break;
      case 'path':
        out.push(pathXml(w, it));
        break;
      case 'image':
        out.push(imageXml(w, it, page.index));
        break;
      case 'text': {
        if (!it.frame || !byFrame.has(it.frame)) {
          if (held.has(it)) break;
          const marker = markerFor.get(it);
          out.push(...chipRects(w, it), textFrameXml(w, marker ? [marker, it] : [it], undefined), ...chipFields(w, it, undefined));
          break;
        }
        if (done.has(it.frame)) break;
        const chain = chainOf(frames.get(it.frame)!, frames);
        const own = chain.map((c) => byFrame.get(c.id) ?? []);
        for (const c of chain) done.add(c.id);
        // Chip boxes go behind all the chain's text.
        for (const items of own) for (const t of items) out.push(...chipRects(w, t));
        // Form fields go over it, each at its frame's text scale.
        const fields = () => chain.flatMap((c, k) => own[k]!.flatMap((t) => chipFields(w, t, c)));
        if (chain.length < 2) {
          out.push(textFrameXml(w, own[0]!, chain[0]), ...fields());
          break;
        }
        const story = w.next();
        const selfs = chain.map(() => w.next());
        const storyItems: StoryItem[] = [];
        for (const items of own) {
          items.forEach((x, k) => {
            const before = storyItems[storyItems.length - 1];
            storyItems.push(k === 0 && before?.source?.blockKey && before.source.blockKey === x.source?.blockKey ? { ...x, joinsPrevious: true } : x);
          });
        }
        chain.forEach((c, k) => {
          out.push(textFrameXml(w, own[k]!, c, { story, self: selfs[k]!, prev: selfs[k - 1], next: selfs[k + 1], write: k === 0, storyItems }));
        });
        out.push(...fields());
        break;
      }
      case 'table':
        w.warn('table', `Page ${page.index + 1}: tables are not written yet`);
        break;
    }
  }
  const pageW = (page.trim?.width ?? page.width) * w.k;
  return (
    `${XML_HEAD}<idPkg:Spread xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<Spread${attr('Self', id)} PageTransitionType="None" ShowMasterItems="true" PageCount="1" BindingLocation="0" AllowPageShuffle="true"${attr('ItemTransform', `1 0 0 1 0 ${num(index * (w.pageH + gap))}`)} FlattenerOverride="Default">` +
    `<Page${attr('Self', `${id}p`)}${attr('Name', page.label ?? String(index + 1))} AppliedMaster="n"${attr('GeometricBounds', `0 0 ${num(w.pageH)} ${num(pageW)}`)}${attr('ItemTransform', `1 0 0 1 0 ${num(-w.pageH / 2)}`)} OverrideList="" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">` +
    `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="0" Bottom="0" Left="0" Right="0" ColumnDirection="Horizontal"${attr('ColumnsPositions', `0 ${num(pageW)}`)}/>` +
    '</Page>' +
    out.join('') +
    '</Spread></idPkg:Spread>'
  );
}

/** Write the laid-out documents as an IDML package. */
export function idmlDocument(options: IdmlOptions): IdmlResult {
  const { docs } = options;
  const first = docs[0];
  if (!first || !first.pages.length) throw new Error('idmlDocument: nothing laid out');
  let n = 0x100;
  const seen = new Set<string>();
  const palette = new Map<string, string>();
  for (const e of first.config.colorPalette ?? []) palette.set(e.value.hex.slice(0, 7).toLowerCase(), e.name);
  const w: Writer = {
    next: () => `u${(n++).toString(16)}`,
    k: 72 / first.config.page.dpi,
    ox: 0,
    oy: 0,
    pageH: 0,
    swatches: new Map(),
    cmyk: authoredCmykColors(first.config),
    palette,
    fonts: new Map(),
    paraStyles: new Map(),
    stories: [],
    media: new Map(),
    opts: options,
    warn: (code, message) => {
      const key = `${code}\u0000${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.onWarning?.({ code, message });
    },
  };

  const spreads: { id: string; xml: string }[] = [];
  let geometry = { width: 0, height: 0, bleed: 0 };
  for (const doc of docs) {
    w.k = 72 / doc.config.page.dpi;
    for (let p = 0; p < doc.pages.length; p++) {
      const page = pageDisplayList(doc, p);
      const trim = page.trim ?? { x: 0, y: 0, width: page.width, height: page.height };
      w.ox = trim.x;
      w.oy = trim.y;
      w.pageH = trim.height * w.k;
      if (!spreads.length) geometry = { width: trim.width * w.k, height: trim.height * w.k, bleed: trim.x * w.k };
      else if (Math.abs(trim.width * w.k - geometry.width) > 0.5 || Math.abs(w.pageH - geometry.height) > 0.5) w.warn('page.size', `Page ${p + 1} has its own size; IDML pages keep it, the document setup shows the first page's`);
      const frames = new Map((doc.pages[p]!.composed?.frames ?? []).map((f) => [f.id, f] as const));
      const id = w.next();
      spreads.push({ id, xml: spreadXml(w, id, page, frames, spreads.length, 36) });
    }
  }

  const g = { ...geometry, pages: spreads.length };
  const parts = new Map<string, Uint8Array>();
  parts.set('mimetype', strToU8(IDML_MIMETYPE));
  parts.set('designmap.xml', strToU8(designMapXml({ title: options.title ?? 'Postext', layerId: 'ulayer', masterId: 'umaster', spreads: spreads.map((s) => s.id), stories: w.stories.map((s) => s.id) })));
  parts.set('META-INF/container.xml', strToU8(CONTAINER_XML));
  parts.set('Resources/Graphic.xml', strToU8(graphicXml([...w.swatches.values()])));
  parts.set('Resources/Fonts.xml', strToU8(fontsXml(w.fonts)));
  parts.set('Resources/Styles.xml', strToU8(stylesXml([...w.paraStyles.values()])));
  parts.set('Resources/Preferences.xml', strToU8(preferencesXml(g)));
  parts.set('MasterSpreads/MasterSpread_umaster.xml', strToU8(masterSpreadXml('umaster', g)));
  for (const s of spreads) parts.set(`Spreads/Spread_${s.id}.xml`, strToU8(s.xml));
  for (const s of w.stories) parts.set(`Stories/Story_${s.id}.xml`, strToU8(s.xml));
  parts.set('XML/BackingStory.xml', strToU8(BACKING_STORY_XML));

  // The mimetype first and stored, as for EPUB and ODF.
  const z: Zippable = {};
  for (const [path, bytes] of parts) z[path] = path === 'mimetype' ? [bytes, { level: 0 }] : bytes;
  const bytes = zipSync(z, { level: 6, mtime: new Date(1980, 0, 1, 0, 0, 0) });
  return { bytes, links: [...w.media.values()] };
}
