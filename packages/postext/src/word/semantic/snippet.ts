// Inline Markdown held outside the chapter text (#1390): a resource's
// caption, note and table cells, or a figure's own caption in the
// chapter. Parsed with the engine's snippet parser and mapped to the
// field it came from (or to the chapter, for a figure's own words).

import { mapInlineSnippet } from '../../parse/inlineSnippet.js';
import type { FragmentTarget } from '../anchors/types.js';
import { blockId, type WriterContext } from './context.js';
import { renderInline } from './inline.js';

const INLINE_CODE = /(?<!\\)`([^`\n]+?)`/g;

/**
 * The runs of a snippet wrapped in its fragment's bookmark. `content` is
 * the text as written; `base` its offset in `src` (the chapter Markdown
 * for a figure's own words, 0 for a resource field, where `src` is the
 * field itself).
 */
export function snippetRuns(ctx: WriterContext, content: string, src: string, base: number, target: FragmentTarget, role: string): string {
  if (!content.trim()) return '';
  const m = mapInlineSnippet(content);
  const inlineCode: { start: number; end: number }[] = [];
  INLINE_CODE.lastIndex = 0;
  for (let x = INLINE_CODE.exec(content); x; x = INLINE_CODE.exec(content)) inlineCode.push({ start: base + x.index + 1, end: base + x.index + 1 + x[1]!.length });
  const { xml, frag } = renderInline(ctx, {
    text: m.text,
    spans: m.spans,
    sourceMap: m.sourceMap.map((o) => (o < 0 ? -1 : o + base)),
    src,
    toSrc: (o) => o + base,
    end: base + content.length,
    inlineCode,
  });
  return ctx.log.wrap(xml, frag, { block: blockId(ctx), target, range: [base, base + content.length], role });
}
