// List items and blockquotes.
// Part of parseBlocks (blockParser.ts), split out of its loop in #1276.
import type { LineScan, StepJump } from './lineScan.js';
import type { ParseState } from './parseState.js';
import type { ContentBlock, ListKind } from '../types.js';
import { TASK_ITEM_RE, ORDERED_LIST_ITEM_RE, LIST_ITEM_RE } from '../blockParser.js';
import { nestListItem, indentColumn, listDepth } from '../listNesting.js';
import { asciiDigits } from '../../numerals/arabicNumerals.js';

/** What createListLines takes from around the loop. */
export interface ListLinesDeps {
  parse: ParseState;
  blocks: ContentBlock[];
  rawLines: string[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  breakingRun: (lines: readonly string[], srcStart: number, srcEnd: number) => ReturnType<(raw: string, srcStart: number, srcEnd: number, hardBreaks?: boolean, report?: boolean, icons?: boolean) => { text: string; spans: ContentBlock["spans"]; sourceMap: number[]; }> & { literalBreaks?: ContentBlock["literalBreaks"]; };
}

export function createListLines(deps: ListLinesDeps) {
  const {
    parse, blocks, rawLines, lineOffsets, lineEndOffset, breakingRun
  } = deps;
  /** Reads a list item or a blockquote; `continue` once it is read. */
  const parseListOrQuote = (lineScan: LineScan): StepJump => {
    const {
      line, trimmed
    } = lineScan;
    // List items — unordered (`-`, `*`, `+`), ordered (`1.`, `1)`) and
    // GFM task (`- [ ]`, `- [x]`). Consume consecutive list lines of any kind
    // (nesting and mixed kinds are allowed); the pipeline segments ordered
    // runs by kind and depth for numbering.
    const isListStart =
      TASK_ITEM_RE.test(line) || ORDERED_LIST_ITEM_RE.test(line) || LIST_ITEM_RE.test(line);
    if (isListStart) {
      if (blocks[blocks.length - 1]?.type !== 'listItem') parse.openListItems = [];
      while (parse.i < rawLines.length) {
        const curRaw = rawLines[parse.i]!;
        const taskMatch = curRaw.match(TASK_ITEM_RE);
        const orderedMatch = !taskMatch ? curRaw.match(ORDERED_LIST_ITEM_RE) : null;
        const unorderedMatch = !taskMatch && !orderedMatch ? curRaw.match(LIST_ITEM_RE) : null;
        const anyMatch = taskMatch ?? orderedMatch ?? unorderedMatch;
        if (anyMatch) {
          const leading = anyMatch[1]!.length;
          // Depth from the items this one is indented past (#465), not
          // from a count of spaces.
          parse.openListItems = nestListItem(parse.openListItems, indentColumn(anyMatch[1]!));
          const depth = listDepth(parse.openListItems);
          const srcStart = lineOffsets[parse.i]!;
          const srcEnd = lineEndOffset(parse.i);

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
          // A `\\` in the item is a forced line break (#620).
          const mapping = breakingRun([itemText], itemSrcStart, srcEnd);
          const block: ContentBlock = {
            type: 'listItem',
            text: mapping.text,
            spans: mapping.spans.length > 0 ? mapping.spans : [{ text: '', bold: false, italic: false }],
            ...(mapping.literalBreaks ? { literalBreaks: mapping.literalBreaks } : {}),
            depth,
            listKind,
            sourceStart: srcStart,
            sourceEnd: srcEnd,
            sourceMap: mapping.sourceMap,
          };
          if (startNumber !== undefined) block.startNumber = startNumber;
          if (checked !== undefined) block.checked = checked;
          blocks.push(block);
          parse.i++;
          continue;
        }
        // Blank line: allow a single blank followed by another list item.
        if (
          curRaw.trim() === '' &&
          parse.i + 1 < rawLines.length &&
          (TASK_ITEM_RE.test(rawLines[parse.i + 1]!) ||
            ORDERED_LIST_ITEM_RE.test(rawLines[parse.i + 1]!) ||
            LIST_ITEM_RE.test(rawLines[parse.i + 1]!))
        ) {
          parse.i++;
          continue;
        }
        break;
      }
      return 'continue';
    }

    // Blockquote — collect consecutive > lines
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      const startIdx = parse.i;
      let lastIdx = parse.i;
      while (parse.i < rawLines.length) {
        const ql = rawLines[parse.i]!.trim();
        if (!ql.startsWith('>')) break;
        quoteLines.push(ql.replace(/^>\s?/, ''));
        lastIdx = parse.i;
        parse.i++;
      }
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = lineEndOffset(lastIdx);
      // Lines join with a space, except between Chinese or Japanese
      // characters (#181) and at a forced line break (#620).
      const mapping = breakingRun(quoteLines, srcStart, srcEnd);
      blocks.push({
        type: 'blockquote',
        text: mapping.text,
        spans: mapping.spans,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
        ...(mapping.literalBreaks ? { literalBreaks: mapping.literalBreaks } : {}),
      });
      return 'continue';
    }
  };
  return { parseListOrQuote };
}
