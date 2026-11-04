// A resource block as display items (#1388), as postext-pdf's
// `renderResourceBlock` paints it: the body (a picture with its safe-area
// crop, a table with its cells), the caption bar, the caption, note and
// "continued" lines. A turned block (`rotation`) is laid out in its own
// upright frame, which lands on the page through `rotationFrame`.
import type { VDTBlock } from '../../vdt/blocks.js';
import type { VDTLine } from '../../vdt/lines.js';
import type { ResolvedResourceBlock } from '../../vdt/resources.js';
import { tableCellFill } from '../../vdt/resourceTables.js';
import { compose, mapRect, placeImage, placeShape, placeTable, placeText, rotationFrame, type Frame } from './frame.js';
import { highlightRects, placeResourceLine, type LineStyle } from './lines.js';
import { alignToSource, atomKind, segmentShownText, type Atom, type PaintedAtom } from './source.js';
import type { BlockContext } from './blocks.js';
import type { DisplayItem, DisplayLine, DisplayRect, DisplaySource } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;
type ImageItem = Extract<DisplayItem, { kind: 'image' }>;
type TableItem = Extract<DisplayItem, { kind: 'table' }>;

function unionOf(lines: readonly VDTLine[]): DisplayRect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) {
    x0 = Math.min(x0, l.bbox.x);
    y0 = Math.min(y0, l.bbox.y);
    x1 = Math.max(x1, l.bbox.x + l.bbox.width);
    y1 = Math.max(y1, l.bbox.y + l.bbox.height);
  }
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/**
 * Lines of a resource's text as one item. `field` names where their
 * characters come from: the resource's caption or note string (offsets
 * into it), a table cell's content; label segments (`Figure 1.`) are
 * generated and map to nothing.
 */
function resourceText(
  lines: readonly VDTLine[],
  style: LineStyle,
  role: TextItem['role'],
  ctx: BlockContext,
  frame: Frame,
  source: { blockKey: string; text?: string; generated?: boolean; resource?: DisplaySource['resource'] },
  box?: DisplayRect,
): TextItem | null {
  if (lines.length === 0) return null;
  const placed: DisplayLine[] = lines.map((l) => placeResourceLine(l, style, ctx.vertical, ctx.options).line);
  // Characters of a caption label are no text of the resource's; a
  // reference, formula, note marker or swatch stands for its construct.
  let masked = '';
  const painted: PaintedAtom[] = [];
  lines.forEach((l, i) => {
    let k = 0;
    for (const seg of l.segments ?? []) {
      const n = segmentShownText(seg).length;
      const kind = atomKind(seg);
      if (seg.captionLabel || seg.leader || seg.inserted) masked += '\u0000'.repeat(n);
      else {
        // The later runs of a reference set in pieces join its atom.
        const last = painted[painted.length - 1];
        if (seg.refContinues && last && last.kind === 'ref' && last.at + last.length === masked.length) last.length += n;
        else if (kind === 'ref' || kind === 'math' || kind === 'footnote' || kind === 'swatch') painted.push({ at: masked.length, length: n, kind });
        masked += placed[i]!.text.slice(k, k + n);
      }
      k += n;
    }
    if (k < placed[i]!.text.length) masked += placed[i]!.text.slice(k);
  });
  const atoms: Atom[] = [];
  const map = source.generated ? new Array<number>(masked.length).fill(-1) : alignToSource(masked, source.text, 0, painted, atoms);
  let at = 0;
  for (const line of placed) {
    line.map = map.slice(at, at + line.text.length);
    at += line.text.length;
  }
  const src: DisplaySource = { blockKey: source.blockKey, map };
  if (atoms.length > 0) src.atoms = atoms;
  if (source.generated) src.generated = true;
  if (source.resource) src.resource = source.resource;
  const item: TextItem = { kind: 'text', role, bbox: box ?? unionOf(lines), lines: placed, source: src, blockType: 'resource' };
  return placeText(frame, item);
}

/** The highlight bands of resource lines (`paintLine` paints them under
 *  the text), placed on the sheet. */
function highlightItems(lines: readonly VDTLine[], frame: Frame): DisplayItem[] {
  return lines.flatMap((l) => highlightRects(l).map((h) => placeShape(frame, h)));
}

function fontsOf(normal: string, bold: string, italic: string, boldItalic: string): Pick<LineStyle, 'fontString' | 'boldFontString' | 'italicFontString' | 'boldItalicFontString'> {
  return { fontString: normal, boldFontString: bold, italicFontString: italic, boldItalicFontString: boldItalic };
}

