// The Word look of a named paragraph style (`:::paragraphs{style}`) and of
// a contents level (#1444), read from the resolved config. styles.ts
// registers them; these only compute the paragraph and run properties.

import type { ResolvedConfig } from '../../../vdt.js';
import type { ResolvedCalloutStyleConfig, ResolvedParagraphStyleConfig, ResolvedTocEntryStyleConfig, TextAlign } from '../../../types.js';
import { halfPoints, hex, px, twips, type ParaProps, type RunProps, type Units } from '../wml.js';

const JC: Record<TextAlign, ParaProps['jc']> = { left: 'left', justify: 'both', center: 'center', right: 'right' };

/** The face of a family stack at a weight and style (the registry's). */
export type FaceOf = (stack: string | undefined, weight?: number, italic?: boolean) => RunProps;

/** Paragraph and run properties of a named paragraph style. */
export function paragraphStyleLook(u: Units, bodyPx: number, face: FaceOf, ps: ResolvedParagraphStyleConfig): { pPr: ParaProps; rPr: RunProps } {
  const size = px(u, ps.fontSize, bodyPx);
  // A hanging indent sets the lines after the first deeper, the first
  // staying at the style's indent: Word pulls the first line out by
  // `w:hanging` from `w:left`, so the left side takes both (#1444).
  const hanging = twips(u, ps.hangingIndent, size);
  const indent = twips(u, ps.indent, size);
  // The style's margins hold above and below its group of paragraphs
  // (an argument before its poem, #1444): with no space between the
  // paragraphs, Word's contextual spacing drops them inside the group.
  const between = twips(u, ps.spaceBetween, size);
  const edges = between === 0 ? { after: twips(u, ps.marginBottom, size), contextualSpacing: true } : { after: between };
  return {
    pPr: {
      suppressAutoHyphens: !ps.hyphenation || undefined,
      before: twips(u, ps.marginTop, size),
      ...edges,
      line: { twips: twips(u, ps.lineHeight, size), rule: 'atLeast' },
      ind: { left: indent + Math.max(0, hanging), right: ps.endIndent ? twips(u, ps.endIndent, size) : undefined, firstLine: twips(u, ps.firstLineIndent, size), hanging: hanging > 0 ? hanging : undefined },
      jc: JC[ps.textAlign],
    },
    rPr: {
      ...face(ps.fontFamily, ps.fontWeight, ps.italic),
      i: ps.italic,
      smallCaps: ps.smallCaps || undefined,
      caps: ps.textTransform === 'uppercase' || undefined,
      color: hex(ps.color),
      spacing: ps.letterSpacing ? twips(u, ps.letterSpacing, size) : undefined,
      sz: halfPoints(u, ps.fontSize, bodyPx),
    },
  };
}

/** The indents of a box style's body paragraphs (#1451). Its
 *  `hangingIndent` hangs as the engine does: `true` sets every line but the
 *  first at the first-line indent and the first at the edge; a length sets
 *  the turnovers at that length and the first line at the edge, or at the
 *  style's own first-line indent (`ownFirstLineIndent`). Unset or `false`:
 *  the first-line indent alone. */
export function boxBodyIndent(u: Units, body: ResolvedCalloutStyleConfig['body'], size: number): NonNullable<ParaProps['ind']> {
  const first = twips(u, body.firstLineIndent, size);
  const hang = body.hangingIndent;
  if (hang === true) return first > 0 ? { left: first, hanging: first } : { firstLine: 0 };
  if (!hang) return { firstLine: first };
  const turnover = Math.max(0, twips(u, hang, size));
  const start = body.ownFirstLineIndent ? first : 0;
  // Word sets the first line `w:hanging` out from `w:left`; a first line
  // set deeper than the turnovers is a plain first-line indent from there.
  return turnover > start ? { left: turnover, hanging: turnover - start } : { left: turnover, firstLine: start - turnover };
}

/** The entry style of contents level `level`: the config's own, or the
 *  nearest level above it, as the engine picks it. */
export function tocEntryStyle(r: ResolvedConfig, level: number): ResolvedTocEntryStyleConfig | undefined {
  const levels = r.toc.levels;
  return levels.find((l) => l.level === level) ?? levels.filter((l) => l.level < level).sort((a, b) => b.level - a.level)[0] ?? levels[0];
}

