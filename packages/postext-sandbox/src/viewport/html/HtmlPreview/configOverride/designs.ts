// The heading and part designs as the HTML viewer draws them: the scaled
// slot, the part title's face and lines, and designs without colours
// (#1276: split out of configOverride.ts).
import { type Dimension, type DesignSlot, dimensionToPx, type ResolvedHeadingsConfig, measureGlyphWidth } from 'postext';
import { measureInLanguage } from '../../../../controls/language/measureLanguage.js';
import { type LeafGeometry, slotExtentPx, anchorsToLeaf, hasPlate, rebaseToBand, px, scaleDimensions } from './leaf.js';

/** A heading's design slot as the viewer draws it: a cover plate, an opener
 *  band, the type set over them — kept, not dropped, so the book opens on
 *  screen the way it opens on paper.
 *
 *  A slot drawn against the leaf (page or bleed anchors) gets a band that
 *  stands for the leaf's top, down to the bottom of the band the design
 *  reserves under the top margin — the whole leaf for a cover, the opener
 *  panel for an article — and keeps the leaf's proportions in it (see
 *  {@link rebaseToBand}). Every slot is then scaled down, type and all,
 *  when it is wider than the viewer's page or, in the paged view, taller
 *  than a page, rather than spilling past its edge. */
export function viewerHeadingDesign<T extends { enabled?: boolean; minHeight?: Dimension; slot?: DesignSlot }>(
  advancedDesign: T | undefined,
  opts: { maxBandPx: number | null; pageWidthPx: number; columnWidthPx: number; dpi: number; leaf: LeafGeometry },
): { advancedDesign?: T; span?: 'column' } {
  if (!advancedDesign) return {};
  if (!advancedDesign.enabled || !advancedDesign.slot || advancedDesign.slot.elements.length === 0) {
    return { advancedDesign };
  }
  const { maxBandPx, pageWidthPx, columnWidthPx, dpi, leaf } = opts;
  const askedPx = advancedDesign.minHeight ? dimensionToPx(advancedDesign.minHeight, dpi) : 0;
  let slot = advancedDesign.slot;
  let bandPx = askedPx;
  let widthPx = slotExtentPx(slot, dpi);
  // The height the band is measured against: its own, or for a leaf-drawn
  // slot the leaf's — the paged view's page then reads as the leaf scaled
  // to the screen, and an opener panel takes the share of it it takes of
  // the leaf instead of the whole screen.
  let tallPx = askedPx;
  const onLeaf = anchorsToLeaf(slot);
  if (onLeaf) {
    bandPx = Math.min(leaf.height, leaf.margins.top + askedPx);
    widthPx = leaf.width;
    tallPx = leaf.height;
  }
  // A photo opener on a page wider than its leaf — a viewer page hosting
  // two text columns — cannot stretch its plate the way a band of boxes
  // and type stretches, and a plate two thirds of the page wide under a
  // bar the whole page wide reads as a mistake. It is set in one text
  // column instead, the leaf's top scaled to the column's width, and the
  // body flows on beside it as it flows on under any column heading. A
  // cover keeps the page: it is the whole leaf, and nothing follows it.
  const inColumn = onLeaf && bandPx < leaf.height && columnWidthPx < pageWidthPx && hasPlate(slot, leaf.width, dpi);
  const kW = inColumn
    ? columnWidthPx / widthPx
    : widthPx > pageWidthPx && widthPx > 0 ? pageWidthPx / widthPx : 1;
  // A band as tall as the page itself is more than a column can reserve
  // under the heading's own spacing: keep a line's worth short of it.
  const roomPx = maxBandPx !== null ? maxBandPx * 0.95 : null;
  const kH = roomPx !== null && tallPx > roomPx && tallPx > 0 ? roomPx / tallPx : 1;
  const k = Math.min(kW, kH);
  if (onLeaf) {
    // A panel filling the leaf's width runs across the viewer's page, as
    // it runs across the leaf; a cover (a band the whole leaf tall) keeps
    // the leaf's shape instead, a page standing on the screen, and so does
    // an opener set in a column, whose column is the leaf's width scaled.
    const fillWidth = bandPx >= leaf.height || inColumn ? leaf.width : Math.max(leaf.width, pageWidthPx / k);
    slot = rebaseToBand(slot, leaf, { height: bandPx, container: askedPx, fillWidth }, dpi);
  }
  return {
    advancedDesign: {
      ...advancedDesign,
      ...(bandPx > 0 ? { minHeight: px(bandPx * k) } : {}),
      slot: scaleDimensions(slot, k) as DesignSlot,
    },
    ...(inColumn ? { span: 'column' as const } : {}),
  };
}

