/**
 * Block-level markdown tokenizer. Splits the source into `ContentBlock`s
 * (headings, paragraphs, blockquotes, list items, math display blocks) and
 * attaches per-character `sourceMap` arrays so higher layers can map cursor
 * positions back into the original markdown.
 */

import type { ContainerName, ContentBlock, DirectiveAttrs, DirectiveName, ListKind, ParseIssue } from './types';
import { parseAttrBlobStrict, parseDirectiveAttrs } from './attrs';
import { extractInlineMath, fixMathSourceMap, injectMathSpans } from './inlineMath';
import { BREAK_PLACEHOLDER, TITLE_BREAK_RE, extractInlineChips, extractInlineFootnotes, extractInlineRefs, injectFootnoteSpans, extractInlineSwatches, injectChipSpans, injectRefSpans, injectSwatchSpans, parseInlineFormatting, protectCodeSpans, titleBreakIndices, trimSpans } from './inlineFormatting';
import { buildBlockMapping } from './sourceMapping';
import { extractInlineCitations, injectCitationSpans } from './citations';
import { attachIndexMarks, extractIndexMarks, remapParseOffsets } from './indexMarks';
import { joinEastAsianLines } from './softBreaks';
import { asciiDigits } from '../arabicNumerals';
import { indentColumn, listDepth, nestListItem } from './listNesting';

export { parseDirectiveAttrs, spaceDirectiveLines, MAX_SPACE_LINES } from './attrs';

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
/** `:::name` or `:::name{attrs}` on its own line. Shared by single-line
 *  directives and container opening fences. */
const DIRECTIVE_RE = /^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$/;
/** A bare `:::` line: closes the innermost open container. */
const CONTAINER_CLOSE_RE = /^:::\s*$/;
/** Set of directive names recognized today. Unknown names fall through to
 *  paragraph-parsing and downstream warnings flag them. */
export const KNOWN_DIRECTIVES: ReadonlySet<DirectiveName> = new Set(['pagebreak', 'numbering', 'columnbreak', 'space', 'toc', 'index', 'bibliography', 'references', 'verse']);
/** Trailing `{key="value" …}` attribute block on a heading line, e.g.
 *  `# Title {author="I. Zango"}`. The braces must be balanced (no nested
 *  braces) and be the last thing on the line, after a space — or right
 *  after a Chinese or Japanese character, since those titles are written
 *  without one (`# 回目{style="x"}`, #181). The block is taken only when
 *  the attribute grammar reads all of it (see `headingAttrTokens`);
 *  anything else is left in the heading text verbatim. */
const HEADING_ATTRS_RE = /(?:\s+|(?<=[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\u3000-\u303F\uFF00-\uFFEF]))\{([^{}]*)\}\s*$/u;

/** The attributes of a heading's trailing `{…}` block, or `undefined` when
 *  the braces stay in the title: the grammar must read the whole blob
 *  (`{x, y}` and `{紅樓|hóng lóu}` stay text), and it must set a value —
 *  flags alone count only after a space (`# Title {draft}`), not glued to
 *  the title (`# 第一回{draft}` stays text). A key written outside ASCII
 *  (`作者=曹雪芹`) is read, so the block still leaves the title and its
 *  other keys apply, and then dropped (`attributeKeyInvalid`). */
function headingAttrTokens(blob: string, spaced: boolean): ReturnType<typeof parseAttrBlobStrict> {
  const tokens = parseAttrBlobStrict(blob);
  if (!tokens || tokens.length === 0) return undefined;
  if (!spaced && tokens.every((t) => t.flag)) return undefined;
  return tokens;
}
/** Set of fenced-container names recognized today. A `:::name` line whose
 *  name is a known container opens a block that runs until a bare `:::`. */
export const KNOWN_CONTAINERS: ReadonlySet<ContainerName> = new Set(['callout', 'paragraphs', 'part', 'columns', 'paper']);

/** True for lines that end a paragraph run even without a blank line: any
 *  `:::name` directive/container fence and the bare `:::` closing fence. */
