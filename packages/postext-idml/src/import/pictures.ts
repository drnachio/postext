// Pictures: the graphic a frame holds as a resource of the book.
//
// An embedded picture is read from the package; a linked one from the
// package's own files when it carries them, else from the host
// (`linkBytes`). A picture whose bytes nobody has is a placeholder of the
// frame's size and an entry of `missingLinks`. Formats Postext does not
// draw (PDF, EPS, AI, PSD, TIFF) are placeholders too, named in the
// report.

import type { Resource, ResourcePlacement } from 'postext';
import { bitmapInfo } from 'postext/writer';
import type { IdmlPageItem } from '../model/document.js';
import { boxHeight, boxWidth, pathExtent } from '../model/geometry.js';
import { graphicCrop } from '../resolve/geometry.js';
import type { Context } from './context.js';
import { idOf } from './escape.js';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function sniff(b: Uint8Array): { format: string; ext: string; kind: 'bitmap' | 'svg' } | { unsupported: string } | undefined {
  const at = (n: number, ...bytes: number[]): boolean => bytes.every((v, k) => b[n + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { format: 'png', ext: 'png', kind: 'bitmap' };
  if (at(0, 0xff, 0xd8, 0xff)) return { format: 'jpeg', ext: 'jpg', kind: 'bitmap' };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { format: 'gif', ext: 'gif', kind: 'bitmap' };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { format: 'webp', ext: 'webp', kind: 'bitmap' };
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return { unsupported: 'PDF' };
  if (at(0, 0x25, 0x21, 0x50, 0x53) || at(0, 0xc5, 0xd0, 0xd3, 0xc6)) return { unsupported: 'EPS' };
  if (at(0, 0x38, 0x42, 0x50, 0x53)) return { unsupported: 'PSD' };
  if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return { unsupported: 'TIFF' };
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 2048)));
  if (/<svg[\s>]/i.test(head)) return { format: 'svg', ext: 'svg', kind: 'svg' };
  return undefined;
}

export interface PictureOptions {
  caption?: string;
  note?: string;
  placement?: ResourcePlacement;
  /** Resource type; `picture` (no label, no number) unless a caption's
   *  label says otherwise. */
  typeId?: string;
  /** The page template draws the picture cropped as its frame crops it
   *  (a cover fit that shows the same part, `exactCover`): the crop is
   *  kept, not approximated, and no `pictureCrop` is reported (#1555). */
  drawnCropped?: boolean;
}

const fileIds = new WeakMap<Context, Map<string, string>>();

function storeFile(ctx: Context, name: string, ext: string, bytes: Uint8Array): string {
  let ids = fileIds.get(ctx);
  if (!ids) fileIds.set(ctx, (ids = new Map()));
  const base = idOf(name.replace(/\.[A-Za-z0-9]{2,5}$/, ''), 'picture');
  // The same file placed twice is stored once.
  for (let n = 1; ; n++) {
    const id = `resources/${base}${n > 1 ? `-${n}` : ''}.${ext}`;
    const held = ctx.files.get(id);
    if (!held) {
      ctx.files.set(id, bytes);
      return id;
    }
    if (held.length === bytes.length && held.every((v, k) => v === bytes[k])) return id;
  }
}

function placeholder(ctx: Context, name: string, width: number, height: number, label: string): Pick<Resource, 'kind' | 'svg'> {
  const w = Math.max(1, Math.round(width * 100) / 100);
  const h = Math.max(1, Math.round(height * 100) / 100);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}"><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="#ececec" stroke="#9a9a9a"/><path d="M0.5 0.5L${w - 0.5} ${h - 0.5}M${w - 0.5} 0.5L0.5 ${h - 0.5}" stroke="#9a9a9a" fill="none"/><title>${label.replace(/[<&>]/g, '')}</title></svg>`;
  const fileId = storeFile(ctx, `missing-${name}`, 'svg', utf8(svg));
  return { kind: 'svg', svg: { fileId, width: w, height: h } };
}

/** The bytes of a frame's picture, wherever they are. */
function bytesOf(ctx: Context, item: IdmlPageItem): Uint8Array | undefined {
  const g = item.graphic!;
  if (g.data?.length) return g.data;
  const link = g.link;
  if (!link) return undefined;
  // A package may carry its links (`Links/<name>`).
  for (const [path, bytes] of ctx.doc.files) if (path.split('/').pop() === link.name) return bytes;
  try {
    const given = ctx.options.linkBytes?.({ name: link.name, uri: link.uri });
    if (given?.length) return given;
  } catch {
    ctx.rep.add('linkBytesFailed', 'warning', 'The host could not give the bytes of a linked picture', link.name);
  }
  return undefined;
}

/** The picture of a graphic frame as a resource; its id. Undefined for
 *  an item that holds no picture. */
