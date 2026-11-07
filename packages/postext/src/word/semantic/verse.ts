// `:::verse` poems in the semantic .docx (#1444). A stanza (line layout)
// or a whole poem (bayt layout) is one paragraph whose lines end in line
// breaks, so the paragraph is never justified: Word and LibreOffice would
// stretch every line that ends in a break. A line's indent, which the
// source writes as leading spaces, comes back as en spaces held by the
// atom of the line break before it. A bayt poem is set as the engine sets
// it: a block twice its widest hemistich plus the gap, centred in the
// measure (or flush with the start under `align=start`). The paragraph's
// indents frame that block; the first hemistich sits flush with its start
// and the tab between the halves reaches an end-aligned tab stop on its
// end, so neither renderer pulls them apart or runs them together.

import type { ContentBlock } from '../../parse/types.js';
import type { ResolvedParagraphStyleConfig } from '../../types.js';
import { lengthAttr, verseSettings } from '../../pipeline/text/verse.js';
import { verseLinesSettings } from '../../pipeline/text/verseLines.js';
import { abs, blockId, type WriterContext } from './context.js';
import { inlineSourceOf, type BlockEnv } from './blocks.js';
import { renderInline, type InlineSource } from './inline.js';
import { STYLE } from './styles.js';
import { paragraph, pPr, px, twips, type ParaProps } from './wml.js';

/** An en space: half an em, the default width of one leading space of a
 *  line of verse (`bodyText.verse.indentStep`). */
const EN_SPACE = ' ';

/** The en spaces of each line's indent (index = line of the block). */
function lineLeads(ctx: WriterContext, b: ContentBlock): string[] | undefined {
  const lines = b.verse?.stanza?.lines;
  if (!lines?.some((l) => l.indent > 0)) return undefined;
  const u = ctx.units;
  const em = ctx.styles.bodyPx;
  const stepPx = lengthAttr(b.verse!.attrs.indentStep, u.dpi, em) ?? px(u, ctx.resolved.bodyText.verse.indentStep, em);
  const perSpace = em > 0 ? stepPx / (em / 2) : 1;
  return lines.map((l) => EN_SPACE.repeat(Math.max(0, Math.min(40, Math.round(l.indent * perSpace)))));
}

/** Average advance of a character, in em, used to size a hemistich: joined
 *  Arabic and Hebrew letters run narrower than Latin ones (a vocalised
 *  Amiri hemistich averages about 0.36 em a character, spaces included). Word cannot stretch a hemistich to
 *  the poem's common width as the engine does, so the estimate leans wide:
 *  a block a little too wide leaves a larger gap, one too narrow would
 *  push the second half past its stop. */
const ADVANCE_EM = 0.55;
const ADVANCE_EM_RTL = 0.4;

/** A hemistich's estimated width, px: its characters without combining
 *  marks (harakat, shadda), which take no advance of their own. */
function hemistichPx(text: string, em: number): number {
  const chars = [...text.trim().replace(/\p{M}/gu, '')];
  const rtl = chars.filter((c) => /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}]/u.test(c)).length;
  return (rtl * ADVANCE_EM_RTL + (chars.length - rtl) * ADVANCE_EM) * em;
}

/** The bayt block in twips from the start margin: where it starts and
 *  ends within `measureTwips`, as the engine places it. */
export function baytBlock(text: string, attrs: Parameters<typeof verseSettings>[0], dpi: number, em: number, measureTwips: number): { start: number; end: number } {
  const settings = verseSettings(attrs, dpi, em);
  const toTwips = (v: number): number => (v * 1440) / dpi;
  const measure = (measureTwips * dpi) / 1440;
  let widest = 0;
  for (const line of text.split('\n')) {
    const halves = line.split('\t');
    if (halves.length === 2) for (const h of halves) widest = Math.max(widest, hemistichPx(h, em));
  }
  const half = Math.max(0, (measure - settings.gapPx) / 2);
  const w = Math.min(settings.widthPx ?? widest, half);
  const total = 2 * w + settings.gapPx;
  const x = settings.align === 'start' ? 0 : Math.max(0, (measure - total) / 2);
  return { start: Math.round(toTwips(x)), end: Math.round(toTwips(Math.min(measure, x + total))) };
}

