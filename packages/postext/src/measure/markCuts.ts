/**
 * Where painted text is cut so that the browser sets it as it was
 * measured. Chrome sets the first of two CJK marks that meet half width
 * when it measures or paints them in one run (`cjkMarkCuts`); text the
 * layout measured mark by mark must be painted mark by mark, and text it
 * measured whole (the browser's trimming included) must be painted whole.
 * Which one it was depends on how the line was set, so the renderers pick
 * the rule the measurer followed ({@link MarkCutRule}).
 */

import { cjkMarkCuts, isCjkGrapheme, isTrimmableMark } from './cjkClasses';
import { hasCJK } from './cjk';
import { isBreakingSpace } from './spaces';

/**
 * How a string was measured, and so where it is cut when painted:
 * - `'text'`: whole, by `measureTextWidth` (design text, list markers,
 *   running heads): cut where it cuts, the marks Latin text shares with
 *   Chinese (“ ” ‘ ’ ·) counted when the string holds CJK text.
 * - `'words'`: word by word, as the word-by-word breakers measure a line
 *   (Knuth–Plass, the first-fit breaker): each word between breaking
 *   spaces as `'text'`, so `“end.”“Yes”` in a line that also holds 楼
 *   keeps the browser's trimming, as when it was measured.
 * - `'composed'`: character by character, as the CJK composer measures
 *   (`VDTLine.cjkComposed`): every two marks that meet where either is a
 *   CJK character, the shared marks included, whether or not the line
 *   holds a Han character (`hungry.”“Stay`). Two marks inside a Western
 *   run, which it measured whole, stay together.
 */
export type MarkCutRule = 'text' | 'words' | 'composed';

/** The offsets (UTF-16) at which `text` is painted apart under `rule`;
 *  empty when it is painted whole. */
export function markCuts(text: string, rule: MarkCutRule): number[] {
  if (rule === 'text') return cjkMarkCuts(text, hasCJK(text));
  if (rule === 'composed') return composedCuts(text);
  let cuts: number[] | undefined;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && !isBreakingSpace(text[i])) continue;
    if (i > start + 1) {
      const word = text.slice(start, i);
      for (const at of cjkMarkCuts(word, hasCJK(word))) (cuts ??= []).push(start + at);
    }
    start = i + 1;
  }
  return cuts ?? [];
}

function composedCuts(text: string): number[] {
  let cuts: number[] | undefined;
  let prevMark = false;
  let prevCjk = false;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    const mark = isTrimmableMark(cp, true);
    const cjk = mark && isCjkGrapheme(String.fromCodePoint(cp));
    if (mark && prevMark && (cjk || prevCjk)) (cuts ??= []).push(i);
    prevMark = mark;
    prevCjk = cjk;
    if (cp > 0xFFFF) i++;
  }
  return cuts ?? [];
}

/** `text` cut at {@link markCuts}: one piece when there is no cut. */
export function markPieces(text: string, rule: MarkCutRule): string[] {
  const cuts = markCuts(text, rule);
  if (cuts.length === 0) return [text];
  const out: string[] = [];
  let from = 0;
  for (const at of cuts) {
    out.push(text.slice(from, at));
    from = at;
  }
  out.push(text.slice(from));
  return out;
}

/** The rule a line of body text, a caption or a cell was measured with:
 *  character by character on a line of the CJK composer, word by word on
 *  any other. */
export function lineMarkCuts(line: { cjkComposed?: boolean }): MarkCutRule {
  return line.cjkComposed ? 'composed' : 'words';
}
