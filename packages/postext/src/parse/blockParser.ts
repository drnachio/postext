/**
 * Block-level markdown tokenizer. Splits the source into `ContentBlock`s
 * (headings, paragraphs, blockquotes, list items, math display blocks) and
 * attaches per-character `sourceMap` arrays so higher layers can map cursor
 * positions back into the original markdown.
 */

import type { ContentBlock, ListKind, ParseIssue } from './types';
import { extractInlineMath, fixMathSourceMap, injectMathSpans } from './inlineMath';
import { parseInlineFormatting, stripInlineFormatting } from './inlineFormatting';
import { buildBlockMapping } from './sourceMapping';

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const TASK_ITEM_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/;
const ORDERED_LIST_ITEM_RE = /^(\s*)(\d+)([.)])\s+(.*)$/;
const LIST_ITEM_RE = /^(\s*)([-*+])\s+(.*)$/;

/** One-line `$$ ... $$` display math (the whole line is the formula). */
const BLOCK_MATH_SINGLE_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;
/** Standalone `$$` marker (opening or closing a multi-line display block). */
const BLOCK_MATH_FENCE_RE = /^\s*\$\$\s*$/;

// Single-slot memo used by parseMarkdownMemo. The returned array and its
// ContentBlocks are treated as read-only by the rest of the pipeline.
let _parseMemoInput: string | null = null;
let _parseMemoResult: { blocks: ContentBlock[]; issues: ParseIssue[] } | null = null;

/**
 * Memoized wrapper around parseMarkdown: returns the cached result when the
 * input string is byte-for-byte identical to the previous call. This avoids
 * reparsing the whole document on each keystroke when upstream recomputes
 * only because a sibling state changed.
 */
export function parseMarkdownMemo(markdown: string): ContentBlock[] {
  if (_parseMemoResult !== null && _parseMemoInput === markdown) {
    return _parseMemoResult.blocks;
  }
  const result = parseMarkdownWithIssues(markdown);
  _parseMemoInput = markdown;
  _parseMemoResult = result;
  return result.blocks;
}

export function parseMarkdownWithIssuesMemo(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  if (_parseMemoResult !== null && _parseMemoInput === markdown) {
    return _parseMemoResult;
  }
  const result = parseMarkdownWithIssues(markdown);
  _parseMemoInput = markdown;
  _parseMemoResult = result;
  return result;
}

export function parseMarkdown(markdown: string): ContentBlock[] {
  return parseMarkdownWithIssues(markdown).blocks;
}

/**
 * Merge consecutive blockquote lines into a single block, and consecutive
 * non-blank, non-special lines into paragraphs.
 */
export function parseMarkdownWithIssues(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
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
      if (closed) i++; // consume the closing fence
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const headingRawContent = headingMatch[2]!;
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      // Absolute offset of the first content char (after the `# `).
      const prefixLen = line.indexOf(headingRawContent);
      const contentAbsStart = srcStart + (prefixLen >= 0 ? prefixLen : 0);
      const { cleaned, maths, issues: mathIssues } = extractInlineMath(
        headingRawContent,
        null,
        contentAbsStart,
        srcEnd,
      );
      issues.push(...mathIssues);
      const rawText = stripInlineFormatting(cleaned);
      const rawSpans = injectMathSpans(
        [{ text: rawText, bold: false, italic: false }],
        maths,
      );
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
      blocks.push({
        type: 'heading',
        text: mapping.text,
        spans: mapping.spans.length > 0 ? mapping.spans : [{ text: '', bold: false, italic: false }],
        level: headingMatch[1]!.length,
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
      while (i < rawLines.length) {
        const curRaw = rawLines[i]!;
        const taskMatch = curRaw.match(TASK_ITEM_RE);
        const orderedMatch = !taskMatch ? curRaw.match(ORDERED_LIST_ITEM_RE) : null;
        const unorderedMatch = !taskMatch && !orderedMatch ? curRaw.match(LIST_ITEM_RE) : null;
        const anyMatch = taskMatch ?? orderedMatch ?? unorderedMatch;
        if (anyMatch) {
          const leading = anyMatch[1]!.length;
          const depth = Math.max(1, Math.min(5, Math.floor(leading / 2) + 1));
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
            startNumber = parseInt(orderedMatch[2]!, 10);
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
          const mathExtract = extractInlineMath(itemText, null, itemSrcStart, srcEnd);
          issues.push(...mathExtract.issues);
          const rawSpans = injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths);
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
      const mathExtract = extractInlineMath(quoteLines.join(' '), null, srcStart, srcEnd);
      issues.push(...mathExtract.issues);
      const rawSpans = injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths);
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
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

    // Paragraph — collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    const startIdx = i;
    let lastIdx = i;
    while (i < rawLines.length) {
      const rawLine = rawLines[i]!;
      const pl = rawLine.trim();
      if (pl === '' || pl.match(HEADING_RE) || pl.startsWith('>') || rawLine.match(LIST_ITEM_RE)) break;
      paraLines.push(pl);
      lastIdx = i;
      i++;
    }
    if (paraLines.length > 0) {
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = lineEndOffset(lastIdx);
      const mathExtract = extractInlineMath(paraLines.join(' '), null, srcStart, srcEnd);
      issues.push(...mathExtract.issues);
      const rawSpans = injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths);
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
      blocks.push({
        type: 'paragraph',
        text: mapping.text,
        spans: mapping.spans,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
    }
  }

  return { blocks, issues };
}
