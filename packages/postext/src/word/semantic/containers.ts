// `:::` containers in Word (#1390). A box (`:::callout`) is a content
// control tagged `ptx:box:<type>` around a one-cell table shaded and
// bordered like the box style, its label and title paragraphs first; a `:::part`,
// `:::paragraphs`, `:::columns` or `:::paper` group is a content control
// around its blocks; an exercise is set by exercises.ts and a composed
// page by media/pages.ts, a stray solution or hint prints nothing
// (#1444); stray modules and frames go raw.
// A box is as wide as the column it stands in (a percentage width, so a
// narrow side column does not clip it), keeps its margins as spacer
// paragraphs around it, and stays on one page when it is short.

import type { ResolvedCalloutStyleConfig } from '../../types.js';
import { abs, blockId, type WriterContext } from './context.js';
import { FragmentBuilder } from './fragments.js';
import { endsWithTable, renderNodes, type BlockEnv, type Node } from './blocks.js';
import { renderExercise } from './exercises/exercises.js';
import { renderPartDesign } from './design/part.js';
import { inPartStyle } from './design/partColor.js';
import { attrRange } from './marks.js';
import { renderComposedPage } from './media/pages.js';
import { rawSdt } from './raw.js';
import { pageGeometry } from './sections.js';
import { STYLE } from './styles.js';
import { blockSdt, eighths, hex, paragraph, px, textRuns, twips, type Border, type ParaProps } from './wml.js';

type ContainerNode = Extract<Node, { container: unknown }>;

const RAW_CONTAINERS = new Set(['module', 'frame', 'figure']);

/** Attributes as a short JSON label for the content control. */
function attrsLabel(attrs: Record<string, string> | undefined): string | undefined {
  if (!attrs || !Object.keys(attrs).length) return undefined;
  const json = JSON.stringify(attrs);
  return json.length <= 255 ? json : undefined;
}

/** A paragraph holding an attribute's value, mapped to its source (or
 *  generated text when the fence does not set it). */
function attrParagraph(ctx: WriterContext, node: ContainerNode, key: string, style: string, fallback?: string, props?: ParaProps): string {
  const md = ctx.chapter.markdown;
  const fence = abs(ctx, node.container.sourceStart);
  const range = attrRange(md, fence, key);
  if (!range) {
    if (!fallback) return '';
    // A title the box style gives: generated, so Word edits to it are
    // reported, and the paragraph is not read as one the user typed.
    const g = new FragmentBuilder();
    g.push(fallback, new Array<number>(fallback.length).fill(-1));
    const runs = ctx.log.wrap(textRuns(fallback, ''), g, { block: blockId(ctx), target: { kind: 'generated' }, range: [0, 0], role: `style:${node.container.containerName}:${key}` });
    return paragraph({ style, ...props }, runs);
  }
  const f = new FragmentBuilder();
  const text = md.slice(range.start, range.end);
  if (!text) return '';
  f.push(text, Array.from({ length: text.length }, (_, k) => range.start + k));
  const runs = ctx.log.wrap(textRuns(text, ''), f, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [range.start, range.end],
    role: `attr:${node.container.containerName}:${key}`,
  });
  return paragraph({ style, ...props }, runs);
}

function rangeOf(ctx: WriterContext, node: ContainerNode): [number, number] {
  const start = abs(ctx, node.container.sourceStart);
  let end = node.end ? abs(ctx, node.end.sourceEnd) : abs(ctx, node.container.sourceEnd);
  if (!node.end) {
    const last = (n: Node): number => ('container' in n ? (n.end ? n.end.sourceEnd : n.children.length ? last(n.children[n.children.length - 1]!) : n.container.sourceEnd) : n.block.sourceEnd);
    if (node.children.length) end = Math.max(end, abs(ctx, last(node.children[node.children.length - 1]!)));
  }
  return [start, end];
}

