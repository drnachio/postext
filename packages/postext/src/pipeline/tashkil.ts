/**
 * Arabic vowel marks taken out of the text (`bodyText.tashkil`, #376): an
 * unvocalised edition set from a vocalised source.
 *
 * The marks leave the parsed blocks before anything reads them, so the
 * layout, the contents and the running heads see one text: each block's
 * `text`, its spans and its source map lose the same characters. The
 * source map keeps every character left where it was in the source, so a
 * line still maps back to the words it sets (a mark between two letters is
 * simply not mapped to); the source itself is never touched.
 */

import type { ContentBlock, InlineLink, InlineSpan } from '../parse';
import type { TashkilMode } from '../types';

/** The marks `'strip'` takes out: the ḥarakāt and tanwīn U+064B–U+0652,
 *  the other vowel signs U+0656–U+065F, the superscript (dagger) alef
 *  U+0670, the Qurʾānic annotation marks U+06D6–U+06ED and the extended
 *  ones U+08CA–U+08FF (their letters and symbols left out). Hamza and
 *  madda written as marks (U+0653–U+0655) are kept: آ أ إ are letters,
 *  however they are encoded. So are the honorific signs U+0610–U+061A. */
const STRIP = /[ً-ْٖ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ࣊-ࣣ࣡-ࣿ]/;
/** The same, the shadda (U+0651) kept: `'strip-vowels'`. */
const STRIP_VOWELS = /[ً-ِْٖ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ࣊-ࣣ࣡-ࣿ]/;

/** The marks a mode takes out, as a test of one character. */
function stripper(mode: Exclude<TashkilMode, 'keep'>): RegExp {
  return mode === 'strip' ? STRIP : STRIP_VOWELS;
}

/** Which UTF-16 units of `text` go: the marks, and a space a lone mark
 *  leaves doubled (a Qurʾānic pause sign set between two words, `آمَنَ ۚ
 *  قال`, would leave two spaces where the text has one) or at the start.
 *  `undefined` when nothing goes. */
function removalMask(text: string, re: RegExp): boolean[] | undefined {
  let mask: boolean[] | undefined;
  /** Whether the last unit kept is white space (or nothing is kept yet). */
  let afterSpace = true;
  /** Whether a unit was taken out since the last one kept. */
  let gap = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    let drop = re.test(ch);
    if (!drop && gap && afterSpace && /\s/.test(ch)) drop = true;
    if (drop) {
      (mask ??= new Array<boolean>(text.length).fill(false))[i] = true;
      gap = true;
      continue;
    }
    afterSpace = /\s/.test(ch);
    gap = false;
  }
  return mask;
}

/** `text` with the units of `mask` taken out. */
function applyMask(text: string, mask: readonly boolean[] | undefined, from = 0): string {
  if (!mask) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) if (!mask[from + i]) out += text[i];
  return out;
}

/** `text` without the marks `mode` takes out. */
export function stripTashkil(text: string, mode: Exclude<TashkilMode, 'keep'>): string {
  return applyMask(text, removalMask(text, stripper(mode)));
}

/** For each UTF-16 index of a piece of `mask` (`from`, `length`), its
 *  index once the units go (`length` maps to the new length). */
function indexMap(mask: readonly boolean[], from: number, length: number): number[] {
  let removed = 0;
  const map = new Array<number>(length + 1);
  for (let i = 0; i < length; i++) {
    map[i] = i - removed;
    if (mask[from + i]) removed++;
  }
  map[length] = length - removed;
  return map;
}

/** A span with the units of `mask` from `from` on taken out, its link
 *  ranges moved with its text. */
function stripSpan(span: InlineSpan, mask: readonly boolean[] | undefined, from: number): InlineSpan {
  if (!mask) return span;
  let any = false;
  for (let i = 0; i < span.text.length; i++) if (mask[from + i]) { any = true; break; }
  if (!any) return span;
  const next: InlineSpan = { ...span, text: applyMask(span.text, mask, from) };
  if (span.links) {
    const map = indexMap(mask, from, span.text.length);
    const links: InlineLink[] = span.links.map((l) => ({ ...l, start: map[l.start]!, end: map[l.end]! })).filter((l) => l.end > l.start);
    if (links.length > 0) next.links = links;
    else delete next.links;
  }
  return next;
}

/** A block without the marks (the same block when it holds none): its
 *  text, source map, spans and title breaks. A formula's TeX is left as
 *  it is. */
export function stripBlockTashkil(block: ContentBlock, mode: Exclude<TashkilMode, 'keep'>): ContentBlock {
  if (block.type === 'mathDisplay' || block.rawBody !== undefined) return block;
  const re = stripper(mode);
  if (!re.test(block.text) && !block.spans.some((s) => re.test(s.text))) return block;
  const mask = removalMask(block.text, re);
  // The spans spell the block's text: they lose the same units. Otherwise
  // (a block assembled by hand) each span is read on its own.
  const spelled = block.spans.map((s) => s.text).join('') === block.text;
  let at = 0;
  const spans = block.spans.map((s) => {
    const from = at;
    at += s.text.length;
    if (s.math || s.mathRender) return s;
    return spelled ? stripSpan(s, mask, from) : stripSpan(s, removalMask(s.text, re), 0);
  });
  const next: ContentBlock = { ...block, spans };
  if (mask) {
    next.text = applyMask(block.text, mask);
    next.sourceMap = block.sourceMap.filter((_, i) => !mask[i]);
    if (block.titleBreaks) {
      const map = indexMap(mask, 0, block.text.length);
      next.titleBreaks = block.titleBreaks.map((b) => map[b] ?? b);
    }
  }
  return next;
}

/** Memo of {@link tashkilFor}: per parsed array, per mode. */
const memo = new WeakMap<ContentBlock[], Map<string, ContentBlock[]>>();

/**
 * The blocks as `bodyText.tashkil` sets them: `blocks` itself when the
 * marks are kept or no block holds one, else every block without them.
 * Memoised on the (memoised) parsed array, as the outline and the layout
 * both ask for it.
 */
export function tashkilFor(blocks: ContentBlock[], mode: TashkilMode | undefined): ContentBlock[] {
  if (mode !== 'strip' && mode !== 'strip-vowels') return blocks;
  let byMode = memo.get(blocks);
  if (!byMode) memo.set(blocks, (byMode = new Map()));
  let out = byMode.get(mode);
  if (!out) {
    let changed = false;
    const next = blocks.map((b) => {
      const s = stripBlockTashkil(b, mode);
      if (s !== b) changed = true;
      return s;
    });
    out = changed ? next : blocks;
    byMode.set(mode, out);
  }
  return out;
}
