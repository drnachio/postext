/**
 * Block-level markdown tokenizer. Splits the source into `ContentBlock`s
 * (headings, paragraphs, blockquotes, list items, math display blocks) and
 * attaches per-character `sourceMap` arrays so higher layers can map cursor
 * positions back into the original markdown.
 */

import type { BlockSlot, CodeBlockInfo, ContainerName, ContentBlock, DirectiveAttrs, DirectiveName, ParseIssue, ParseOptions } from './types.js';
import type { SourceRange } from '../composed/types.js';
import { attachEquationAnchors } from './equationLabels.js';
import { parseAttrBlobStrict, parseDirectiveAttrs, scanDirectiveAttrs } from './attrs.js';
import { fixMathSourceMap } from './inlineMath.js';
import { buildBlockMapping } from './sourceMapping.js';
import { attachIndexMarks, extractIndexMarks, remapParseOffsets } from './indexMarks.js';
import { joinEastAsianLines } from './softBreaks.js';
import { codeFenceOpen } from './codeFence.js';
import { createVerseParsing } from './blockParser/verse.js';
import { createContainerParsing } from './blockParser/containers.js';
import { createCodeParsing } from './blockParser/codeFences.js';
import type { ParseState } from './blockParser/parseState.js';
import type { LineScan } from './blockParser/lineScan.js';
import { createDisplayBlocks } from './blockParser/displayBlocks.js';
import { createFenceLines } from './blockParser/fenceLines.js';
import { createHeadingLines } from './blockParser/headingLines.js';
import { createListLines } from './blockParser/listLines.js';
import { createParagraphLines } from './blockParser/paragraphLines.js';

export { parseDirectiveAttrs, spaceDirectiveLines, MAX_SPACE_LINES } from './attrs.js';
export { codeFenceOpen } from './codeFence.js';

export const HEADING_RE = /^(#{1,6})\s+(.+)$/;
/** `:::name` or `:::name{attrs}` on its own line. Shared by single-line
 *  directives and container opening fences. */
export const DIRECTIVE_RE = /^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\}\s*)?$/;
/** A bare `:::` line: closes the innermost open container. */
export const CONTAINER_CLOSE_RE = /^:::\s*$/;
/** A composed page's opening fence (#854): four or more colons, `page`,
 *  its attributes (`::::page{template="…"}`). Three colons stay a comic
 *  page (`:::page{split}`). */
export const PAGE_FENCE_RE = /^(:{4,})\s*page(?:\s*\{([^}]*)\})?\s*$/;
/** A bare fence of four or more colons: it closes the composed page opened
 *  with as many (#854). */
