// Reading the markup a test renders without a regular expression that
// strips tags piecemeal (CodeQL js/incomplete-multi-character-sanitization).

/**
 * The text of XHTML markup, in one scan: each `<` up to the next `>`
 * dropped. A `<` with no `>` after it is kept, as text.
 */
export function textOfMarkup(markup: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const lt = markup.indexOf('<', from);
    if (lt < 0) break;
    const gt = markup.indexOf('>', lt + 1);
    if (gt < 0) break;
    out += markup.slice(from, lt);
    from = gt + 1;
  }
  return out + markup.slice(from);
}
