// A comic page (`:::page`) or strip (`:::strip`) in the semantic .docx
// (#1444): Word cannot letter a picture, so each panel is written as its
// art (the picture with its alt text) followed by its script, one
// paragraph a line: a caption in italics, a sound effect in capitals, a
// speech line after its speaker's name ("Maya: Grandpa!"): the cast's
// name for the key, else the key with a capital. The words, and a key
// that is already the name, are the Markdown's own, mapped to it, so an
// edit in Word lands in the script; a name the key does not spell and the
// colon are generated. Artists' notes print nothing, as in the engine. A
// text panel's body is written as it is. A picture stays with its lines,
// no taller than a third of the page.

import { comicSpeakerName } from '../../../comics/paint.js';
import { resolveComicsConfig } from '../../../defaults/comics.js';
import type { ComicPanelSource, ComicScriptItem } from '../../../comics/types.js';
import type { ContentBlock } from '../../../parse/types.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { FragmentBuilder } from '../fragments.js';
import { generatedRuns } from '../generated.js';
import { renderInline } from '../inline.js';
import { pageGeometry } from '../sections.js';
import { STYLE } from '../styles.js';
import { blockSdt, hex, paragraph, px, textRuns, type ParaProps, type RunProps } from '../wml.js';
import { pictureRun } from './figures.js';

/** A comic block's panels, each with the resource its `art` names. */
export function comicPanels(b: ContentBlock): (ComicPanelSource & { art?: string })[] {
  if (b.type !== 'directive' || !b.comic || (b.directiveName !== 'page' && b.directiveName !== 'strip')) return [];
  return b.comic.panels.map((p) => ({ ...p, art: p.attrs.art?.trim() || undefined }));
}

function lineStyle(ctx: WriterContext, role: ComicScriptItem['role'], narrow = false): string {
  // In a strip's narrow panel a hanging speaker line leaves a word or two
  // a line: the words run on under the name instead.
  if (narrow && role === 'speech') return ctx.styles.custom('comic:speech:panel', 'Comic speech in a panel', () => ({ pPr: { ind: { left: 0, firstLine: 0 }, before: 0, after: 60, jc: 'left' } }));
  // Lettering is ragged: a justified line in a narrow panel opens up.
  if (role === 'caption') return ctx.styles.custom('comic:caption', 'Comic caption', () => ({ pPr: { ind: { firstLine: 0 }, before: 0, after: 60, jc: 'left' }, rPr: { i: true } }));
  if (role === 'sfx') return ctx.styles.custom('comic:sfx', 'Comic sound', () => sfxLook(ctx));
  return ctx.styles.custom('comic:speech', 'Comic speech', () => ({ pPr: { ind: { left: 360, hanging: 360, firstLine: undefined }, before: 0, after: 60, jc: 'left' } }));
}

/** A sound effect as the book letters it (#1444): the `sfx` balloon
 *  style's face, weight, colour and case, at its scale of the lettering
 *  size (24 pt at most, so a sound does not take a page's width), set
 *  under its panel's picture. Its halo outlines the letters on the art;
 *  on the paper under the picture it would show nothing. */
function sfxLook(ctx: WriterContext): { pPr: ParaProps; rPr: RunProps } {
  // The plain design: a sound is a bold line, in no face of the book's.
  if (ctx.plain) return { pPr: { ind: { firstLine: 0 }, before: 0, after: 60, jc: 'left' }, rPr: { b: true } };
  const comics = resolveComicsConfig(ctx.config.comics, ctx.config.locale);
  const sfx = comics.balloonStyles.find((b) => b.id === 'sfx');
  const lt = comics.lettering;
  const u = ctx.units;
  const sizePx = Math.min((24 * u.dpi) / 72, (px(u, lt.fontSize) || u.basePx) * (sfx?.fontScale ?? 1));
  const bold = sfx?.bold ?? lt.bold;
  return {
    pPr: { ind: { firstLine: 0 }, before: 0, after: 60, jc: 'center', keepLines: true },
    rPr: {
      ...ctx.styles.font(sfx?.fontFamily ?? lt.fontFamily, bold ? 700 : 400, sfx?.italic ?? lt.italic),
      b: bold,
      i: sfx?.italic ?? lt.italic,
      // In capitals, as before, unless the style says otherwise.
      caps: sfx?.textTransform === 'none' ? undefined : true,
      color: hex(sfx?.color ?? lt.color),
      sz: Math.max(2, Math.round((sizePx * 144) / u.dpi)),
    },
  };
}

