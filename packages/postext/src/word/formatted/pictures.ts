// Pictures of the formatted Word export (#1392): bitmaps as `a:blip`
// (PNG, JPEG, GIF as they are), SVG as `asvg:svgBlip` with a PNG fallback
// rasterised at print resolution, safe-area crops as `a:srcRect`, turned
// pictures through `a:xfrm rot`. Inline maths and music are small SVG
// pictures anchored where their run stands.

import { strFromU8, strToU8 } from 'fflate';
import type { DisplayItem, DisplayRect } from '../../paint/displayList/types.js';
import { base64Decode } from '../anchors/base64.js';
import { anchorRun, pictureGraphic, type BlipRefs } from './drawing.js';
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

/** Register an SVG with its PNG fallback. */
async function svgRefs(ctx: WriterContext, svg: string, rect: DisplayRect, label: string): Promise<BlipRefs> {
  const svgRel = ctx.pkg.addMedia(strToU8(svg), 'svg');
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

/** An image item as an anchored picture ('' when it cannot be embedded). */
export async function imageRun(ctx: WriterContext, item: ImageItem): Promise<string> {
  const refs = await fileRefs(ctx, item);
  if (!refs) return '';
  if (item.tint) ctx.warn('picture-tint', `picture ${item.fileId}: its tint is not carried into Word`);
  const crop = srcRect(item.crop);
  return anchorRun(ctx, { rect: item.rect, name: 'ptx picture', ...(item.rotate ? { rotate: item.rotate } : {}), ...(item.alt ? { descr: item.alt } : {}) }, (id, cx, cy) =>
    pictureGraphic(id, cx, cy, refs, { name: item.fileId, ...(item.alt ? { descr: item.alt } : {}), ...(crop ? { srcRect: crop } : {}), ...(item.rotate ? { rotate: item.rotate } : {}) }),
  );
}

/** An inline SVG (maths, music) as a picture anchored over its run. */
export async function inlineSvgRun(ctx: WriterContext, svg: string, rect: DisplayRect, rotate: number | undefined, kind: string): Promise<string> {
  const key = `inline:${svg.length}:${svg}`;
  let refs = ctx.media.get(key);
  if (!ctx.media.has(key)) {
    refs = await svgRefs(ctx, svg, rect, `inline ${kind}`);
    ctx.media.set(key, refs);
  }
  if (!refs) return '';
  return anchorRun(ctx, { rect, name: `ptx ${kind}`, ...(rotate ? { rotate } : {}) }, (id, cx, cy) =>
    pictureGraphic(id, cx, cy, refs, { name: kind, ...(rotate ? { rotate } : {}) }),
  );
}