export function renderContainer(ctx: WriterContext, node: ContainerNode, env: BlockEnv): string {
  const c = node.container;
  const name = c.containerName ?? 'container';
  const attrs = c.containerAttrs ?? {};
  if (name === 'exercise') return renderExercise(ctx, node, env);
  if (name === 'composedPage') return renderComposedPage(ctx, node, env);
  // A solution or hint outside an exercise prints nothing (as in the
  // engine); its source stays as it is.
  if (name === 'solution' || name === 'hint') return '';
  if (RAW_CONTAINERS.has(name)) {
    const [start, end] = rangeOf(ctx, node);
    return rawSdt(ctx, start, end, name);
  }
  if (name === 'callout') return renderBox(ctx, node, env);
  // A book without part pages (`parts.page: false`) prints nothing for the
  // fence: the part only rules the running heads and the contents. Its
  // source stays as it is on re-import (#1444).
  if (name === 'part' && !ctx.resolved.parts.page) return '';
  if (name === 'part') {
    // The part's page break comes once: before its number, or before its
    // title when it has none.
    // The book's part design draws it when it has one (#1444).
    // The design may set the part's body on its band (its chapter list).
    let body: string | undefined;
    const write = (): string => (body = renderNodes(ctx, node.children, env));
    const designed = renderPartDesign(ctx, c, (key, style, props) => attrParagraph(ctx, node, key, style, undefined, props), write);
    const number = designed === undefined ? attrParagraph(ctx, node, 'number', STYLE.part) : '';
    const head = designed ?? number + attrParagraph(ctx, node, 'title', STYLE.part, undefined, number ? { pageBreakBefore: false } : undefined);
    return blockSdt(ctx.nextSdtId(), 'ptx:part', attrsLabel(attrs), head + (body === undefined ? write() : '') || '<w:p/>');
  }
  if (name === 'paragraphs') {
    const style = attrs.style ? ctx.styles.paragraphStyle(attrs.style) : undefined;
    const body = renderNodes(ctx, node.children, { ...env, paraStyle: style ?? env.paraStyle });
    return blockSdt(ctx.nextSdtId(), `ptx:paragraphs${attrs.style ? `:${attrs.style}` : ''}`, attrsLabel(attrs), body || '<w:p/>');
  }
  // Side by side in the book's design; one under the other in the plain
  // one, which is a single column (the same content control either way).
  if (name === 'columns' && env.box && !ctx.plain) return boxColumns(ctx, node, env);
  return blockSdt(ctx.nextSdtId(), `ptx:${name}`, attrsLabel(attrs), renderNodes(ctx, node.children, env) || '<w:p/>');
}

/** `:::columns` inside a box ("In numbers", "In brief", #1444): a table
 *  with no rules and a cell per column, the blocks split where `breaks`
 *  starts a column (1-based), else evenly. Word's own columns would break
 *  the whole section. */
function boxColumns(ctx: WriterContext, node: ContainerNode, env: BlockEnv): string {
  const attrs = node.container.containerAttrs ?? {};
  const kids = node.children;
  const count = Math.max(1, Math.min(kids.length, Number.parseInt(attrs.count ?? '', 10) || 2));
  const breaks = (attrs.breaks ?? '').split(/[,\s]+/).map((x) => Number.parseInt(x, 10) - 1).filter((x) => x > 0 && x < kids.length);
  const starts = breaks.length ? [0, ...new Set(breaks)].sort((a, b) => a - b) : Array.from({ length: count }, (_, k) => Math.round((k * kids.length) / count));
  const width = Math.max(240, Math.round(env.widthTwips ?? ctx.textTwips));
  const cellW = Math.floor(width / starts.length);
  let cells = '';
  starts.forEach((from, k) => {
    let cell = renderNodes(ctx, kids.slice(from, starts[k + 1] ?? kids.length), { ...env, widthTwips: cellW - 216 });
    if (!cell || endsWithTable(cell)) cell += '<w:p/>';
    cells += `<w:tc><w:tcPr><w:tcW w:w="${cellW}" w:type="dxa"/></w:tcPr>${cell}</w:tc>`;
  });
  const nil = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="nil"/>`).join('');
  const tbl =
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${nil}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid>${starts.map(() => `<w:gridCol w:w="${cellW}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`;
  return blockSdt(ctx.nextSdtId(), 'ptx:columns', attrsLabel(attrs), tbl);
}

