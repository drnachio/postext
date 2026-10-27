// What the stylesheet of a reflowable book is written with: the Japanese
// line breaks, emphasis marks, family stacks, alignments and a rule from its
// declarations (#1276: split out of css.ts).
import { type ResolvedConfig, featureFamilyParts, primaryFontFamily } from 'postext';
import { cssString } from '../../shared/assets.js';
import type { CssRule } from './types.js';

/** CSS `line-break` for a Japanese kinsoku level (`cjk.lineBreak`, #417):
 *  JLReq's strictest rules are CSS `strict` (no small kana, ー or 々 at a
 *  line start), the general books' rules CSS `normal` (they may), the
 *  newspapers' CSS `loose`. Chinese levels write none, as before. */
const LINE_BREAK: Record<string, string> = { 'ja-very-strict': 'strict', 'ja-strict': 'normal', 'ja-loose': 'loose' };

/** The declarations of the Japanese text of a book (#428): kinsoku and,
 *  with burasagari (`cjk.hangingPunctuation`, on by default in Japan),
 *  、。，． hanging past the line end; and, in any book that asks for it,
 *  lines broken only between phrases (`cjk.wordBreak: 'keep-all'`, #463).
 *  None for other books. */
export function japaneseDecls(cjk: ResolvedConfig['cjk']): string[] {
  const out: string[] = [];
  if (cjk.wordBreak === 'keep-all') out.push('word-break: keep-all');
  const lineBreak = LINE_BREAK[cjk.lineBreak];
  if (lineBreak) out.push(`line-break: ${lineBreak}`, `-epub-line-break: ${lineBreak}`, `-webkit-line-break: ${lineBreak}`);
  if (cjk.region === 'japan' && cjk.hangingPunctuation !== 'none') {
    out.push(`hanging-punctuation: ${cjk.hangingPunctuation === 'force' ? 'force-end' : 'allow-end'}`);
  }
  return out;
}

/** The emphasis-mark rule of a class `dotsClasses` gives: a shape and fill
 *  (`pt-dots-filled-sesame`), or a side (`pt-dots-over`: over horizontal
 *  text and right of vertical text; `pt-dots-under`: under and left). */
export function dotsRule(cls: string): CssRule | '' {
  const side = /^pt-dots-(over|under)$/.exec(cls);
  if (side) {
    const pos = side[1] === 'over' ? 'over right' : 'under left';
    return rule(`.pt-dots.${cls}`, [`text-emphasis-position: ${pos}`, `-webkit-text-emphasis-position: ${pos}`]);
  }
  const shape = /^pt-dots-(filled|open)-(dot|circle|sesame)$/.exec(cls);
  if (!shape) return '';
  const style = `${shape[1]} ${shape[2]}`;
  return rule(`.pt-dots.${cls}`, [`text-emphasis-style: ${style}`, `-epub-text-emphasis-style: ${style}`, `-webkit-text-emphasis-style: ${style}`]);
}

const SANS = /\b(sans|grotesk|grotesque|gothic|helvetica|arial|inter|roboto|lato|montserrat|open sans|source sans|fira sans|heiti|hei\b|黑)/i;
const MONO = /\b(mono|code|courier|consol)/i;

/** A family as a CSS value: the family quoted, then a generic fallback. A
 *  feature family (#1237, `Lora@onum`) is its base family's. */
export function familyStack(family: string): string {
  const name = familyName(family);
  const generic = MONO.test(name) ? 'monospace' : SANS.test(name) ? 'sans-serif' : 'serif';
  return `${cssString(name)}, ${generic}`;
}

/** The family names the stylesheet asks for (to warn about missing
 *  faces). */
export function familyName(family: string): string {
  return featureFamilyParts(primaryFontFamily(family).trim().replace(/^['"]|['"]$/g, '')).family;
}

/** Whether a configuration sets any style's figures (#1237): a family of
 *  it is a feature family. */
export function setsFigures(config: ResolvedConfig): boolean {
  return /"[^"]*@(?:onum|lnum|pnum|tnum)(?:\+(?:onum|lnum|pnum|tnum))*"/.test(JSON.stringify(config));
}

export const ALIGN: Record<string, string> = { left: 'start', right: 'end', center: 'center', justify: 'justify' };

/** Beside every `letter-spacing` (#703): letter-spacing never changes the
 *  glyphs. A reading system turns the common ligatures off where the
 *  letter-spacing is not zero; asked for as features they stay, as in the
 *  print layout, the fixed-layout pages and the PDF. */
export const TRACKED_LIGATURES = "font-feature-settings: 'liga' 1, 'clig' 1";

/** A rule from its declarations (the falsy ones left out); none when it
 *  declares nothing. */
export function rule(selector: string, decls: (string | false | undefined | null)[]): CssRule | '' {
  const body = decls.filter((d): d is string => typeof d === 'string' && d.length > 0);
  return body.length > 0 ? { selector, decls: body } : '';
}

export function ruleText(r: CssRule): string {
  return `${r.selector} {\n${r.decls.map((d) => `  ${d};`).join('\n')}\n}\n`;
}
