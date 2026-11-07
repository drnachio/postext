// Display equations. An equation without a number is a paragraph of its
// own holding an `m:oMathPara`. A numbered one (`\tag{1}`) is set the way
// Word users number equations by hand: a centre tab stop at the middle of
// the column for the equation and a right tab stop at its edge for the
// number. Word, LibreOffice and Google Docs all show that, where Word's own
// equation-array number (`#(1)`) shows as text outside Word. The tabs and
// the number are generated fragments: the importer drops them, so the
// number never reads back as an edit, and the `\tag` stays in the source.

import type { ContentBlock } from '../../parse/types.js';
import { texToDisplayOmml } from '../ommlWrite/index.js';
import { ommlHash } from '../anchors/ommlHash.js';
import { blockId, type WriterContext } from './context.js';
import { FragmentBuilder, OBJECT_CHAR } from './fragments.js';
import { rawSdt } from './raw.js';
import { STYLE } from './styles.js';
import { escapeAttr } from '../xml.js';
import { paragraph, textRuns } from './wml.js';

/** Text the writer adds (a tab, an equation number), logged as generated. */
function generated(ctx: WriterContext, text: string): string {
  const frag = new FragmentBuilder();
  frag.push(text, new Array<number>(text.length).fill(-1));
  return ctx.log.wrap(textRuns(text, ''), frag, { block: blockId(ctx), target: { kind: 'generated' }, range: [0, 0], role: 'number' });
}

/** A `$$…$$` block: an equation paragraph, or its source as raw Markdown
 *  when it has no OMML form. `widthTwips` is the width of the text it sits
 *  in, for the number's tab stop. */
export function renderDisplayMath(ctx: WriterContext, b: ContentBlock, start: number, end: number, widthTwips: number): string {
  const eq = b.tex !== undefined ? texToDisplayOmml(b.tex) : null;
  if (!eq) return rawSdt(ctx, start, end, 'math');
  // Fragments are numbered in document order: the leading tab first.
  const lead = eq.tag === undefined ? '' : generated(ctx, '\t');
  const f = new FragmentBuilder();
  f.atom(OBJECT_CHAR, start, end, 'math', '', ommlHash(eq.omml));
  const xml = ctx.log.wrap(eq.omml, f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [start, end], role: 'math' });
  if (eq.tag === undefined) return paragraph({ style: STYLE.math }, xml);
  const width = Math.max(720, Math.round(widthTwips));
  const tabs = `<w:tabs><w:tab w:val="center" w:pos="${Math.round(width / 2)}"/><w:tab w:val="right" w:pos="${width}"/></w:tabs>`;
  const pPr = `<w:pPr><w:pStyle w:val="${escapeAttr(STYLE.math)}"/><w:keepLines/>${tabs}<w:jc w:val="left"/></w:pPr>`;
  return `<w:p>${pPr}${lead}${xml}${generated(ctx, `\t${eq.tag}`)}</w:p>`;
}
