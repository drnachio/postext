// Pictures of the formatted Word export (#1392): bitmaps as `a:blip`
// (PNG, JPEG, GIF as they are), SVG as `asvg:svgBlip` with a PNG fallback
// rasterised at print resolution, safe-area crops as `a:srcRect`, turned
// and mirrored pictures (comic art) through `a:xfrm rot` / `flipH`. Inline maths and music are small SVG
// pictures anchored where their run stands.

import { strFromU8, strToU8 } from 'fflate';
import type { DisplayItem, DisplayRect } from '../../paint/displayList/types.js';
import { base64Decode } from '../anchors/base64.js';
import { wordFontFor } from '../fonts/plan.js';
import type { WordFontPlan } from '../fonts/types.js';
import { anchorRun, pictureGraphic, pictureShapeGraphic, type BlipRefs } from './drawing.js';
import type { WriterContext } from './types.js';

type ImageItem = Extract<DisplayItem, { kind: 'image' }>;

/** Resolution of the PNG that stands in for an SVG where SVG is not read. */
export const FALLBACK_DPI = 600;
/** Longest side of a fallback PNG, px. */
const MAX_FALLBACK_PX = 6000;
/** A transparent 1×1 PNG: the fallback when nothing can rasterise an SVG. */
const BLANK_PNG = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

/** The picture format Word takes for these bytes, from their magic. */
export function sniffPicture(bytes: Uint8Array): 'png' | 'jpeg' | 'gif' | 'svg' | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'gif';
  const head = strFromU8(bytes.subarray(0, Math.min(bytes.length, 512))).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg')) || head.startsWith('<!--')) return 'svg';
  return undefined;
}

function fallbackSize(rect: DisplayRect, dpi: number): { w: number; h: number } {
  let w = Math.max(1, Math.ceil((rect.width * FALLBACK_DPI) / dpi));
  let h = Math.max(1, Math.ceil((rect.height * FALLBACK_DPI) / dpi));
  const k = Math.max(w, h) / MAX_FALLBACK_PX;
  if (k > 1) {
    w = Math.max(1, Math.round(w / k));
    h = Math.max(1, Math.round(h / k));
  }
  return { w, h };
}

