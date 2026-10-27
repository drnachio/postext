// The plain text of a block's laid-out lines: how a wrapped line joins the
// next, inserted characters left out, and a title's text without its breaks
// (#1278: split out of placeholders.ts).
import { flattenTitleBreaks, joinsWide, charBefore, charFrom, CHIP_PLACEHOLDER, withoutChips, plainTitleBreak, plainTitleBreaks, replaceTitleBreaks, BREAK_PLACEHOLDER } from '../../../parse/inlineFormatting.js';
import { collapseTitleSpaces } from '../../../measure/spaces.js';
import type { VDTBlock, VDTLine } from '../../../vdt.js';

/** The fields of a laid-out line that say how it joins the next one. */
export interface JoinedLine {
  hyphenated?: boolean;
  hardHyphen?: boolean;
  plainStart?: number;
  plainEnd?: number;
  /** The line opens with the hyphen repeated from the line before
   *  (`bodyText.repeatHyphen`), which is not part of the text. */
  repeatedHyphen?: boolean;
}

/** How a wrapped line joins the line after it when a block's lines are
 *  read back as one text (a running head's `{chapterTitle}`, a design's
 *  `{titleText}`). Returns how many characters to drop from the end of
 *  the line (the hyphen a break added) and what goes between the two
 *  lines.
 *
 *  A hyphenated line continues its word: the break's own hyphen (a
 *  dictionary syllable, an author's soft hyphen, a word cut for being
 *  wider than the line) is dropped, and the hyphen of a line broken after
 *  the text's own (`hardHyphen`, "well-" | "known") stays. A line that
 *  ends where the next one starts in the block's plain text (`plainEnd` =
 *  `plainStart`) broke inside a run without adding anything (after a hard
 *  hyphen or a dash, or in a word cut for width, when the first-fit
 *  breaker of a heading without formatting set it) and joins with nothing.
 *  A hyphenated line that ends without a hyphen, where the next line
 *  starts one character further on in the plain text, parted a group
 *  glued by a no-break space that was wider than the line ("Cap\u00edtulo" |
 *  "XVIII"): the break took the no-break space, which comes back as
 *  U+00A0, so the group stays glued. Every other break took a space,
 *  which comes back once, and so does a space the line itself ends with
 *  (`spaceAtEnd`: the caller trimmed it from `text`); the last line is
 *  followed by nothing. */
export function lineJoin(
  text: string,
  line: JoinedLine,
  next: JoinedLine | undefined,
  spaceAtEnd = false,
): { drop: number; separator: '' | ' ' | '\u00A0' } {
  if (line.hardHyphen) return { drop: 0, separator: '' };
  if (line.hyphenated) {
    if (/[-\u2010\u2011]$/.test(text)) return { drop: 1, separator: '' };
    const tookOne = next?.plainStart !== undefined && line.plainEnd !== undefined && next.plainStart > line.plainEnd;
    return { drop: 0, separator: tookOne ? '\u00A0' : '' };
  }
  if (next === undefined) return { drop: 0, separator: '' };
  if (!spaceAtEnd && line.plainEnd !== undefined && next.plainStart === line.plainEnd) return { drop: 0, separator: '' };
  return { drop: 0, separator: ' ' };
}

/** Breaking whitespace at either end of a line: a no-break space a line
 *  opens or ends on belongs to the text (the glue of a group the line
 *  parted), so it stays. */
const BREAKING_EDGES_RE = /^[^\S\u00A0\u2007\u202F\uFEFF]+|[^\S\u00A0\u2007\u202F\uFEFF]+$/g;

/** How {@link blockLinesText} reads a block. */
export interface BlockLinesTextOptions {
  /** A heading's forced breaks (`\\`, `VDTBlock.titleBreaks`) as plain
   *  text reads them (`plainTitleBreak`): nothing where a Chinese
   *  character meets a digit or Latin text, where the lines hold the space
   *  the page sets as the Han–Latin space. The PDF bookmarks and document
   *  title read a heading this way (#221). */
  plainTitleBreaks?: boolean;
}

/** A block's lines read back as the text they were broken from, the way
 *  the paragraph read before wrapping (see {@link lineJoin}): wrapped lines
 *  keep their trailing space token and hyphenated lines end with the break
 *  mark. A line of Chinese broken between two characters joins the next
 *  with nothing, and one broken at an ideographic space (U+3000, the space
 *  of a couplet title or of `numberSeparator: '　'`) gets it back, whichever
 *  of the two lines holds it. Whitespace inside the lines is kept as it is;
 *  the ends are trimmed. `\u2028` is the title-break placeholder. The
 *  running heads read a heading this way, and so do the PDF bookmarks and
 *  document title (with `options.plainTitleBreaks`). */
