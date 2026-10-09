/**
 * Forced line breaks in body text (#620): the parser reads a backslash at
 * the end of a source line, or `\\` in a line, of a paragraph, a quotation
 * or a list item as `BREAK_PLACEHOLDER` (U+2028), where the measurers end
 * the line (`measure/hardBreaks.ts`). A configuration stored before #620
 * (`bodyText.hardLineBreaks: false`) lays such a block out as postext 1.22
 * read it, every backslash printed: the parser keeps that reading on the
 * block (`ContentBlock.literalBreaks`) and {@link literalBreaksFor} puts it
 * back.
 */

import type { ContentBlock } from '../parse';
import type { ResolvedConfig } from '../vdt';

/** Memo of {@link literalBreaksFor}, per parsed array. */
const memo = new WeakMap<ContentBlock[], ContentBlock[]>();

/**
 * The blocks as `bodyText.hardLineBreaks` reads them: `blocks` itself when
 * the breaks are on or no block has one, else every block with a forced
 * break in its 1.22 reading. Memoised on the (memoised) parsed array.
 */
export function literalBreaksFor(blocks: ContentBlock[], resolved: ResolvedConfig): ContentBlock[] {
  if (resolved.bodyText.hardLineBreaks) return blocks;
  let out = memo.get(blocks);
  if (!out) {
    let changed = false;
    const next = blocks.map((b) => {
      if (!b.literalBreaks) return b;
      changed = true;
      const { literalBreaks, ...rest } = b;
      return { ...rest, text: literalBreaks.text, spans: literalBreaks.spans, sourceMap: literalBreaks.sourceMap };
    });
    out = changed ? next : blocks;
    memo.set(blocks, out);
  }
  return out;
}