export const LONG_CLOSE_RE = /^(:{4,})\s*$/;
/** A `::label[TEXT]{…}` line of a `:::figure` (#854). */
export const LABEL_LINE_RE = /^::label\[/;
/** A `:::label{…}` fence of a `:::figure` (#1058): a label over several lines. */
export const LABEL_CONTAINER_RE = /^:::label(?:\{([^}]*)\})?$/;
/** `::alt[…]`, `::caption[…]`, `::note[…]`: a figure's own words (#935). */
export const FIGURE_WORD_LINE_RE = /^::(alt|caption|note)\[/;
/** `at="62% 48%"`: a label's place in percents of the picture. */
export const LABEL_AT_PERCENT_RE = /^\s*(-?\d+(?:\.\d+)?)\s*%\s+(-?\d+(?:\.\d+)?)\s*%\s*$/;
/** A bayt's hemistichs cut at a `\\` with a space on each side (the
 *  Wikisource markup, #378). */
export const HEMISTICH_WIKI_RE = /\s\\\\\s/;
/** Set of directive names recognized today. Unknown names fall through to
 *  paragraph-parsing and downstream warnings flag them. */
export const KNOWN_DIRECTIVES: ReadonlySet<DirectiveName> = new Set(['pagebreak', 'numbering', 'columnbreak', 'space', 'toc', 'index', 'bibliography', 'references', 'verse', 'page', 'strip', 'figure', 'solutions']);
/** The directives that are one line, with no body and no closing fence
 *  (a bare `:::` after one is a stray fence, #1125). */
export const ONE_LINE_DIRECTIVES: ReadonlySet<DirectiveName> = new Set(['pagebreak', 'numbering', 'columnbreak', 'space', 'toc', 'index', 'bibliography', 'solutions']);
/** Trailing `{key="value" …}` attribute block on a heading line, e.g.
 *  `# Title {author="I. Zango"}`. The braces must be balanced (no nested
 *  braces) and be the last thing on the line, after a space — or right
 *  after a Chinese or Japanese character, since those titles are written
 *  without one (`# 回目{style="x"}`, #181). The block is taken only when
 *  the attribute grammar reads all of it (see `headingAttrTokens`);
 *  anything else is left in the heading text verbatim. */
export const HEADING_ATTRS_RE = /(?:\s+|(?<=[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\u3000-\u303F\uFF00-\uFFEF]))\{([^{}]*)\}\s*$/u;

/** The attributes of a heading's trailing `{…}` block, or `undefined` when
 *  the braces stay in the title: the grammar must read the whole blob
 *  (`{x, y}` and `{紅樓|hóng lóu}` stay text), and it must set a value —
 *  flags alone count only after a space (`# Title {draft}`), not glued to
 *  the title (`# 第一回{draft}` stays text). A key written outside ASCII
 *  (`作者=曹雪芹`) is read, so the block still leaves the title and its
 *  other keys apply, and then dropped (`attributeKeyInvalid`). */
export function headingAttrTokens(blob: string, spaced: boolean): ReturnType<typeof parseAttrBlobStrict> {
  const tokens = parseAttrBlobStrict(blob);
  if (!tokens || tokens.length === 0) return undefined;
  if (!spaced && tokens.every((t) => t.flag)) return undefined;
  return tokens;
}
/** Set of fenced-container names recognized today. A `:::name` line whose
 *  name is a known container opens a block that runs until a bare `:::`. */
export const KNOWN_CONTAINERS: ReadonlySet<ContainerName> = new Set(['callout', 'paragraphs', 'part', 'columns', 'paper', 'frame', 'module', 'exercise', 'solution', 'hint']);

/** Absolute source range of each attribute value of a blob that starts at
 *  `blobStart` (a flag: its key). A repeated key keeps the last, as
 *  `parseDirectiveAttrs` does. */
export function attrSourcesOf(raw: string, blobStart: number): Record<string, SourceRange> {
  const out: Record<string, SourceRange> = {};
  for (const t of scanDirectiveAttrs(raw)) {
    out[t.key] = t.valueStart !== undefined && t.valueEnd !== undefined
      ? { sourceStart: blobStart + t.valueStart, sourceEnd: blobStart + t.valueEnd }
      : { sourceStart: blobStart + t.start, sourceEnd: blobStart + t.end };
  }
  return out;
}

/** A module's own name (#1062): no space, and none of `.`, `#`, `[`, `]`
 *  (the characters scoped and instance names are built with). */
export const MODULE_NAME_RE = /^[^\s.#[\]]+$/u;

/** The slot a blob's `slot="…"` names (#854), or undefined when it names
 *  none (or an empty one). */
export function slotOf(attrs: DirectiveAttrs, raw: string, blobStart: number): BlockSlot | undefined {
  const name = attrs.slot?.trim();
  if (!name) return undefined;
  const at = attrSourcesOf(raw, blobStart).slot!;
  return { name, sourceStart: at.sourceStart, sourceEnd: at.sourceEnd };
}

/** The offset just past the `]` closing the bracket opened right before
 *  `from` (nested brackets counted, a backslash escapes), or -1. */
export function closingBracket(text: string, from: number): number {
  let depth = 1;
  for (let k = from; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') { k++; continue; }
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return k;
  }
  return -1;
}

/** True for lines that end a paragraph run even without a blank line: any
 *  `:::name` directive/container fence and the bare `:::` closing fence. */
export function isFenceLine(trimmed: string): boolean {
  return DIRECTIVE_RE.test(trimmed) || CONTAINER_CLOSE_RE.test(trimmed);
}
/** A footnote definition: `[^id]:` opening a paragraph. */
export const FOOTNOTE_DEF_RE = /^\[\^([\p{L}\p{N}_.:-]+)\]:[ \t]*/u;
export const TASK_ITEM_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/;
/** An exercise's word bank (#1225): `::bank`, `::bank[sun | rain]`, with
 *  optional attributes. Read only inside a `:::exercise`. */
export const BANK_LINE_RE = /^::bank(?:\[(.*)\])?(?:\{([^}]*)\})?\s*$/;
/** An ordered list item: its number in European, Arabic-Indic (١.) or
 *  Persian (۱.) digits — what an Arabic or Persian keyboard types — then
 *  `.` or `)`. */
export const ORDERED_LIST_ITEM_RE = /^(\s*)([0-9]+|[\u0660-\u0669]+|[\u06f0-\u06f9]+)([.)])\s+(.*)$/;
export const LIST_ITEM_RE = /^(\s*)([-*+])\s+(.*)$/;

