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
