// A comic page (`:::page`) or strip (`:::strip`) in the semantic .docx
// (#1444): Word cannot letter a picture, so each panel is written as its
// art (the picture with its alt text) followed by its script, one
// paragraph a line: a caption in italics, a sound effect in capitals, a
// speech line after its speaker's key ("maya: Grandpa!"). The key and the
// words are the Markdown's own, mapped to it, so an edit in Word lands in
// the script; the colon between them is generated. Artists' notes print
// nothing, as in the engine. A text panel's body is written as it is.

import type { ComicPanelSource, ComicScriptItem } from '../../../comics/types.js';
import type { ContentBlock } from '../../../parse/types.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { FragmentBuilder } from '../fragments.js';
import { generatedRuns } from '../generated.js';
import { renderInline } from '../inline.js';
import { STYLE } from '../styles.js';
import { blockSdt, paragraph, textRuns } from '../wml.js';
import { pictureRun } from './figures.js';

/** A comic block's panels, each with the resource its `art` names. */
export function comicPanels(b: ContentBlock): (ComicPanelSource & { art?: string })[] {
  if (b.type !== 'directive' || !b.comic || (b.directiveName !== 'page' && b.directiveName !== 'strip')) return [];
  return b.comic.panels.map((p) => ({ ...p, art: p.attrs.art?.trim() || undefined }));
}

function lineStyle(ctx: WriterContext, role: ComicScriptItem['role']): string {
  if (role === 'caption') return ctx.styles.custom('comic:caption', 'Comic caption', () => ({ pPr: { ind: { firstLine: 0 }, before: 0, after: 60 }, rPr: { i: true } }));
  if (role === 'sfx') return ctx.styles.custom('comic:sfx', 'Comic sound', () => ({ pPr: { ind: { firstLine: 0 }, before: 0, after: 60 }, rPr: { b: true, caps: true } }));
  return ctx.styles.custom('comic:speech', 'Comic speech', () => ({ pPr: { ind: { left: 360, hanging: 360, firstLine: undefined }, before: 0, after: 60 } }));
}

/** Source text `[start, end)` (absolute) as mapped runs. */
function mapped(ctx: WriterContext, start: number, end: number, role: string): string {
  const text = ctx.chapter.markdown.slice(start, end);
  if (!text) return '';
  const f = new FragmentBuilder();
  f.push(text, Array.from({ length: text.length }, (_, k) => start + k));
  return ctx.log.wrap(textRuns(text, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [start, end], role });
}

/** One line of a panel's script. */
function scriptLine(ctx: WriterContext, item: ComicScriptItem): string {
  if (item.role === 'note' || !item.text.trim()) return '';
  // Fragments are logged in document order: the key before the words.
  const lead = item.role === 'speech' ? mapped(ctx, abs(ctx, item.keyStart), abs(ctx, item.keyEnd), 'comic:speaker') + generatedRuns(ctx, [{ text: ': ' }], 'comic:colon') : '';
  const sourceMap = item.sourceMap.map((o) => abs(ctx, o));
  const { xml, frag } = renderInline(ctx, {
    text: item.text,
    spans: item.spans,
    sourceMap,
    src: ctx.chapter.markdown,
    toSrc: (o) => abs(ctx, o),
    end: abs(ctx, item.textEnd),
  });
  const words = ctx.log.wrap(xml, frag, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [abs(ctx, item.textStart), abs(ctx, item.textEnd)], role: `comic:${item.role}` });
  return paragraph({ style: lineStyle(ctx, item.role) }, lead + words);
}

/** A text panel's body: a paragraph per run of lines. */
function textPanel(ctx: WriterContext, range: { start: number; end: number }): string {
  const md = ctx.chapter.markdown;
  const start = abs(ctx, range.start);
  const end = abs(ctx, range.end);
  let out = '';
  let at = start;
  for (const piece of md.slice(start, end).split(/(\n\s*\n)/)) {
    if (piece.trim() && !/^\n\s*\n$/.test(piece)) out += paragraph({ style: STYLE.normal, ind: { firstLine: 0 } }, mapped(ctx, at, at + piece.length, 'comic:text'));
    at += piece.length;
  }
  return out;
}

/** A comic page or strip as figures and lines; `caption` writes the
 *  strip's caption paragraph, if any, after them. */
export function renderComic(ctx: WriterContext, b: ContentBlock, kind: 'comicPage' | 'strip', widthTwips: number, caption: () => string): string {
  const widthPx = Math.min(ctx.columnPx, (widthTwips * ctx.units.dpi) / 1440);
  let body = '';
  for (const panel of comicPanels(b)) {
    const pic = panel.art ? ctx.media.get(panel.art) : undefined;
    if (pic && panel.art) {
      ctx.usedResources.add(panel.art);
      const alt = ctx.resources.get(panel.art)?.altText ?? '';
      body += paragraph({ style: STYLE.figure }, pictureRun(ctx, pic, panel.art, alt, widthPx));
    }
    if (panel.text) body += textPanel(ctx, panel.text);
    for (const item of panel.items) body += scriptLine(ctx, item);
  }
  body += caption();
  return blockSdt(ctx.nextSdtId(), `ptx:${kind}`, undefined, body || '<w:p/>');
}
