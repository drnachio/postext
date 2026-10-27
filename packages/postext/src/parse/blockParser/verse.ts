// Inline runs and verse: the bayts of a classical poem and the lines of a
// :::verse block.
// Part of parseBlocks (blockParser.ts), split out of it in #1276.
import type { ContentBlock, DirectiveAttrs, VerseLineInfo, VerseStanza, ContainerName, ParseIssue } from '../types.js';
import { extractExerciseGaps, injectGapSpans, settleGapPlaceholders } from '../exerciseGaps.js';
import { protectCodeSpans, extractInlineChips, extractInlineFootnotes, extractInlineRefs, extractInlineSwatches, extractInlineTabs, bodyBreakSpans, parseInlineFormatting, replaceBodyBreaks, BODY_BREAK_MARK, injectChipSpans, injectFootnoteSpans, injectRefSpans, injectSwatchSpans, injectTabSpans, BREAK_PLACEHOLDER } from '../inlineFormatting.js';
import { extractInlineCitations, injectCitationSpans } from '../citations.js';
import { extractInlineMath, injectMathSpans } from '../inlineMath.js';
import { withChipSources, joinedLines, CONTAINER_CLOSE_RE, HEMISTICH_WIKI_RE } from '../blockParser.js';
import { buildBlockMapping } from '../sourceMapping.js';
import { parseDirectiveAttrs } from '../attrs.js';
import type { ParseState } from './parseState.js';