/** One-line `$$ ... $$` display math (the whole line is the formula). */
export const BLOCK_MATH_SINGLE_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;
/** Standalone `$$` marker (opening or closing a multi-line display block). */
export const BLOCK_MATH_FENCE_RE = /^\s*\$\$\s*$/;
/** A one-line display that may interrupt a paragraph: one formula, with no
 *  `$$` inside it (`$$a$$ and $$b$$` is a line of text, not a display). */
export const INTERRUPTING_MATH_SINGLE_RE = /^\s*\$\$((?:(?!\$\$)[\s\S])+)\$\$\s*$/;

/** `::resource{id="..."}` block embed on its own line. Malformed variants
 *  (missing/empty id, extra attrs) fall through to paragraph parsing. */
export const RESOURCE_DIRECTIVE_RE = /^::resource\s*\{id="([^"]+)"\}\s*$/;

/** A fence's info string read (#624): the first word is the language
 *  (lower-cased); a `{…}` block after it, or `key=value` pairs, are
 *  attributes in the directive grammar; anything else after the language
 *  is the title (```` ```console Terminal ````). */
export function readCodeInfo(info: string): Pick<CodeBlockInfo, 'lang' | 'attrs' | 'title'> {
  let rest = info.trim();
  let lang: string | undefined;
  const first = /^([^\s{]+)\s*/.exec(rest);
  if (first) {
    lang = first[1]!.toLowerCase();
    rest = rest.slice(first[0].length);
  }
  let attrs: DirectiveAttrs = {};
  const brace = /\{([^{}]*)\}\s*$/.exec(rest);
  if (brace) {
    attrs = parseDirectiveAttrs(brace[1]!);
    rest = rest.slice(0, brace.index).trim();
  } else if (/[=\uFF1D]/.test(rest)) {
    attrs = parseDirectiveAttrs(rest);
    rest = '';
  }
  const title = attrs.title !== undefined ? attrs.title : rest !== '' ? rest : undefined;
  return { ...(lang ? { lang } : {}), attrs, ...(title !== undefined && title.trim() !== '' ? { title: title.trim() } : {}) };
}

/** How far a line of indented code is indented (#624): the length of the
 *  leading whitespace that reaches column 4 (a tab to the next multiple of
 *  4), or -1 when it does not reach it. */
export function indentedCodeCut(line: string): number {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === ' ') col += 1;
    else if (c === '\t') col = col - (col % 4) + 4;
    else return -1;
    if (col >= 4) return i + 1;
  }
  return -1;
}

