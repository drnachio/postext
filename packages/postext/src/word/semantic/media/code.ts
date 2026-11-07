// A code listing whose fence asks for more than its lines (#1444): a
// title (`title="chapter.js"`), line numbers (`lineNumbers`, `start=N`)
// or highlighted lines (`highlight="4"`). It is written a paragraph per
// line in the code style: the number first, generated, in the code
// style's number colour; the line's own text mapped to its source line; a
// highlighted line on the code style's tint. The title is a paragraph of
// its own above, mapped to the attribute's value. Paragraphs, not a table
// or Word's line numbering: those number the whole section, or split the
// code from its numbers when it is copied.

import { resolveCodeStyleConfig } from '../../../defaults/text/codeStyle.js';
import type { ContentBlock } from '../../../parse/types.js';
import { codeFenceSettings } from '../../../pipeline/code/codeLines.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { FragmentBuilder } from '../fragments.js';
import { generatedRuns } from '../generated.js';
import { renderInline } from '../inline.js';
import { STYLE } from '../styles.js';
import { blockSdt, hex, paragraph, textRuns } from '../wml.js';

/** The fence's title, mapped to where the fence line writes it. */
function titleParagraph(ctx: WriterContext, b: ContentBlock, title: string): string {
  const md = ctx.chapter.markdown;
  const fence = abs(ctx, b.sourceStart);
  const lineEnd = md.indexOf('\n', fence);
  const at = md.slice(fence, lineEnd < 0 ? md.length : lineEnd).indexOf(title);
  const style = ctx.styles.custom('code:title', 'Code title', () => ({ basedOn: STYLE.code, pPr: { keepNext: true, after: 0 }, rPr: { b: true } }));
  if (at < 0) return paragraph({ style }, generatedRuns(ctx, [{ text: title }], 'code:title'));
  const start = fence + at;
  const f = new FragmentBuilder();
  f.push(title, Array.from({ length: title.length }, (_, k) => start + k));
  return paragraph({ style }, ctx.log.wrap(textRuns(title, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [start, start + title.length], role: 'attr:code:title' }));
}

/** The listing, or undefined when its fence asks for nothing Word's
 *  plain code paragraph does not already show. */
export function renderCodeListing(ctx: WriterContext, b: ContentBlock): string | undefined {
  const code = b.code;
  if (!code || !code.lines.length) return undefined;
  const cs = ctx.resolved.codeStyle ?? resolveCodeStyleConfig(undefined, ctx.resolved.bodyText);
  const set = codeFenceSettings(b, cs);
  const title = code.title?.trim();
  if (!set.lineNumbers && !set.highlight.size && !title) return undefined;
  const md = ctx.chapter.markdown;
  const last = set.start + code.lines.length - 1;
  const width = Math.max(String(set.start).length, String(last).length);
  const tint = hex(cs.highlightBackground);
  const numberColor = hex(cs.lineNumberColor);
  let out = title ? titleParagraph(ctx, b, title) : '';
  let offset = 0;
  code.lines.forEach((line, k) => {
    const lead = set.lineNumbers ? generatedRuns(ctx, [{ text: `${String(set.start + k).padStart(width, ' ')}  `, ...(numberColor ? { color: numberColor } : {}) }], 'code:number') : '';
    let words = '';
    if (line) {
      const sourceMap = b.sourceMap.slice(offset, offset + line.length).map((o) => abs(ctx, o));
      const start = abs(ctx, code.lineStarts[k]!);
      const { xml, frag } = renderInline(ctx, { text: line, spans: [{ text: line, bold: false, italic: false }], sourceMap, src: md, toSrc: (o) => abs(ctx, o), end: start + line.length, style: STYLE.code });
      words = ctx.log.wrap(xml, frag, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [start, start + line.length], role: `code${code.lang ? `:${code.lang}` : ''}` });
    }
    offset += line.length + 1;
    const lit = set.highlight.has(k + 1) && tint;
    const first = k === 0 && !title;
    const lastLine = k === code.lines.length - 1;
    // The lines sit solid, as in the listing: only the block's own space
    // before and after it.
    out += paragraph({ style: STYLE.code, ...(first ? {} : { before: 0 }), ...(lastLine ? {} : { after: 0, keepNext: code.lines.length <= 12 }), ...(lit ? { shd: tint } : {}) }, lead + words);
  });
  return blockSdt(ctx.nextSdtId(), 'ptx:code', code.lang, out);
}