function boxBorders(ctx: WriterContext, s: ResolvedCalloutStyleConfig | undefined): Record<'top' | 'left' | 'bottom' | 'right', Border | undefined> {
  const out: Record<'top' | 'left' | 'bottom' | 'right', Border | undefined> = { top: undefined, left: undefined, bottom: undefined, right: undefined };
  if (!s) return out;
  const u = ctx.units;
  const rtl = ctx.resolved.direction === 'rtl';
  const startSide = rtl ? 'right' : 'left';
  const endSide = rtl ? 'left' : 'right';
  if (s.border.enabled) {
    for (const side of ['top', 'left', 'bottom', 'right'] as const) {
      const own = s.border.sides?.[side as keyof NonNullable<typeof s.border.sides>];
      const b = own ?? { enabled: true, color: s.border.color, width: s.border.width };
      if (b.enabled && px(u, b.width) > 0) out[side] = { color: hex(b.color) ?? '000000', sz: eighths(u, b.width), space: 0 };
    }
  }
  if (s.stripe.enabled) {
    const side = s.stripe.side === 'top' ? 'top' : s.stripe.side === 'left' ? 'left' : s.stripe.side === 'right' ? 'right' : s.stripe.side === 'end' ? endSide : startSide;
    out[side] = { color: hex(s.stripe.color) ?? '000000', sz: eighths(u, s.stripe.width), space: 0 };
  }
  // A marker column (an icon over a rule, outside the box) keeps its rule,
  // as a border on the start side: without it a box with no fill and no
  // border would read as plain text.
  if (hasMarkerRule(s) && !out[startSide]) out[startSide] = { color: hex(s.marker.rule.color) ?? '000000', sz: eighths(u, s.marker.rule.width), space: 0 };
  return out;
}

const hasMarkerRule = (s: ResolvedCalloutStyleConfig): boolean => s.marker.kind !== 'none' && s.marker.rule.enabled && s.marker.rule.width.value > 0;

/** A paragraph as tall as a box's margin, with no text (the importer
 *  passes over blank paragraphs). */
function spacer(height: number, keepNext: boolean): string {
  if (height < 20) return '';
  return `<w:p><w:pPr>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="0" w:after="0" w:line="${height}" w:lineRule="exact"/><w:ind w:firstLine="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>`;
}

/** A box's estimated height, twips: its text at about 70 letters a line,
 *  its pictures at their drawn size and a line for each row of a table
 *  inside it. */
function boxHeight(cell: string, lineTw: number): number {
  const paras = (cell.match(/<w:p[ >/]/g) ?? []).length;
  const rows = (cell.match(/<w:tr[ >]/g) ?? []).length;
  // Letters counted inside the text runs, so no markup is stripped.
  let chars = 0;
  for (const m of cell.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)) chars += m[1]!.length;
  let drawn = 0;
  for (const m of cell.matchAll(/<wp:extent cx="\d+" cy="(\d+)"/g)) drawn += Number(m[1]) / 635;
  return (paras + rows + chars / 70) * lineTw + drawn;
}

/** Whether Word may not split a box: one whose style keeps it together,
 *  or a short one (about a dozen lines), but never one that might outgrow
 *  a page: Word clips a row it may not split, where the engine splits a
 *  keep-together box taller than its column. */
function keepBox(ctx: WriterContext, cell: string, keepTogether: boolean): boolean {
  // The plain design keeps nothing of the print's page: a box breaks
  // where the page ends, like any text.
  if (ctx.plain) return false;
  const lineTw = Math.max(200, twips(ctx.units, ctx.resolved.bodyText.lineHeight, ctx.styles.bodyPx));
  const geo = pageGeometry(ctx.resolved, ctx.units);
  const page = geo.heightTw - geo.margins.top - geo.margins.bottom;
  const h = boxHeight(cell, lineTw);
  // Columns the book sets side by side come one after the other in Word:
  // the box is taller than the one the style keeps on a page, and kept
  // whole it would leave the page before it half empty (a recipe card
  // under its photograph, #1444).
  const stacked = cell.includes('<w:tag w:val="ptx:columns"/>');
  return h <= page * 0.8 && ((keepTogether && !stacked) || h <= 14 * lineTw);
}

/** Most of a box's width its side insets may take together: what is left
 *  holds the text. */
const MAX_INSETS = 0.25;

/** Fit a box's side insets to the width it has in Word (#1444): the
 *  print's insets belong to the width the box takes there (the whole text
 *  area for a page-spanning box), so a box set narrower in Word keeps them
 *  in proportion, and never lets them take more than a quarter of its
 *  width. A box inside another box is as narrow in print as here: only
 *  the cap applies to it. */
function scaleInsets(ctx: WriterContext, pad: { left: number; right: number }, widthTw: number, spans: boolean, nested: boolean): void {
  const printPx = spans ? ctx.textAreaPx : ctx.columnPx;
  const printTw = (printPx * 1440) / ctx.units.dpi;
  let scale = !nested && printTw > widthTw ? widthTw / printTw : 1;
  const sides = (pad.left + pad.right) * scale;
  if (sides > widthTw * MAX_INSETS) scale *= (widthTw * MAX_INSETS) / sides;
  if (scale >= 1) return;
  pad.left = Math.round(pad.left * scale);
  pad.right = Math.round(pad.right * scale);
}