function tableItem(rb: ResolvedResourceBlock, bx: number, by: number, ctx: BlockContext, frame: Frame, key: string): DisplayItem[] {
  const t = rb.table;
  if (!t) return [];
  const rows = rb.resource.table?.model.rows;
  const body: LineStyle = { ...fontsOf(t.fontString, t.boldFontString, t.italicFontString, t.boldItalicFontString), color: t.color, refColor: rb.linkColor };
  const head: LineStyle = { ...fontsOf(t.headerFontString, t.headerBoldFontString, t.headerItalicFontString, t.headerBoldItalicFontString), color: t.headerColor, refColor: rb.linkColor };
  const height = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
  const rect = { x: bx, y: by, width: rb.bodyRect.width, height };
  const cells: TableItem['cells'] = t.cells.map((cell) => {
    const resource = { resourceId: rb.resource.id, field: 'cell' as const, row: cell.row, col: cell.col };
    const text = rows?.[cell.row]?.[cell.col]?.content;
    const item = resourceText(cell.lines, cell.isHeader ? head : body, 'cell', ctx, [1, 0, 0, 1, 0, 0], { blockKey: key, ...(text !== undefined ? { text } : {}), resource }, { ...cell.rect });
    const out: TableItem['cells'][number] = { row: cell.row, col: cell.col, rowSpan: cell.rowSpan, colSpan: cell.colSpan, rect: { ...cell.rect }, align: cell.align, verticalAlign: cell.verticalAlign, item };
    const fill = tableCellFill(t, cell);
    if (fill) out.background = fill;
    if (cell.image) {
      const img: ImageItem = { kind: 'image', rect: { ...cell.image.rect }, fileId: cell.image.fileId, imageKind: cell.image.kind };
      if (cell.image.pdfFileId) img.pdfFileId = cell.image.pdfFileId;
      if (cell.image.altText) img.alt = cell.image.altText;
      out.image = img;
    }
    return out;
  });
  const xs = new Set<number>();
  for (const c of cells) { xs.add(c.rect.x - rect.x); xs.add(c.rect.x + c.rect.width - rect.x); }
  const table: TableItem = {
    kind: 'table', rect, cells,
    columnEdges: [...xs].sort((a, b) => a - b),
    rowEdges: [...t.rowEdges],
    borderColor: t.borderColor,
    borderWidthPx: t.strokes ? 0 : t.borderWidthPx,
  };
  // Cell highlight bands under the grid (a cell's own fill comes with the
  // table item), then the table.
  const items: DisplayItem[] = [...t.cells.flatMap((c) => highlightItems(c.lines, frame)), placeTable(frame, table)];
  // Booktabs strokes (#625), each its own width.
  for (const s of t.strokes ?? []) {
    items.push(placeShape(frame, { kind: 'rule', x1: bx + s.x1, y1: by + s.y1, x2: bx + s.x2, y2: by + s.y2, color: t.borderColor, widthPx: s.widthPx }));
  }
  return items;
}

/** The items a resource block paints, placed on the sheet. */
export function resourceItems(block: VDTBlock, ctx: BlockContext): DisplayItem[] {
  const rb = block.resourceBlock;
  if (!rb) return [];
  const rot = rb.rotation;
  const frame = rot ? compose(ctx.frame, rotationFrame(rot)) : ctx.frame;
  // A turned block's text is horizontal in its own frame (the PDF drops
  // the vertical page's setting inside it): an upright table on a vertical
  // page sets its caption and cells across.
  if (rot && ctx.vertical) ctx = { ...ctx, vertical: false };
  const bx = (rot ? 0 : block.bbox.x) + rb.bodyRect.x;
  const by = (rot ? 0 : block.bbox.y) + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;
  const key = `r${rb.resource.id}`;
  const items: DisplayItem[] = [];
  if ((rb.kind === 'bitmap' || rb.kind === 'svg' || rb.kind === 'video') && rb.fileId) {
    const image: ImageItem = { kind: 'image', rect: { x: bx, y: by, width: bw, height: bh }, fileId: rb.fileId, imageKind: rb.kind === 'svg' ? 'svg' : 'bitmap' };
    const pdf = rb.resource.svg?.pdfFileId;
    if (pdf) image.pdfFileId = pdf;
    if (rb.bodySource) image.crop = { x: rb.bodySource.x, y: rb.bodySource.y, width: rb.bodySource.width, height: rb.bodySource.height };
    if (rb.resource.altText) image.alt = rb.resource.altText;
    // Down a vertical page an upright picture stands upright on the sheet.
    items.push(!rot && ctx.vertical ? { ...image, rect: mapRect(frame, image.rect) } : placeImage(frame, image));
  } else if (rb.kind === 'table') {
    items.push(...tableItem(rb, bx, by, ctx, frame, key));
  }
  if (rb.captionBar) {
    const { rect, background } = rb.captionBar;
    items.push(placeShape(frame, { kind: 'rect', rect: { ...rect }, fill: background }));
  }
  const captionStyle: LineStyle = {
    ...fontsOf(rb.captionFontString, rb.captionBoldFontString, rb.captionItalicFontString, rb.captionBoldItalicFontString),
    color: rb.captionColor, labelColor: rb.captionLabelColor, refColor: rb.linkColor,
  };
  const noteStyle: LineStyle = {
    ...fontsOf(rb.noteFontString, rb.noteBoldFontString, rb.noteItalicFontString, rb.noteBoldItalicFontString),
    color: rb.noteColor, refColor: rb.linkColor,
  };
  const id = rb.resource.id;
  // A later slice's repeated caption is furniture.
  const caption = resourceText(rb.captionLines, captionStyle, 'caption', ctx, frame, {
    blockKey: key, ...(rb.resource.caption !== undefined ? { text: rb.resource.caption } : {}),
    ...(rb.slice?.continued ? { generated: true } : {}),
    resource: { resourceId: id, field: 'caption' },
  });
  if (caption) items.push(...highlightItems(rb.captionLines, frame), caption);
  const note = resourceText(rb.noteLines, noteStyle, 'note', ctx, frame, {
    blockKey: key, ...(rb.resource.note !== undefined ? { text: rb.resource.note } : {}),
    resource: { resourceId: id, field: 'note' },
  });
  if (note) items.push(...highlightItems(rb.noteLines, frame), note);
  const continues = resourceText(rb.continuesLines ?? [], noteStyle, 'continues', ctx, frame, { blockKey: key, generated: true });
  if (continues) items.push(continues);
  return items;
}