// Small LRU memo used by parseMarkdownMemo, keyed by the input string (one
// per way of reading it, see `ParseOptions`). The returned array and its
// ContentBlocks are treated as read-only by the rest of the pipeline. A few
// slots (not one) because a book is counted chapter by chapter —
// continuation, outline, warnings and the layout itself each parse the same
// few chapters in turn, and a single slot thrashed between them.
const PARSE_MEMO_SLOTS = 8;
const _parseMemos = new Map<string, Map<string, { blocks: ContentBlock[]; issues: ParseIssue[] }>>();

/** The options as one key: the default reading is `''`. */
function optionsKey(options: ParseOptions | undefined): string {
  const fences = options?.fences !== false;
  const indented = options?.indentedCode === true;
  const scores = options?.scores !== false;
  return fences && !indented && scores ? '' : `${fences ? 'f' : 'n'}${indented ? 'i' : ''}${scores ? '' : 'c'}`;
}

function parseMemoLookup(markdown: string, options?: ParseOptions): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  const key = optionsKey(options);
  let memo = _parseMemos.get(key);
  if (!memo) _parseMemos.set(key, (memo = new Map()));
  const hit = memo.get(markdown);
  if (hit) {
    // Refresh recency: a Map iterates in insertion order.
    memo.delete(markdown);
    memo.set(markdown, hit);
    return hit;
  }
  const result = parseMarkdownWithIssues(markdown, options);
  memo.set(markdown, result);
  if (memo.size > PARSE_MEMO_SLOTS) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  return result;
}

/** @internal Number of inputs the parse memo keeps (tests). */
export const PARSE_MEMO_CAPACITY = PARSE_MEMO_SLOTS;

/**
 * Memoized wrapper around parseMarkdown: returns the cached result when the
 * input string is byte-for-byte identical to one of the last few calls.
 * This avoids reparsing a document on each keystroke when upstream
 * recomputes only because a sibling state changed.
 */
export function parseMarkdownMemo(markdown: string, options?: ParseOptions): ContentBlock[] {
  return parseMemoLookup(markdown, options).blocks;
}

export function parseMarkdownWithIssuesMemo(markdown: string, options?: ParseOptions): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  return parseMemoLookup(markdown, options);
}

export function parseMarkdown(markdown: string, options?: ParseOptions): ContentBlock[] {
  return parseMarkdownWithIssues(markdown, options).blocks;
}

/**
 * Merge consecutive blockquote lines into a single block, and consecutive
 * non-blank, non-special lines into paragraphs. Index marks (`:index…`)
 * are taken out first and attached to the blocks holding them
 * (`ContentBlock.indexMarks`); every source offset still points into
 * `markdown`. `options` picks how code is read (#624): fences on, indented
 * code off by default.
 */
export function parseMarkdownWithIssues(markdown: string, options?: ParseOptions): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  const marks = extractIndexMarks(markdown, { fences: options?.fences !== false });
  if (!marks) return attachInlineCode(attachDirections(attachContainerAnchors(attachEquationAnchors(parseBlocks(markdown, options), markdown))), markdown);
  const result = parseBlocks(marks.text, options);
  attachIndexMarks(result.blocks, marks.marks);
  remapParseOffsets(result, marks.toOriginal);
  return attachInlineCode(attachDirections(attachContainerAnchors(attachEquationAnchors(result, markdown))), markdown);
}

/** Inline code (`` `x` ``, outside an escape) between two backticks on
 *  one line, as `protectCodeSpans` reads it. */