/** Whether a label tab stands at the end side of its box. */
function labelAtEnd(ctx: WriterContext, style: ResolvedCalloutStyleConfig): boolean {
  const side = style.label!.position.split('-')[1];
  const rtl = ctx.resolved.direction === 'rtl';
  return side === 'end' || (side === 'right' && !rtl) || (side === 'left' && rtl);
}

/** The paragraph style of a box style's label line: on its own plate
 *  (`labelPlate`) for a tab on the box's head, else a shaded run. */
function labelStyle(ctx: WriterContext, style: ResolvedCalloutStyleConfig, plate: boolean): string {
  const lb = style.label!;
  return ctx.styles.custom(`boxLabel:${style.id}${plate ? ':plate' : ''}`, `Box label ${style.id}`, () => {
    const size = px(ctx.units, lb.fontSize) || ctx.units.basePx;
    return {
      pPr: { keepNext: true, before: 0, after: plate ? 0 : 60, ind: { firstLine: 0 }, jc: plate ? 'center' : labelAtEnd(ctx, style) ? 'end' : 'start' },
      rPr: { ...ctx.styles.font(lb.fontFamily, lb.fontWeight), b: lb.fontWeight >= 600, color: hex(lb.color), ...(plate ? {} : { shd: hex(lb.background) }), sz: Math.max(2, Math.round((size * 144) / ctx.units.dpi)) },
    };
  });
}

/** Ems a label character takes, about: wide (CJK, full-width) ones a
 *  whole em, the rest 0.62. */
function labelEms(text: string): number {
  let ems = 0;
  for (const ch of text) ems += /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|[\u{20000}-\u{3ffff}]/u.test(ch) ? 1 : 0.62;
  return ems;
}

/**
 * A label tab on a box's head (#1444): a plate of the tab's fill, padded
 * round the words, at the tab's side and inset. A shaded paragraph as
 * wide as the words (an estimate, with the tab's padding each side) set
 * first in the box's cell: its indents narrow the shading to the plate,
 * and borders of the fill's colour pad it to the tab's height. Kept with
 * what follows it in the box, it never parts from it at a page's foot (a
 * nested table did, in LibreOffice). The box's top inset (`gap` twips)
 * goes under it, less half the plate, which in print hangs over the box's
 * top edge.
 */
function labelPlate(ctx: WriterContext, style: ResolvedCalloutStyleConfig, text: string, widthTw: number, gap: number): ParaProps {
  const lb = style.label!;
  const u = ctx.units;
  const size = px(u, lb.fontSize) || u.basePx;
  const padX = Math.max(60, twips(u, lb.paddingX, size));
  const words = Math.round((labelEms(text) * size * 1440) / u.dpi);
  const w = Math.min(widthTw, words + 2 * padX + 60);
  const h = Math.max(200, twips(u, lb.height, size));
  const fill = hex(lb.background) ?? '000000';
  const lineTw = Math.round((size * 1.2 * 1440) / u.dpi);
  const padY = Math.max(0, Math.min(31, Math.round((h - lineTw) / 40)));
  const edge = { color: fill, sz: 4, space: padY };
  const inset = Math.max(0, Math.min(widthTw - w, twips(u, lb.inset, size)));
  const rest = Math.max(0, widthTw - w - inset);
  const atEnd = labelAtEnd(ctx, style);
  return {
    keepNext: true,
    shd: fill,
    border: { top: edge, bottom: edge },
    ind: atEnd ? { left: rest, right: inset, firstLine: 0 } : { left: inset, right: rest, firstLine: 0 },
    before: 0,
    after: Math.max(0, gap - Math.round(h / 2)),
  };
}

/** A composed page's frame set as a box (#1444): the box style its
 *  template frame names, the title it shows when that style has no label
 *  tab, and its content control's tag. */
export interface FrameBox {
  style: ResolvedCalloutStyleConfig;
  head: () => string;
  tag: string;
}