function isFenceLine(trimmed: string): boolean {
  return DIRECTIVE_RE.test(trimmed) || CONTAINER_CLOSE_RE.test(trimmed);
}
/** A footnote definition: `[^id]:` opening a paragraph. */
const FOOTNOTE_DEF_RE = /^\[\^([\p{L}\p{N}_.:-]+)\]:[ \t]*/u;
const TASK_ITEM_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/;
/** An ordered list item: its number in European, Arabic-Indic (١.) or
 *  Persian (۱.) digits — what an Arabic or Persian keyboard types — then
 *  `.` or `)`. */
const ORDERED_LIST_ITEM_RE = /^(\s*)([0-9]+|[\u0660-\u0669]+|[\u06f0-\u06f9]+)([.)])\s+(.*)$/;
const LIST_ITEM_RE = /^(\s*)([-*+])\s+(.*)$/;

/** One-line `$$ ... $$` display math (the whole line is the formula). */
const BLOCK_MATH_SINGLE_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;
/** Standalone `$$` marker (opening or closing a multi-line display block). */
const BLOCK_MATH_FENCE_RE = /^\s*\$\$\s*$/;
/** A one-line display that may interrupt a paragraph: one formula, with no
 *  `$$` inside it (`$$a$$ and $$b$$` is a line of text, not a display). */
const INTERRUPTING_MATH_SINGLE_RE = /^\s*\$\$((?:(?!\$\$)[\s\S])+)\$\$\s*$/;

/** `::resource{id="..."}` block embed on its own line. Malformed variants
 *  (missing/empty id, extra attrs) fall through to paragraph parsing. */
const RESOURCE_DIRECTIVE_RE = /^::resource\s*\{id="([^"]+)"\}\s*$/;

// Small LRU memo used by parseMarkdownMemo, keyed by the input string. The
// returned array and its ContentBlocks are treated as read-only by the rest
// of the pipeline. A few slots (not one) because a book is counted chapter
// by chapter — continuation, outline, warnings and the layout itself each
// parse the same few chapters in turn, and a single slot thrashed between
// them.
const PARSE_MEMO_SLOTS = 8;
const _parseMemo = new Map<string, { blocks: ContentBlock[]; issues: ParseIssue[] }>();