const INLINE_CODE_RE = /(?<!\\)`([^`\n]+?)`/g;

/** Text blocks whose inline code a layout may set in the code face. */
const INLINE_CODE_HOSTS = new Set<ContentBlock['type']>(['heading', 'paragraph', 'blockquote', 'listItem']);

/**
 * The inline code of each text block (#624): the source ranges of the text
 * between the backticks of its code spans (`ContentBlock.inlineCode`), read
 * from the block's own source. Blocks without a backtick are left alone.
 */
function attachInlineCode<T extends { blocks: ContentBlock[] }>(result: T, markdown: string): T {
  for (const b of result.blocks) {
    if (!INLINE_CODE_HOSTS.has(b.type) || b.verse || b.sourceEnd <= b.sourceStart) continue;
    const source = markdown.slice(b.sourceStart, b.sourceEnd);
    if (!source.includes('`')) continue;
    const ranges: Array<{ start: number; end: number }> = [];
    INLINE_CODE_RE.lastIndex = 0;
    for (let m = INLINE_CODE_RE.exec(source); m; m = INLINE_CODE_RE.exec(source)) {
      ranges.push({ start: b.sourceStart + m.index + 1, end: b.sourceStart + m.index + 1 + m[1]!.length });
    }
    if (ranges.length > 0) b.inlineCode = ranges;
  }
  return result;
}

/** The direction a `dir` attribute names (`{dir=rtl}`, any case), or
 *  undefined for none or a value other than `ltr` / `rtl`. */
function directionAttr(attrs: DirectiveAttrs | undefined): 'ltr' | 'rtl' | undefined {
  const v = attrs?.dir?.trim().toLowerCase();
  return v === 'ltr' || v === 'rtl' ? v : undefined;
}

/** The language a `lang` attribute names (`{lang=en}`), trimmed, or
 *  undefined for none. */
function langAttr(attrs: DirectiveAttrs | undefined): string | undefined {
  const v = attrs?.lang?.trim();
  return v ? v : undefined;
}

/**
 * Block directions (#367): a heading's `{dir=…}` sets its own, a
 * container's (`:::callout{dir=ltr}`, `:::paragraphs{dir=rtl}`) its own and
 * that of every block inside it, down to a nested container or heading
 * that sets another. Stamped on `ContentBlock.direction`, so the layout
 * reads one field per block; blocks outside any `dir` keep none and follow
 * the document's `direction`. A container's `lang` (`:::paragraphs{dir=ltr
 * lang=en}`) is stamped the same way on `ContentBlock.lang` (#401).
 */
function attachDirections<T extends { blocks: ContentBlock[] }>(result: T): T {
  const open: Array<'ltr' | 'rtl' | undefined> = [];
  const langs: Array<string | undefined> = [];
  for (const b of result.blocks) {
    const inherited = open[open.length - 1];
    const inheritedLang = langs[langs.length - 1];
    if (b.type === 'containerStart') {
      const d = directionAttr(b.containerAttrs) ?? inherited;
      open.push(d);
      if (d) b.direction = d;
      const lang = langAttr(b.containerAttrs) ?? inheritedLang;
      langs.push(lang);
      if (lang) b.lang = lang;
      continue;
    }
    if (b.type === 'containerEnd') {
      open.pop();
      langs.pop();
      continue;
    }
    const own = b.type === 'heading' ? directionAttr(b.attrs) : b.verse ? directionAttr(b.verse.attrs) : undefined;
    const d = own ?? inherited;
    if (d) b.direction = d;
    // A poem's own `lang` (`:::verse{dir=ltr lang=en}`, #620).
    const lang = (b.verse ? langAttr(b.verse.attrs) : undefined) ?? inheritedLang;
    if (lang) b.lang = lang;
  }
  return result;
}

/** Text blocks an anchor can sit in. */
const ANCHOR_HOSTS = new Set<ContentBlock['type']>(['heading', 'paragraph', 'blockquote', 'listItem']);

/**
 * A container opened with an identifier (`:::callout{#box}`, #261) is an
 * anchor on the first character of its first text block — where a
 * reference to it jumps and whose page it prints.
 */
