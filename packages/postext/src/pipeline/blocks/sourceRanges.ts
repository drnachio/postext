// Per-line source ranges: where each line of a measured block stands in
// the block's plain text and in the markdown source (moved out of
// `buildHelpers.ts`, which re-exports it).
import type { ContentBlock } from '../../parse/index.js';
import type { MeasuredBlock } from '../../measure/index.js';
import { writtenText } from '../../measure/rtl/kashida.js';
import { NO_BREAK_SPACES } from '../../measure/spaces.js';
import { GEMINATE_DOT, endsInsideGeminate } from '../../measure/geminate.js';

/** An author's soft hyphen or zero-width space: plain text (and source) a
 *  line may leave unprinted. `\s` matches neither. */
function isUnprinted(c: string | undefined): boolean {
  return c === '\u00AD' || c === '\u200B';
}

const SOFT_HYPHEN_CODE = 0xad;
const ZERO_WIDTH_SPACE_CODE = 0x200b;
const HYPHEN_CODE = 0x2d;

/** What a reference counts as in a line's units (see `stampSourceRanges`):
 *  a noncharacter, which no plain text holds. */
const REF_UNIT = '\uFFFF';

/** ASCII punctuation: what a backslash may escape (CommonMark). */
const ESCAPABLE_RE = /[!-/:-@[-`{-~]/;

/**
 * Stamps `plainStart` / `plainEnd` / `sourceStart` / `sourceEnd` on every line
 * of `measured`, accounting for any heading-number prefix that prepends chars
 * with no source. `source` is the markdown the block's offsets index (the
 * body, before `bodyOffset`): with it, a line that opens with a backslash
 * escape (`\$40`) starts at the backslash, which the plain text does not
 * print (EF-178). A block's `sourceMap` maps the escaped character itself.
 */
export function stampSourceRanges(
  measured: MeasuredBlock,
  rawBlock: ContentBlock,
  contentBlock: ContentBlock,
  bodyOffset: number,
  source?: string,
): { prefixLen: number; absoluteSourceMap: number[] } {
  const blockSrcStart = rawBlock.sourceStart + bodyOffset;
  const blockSrcEnd = rawBlock.sourceEnd + bodyOffset;
  const srcMap = rawBlock.sourceMap;
  const prefixLen = contentBlock.text.length - rawBlock.text.length;

  const plainToSrc = (p: number): number => {
    const idx = p - prefixLen;
    if (idx <= 0) return blockSrcStart;
    if (idx >= srcMap.length) return blockSrcEnd;
    return srcMap[idx]! + bodyOffset;
  };
  /** Where plain character `p` starts in the source: at the backslash of an
   *  escape (`\$`), which the plain text skips, unless the character before
   *  it is written with that backslash. Line boundaries fall there, so a
   *  line that opens with an escape covers its backslash and the line before
   *  it stops short of it. */
  const plainToSrcStart = (p: number): number => {
    const idx = p - prefixLen;
    if (source === undefined || idx <= 0 || idx >= srcMap.length) return plainToSrc(p);
    const at = srcMap[idx]!;
    const escaped = at > 0 && source[at - 1] === '\\' && srcMap[idx - 1]! < at - 1 && ESCAPABLE_RE.test(source[at] ?? '');
    return (escaped ? at - 1 : at) + bodyOffset;
  };

  // The block's plain text (heading prefix included): what the lines' plain
  // offsets index, and what tells a hyphen or a separator the break added
  // from one the source carries.
  const plain = contentBlock.text;
  let cumPlain = 0;
  const lastLineIdx = measured.lines.length - 1;
  // The line's characters as plain text counts them, one string a line
  // (#784: an array of one-character strings per line was a tenth of a
  // book's layout). An inline `:ref` segment renders a multi-char label but
  // occupies a single placeholder char in the block's plain text /
  // `sourceMap` (mirrors the math placeholder): it counts as `REF_UNIT`,
  // which matches no plain character; the later runs of a reference painted
  // in pieces (small capitals) count 0.
  const unitsOf = (line: MeasuredBlock['lines'][number]): string => {
    if (!line.segments || line.segments.length === 0) return line.text;
    let units = '';
    for (const seg of line.segments) {
      if (seg.refContinues || seg.inserted || seg.leader) continue;
      units += seg.refResourceId !== undefined ? REF_UNIT : writtenText(seg);
    }
    return units;
  };
  /** The first of {@link unitsOf}, without the rest. */
  const firstUnitOf = (line: MeasuredBlock['lines'][number]): string | undefined => {
    if (!line.segments || line.segments.length === 0) return line.text[0];
    for (const seg of line.segments) {
      // Brackets the layout added (a book title's 《》, a warichu note's)
      // are no plain text.
      // A leader (#622) is no character either.
      if (seg.refContinues || seg.inserted || seg.leader) continue;
      if (seg.refResourceId !== undefined) return REF_UNIT;
      // Tatweels kashida justification inserted are no plain text.
      const text = writtenText(seg);
      if (text.length > 0) return text[0];
    }
    return undefined;
  };
  for (let li = 0; li < measured.lines.length; li++) {
    const line = measured.lines[li]!;
    const units = unitsOf(line);
    const nextFirst = li < lastLineIdx ? firstUnitOf(measured.lines[li + 1]!) : undefined;
    // Walk the plain text along the line. An author's soft hyphen or
    // zero-width space inside the line is plain text the line may not print
    // (the plain path drops every U+200B); a hyphenated line's final hyphen
    // is the break's own (a dictionary syllable, a word cut for being wider
    // than the line) unless the source carries it there (a hard hyphen), and
    // only then plain text.
    let i = cumPlain;
    // The hyphen a line opens with when it repeats the one of the compound
    // the line before broke at (`repeatHyphen`) is not in the plain text.
    // By character code (#1631): this loop reads every character of every
    // line of every pass, and a one-character string and two calls for each
    // were 5 % of a long book's layout. Past the end of `plain` the code is
    // NaN, which equals nothing, as `undefined` did.
    const lastUnit = units.length - 1;
    const breakHyphen = line.hyphenated === true;
    for (let u = line.repeatedHyphen && units[0] === '-' ? 1 : 0; u <= lastUnit; u++) {
      const c = units.charCodeAt(u);
      let p = plain.charCodeAt(i);
      // A zero-width character the line holds and the plain text does not
      // (a break opportunity a measurer inserted) is no source character.
      if ((c === SOFT_HYPHEN_CODE || c === ZERO_WIDTH_SPACE_CODE) && c !== p) continue;
      while ((p === SOFT_HYPHEN_CODE || p === ZERO_WIDTH_SPACE_CODE) && c !== p) p = plain.charCodeAt(++i);
      if (u === lastUnit && breakHyphen && c === HYPHEN_CODE && p !== HYPHEN_CODE) {
        // The hyphen of a break inside an `l·l` stands for the middle dot
        // the line drops: the dot is this line's.
        if (plain[i] === GEMINATE_DOT && endsInsideGeminate(plain.slice(i - 1, i + 1))) i++;
        break;
      }
      i++;
    }
    line.plainStart = cumPlain;
    line.plainEnd = i;
    // Advance past the separator the break consumed: the space (or an
    // author's soft hyphen or zero-width space) right after the line in the
    // plain text. A break that consumed nothing — at a syllable or a hard
    // hyphen, between two ideographs, inside a word cut for being wider than
    // the line — skips nothing, and neither does the last line. Nor does a
    // no-break space the next line opens on: two runs glued by one (an
    // italic word and the number after it) part where they meet when the
    // group is wider than the line, and the second line keeps the space.
    const after = plain[line.plainEnd];
    const opensNext = after !== undefined && NO_BREAK_SPACES.includes(after) && nextFirst === after;
    // The ideographic space (U+3000) is a character of CJK text: a line
    // that ends before one leaves it to the next.
    // A line that ends inside a reference label (#702) consumed a space of
    // the label, which the plain text does not hold: the next line opens
    // with a later piece of the reference, and nothing is skipped.
    const insideLabel = li !== lastLineIdx && measured.lines[li + 1]!.segments?.find((s) => !s.inserted && !s.leader)?.refContinues === true;
    const skipSeparator = li !== lastLineIdx && after !== undefined && ((/\s/.test(after) && after !== '\u3000') || isUnprinted(after)) && !opensNext && !insideLabel ? 1 : 0;
    cumPlain = line.plainEnd + skipSeparator;
    line.sourceStart = plainToSrcStart(line.plainStart);
    line.sourceEnd = plainToSrcStart(line.plainEnd);
  }

  const absoluteSourceMap = srcMap.map((o) => o + bodyOffset);
  return { prefixLen, absoluteSourceMap };
}