export function renderBox(ctx: WriterContext, node: ContainerNode, env: BlockEnv, frame?: FrameBox): string {
  const attrs = node.container.containerAttrs ?? {};
  const own = frame ? frame.style : ctx.styles.callout(attrs.type);
  // In the colours of the part the box stands in.
  const style = inPartStyle(ctx, node.container, own);
  if (!style) ctx.warn('unknownBoxStyle', `No box style "${attrs.type ?? ''}": the box is set with the default look.`);
  const ids = ctx.styles.calloutStyles(style);
  const u = ctx.units;
  const width = Math.max(240, Math.round(env.widthTwips ?? ctx.textTwips));
  const pad = style?.padding;
  const padTw = pad ? { top: twips(u, pad.top), left: twips(u, pad.left), bottom: twips(u, pad.bottom), right: twips(u, pad.right) } : undefined;
  if (padTw) scaleInsets(ctx, padTw, width, (attrs.span ?? style?.span) === 'page', env.box !== undefined);
  // The gap between a marker's rule and the box's text.
  if (padTw && style && hasMarkerRule(style)) {
    const side = ctx.resolved.direction === 'rtl' ? 'right' : 'left';
    padTw[side] = Math.max(padTw[side], twips(u, style.marker.gap));
  }
  // A box style with a label tab prints the fence's `label` on it: here a
  // first line in the tab's face, colours and side.
  // What the cell holds is as wide as the cell less its margins (Word's
  // default is 108 twips a side).
  const inner = Math.max(240, width - (padTw ? padTw.left + padTw.right : 216));
  // A tab on the head stands first in the cell, flush with its top edge.
  const plate = style?.label && attrs.label && style.label.position.startsWith('top') ? labelPlate(ctx, style, attrs.label, inner, padTw?.top ?? 0) : undefined;
  const label = style?.label && attrs.label ? attrParagraph(ctx, node, 'label', labelStyle(ctx, style, !!plate), undefined, plate) : (frame?.head() ?? '');
  if (plate && label && padTw) padTw.top = 0;
  const title = (plate ? '' : label) + attrParagraph(ctx, node, 'title', ids.title, style?.title || undefined);
  const body = renderNodes(ctx, node.children, { ...env, paraStyle: ids.body, widthTwips: inner, box: style ?? env.box, boxTop: true });
  let cell = (plate ? label : '') + title + body;
  if (!cell || endsWithTable(cell)) cell += '<w:p/>';
  const borders = boxBorders(ctx, style);
  const bx = (side: string, b: Border | undefined): string => (b ? `<w:${side} w:val="single" w:sz="${b.sz}" w:space="0" w:color="${b.color}"/>` : `<w:${side} w:val="nil"/>`);
  const fill = style?.backgroundEnabled ? hex(style.background) : undefined;
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const mar = padTw
    ? `<w:tblCellMar><w:top w:w="${padTw.top}" w:type="dxa"/><w:left w:w="${padTw.left}" w:type="dxa"/><w:bottom w:w="${padTw.bottom}" w:type="dxa"/><w:right w:w="${padTw.right}" w:type="dxa"/></w:tblCellMar>`
    : '';
  // The whole width of the column or cell the box stands in, whatever its
  // width in twips there turns out to be (a side column is narrower than
  // the main one); Word and LibreOffice fit the cell to it.
  const keep = keepBox(ctx, cell, !!style?.keepTogether);
  const tbl =
    '<w:tbl><w:tblPr>' +
    '<w:tblW w:w="5000" w:type="pct"/>' +
    `<w:tblBorders>${bx('top', borders.top)}${bx('left', borders.left)}${bx('bottom', borders.bottom)}${bx('right', borders.right)}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    shd +
    '<w:tblLayout w:type="autofit"/>' +
    mar +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>' +
    '</w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid>` +
    `<w:tr>${keep ? '<w:trPr><w:cantSplit/></w:trPr>' : ''}<w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/>${shd}</w:tcPr>${cell}</w:tc></w:tr>` +
    '</w:tbl>';
  // A box drawn with a top rule keeps at least half a line from the text
  // above it, or the rule reads as that text's underline; so does a filled
  // box whose style keeps no space above it, or the fill starts on that
  // text's last line (#1444).
  const marginTop = style ? twips(u, style.marginTop) : 0;
  const ruleGap = borders.top || (fill && marginTop === 0) ? twips(u, ctx.resolved.bodyText.lineHeight, ctx.styles.bodyPx) / 2 : 0;
  const before = style ? spacer(Math.max(twips(u, style.marginTop), ruleGap), true) : '';
  const after = style ? spacer(twips(u, style.marginBottom), false) : '';
  return before + blockSdt(ctx.nextSdtId(), frame?.tag ?? `ptx:box:${attrs.type ?? ''}`, attrsLabel(attrs), tbl) + after;
}
