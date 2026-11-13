// A figure's words in the semantic .docx (#1390, #1444): the caption (the
// engine's label and number, generated, then the caption text mapped to
// the figure's own words or to the resource's field) in the caption
// style's slant, the note in its own smaller size and colour, and the
// `::label[…]` lines of a `:::figure` as a line of their own under the
// picture, so the names the print sets on the picture stay in the text.

import type { ContentBlock } from '../../../parse/types.js';
import type { Resource, TextAlign } from '../../../types.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { captionLabelParts, captionStyleOf } from '../engineNumbers.js';
import { FragmentBuilder } from '../fragments.js';
import { generatedRuns } from '../generated.js';
import { paleOnWhite } from '../design/ink.js';
import { partInk } from '../design/partColor.js';
import { renderInline } from '../inline.js';
import { snippetRuns } from '../snippet.js';
import { hyphens } from '../prose/caption.js';
import { STYLE } from '../styles.js';
import { fieldRuns, halfPoints, hex, paragraph, px, textRuns, twips, type ParaProps } from '../wml.js';

const JC: Record<TextAlign, ParaProps['jc']> = { left: 'left', justify: 'both', center: 'center', right: 'right' };

/** A figure's own word (`caption`, `note`, `alt`) with its absolute
 *  range, checked against the Markdown. */
export function ownWord(ctx: WriterContext, b: ContentBlock | undefined, kind: 'caption' | 'note' | 'alt'): { text: string; start: number } | undefined {
  const w = b?.figure?.words?.[kind];
  if (!b || !w) return undefined;
  const md = ctx.chapter.markdown;
  const start = abs(ctx, w.sourceStart);
  if (md.startsWith(w.text, start)) return { text: w.text, start };
  // Offsets read before marks were taken out: find the text in the block.
  const at = md.indexOf(w.text, abs(ctx, b.sourceStart));
  return at >= 0 && at < abs(ctx, b.sourceEnd) ? { text: w.text, start: at } : { text: w.text, start: -1 };
}

/** The paragraph style of a caption of `typeId`: the Caption style, in
 *  italics when the caption style sets the description so. */
function captionStyleId(ctx: WriterContext, typeId: string | undefined): string {
  const type = ctx.resourceTypes.find((t) => t.id === typeId);
  const cap = captionStyleOf(ctx.resolved, type);
  const base = ctx.styles.caption(cap, type?.id ?? typeId ?? '');
  if (!cap.descriptionItalic) return base;
  return ctx.styles.custom(`caption:italic:${base}`, `Caption italic${base === STYLE.caption ? '' : ` ${type?.id ?? ''}`}`, () => ({ basedOn: base, rPr: { i: true } }));
}

/** The caption style of a resource's type (#1444): above or below its
 *  figure, and the paragraph style that sets it. */
export function captionPlace(ctx: WriterContext, res: Resource): { above: boolean; style: string } {
  const type = ctx.resourceTypes.find((t) => t.id === res.typeId);
  return { above: captionStyleOf(ctx.resolved, type).position === 'above', style: captionStyleId(ctx, res.typeId) };
}

/** The paragraph style of a note: smaller and in its own colour, as the
 *  caption style's `note` sets it. */
function noteStyleId(ctx: WriterContext, typeId: string | undefined): string {
  const type = ctx.resourceTypes.find((t) => t.id === typeId);
  const cs = captionStyleOf(ctx.resolved, type);
  const key = type?.captionStyle ? (type.id ?? '') : '';
  return ctx.styles.custom(`caption:note:${key}`, `Caption note${key ? ` ${key}` : ''}`, () => {
    const u = ctx.units;
    const capPx = px(u, cs.fontSize) || u.basePx;
    const notePx = px(u, cs.note.fontSize, capPx) || capPx;
    return {
      basedOn: ctx.styles.caption(cs, type?.id ?? typeId ?? ''),
      // Whole words unless the note hyphenates (#1550), whatever its caption does.
      pPr: { before: twips(u, cs.note.gap, notePx), jc: JC[cs.note.align], suppressAutoHyphens: hyphens(cs.note.hyphenation, cs.hyphenation), ...(cs.note.lineHeight ? { line: { twips: Math.max(1, twips(u, cs.note.lineHeight, notePx)), rule: 'atLeast' as const } } : {}) },
      rPr: { i: cs.note.italic, color: hex(cs.note.color), sz: halfPoints(u, cs.note.fontSize, capPx) },
    };
  });
}

/** A caption-style paragraph for a figure's caption or note. */
export function captionParagraph(ctx: WriterContext, b: ContentBlock | undefined, res: Resource, field: 'caption' | 'note', label: string, extra: Omit<ParaProps, 'style'> = {}): string {
  const own = ownWord(ctx, b, field);
  const role = field === 'caption' ? 'caption' : 'note';
  const style = field === 'caption' ? captionStyleId(ctx, res.typeId) : noteStyleId(ctx, res.typeId);
  let runs: string;
  if (own && own.start >= 0) runs = snippetRuns(ctx, own.text, ctx.chapter.markdown, own.start, { kind: 'markdown', chapter: ctx.chapter.index }, role, style);
  else if (own) runs = textRuns(own.text, '');
  else {
    const text = res[field] ?? '';
    runs = snippetRuns(ctx, text, text, 0, { kind: 'resource', resourceId: res.id, field }, role, style);
  }
  if (!runs && !label) return '';
  return paragraph({ ...extra, style }, label + runs);
}

