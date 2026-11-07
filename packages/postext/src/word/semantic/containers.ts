// `:::` containers in Word (#1390). A box (`:::callout`) is a content
// control tagged `ptx:box:<type>` around a one-cell table shaded and
// bordered like the box style, its title paragraph first; a `:::part`,
// `:::paragraphs`, `:::columns` or `:::paper` group is a content control
// around its blocks; an exercise is set by exercises.ts and a composed
// page stands as a placeholder (#1444); stray modules and frames go raw.

import type { ResolvedCalloutStyleConfig } from '../../types.js';
import { abs, blockId, type WriterContext } from './context.js';
import { FragmentBuilder } from './fragments.js';
import { endsWithTable, renderNodes, type BlockEnv, type Node } from './blocks.js';
import { renderExercise } from './exercises.js';
import { attrRange } from './marks.js';
import { renderPagePlaceholder } from './pages.js';
import { rawSdt } from './raw.js';
import { STYLE } from './styles.js';
import { blockSdt, eighths, hex, paragraph, px, textRuns, twips, type Border, type ParaProps } from './wml.js';

type ContainerNode = Extract<Node, { container: unknown }>;

const RAW_CONTAINERS = new Set(['exercise', 'solution', 'hint', 'module', 'composedPage', 'frame', 'figure']);

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
  if (name === 'composedPage') return renderPagePlaceholder(ctx, c, 'composedPage');
  if (RAW_CONTAINERS.has(name)) {
    const [start, end] = rangeOf(ctx, node);
    return rawSdt(ctx, start, end, name);
  }
  if (name === 'callout') return renderBox(ctx, node, env);
  if (name === 'part') {
    // The part's page break comes once: before its number, or before its
    // title when it has none.
    const number = attrParagraph(ctx, node, 'number', STYLE.part);
    const head = number + attrParagraph(ctx, node, 'title', STYLE.part, undefined, number ? { pageBreakBefore: false } : undefined);
    return blockSdt(ctx.nextSdtId(), 'ptx:part', attrsLabel(attrs), head + renderNodes(ctx, node.children, env) || '<w:p/>');
  }
  if (name === 'paragraphs') {
    const style = attrs.style ? ctx.styles.paragraphStyle(attrs.style) : undefined;
    const body = renderNodes(ctx, node.children, { ...env, paraStyle: style ?? env.paraStyle });
    return blockSdt(ctx.nextSdtId(), `ptx:paragraphs${attrs.style ? `:${attrs.style}` : ''}`, attrsLabel(attrs), body || '<w:p/>');
  }
  return blockSdt(ctx.nextSdtId(), `ptx:${name}`, attrsLabel(attrs), renderNodes(ctx, node.children, env) || '<w:p/>');
}

function boxBorders(ctx: WriterContext, s: ResolvedCalloutStyleConfig | undefined): Record<'top' | 'left' | 'bottom' | 'right', Border | undefined> {
  const out: Record<'top' | 'left' | 'bottom' | 'right', Border | undefined> = { top: undefined, left: undefined, bottom: undefined, right: undefined };
  if (!s) return out;
  const u = ctx.units;
  if (s.border.enabled) {
    for (const side of ['top', 'left', 'bottom', 'right'] as const) {
      const own = s.border.sides?.[side as keyof NonNullable<typeof s.border.sides>];
      const b = own ?? { enabled: true, color: s.border.color, width: s.border.width };
      if (b.enabled && px(u, b.width) > 0) out[side] = { color: hex(b.color) ?? '000000', sz: eighths(u, b.width), space: 0 };
    }
  }
  if (s.stripe.enabled) {
    const side = s.stripe.side === 'right' || s.stripe.side === 'end' ? 'right' : s.stripe.side === 'top' ? 'top' : 'left';
    out[side] = { color: hex(s.stripe.color) ?? '000000', sz: eighths(u, s.stripe.width), space: 0 };
  }
  return out;
}

function renderBox(ctx: WriterContext, node: ContainerNode, env: BlockEnv): string {
  const attrs = node.container.containerAttrs ?? {};
  const style = ctx.styles.callout(attrs.type);
  if (!style) ctx.warn('unknownBoxStyle', `No box style "${attrs.type ?? ''}": the box is set with the default look.`);
  const ids = ctx.styles.calloutStyles(style);
  const u = ctx.units;
  const width = Math.max(240, Math.round(env.widthTwips ?? ctx.textTwips));
  const pad = style?.padding;
  const padTw = pad ? { top: twips(u, pad.top), left: twips(u, pad.left), bottom: twips(u, pad.bottom), right: twips(u, pad.right) } : undefined;
  const title = attrParagraph(ctx, node, 'title', ids.title, style?.title || undefined);
  // What the cell holds is as wide as the cell less its margins (Word's
  // default is 108 twips a side).
  const inner = Math.max(240, width - (padTw ? padTw.left + padTw.right : 216));
  const body = renderNodes(ctx, node.children, { ...env, paraStyle: ids.body, widthTwips: inner });
  let cell = title + body;
  if (!cell || endsWithTable(cell)) cell += '<w:p/>';
  const borders = boxBorders(ctx, style);
  const bx = (side: string, b: Border | undefined): string => (b ? `<w:${side} w:val="single" w:sz="${b.sz}" w:space="0" w:color="${b.color}"/>` : `<w:${side} w:val="nil"/>`);
  const fill = style?.backgroundEnabled ? hex(style.background) : undefined;
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const mar = padTw
    ? `<w:tblCellMar><w:top w:w="${padTw.top}" w:type="dxa"/><w:left w:w="${padTw.left}" w:type="dxa"/><w:bottom w:w="${padTw.bottom}" w:type="dxa"/><w:right w:w="${padTw.right}" w:type="dxa"/></w:tblCellMar>`
    : '';
  const tbl =
    '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${width}" w:type="dxa"/>` +
    `<w:tblBorders>${bx('top', borders.top)}${bx('left', borders.left)}${bx('bottom', borders.bottom)}${bx('right', borders.right)}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    shd +
    '<w:tblLayout w:type="fixed"/>' +
    mar +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>' +
    '</w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid>` +
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shd}</w:tcPr>${cell}</w:tc></w:tr>` +
    '</w:tbl>';
  return blockSdt(ctx.nextSdtId(), `ptx:box:${attrs.type ?? ''}`, attrsLabel(attrs), tbl);
}
