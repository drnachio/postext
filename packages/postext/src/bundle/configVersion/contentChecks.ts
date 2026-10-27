// The tests that decide whether a pin is given: what the markdown shows
// (maths, headings, boxes, poems, fences, CJK text…) and what the
// configuration sets (#1276: split out of configVersion.ts).
import type { PostextConfig, CjkConfig } from '../../types.js';
import { markdownHasScore } from '../../music/types.js';
import { KNOWN_CONTAINERS } from '../../parse/blockParser.js';
import { codeFenceOpen } from '../../parse/codeFence.js';
import { hasCJK } from '../../measure/cjk/cjk.js';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A paragraph line ending in a colon (emphasis markers may close after
 *  it) with a list item next, blank lines between them allowed: the lead-in
 *  `keepColonWithList` keeps with its list. */
const COLON_LIST_RE = /:[*_]*[^\S\n]*\n(?:[^\S\n]*\n)*[^\S\n]*(?:[-*+]|\d+[.)])[^\S\n]/;

/** Whether `config` (or the screen overrides of its HTML viewer) declares
 *  a paragraph style, which is all a `:::paragraphs` container is laid out
 *  with. */
export function declaresParagraphStyles(config: Partial<PostextConfig>): boolean {
  const has = (c: Record<string, unknown>): boolean => Array.isArray(c.paragraphStyles) && c.paragraphStyles.length > 0;
  if (has(config as Record<string, unknown>)) return true;
  const viewer = (config as Record<string, unknown>).htmlViewer;
  return isRecord(viewer) && isRecord(viewer.overrides) && has(viewer.overrides);
}

/** A `:::paragraphs` opening fence on a line of its own, as the block
 *  parser reads one (the line trimmed). */
const PARAGRAPHS_FENCE_LINE_RE = /^[^\S\n]*:::[^\S\n]*paragraphs[^\S\n]*(?:\{[^}\n]*\})?[^\S\n]*$/m;

/** Whether markdown may hold a `:::paragraphs` container. Unknown content
 *  (undefined) may. */
export function mayHaveParagraphContainers(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return PARAGRAPHS_FENCE_LINE_RE.test(content);
  return content.some((text) => PARAGRAPHS_FENCE_LINE_RE.test(text));
}

/** A compound a line may end in: a hyphen between two letters. The
 *  Markdown is read raw; only a paragraph with no inline mark is broken
 *  differently, and there the compound is written as it prints. */
const COMPOUND_RE = /\p{L}-\p{L}/u;

/** Whether markdown may set a compound. Unknown content (undefined) may. */
export function mayHaveCompounds(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return COMPOUND_RE.test(content);
  return content.some((text) => COMPOUND_RE.test(text));
}

/** A `:::verse` fence on a line of its own, its attributes, and the poem's
 *  lines up to its closing `:::` (or the end of the text). */
const VERSE_POEM_RE = /^[^\S\n]*:::[^\S\n]*verse[^\S\n]*(\{[^}\n]*\})?[^\S\n]*\n([\s\S]*?)(?:^[^\S\n]*:::[^\S\n]*$|(?![\s\S]))/gm;

/** Whether markdown holds a poem the line layout changes: a `:::verse`
 *  fence naming no layout over lines with no hemistich separator. */
function hasPlainPoem(text: string): boolean {
  if (!text.includes(':::')) return false;
  for (const m of text.matchAll(VERSE_POEM_RE)) {
    if (m[1] && /\blayout\s*=/.test(m[1])) continue;
    const body = m[2] ?? '';
    if (body.trim() !== '' && !body.includes('||') && !/\s\\\\\s/.test(body)) return true;
  }
  return false;
}

/** Whether markdown may hold such a poem. Unknown content (undefined)
 *  may. */
export function mayHavePlainPoems(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return hasPlainPoem(content);
  return content.some(hasPlainPoem);
}

/** Whether markdown may set text off the body's leading in the flow, which
 *  is all the unit of a level cut changes: a container, a directive or a
 *  code fence, a quotation, a list, a display formula, a citation (its
 *  list of references). Prose under headings is on the grid. Unknown
 *  content (undefined) may. */