/** The face the viewer sets a part title in: the H1's, with its leading as
 *  a multiple of the type size. An absolute H1 line height below the type
 *  size is a grid step the heading snaps across, not a leading a free-set
 *  title can use — lines that tight would overprint — so it falls back to
 *  1.2 like any unitless text. */
export function partTitleFace(headings: ResolvedHeadingsConfig, dpi: number) {
  const h1 = headings.levels.find((l) => l.level === 1) ?? headings.levels[0]!;
  const fontSizePx = dimensionToPx(h1.fontSize, dpi);
  const absLinePx = h1.lineHeight.unit === 'em' ? 0 : dimensionToPx(h1.lineHeight, dpi);
  const lineHeight = h1.lineHeight.unit === 'em'
    ? h1.lineHeight.value
    : absLinePx >= fontSizePx && fontSizePx > 0 ? absLinePx / fontSizePx : 1.2;
  return { h1, fontSizePx, lineHeight, linePx: fontSizePx * lineHeight };
}

/** The width of `text` in `font`, px, in the language the viewer's layout
 *  measures in (#770): `lang` when the document is shaped in its own
 *  (`configShapingLanguage`), on a context of that language; the host's
 *  otherwise, through the engine as before. */
export function widthIn(lang: string | undefined, text: string, font: string): number {
  if (lang === undefined) return measureGlyphWidth(text, font);
  return measureInLanguage(lang, text, font) ?? measureGlyphWidth(text, font);
}

/** Lines a part title takes at `widthPx` in the given font, word-wrapped
 *  the way the design text element wraps it; forced breaks (`\\` in the
 *  title, `\n` here) start a new line. `lang`: see {@link widthIn}. */
export function countTitleLines(text: string, font: string, widthPx: number, lang?: string): number {
  const space = widthIn(lang, ' ', font);
  let lines = 0;
  for (const segment of text.split('\n')) {
    const words = segment.split(/\s+/).filter(Boolean);
    lines++;
    let x = 0;
    for (const word of words) {
      const w = widthIn(lang, word, font);
      if (x > 0 && x + space + w > widthPx) {
        lines++;
        x = w;
      } else {
        x += (x > 0 ? space : 0) + w;
      }
    }
  }
  return Math.max(lines, 1);
}

/** A part divider on the viewer's surface: its title set as type at the top
 *  of the scroll unit, the part's own content (the chapters it lists) below
 *  it. In print the title band is purely decorative and `parts.margins`
 *  keeps the body clear of it — geometry measured for a leaf the viewer
 *  does not have, so it supplies both here: a band anchored to the top of
 *  the page and a matching top margin. */
export function viewerPartDesign(face: ReturnType<typeof partTitleFace>, bandPx: number): DesignSlot {
  const { h1, lineHeight } = face;
  return {
    elements: [
      {
        kind: 'text',
        id: 'htmlViewerPartTitle',
        placement: {
          anchor: { to: 'container', edge: 'top-left' },
          offset: { x: { value: 0, unit: 'px' }, y: { value: 0, unit: 'px' } },
          size: { width: 'fill', height: { value: bandPx, unit: 'px' } },
        },
        // Joined as the print part page joins them (the H1's separator).
        content: `{number}${h1.numberSeparator ?? ' '}{titleText}`,
        fontFamily: h1.fontFamily,
        fontSize: h1.fontSize,
        fontWeight: h1.fontWeight,
        italic: h1.italic,
        color: h1.color,
        align: 'left',
        verticalAlign: 'top',
        lineHeight,
        overflow: 'wrap',
        hyphenate: true,
      },
    ],
  };
}

/** Whether a part design paints its page: a box with a fill, the panel
 *  the divider's type is set on in print. */
export function paintsPage(design: DesignSlot | undefined): boolean {
  return (design?.elements ?? []).some((el) => el.kind === 'box' && Boolean(el.style?.backgroundColor));
}

/** `value` without its colour fields, at any depth — a part's body style as
 *  it reads off the viewer's plain divider. */
export function withoutColors(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutColors);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/colou?r$/i.test(k)) continue;
    out[k] = withoutColors(v);
  }
  return out;
}
