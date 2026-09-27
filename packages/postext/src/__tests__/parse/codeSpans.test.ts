import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import { collectContentWarnings } from '../../pipeline/contentWarnings';

const blockText = (md: string) => parseMarkdown(md).map((b) => b.spans.map((s) => s.text).join('')).join('\n');
const spansOf = (md: string) => parseMarkdown(md).flatMap((b) => b.spans);

// Inline code is literal (CommonMark): a directive, maths or a mark inside
// backticks prints as written — the way a guide shows the syntax.
describe('inline code spans', () => {
  it('print a :ref, a chip, a swatch and maths as written', () => {
    const md = 'Write `:ref{id="fig-1"}`, `:chip[Ctrl]{style="key"}`, `:swatch{color="#ff0000"}` or `$x^2$` in a sentence.';
    expect(blockText(md)).toBe('Write :ref{id="fig-1"}, :chip[Ctrl]{style="key"}, :swatch{color="#ff0000"} or $x^2$ in a sentence.');
    const spans = spansOf(md);
    expect(spans.some((s) => s.ref || s.chip || s.swatch || s.math)).toBe(false);
  });

  it('keep marks and links literal', () => {
    expect(blockText('Bold is `**bold**`, a link `[a](https://x.org)`, `_x_` and `^2^`.'))
      .toBe('Bold is **bold**, a link [a](https://x.org), _x_ and ^2^.');
    expect(spansOf('Bold is `**bold**`.').some((s) => s.bold)).toBe(false);
  });

  it('leave the markup outside the code alone', () => {
    const spans = spansOf('See :ref{id="fig-1"} and **bold**, then `code`.');
    expect(spans.some((s) => s.ref?.resourceId === 'fig-1')).toBe(true);
    expect(spans.some((s) => s.bold && s.text === 'bold')).toBe(true);
    expect(spans.map((s) => s.text).join('')).toContain('then code.');
  });

  it('raise no warning for a reference shown as code', () => {
    const md = 'Writing `:ref{id="…"}` in a sentence prints its number.\n';
    expect(collectContentWarnings(md, {}, [])).toEqual([]);
  });
});