export function mayHaveOffGridLines(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  const test = (text: string): boolean => /^[^\S\n]*(?::::|```|~~~|>|[-*+][^\S\n]|\d+[.)][^\S\n]|\$\$)|\[@/m.test(text);
  return typeof content === 'string' ? test(content) : content.some(test);
}

/** An `:::index` fence on a line of its own, as the block parser reads one
 *  (the line trimmed). */
const INDEX_FENCE_LINE_RE = /^[^\S\n]*:::[^\S\n]*index[^\S\n]*(?:\{[^}\n]*\})?[^\S\n]*$/m;

/** Whether markdown may print an index. Unknown content (undefined) may. */
export function mayHaveIndexes(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return INDEX_FENCE_LINE_RE.test(content);
  return content.some((text) => INDEX_FENCE_LINE_RE.test(text));
}

/** Whether markdown may set a float: a resource embedded on its own line
 *  (as {@link mayEmbedResources} reads one) or cited (`:ref`, LaTeX's
 *  `\ref`), or a box floated by its fence (`placement=`). Unknown content
 *  (undefined) may. */
export function mayHaveFloats(content: string | readonly string[] | undefined): boolean {
  if (content === undefined || mayEmbedResources(content)) return true;
  const test = (text: string): boolean => /:ref\s*[[{]|\\(?:eq)?ref\{|placement\s*=/.test(text);
  return typeof content === 'string' ? test(content) : content.some(test);
}

/** Whether a configuration sets a page-span heading: a heading level or a
 *  heading style with `span: 'page'` (no level spans the page by
 *  default). */
export function setsPageSpanHeading(config: Partial<PostextConfig>): boolean {
  const spans = (entries: unknown): boolean =>
    Array.isArray(entries) && entries.some((e) => isRecord(e) && e.span === 'page');
  return (isRecord(config.headings) && spans(config.headings.levels)) || spans(config.headingStyles);
}

/** A `:::columns` opening fence on a line of its own. */
const COLUMNS_FENCE_LINE_RE = /^[^\S\n]*:::[^\S\n]*columns[^\S\n]*(?:\{[^}\n]*\})?[^\S\n]*$/m;

/** Whether markdown may hold a `:::columns` group. Unknown content
 *  (undefined) may. */
export function mayHaveColumnGroups(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return COLUMNS_FENCE_LINE_RE.test(content);
  return content.some((text) => COLUMNS_FENCE_LINE_RE.test(text));
}

/** Whether markdown holds a poem set line by line: a `:::verse` fence
 *  naming `layout=lines`, or naming no layout over lines with no
 *  hemistich separator, unless the configuration sets such poems as
 *  bayts (`bayt`, `bodyText.verse.layout: 'bayt'`). */
function hasLinePoem(text: string, bayt: boolean): boolean {
  if (!text.includes(':::')) return false;
  for (const m of text.matchAll(VERSE_POEM_RE)) {
    const layout = m[1] ? /\blayout\s*=\s*"?([a-z]*)/.exec(m[1])?.[1] : undefined;
    if (layout === 'lines') return true;
    if (layout && layout !== 'auto') continue;
    const body = m[2] ?? '';
    if (!bayt && body.trim() !== '' && !body.includes('||') && !/\s\\\\\s/.test(body)) return true;
  }
  return false;
}

/** Whether markdown may hold a poem set line by line under `config` (see
 *  {@link hasLinePoem}). Unknown content (undefined) may. */
export function mayHaveLinePoems(content: string | readonly string[] | undefined, config: Partial<PostextConfig>): boolean {
  if (content === undefined) return true;
  const verse = isRecord(config.bodyText) && isRecord(config.bodyText.verse) ? config.bodyText.verse : {};
  const bayt = verse.layout === 'bayt';
  if (typeof content === 'string') return hasLinePoem(content, bayt);
  return content.some((text) => hasLinePoem(text, bayt));
}

/** Whether markdown holds a line that opens a code fence. */
function hasCodeFence(text: string): boolean {
  if (!text.includes('```') && !text.includes('~~~')) return false;
  return text.split('\n').some((line) => codeFenceOpen(line) !== undefined);
}

/** Whether markdown may hold a code fence. Unknown content (undefined)
 *  may. */
export function mayHaveCodeFences(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return hasCodeFence(content);
  return content.some(hasCodeFence);
}

/** A line that opens a block of its own, which a paragraph's lines never
 *  run into: a heading, a fence, a display formula, a list item, a
 *  resource embed. */
const BLOCK_LINE_RE = /^(?:#{1,6}\s|:::|::resource\b|\$\$|(?:[-*+]|\d+[.)]|[\u0660-\u0669]+[.)]|[\u06f0-\u06f9]+[.)])\s)/;
const LIST_LINE_RE = /^(?:[-*+]|\d+[.)]|[\u0660-\u0669]+[.)]|[\u06f0-\u06f9]+[.)])\s/;