function parseMemoLookup(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  const hit = _parseMemo.get(markdown);
  if (hit) {
    // Refresh recency: a Map iterates in insertion order.
    _parseMemo.delete(markdown);
    _parseMemo.set(markdown, hit);
    return hit;
  }
  const result = parseMarkdownWithIssues(markdown);
  _parseMemo.set(markdown, result);
  if (_parseMemo.size > PARSE_MEMO_SLOTS) {
    const oldest = _parseMemo.keys().next().value;
    if (oldest !== undefined) _parseMemo.delete(oldest);
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
export function parseMarkdownMemo(markdown: string): ContentBlock[] {
  return parseMemoLookup(markdown).blocks;
}

export function parseMarkdownWithIssuesMemo(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  return parseMemoLookup(markdown);
}

export function parseMarkdown(markdown: string): ContentBlock[] {
  return parseMarkdownWithIssues(markdown).blocks;
}

/**
 * Merge consecutive blockquote lines into a single block, and consecutive
 * non-blank, non-special lines into paragraphs. Index marks (`:index…`)
 * are taken out first and attached to the blocks holding them
 * (`ContentBlock.indexMarks`); every source offset still points into
 * `markdown`.
 */
export function parseMarkdownWithIssues(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  const marks = extractIndexMarks(markdown);
  if (!marks) return attachDirections(attachContainerAnchors(parseBlocks(markdown)));
  const result = parseBlocks(marks.text);
  attachIndexMarks(result.blocks, marks.marks);
  remapParseOffsets(result, marks.toOriginal);
  return attachDirections(attachContainerAnchors(result));
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
    if (inheritedLang) b.lang = inheritedLang;
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

/** A multi-line block's mapping with its maths placeholders aligned and
 *  the spaces that joined two lines between East Asian characters taken
 *  out (CSS Text 3 §4.1.3, see `softBreaks.ts`). */
function joinedLines(
  markdown: string,
  mapping: { text: string; spans: ContentBlock['spans']; sourceMap: number[] },
): { text: string; spans: ContentBlock['spans']; sourceMap: number[] } {
  fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
  return joinEastAsianLines(markdown, mapping.text, mapping.spans, mapping.sourceMap) ?? mapping;
}

function parseBlocks(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
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

  /** The spans, plain text and source map of a run of inline Markdown
   *  (`raw`, whose source runs from `srcStart` to `srcEnd`): chips,
   *  footnote markers, references, citations, swatches, maths and the
   *  inline formatting, as a paragraph's text is read. */
  const inlineRun = (raw: string, srcStart: number, srcEnd: number): { text: string; spans: ContentBlock['spans']; sourceMap: number[] } => {
    const chipExtract = extractInlineChips(protectCodeSpans(raw), srcStart);
    const fnExtract = extractInlineFootnotes(chipExtract.cleaned, srcStart);
    const refExtract = extractInlineRefs(fnExtract.cleaned, srcStart);
    const citeExtract = extractInlineCitations(refExtract.cleaned, srcStart);
    const swExtract = extractInlineSwatches(citeExtract.cleaned, srcStart);
    const mathExtract = extractInlineMath(swExtract.cleaned, null, srcStart, srcEnd);
    issues.push(...mathExtract.issues);
    const rawSpans = injectChipSpans(injectFootnoteSpans(injectRefSpans(injectCitationSpans(injectSwatchSpans(
      injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths), swExtract.swatches), citeExtract.citations),
      refExtract.refs,
    ), fnExtract.markers), chipExtract.chips);
    return joinedLines(markdown, buildBlockMapping(markdown, srcStart, srcEnd, rawSpans));
  };

  /**
   * A `:::verse` poem whose fence is line `start` (#378): every non-blank
   * line up to the closing `:::` is a bayt, its two hemistichs split at the
   * first `||` (or a `\\` with a space on each side, the Wikisource
   * markup); a line without one is a single hemistich. The poem is one
   * paragraph block (`ContentBlock.verse`) whose text joins the
   * hemistichs with a tab and the bayts with a line feed; each hemistich
   * is read as inline Markdown on its own, and the tab maps to the
   * separator in the source, the line feed to the line's end. An unclosed
   * poem runs to the end of the text. A poem with no line is dropped.
   */
  const parseVerse = (start: number, attrsRaw: string): { block?: ContentBlock; next: number } => {
    let k = start + 1;
    let text = '';
    const spans: ContentBlock['spans'] = [];
    const sourceMap: number[] = [];
    const sep = (ch: string, at: number) => {
      text += ch;
      spans.push({ text: ch, bold: false, italic: false });
      sourceMap.push(at);
    };
    const hemistich = (from: number, to: number) => {
      const raw = markdown.slice(from, to);
      const lead = raw.length - raw.trimStart().length;
      const body = raw.trim();
      if (body === '') return;
      const run = inlineRun(body, from + lead, from + lead + body.length);
      text += run.text;
      spans.push(...run.spans);
      sourceMap.push(...run.sourceMap);
    };
    let lastLine = start;
    for (; k < rawLines.length; k++) {
      const raw = rawLines[k]!;
      if (CONTAINER_CLOSE_RE.test(raw.trim())) break;
      if (raw.trim() === '') continue;
      if (text !== '') sep('\n', lineOffsets[k]! - 1);
      const lineStart = lineOffsets[k]!;
      const bar = raw.indexOf('||');
      const wiki = bar < 0 ? /\s\\\\\s/.exec(raw) : null;
      const cut = bar >= 0 ? bar : wiki ? wiki.index + 1 : -1;
      if (cut >= 0) {
        hemistich(lineStart, lineStart + cut);
        sep('\t', lineStart + cut);
        hemistich(lineStart + cut + 2, lineStart + raw.length);
      } else {
        hemistich(lineStart, lineStart + raw.length);
      }
      lastLine = k;
    }
    const closed = k < rawLines.length;
    const next = closed ? k + 1 : k;
    if (text === '') return { next };
    const attrs = parseDirectiveAttrs(attrsRaw);
    return {
      block: {
        type: 'paragraph',
        text,
        spans,
        verse: { attrs },
        sourceStart: lineOffsets[start]!,
        sourceEnd: closed ? lineEndOffset(k) : lineEndOffset(lastLine),
        sourceMap,
      },
      next,
    };
  };

  // Open fenced containers, innermost last. Each entry remembers what it
  // needs to emit the matching `containerEnd` (or an `unclosedContainer`
  // issue pointing at the opening line when EOF arrives first).
  const containerStack: { id: number; name: ContainerName; sourceStart: number; sourceEnd: number }[] = [];
  let nextContainerId = 1;

  /** Index of the last source line of the latest display formula that
   *  interrupted a paragraph: a paragraph that starts on the next line
   *  continues the one the formula interrupted (see
   *  `ContentBlock.continuesParagraph`). A display set off from the text
   *  above it by a blank line (or following a list, a quotation, a heading)
   *  interrupts nothing, and the text under it is a new paragraph, as it
   *  was up to postext 1.4. */
  let lastDisplayEnd = -2;
  /** Index of the display line that ended the latest paragraph run. */
  let interruptingDisplayAt = -1;
  /** Whether a `$$` fence line at index `k` has a closing fence after it
   *  before the next blank line, so it can open a display inside a
   *  paragraph (a stray `$$` stays text, as it was up to postext 1.4). */
  const hasClosingFence = (k: number): boolean => {
    for (let j = k + 1; j < rawLines.length; j++) {
      const l = rawLines[j]!;
      if (l.trim() === '') return false;
      if (BLOCK_MATH_FENCE_RE.test(l)) return true;
    }
    return false;
  };
  /** Whether the display starting at line `k` belongs to a paragraph: it
   *  ended a paragraph run, or it follows such a display directly. */
  const displayInterrupts = (k: number): boolean => k === interruptingDisplayAt || k === lastDisplayEnd + 1;

  /** Marker columns of the list items open at the latest list item,
   *  outermost first (see `listNesting.ts`). A list continues across blank
   *  lines (the pipeline numbers adjacent items as one list); any other
   *  block closes it. */
  let openListItems: readonly number[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i]!;
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // Display math — single-line `$$ ... $$`
    const singleMath = line.match(BLOCK_MATH_SINGLE_RE);
    if (singleMath) {
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      blocks.push({
        type: 'mathDisplay',
        text: '',
        spans: [],
        tex: singleMath[1]!,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      if (displayInterrupts(i)) lastDisplayEnd = i;
      i++;
      continue;
    }

    // Display math — multi-line `$$` ... `$$` (opening fence on its own line).
    if (BLOCK_MATH_FENCE_RE.test(line)) {
      const startIdx = i;
      i++;
      const texLines: string[] = [];
      let closed = false;
      while (i < rawLines.length) {
        if (BLOCK_MATH_FENCE_RE.test(rawLines[i]!)) {
          closed = true;
          break;
        }
        texLines.push(rawLines[i]!);
        i++;
      }
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = closed ? lineEndOffset(i) : lineEndOffset(i - 1);
      if (!closed) {
        issues.push({
          kind: 'unclosedMathBlock',
          delimiter: '$$',
          sourceStart: srcStart,
          sourceEnd: srcEnd,
          tex: texLines.join('\n'),
        });
      }
      blocks.push({
        type: 'mathDisplay',
        text: '',
        spans: [],
        tex: texLines.join('\n'),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      if (displayInterrupts(startIdx)) lastDisplayEnd = closed ? i : i - 1;
      if (closed) i++; // consume the closing fence
      continue;
    }

    // Resource embed — `::resource{id="..."}` on its own line. Emits a block
    // carrying only the resource id; rendering/numbering happen downstream.
    // Malformed variants fall through to paragraph parsing.
    const resourceMatch = trimmed.match(RESOURCE_DIRECTIVE_RE);
    if (resourceMatch) {
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      blocks.push({
        type: 'resourceBlock',
        text: '',
        spans: [],
        resourceId: resourceMatch[1]!,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      i++;
      continue;
    }

    // Container closing fence — a bare `:::` while a container is open pops
    // it and emits the matching `containerEnd` marker. With nothing open the
    // line is not special and falls through to paragraph parsing so the
    // stray fence stays visible instead of vanishing silently.
    if (containerStack.length > 0 && CONTAINER_CLOSE_RE.test(trimmed)) {
      const open = containerStack.pop()!;
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      blocks.push({
        type: 'containerEnd',
        text: '',
        spans: [],
        containerName: open.name,
        containerId: open.id,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      i++;
      continue;
    }

    // Reference data (#268): `:::references{format=bibtex}` … `:::`. The
    // body is kept as written (BibTeX braces, YAML indentation) and never
    // set; an unclosed block runs to the end of the text.
    const refsMatch = trimmed.match(DIRECTIVE_RE);
    if (refsMatch && refsMatch[1] === 'references') {
      const startIdx = i;
      const body: string[] = [];
      i++;
      while (i < rawLines.length && !CONTAINER_CLOSE_RE.test(rawLines[i]!.trim())) body.push(rawLines[i++]!);
      const closed = i < rawLines.length;
      const srcEnd = closed ? lineEndOffset(i) : lineEndOffset(rawLines.length - 1);
      blocks.push({
        type: 'directive',
        text: '',
        spans: [],
        directiveName: 'references',
        directiveAttrs: parseDirectiveAttrs(refsMatch[2] ?? ''),
        rawBody: body.join('\n'),
        sourceStart: lineOffsets[startIdx]!,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      if (closed) i++;
      continue;
    }

    // A poem (#378): `:::verse{attrs}` … `:::`, one bayt a line.
    if (refsMatch && refsMatch[1] === 'verse') {
      const verse = parseVerse(i, refsMatch[2] ?? '');
      if (verse.block) blocks.push(verse.block);
      i = verse.next;
      continue;
    }

    // Container opening fence — `:::name` / `:::name{attrs}` whose name is a
    // known container. Emits a `containerStart` marker; the blocks that
    // follow are parsed as usual until the matching closing fence.
    const directiveMatch = trimmed.match(DIRECTIVE_RE);
    if (directiveMatch && KNOWN_CONTAINERS.has(directiveMatch[1] as ContainerName)) {
      const name = directiveMatch[1] as ContainerName;
      const attrsRaw = directiveMatch[2] ?? '';
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      const id = nextContainerId++;
      containerStack.push({ id, name, sourceStart: srcStart, sourceEnd: srcEnd });
      blocks.push({
        type: 'containerStart',
        text: '',
        spans: [],
        containerName: name,
        containerAttrs: parseDirectiveAttrs(attrsRaw),
        containerId: id,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      i++;
      continue;
    }

    // Directive — `:::name` or `:::name{attrs}` on its own line. Only known
    // directive names are promoted to a `directive` block; unknown names
    // fall through to paragraph parsing so they remain visible in the
    // output (and downstream warnings surface the typo).
    if (directiveMatch && KNOWN_DIRECTIVES.has(directiveMatch[1] as DirectiveName)) {
      const name = directiveMatch[1] as DirectiveName;
      const attrsRaw = directiveMatch[2] ?? '';
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      blocks.push({
        type: 'directive',
        text: '',
        spans: [],
        directiveName: name,
        directiveAttrs: parseDirectiveAttrs(attrsRaw),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      let headingRawContent = headingMatch[2]!;
      const srcStart = lineOffsets[i]!;
      let srcEnd = lineEndOffset(i);
      // Absolute offset of the first content char (after the `# `).
      const prefixLen = line.indexOf(headingRawContent);
      const contentAbsStart = srcStart + (prefixLen >= 0 ? prefixLen : 0);
      // Trailing `{key="value" …}` heading attributes. Stripped from the
      // heading text before inline processing, and the block's source range
      // is shortened to the visible content so `sourceMap` stays aligned
      // (the map is a greedy plain-char → source walk bounded by `srcEnd`).
      let attrs: ReturnType<typeof parseDirectiveAttrs> | undefined;
      let attrSources: Record<string, { start: number; end: number }> | undefined;
      const attrsMatch = headingRawContent.match(HEADING_ATTRS_RE);
      const tokens = attrsMatch && attrsMatch.index !== undefined
        ? headingAttrTokens(attrsMatch[1]!, attrsMatch[0][0] !== '{')
        : undefined;
      if (attrsMatch && attrsMatch.index !== undefined && tokens) {
        const read = tokens.filter((t) => !t.invalidKey);
        if (read.length > 0) attrs = Object.fromEntries(read.map((t) => [t.key, t.value]));
        // Where each quoted value sits in the source (for `{attr.<key>}`).
        const attrsAbsStart = contentAbsStart + attrsMatch.index + attrsMatch[0].indexOf('{') + 1;
        for (const t of read) {
          if (!t.quoted || t.valueStart === undefined || t.valueEnd === undefined) continue;
          attrSources ??= {};
          attrSources[t.key] = { start: attrsAbsStart + t.valueStart, end: attrsAbsStart + t.valueEnd };
        }
        headingRawContent = headingRawContent.slice(0, attrsMatch.index);
        srcEnd = contentAbsStart + headingRawContent.length;
      }
      // `\\` marks a forced line break in the title (see BREAK_PLACEHOLDER).
      headingRawContent = headingRawContent.replace(TITLE_BREAK_RE, BREAK_PLACEHOLDER);
      // Inline pre-passes run refs -> math -> formatting so a ref's `text="…"`
      // attribute is shielded from the later math/formatting scanners.
      const refExtract = extractInlineRefs(protectCodeSpans(headingRawContent), contentAbsStart);
      const swExtract = extractInlineSwatches(refExtract.cleaned, contentAbsStart);
      const { cleaned, maths, issues: mathIssues } = extractInlineMath(
        swExtract.cleaned,
        null,
        contentAbsStart,
        srcEnd,
      );
      issues.push(...mathIssues);
      // Inline marks become runs, as in a paragraph (EF-122); the text is
      // the title with its markers dropped, trimmed. A configuration with
      // `headings.inlineMarks: false` sets them plain again
      // (`plainHeadingBlocks`).
      const rawSpans = injectRefSpans(injectSwatchSpans(
        injectMathSpans(trimSpans(parseInlineFormatting(cleaned)), maths), swExtract.swatches),
        refExtract.refs,
      );
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
      const titleBreaks = titleBreakIndices(mapping.text);
      blocks.push({
        type: 'heading',
        text: mapping.text,
        spans: mapping.spans.length > 0 ? mapping.spans : [{ text: '', bold: false, italic: false }],
        level: headingMatch[1]!.length,
        ...(attrs ? { attrs } : {}),
        ...(attrSources ? { attrSources } : {}),
        ...(titleBreaks.length > 0 ? { titleBreaks } : {}),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
      i++;
      continue;
    }

    // List items — unordered (`-`, `*`, `+`), ordered (`1.`, `1)`) and
    // GFM task (`- [ ]`, `- [x]`). Consume consecutive list lines of any kind
    // (nesting and mixed kinds are allowed); the pipeline segments ordered
    // runs by kind and depth for numbering.
    const isListStart =
      TASK_ITEM_RE.test(line) || ORDERED_LIST_ITEM_RE.test(line) || LIST_ITEM_RE.test(line);
    if (isListStart) {
      if (blocks[blocks.length - 1]?.type !== 'listItem') openListItems = [];
      while (i < rawLines.length) {
        const curRaw = rawLines[i]!;
        const taskMatch = curRaw.match(TASK_ITEM_RE);
        const orderedMatch = !taskMatch ? curRaw.match(ORDERED_LIST_ITEM_RE) : null;
        const unorderedMatch = !taskMatch && !orderedMatch ? curRaw.match(LIST_ITEM_RE) : null;
        const anyMatch = taskMatch ?? orderedMatch ?? unorderedMatch;
        if (anyMatch) {
          const leading = anyMatch[1]!.length;
          // Depth from the items this one is indented past (#465), not
          // from a count of spaces.
          openListItems = nestListItem(openListItems, indentColumn(anyMatch[1]!));
          const depth = listDepth(openListItems);
          const srcStart = lineOffsets[i]!;
          const srcEnd = lineEndOffset(i);

          let listKind: ListKind;
          let itemText: string;
          let markerLength: number;
          let startNumber: number | undefined;
          let checked: boolean | undefined;

          if (taskMatch) {
            listKind = 'task';
            checked = taskMatch[3] !== ' ';
            itemText = taskMatch[4]!;
            // leading spaces + bullet (1) + space (1) + `[x]` (3) + space (1)
            markerLength = taskMatch[2]!.length + 1 + 3 + 1;
          } else if (orderedMatch) {
            listKind = 'ordered';
            startNumber = parseInt(asciiDigits(orderedMatch[2]!), 10);
            itemText = orderedMatch[4]!;
            // number digits + separator (1) + space (1)
            markerLength = orderedMatch[2]!.length + 1 + 1;
          } else {
            listKind = 'unordered';
            itemText = unorderedMatch![3]!;
            markerLength = unorderedMatch![2]!.length + 1;
          }

          const contentOffset = leading + markerLength;
          const itemSrcStart = srcStart + contentOffset;
          const chipExtract = extractInlineChips(protectCodeSpans(itemText), itemSrcStart);
          const fnExtract = extractInlineFootnotes(chipExtract.cleaned, itemSrcStart);
          const refExtract = extractInlineRefs(fnExtract.cleaned, itemSrcStart);
          const citeExtract = extractInlineCitations(refExtract.cleaned, itemSrcStart);
          const swExtract = extractInlineSwatches(citeExtract.cleaned, itemSrcStart);
          const mathExtract = extractInlineMath(swExtract.cleaned, null, itemSrcStart, srcEnd);
          issues.push(...mathExtract.issues);
          const rawSpans = injectChipSpans(injectFootnoteSpans(injectRefSpans(injectCitationSpans(injectSwatchSpans(
            injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths), swExtract.swatches), citeExtract.citations),
            refExtract.refs,
          ), fnExtract.markers), chipExtract.chips);
          const mapping = buildBlockMapping(markdown, itemSrcStart, srcEnd, rawSpans);
          fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
          const block: ContentBlock = {
            type: 'listItem',
            text: mapping.text,
            spans: mapping.spans.length > 0 ? mapping.spans : [{ text: '', bold: false, italic: false }],
            depth,
            listKind,
            sourceStart: srcStart,
            sourceEnd: srcEnd,
            sourceMap: mapping.sourceMap,
          };
          if (startNumber !== undefined) block.startNumber = startNumber;
          if (checked !== undefined) block.checked = checked;
          blocks.push(block);
          i++;
          continue;
        }
        // Blank line: allow a single blank followed by another list item.
        if (
          curRaw.trim() === '' &&
          i + 1 < rawLines.length &&
          (TASK_ITEM_RE.test(rawLines[i + 1]!) ||
            ORDERED_LIST_ITEM_RE.test(rawLines[i + 1]!) ||
            LIST_ITEM_RE.test(rawLines[i + 1]!))
        ) {
          i++;
          continue;
        }
        break;
      }
      continue;
    }

    // Blockquote — collect consecutive > lines
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      const startIdx = i;
      let lastIdx = i;
      while (i < rawLines.length) {
        const ql = rawLines[i]!.trim();
        if (!ql.startsWith('>')) break;
        quoteLines.push(ql.replace(/^>\s?/, ''));
        lastIdx = i;
        i++;
      }
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = lineEndOffset(lastIdx);
      const chipExtract = extractInlineChips(protectCodeSpans(quoteLines.join(' ')), srcStart);
      const fnExtract = extractInlineFootnotes(chipExtract.cleaned, srcStart);
      const refExtract = extractInlineRefs(fnExtract.cleaned, srcStart);
      const citeExtract = extractInlineCitations(refExtract.cleaned, srcStart);
      const swExtract = extractInlineSwatches(citeExtract.cleaned, srcStart);
      const mathExtract = extractInlineMath(swExtract.cleaned, null, srcStart, srcEnd);
      issues.push(...mathExtract.issues);
      const rawSpans = injectChipSpans(injectFootnoteSpans(injectRefSpans(injectCitationSpans(injectSwatchSpans(
        injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths), swExtract.swatches), citeExtract.citations),
        refExtract.refs,
      ), fnExtract.markers), chipExtract.chips);
      // Lines join with a space, except between Chinese or Japanese
      // characters (#181).
      const mapping = joinedLines(markdown, buildBlockMapping(markdown, srcStart, srcEnd, rawSpans));
      blocks.push({
        type: 'blockquote',
        text: mapping.text,
        spans: mapping.spans,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-special lines. The first
    // line is always taken (it may itself be an unknown `:::name` or a stray
    // `:::` that fell through); after that, any fence line ends the run so a
    // directive or container fence glued under a paragraph is not swallowed.
    const paraLines: string[] = [];
    const startIdx = i;
    let lastIdx = i;
    while (i < rawLines.length) {
      const rawLine = rawLines[i]!;
      const pl = rawLine.trim();
      if (pl === '' || pl.match(HEADING_RE) || pl.startsWith('>') || rawLine.match(LIST_ITEM_RE)) break;
      if (i > startIdx && isFenceLine(pl)) break;
      // A footnote definition opens a paragraph of its own.
      if (i > startIdx && FOOTNOTE_DEF_RE.test(pl)) break;
      // A display formula on its own line interrupts the paragraph, blank
      // line or not: the text before it is a paragraph that leads into it,
      // the text right after it continues that paragraph (EF-85). Only a
      // whole display: one formula on the line, or a `$$` fence closed
      // before the next blank line.
      if (
        i > startIdx
        && (INTERRUPTING_MATH_SINGLE_RE.test(rawLine) || (BLOCK_MATH_FENCE_RE.test(rawLine) && hasClosingFence(i)))
      ) {
        interruptingDisplayAt = i;
        break;
      }
      paraLines.push(pl);
      lastIdx = i;
      i++;
    }
    if (paraLines.length > 0) {
      let srcStart = lineOffsets[startIdx]!;
      // `[^id]: text`: the definition of a footnote. The marker is left out
      // of the text, which starts past it.
      const def = FOOTNOTE_DEF_RE.exec(paraLines[0]!);
      if (def) {
        paraLines[0] = paraLines[0]!.slice(def[0].length);
        srcStart += rawLines[startIdx]!.indexOf(def[0]) + def[0].length;
      }
      const srcEnd = lineEndOffset(lastIdx);
      const mapping = inlineRun(paraLines.join(' '), srcStart, srcEnd);
      blocks.push({
        type: 'paragraph',
        text: mapping.text,
        spans: mapping.spans,
        ...(startIdx === lastDisplayEnd + 1 && !def ? { continuesParagraph: true } : {}),
        ...(def ? { footnoteDef: def[1]! } : {}),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
    }
  }

  // EOF with containers still open: auto-close innermost-first with
  // zero-length end markers at the end of input, and report each one so the
  // sandbox can point at the fence that never got its `:::`.
  while (containerStack.length > 0) {
    const open = containerStack.pop()!;
    blocks.push({
      type: 'containerEnd',
      text: '',
      spans: [],
      containerName: open.name,
      containerId: open.id,
      sourceStart: markdown.length,
      sourceEnd: markdown.length,
      sourceMap: [],
    });
    issues.push({
      kind: 'unclosedContainer',
      delimiter: ':::',
      containerName: open.name,
      containerId: open.id,
      sourceStart: open.sourceStart,
      sourceEnd: open.sourceEnd,
    });
  }

  return { blocks, issues };
}