function attachContainerAnchors<T extends { blocks: ContentBlock[] }>(result: T): T {
  const { blocks } = result;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const id = b.type === 'containerStart' ? b.containerAttrs?.id?.trim() : undefined;
    if (!id) continue;
    const host = blocks.slice(i + 1).find((x) => ANCHOR_HOSTS.has(x.type));
    if (!host) continue;
    const mark = {
      anchorId: id,
      ...(b.containerAttrs?.title ? { text: b.containerAttrs.title } : {}),
      sourceStart: b.sourceStart,
      sourceEnd: b.sourceEnd,
      anchor: host.sourceMap[0] ?? host.sourceStart,
      attach: 'after' as const,
    };
    host.anchorMarks = [mark, ...(host.anchorMarks ?? [])];
  }
  return result;
}

/** Stamp every chip of a mapped run with where its words stand in the
 *  source (`chip.sourceOffsets`, #857): the chip's bracketed text mapped as
 *  a paragraph's is, counted from the chip's leading `:`. */
export function withChipSources<T extends { spans: ContentBlock['spans']; sourceMap: number[] }>(markdown: string, mapping: T): T {
  let at = 0;
  for (const span of mapping.spans) {
    const chip = span.chip;
    if (chip) {
      const r = mapping.sourceMap[at];
      if (r !== undefined && markdown.startsWith(':chip[', r)) {
        const close = closingBracket(markdown, r + 6);
        const inner = close < 0 ? undefined : buildBlockMapping(markdown, r + 6, close, chip.spans.map((s) => ({ ...s })));
        const words = chip.spans.map((s) => s.text).join('');
        if (inner && inner.text === words && inner.sourceMap.length === words.length) chip.sourceOffsets = inner.sourceMap.map((o) => o - r);
      }
    }
    at += span.text.length;
  }
  return mapping;
}

/** A multi-line block's mapping with its maths placeholders aligned and
 *  the spaces that joined two lines between East Asian characters taken
 *  out (CSS Text 3 §4.1.3, see `softBreaks.ts`). */
export function joinedLines(
  markdown: string,
  mapping: { text: string; spans: ContentBlock['spans']; sourceMap: number[] },
): { text: string; spans: ContentBlock['spans']; sourceMap: number[] } {
  fixMathSourceMap(markdown, mapping.text, mapping.spans, mapping.sourceMap);
  return joinEastAsianLines(markdown, mapping.text, mapping.spans, mapping.sourceMap) ?? mapping;
}

/**
 * The text a text panel's body is read from (#885): `markdown` up to the
 * body's end with everything before the body blanked (line feeds kept), so
 * every offset the reading gives is the body's own in `markdown`. Fence
 * lines in the body (`:::name`, `::::page`) are blanked too: a comic's body
 * ends at its first bare `:::`, so a container could never close in it.
 */
export function comicTextSource(markdown: string, start: number, end: number): string {
  const blank = (t: string): string => t.replace(/[^\n]/g, ' ');
  const body = markdown.slice(start, end).split('\n').map((line) => (line.trimStart().startsWith(':::') ? blank(line) : line)).join('\n');
  return blank(markdown.slice(0, start)) + body;
}