export function pictureResource(ctx: Context, item: IdmlPageItem, options: PictureOptions = {}): string | undefined {
  const g = item.graphic;
  if (!g) return undefined;
  ctx.counts.pictures++;
  const frame = pathExtent(item.paths);
  const width = frame ? boxWidth(frame) : boxWidth(g.bounds);
  const height = frame ? boxHeight(frame) : boxHeight(g.bounds);
  const name = g.link?.name || item.name || 'picture';
  const id = ctx.resourceIds.take(idOf(name.replace(/\.[A-Za-z0-9]{2,5}$/, ''), 'picture'));
  const base: Resource = { id, typeId: options.typeId ?? 'picture', kind: 'bitmap', createdAt: 0, updatedAt: 0 };
  if (item.altText) base.altText = item.altText;
  if (options.caption) base.caption = options.caption;
  if (options.note) base.note = options.note;
  if (options.placement) base.placement = options.placement;

  const bytes = bytesOf(ctx, item);
  const kind = bytes ? sniff(bytes) : undefined;
  const info = bytes && kind && 'kind' in kind && kind.kind === 'bitmap' ? bitmapInfo(bytes) : undefined;
  if (bytes && kind && 'kind' in kind && kind.kind === 'bitmap' && info) {
    base.bitmap = { fileId: storeFile(ctx, name, kind.ext, bytes), format: kind.format, width: info.width, height: info.height };
    // The size the picture is set at says its resolution.
    const scaled = boxWidth(g.bounds) * (graphicCrop(item)?.scaleX ?? 1);
    if (scaled > 0) base.bitmap.resolution = Math.round((info.width / (scaled / 72)) * 100) / 100;
  } else if (bytes && kind && 'kind' in kind && kind.kind === 'svg') {
    base.kind = 'svg';
    base.svg = { fileId: storeFile(ctx, name, 'svg', bytes) };
  } else {
    if (!bytes) {
      const key = g.link?.uri ?? name;
      const m = ctx.missing.get(key);
      if (m) m.uses++;
      else ctx.missing.set(key, { name, uri: g.link?.uri ?? '', uses: 1 });
      ctx.rep.add('missingPicture', 'loss', 'A linked picture whose file the importer was not given is a grey placeholder of the frame\'s size (see missingLinks; pass linkBytes)', name);
    } else {
      const what = kind && 'unsupported' in kind ? kind.unsupported : g.type;
      ctx.rep.add('unsupportedPictureFormat', 'loss', 'A placed file in a format Postext does not draw (PDF, EPS, AI, PSD, TIFF) is a grey placeholder of the frame\'s size', `${name} (${what})`);
    }
    Object.assign(base, placeholder(ctx, name, width, height, name));
  }

  // What the frame shows of the picture.
  const crop = graphicCrop(item);
  if (crop && (base.bitmap || (base.svg && bytes))) {
    const cut = crop.width < 0.995 || crop.height < 0.995;
    if (cut && crop.width > 0 && crop.height > 0) {
      const r = (n: number): number => Math.round(n * 10000) / 10000;
      base.safeArea = { x: r(crop.x), y: r(crop.y), width: r(crop.width), height: r(crop.height) };
      if (!options.drawnCropped) ctx.rep.add('pictureCrop', 'warning', 'A picture its frame crops keeps the visible part as its safe area; Postext shows the whole picture unless the layout needs to crop it', name);
    }
    if (Math.abs(crop.rotation) > 0.01 || crop.flipped) ctx.rep.add('pictureTurned', 'loss', 'A picture turned or mirrored inside its frame is set upright and unmirrored, whole in its frame', name);
    if (Math.abs(crop.scaleX - crop.scaleY) > 0.005 * Math.max(crop.scaleX, crop.scaleY)) ctx.rep.add('pictureStretched', 'warning', 'A picture scaled unevenly keeps its own proportions', name);
  }
  if (g.clippingPath?.length) ctx.rep.add('clippingPath', 'warning', 'A clipping path on a picture is not carried', name);
  ctx.resources.push(base);
  return id;
}

/** The label a caption opens with, when all of the label is there: a
 *  word for a figure or a table, a number, and a full stop, a colon or a
 *  dash (or the end of the caption). `Figure 3. The delta` gives the
 *  label and the rest; `Figures of speech` and `Table 5 is empty` give
 *  nothing. */
export function captionLabel(text: string): { word: string; kind: 'figure' | 'table'; rest: string } | undefined {
  const m = /^\s{0,8}(fig(?:ure|ura|\.)?|abb(?:ildung|\.)?|table(?:au)?|tabla|tab(?:elle|ella|\.)?|taula|illustration|ilustraci[oó]n|plate|l[aá]mina|chart|gr[aá]fico|map|mapa|图|表|図)\s{0,4}((?:[0-9]{1,6}|[IVXLC]{1,8})(?:[.\-–][0-9]{1,6}){0,4})\s{0,4}(?:[.:—–|]\s|[.:]?$)/iu.exec(text.trimEnd());
  if (!m) return undefined;
  const word = m[1]!;
  const kind = /^(?:tab|taula|表)/i.test(word) ? 'table' : 'figure';
  return { word, kind, rest: text.slice(m[0].length).trimStart() };
}
