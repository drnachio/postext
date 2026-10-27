/**
 * The CJK line composer: Chinese (and Japanese, Korean) paragraphs, on both
 * the plain and the formatted path, broken between characters under the
 * clreq prohibitions of the document's `cjk.lineBreak` and, when justified,
 * spread between characters.
 *
 * Linear in the paragraph: every unit (one grapheme, a Western run a line
 * never breaks inside, a 2-em dash or ellipsis, an atomic box) is measured
 * once — the width cache holds single characters, not prefixes — and the
 * breaker walks the units once with a running width. A line that would
 * start with a prohibited mark gives up characters to the next line
 * (push-out), back to the last break the rules allow.
 *
 * Justification (clreq §6.2.2.4): a justified line that is not its
 * paragraph's last is stretched to the measure — word spaces first, up to
 * ½ em each, then every gap between characters equally, never inside a
 * Western run (a word, a number with its signs), a 2-em dash or ellipsis,
 * and never next to a connector or a solidus. The spread is carried as
 * segment `tracking` (px after each grapheme, in the segment's width); a
 * Western run or a dash pair that a gap follows gives its last grapheme a
 * segment of its own. A line that needs more than the cap (½ em, or
 * `bodyText.maxJustifyTracking` when set) is set with the cap and flagged
 * `cjkLoose` and `ragged`; a line with no CJK character on it (the head of
 * a long web address) is set `ragged` without the flag. Japanese
 * full-width text (`isJlreqSpacing`) follows JLReq §3.8 instead where it
 * differs: a line takes one more character by giving up blank in Table 3's
 * order (`fitLine`), and is never spread inside a bracket or next to
 * 、。・？！, a hyphen or U+3000 (`gapStretches`, JLReq §3.1.11).
 *
 * Segments: a Western run keeps one of its own, and single characters
 * share one only when they have one style, link and spacing and advance
 * alike, so a caret spread evenly over a segment lands on its characters
 * and a Markdown link covers only its own.
 */



export { isCjkParagraph, composesAsCjk, composesDashRow, spanMarks } from './cjkCompose/units.js';
export { composeCjkParagraph, cjkWordBreaks } from './cjkCompose/paragraph.js';
export type { CjkWordBreaks } from './cjkCompose/paragraph.js';