/** How the entries of one contents level are numbered, as far as the
 *  level's style can say: `numbered` when every entry has a number,
 *  `unnumbered` when none has, `mixed` otherwise. */
export type TocLevelNumbering = 'numbered' | 'unnumbered' | 'mixed';

/** The look of an entry: the level's, with the config's unnumbered
 *  overrides on top for an entry without a number, as the engine sets it. */
export function tocEntryLook(r: ResolvedConfig, level: number, numbered: boolean): ResolvedTocEntryStyleConfig | undefined {
  const e = tocEntryStyle(r, level);
  return e && !numbered ? { ...e, ...r.toc.unnumbered } : e;
}

/** The columns of a numbered entry, twips from the left of the text: the
 *  entry's indent, the right edge of its number column and the start of
 *  its title. */
export function tocColumns(u: Units, e: ResolvedTocEntryStyleConfig): { indent: number; column: number; text: number } {
  const size = px(u, e.fontSize);
  const indent = twips(u, e.indent, size);
  const column = indent + twips(u, e.numberWidth, size);
  return { indent, column, text: column + twips(u, e.numberGap, size) };
}

/** The tab stop that sets the page number flush with `endTwips`, with a
 *  dot leader only when the config draws one. */
export function tocPageTab(r: ResolvedConfig, endTwips: number): NonNullable<ParaProps['tabs']>[number] {
  return { val: 'right', pos: endTwips, ...(r.toc.leader.enabled ? { leader: 'dot' as const } : {}) };
}

/** Paragraph and run properties of contents level `level` (`toc N`): the
 *  entry's face, size, colour and slant, its indent and the space around
 *  it. Without a level in the config, Word's plain step indent.
 *
 *  When Word updates the TOC field it rebuilds every entry from this style
 *  and drops the entries' own properties, so the style holds what has to
 *  survive that: the page-number tab (`endTwips`, leader or none) and, for
 *  a level whose entries all carry a number, the number column's tabs and
 *  the hanging indent; a level with no numbered entry takes the
 *  unnumbered look (#1444). */
export function tocLevelLook(r: ResolvedConfig, u: Units, face: FaceOf, level: number, endTwips?: number, numbering: TocLevelNumbering = 'mixed'): { pPr: ParaProps; rPr?: RunProps } {
  const e = tocEntryLook(r, level, numbering !== 'unnumbered');
  const pageTab = endTwips ? [tocPageTab(r, endTwips)] : [];
  if (!e) return { pPr: { before: 0, after: level === 1 ? 60 : 0, ind: { left: (level - 1) * 240, firstLine: 0 }, jc: 'left', ...(pageTab.length ? { tabs: pageTab } : {}) } };
  const size = px(u, e.fontSize);
  const cols = tocColumns(u, e);
  const numbered = numbering === 'numbered';
  return {
    pPr: {
      before: twips(u, e.marginTop, size),
      after: twips(u, e.marginBottom, size),
      line: { twips: twips(u, e.lineHeight, size), rule: 'atLeast' },
      ind: numbered ? { left: cols.text, hanging: cols.text - cols.indent } : { left: cols.indent, firstLine: 0 },
      jc: 'left',
      tabs: [...(numbered ? [{ val: 'right' as const, pos: cols.column }, { val: 'left' as const, pos: cols.text }] : []), ...pageTab],
    },
    rPr: { ...face(e.fontFamily, e.fontWeight, e.italic), i: e.italic, color: hex(e.color), sz: halfPoints(u, e.fontSize) },
  };
}

/** Run properties that set an entry's title in `look` when it differs
 *  from its level style's `base` (an unnumbered entry among numbered
 *  ones): the face, slant, colour and size that change. */
export function tocTitleOverride(u: Units, face: FaceOf, base: ResolvedTocEntryStyleConfig, look: ResolvedTocEntryStyleConfig): RunProps | undefined {
  const same = base.fontFamily === look.fontFamily && base.fontWeight === look.fontWeight && base.italic === look.italic
    && hex(base.color) === hex(look.color) && halfPoints(u, base.fontSize) === halfPoints(u, look.fontSize);
  if (same) return undefined;
  // `b: false` undoes a bold level style for a lighter unnumbered entry.
  return { b: false, ...face(look.fontFamily, look.fontWeight, look.italic), i: look.italic, color: hex(look.color), sz: halfPoints(u, look.fontSize) };
}