const unquote = (f: string): string => f.trim().replace(/^(['"])(.*)\1$/, '$2').trim();

/** The embedded Word family that leads a `font-family` list (its first
 *  family the plan holds) and the weight that family's slot takes (''
 *  weight: none was given). The slot's weight wins over the web one: a
 *  semibold slot is a family of its own set at 400, and 600 would make
 *  Word and LibreOffice embolden it (the web names after it are family
 *  fallbacks only). */
function wordFamilyList(plan: WordFontPlan, list: string, weight: string, style: string, quote: string): { list: string; weight?: string } | undefined {
  const families = new Set([...plan.map.keys()].map((k) => k.split('|')[0]!.toLowerCase()));
  const fam = list.split(',').map(unquote).find((f) => families.has(f.toLowerCase()));
  if (!fam) return undefined;
  const w = /^\d+$/.test(weight) ? Number(weight) : /bold/i.test(weight) ? 700 : 400;
  const ref = wordFontFor(plan, `${/italic|oblique/i.test(style) ? 'italic ' : ''}${w} 16px "${fam}"`);
  if (ref.family.toLowerCase() === fam.toLowerCase()) return undefined;
  const slot = ref.bold ? '700' : '400';
  return { list: `${quote}${ref.family}${quote}, ${list}`, ...(weight && weight !== slot ? { weight: slot } : {}) };
}

const declRe = (name: string): RegExp => new RegExp(`((?:^|[;{\\s])${name}\\s*:\\s*)([^;}]*[^;}\\s])`, 'i');
const SIZE = /^(?:[\d.]+(?:px|pt|em|rem|%|ex|ch|mm|cm|in|pc|q|vw|vh)|xx?-small|small|medium|large|xx?x?-large|larger|smaller)(?:\/\S+)?$/i;
const WEIGHT = /^(?:bold|bolder|lighter|\d{3})$/i;

/** The CSS `font` shorthand cut into what stands before the size, the size
 *  and the family list. */
function shorthand(value: string): { pre: string[]; size: string; list: string } | undefined {
  const tokens = value.trim().split(/\s+/);
  const i = tokens.findIndex((t) => SIZE.test(t));
  if (i < 0 || i === tokens.length - 1) return undefined;
  return { pre: tokens.slice(0, i), size: tokens[i]!, list: tokens.slice(i + 1).join(' ') };
}

interface FontDecls {
  family?: string;
  weight?: string;
  style?: string;
}

/** Font family, weight and style CSS declarations give (longhands over the
 *  `font` shorthand). */
function fontOfDecls(decls: string): FontDecls {
  const get = (name: string): string | undefined => declRe(name).exec(decls)?.[2]?.trim();
  const sh = shorthand(get('font') ?? '');
  const family = get('font-family') ?? sh?.list;
  const weight = get('font-weight') ?? sh?.pre.find((t) => WEIGHT.test(t));
  const style = get('font-style') ?? sh?.pre.find((t) => /^(?:italic|oblique)$/i.test(t));
  return { ...(family ? { family } : {}), ...(weight ? { weight } : {}), ...(style ? { style } : {}) };
}

/** CSS declarations with their family list and weight replaced (longhand,
 *  else in the `font` shorthand). */
function setFontDecls(decls: string, list: string | undefined, weight: string | undefined): string {
  let out = decls;
  const put = (name: string, value: string): boolean => {
    if (!declRe(name).test(out)) return false;
    out = out.replace(declRe(name), (_m, head: string) => `${head}${value}`);
    return true;
  };
  const sh = (f: (s: NonNullable<ReturnType<typeof shorthand>>) => string): void => {
    const m = declRe('font').exec(out);
    const s = m ? shorthand(m[2]!) : undefined;
    if (s) put('font', f(s));
  };
  if (list && !put('font-family', list)) sh((s) => [...s.pre, s.size, list].join(' '));
  if (weight && !put('font-weight', weight)) sh((s) => [...s.pre.map((t) => (WEIGHT.test(t) ? weight : t)), s.size, s.list].join(' '));
  return out;
}

/** A `<style>` rule body with its font family and weight rewritten. */
function wordFontRule(plan: WordFontPlan, decls: string): string {
  const f = fontOfDecls(decls);
  const r = f.family ? wordFamilyList(plan, f.family, f.weight ?? '', f.style ?? '', '"') : undefined;
  return r ? setFontDecls(decls, r.list, r.weight) : decls;
}

const attrRe = (name: string): RegExp => new RegExp(`(\\s${name}\\s*=\\s*)(?:"([^"]*)"|'([^']*)')`, 'i');

function attrOf(tag: string, name: string): { value: string; quote: string } | undefined {
  const m = attrRe(name).exec(tag);
  return m ? { value: m[2] ?? m[3] ?? '', quote: m[2] !== undefined ? '"' : "'" } : undefined;
}

function setAttr(tag: string, name: string, f: (value: string, quote: string) => string): string {
  return tag.replace(attrRe(name), (_m, head: string, dq: string | undefined, sq: string | undefined) => {
    const q = dq !== undefined ? '"' : "'";
    return `${head}${q}${f(dq ?? sq ?? '', q)}${q}`;
  });
}

/** A tag with its font rewritten: the family, weight and style each from
 *  the `style` attribute, else from the presentation attribute, and each
 *  written back where it was found. */
function wordFontTag(plan: WordFontPlan, tag: string): string {
  const styleAttr = attrOf(tag, 'style');
  const css = styleAttr ? fontOfDecls(styleAttr.value) : {};
  const famAttr = attrOf(tag, 'font-family');
  const list = css.family ?? famAttr?.value;
  if (!list) return tag;
  const weight = css.weight ?? attrOf(tag, 'font-weight')?.value ?? '';
  const style = css.style ?? attrOf(tag, 'font-style')?.value ?? '';
  const inStyle = css.family !== undefined;
  const outer = inStyle ? styleAttr!.quote : famAttr!.quote;
  const r = wordFamilyList(plan, list, weight, style, outer === '"' ? "'" : '"');
  if (!r) return tag;
  let t = tag;
  const cssWeight = css.weight !== undefined ? r.weight : undefined;
  if (inStyle || cssWeight) t = setAttr(t, 'style', (decls) => setFontDecls(decls, inStyle ? r.list : undefined, cssWeight));
  if (!inStyle) t = setAttr(t, 'font-family', () => r.list);
  if (r.weight && css.weight === undefined) t = setAttr(t, 'font-weight', () => r.weight!);
  return t;
}

/**
 * An SVG whose text names the fonts the document embeds: the font plan
 * renames every family (' PTX'), and Word and LibreOffice resolve SVG
 * text against the document's and the system's fonts, so `font-family`
 * (attributes, `style` attributes, `<style>` rules, the `font`
 * shorthand) is led by the embedded name and the weight set to the
 * slot's (#1406). `@font-face` rules keep the SVG's own faces as they are.
 */
export function svgWithWordFonts(svg: string, plan: WordFontPlan | undefined): string {
  if (!plan || !plan.map.size || !/font/i.test(svg)) return svg;
  const out = svg.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) =>
    `<style${attrs}>${css.replace(/(@font-face\s*)?\{[^{}]*\}/gi, (body, face: string | undefined) => (face ? body : wordFontRule(plan, body)))}</style>`,
  );
  return out.replace(/<[A-Za-z][^<>]*>/g, (tag) => (/\sfont|style\s*=/i.test(tag) ? wordFontTag(plan, tag) : tag));
}

/** An SVG with `currentColor` replaced by `ink`: Word's SVG renderer
 *  paints a `currentColor` stroke or fill as nothing (a score lost its
 *  staff lines and stems, #1444). `ink` is the colour of the text the
 *  SVG sits in, as the canvas and the PDF paint it; the root's own
 *  `color` wins when the SVG sets one. */
export function svgWithInk(svg: string, ink = '#000000'): string {
  if (!/currentColor/i.test(svg)) return svg;
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const own = /\scolor\s*=\s*["']([^"']+)["']/i.exec(root)?.[1] ?? /style\s*=\s*["'][^"']*(?:^|;|\s)color\s*:\s*([^;"']+)/i.exec(root)?.[1];
  const colour = (own && !/currentColor|inherit/i.test(own) ? own : ink).trim();
  return svg.replace(/currentColor/gi, colour);
}

