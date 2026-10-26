// Display maths and resource lines: a $$ block, a math fence and the
// ::resource directives.
// Part of parseBlocks (blockParser.ts), split out of its loop in #1276.
import type { LineScan, StepJump } from './lineScan.js';
import type { ParseState } from './parseState.js';
import type { ContentBlock, ParseIssue, BlockSlot } from '../types.js';
import { BLOCK_MATH_SINGLE_RE, BLOCK_MATH_FENCE_RE, RESOURCE_DIRECTIVE_RE, slotOf } from '../blockParser.js';
import { parseAttrBlobStrict, parseDirectiveAttrs } from '../attrs.js';

/** What createDisplayBlocks takes from around the loop. */
export interface DisplayBlocksDeps {
  parse: ParseState;
  blocks: ContentBlock[];
  issues: ParseIssue[];
  rawLines: string[];
  lineOffsets: number[];
  lineEndOffset: (k: number) => number;
  scopeSlot: (slot: BlockSlot | undefined) => BlockSlot | undefined;
  displayInterrupts: (k: number) => boolean;
}

export function createDisplayBlocks(deps: DisplayBlocksDeps) {
  const {
    parse, blocks, issues, rawLines, lineOffsets, lineEndOffset, scopeSlot, displayInterrupts
  } = deps;
  /** Reads a display-maths or resource line; `continue` once it is read. */
  const parseDisplayBlock = (lineScan: LineScan): StepJump => {
    const {
      line, trimmed
    } = lineScan;
    // Display math — single-line `$$ ... $$`
    const singleMath = line.match(BLOCK_MATH_SINGLE_RE);
    if (singleMath) {
      const srcStart = lineOffsets[parse.i]!;
      const srcEnd = lineEndOffset(parse.i);
      blocks.push({
        type: 'mathDisplay',
        text: '',
        spans: [],
        tex: singleMath[1]!,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      if (displayInterrupts(parse.i)) parse.lastDisplayEnd = parse.i;
      parse.i++;
      return 'continue';
    }

    // Display math — multi-line `$$` ... `$$` (opening fence on its own line).
    if (BLOCK_MATH_FENCE_RE.test(line)) {
      const startIdx = parse.i;
      parse.i++;
      const texLines: string[] = [];
      let closed = false;
      while (parse.i < rawLines.length) {
        if (BLOCK_MATH_FENCE_RE.test(rawLines[parse.i]!)) {
          closed = true;
          break;
        }
        texLines.push(rawLines[parse.i]!);
        parse.i++;
      }
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = closed ? lineEndOffset(parse.i) : lineEndOffset(parse.i - 1);
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
      if (displayInterrupts(startIdx)) parse.lastDisplayEnd = closed ? parse.i : parse.i - 1;
      if (closed) parse.i++; // consume the closing fence
      return 'continue';
    }

    // Resource embed — `::resource{id="..."}` on its own line. Emits a block
    // carrying only the resource id; rendering/numbering happen downstream.
    // Malformed variants fall through to paragraph parsing.
    const resourceMatch = trimmed.match(RESOURCE_DIRECTIVE_RE);
    if (resourceMatch) {
      const srcStart = lineOffsets[parse.i]!;
      const srcEnd = lineEndOffset(parse.i);
      blocks.push({
        type: 'resourceBlock',
        text: '',
        spans: [],
        resourceId: resourceMatch[1]!,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      parse.i++;
      return 'continue';
    }
    // `::resource{id="…" slot="…"}` (#854): the embed sent to a slot of a
    // composed page. Only the two keys; anything else stays text as before.
    if (trimmed.startsWith('::resource') && trimmed.includes('slot')) {
      const m = /^::resource\s*\{([^}]*)\}\s*$/.exec(trimmed);
      const tokens = m ? parseAttrBlobStrict(m[1]!) : undefined;
      const id = tokens?.find((t) => t.key === 'id');
      if (tokens && id && id.quoted && id.value !== '' && tokens.some((t) => t.key === 'slot') && tokens.every((t) => t.key === 'id' || t.key === 'slot')) {
        const blobStart = lineOffsets[parse.i]! + line.indexOf('{') + 1;
        const slot = scopeSlot(slotOf(parseDirectiveAttrs(m![1]!), m![1]!, blobStart));
        blocks.push({
          type: 'resourceBlock',
          text: '',
          spans: [],
          resourceId: id.value,
          ...(slot ? { slot } : {}),
          sourceStart: lineOffsets[parse.i]!,
          sourceEnd: lineEndOffset(parse.i),
          sourceMap: [],
        });
        parse.i++;
        return 'continue';
      }
    }
  };
  return { parseDisplayBlock };
}