/** Whether markdown holds a forced line break as #620 reads one: in a
 *  paragraph, a quotation or a list item, `\\` before a space and more
 *  text, or a backslash ending a line the block goes on after (a list item
 *  is one line). Inline code and maths, display formulas, headings (whose
 *  `\\` always broke the title) and `:::verse` poems (whose spaced `\\`
 *  cuts a bayt) are passed over. */
function hasForcedBreak(text: string): boolean {
  if (!text.includes('\\')) return false;
  const lines = text.split('\n').map((l) => l.trim());
  let verse = false;
  let display = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (display) {
      if (line.endsWith('$$')) display = false;
      continue;
    }
    if (verse) {
      if (FENCE_CLOSE_RE.test(line)) verse = false;
      continue;
    }
    if (/^:::\s*verse\b/.test(line)) {
      verse = true;
      continue;
    }
    if (line.startsWith('$$')) {
      display = !(line.length > 2 && line.endsWith('$$'));
      continue;
    }
    if (!line.includes('\\') || /^#{1,6}\s/.test(line)) continue;
    const body = line.replace(/^>\s?/, '').replace(/`[^`\n]+?`/g, '').replace(/\$[^$\n]*\$/g, '');
    if (/\\\\[ \t]+\S/.test(body)) return true;
    if (!body.endsWith('\\') || LIST_LINE_RE.test(body)) continue;
    const next = lines[i + 1] ?? '';
    if (next !== '' && !BLOCK_LINE_RE.test(next) && (next.startsWith('>') === line.startsWith('>'))) return true;
  }
  return false;
}

/** Whether markdown may hold a forced line break. Unknown content
 *  (undefined) may. */
export function mayHaveForcedBreaks(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return hasForcedBreak(content);
  return content.some(hasForcedBreak);
}

/** A dash a line may end after (see `breaksAfterDash` in
 *  `measure/breakRules.ts`): an em or en dash set closed, a letter, a digit
 *  or closing punctuation before it, and a letter or a digit after it. A
 *  quotation mark before the dash counts only when something that may close
 *  a word stands before it (`"no"—and`, `„nein“—und`, `« non »—et`), not
 *  after a space (`said "—Hola`), where no rule breaks. The Markdown is read
 *  raw, so the inline marks that may touch the dash or the quote count on
 *  either side (`**riddles.**—I`, `*riddles*—and`, `*no*"—and`, a code
 *  span, a `:ref[…]`, an escape). An en dash between two digits, and a
 *  bracket or quote after the dash, which never break, are let through: the
 *  check only has to be safe. */
const CLOSED_DASH_RE = /(?:[\p{L}\p{N}.,;:!?)\]}…*_`~^\\]|[\p{L}\p{N}.,;:!?)\]}…*_`~^\\\u00A0\u202F]["'»”’“«])[\u2013\u2014][\p{L}\p{N}([{¿¡«“‘„"'*_`~^:\\<]/u;

/** Whether markdown may set a dash a line can now end after. Unknown
 *  content (undefined) may. */
export function mayHaveClosedDashes(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return CLOSED_DASH_RE.test(content);
  return content.some((text) => CLOSED_DASH_RE.test(text));
}

/** A heading line of markdown, its title in group 1. The block parser
 *  trims a line before it reads a heading, so any indent will do. */
const HEADING_LINE_RE = /^[^\S\n]*#{1,6}[^\S\n]+(.*)$/gm;
/** A mark a heading's title may carry: `*`, `_`, `^`, `~`, `:smallcaps[`
 *  or the `](` of a link. */
const HEADING_MARK_RE = /[*_^~]|:smallcaps\[|\]\(/;
/** The trailing `{…}` attributes of a heading line (the spaces before
 *  them go too, see `withoutHeadingAttrs`). */
const HEADING_ATTRS_TAIL_RE = /\{[^{}]*\}\s*$/;

/** A heading title without its trailing `{…}` attributes and the spaces
 *  before them. Searching from the brace (not from the spaces) keeps a
 *  long run of spaces linear. */
function withoutHeadingAttrs(title: string): string {
  const at = title.search(HEADING_ATTRS_TAIL_RE);
  return at < 0 ? title : title.slice(0, at).trimEnd();
}

/** Whether markdown may hold a heading whose title carries an inline mark
 *  (its attributes left out). Unknown content (undefined) may. */
export function mayHaveHeadingMarks(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  const test = (text: string): boolean => {
    for (const m of text.matchAll(HEADING_LINE_RE)) {
      if (HEADING_MARK_RE.test(withoutHeadingAttrs(m[1]!))) return true;
    }
    return false;
  };
  return typeof content === 'string' ? test(content) : content.some(test);
}

/** Whether markdown may hold a heading, which is all a paragraph keeps
 *  with. Unknown content (undefined) may. */
export function mayHaveHeadings(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  const test = (text: string): boolean => new RegExp(HEADING_LINE_RE.source, 'm').test(text);
  return typeof content === 'string' ? test(content) : content.some(test);
}

/** A `::resource{id="…"}` embed alone on its line, as the block parser
 *  reads one (the line trimmed): a mention in running text or in a code
 *  span embeds nothing. */
const RESOURCE_EMBED_LINE_RE = /^[^\S\n]*::resource[^\S\n]*\{id="[^"\n]+"\}[^\S\n]*$/m;
/** The same, for one line. */
const RESOURCE_EMBED_RE = /^[^\S\n]*::resource[^\S\n]*\{id="[^"\n]+"\}[^\S\n]*$/;
/** A container's opening fence (`:::callout{…}`) and its bare closing
 *  fence, as the block parser reads them (the line trimmed). */
const FENCE_OPEN_RE = /^:::\s*([a-z][a-z0-9-]*)(?:\s*\{[^}]*\})?\s*$/;
const FENCE_CLOSE_RE = /^:::\s*$/;

/** A `:::callout` opening fence on a line of its own, as the block parser
 *  reads one (the line trimmed). */
const CALLOUT_FENCE_LINE_RE = /^[^\S\n]*:::[^\S\n]*callout[^\S\n]*(?:\{[^}\n]*\})?[^\S\n]*$/m;