/** Register an SVG with its PNG fallback (drawn from the SVG as the book
 *  has it: the rasteriser knows the web fonts). */
async function svgRefs(ctx: WriterContext, svg: string, rect: DisplayRect, label: string, ink?: string): Promise<BlipRefs> {
  svg = svgWithInk(svg, ink);
  const svgRel = ctx.pkg.addMedia(strToU8(svgWithWordFonts(svg, ctx.plan)), 'svg');
  const { w, h } = fallbackSize(rect, ctx.dpi);
  let png: Uint8Array | undefined;
  if (ctx.rasterizeSvg) {
    try {
      png = await ctx.rasterizeSvg(svg, w, h);
    } catch (e) {
      ctx.warn('svg-raster-failed', `${label}: the PNG fallback could not be drawn (${(e as Error).message})`);
    }
  }
  if (!png || sniffPicture(png) !== 'png') {
    if (!ctx.rasterizeSvg) ctx.warn('svg-no-fallback', `${label}: no rasteriser, the SVG has a blank PNG fallback (older readers show nothing)`);
    png = BLANK_PNG;
  }
  return { blip: ctx.pkg.addMedia(png, 'png'), svg: svgRel };
}

/** Relationship ids of a resource file, embedded once per file and size. */
async function fileRefs(ctx: WriterContext, item: ImageItem): Promise<BlipRefs | undefined> {
  const { w, h } = fallbackSize(item.rect, ctx.dpi);
  const key = `${item.fileId}@${w}x${h}`;
  if (ctx.media.has(key)) return ctx.media.get(key);
  let refs: BlipRefs | undefined;
  const bytes = ctx.resourceBytes?.(item.fileId);
  if (!bytes) {
    ctx.warn('picture-missing', `picture ${item.fileId}: no bytes, left out`);
  } else {
    const kind = sniffPicture(bytes);
    if (kind === 'svg') refs = await svgRefs(ctx, strFromU8(bytes), item.rect, `picture ${item.fileId}`);
    else if (kind) refs = { blip: ctx.pkg.addMedia(bytes, kind) };
    else ctx.warn('picture-format', `picture ${item.fileId}: a format Word does not read (not PNG, JPEG, GIF or SVG), left out`);
  }
  ctx.media.set(key, refs);
  return refs;
}

