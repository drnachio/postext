// Heading lines: level, attributes, numbering and title breaks.
// Part of parseBlocks (blockParser.ts), split out of its loop in #1276.
import type { LineScan, StepJump } from './lineScan.js';
import type { ParseState } from './parseState.js';
import type { ContentBlock, ParseIssue, BlockSlot } from '../types.js';
import { HEADING_RE, HEADING_ATTRS_RE, headingAttrTokens, withChipSources } from '../blockParser.js';
import { parseDirectiveAttrs } from '../attrs.js';
import { TITLE_BREAK_RE, BREAK_PLACEHOLDER, extractInlineChips, protectCodeSpans, extractInlineRefs, extractInlineSwatches, injectChipSpans, injectRefSpans, injectSwatchSpans, trimSpans, parseInlineFormatting, titleBreakIndices } from '../inlineFormatting.js';
import { extractInlineMath, injectMathSpans, fixMathSourceMap } from '../inlineMath.js';
import { buildBlockMapping } from '../sourceMapping.js';

/** What createHeadingLines takes from around the loop. */
export interface HeadingLinesDeps {
  markdown: string;
  parse: ParseState;
  blocks: ContentBlock[];
  issues: ParseIssue[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  scopeSlot: (slot: BlockSlot | undefined) => BlockSlot | undefined;
}

export function createHeadingLines(deps: HeadingLinesDeps) {
  const {
    markdown, parse, blocks, issues, lineOffsets, lineEndOffset, scopeSlot
  } = deps;
  /** Reads a heading line; `continue` once it is read. */
  const parseHeadingLine = (lineScan: LineScan): StepJump => {
    const {
      line, trimmed
    } = lineScan;
    // Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      let headingRawContent = headingMatch[2]!;
      const srcStart = lineOffsets[parse.i]!;
      let srcEnd = lineEndOffset(parse.i);
      // Absolute offset of the first content char (after the `# `).
      const prefixLen = line.indexOf(headingRawContent);
      const contentAbsStart = srcStart + (prefixLen >= 0 ? prefixLen : 0);
      // Trailing `{key="value" …}` heading attributes. Stripped from the
      // heading text before inline processing, and the block's source range
      // is shortened to the visible content so `sourceMap` stays aligned
      // (the map is a greedy plain-char → source walk bounded by `srcEnd`).
      let attrs: ReturnType<typeof parseDirectiveAttrs> | undefined;
      let attrSources: Record<string, { start: number; end: number }> | undefined;
      let headingSlot: BlockSlot | undefined;
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
        // `# Title {slot="titulo"}` (#854).
        const slotToken = read.filter((t) => t.key === 'slot').pop();
        if (slotToken && slotToken.value.trim() !== '') {
          headingSlot = scopeSlot({
            name: slotToken.value.trim(),
            sourceStart: attrsAbsStart + (slotToken.valueStart ?? slotToken.start),
            sourceEnd: attrsAbsStart + (slotToken.valueEnd ?? slotToken.end),
          });
        }
        headingRawContent = headingRawContent.slice(0, attrsMatch.index);
        srcEnd = contentAbsStart + headingRawContent.length;
      }
      // `\\` marks a forced line break in the title (see BREAK_PLACEHOLDER).
      headingRawContent = headingRawContent.replace(TITLE_BREAK_RE, BREAK_PLACEHOLDER);
      // Inline pre-passes run refs -> math -> formatting so a ref's `text="…"`
      // attribute is shielded from the later math/formatting scanners.
      // Chips run first, as in a paragraph (#1100): their words are shielded
      // from the later passes.
      const chipExtract = extractInlineChips(protectCodeSpans(headingRawContent), contentAbsStart);
      const refExtract = extractInlineRefs(chipExtract.cleaned, contentAbsStart);
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
      const rawSpans = injectChipSpans(injectRefSpans(injectSwatchSpans(
        injectMathSpans(trimSpans(parseInlineFormatting(cleaned)), maths), swExtract.swatches),
        refExtract.refs,
      ), chipExtract.chips);
      const mapping = withChipSources(markdown, buildBlockMapping(markdown, srcStart, srcEnd, rawSpans));
      fixMathSourceMap(markdown, mapping.text, mapping.spans, mapping.sourceMap);
      const titleBreaks = titleBreakIndices(mapping.text);
      blocks.push({
        type: 'heading',
        text: mapping.text,
        spans: mapping.spans.length > 0 ? mapping.spans : [{ text: '', bold: false, italic: false }],
        level: headingMatch[1]!.length,
        ...(attrs ? { attrs } : {}),
        ...(attrSources ? { attrSources } : {}),
        ...(titleBreaks.length > 0 ? { titleBreaks } : {}),
        ...(headingSlot ? { slot: headingSlot } : {}),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
      parse.i++;
      return 'continue';
    }
  };
  return { parseHeadingLine };
}