/** Source text `[start, end)` (absolute) as mapped runs. */
function mapped(ctx: WriterContext, start: number, end: number, role: string): string {
  const text = ctx.chapter.markdown.slice(start, end);
  if (!text) return '';
  const f = new FragmentBuilder();
  f.push(text, Array.from({ length: text.length }, (_, k) => start + k));
  return ctx.log.wrap(textRuns(text, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [start, end], role });
}

/** The name a speech line is shown under: the cast's name for the key,
 *  else the key with a capital (a key is an id, "maya"). */
function speakerName(ctx: WriterContext, key: string): string {
  const name = comicSpeakerName(key, ctx.config.comics?.cast);
  if (name !== key) return name;
  const first = String.fromCodePoint(key.codePointAt(0) ?? 32);
  return first.toLocaleUpperCase(ctx.config.locale) + key.slice(first.length);
}

/** A speech line's speaker: its key, mapped to the Markdown, when the key
 *  is the name the reader should see; else the name, generated (an edit
 *  to it is reported, not written into the key). */
function speaker(ctx: WriterContext, item: ComicScriptItem): string {
  const start = abs(ctx, item.keyStart);
  const end = abs(ctx, item.keyEnd);
  const key = ctx.chapter.markdown.slice(start, end);
  const name = speakerName(ctx, key);
  return name === key ? mapped(ctx, start, end, 'comic:speaker') : generatedRuns(ctx, [{ text: name }], 'comic:speaker');
}

/** One line of a panel's script; `keep` holds it with the line after it. */
export function scriptLine(ctx: WriterContext, item: ComicScriptItem, keep: boolean, after = 200, narrow = false): string {
  if (item.role === 'note' || !item.text.trim()) return '';
  // Fragments are logged in document order: the key before the words.
  const lead = item.role === 'speech' ? speaker(ctx, item) + generatedRuns(ctx, [{ text: ': ' }], 'comic:colon') : '';
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
  // The panel's last line leaves room before the next panel.
  return paragraph({ style: lineStyle(ctx, item.role, narrow), ...(keep ? { keepNext: true } : { after }) }, lead + words);
}

/** A text panel's body: a paragraph per run of lines. */
export function textPanel(ctx: WriterContext, range: { start: number; end: number }): string {
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
  // A panel is drawn no taller than a third of the page's text area, so a
  // tall one does not take a page of its own with its lines on the next.
  const geo = pageGeometry(ctx.resolved, ctx.units);
  const maxHeightPx = ((geo.heightTw - geo.margins.top - geo.margins.bottom) * ctx.units.dpi) / 1440 / 3;
  let body = '';
  for (const panel of comicPanels(b)) {
    const pic = panel.art ? ctx.media.get(panel.art) : undefined;
    const lines = panel.items.filter((i) => i.role !== 'note' && i.text.trim());
    if (pic && panel.art) {
      ctx.usedResources.add(panel.art);
      const alt = ctx.resources.get(panel.art)?.altText ?? '';
      const fit = pic.heightPx > maxHeightPx ? Math.min(widthPx, (pic.widthPx * maxHeightPx) / pic.heightPx) : widthPx;
      // The picture stays on the page of the lines under it.
      body += paragraph({ style: STYLE.figure, ...(lines.length || panel.text ? { keepNext: true } : {}) }, pictureRun(ctx, pic, panel.art, alt, fit));
    }
    if (panel.text) body += textPanel(ctx, panel.text);
    lines.forEach((item, k) => (body += scriptLine(ctx, item, k < lines.length - 1)));
  }
  body += caption();
  return blockSdt(ctx.nextSdtId(), `ptx:${kind}`, undefined, body || '<w:p/>');
}
