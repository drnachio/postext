// Figures in the semantic .docx (#1390): an inline picture (SVG as
// `asvg:svgBlip` over a PNG fallback) or a Word table, and a Word caption
// (label, SEQ number, then the caption text mapped to the figure's own
// words in the Markdown or to the resource's field).

import { strFromU8 } from 'fflate';
import type { ContentBlock } from '../../parse/types.js';
import type { Resource } from '../../types.js';
import { escapeAttr } from '../xml.js';
import { abs, blockId, type PreparedPicture, type WriterContext } from './context.js';
import { captionLabelParts, captionStyleOf } from './engineNumbers.js';
import { FragmentBuilder } from './fragments.js';
import { rawSdt } from './raw.js';
import { snippetRuns } from './snippet.js';
import { STYLE } from './styles.js';
import { renderTable } from './tables.js';
import { blockSdt, emu, fieldRuns, paragraph, textRuns } from './wml.js';

const SVG_EXT = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';
const BITMAP_EXT: Record<string, 'png' | 'jpeg' | 'gif'> = { png: 'png', jpeg: 'jpeg', jpg: 'jpeg', gif: 'gif', 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };

/** Display size of a picture in px at the book's dpi, fitted to the column. */
function displaySize(ctx: WriterContext, w: number, h: number, resolution?: number): { w: number; h: number } {
  const scale = resolution && resolution > 0 ? ctx.units.dpi / resolution : 1;
  let dw = w * scale;
  let dh = h * scale;
  if (dw > ctx.columnPx) {
    dh *= ctx.columnPx / dw;
    dw = ctx.columnPx;
  }
  return { w: Math.max(1, dw), h: Math.max(1, dh) };
}

/** Embed the pictures of the resources shown (bitmaps as they are, SVGs
 *  rasterized for the fallback). Async because rasterizing is. */
export async function prepareMedia(ctx: WriterContext, ids: Iterable<string>): Promise<void> {
  for (const id of ids) {
    if (ctx.media.has(id)) continue;
    const res = ctx.resources.get(id);
    if (!res) continue;
    if (res.kind === 'bitmap' && res.bitmap) {
      const ext = BITMAP_EXT[res.bitmap.format.toLowerCase()];
      const bytes = ctx.resourceBytes?.(res.bitmap.fileId);
      if (!bytes || !ext) {
        ctx.warn('pictureMissing', `Picture "${id}" ${bytes ? `is ${res.bitmap.format}, which Word cannot show` : 'has no file'}: left out.`);
        continue;
      }
      const size = displaySize(ctx, res.bitmap.width, res.bitmap.height, res.bitmap.resolution);
      ctx.media.set(id, { rel: ctx.pkg.addMedia(bytes, ext), widthPx: size.w, heightPx: size.h });
    } else if (res.kind === 'svg' && res.svg) {
      const bytes = ctx.resourceBytes?.(res.svg.fileId);
      if (!bytes) {
        ctx.warn('pictureMissing', `Picture "${id}" has no file: left out.`);
        continue;
      }
      const w = res.svg.width ?? 800;
      const h = res.svg.height ?? (res.svg.width ? res.svg.width * 0.75 : 600);
      const size = displaySize(ctx, w, h);
      const scale = 300 / ctx.units.dpi;
      const png = ctx.rasterizeSvg ? await ctx.rasterizeSvg(strFromU8(bytes), Math.round(size.w * scale), Math.round(size.h * scale)) : undefined;
      if (!png) {
        ctx.warn('svgWithoutFallback', `SVG "${id}" needs a bitmap fallback (rasterizeSvg) to be shown in Word: left out.`);
        continue;
      }
      ctx.media.set(id, { rel: ctx.pkg.addMedia(png, 'png'), svgRel: ctx.pkg.addMedia(bytes, 'svg'), widthPx: size.w, heightPx: size.h });
    }
  }
}

/** The picture as an inline drawing, scaled down to `maxPx` (the width
 *  available where it stands: a box cell is narrower than the column). */
