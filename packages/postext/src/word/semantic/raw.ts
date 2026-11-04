// What Word cannot express (#1390): composed and comic pages, exercises,
// raw directives, unconvertible maths, front matter. Each travels in a
// content control tagged `ptx:raw:<kind>` holding the exact source text in
// the 'Postext Source' style, mapped character for character so an edit
// made in Word comes back as written.

import { blockId, type WriterContext } from './context.js';
import { FragmentBuilder } from './fragments.js';
import { STYLE } from './styles.js';
import { blockSdt, paragraph, textRuns } from './wml.js';

/** Start of the source line holding `offset` (a note definition's block
 *  starts after its `[^id]:`). */
export function lineStart(md: string, offset: number): number {
  return md.lastIndexOf('\n', offset - 1) + 1;
}

/** The source `[start, end)` (absolute) as a raw content control. Trailing
 *  line ends stay out; carriage returns are left in the source only. */
export function rawSdt(ctx: WriterContext, start: number, end: number, kind: string): string {
  const md = ctx.chapter.markdown;
  let e = Math.min(end, md.length);
  while (e > start && (md[e - 1] === '\n' || md[e - 1] === '\r')) e--;
  if (e <= start) return '';
  const f = new FragmentBuilder();
  let text = '';
  const map: number[] = [];
  for (let k = start; k < e; k++) {
    if (md[k] === '\r') continue;
    text += md[k];
    map.push(k);
  }
  f.push(text, map);
  const runs = ctx.log.wrap(textRuns(text, ''), f, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [start, e],
    role: `raw:${kind}`,
  });
  return blockSdt(ctx.nextSdtId(), `ptx:raw:${kind}`, `Postext source: ${kind}`, paragraph({ style: STYLE.source }, runs));
}
