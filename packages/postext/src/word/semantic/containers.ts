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
  if (name === 'part') {
    // The part's page break comes once: before its number, or before its
    // title when it has none.
    // The book's part design draws it when it has one (#1444).
    const designed = renderPartDesign(ctx, c, (key, style, props) => attrParagraph(ctx, node, key, style, undefined, props));
    const number = designed === undefined ? attrParagraph(ctx, node, 'number', STYLE.part) : '';
    const head = designed ?? number + attrParagraph(ctx, node, 'title', STYLE.part, undefined, number ? { pageBreakBefore: false } : undefined);
    return blockSdt(ctx.nextSdtId(), 'ptx:part', attrsLabel(attrs), head + renderNodes(ctx, node.children, env) || '<w:p/>');
  }
  if (name === 'paragraphs') {
    const style = attrs.style ? ctx.styles.paragraphStyle(attrs.style) : undefined;
    const body = renderNodes(ctx, node.children, { ...env, paraStyle: style ?? env.paraStyle });
    return blockSdt(ctx.nextSdtId(), `ptx:paragraphs${attrs.style ? `:${attrs.style}` : ''}`, attrsLabel(attrs), body || '<w:p/>');
  }
  if (name === 'columns' && env.box) return boxColumns(ctx, node, env);
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
  const chars = cell.replace(/<[^>]*>/g, '').length;
  let drawn = 0;
  for (const m of cell.matchAll(/<wp:extent cx="\d+" cy="(\d+)"/g)) drawn += Number(m[1]) / 635;
  return (paras + rows + chars / 70) * lineTw + drawn;
}

/** Whether Word may not split a box: one whose style keeps it together,
 *  or a short one (about a dozen lines), but never one that might outgrow
 *  a page: Word clips a row it may not split, where the engine splits a
 *  keep-together box taller than its column. */
function keepBox(ctx: WriterContext, cell: string, keepTogether: boolean): boolean {
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

/** The paragraph style of a box style's label line. */
function labelStyle(ctx: WriterContext, style: ResolvedCalloutStyleConfig): string {
  const lb = style.label!;
  return ctx.styles.custom(`boxLabel:${style.id}`, `Box label ${style.id}`, () => {
    const size = px(ctx.units, lb.fontSize) || ctx.units.basePx;
    const rtl = ctx.resolved.direction === 'rtl';
    const side = lb.position.split('-')[1];
    const end = side === 'end' || (side === 'right' && !rtl) || (side === 'left' && rtl);
    return {
      pPr: { keepNext: true, before: 0, after: 60, ind: { firstLine: 0 }, jc: end ? 'end' : 'start' },
      rPr: { ...ctx.styles.font(lb.fontFamily, lb.fontWeight), b: lb.fontWeight >= 600, color: hex(lb.color), shd: hex(lb.background), sz: Math.max(2, Math.round((size * 144) / ctx.units.dpi)) },
    };
  });
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
  const style = frame ? frame.style : ctx.styles.callout(attrs.type);
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
  const label = style?.label && attrs.label ? attrParagraph(ctx, node, 'label', labelStyle(ctx, style)) : (frame?.head() ?? '');
  const title = label + attrParagraph(ctx, node, 'title', ids.title, style?.title || undefined);
  // What the cell holds is as wide as the cell less its margins (Word's
  // default is 108 twips a side).
  const inner = Math.max(240, width - (padTw ? padTw.left + padTw.right : 216));
  const body = renderNodes(ctx, node.children, { ...env, paraStyle: ids.body, widthTwips: inner, box: style ?? env.box, boxTop: true });
  let cell = title + body;
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
  // above it, or the rule reads as that text's underline (#1444).
  const ruleGap = borders.top ? twips(u, ctx.resolved.bodyText.lineHeight, ctx.styles.bodyPx) / 2 : 0;
  const before = style ? spacer(Math.max(twips(u, style.marginTop), ruleGap), true) : '';
  const after = style ? spacer(twips(u, style.marginBottom), false) : '';
  return before + blockSdt(ctx.nextSdtId(), frame?.tag ?? `ptx:box:${attrs.type ?? ''}`, attrsLabel(attrs), tbl) + after;
}
