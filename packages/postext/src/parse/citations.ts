/**
 * Citations in Pandoc's syntax (#268):
 *
 * - `[@garcia2020]`, `[@garcia2020, p. 33; @lopez2019]` — parenthetical;
 * - `[see @garcia2020, chap. 2, emphasis added]` — prefix, locator, suffix;
 * - `[-@garcia2020]` — the author left out;
 * - `@garcia2020` and `@garcia2020 [p. 33]` — narrative, in the sentence.
 *
 * An `@` glued to a letter or a digit (an e-mail address) or escaped
 * (`\@`) is text, and so is one in inline code. Each citation becomes a
 * placeholder span; the pipeline formats it, or, when the book has no
 * reference for it, prints it back as written.
 */

import type { CitationClusterInput, CitationItemInput } from '../citations/types';
import type { InlineSpan } from './types';
import { injectPlaceholderSpans } from './injectSpans';
import { parseInlineFormatting, restoreEscapes } from './inlineFormatting';

/** Stands for a citation in the plain text until it is formatted. */
export const CITATION_PLACEHOLDER = '';

/** A citation as the parser read it. */
export interface CitationMeta {
  cluster: CitationClusterInput;
  /** The citation as written, printed back when it cannot be formatted. */
  raw: string;
  /** Absolute source range. */
  sourceStart: number;
  sourceEnd: number;
}

/** Chinese, Japanese and Korean script. */
const CJK_CLASS = String.raw`\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}`;
/** A key character outside those scripts. */
const LATIN_KEY_CHAR = String.raw`(?:(?![${CJK_CLASS}])[\p{L}\p{N}_])`;
/** A citation key: a letter, a digit or `_`, then those and internal
 *  punctuation (`:.#$%&-+?<>~/`) — never punctuation at its end. A key
 *  that starts outside the CJK scripts ends where they begin, so Chinese
 *  text runs on after it without a space (`@zhou2019认为`). */
const KEY = String.raw`${LATIN_KEY_CHAR}(?:${LATIN_KEY_CHAR}|[:.#$%&\-+?<>~/](?=${LATIN_KEY_CHAR}))*|[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/](?=[\p{L}\p{N}_]))*`;
const ITEM_RE = new RegExp(String.raw`^([\s\S]*?)(?:^|(?<=[\s\[(]))(-?)@(${KEY})([\s\S]*)$`, 'u');
// Not after a letter (an e-mail address), unless the letter is Chinese:
// "周明远@zhou2019认为" names the work in the sentence.
const NARRATIVE_RE = new RegExp(String.raw`(?<!${LATIN_KEY_CHAR}|[\\@\]-])@(${KEY})`, 'gu');

/** Locator terms → CSL labels (English, Spanish and a few more). */
const LABELS: Readonly<Record<string, string>> = {
  p: 'page', pp: 'page', page: 'page', pages: 'page', pg: 'page', pág: 'page', págs: 'page', pag: 'page', s: 'page', 页: 'page', 頁: 'page',
  chap: 'chapter', chaps: 'chapter', chapter: 'chapter', chapters: 'chapter', ch: 'chapter', cap: 'chapter', caps: 'chapter', 'capítulo': 'chapter', 章: 'chapter',
  sec: 'section', secs: 'section', section: 'section', sections: 'section', '§': 'section', '§§': 'section', 'sección': 'section', 节: 'section', 節: 'section',
  fig: 'figure', figs: 'figure', figure: 'figure', figures: 'figure', 图: 'figure', 圖: 'figure',
  vol: 'volume', vols: 'volume', volume: 'volume', volumes: 'volume', 卷: 'volume',
  n: 'note', nn: 'note', note: 'note', notes: 'note', 注: 'note', 註: 'note',
  l: 'line', ll: 'line', line: 'line', lines: 'line',
  para: 'paragraph', paras: 'paragraph', paragraph: 'paragraph', '¶': 'paragraph', '¶¶': 'paragraph',
  col: 'column', cols: 'column', column: 'column',
  bk: 'book', bks: 'book', book: 'book', libro: 'book',
  pt: 'part', pts: 'part', part: 'part', parte: 'part',
  v: 'verse', vv: 'verse', verse: 'verse', verses: 'verse',
  no: 'issue', nos: 'issue', number: 'issue',
  op: 'opus', opus: 'opus',
  sv: 'sub-verbo', 's.v.': 'sub-verbo',
  art: 'section', arts: 'section',
};