export function blockLinesText(block: VDTBlock, options?: BlockLinesTextOptions): string {
  const plain = options?.plainTitleBreaks === true && (block.titleBreaks?.length ?? 0) > 0;
  const lines = block.lines.map((line) => {
    // The hyphen repeated from the line before (`repeatHyphen`) is not text.
    const cut = line.repeatedHyphen && line.text.startsWith('-') ? 1 : 0;
    const own = line.text.slice(cut);
    const raw = flattenTitleBreaks(own);
    const t = raw.replace(BREAKING_EDGES_RE, '');
    // Which characters of `t` the layout inserted (`VDTLineSegment.inserted`:
    // the 《》 of a book title), for `plainBreaksOf`.
    const lead = plain ? BREAKING_HEAD_RE.exec(raw)![0].length : 0;
    const ins = plain ? insertedMask(line, cut)?.slice(lead, lead + t.length) : undefined;
    return { raw, t, ins };
  });
  let text = '';
  const inserted: boolean[] = [];
  block.lines.forEach((line, i) => {
    const { raw, t, ins } = lines[i]!;
    if (t.length === 0) return;
    const next = block.lines[i + 1];
    const { drop, separator } = lineJoin(t, line, next, /[ \t]$/.test(raw));
    let sep: string = separator;
    if (next !== undefined && !line.hyphenated && !line.hardHyphen) {
      const after = lines[i + 1]!;
      const broken = BREAKING_TAIL_RE.exec(raw)![0] + BREAKING_HEAD_RE.exec(after.raw)![0];
      if (broken.includes('\u3000')) sep = '\u3000';
      // Two Chinese characters with no space between them on either line
      // were never apart, whatever the offsets say.
      else if (broken.length === 0 && joinsWide(charBefore(t, t.length), charFrom(after.t, 0))) sep = '';
    }
    const piece = t.slice(0, t.length - drop) + (next === undefined ? '' : sep);
    text += piece;
    if (plain) for (let k = 0; k < piece.length; k++) inserted.push(ins?.[k] === true);
  });
  const read = plain ? plainBreaksOf(text, block, inserted) : text;
  // A heading's chips (#1100) are boxes of the page, not words of its
  // title: the running heads and the bookmarks read the title without them.
  return (block.type === 'heading' && read.includes(CHIP_PLACEHOLDER) ? withoutChips(read) : read).trim();
}


/** For each UTF-16 unit of `line.text` from `from` on, whether the layout
 *  inserted it (a segment with `inserted`); undefined when the segments do
 *  not spell the line's text. */
function insertedMask(line: VDTLine, from: number): boolean[] | undefined {
  const segs = line.segments;
  if (!segs || !segs.some((s) => s.inserted)) return undefined;
  const mask: boolean[] = [];
  let spelled = '';
  for (const s of segs) {
    spelled += s.text;
    for (let k = 0; k < s.text.length; k++) mask.push(s.inserted === true);
  }
  return spelled === line.text ? mask.slice(from) : undefined;
}

/** `text`, a heading's lines read back, with each forced break the lines
 *  set as a space read as plain text (see `plainTitleBreak`). The title
 *  ends the text, so a break's index in the title (`titleBreaks`, the
 *  number prefix excluded) counts back from the end of `text`, past the
 *  characters the layout inserted (`inserted`, one flag per unit of
 *  `text`: the 《》 of a book title are no characters of the title); a
 *  break whose place does not hold a space is left alone. */
function plainBreaksOf(text: string, block: VDTBlock, inserted: readonly boolean[]): string {
  const breaks = block.titleBreaks;
  const length = block.titleLength;
  if (!breaks || breaks.length === 0 || length === undefined) return text;
  // Where each character of the title's own text sits in `text`.
  const own: number[] = [];
  for (let k = 0; k < text.length; k++) if (!inserted[k]) own.push(k);
  if (own.length < length) return text;
  const start = own.length - length;
  let out = text;
  // The last break first, so the places of the others hold.
  for (const i of [...breaks].sort((a, b) => b - a)) {
    const at = own[start + i]!;
    if (out[at] !== ' ') continue;
    if (plainTitleBreak(charBefore(out, at), charFrom(out, at + 1)) === '') out = out.slice(0, at) + out.slice(at + 1);
  }
  return out;
}

/** A title written with forced breaks (`\\`, as in a part's `title`
 *  attribute) as plain text reads it: each break as `plainTitleBreak` reads
 *  it, nothing where a Chinese character meets a digit or Latin text, the
 *  ideographic space between two Chinese characters, a space between Latin
 *  words. The PDF bookmarks of the parts read their titles this way, as
 *  those of the headings read theirs (#221). */
export function plainTitleText(title: string): string {
  return plainTitleBreaks(replaceTitleBreaks(title, BREAK_PLACEHOLDER));
}

/** The breaking whitespace a line ends / starts with. */
const BREAKING_TAIL_RE = /[^\S\u00A0\u2007\u202F\uFEFF]*$/;
const BREAKING_HEAD_RE = /^[^\S\u00A0\u2007\u202F\uFEFF]*/;

export function plainTextOfBlock(block: VDTBlock): string {
  // No-break spaces stay, so the running head never breaks at one, and so
  // does the ideographic space of a Chinese title.
  const text = collapseTitleSpaces(blockLinesText(block)).trim();
  // Strip any numbering prefix that was prepended during build, as the
  // trimmed lines read it: a template that opens with ideographic spaces
  // (`'　　{2:一}、'`, a GB/T 9704 head's two-cell indent) lost them to the
  // trim.
  const prefix = block.numberPrefix?.trim();
  if (prefix && text.startsWith(prefix)) return text.slice(prefix.length).trimStart();
  return text;
}
