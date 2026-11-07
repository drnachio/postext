// `:::verse` poems in the semantic .docx (#1444). A stanza (line layout)
// or a whole poem (bayt layout) is one paragraph whose lines end in line
// breaks, so the paragraph is never justified: Word and LibreOffice would
// stretch every line that ends in a break. A line's indent, which the
// source writes as leading spaces, comes back as en spaces held by the
// atom of the line break before it. A bayt's two hemistichs sit at the two
// ends of the measure: the first flush with the start, the tab between them
// reaching an end-aligned tab stop, so neither renderer pulls them apart
// or runs them together.

import type { ContentBlock } from '../../parse/types.js';
import { lengthAttr } from '../../pipeline/text/verse.js';
import { abs, blockId, type WriterContext } from './context.js';
import { inlineSourceOf, type BlockEnv } from './blocks.js';
import { renderInline } from './inline.js';
import { STYLE } from './styles.js';
import { paragraph, px, twips, type ParaProps } from './wml.js';

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

/** The paragraph of a verse block. */
export function renderVerse(ctx: WriterContext, b: ContentBlock, env: BlockEnv): string {
  const verse = b.verse!;
  const name = verse.attrs.style;
  const style = (name && ctx.styles.paragraphStyle(name)) || STYLE.verse;
  const ps = name ? ctx.resolved.paragraphStyles.find((s) => s.id === name || s.name === name) : undefined;
  // Lines flush with the start, with no first-line or hanging indent: each
  // line after a break would take it. (A poem the engine centres as a
  // block on its longest line is set flush too: Word cannot centre a block
  // whose lines stay flush with one another.)
  const props: ParaProps = { style, ind: { firstLine: 0 }, jc: 'left', suppressAutoHyphens: true };
  const size = ps ? px(ctx.units, ps.fontSize, ctx.styles.bodyPx) : ctx.styles.bodyPx;
  // The space between two stanzas, in lines of the poem's leading.
  if (verse.stanza && verse.stanza.index > 0) {
    const lines = Number(verse.attrs.stanzaSpace);
    const space = Number.isFinite(lines) && verse.attrs.stanzaSpace?.trim() ? lines : ctx.resolved.bodyText.verse.stanzaSpace;
    props.before = Math.round(Math.max(0, space) * twips(ctx.units, ps?.lineHeight ?? ctx.resolved.bodyText.lineHeight, size));
  }
  if (!verse.stanza && b.text.includes('\t')) {
    const end = ps?.endIndent ? twips(ctx.units, ps.endIndent, size) : 0;
    const width = Math.round(env.widthTwips ?? ctx.textTwips);
    props.tabs = [{ val: 'right', pos: Math.max(720, width - end) }];
  }
  const source = { ...inlineSourceOf(ctx, b), lineLeads: lineLeads(ctx, b) };
  const { xml, frag } = renderInline(ctx, source);
  const wrapped = ctx.log.wrap(xml, frag, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [abs(ctx, b.sourceStart), abs(ctx, b.sourceEnd)],
    role: 'verse',
  });
  return paragraph(props, wrapped);
}