/** One locator value: a number (`33`, `12a`) or a whole roman numeral. */
const LOCATOR_TOKEN = /^(?:\p{N}+(?:[.:]\p{N}+)*[a-z]?|[ivxlcdm]+|[IVXLCDM]+)(?=$|[\s,;\-–—&)])/u;
/** What joins two values of a locator: a dash, a comma, `&`, `and`, `y`.
 *  A TeX double hyphen (`1--3`) is a range dash (#647); three hyphens are
 *  not a join. */
const LOCATOR_JOIN = /^(?:\s*(?:--(?!-)|[-–—,&])\s*|\s+(?:and|y|e|et)\s+)/u;

/** The longest locator at the start of `text` ("12–14", "3, 5 and 7"):
 *  the characters it spans, or 0. */
function locatorLength(text: string): number {
  let end = 0;
  let at = 0;
  for (;;) {
    const token = LOCATOR_TOKEN.exec(text.slice(at));
    if (!token) break;
    at += token[0].length;
    end = at;
    const join = LOCATOR_JOIN.exec(text.slice(at));
    if (!join || !LOCATOR_TOKEN.test(text.slice(at + join[0].length))) break;
    at += join[0].length;
  }
  return end;
}

/** The locator and suffix of the text after an item's key (`, p. 33,
 *  emphasis added`): a known label, else a bare number meaning a page. A
 *  suffix keeps the comma it was written with, a locator or not before it
 *  (`[@k, inter alia]` → `, inter alia`: "(Brown et al., 2020, inter
 *  alia)", as Pandoc prints it); one written with no comma (`[@k inter
 *  alia]`) has none. Emphasis in it stays Markdown (`*inter alia*`): the
 *  formatter reads it (see `affixSpans`). */
export function parseLocator(rest: string): Pick<CitationItemInput, 'locator' | 'label' | 'suffix'> {
  let text = rest.trim();
  if (!text.startsWith(',')) return text ? { suffix: text } : {};
  text = text.slice(1).trim();
  let label: string | undefined;
  const word = /^([\p{L}§¶]+\.?|§§?|¶¶?)\s*/u.exec(text);
  if (word) {
    const key = word[1]!.replace(/\.$/, '').toLowerCase();
    const found = LABELS[key] ?? LABELS[word[1]!.toLowerCase()];
    if (found) {
      label = found;
      text = text.slice(word[0].length);
    }
  }
  const length = locatorLength(text);
  if (length === 0 || (!label && !/^\p{N}/u.test(text))) {
    return text ? { suffix: `, ${(label ? word![0] : '') + text}` } : {};
  }
  // `1--3` is the range BibTeX and Pandoc users write: an en dash, as
  // Pandoc's reader makes it (#647). A lone hyphen stays as written.
  const locator = text.slice(0, length).trim().replace(/--/g, '–');
  let after = text.slice(length).trim();
  if (after.startsWith(',')) after = after.slice(1).trim();
  // A suffix after the locator keeps the comma it was written with.
  return { locator, label: label ?? 'page', ...(after ? { suffix: `, ${after}` } : {}) };
}

/** A citation's prefix or suffix as spans: its Markdown emphasis read
 *  (`*e.g.*`, `**sic**`, `^a^`, `:smallcaps[…]`, #528), the spaces at its
 *  ends kept. */
export function affixSpans(text: string): InlineSpan[] {
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text.slice(lead.length))![0];
  const spans = parseInlineFormatting(text.slice(lead.length, text.length - trail.length)).filter((s) => s.text.length > 0);
  const plain = (t: string): InlineSpan => ({ text: t, bold: false, italic: false });
  return [...(lead ? [plain(lead)] : []), ...spans, ...(trail ? [plain(trail)] : [])];
}

/** A citation's prefix or suffix in the rich text a CSL processor reads in
 *  an affix (citeproc-js and Pandoc's citeproc alike): `<i>`, `<b>`,
 *  `<sup>`, `<sub>` and small capitals as `<span
 *  style="font-variant:small-caps;">`; the text as written, which the
 *  processor escapes itself. */
export function affixRichText(text: string): string {
  if (!/[*_^~:]/.test(text)) return text;
  return affixSpans(text).map((s) => {
    let out = s.text;
    if (s.smallCaps) out = `<span style="font-variant:small-caps;">${out}</span>`;
    if (s.script) out = `<${s.script}>${out}</${s.script}>`;
    if (s.italic) out = `<i>${out}</i>`;
    if (s.bold) out = `<b>${out}</b>`;
    return out;
  }).join('');
}