function pictureRun(ctx: WriterContext, pic: PreparedPicture, name: string, alt: string, maxPx: number): string {
  const id = ctx.pkg.nextDrawingId();
  const scale = maxPx > 0 && pic.widthPx > maxPx ? maxPx / pic.widthPx : 1;
  const cx = Math.max(1, emu(ctx.units, pic.widthPx * scale));
  const cy = Math.max(1, emu(ctx.units, pic.heightPx * scale));
  const ext = pic.svgRel ? `<a:extLst><a:ext uri="${SVG_EXT}"><asvg:svgBlip r:embed="${pic.svgRel}"/></a:ext></a:extLst>` : '';
  return (
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="${escapeAttr(name)}"${alt ? ` descr="${escapeAttr(alt)}"` : ''}/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${escapeAttr(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${pic.rel}">${ext}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

/** A figure's own word (`caption`, `note`, `alt`) with its absolute
 *  range, checked against the Markdown. */
function ownWord(ctx: WriterContext, b: ContentBlock, kind: 'caption' | 'note' | 'alt'): { text: string; start: number } | undefined {
  const w = b.figure?.words?.[kind];
  if (!w) return undefined;
  const md = ctx.chapter.markdown;
  const start = abs(ctx, w.sourceStart);
  if (md.startsWith(w.text, start)) return { text: w.text, start };
  // Offsets read before marks were taken out: find the text in the block.
  const at = md.indexOf(w.text, abs(ctx, b.sourceStart));
  return at >= 0 && at < abs(ctx, b.sourceEnd) ? { text: w.text, start: at } : { text: w.text, start: -1 };
}

/** A caption-style paragraph for a figure's caption or note. */
function captionParagraph(ctx: WriterContext, b: ContentBlock, res: Resource, field: 'caption' | 'note', label: string): string {
  const own = ownWord(ctx, b, field);
  const role = field === 'caption' ? 'caption' : 'note';
  let runs: string;
  if (own && own.start >= 0) runs = snippetRuns(ctx, own.text, ctx.chapter.markdown, own.start, { kind: 'markdown', chapter: ctx.chapter.index }, role);
  else if (own) runs = textRuns(own.text, '');
  else {
    const text = res[field] ?? '';
    runs = snippetRuns(ctx, text, text, 0, { kind: 'resource', resourceId: res.id, field }, role);
  }
  if (!runs && !label) return '';
  return paragraph({ style: STYLE.caption }, label + runs);
}

/** The caption's label and number, in a fragment of generated text: the
 *  importer reads text beside a bookmark into it, so the label needs its
 *  own (edits to it are rejected, not written into the caption). */
function captionLabel(ctx: WriterContext, res: Resource): string {
  const type = ctx.resourceTypes.find((t) => t.id === res.typeId);
  const entry = ctx.numbers.resources[res.id];
  // The label and number the engine prints ("Figure 1.7. ").
  const label = type && entry ? captionLabelParts(ctx.resolved, type, entry.number) : undefined;
  if (!type || !label) return '';
  const cap = captionStyleOf(ctx.resolved, type);
  const props = `<w:rPr>${cap.labelBold ? '<w:b/>' : ''}${cap.labelItalic ? '<w:i/>' : ''}</w:rPr>`;
  // A number that is the plain count of its type stays a SEQ field (Word
  // lists the figures with it); a chapter number ("1.7") is text, which a
  // field update would turn into the count.
  const seq = `SEQ ${type.id.replace(/[^A-Za-z0-9_]/g, '_') || 'Figure'} \\* ARABIC`;
  const plain = label.number !== '' && label.number === String(ctx.numbers.ordinals.get(res.id));
  const num = !label.number ? '' : plain ? fieldRuns(seq, label.number, props) : textRuns(label.number, props);
  const runs = textRuns(label.head, props) + num + textRuns(label.tail, props);
  const text = label.head + label.number + label.tail;
  const frag = new FragmentBuilder();
  frag.push(text, new Array<number>(text.length).fill(-1), (cap.labelBold ? 'b' : '') + (cap.labelItalic ? 'i' : ''));
  return ctx.log.wrap(runs, frag, { block: blockId(ctx), target: { kind: 'generated' }, range: [0, 0], role: 'label' });
}

/** A `::resource` / `:::figure` block: picture or table, and caption. */
export function renderResource(ctx: WriterContext, b: ContentBlock, start: number, end: number, widthTwips: number): string {
  const id = b.resourceId ?? '';
  const res = ctx.resources.get(id);
  if (!res) {
    ctx.warn('resourceMissing', `Resource "${id}" is not in the export: kept as source.`);
    return rawSdt(ctx, start, end, 'resource');
  }
  ctx.usedResources.add(id);
  if (res.kind !== 'table' && res.kind !== 'bitmap' && res.kind !== 'svg') return rawSdt(ctx, start, end, res.kind);
  if (res.kind === 'table' && !res.table) return rawSdt(ctx, start, end, res.kind);
  const renderBody = (): string => {
    if (res.kind === 'table') return renderTable(ctx, res, widthTwips);
    const pic = ctx.media.get(id);
    const alt = ownWord(ctx, b, 'alt')?.text ?? res.altText ?? '';
    return pic ? paragraph({ style: STYLE.figure }, pictureRun(ctx, pic, id, alt, (widthTwips * ctx.units.dpi) / 1440)) : '';
  };
  // Fragments are logged as they are written, so in the document's order:
  // a caption set above the table or picture is rendered first.
  const above = ctx.resolved.captionStyle.position === 'above';
  const caption = (): string => captionParagraph(ctx, b, res, 'caption', captionLabel(ctx, res));
  let content: string;
  if (above) {
    const cap = caption();
    content = cap + renderBody();
  } else {
    const body = renderBody();
    content = body + caption();
  }
  const note = captionParagraph(ctx, b, res, 'note', '');
  return blockSdt(ctx.nextSdtId(), `ptx:figure:${id}`, undefined, content + note || '<w:p/>');
}
