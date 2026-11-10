// What a composed page's template says about the frames the semantic
// .docx writes as flowing text (#1444): the box style a frame is drawn
// in (recoloured by the template's palette), the answer lines a ruled
// frame the Markdown leaves empty prints, the frame a picture is set
// over, and the number a template's `{headingNumber}` badge prints.

import type { ResolvedFrame, ResolvedPageTemplate } from '../../../composed/types/resolved.js';
import { resolvePageTemplate } from '../../../composed/templates/resolve.js';
import { withDigits } from '../../../numerals/arabicNumerals.js';
import { parsePartPalette } from '../../../pipeline/sections/parts.js';
import type { ContentBlock } from '../../../parse/types.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { eighths, hex, px, twips } from '../wml.js';

/** A template by id, as the engine resolves it (its `extends` applied). */
export function templateOf(ctx: WriterContext, id: string | undefined): ResolvedPageTemplate | undefined {
  if (!id) return undefined;
  return resolvePageTemplate({ pageTemplates: ctx.resolved.pageTemplates, calloutStyles: ctx.resolved.calloutStyles }, id);
}

/** The template frame a slot names. */
export function frameOf(template: ResolvedPageTemplate | undefined, slot: string | undefined): ResolvedFrame | undefined {
  return slot ? template?.frames.find((f) => f.name === slot) : undefined;
}

/** `style` with every palette-linked colour the template's palette names
 *  set to the palette's value (a page's `tema-tint` box in its own tint). */
function recolor(ctx: WriterContext, style: ResolvedCalloutStyleConfig, palettes: readonly (string | undefined)[]): ResolvedCalloutStyleConfig {
  const map: Record<string, string> = {};
  for (const p of palettes) Object.assign(map, parsePartPalette(p));
  if (!Object.keys(map).length) return style;
  // Resolving a style keeps some colours as plain values: those are
  // matched by the palette entry's own colour.
  const byHex = new Map<string, string>();
  for (const e of ctx.resolved.colorPalette ?? []) if (map[e.id] && e.value?.hex) byHex.set(e.value.hex.toLowerCase(), map[e.id]!);
  let changed = false;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const to = typeof o.hex !== 'string' ? undefined : typeof o.paletteId === 'string' ? map[o.paletteId] : byHex.get(o.hex.toLowerCase());
    if (to && typeof o.hex === 'string' && to !== o.hex.toLowerCase()) {
      changed = true;
      return { ...o, hex: to };
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
  };
  const out = walk(style) as ResolvedCalloutStyleConfig;
  if (!changed) return style;
  // Its own id: the Word styles made for a box style are keyed by it.
  const key = Object.entries(map).map(([k, x]) => `${k}${x}`).join('').replace(/[^A-Za-z0-9]/g, '');
  return { ...out, id: `${style.id}-${key}` };
}

/** Whether a box style draws a box: a fill that is not the paper's white,
 *  a border, a stripe or a label tab. A frame with none (a picture's
 *  white mat, a colophon) is written as plain text. */
function drawsBox(s: ResolvedCalloutStyleConfig): boolean {
  const fill = s.backgroundEnabled ? hex(s.background) : undefined;
  return (!!fill && fill.toUpperCase() !== 'FFFFFF') || s.border.enabled || s.stripe.enabled || !!s.label;
}

/** The box style a frame of `templates` (the page's, then its module's)
 *  is drawn in, when it draws a box. */
export function frameBoxStyle(ctx: WriterContext, templates: readonly (ResolvedPageTemplate | undefined)[], slot: string | undefined): ResolvedCalloutStyleConfig | undefined {
  let frame: ResolvedFrame | undefined;
  for (const t of templates) frame = frameOf(t, slot) ?? frame;
  if (!frame?.style) return undefined;
  const style = ctx.resolved.calloutStyles.find((s) => s.id === frame.style);
  // In the plain design every box style draws a rule: whether the frame is
  // a box is what the book's own style says.
  const drawn = ctx.plain ? ctx.plain.book.calloutStyles.find((s) => s.id === frame.style) : style;
  if (!style || !drawn || !drawsBox(drawn)) return undefined;
  return recolor(ctx, style, templates.map((t) => t?.palette));
}