/** The items of a bracketed citation, or undefined when one part names no
 *  key (then the brackets are text). */
function parseItems(inner: string): CitationItemInput[] | undefined {
  const parts = inner.split(';');
  const items: CitationItemInput[] = [];
  for (const part of parts) {
    const m = ITEM_RE.exec(part.trim());
    if (!m) return undefined;
    const prefix = m[1]!.trim();
    items.push({
      id: m[3]!,
      ...(prefix ? { prefix } : {}),
      ...(m[2] === '-' ? { suppressAuthor: true } : {}),
      ...parseLocator(m[4]!),
    });
  }
  return items.length > 0 ? items : undefined;
}

/** Index of the `]` closing the `[` at `open`, on brackets not escaped. */
function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Extract the citations of a line's text, replacing each by
 * {@link CITATION_PLACEHOLDER}. Runs after the inline references (so
 * `@sec:id` is taken first) and before the emphasis passes.
 */
export function extractInlineCitations(text: string, fallbackStart: number): { cleaned: string; citations: CitationMeta[] } {
  if (!text.includes('@')) return { cleaned: text, citations: [] };
  const found: { index: number; length: number; meta: Omit<CitationMeta, 'sourceStart' | 'sourceEnd'> }[] = [];
  const taken: [number, number][] = [];
  // Bracketed citations first: `[ … @key … ]` not a link, an image, a
  // footnote or a span with attributes.
  for (let i = text.indexOf('['); i >= 0; i = text.indexOf('[', i + 1)) {
    if (i > 0 && (text[i - 1] === '\\' || text[i - 1] === '!' || text[i - 1] === ']')) continue;
    const close = closingBracket(text, i);
    if (close < 0) break;
    const inner = text.slice(i + 1, close);
    const next = text[close + 1];
    // A directive glued to the brackets (`[text]:index{…}`) keeps them; a
    // colon in the sentence after a citation is prose (`[@k]: the land`).
    const directive = next === ':' && /^:[A-Za-z]/.test(text.slice(close + 1, close + 3));
    if (!inner.includes('@') || inner.startsWith('^') || next === '(' || next === '{' || next === '[' || directive) continue;
    const items = parseItems(inner);
    if (!items) continue;
    const raw = text.slice(i, close + 1);
    found.push({ index: i, length: raw.length, meta: { cluster: { mode: 'parenthetical', items }, raw } });
    taken.push([i, close + 1]);
    i = close;
  }
  // The text of a Markdown link stays the link's.
  for (const link of text.matchAll(/(?<!\\)\[(?:\\.|[^\]\\])*\]\([^)]*\)/g)) taken.push([link.index, link.index + link[0].length]);
  // Narrative citations: `@key`, with an optional `[locator]` after it.
  NARRATIVE_RE.lastIndex = 0;
  for (let m = NARRATIVE_RE.exec(text); m; m = NARRATIVE_RE.exec(text)) {
    const at = m.index;
    if (taken.some(([s, e]) => at >= s && at < e)) continue;
    let end = at + m[0].length;
    let item: CitationItemInput = { id: m[1]! };
    const after = /^\s?\[([^\]@]*)\](?![({[])/.exec(text.slice(end));
    if (after) {
      const loc = parseLocator(`, ${after[1]!}`);
      if (loc.locator !== undefined || loc.suffix !== undefined) {
        item = { ...item, ...loc };
        end += after[0].length;
      }
    }
    found.push({ index: at, length: end - at, meta: { cluster: { mode: 'narrative', items: [item] }, raw: text.slice(at, end) } });
  }
  if (found.length === 0) return { cleaned: text, citations: [] };
  found.sort((a, b) => a.index - b.index);
  let out = '';
  let last = 0;
  const citations: CitationMeta[] = [];
  for (const f of found) {
    if (f.index < last) continue;
    out += text.slice(last, f.index) + CITATION_PLACEHOLDER;
    citations.push({ ...f.meta, sourceStart: fallbackStart + f.index, sourceEnd: fallbackStart + f.index + f.length });
    last = f.index + f.length;
  }
  out += text.slice(last);
  return { cleaned: out, citations };
}

/** Attach a `citation` to each {@link CITATION_PLACEHOLDER} in order. */
export function injectCitationSpans(spans: InlineSpan[], citations: CitationMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, citations, CITATION_PLACEHOLDER, (meta, bold, italic) => ({
    text: CITATION_PLACEHOLDER,
    bold,
    italic,
    citation: { cluster: meta.cluster, raw: restoreEscapes(meta.raw) },
  }));
}