/** Whether markdown may hold a box, which is all that splits by the box
 *  cut rules. Unknown content (undefined) may. */
export function mayHaveBoxes(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return CALLOUT_FENCE_LINE_RE.test(content);
  return content.some((text) => CALLOUT_FENCE_LINE_RE.test(text));
}

/** Whether markdown embeds a resource inside a box: a `::resource` line
 *  while a `:::callout` fence is open. */
function embedsResourceInBox(text: string): boolean {
  if (!RESOURCE_EMBED_LINE_RE.test(text)) return false;
  const open: boolean[] = [];
  let boxes = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence && (KNOWN_CONTAINERS as ReadonlySet<string>).has(fence[1]!)) {
      const box = fence[1] === 'callout';
      open.push(box);
      if (box) boxes++;
    } else if (open.length > 0 && FENCE_CLOSE_RE.test(line)) {
      if (open.pop()) boxes--;
    } else if (boxes > 0 && RESOURCE_EMBED_RE.test(line)) {
      return true;
    }
  }
  return false;
}

/** `MigrateConfigOptions.content` as a string or an array. Both checks
 *  below read it, and an iterator (a generator, a Map's `values()`) can be
 *  walked only once, so the migrations take its texts into an array first. */
export function readContent(content: string | Iterable<string> | undefined): string | readonly string[] | undefined {
  return content === undefined || typeof content === 'string' ? content : [...content];
}

/** Whether markdown may embed a resource inline: only a `::resource`
 *  directive on a line of its own does. Unknown content (undefined) may. */
export function mayEmbedResources(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return RESOURCE_EMBED_LINE_RE.test(content);
  return content.some((text) => RESOURCE_EMBED_LINE_RE.test(text));
}

/** Whether markdown may embed a resource inside a box. Unknown content
 *  (undefined) may. */
export function mayEmbedResourcesInBoxes(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return embedsResourceInBox(content);
  return content.some(embedsResourceInBox);
}

/** Whether markdown may introduce a list with a colon. Unknown content
 *  (undefined) may. */
export function mayLeadListWithColon(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return COLON_LIST_RE.test(content);
  return content.some((text) => COLON_LIST_RE.test(text));
}

/** Whether markdown sets maths: a formula is written between `$` signs.
 *  Unknown content (undefined) may. */
export function mayHaveMaths(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return content.includes('$');
  return content.some((text) => text.includes('$'));
}

/** The `cjk` of a configuration, `{}` when it has none. */
export function cjkOf(config: Partial<PostextConfig>): CjkConfig {
  return isRecord(config.cjk) ? config.cjk : {};
}

/** A reference typed in the text: `:ref{…}`, LaTeX's `\ref{…}` and
 *  `\eqref{…}`, or a pandoc-crossref `@id` (an `@` that opens a word). */