/** What createVerseParsing takes from the pass. */
export interface VerseParsingDeps {
  markdown: string;
  issues: ParseIssue[];
  rawLines: string[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  inExerciseText: () => boolean;
  parse: ParseState;
}

export function createVerseParsing(deps: VerseParsingDeps) {
  const {
    markdown, issues, rawLines, lineOffsets, lineEndOffset, inExerciseText, parse
  } = deps;
  /** The spans, plain text and source map of a run of inline Markdown
   *  (`raw`, whose source runs from `srcStart` to `srcEnd`): chips,
   *  footnote markers, references, citations, swatches, maths and the
   *  inline formatting, as a paragraph's text is read. With `hardBreaks`
   *  its forced line breaks (#620) become `BREAK_PLACEHOLDER` (see
   *  `replaceBodyBreaks`; `raw` joins its lines with a line feed after a
   *  line that ends in a backslash). Maths issues are reported once, by
   *  the reading with `report`. With `icons` the inline symbols
   *  (`:icon[…]{…}`, #1058) are read: a figure label's text. */
  const inlineRun = (raw: string, srcStart: number, srcEnd: number, hardBreaks = false, report = true, icons = false): { text: string; spans: ContentBlock['spans']; sourceMap: number[] } => {
    // The answers of an exercise (`[[…]]`, #1225), read first so their
    // words are shielded from the later passes.
    const gapExtract = inExerciseText() ? extractExerciseGaps(protectCodeSpans(raw), srcStart) : undefined;
    if (gapExtract) raw = gapExtract.cleaned;
    const chipExtract = extractInlineChips(protectCodeSpans(raw), srcStart);
    const fnExtract = extractInlineFootnotes(chipExtract.cleaned, srcStart);
    const refExtract = extractInlineRefs(fnExtract.cleaned, srcStart);
    const citeExtract = extractInlineCitations(refExtract.cleaned, srcStart);
    const swExtract = extractInlineSwatches(citeExtract.cleaned, srcStart, { icons });
    const mathExtract = extractInlineMath(swExtract.cleaned, null, srcStart, srcEnd);
    if (report) issues.push(...mathExtract.issues);
    // Tabs (#622): `:tab` and tab characters, outside code and maths.
    const tabExtract = extractInlineTabs(mathExtract.cleaned);
    const formatted = hardBreaks
      ? bodyBreakSpans(parseInlineFormatting(replaceBodyBreaks(tabExtract.cleaned, BODY_BREAK_MARK)))
      : parseInlineFormatting(tabExtract.cleaned);
    const rawSpans = injectChipSpans(injectFootnoteSpans(injectRefSpans(injectCitationSpans(injectSwatchSpans(
      injectMathSpans(injectTabSpans(formatted, tabExtract.tabs), mathExtract.maths), swExtract.swatches), citeExtract.citations),
      refExtract.refs,
    ), fnExtract.markers), chipExtract.chips);
    const spans = gapExtract && gapExtract.gaps.length > 0 ? injectGapSpans(rawSpans, gapExtract.gaps) : rawSpans;
    return settleGapPlaceholders(withChipSources(markdown, joinedLines(markdown, buildBlockMapping(markdown, srcStart, srcEnd, spans))));
  };

  /**
   * A block's lines (trimmed) read as one run of inline Markdown with its
   * forced line breaks (#620): joined with a space, or with a line feed
   * after a line that ends in a backslash, for `replaceBodyBreaks`. When
   * the block has a break, `literalBreaks` is the reading postext 1.22
   * made of it (every line joined with a space, the backslashes printed).
   */
  const breakingRun = (lines: readonly string[], srcStart: number, srcEnd: number): ReturnType<typeof inlineRun> & { literalBreaks?: ContentBlock['literalBreaks'] } => {
    let raw = '';
    lines.forEach((l, k) => {
      if (k > 0) raw += lines[k - 1]!.endsWith('\\') ? '\n' : ' ';
      raw += l;
    });
    if (!raw.includes('\\')) return inlineRun(raw, srcStart, srcEnd);
    const mapping = inlineRun(raw, srcStart, srcEnd, true);
    if (!mapping.text.includes(BREAK_PLACEHOLDER)) return mapping;
    const literal = inlineRun(lines.join(' '), srcStart, srcEnd, false, false);
    return { ...mapping, literalBreaks: { text: literal.text, spans: literal.spans, sourceMap: literal.sourceMap } };
  };

  /** Poems in the line layout read so far (`VerseStanza.poem`). */
  let poemCount = 0;

  /**
   * A `:::verse` poem whose fence is line `start` (#378, #620), up to the
   * closing `:::` (an unclosed poem runs to the end of the text). The fence's
   * `layout` picks how its lines are read: `bayt` (see {@link parseBayts}),
   * `lines` (see {@link parseVerseLines}), or, unset or `auto`, `bayt` when
   * any line carries a hemistich separator (`||`, a spaced `\\`) and
   * `lines` otherwise.
   */
  const parseVerse = (start: number, attrsRaw: string): { blocks: ContentBlock[]; next: number } => {
    const attrs = parseDirectiveAttrs(attrsRaw);
    let end = start + 1;
    while (end < rawLines.length && !CONTAINER_CLOSE_RE.test(rawLines[end]!.trim())) end++;
    const layout = attrs.layout?.trim().toLowerCase();
    const separated = rawLines.slice(start + 1, end).some((raw) => raw.includes('||') || HEMISTICH_WIKI_RE.test(raw));
    if (layout === 'bayt' || (layout !== 'lines' && separated)) return parseBayts(start, end, attrs);
    return parseVerseLines(start, end, attrs, layout !== 'lines');
  };

  /**
   * A poem in the bayt layout (#378): every non-blank line is a bayt, its
   * two hemistichs split at the first `||` (or a `\\` with a space on
   * each side, the Wikisource markup); a line without one is a single
   * hemistich. The poem is one paragraph block (`ContentBlock.verse`) whose
   * text joins the hemistichs with a tab and the bayts with a line feed;
   * each hemistich is read as inline Markdown on its own, and the tab maps
   * to the separator in the source, the line feed to the line's end. A
   * poem with no line is dropped.
   */
  const parseBayts = (start: number, end: number, attrs: DirectiveAttrs): { blocks: ContentBlock[]; next: number } => {
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
    for (let k = start + 1; k < end; k++) {
      const raw = rawLines[k]!;
      if (raw.trim() === '') continue;
      if (text !== '') sep('\n', lineOffsets[k]! - 1);
      const lineStart = lineOffsets[k]!;
      const bar = raw.indexOf('||');
      const wiki = bar < 0 ? HEMISTICH_WIKI_RE.exec(raw) : null;
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
    const closed = end < rawLines.length;
    const next = closed ? end + 1 : end;
    if (text === '') return { blocks: [], next };
    return {
      blocks: [{
        type: 'paragraph',
        text,
        spans,
        verse: { attrs },
        sourceStart: lineOffsets[start]!,
        sourceEnd: closed ? lineEndOffset(end) : lineEndOffset(lastLine),
        sourceMap,
      }],
      next,
    };
  };

  /**
   * A poem in the line layout (#620): every non-blank line is a line of
   * verse, read as inline Markdown on its own; a run of blank lines ends a
   * stanza. Each stanza is a paragraph block (`VerseInfo.stanza`) whose text
   * joins its lines with a line feed, mapped to the source's line end. A
   * line's leading whitespace is its indent (`VerseLineInfo.indent`), kept
   * out of the text; a line written `+ …` is a stepped line. With
   * `keepSpaces` on the fence, a run of two or more spaces inside a line (a
   * caesura) is kept as a fixed space of its width. The first stanza opens
   * on the fence line, the last closes on the closing fence.
   */
  const parseVerseLines = (start: number, end: number, attrs: DirectiveAttrs, auto: boolean): { blocks: ContentBlock[]; next: number } => {
    const closed = end < rawLines.length;
    const next = closed ? end + 1 : end;
    const keepSpaces = attrs.keepSpaces !== undefined && attrs.keepSpaces.trim().toLowerCase() !== 'false';
    // The stanzas, as runs of source line indices.
    const groups: number[][] = [];
    let run: number[] = [];
    for (let k = start + 1; k < end; k++) {
      if (rawLines[k]!.trim() === '') {
        if (run.length > 0) groups.push(run);
        run = [];
      } else {
        run.push(k);
      }
    }
    if (run.length > 0) groups.push(run);
    interface Stanza { text: string; spans: ContentBlock['spans']; sourceMap: number[]; lines: VerseLineInfo[]; from: number; to: number }
    const stanzas: Stanza[] = [];
    for (const rows of groups) {
      const st: Stanza = { text: '', spans: [], sourceMap: [], lines: [], from: rows[0]!, to: rows[0]! };
      for (const k of rows) {
        const raw = rawLines[k]!;
        const lineStart = lineOffsets[k]!;
        let p = 0;
        let indent = 0;
        for (; p < raw.length; p++) {
          const c = raw[p];
          if (c === ' ') indent += 1;
          else if (c === '\t') indent += 4;
          else if (c === '\u3000') indent += 2;
          else break;
        }
        let stepped = false;
        // `\+ …`: a line that opens with a plus sign, not a stepped one.
        if (raw[p] === '\\' && raw[p + 1] === '+') p++;
        else if (raw[p] === '+' && (raw[p + 1] === ' ' || raw[p + 1] === '\t')) {
          stepped = true;
          p++;
          while (raw[p] === ' ' || raw[p] === '\t') p++;
        }
        const bodyEnd = raw.trimEnd().length;
        // The line's pieces of text, and the caesura gaps between them.
        const pieces: { from: number; to: number; gap: boolean }[] = [];
        if (keepSpaces) {
          const gapRe = / {2,}/g;
          let at = p;
          for (let m = gapRe.exec(raw); m && m.index < bodyEnd; m = gapRe.exec(raw)) {
            if (m.index < p) continue;
            if (m.index > at) pieces.push({ from: at, to: m.index, gap: false });
            pieces.push({ from: m.index, to: m.index + m[0].length, gap: true });
            at = m.index + m[0].length;
          }
          if (at < bodyEnd) pieces.push({ from: at, to: bodyEnd, gap: false });
        } else if (p < bodyEnd) {
          pieces.push({ from: p, to: bodyEnd, gap: false });
        }
        let text = '';
        const spans: ContentBlock['spans'] = [];
        const sourceMap: number[] = [];
        for (const piece of pieces) {
          if (piece.gap) {
            if (text === '') continue;
            const width = piece.to - piece.from;
            text += ' '.repeat(width);
            spans.push({ text: ' '.repeat(width), bold: false, italic: false, fixedSpace: true });
            for (let c = piece.from; c < piece.to; c++) sourceMap.push(lineStart + c);
            continue;
          }
          const r = inlineRun(raw.slice(piece.from, piece.to), lineStart + piece.from, lineStart + piece.to);
          text += r.text;
          spans.push(...r.spans);
          sourceMap.push(...r.sourceMap);
        }
        if (text.trim() === '') continue;
        if (st.text !== '') {
          st.text += '\n';
          st.spans.push({ text: '\n', bold: false, italic: false });
          st.sourceMap.push(lineStart - 1);
        }
        st.text += text;
        st.spans.push(...spans);
        st.sourceMap.push(...sourceMap);
        st.lines.push({ indent, ...(stepped ? { stepped: true as const } : {}) });
        st.to = k;
      }
      if (st.lines.length > 0) stanzas.push(st);
    }
    if (stanzas.length === 0) return { blocks: [], next };
    const poem = poemCount++;
    let firstLine = 0;
    const blocks = stanzas.map((st, index): ContentBlock => {
      const last = index === stanzas.length - 1;
      const stanza: VerseStanza = { poem, index, last, firstLine, lines: st.lines, ...(auto ? { auto: true as const } : {}) };
      firstLine += st.lines.length;
      return {
        type: 'paragraph',
        text: st.text,
        spans: st.spans,
        verse: { attrs, stanza },
        sourceStart: index === 0 ? lineOffsets[start]! : lineOffsets[st.from]!,
        sourceEnd: last && closed ? lineEndOffset(end) : lineEndOffset(st.to),
        sourceMap: st.sourceMap,
      };
    });
    return { blocks, next };
  };

  // Open fenced containers, innermost last. Each entry remembers what it
  // needs to emit the matching `containerEnd` (or an `unclosedContainer`
  // issue pointing at the opening line when EOF arrives first).
  // A composed page's entry (#854) records how many colons opened it: only
  // a bare fence of as many closes it, never a bare `:::`.
  const containerStack: { id: number; name: ContainerName; sourceStart: number; sourceEnd: number; colons?: number; slot?: string; module?: string }[] = [];
  /** The open composed page's fence, and what its modules (#1062) took:
   *  the names, and how many of each template. */
  parse.pageFence = undefined;
  parse.moduleNames = new Set<string>();
  parse.moduleCounts = new Map<string, number>();
  parse.nextContainerId = 1;
  /** Composed page fences read so far (`ComposedPageFence.fenceIndex`). */
  parse.pageFences = 0;
  /** Comic fences read so far (`ComicPageSource.fenceIndex`, #885). */
  parse.comicFences = 0;
  return {
    inlineRun, breakingRun, parseVerse, containerStack
  };
}
