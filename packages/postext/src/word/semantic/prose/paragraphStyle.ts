// The Word look of a named paragraph style (`:::paragraphs{style}`) and of
// a contents level (#1444), read from the resolved config. styles.ts
// registers them; these only compute the paragraph and run properties.

import type { ResolvedConfig } from '../../../vdt.js';
import type { ResolvedParagraphStyleConfig, ResolvedTocEntryStyleConfig, TextAlign } from '../../../types.js';
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

/** The entry style of contents level `level`: the config's own, or the
 *  nearest level above it, as the engine picks it. */
export function tocEntryStyle(r: ResolvedConfig, level: number): ResolvedTocEntryStyleConfig | undefined {
  const levels = r.toc.levels;
  return levels.find((l) => l.level === level) ?? levels.filter((l) => l.level < level).sort((a, b) => b.level - a.level)[0] ?? levels[0];
}

/** Paragraph and run properties of contents level `level` (`toc N`): the
 *  entry's face, size, colour and slant, its indent and the space around
 *  it. Without a level in the config, Word's plain step indent. */
export function tocLevelLook(r: ResolvedConfig, u: Units, face: FaceOf, level: number): { pPr: ParaProps; rPr?: RunProps } {
  const e = tocEntryStyle(r, level);
  if (!e) return { pPr: { before: 0, after: level === 1 ? 60 : 0, ind: { left: (level - 1) * 240, firstLine: 0 }, jc: 'left' } };
  const size = px(u, e.fontSize);
  return {
    pPr: {
      before: twips(u, e.marginTop, size),
      after: twips(u, e.marginBottom, size),
      line: { twips: twips(u, e.lineHeight, size), rule: 'atLeast' },
      ind: { left: twips(u, e.indent, size), firstLine: 0 },
      jc: 'left',
    },
    rPr: { ...face(e.fontFamily, e.fontWeight, e.italic), i: e.italic, color: hex(e.color), sz: halfPoints(u, e.fontSize) },
  };
}