/** The paragraph of a verse block. */
export function renderVerse(ctx: WriterContext, b: ContentBlock, env: BlockEnv): string {
  const verse = b.verse!;
  const name = verse.attrs.style;
  const style = (name && ctx.styles.paragraphStyle(name)) || STYLE.verse;
  const ps = name ? ctx.resolved.paragraphStyles.find((s) => s.id === name || s.name === name) : undefined;
  // Lines flush with the start. (A poem the engine centres as a block on
  // its longest line is set flush too: Word cannot centre a block whose
  // lines stay flush with one another.)
  const props: ParaProps = { style, ind: { firstLine: 0 }, jc: 'left', suppressAutoHyphens: true };
  const size = (ps && px(ctx.units, ps.fontSize, ctx.styles.bodyPx)) || ctx.styles.bodyPx;
  // The space between two stanzas, in lines of the poem's leading.
  if (verse.stanza && verse.stanza.index > 0) {
    const lines = Number(verse.attrs.stanzaSpace);
    const space = Number.isFinite(lines) && verse.attrs.stanzaSpace?.trim() ? lines : ctx.resolved.bodyText.verse.stanzaSpace;
    props.before = Math.round(Math.max(0, space) * twips(ctx.units, ps?.lineHeight ?? ctx.resolved.bodyText.lineHeight, size));
  }
  if (!verse.stanza && b.text.includes('\t')) {
    const end = ps?.endIndent ? twips(ctx.units, ps.endIndent, size) : 0;
    const width = Math.round(env.widthTwips ?? ctx.textTwips);
    const block = baytBlock(b.text, verse.attrs, ctx.units.dpi, size, Math.max(720, width - end));
    // Equal indents on both sides (0 under `align=start`) hold in either
    // writing direction; the end tab then closes the block.
    const side = block.start;
    props.ind = { left: side, right: side, firstLine: 0 };
    props.tabs = [{ val: 'right', pos: Math.max(side + 360, block.end) }];
  }
  const source: InlineSource = { ...inlineSourceOf(ctx, b), lineLeads: lineLeads(ctx, b), ...(style ? { style } : {}) };
  let first = props;
  if (verse.stanza) {
    const lineProps = stanzaLineProps(ctx, verse, props, ps, size);
    source.lineLeads ??= verse.stanza.lines.map(() => '');
    source.lineParagraph = (line) => `</w:p><w:p>${pPr(lineProps(line))}`;
    first = lineProps(0);
  }
  const { xml, frag } = renderInline(ctx, source);
  const wrapped = ctx.log.wrap(xml, frag, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [abs(ctx, b.sourceStart), abs(ctx, b.sourceEnd)],
    role: 'verse',
  });
  return paragraph(first, wrapped);
}

/**
 * A stanza is set a paragraph per line of verse (#1444), each line's
 * turnovers hung deeper than its start as the engine hangs them (the
 * poem's `hang`, its paragraph style's `hangingIndent`, else
 * `bodyText.verse.hang`): a line ended by a line break would send its
 * turnover back to the margin. The stanza stays one fragment, its line
 * ends read back as paragraph marks. The properties of line `i`: the
 * stanza's space before it on the first, the style's after it on the
 * last, none between; a stanza short enough to keep whole
 * (`keepStanzas`) keeps its lines together.
 */
function stanzaLineProps(ctx: WriterContext, verse: NonNullable<ContentBlock['verse']>, props: ParaProps, ps: ResolvedParagraphStyleConfig | undefined, size: number): (i: number) => ParaProps {
  const body = ctx.resolved.bodyText;
  const lineHeightPx = px(ctx.units, ps?.lineHeight ?? body.lineHeight, size);
  const hangPx = verseLinesSettings(verse.attrs, { fontSizePx: size, lineHeightPx }, ctx.resolved, false).hangPx;
  const hang = Math.round((hangPx * 1440) / ctx.units.dpi);
  const left = ps ? twips(ctx.units, ps.indent, size) : twips(ctx.units, body.blockquote.indent, ctx.styles.bodyPx);
  const count = verse.stanza?.lines.length ?? 1;
  const keep = count <= body.verse.keepStanzas;
  return (i) => ({
    ...props,
    ind: { left: left + hang, hanging: hang },
    ...(i > 0 ? { before: 0 } : {}),
    ...(i < count - 1 ? { after: 0, ...(keep ? { keepNext: true } : {}) } : {}),
  });
}
