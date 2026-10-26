// Paragraphs: the run of lines up to the next blank line or block start.
// Part of parseBlocks (blockParser.ts), split out of its loop in #1276.
import type { ParseState } from './parseState.js';
import type { ContentBlock } from '../types.js';
import { HEADING_RE, LIST_ITEM_RE, isFenceLine, FOOTNOTE_DEF_RE, INTERRUPTING_MATH_SINGLE_RE, BLOCK_MATH_FENCE_RE } from '../blockParser.js';
import { codeFenceOpen } from '../codeFence.js';

/** What createParagraphLines takes from around the loop. */
export interface ParagraphLinesDeps {
  parse: ParseState;
  fences: boolean;
  blocks: ContentBlock[];
  rawLines: string[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  breakingRun: (lines: readonly string[], srcStart: number, srcEnd: number) => ReturnType<(raw: string, srcStart: number, srcEnd: number, hardBreaks?: boolean, report?: boolean, icons?: boolean) => { text: string; spans: ContentBlock["spans"]; sourceMap: number[]; }> & { literalBreaks?: ContentBlock["literalBreaks"]; };
  isPageFenceLine: (pl: string) => boolean;
  hasClosingFence: (k: number) => boolean;
}

export function createParagraphLines(deps: ParagraphLinesDeps) {
  const {
    parse, fences, blocks, rawLines, lineOffsets, lineEndOffset, breakingRun, isPageFenceLine,
    hasClosingFence
  } = deps;
  /** Reads a paragraph. */
  const parseParagraph = (): void => {
    // Paragraph — collect consecutive non-blank, non-special lines. The first
    // line is always taken (it may itself be an unknown `:::name` or a stray
    // `:::` that fell through); after that, any fence line ends the run so a
    // directive or container fence glued under a paragraph is not swallowed.
    const paraLines: string[] = [];
    const startIdx = parse.i;
    let lastIdx = parse.i;
    while (parse.i < rawLines.length) {
      const rawLine = rawLines[parse.i]!;
      const pl = rawLine.trim();
      if (pl === '' || pl.match(HEADING_RE) || pl.startsWith('>') || rawLine.match(LIST_ITEM_RE)) break;
      if (parse.i > startIdx && (isFenceLine(pl) || isPageFenceLine(pl))) break;
      // A code fence interrupts the paragraph (#624).
      if (parse.i > startIdx && fences && codeFenceOpen(rawLine)) break;
      // A footnote definition opens a paragraph of its own.
      if (parse.i > startIdx && FOOTNOTE_DEF_RE.test(pl)) break;
      // A display formula on its own line interrupts the paragraph, blank
      // line or not: the text before it is a paragraph that leads into it,
      // the text right after it continues that paragraph (EF-85). Only a
      // whole display: one formula on the line, or a `$$` fence closed
      // before the next blank line.
      if (
        parse.i > startIdx
        && (INTERRUPTING_MATH_SINGLE_RE.test(rawLine) || (BLOCK_MATH_FENCE_RE.test(rawLine) && hasClosingFence(parse.i)))
      ) {
        parse.interruptingDisplayAt = parse.i;
        break;
      }
      paraLines.push(pl);
      lastIdx = parse.i;
      parse.i++;
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
      const mapping = breakingRun(paraLines, srcStart, srcEnd);
      blocks.push({
        type: 'paragraph',
        text: mapping.text,
        spans: mapping.spans,
        ...(mapping.literalBreaks ? { literalBreaks: mapping.literalBreaks } : {}),
        ...(startIdx === parse.lastDisplayEnd + 1 && !def ? { continuesParagraph: true } : {}),
        ...(def ? { footnoteDef: def[1]! } : {}),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
    }
  };
  return { parseParagraph };
}
