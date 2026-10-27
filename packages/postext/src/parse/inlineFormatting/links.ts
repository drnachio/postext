// Markdown links: where a destination ends, which schemes are kept, and
// the link marks left in the text for the spans (#1276: split out of
// inlineFormatting.ts).
import { restoreEscapes, MARKUP_BOUNDARY } from './markup.js';

/** Private-use marks bracketing the text of a Markdown link while the
 *  emphasis scanners run (see {@link parseInlineFormatting}); never left in
 *  a span. Beside the chip placeholder and the small-caps marks, outside
 *  the escape range. */
export const LINK_OPEN = '\uE1A3';
export const LINK_CLOSE = '\uE1A4';

/** URL schemes a link may point at. Anything else with a scheme
 *  (`javascript:`, `data:`, `file:`…) sets its text without a link. */
const SAFE_LINK_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel', 'ftp']);

/**
 * The target of a Markdown link destination (`url`, `url "title"`, `<url>`)
 * when it is safe to follow: an `http:`, `https:`, `mailto:`, `tel:` or
 * `ftp:` URL, or a relative one (`../guide`, `#top`). Spaces inside `<…>`
 * are percent-encoded; anything else unsafe or malformed gives undefined.
 */
export function linkHref(destination: string): string | undefined {
  const d = destination.trim();
  const angled = /^<([^<>]*)>/.exec(d);
  const raw = angled ? angled[1]!.trim().replace(/ /g, '%20') : (d.split(/\s+/)[0] ?? '');
  // Backslash escapes stand for the character itself (`\_`, `\(`).
  const url = restoreEscapes(raw).replace(/\\([!-/:-@[-`{-~])/g, '$1');
  if (url.length === 0 || /[\s\u0000-\u001f\u007f]/.test(url)) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme !== undefined && !SAFE_LINK_SCHEMES.has(scheme)) return undefined;
  return url;
}

/**
 * Strip non-emphasis inline formatting (images, links, code) but keep
 * bold/italic markers. A link keeps its text between {@link LINK_OPEN} /
 * {@link LINK_CLOSE} marks, and its target joins `hrefs`, when the target
 * is safe; otherwise only the text is kept.
 */
export function stripNonEmphasisFormatting(text: string, hrefs: string[]): string {
  // An image and the backticks of inline code leave a boundary mark, so an
  // `_` right after one still opens emphasis (see MARKUP_BOUNDARY).
  const images = replaceLinkSyntax(text, true, () => MARKUP_BOUNDARY);
  const links = replaceLinkSyntax(images, false, (label, destination) => {
    const href = destination === undefined ? undefined : linkHref(destination);
    if (href === undefined) return MARKUP_BOUNDARY + label + MARKUP_BOUNDARY;
    hrefs.push(href);
    return LINK_OPEN + label + LINK_CLOSE;
  });
  return links.replace(/`(.+?)`/g, `${MARKUP_BOUNDARY}$1${MARKUP_BOUNDARY}`);   // inline code
}

/** Spaces and line ends around a link destination and its title. */
function isLinkSpace(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n';
}

/**
 * Index just past the `)` closing the link destination that starts at
 * `from` (just after `](`), read as CommonMark reads it: `<…>`, or a run of
 * non-space characters whose parentheses balance (`File:A_(b).jpg`), then
 * an optional title in `"…"`, `'…'` or `(…)` after a space. A backslash
 * escapes the character after it. -1 when no well-formed destination
 * starts there.
 */
function destinationEnd(text: string, from: number): number {
  let i = from;
  while (isLinkSpace(text[i])) i++;
  if (text[i] === '<') {
    i++;
    while (i < text.length && text[i] !== '>') {
      if (text[i] === '\n' || text[i] === '<') return -1;
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= text.length) return -1;
    i++;
  } else {
    let depth = 0;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c <= ' ' || c === '\u007f') break;
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
      i++;
    }
    if (depth !== 0) return -1;
  }
  let j = i;
  while (isLinkSpace(text[j])) j++;
  const quote = text[j];
  if (j > i && (quote === '"' || quote === "'" || quote === '(')) {
    const close = quote === '(' ? ')' : quote;
    j++;
    while (j < text.length && text[j] !== close) j += text[j] === '\\' ? 2 : 1;
    if (j >= text.length) return -1;
    j++;
    while (isLinkSpace(text[j])) j++;
  }
  return text[j] === ')' ? j + 1 : -1;
}

/**
 * Replace each Markdown link `[label](destination)` — or image
 * `![label](destination)`, with `image` — by `replace(label, destination)`.
 * The destination is read with balanced parentheses ({@link destinationEnd}).
 * One that is not well formed (an unclosed parenthesis, a space inside)
 * ends at the first `)`, as the syntax was always read, and reaches
 * `replace` as undefined: its label is set without a link. An empty `()`
 * leaves a link literal and removes an image, as before.
 */
export function replaceLinkSyntax(
  text: string,
  image: boolean,
  replace: (label: string, destination: string | undefined) => string,
): string {
  const start = image ? /!\[(.*?)\]\(/g : /\[([^\]]+)\]\(/g;
  let out = '';
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = start.exec(text)) !== null) {
    const from = m.index + m[0].length;
    let end = destinationEnd(text, from);
    let destination: string | undefined;
    if (end > from + 1) {
      destination = text.slice(from, end - 1);
    } else {
      // Images never crossed a line end (`.*?`); links did (`[^)]+`).
      const rest = text.slice(from);
      const close = image ? rest.search(/[)\n]/) : rest.indexOf(')');
      if (close < (image ? 0 : 1) || rest[close] !== ')') {
        start.lastIndex = m.index + 1;
        continue;
      }
      end = from + close + 1;
    }
    out += text.slice(pos, m.index) + replace(m[1]!, destination);
    pos = end;
    start.lastIndex = end;
  }
  return pos === 0 ? text : out + text.slice(pos);
}

/** `[start, end)` of each well-formed link or image destination in `text`
 *  (what follows `](`, up to and with its closing `)`), read as
 *  {@link replaceLinkSyntax} reads it. */
export function linkDestinationRanges(text: string): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  // Each `[…](` as `/\[[^\]]*\]\(/g` finds it, in one pass: every `[`
  // before a `]` that no `(` follows fails at that same `]`.
  let pos = 0;
  for (let open = text.indexOf('['); open >= 0; open = text.indexOf('[', pos)) {
    const close = text.indexOf(']', open + 1);
    if (close < 0) break;
    pos = close + 1;
    if (text[close + 1] !== '(') continue;
    const from = close + 2;
    const end = destinationEnd(text, from);
    pos = from;
    if (end > from + 1) {
      out.push([from, end]);
      pos = end;
    }
  }
  return out;
}
