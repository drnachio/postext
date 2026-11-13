// Pictures: graphics frames holding the picture, embedded or linked from
// `Links/`, cropped and flipped as in the PDF; an SVG with a PDF companion
// is placed as that PDF.

import type { DisplayItem } from 'postext';
import { bitmapInfo, svgSize } from 'postext/writer';
import { boxGeometry } from './geometry.js';
import { attr, num } from './parts.js';
import type { Writer } from './writer.js';

export function imageXml(w: Writer, item: Extract<DisplayItem, { kind: 'image' }>, pageIndex: number): string {
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
    // `svgSize` tells CSS px (96 to the inch: `127.559pt` reads 170.08),
    // InDesign places an SVG at its size in pt; told in px, the picture
    // was taken for a third larger than InDesign shows it, and the frame
    // scaled and cropped it short of the PDF's crop (#1555).
    const size = svgSize(new TextDecoder().decode(bytes));
    pw = size ? (size.width * 72) / 96 : g.width;
    ph = size ? (size.height * 72) / 96 : g.height;
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
  // name: it is numbered. Every linked file ends in the extension of its
  // format, read from its bytes, so it opens once the folder is unzipped.
  const dataType = /^data:image\/([a-z+]+)[;,]/i.exec(fileId)?.[1]?.toLowerCase();
  const base = dataType ? `picture-${w.media.size + 1}` : (fileId.split('/').pop() ?? fileId).replace(/[^\w.\-]+/g, '_');
  const name = withExtension(base, linkExtension(bytes) ?? (usePdf ? 'pdf' : item.imageKind === 'svg' ? 'svg' : dataType && (DATA_EXTENSIONS[dataType] ?? dataType)));
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

const DATA_EXTENSIONS: Record<string, string> = { jpeg: 'jpg', 'svg+xml': 'svg', tiff: 'tif' };

/** Names a file may already end in for each extension a link is given. */
const ALIASES: Record<string, string[]> = { jpg: ['jpg', 'jpeg', 'jpe'], tif: ['tif', 'tiff'], eps: ['eps', 'ps'] };

const startsWith = (bytes: Uint8Array, sig: readonly number[], at = 0): boolean =>
  bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** The file extension of a linked picture's format, read from its bytes:
 *  PDF, PNG, JPEG, GIF, WebP, TIFF, BMP, Photoshop, EPS or SVG. */
export function linkExtension(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, ascii('%PDF'))) return 'pdf';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return 'tif';
  if (startsWith(bytes, ascii('8BPS'))) return 'psd';
  if (startsWith(bytes, ascii('%!PS')) || startsWith(bytes, [0xc5, 0xd0, 0xd3, 0xc6])) return 'eps';
  if (startsWith(bytes, ascii('BM'))) return 'bmp';
  // SVG: markup (after a BOM, an XML declaration, comments or a doctype)
  // whose root is <svg.
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, '');
  if (/^\s*</.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
  return undefined;
}

/** `name` ending in `ext`, kept as it is when it already ends in it (or in
 *  another spelling of it, as .jpeg for jpg). */
export function withExtension(name: string, ext: string | undefined): string {
  if (!ext) return name;
  const own = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase();
  return own && (ALIASES[ext] ?? [ext]).includes(own) ? name : `${name}.${ext}`;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
