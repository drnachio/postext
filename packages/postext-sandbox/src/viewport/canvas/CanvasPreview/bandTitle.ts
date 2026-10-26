import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from 'postext';
import { measureInLanguage } from '../../../controls/language/measureLanguage.js';

/**
 * Geometry and source mapping for design-band text that mirrors document
 * text — the `{titleText}` of a chapter opener or a `:::part` page. Shared
 * by the caret/selection overlay and the click-to-source hit test.
 */

export interface BandLineBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  font: string;
  /** Index of the line's first character in the block's title text. */
  plainStart: number;
  /** The language the layout measured the line in and the page paints it
   *  in (`documentShapingLanguage`), which its characters are measured in
   *  here (#770). Absent: the host's. */
  lang?: string;
}

/** Design text blocks of a page that carry a source range: the opener
 *  band, the running heads, and the advanced-design overlays of the page's
 *  headings (cover pages, in-column openers, `:::toc` part rows). */
export function bandTitleBlocks(doc: VDTDocument, pageIndex: number): VDTDesignTextBlock[] {
  const page = doc.pages[pageIndex];
  if (!page) return [];
  const slots: Array<{ slot: VDTBlock['designOverlay']; owner?: string }> = [page.openerBand, page.header, page.footer].map((slot) => ({ slot }));
  for (const b of doc.blocks) {
    if (b.pageIndex === pageIndex && b.designOverlay) slots.push({ slot: b.designOverlay, owner: b.id });
  }
  for (const b of page.floats ?? []) {
    if (b.designOverlay) slots.push({ slot: b.designOverlay, owner: b.id });
  }
  const out: VDTDesignTextBlock[] = [];
  for (const { slot, owner } of slots) {
    if (!slot) continue;
    for (const b of slot.blocks) {
      if (b.kind !== 'text' || b.sourceStart === undefined || b.sourceEnd === undefined) continue;
      out.push(b);
      if (owner !== undefined) owners.set(b, owner);
    }
  }
  return out;
}

/** The block whose design overlay draws each title {@link bandTitleBlocks}
 *  returned (a heading, a box), by title. */
const owners = new WeakMap<VDTDesignTextBlock, string>();

/** The id of the block whose design overlay draws `title` (one
 *  {@link bandTitleBlocks} returned): the overlay is painted in that
 *  block's composed frame, if any (#910). Undefined for the opener band
 *  and the running heads. */
export function bandTitleOwner(title: VDTDesignTextBlock): string | undefined {
  return owners.get(title);
}

/** A flow heading rendered through an opener band keeps invisible lines
 *  under the band; its text is drawn by the band, so caret, selection and
 *  clicks should be routed through the band block instead. */
export function isHiddenUnderBand(block: VDTBlock, titles: readonly VDTDesignTextBlock[]): boolean {
  return block.type === 'heading'
    && block.sourceStart !== undefined
    && block.sourceEnd !== undefined
    && titles.some((t) => block.sourceStart! <= t.sourceStart! && block.sourceEnd! >= t.sourceEnd!);
}

/** The title text the block renders: `sourceText` when known, else the
 *  laid-out lines joined by newlines. */
function titleTextOf(block: VDTDesignTextBlock): string {
  return block.sourceText ?? block.lines.map((l) => l.text).join('\n');
}

/** Approximate line boxes for a design text block. The band layout keeps
 *  absolute baselines only, so the line pitch comes from consecutive
 *  baselines (or lineHeight × fontSize for a single line). Each box also
 *  records where its text starts in the title text, so characters can be
 *  mapped to source offsets, and `lang`, the language the document's text
 *  was measured in (`documentShapingLanguage(doc)`; undefined: the
 *  host's), which the caret and the hit test measure its characters in. */
