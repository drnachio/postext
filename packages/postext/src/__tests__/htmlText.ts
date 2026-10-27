// Reading rendered HTML in tests without regular expressions that scan the
// same text twice (CodeQL js/polynomial-redos, js/incomplete-multi-character-
// sanitization, #1285/#1286). Each helper walks the markup once with indexOf.

/**
 * The text of rendered HTML: each `<` up to the next `>` dropped (or put
 * as `sep`), in one scan. A `<` with no `>` after it is kept, as text.
 */
export function textOfHtml(html: string, sep = ''): string {
  let out = '';
  let from = 0;
  for (;;) {
    const lt = html.indexOf('<', from);
    if (lt < 0) break;
    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) break;
    out += html.slice(from, lt) + sep;
    from = gt + 1;
  }
  return out + html.slice(from);
}

/**
 * Each start tag that begins with `prefix` (e.g. `<a `), up to its `>`, with
 * where it starts and where its `>` ends. With `followedBy`, only the tags
 * the markup goes on from with that text right after the `>`.
 */
export function tagsAt(html: string, prefix: string, followedBy = ''): { tag: string; start: number; end: number }[] {
  const tags: { tag: string; start: number; end: number }[] = [];
  let at = html.indexOf(prefix);
  while (at >= 0) {
    const gt = html.indexOf('>', at + prefix.length);
    if (gt < 0) break;
    if (html.startsWith(followedBy, gt + 1)) tags.push({ tag: html.slice(at, gt + 1), start: at, end: gt + 1 });
    at = html.indexOf(prefix, gt + 1);
  }
  return tags;
}

/** Each start tag that begins with `prefix` (e.g. `<a `), up to its `>`. */
export function startTags(html: string, prefix: string, followedBy = ''): string[] {
  return tagsAt(html, prefix, followedBy).map((t) => t.tag);
}

/**
 * The markup with every tag that begins with one of `prefixes` (e.g.
 * `<ruby`, `</ruby`) dropped, up to its `>`: what `/<\/?ruby[^>]*>/g`
 * takes out.
 */
export function dropTags(html: string, prefixes: string[]): string {
  let out = '';
  let from = 0;
  let lt = html.indexOf('<');
  while (lt >= 0) {
    const gt = prefixes.some((p) => html.startsWith(p, lt)) ? html.indexOf('>', lt + 1) : -1;
    if (gt >= 0) {
      out += html.slice(from, lt);
      from = gt + 1;
      lt = html.indexOf('<', from);
    } else lt = html.indexOf('<', lt + 1);
  }
  return out + html.slice(from);
}

/**
 * Each element whose start tag begins with `prefix` and holds `has` (when
 * given): its start tag, what stands between that tag and the first `end`
 * after it, and the whole of it from the start tag to `end`.
 */
export function elementsOf(html: string, prefix: string, end: string, has = ''): { tag: string; inner: string; outer: string }[] {
  const found: { tag: string; inner: string; outer: string }[] = [];
  let at = html.indexOf(prefix);
  while (at >= 0) {
    const gt = html.indexOf('>', at + prefix.length);
    if (gt < 0) break;
    const tag = html.slice(at, gt + 1);
    if (!tag.includes(has)) {
      at = html.indexOf(prefix, gt + 1);
      continue;
    }
    const close = html.indexOf(end, gt + 1);
    if (close < 0) break;
    found.push({ tag, inner: html.slice(gt + 1, close), outer: html.slice(at, close + end.length) });
    at = html.indexOf(prefix, close + end.length);
  }
  return found;
}

/**
 * For each `marker` in the markup, the run of text before it back to the
 * nearest `"` (the attribute value it closes, when the marker starts with
 * `"`), and where that run starts. `left:([\d.]+)px;[^"]*">Title<` reads as
 * the first run before `">Title<` that holds `left:…px;`.
 */
export function attrRunsBefore(html: string, marker: string): { run: string; start: number }[] {
  const runs: { run: string; start: number }[] = [];
  let at = html.indexOf(marker);
  while (at >= 0) {
    const start = html.lastIndexOf('"', at - 1) + 1;
    runs.push({ run: html.slice(start, at), start });
    at = html.indexOf(marker, at + marker.length);
  }
  return runs;
}

/** The runs of `attrRunsBefore`, as text. */
export function attrsBefore(html: string, marker: string): string[] {
  return attrRunsBefore(html, marker).map((r) => r.run);
}

/**
 * The first number set in px in a CSS font or style (`(\d*\.?\d+)px`): the
 * run of digits, with at most one point, that ends in a digit right before
 * a `px`.
 */
export function pxOf(css: string): string | undefined {
  const digit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
  for (let at = css.indexOf('px'); at >= 0; at = css.indexOf('px', at + 2)) {
    if (!digit(css[at - 1])) continue;
    let start = at;
    let point = false;
    while (start > 0) {
      const c = css[start - 1]!;
      if (digit(c)) start--;
      else if (c === '.' && !point) { point = true; start--; }
      else break;
    }
    return css.slice(start, at);
  }
  return undefined;
}

/**
 * The `left:…px;` of the first style before a `marker` (`">Title<`) that
 * sets one: what `left:([\d.]+)px;[^"]*">Title<` captures.
 */
export function leftBefore(html: string, marker: string): string | undefined {
  for (const style of attrsBefore(html, marker)) {
    const left = /left:([\d.]+)px;/.exec(style);
    if (left) return left[1];
  }
  return undefined;
}