/** `a:srcRect` of a safe-area crop (visible part in the unit square). */
export function srcRect(crop: ImageItem['crop']): string {
  if (!crop) return '';
  const pc = (v: number): number => Math.round(v * 100000);
  const l = pc(crop.x);
  const t = pc(crop.y);
  const r = pc(1 - crop.x - crop.width);
  const b = pc(1 - crop.y - crop.height);
  if (!l && !t && !r && !b) return '';
  return `<a:srcRect l="${l}" t="${t}" r="${r}" b="${b}"/>`;
}

/** `a:fillRect` of a safe-area crop for a shape filled with the
 *  picture: the whole picture's rectangle relative to the shape. */
export function cropFillRect(crop: ImageItem['crop']): string {
  if (!crop || crop.width <= 0 || crop.height <= 0) return '';
  const pc = (v: number): number => Math.round(v * 100000);
  const l = pc(-crop.x / crop.width);
  const t = pc(-crop.y / crop.height);
  const r = pc(-(1 - crop.x - crop.width) / crop.width);
  const b = pc(-(1 - crop.y - crop.height) / crop.height);
  if (!l && !t && !r && !b) return '';
  return `<a:fillRect l="${l}" t="${t}" r="${r}" b="${b}"/>`;
}

/** An image item as an anchored picture ('' when it cannot be embedded). */
export async function imageRun(ctx: WriterContext, item: ImageItem): Promise<string> {
  const refs = await fileRefs(ctx, item);
  if (!refs) return '';
  if (item.tint) ctx.warn('picture-tint', `picture ${item.fileId}: its tint is not carried into Word`);
  const crop = srcRect(item.crop);
  const fill = cropFillRect(item.crop);
  // A turned or flipped picture stays a picture: LibreOffice draws a
  // shape's picture fill unturned and stretched into the turned frame (an
  // atlas map turned a quarter came out upright under its grid, #1444).
  const asShape = item.rotate || item.flipH ? undefined : (_id: number, cx: number, cy: number): string => pictureShapeGraphic(cx, cy, refs, fill ? { fillRect: fill } : {});
  return anchorRun(ctx, { rect: item.rect, name: 'ptx picture', ...(asShape ? { asShape } : {}), ...(item.rotate ? { rotate: item.rotate } : {}), ...(item.alt ? { descr: item.alt } : {}) }, (id, cx, cy) =>
    pictureGraphic(id, cx, cy, refs, { name: item.fileId, ...(item.alt ? { descr: item.alt } : {}), ...(crop ? { srcRect: crop } : {}), ...(item.rotate ? { rotate: item.rotate } : {}), ...(item.flipH ? { flipH: true } : {}) }),
  );
}

/** An inline SVG (maths, music) as a picture anchored over its run. */
export async function inlineSvgRun(ctx: WriterContext, svg: string, rect: DisplayRect, rotate: number | undefined, kind: string, ink?: string): Promise<string> {
  const key = `inline:${ink ?? ''}:${svg.length}:${svg}`;
  let refs = ctx.media.get(key);
  if (!ctx.media.has(key)) {
    refs = await svgRefs(ctx, svg, rect, `inline ${kind}`, ink);
    ctx.media.set(key, refs);
  }
  if (!refs) return '';
  return anchorRun(ctx, { rect, name: `ptx ${kind}`, ...(rotate ? { rotate } : {}) }, (id, cx, cy) =>
    pictureGraphic(id, cx, cy, refs, { name: kind, ...(rotate ? { rotate } : {}) }),
  );
}