/** A frame's height in px when the template fixes it (or its least). */
function frameHeightPx(ctx: WriterContext, f: ResolvedFrame): number {
  const fixed = typeof f.height === 'object' && 'value' in f.height ? f.height : f.minHeight;
  return fixed ? px(ctx.units, fixed) : 0;
}

/**
 * The answer lines of the ruled frames of `template` the Markdown leaves
 * empty (`filled` names the slots it fills): a one-column table of empty
 * rows, as many as the frame's height holds at the rules' pitch, each with
 * a rule under it. A table, not bordered paragraphs: Word and LibreOffice
 * merge the borders of paragraphs in a row. Its empty paragraphs read
 * back as nothing.
 */
export function ruledLines(ctx: WriterContext, template: ResolvedPageTemplate | undefined, filled: ReadonlySet<string>): string {
  // Lines to write on hold no words: the plain design leaves them out.
  if (ctx.plain) return '';
  let out = '';
  for (const f of template?.frames ?? []) {
    if (!f.rules || filled.has(f.name)) continue;
    const style = f.style ? ctx.resolved.calloutStyles.find((s) => s.id === f.style) : undefined;
    const line = style ? px(ctx.units, style.body.lineHeight, px(ctx.units, style.body.fontSize)) : px(ctx.units, ctx.resolved.bodyText.lineHeight, ctx.styles.bodyPx);
    const pitch = f.rules.every === undefined || f.rules.every === 'line' ? line : px(ctx.units, f.rules.every);
    const count = pitch > 0 ? Math.floor((frameHeightPx(ctx, f) + 0.5) / pitch) : 0;
    if (count < 1) continue;
    const rowTw = Math.max(240, Math.round((pitch * 1440) / ctx.units.dpi));
    const rule = `w:val="single" w:sz="${f.rules.width ? eighths(ctx.units, f.rules.width) : 4}" w:space="0" w:color="${hex(f.rules.color) ?? '9A9A9A'}"`;
    const row = `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${rowTw}" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:ind w:firstLine="0"/></w:pPr></w:p></w:tc></w:tr>`;
    out +=
      '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
      `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom ${rule}/><w:right w:val="nil"/><w:insideH ${rule}/><w:insideV w:val="nil"/></w:tblBorders>` +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
      `<w:tblGrid><w:gridCol w:w="${ctx.textTwips}"/></w:tblGrid>${row.repeat(count)}</w:tbl>` +
      // A table is never the last thing in a cell or before another table.
      `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${twips(ctx.units, { value: 4, unit: 'pt' })}" w:lineRule="exact"/><w:ind w:firstLine="0"/></w:pPr></w:p>`;
  }
  return out;
}

/** The frame a picture slot is set over (`placement.anchor.to: '#frame'`
 *  on a frame of a higher layer, the photo inside a box's corner). */
export function overFrame(template: ResolvedPageTemplate | undefined, slot: string | undefined): string | undefined {
  const f = frameOf(template, slot);
  const to = f?.placement?.anchor?.to;
  return f && f.layer > 0 && typeof to === 'string' && to.startsWith('#') ? to.slice(1) : undefined;
}

/**
 * Give the heading a composed page's title frame takes the number the
 * template's `{headingNumber}` badge prints (#984), when the book's own
 * numbering gives it none: the counter of the heading, in the book's
 * digits. Word has no badge; the number goes before the title, as the
 * contents list it.
 */
export function numberTemplateHeading(ctx: WriterContext, template: ResolvedPageTemplate | undefined, heading: ContentBlock | undefined): void {
  if (!template || !heading || heading.type !== 'heading' || ctx.chapter.headingNumbers.has(heading)) return;
  const badge = (template.decoration?.elements ?? []).some((e) => e.kind === 'text' && typeof e.content === 'string' && e.content.includes('{headingNumber'));
  if (!badge) return;
  const index = ctx.book[ctx.chapter.index]?.blocks.indexOf(heading) ?? -1;
  const value = index >= 0 ? ctx.numbers.headingValues[ctx.chapter.index]?.[index] : undefined;
  if (value !== undefined) ctx.chapter.headingNumbers.set(heading, withDigits(String(value), ctx.resolved.numerals));
}