export function bandLineBoxes(block: VDTDesignTextBlock, lang?: string): BandLineBox[] {
  const lines = block.lines;
  const fontPx = /(\d+(?:\.\d+)?)px/.exec(block.fontString);
  const fontSizePx = fontPx ? Number(fontPx[1]) : block.bbox.height;
  const pitch = lines.length > 1 ? lines[1]!.baselineY - lines[0]!.baselineY : fontSizePx * 1.2;
  const ascent = pitch * 0.8;
  const title = titleTextOf(block);
  let pos = 0;
  return lines.map((l) => {
    // Wrapping trims spaces and breaks at newlines: skip them, then find the
    // line's text at (or after) the cursor.
    while (pos < title.length && /\s/.test(title[pos]!)) pos++;
    const at = l.text.length > 0 ? title.indexOf(l.text, pos) : pos;
    const plainStart = at >= 0 ? at : pos;
    pos = plainStart + l.text.length;
    return {
      x: block.bbox.x + l.xOffset,
      y: l.baselineY - ascent,
      width: l.width,
      height: pitch,
      text: l.text,
      font: block.fontString,
      plainStart,
      ...(lang !== undefined ? { lang } : {}),
    };
  });
}

/** Width of the first `chars` characters of a line, measured with its font
 *  in the language the layout measured the line in ({@link BandLineBox.lang})
 *  and scaled so the whole text spans the laid-out line width (absorbing
 *  letter-spacing or kerning applied by the layout). */
function prefixWidth(box: BandLineBox, chars: number): number {
  const n = Math.max(0, Math.min(box.text.length, chars));
  if (box.text.length === 0) return 0;
  const full = measureInLanguage(box.lang, box.text, box.font);
  if (full === null || !(full > 0)) return (n / box.text.length) * box.width;
  const prefix = measureInLanguage(box.lang, box.text.slice(0, n), box.font);
  if (prefix === null) return (n / box.text.length) * box.width;
  return (prefix / full) * box.width;
}

/** X coordinate of the caret placed before character `chars` of the line. */
export function bandPrefixX(box: BandLineBox, chars: number): number {
  return box.x + prefixWidth(box, chars);
}

/** Character index (0..text.length) closest to an x coordinate on the line. */
export function bandCharAtX(box: BandLineBox, x: number): number {
  const rel = x - box.x;
  if (rel <= 0) return 0;
  if (rel >= box.width) return box.text.length;
  // Smallest caret position whose following glyph's midpoint lies past x.
  let lo = 0;
  let hi = box.text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midpoint = (prefixWidth(box, mid) + prefixWidth(box, mid + 1)) / 2;
    if (midpoint < rel) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Source offset of character `plainIdx` of the title text (clamped). */
export function bandPlainToSource(block: VDTDesignTextBlock, plainIdx: number): number {
  const map = block.sourceMap;
  if (map && map.length > 0) {
    if (plainIdx >= map.length) return (block.sourceEnd ?? map[map.length - 1]! + 1);
    return map[Math.max(0, plainIdx)]!;
  }
  const len = titleTextOf(block).length || 1;
  const ratio = Math.max(0, Math.min(1, plainIdx / len));
  return (block.sourceStart ?? 0) + Math.round(ratio * ((block.sourceEnd ?? 0) - (block.sourceStart ?? 0)));
}

/** Index of the first title character whose source offset is ≥ `offset`
 *  (the title's end when the offset lies past the title). What the design
 *  prints before the title (a heading number, #546) is never reached: the
 *  title starts after it. */
export function bandSourceToPlain(block: VDTDesignTextBlock, offset: number): number {
  const map = block.sourceMap;
  const len = titleTextOf(block).length;
  if (map && map.length > 0) {
    const end = block.sourceEnd ?? Infinity;
    // Past the title: where it ends, before what the design prints after it.
    if (offset >= end) offset = end;
    let lo = Math.min(map.length, Math.max(0, block.sourcePrefixLen ?? 0));
    let hi = map.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (map[mid]! < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  const start = block.sourceStart ?? 0;
  const end = block.sourceEnd ?? start + len;
  const ratio = end > start ? (offset - start) / (end - start) : 0;
  return Math.max(0, Math.min(len, Math.round(ratio * len)));
}