const REF_RE = /:ref\{|\\(?:eq)?ref\{|(?:^|[^\p{L}\p{N}])@[\p{L}\p{N}_]/mu;

/** Whether markdown may hold a cross-reference. Unknown content
 *  (undefined) may. */
export function mayHaveRefs(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  return typeof content === 'string' ? REF_RE.test(content) : content.some((text) => REF_RE.test(text));
}

/** A task item as the block parser reads one (`TASK_ITEM_RE`): a bullet,
 *  `[ ]`, `[x]` or `[X]`, and a space, at any indent; inside a quotation
 *  too. Only a bullet opens one: a numbered item is never a task. */
const TASK_ITEM_LINE_RE = /^[^\S\n]*(?:>[^\S\n]*)*[-*+][^\S\n]+\[[ xX]\][^\S\n]/m;

/** Whether markdown may hold a task item. Unknown content (undefined)
 *  may. */
export function mayHaveTaskItems(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  return typeof content === 'string' ? TASK_ITEM_LINE_RE.test(content) : content.some((text) => TASK_ITEM_LINE_RE.test(text));
}

/** A line that opens a comic: a `:::page` or a `:::strip` fence. */
const COMIC_FENCE_LINE_RE = /^[ \t]*:::(?:page|strip)(?=[\s{]|$)/m;

/** Whether markdown may hold a comic page or strip. Unknown content
 *  (undefined) may. */
export function mayHaveComics(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  return typeof content === 'string' ? COMIC_FENCE_LINE_RE.test(content) : content.some((text) => COMIC_FENCE_LINE_RE.test(text));
}

/** Whether markdown may hold kana or kanji. Unknown content (undefined)
 *  may. */
export function mayHaveCjkText(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  return typeof content === 'string' ? hasCJK(content) : content.some(hasCJK);
}

/** Whether markdown may hold a fence in a notation language. Unknown
 *  content (undefined) may. */
export function mayHaveScoreFences(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  return typeof content === 'string' ? markdownHasScore(content) : content.some(markdownHasScore);
}

/** A highlight mark typed in the text. */
const MARK_RE = /:mark\[/;

/** Whether a document may set a highlight mark: a `:mark[…]` in its
 *  markdown or in the configuration's own text (a design text that reads
 *  inline marks). Unknown content (undefined) may. */
export function mayHaveMarks(content: string | readonly string[] | undefined, config: Partial<PostextConfig>): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string' ? MARK_RE.test(content) : content.some((text) => MARK_RE.test(text))) return true;
  return MARK_RE.test(JSON.stringify(config));
}

/** A two-row note typed in the text. */
const NOTE_RE = /:warichu\[/;

/** Whether a document may set a two-row note: a `:warichu[…]` in its
 *  markdown, or citations set as notes (`citations.notes: 'warichu'`).
 *  Unknown content (undefined) may. */
export function mayHaveNotes(content: string | readonly string[] | undefined, config: Partial<PostextConfig>): boolean {
  if (content === undefined) return true;
  if (isRecord(config.citations) && config.citations.notes === 'warichu') return true;
  if (typeof content === 'string') return NOTE_RE.test(content);
  return content.some((text) => NOTE_RE.test(text));
}

/** A book title in brackets (《》 〈〉), or a `:book[…]` title. */
const BOOK_TITLE_RE = /[《〈︽︿]|:book\[/;
/** A circled, parenthesized or full-stop number or letter (①, ⑴, ⒈, ⓐ, ❶,
 *  ➀). */
const CIRCLED_RE = /[\u2460-\u24FF\u2776-\u2793]/;

/** Whether markdown may set a book title. Unknown content (undefined)
 *  may. */
export function mayHaveBookTitles(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return BOOK_TITLE_RE.test(content);
  return content.some((text) => BOOK_TITLE_RE.test(text));
}

/** Whether markdown may set a circled number. Unknown content (undefined)
 *  may. */
export function mayHaveCircledNumbers(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return CIRCLED_RE.test(content);
  return content.some((text) => CIRCLED_RE.test(text));
}

/** Whether a design text may hold CJK: the markdown it prints from (a
 *  heading, an attribute, a running head) or the configuration's own text
 *  (a literal in a design element, a label). Unknown content (undefined)
 *  may. */
export function mayHaveCjkDesignText(content: string | readonly string[] | undefined, config: Partial<PostextConfig>): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string' ? hasCJK(content) : content.some(hasCJK)) return true;
  return hasCJK(JSON.stringify(config));
}
