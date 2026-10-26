// Code fences: a listing's block and the fence that opens it.
// Part of parseBlocks (blockParser.ts), split out of it in #1276.
import type { CodeBlockInfo, ContentBlock, ParseIssue, BlockSlot } from '../types.js';
import { closesCodeFence } from '../codeFence.js';
import { readCodeInfo, slotOf, indentedCodeCut } from '../blockParser.js';
import { SCORE_LANGUAGES } from '../../music/types.js';
import type { ParseState } from './parseState.js';

/** What createCodeParsing takes from the pass. */
export interface CodeParsingDeps {
  scores: boolean;
  blocks: ContentBlock[];
  issues: ParseIssue[];
  rawLines: string[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  scopeSlot: (slot: BlockSlot | undefined) => BlockSlot | undefined;
  parse: ParseState;
}

export function createCodeParsing(deps: CodeParsingDeps) {
  const {
    scores, blocks, issues, rawLines, lineOffsets, lineEndOffset, scopeSlot, parse
  } = deps;
  /**
   * A code block (#624) of source lines `from` … `to - 1`, each cut at
   * `cuts[k]` characters from its start (the fence's indentation, the four
   * columns of indented code); the block's range runs from `srcStart` to
   * `srcEnd`. The lines are kept as written (a carriage return before the
   * line feed dropped), joined with a line feed mapped to the source's
   * line end.
   */
  const codeBlock = (from: number, to: number, cuts: readonly number[], srcStart: number, srcEnd: number, info: Omit<CodeBlockInfo, 'lines' | 'lineStarts'>): ContentBlock => {
    const lines: string[] = [];
    const lineStarts: number[] = [];
    let text = '';
    const sourceMap: number[] = [];
    for (let k = from; k < to; k++) {
      const raw = rawLines[k]!;
      const cut = Math.min(cuts[k - from] ?? 0, raw.length);
      const body = raw.slice(cut).replace(/\r$/, '');
      const at = lineOffsets[k]! + cut;
      if (k > from) {
        text += '\n';
        sourceMap.push(lineEndOffset(k - 1));
      }
      lines.push(body);
      lineStarts.push(at);
      text += body;
      for (let j = 0; j < body.length; j++) sourceMap.push(at + j);
    }
    return {
      type: 'code',
      text,
      spans: text.length > 0 ? [{ text, bold: false, italic: false }] : [],
      code: { ...info, lines, lineStarts },
      sourceStart: srcStart,
      sourceEnd: srcEnd,
      sourceMap,
    };
  };

  /** A fenced code block (#624) opening at line `start`, up to its closing
   *  fence; a fence left open runs to the end of the text and is reported
   *  (`unclosedCodeBlock`). */
  const parseCodeFence = (start: number, open: { indent: number; marker: string; info: string }): number => {
    let end = start + 1;
    while (end < rawLines.length && !closesCodeFence(rawLines[end]!, open.marker)) end++;
    const closed = end < rawLines.length;
    const cuts: number[] = [];
    for (let k = start + 1; k < end; k++) {
      // The fence's indentation comes off each line, as far as it has
      // leading spaces.
      const lead = /^ */.exec(rawLines[k]!)![0].length;
      cuts.push(Math.min(open.indent, lead));
    }
    const fence = open.marker[0] === '`' ? '```' as const : '~~~' as const;
    const info = readCodeInfo(open.info);
    const srcStart = lineOffsets[start]!;
    const srcEnd = closed ? lineEndOffset(end) : lineEndOffset(rawLines.length - 1);
    const code = codeBlock(start + 1, end, cuts, srcStart, srcEnd, { ...info, info: open.info, fence });
    // A fence in a notation language is a music score (#1172), unless it
    // asks to stay a listing.
    const scoreFormat = scores && info.lang !== undefined && closed && info.attrs.listing === undefined
      ? SCORE_LANGUAGES[info.lang]
      : undefined;
    if (scoreFormat) {
      blocks.push({
        type: 'score',
        text: '',
        spans: [],
        score: { format: scoreFormat, source: code.code!.lines.join('\n'), attrs: info.attrs },
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      return end + 1;
    }
    // `slot="…"` among the fence's attributes (#854).
    if (info.attrs.slot !== undefined) {
      const infoAt = rawLines[start]!.indexOf(open.info, open.indent + open.marker.length);
      const slot = scopeSlot(slotOf(info.attrs, open.info, srcStart + Math.max(0, infoAt)));
      if (slot) code.slot = slot;
    }
    blocks.push(code);
    if (!closed) {
      issues.push({
        kind: 'unclosedCodeBlock',
        delimiter: fence,
        ...(info.lang ? { lang: info.lang } : {}),
        sourceStart: srcStart,
        sourceEnd: lineEndOffset(start),
      });
    }
    return closed ? end + 1 : end;
  };

  /** Indented code (#624, `codeStyle.indentedCode`): the run of lines from
   *  `start` indented four columns or blank, its trailing blank lines left
   *  out. */
  const parseIndentedCode = (start: number): number => {
    let end = start;
    let last = start;
    while (end < rawLines.length) {
      const raw = rawLines[end]!;
      if (raw.trim() === '') { end++; continue; }
      if (indentedCodeCut(raw) < 0) break;
      last = end;
      end++;
    }
    const cuts: number[] = [];
    for (let k = start; k <= last; k++) cuts.push(Math.max(0, indentedCodeCut(rawLines[k]!)));
    blocks.push(codeBlock(start, last + 1, cuts, lineOffsets[start]!, lineEndOffset(last), { info: '', attrs: {}, fence: 'indent' }));
    return last + 1;
  };

  parse.i = 0;
  return {
    parseCodeFence, parseIndentedCode
  };
}