export function parseBlocks(markdown: string, options?: ParseOptions): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  const parse = {} as ParseState;
  const fences = options?.fences !== false;
  const indentedCode = options?.indentedCode === true;
  const scores = options?.scores !== false;
  const blocks: ContentBlock[] = [];
  const issues: ParseIssue[] = [];
  const rawLines = markdown.split('\n');

  // Precompute starting offset of each raw line in the original markdown.
  // lineOffsets[i] = offset of first char of rawLines[i]. Line terminator '\n'
  // contributes exactly 1 character between consecutive lines.
  const lineOffsets: number[] = new Array(rawLines.length);
  {
    let cur = 0;
    for (let k = 0; k < rawLines.length; k++) {
      lineOffsets[k] = cur;
      cur += rawLines[k]!.length + 1; // +1 for the '\n' that was split away
    }
  }

  const lineEndOffset = (k: number): number =>
    lineOffsets[k]! + rawLines[k]!.length;

  /** Whether the text read now is an exercise's own (#1225): its nearest
   *  exercise-family container is the exercise, not a solution or hint. */
  const inExerciseText = (): boolean => {
    for (let k = containerStack.length - 1; k >= 0; k--) {
      const name = containerStack[k]!.name;
      if (name === 'exercise') return true;
      if (name === 'solution' || name === 'hint') return false;
    }
    return false;
  };

  const {
    inlineRun, breakingRun, parseVerse, containerStack
  } = createVerseParsing({
    markdown, issues, rawLines, lineOffsets, lineEndOffset, inExerciseText, parse
  });

  const {
    popContainer, oneLineDirectiveBefore, openPageAt, scopeSlot, openModule, isPageFenceLine,
    parseFigure, hasClosingFence, displayInterrupts
  } = createContainerParsing({
    blocks, issues, rawLines, lineOffsets, lineEndOffset, inlineRun, containerStack, parse
  });

  const {
    parseCodeFence, parseIndentedCode
  } = createCodeParsing({
    scores, blocks, issues, rawLines, lineOffsets, lineEndOffset, scopeSlot, parse
  });

  const { parseDisplayBlock } = createDisplayBlocks({
    parse, blocks, issues, rawLines, lineOffsets, lineEndOffset, scopeSlot, displayInterrupts
  });
  const { parseFenceLine } = createFenceLines({
    markdown, options, parse, blocks, issues, rawLines, lineOffsets, lineEndOffset, inExerciseText,
    containerStack, parseVerse, inlineRun, openPageAt, popContainer, oneLineDirectiveBefore,
    openModule, scopeSlot, parseFigure
  });
  const { parseHeadingLine } = createHeadingLines({
    markdown, parse, blocks, issues, lineOffsets, lineEndOffset, scopeSlot
  });
  const { parseListOrQuote } = createListLines({
    parse, blocks, rawLines, lineOffsets, lineEndOffset, breakingRun
  });
  const { parseParagraph } = createParagraphLines({
    parse, fences, blocks, rawLines, lineOffsets, lineEndOffset, breakingRun, isPageFenceLine,
    hasClosingFence
  });

  while (parse.i < rawLines.length) {
    const lineScan = {} as LineScan;
    const line = rawLines[parse.i]!;
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed === '') {
      parse.i++;
      continue;
    }

    // A code block (#624): a ``` or ~~~ fence, everything up to its
    // closing fence kept as written.
    const fenceOpen = fences ? codeFenceOpen(line) : undefined;
    if (fenceOpen) {
      parse.i = parseCodeFence(parse.i, fenceOpen);
      continue;
    }
    // Indented code, when the reading asks for it: four columns in, after
    // a blank line (or at the start), and not a list item under a list.
    if (
      indentedCode
      && (parse.i === 0 || rawLines[parse.i - 1]!.trim() === '')
      && indentedCodeCut(line) >= 0
      && !(blocks[blocks.length - 1]?.type === 'listItem' && (TASK_ITEM_RE.test(line) || ORDERED_LIST_ITEM_RE.test(line) || LIST_ITEM_RE.test(line)))
    ) {
      parse.i = parseIndentedCode(parse.i);
      continue;
    }

    lineScan.line = line;
    lineScan.trimmed = trimmed;
    if (parseDisplayBlock(lineScan) === 'continue') continue;

    if (parseFenceLine(lineScan) === 'continue') continue;

    if (parseHeadingLine(lineScan) === 'continue') continue;

    if (parseListOrQuote(lineScan) === 'continue') continue;

    parseParagraph();
  }

  // EOF with containers still open: auto-close innermost-first with
  // zero-length end markers at the end of input, and report each one so the
  // sandbox can point at the fence that never got its `:::`.
  while (containerStack.length > 0) popContainer(markdown.length, markdown.length, true);

  return { blocks, issues };
}