/** A comic strip's caption paragraph: its number (when the engine counts
 *  it) and then its text runs, in the caption style of its type. */
export function stripCaptionParagraph(ctx: WriterContext, fence: ContentBlock, text: () => string): string {
  const entry = ctx.numbers.strips.get(fence);
  const id = fence.comic?.attrs.id?.trim();
  const label = entry ? numberedLabel(ctx, entry.typeId, entry.number, id ? ctx.numbers.ordinals.get(id) : undefined) : '';
  const runs = text();
  if (!runs && !label) return '';
  return paragraph({ style: captionStyleId(ctx, entry?.typeId) }, label + runs);
}

/** The caption's label and number, in a fragment of generated text: the
 *  importer reads text beside a bookmark into it, so the label needs its
 *  own (edits to it are rejected, not written into the caption). */
export function captionLabel(ctx: WriterContext, res: Resource): string {
  const entry = ctx.numbers.resources[res.id];
  return entry ? numberedLabel(ctx, res.typeId, entry.number, ctx.numbers.ordinals.get(res.id)) : '';
}

/** The label and number the engine prints before a caption of type
 *  `typeId` ("Figure 1.7. "), as generated text; `ordinal` is the plain
 *  count of the item in its type, when known. */
function numberedLabel(ctx: WriterContext, typeId: string | undefined, number: string, ordinal: number | undefined): string {
  const type = ctx.resourceTypes.find((t) => t.id === typeId);
  const label = type ? captionLabelParts(ctx.resolved, type, number) : undefined;
  if (!type || !label) return '';
  const cap = captionStyleOf(ctx.resolved, type);
  // An italic caption style slants the description: the label says its own.
  const italic = cap.labelItalic ? '<w:i/>' : cap.descriptionItalic ? '<w:i w:val="0"/>' : '';
  // The label's own colour, in the part's palette where a part recolours.
  const own = ctx.plain ? undefined : (partInk(ctx, cap.labelColor) ?? hex(cap.labelColor));
  const ink = own && own !== hex(cap.color) && !paleOnWhite(own) ? `<w:color w:val="${own}"/>` : '';
  const props = `<w:rPr>${cap.labelBold ? '<w:b/>' : ''}${italic}${ink}</w:rPr>`;
  // A number that is the plain count of its type stays a SEQ field (Word
  // lists the figures with it); a chapter number ("1.7") is text, which a
  // field update would turn into the count.
  const seq = `SEQ ${type.id.replace(/[^A-Za-z0-9_]/g, '_') || 'Figure'} \\* ARABIC`;
  const plain = label.number !== '' && label.number === String(ordinal);
  const num = !label.number ? '' : plain ? fieldRuns(seq, label.number, props) : textRuns(label.number, props);
  const runs = textRuns(label.head, props) + num + textRuns(label.tail, props);
  const text = label.head + label.number + label.tail;
  const frag = new FragmentBuilder();
  frag.push(text, new Array<number>(text.length).fill(-1), (cap.labelBold ? 'b' : '') + (cap.labelItalic ? 'i' : ''));
  return ctx.log.wrap(runs, frag, { block: blockId(ctx), target: { kind: 'generated' }, range: [0, 0], role: 'label' });
}

/** A `:::figure`'s `::label[…]` lines as one paragraph under the picture
 *  ("White Range · Spring · Fontalba"): each label mapped to its words in
 *  the Markdown, the separators generated. Word cannot set them on the
 *  picture, and a map without its place names loses half of what it says. */
export function figureLabels(ctx: WriterContext, b: ContentBlock | undefined): string {
  const labels = (b?.figure?.labels ?? []).filter((l) => l.text.trim());
  if (!labels.length) return '';
  const md = ctx.chapter.markdown;
  let runs = '';
  labels.forEach((l, k) => {
    if (k) runs += generatedRuns(ctx, [{ text: ' · ' }], 'figure:label:sep');
    const sourceMap = l.sourceMap.map((o) => abs(ctx, o));
    const { xml, frag } = renderInline(ctx, { text: l.text, spans: l.spans, sourceMap, src: md, toSrc: (o) => abs(ctx, o), end: abs(ctx, l.textEnd) });
    runs += ctx.log.wrap(xml, frag, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [abs(ctx, l.textStart), abs(ctx, l.textEnd)], role: 'figure:label' });
  });
  const style = ctx.styles.custom('figure:labels', 'Figure labels', () => ({ basedOn: STYLE.caption, pPr: { keepNext: true, before: 60 } }));
  return paragraph({ style }, runs);
}
