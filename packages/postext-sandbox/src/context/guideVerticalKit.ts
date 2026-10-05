import type { CalloutStyleConfig } from 'postext';
import {
  DISPLAY, GUIDE_COVER_RESOURCE_ID, M_BOTTOM, M_OUTER, PAGE_H, PAGE_W,
  at, box, col, image, mm, pt, rule, slot, text,
} from './guideKit';

// The designs the two vertical editions of the guide share — the Chinese
// one (`guideConfigZh.ts`) and the Japanese one (`guideConfigJa.ts`): a
// cover with a title strip down the right of the sheet, the back cover, the
// contents page, the chapter opener's band down the right edge, the part
// divider, the contents and the boxes. Each edition passes its faces and
// its words; the geometry is the same.
//
// On a vertical page the flow is a horizontal page turned a quarter turn
// clockwise, so every design below is written in that turned frame: x runs
// down the sheet, y leftward from its right edge; a design's `width` is a
// length down the sheet and its `height` a breadth across it; `below` is
// the next column to the left.

/** The two faces of a vertical edition: the text (mincho, song) and the
 *  sans for headings, labels and captions (gothic, hei). */
export interface VerticalFaces {
  text: string;
  sans: string;
}

/** Breadth of a chapter opener's band inside the type area. */
const OPENER_W = 64;
/** Breadth of the cover artwork, from the left bleed to the title strip
 *  (`COVER_ZH_VW` at 5 units a millimetre). */
const COVER_ART_W = 148;

/** The cover: a vertical title strip down the right of the sheet — the
 *  kicker, "Postext" turned down the column, a gilt rule and the subtitle,
 *  and the publisher's line at its foot — beside the art, a page of this
 *  book drawn as the engine lays it out, bled off the left edge. */
export function verticalCover(f: VerticalFaces) {
  return {
    enabled: true,
    minHeight: mm(PAGE_W),
    slot: slot(
      box('coverBg', 'night', { anchor: at('bleed', 'top-left') }),
      // A picture stands upright on a vertical page, its box sized in the
      // flow with width and height swapped: 286 mm down the sheet, 148 mm
      // across it, from the left bleed to the strip.
      image('coverArt', GUIDE_COVER_RESOURCE_ID, { anchor: at('bleed', 'top-left'), offset: [0, PAGE_W + 6 - COVER_ART_W], width: PAGE_H + 6, height: COVER_ART_W }),
      text('coverKicker', '{attr.kicker}', {
        anchor: at('page', 'top-left'), offset: [40, 12], width: 110,
        size: 9, family: f.sans, weight: 700, color: 'gilt', tracking: 1,
      }),
      // The title is the Latin word "Postext", turned down the column.
      text('coverTitle', '{title}', {
        anchor: at('#coverKicker', 'below'), offset: [0, 2], width: 200,
        size: 76, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1,
      }),
      rule('coverRule', 'gilt', { anchor: at('#coverTitle', 'below'), offset: [0, 3], width: 34, thickness: 2 }),
      text('coverSubtitle', '{subtitle}', {
        anchor: at('#coverRule', 'below'), offset: [0, 3], width: 150,
        size: 15, family: f.text, color: 'white', lineHeight: 1.3, tracking: 2,
      }),
      text('coverPublisher', '{attr.publisher}', {
        anchor: at('page', 'top-left'), offset: [160, 12], width: PAGE_H - 160 - M_BOTTOM,
        size: 7.5, family: f.sans, color: 'mist', lineHeight: 1.6,
      }),
    ),
  };
}

/** The back cover, the last page: the night of the front, a strip down the
 *  right as on the cover — the three part colours as bands, "Postext"
 *  turned down the column, a gilt rule and a few lines on the engine — and
 *  where to find it at the foot of the strip. */
export function verticalBackCover(f: VerticalFaces) {
  const band = (id: string, color: 'main-color' | 'gilt' | 'vermilion', k: number) =>
    box(id, color, { anchor: at('page', 'top-left'), offset: [40 + k * 14, 12], width: 12, height: 2.5 });
  return {
    enabled: true,
    minHeight: mm(PAGE_W),
    slot: slot(
      box('backBg', 'night', { anchor: at('bleed', 'top-left') }),
      band('backBandFoundations', 'main-color', 0),
      band('backBandCraft', 'gilt', 1),
      band('backBandPractice', 'vermilion', 2),
      text('backTitle', '{attr.book}', {
        anchor: at('page', 'top-left'), offset: [40, 20], width: 200,
        size: 60, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1,
      }),
      rule('backRule', 'gilt', { anchor: at('#backTitle', 'below'), offset: [0, 3], width: 34, thickness: 2 }),
      text('backBlurb', '{attr.blurb}', {
        anchor: at('#backRule', 'below'), offset: [0, 4], width: 150,
        size: 13, family: f.text, color: 'white', lineHeight: 1.7, tracking: 1,
      }),
      text('backSite', '{attr.licence}', {
        anchor: at('page', 'top-left'), offset: [200, 12], width: PAGE_H - 200 - M_BOTTOM,
        size: 7.5, family: f.sans, color: 'mist', lineHeight: 1.6,
      }),
    ),
  };
}

/** The contents page: a part-colour stripe down the right edge, the title
 *  in the first column and a short rule under it. */
export function verticalContentsOpener(f: VerticalFaces) {
  return {
    enabled: true,
    minHeight: mm(22),
    slot: slot(
      box('frontStripe', 'band', { anchor: at('bleed', 'top-left'), height: 5 }),
      text('frontTitle', '{titleText}', {
        anchor: at('container', 'top-left'), offset: [0, 0], width: 80,
        size: 30, family: f.sans, weight: 700, lineHeight: 1.2, tracking: 8,
      }),
      rule('frontRule', 'band', { anchor: at('#frontTitle', 'below'), offset: [0, 4], width: 34, thickness: 2 }),
    ),
  };
}

/** A chapter opener: a band in the part colour down the right edge of the
 *  page, bled off the head, the foot and the fore-edge, holding the kicker
 *  (第三章 · 技艺), a white rule, the title and the lead in columns from the
 *  right, with the chapter's number set large at the foot of the band. */
export function verticalChapterOpener(f: VerticalFaces, kicker = '{chapterNumber} · {partTitle}') {
  const band = 3 + M_OUTER + OPENER_W;
  return {
    enabled: true,
    minHeight: mm(OPENER_W + 6),
    slot: slot(
      box('openerBand', 'band', { anchor: at('bleed', 'top-left'), height: band }),
      box('openerFoot', 'ink', { anchor: at('bleed', 'top-left'), offset: [0, band], height: 1.6 }),
      // The number in the brand's Fraunces, as in the Latin editions,
      // standing upright in one cell (the kicker reads it 第三章).
      text('openerNumber', '{numberDecimal}', {
        anchor: at('container', 'top-right'), offset: [0, -2], width: 48,
        size: 104, family: DISPLAY, weight: 800, color: 'white', align: 'right', lineHeight: 1,
      }),
      text('openerKicker', kicker, {
        anchor: at('container', 'top-left'), offset: [0, 1], width: 120,
        size: 9, family: f.sans, weight: 700, color: 'white', tracking: 1, overflow: 'ellipsis-end',
      }),
      rule('openerRule', 'white', { anchor: at('#openerKicker', 'below'), offset: [0, 3], width: 22, thickness: 1.5 }),
      text('openerTitle', '{titleText}', {
        anchor: at('#openerRule', 'below'), offset: [0, 4], width: 150,
        size: 26, family: f.sans, weight: 700, color: 'white', lineHeight: 1.25,
      }),
      text('openerLead', '{attr.lead}', {
        anchor: at('#openerTitle', 'below'), offset: [0, 4], width: 150,
        size: 10, family: f.text, color: 'white', lineHeight: 1.75,
      }),
    ),
  };
}

/** A part divider: the page in the part colour, a band of ink down its left
 *  edge; from the right, the label (第二篇, 第二部), a white rule and the
 *  title set large, and the part's chapters listed further left; the book's
 *  name at the foot of the first column. */
export function verticalPartDesign(f: VerticalFaces, label: string, book: string) {
  return slot(
    box('partBg', 'band', { anchor: at('bleed', 'top-left') }),
    box('partNight', 'ink', { anchor: at('bleed', 'bottom-left'), height: 60 }),
    text('partLabel', label, {
      anchor: at('page', 'top-left'), offset: [46, M_OUTER], width: 60,
      size: 13, family: f.sans, weight: 700, color: 'white', tracking: 4,
    }),
    rule('partRule', 'white', { anchor: at('#partLabel', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
    text('partTitle', '{titleText}', {
      anchor: at('#partRule', 'below'), offset: [0, 6], width: 160,
      size: 64, family: f.sans, weight: 700, color: 'white', lineHeight: 1.1, tracking: 10,
    }),
    text('partBook', book, {
      anchor: at('page', 'bottom-left'), offset: [46, -24], width: 100,
      size: 8, family: f.sans, weight: 700, color: 'mist', tracking: 1,
    }),
  );
}

/** The names and titles of the four box styles, in the edition's words. */
export interface VerticalCalloutNames {
  try: { name: string; title: string };
  note: { name: string; title: string };
  quote: { name: string };
  figures: { name: string; title: string };
}

/** The four box styles: a hands-on step (`try`), a technical note, a pull
 *  quote under a large opening corner bracket and a dark panel of key
 *  figures across both tiers. `bodyAlign` is how the sans boxes set their
 *  lines: ragged (`'left'`, at the foot of the column) or justified. */
export function verticalCallouts(f: VerticalFaces, names: VerticalCalloutNames, bodyAlign: 'left' | 'justify'): CalloutStyleConfig[] {
  const label = { fontFamily: f.sans, fontSize: pt(7.5), fontWeight: 700, letterSpacing: pt(0) };
  const sansBody = {
    fontFamily: f.sans, fontSize: pt(8.3), lineHeight: pt(13.5), color: col('ink'), boldColor: col('ink'),
    textAlign: bodyAlign, paragraphSpacing: true, firstLineIndent: mm(0),
  };
  return [
    {
      // A hands-on step next to the prose, its stripe across the head of
      // the box (the flow's left edge is the sheet's head).
      id: 'try', name: names.try.name, title: names.try.title,
      span: 'column', placement: 'here',
      backgroundEnabled: true, background: col('tint'), border: { enabled: false }, borderRadius: mm(1.2),
      padding: { top: mm(3), right: mm(3.5), bottom: mm(2.6), left: mm(4.5) },
      stripe: { enabled: true, side: 'left', width: pt(3), color: col('band') },
      icon: { kind: 'none' },
      titleStyle: { ...label, color: col('band'), gap: mm(1.6) },
      body: sansBody,
      lists: { color: col('band') },
      marginTop: pt(4), marginBottom: pt(9), keepTogether: true,
    },
    {
      id: 'note', name: names.note.name, title: names.note.title,
      span: 'column', placement: 'here',
      backgroundEnabled: true, background: col('panel'), border: { enabled: false }, borderRadius: mm(1.2),
      padding: { top: mm(3), right: mm(3.5), bottom: mm(2.6), left: mm(3.5) },
      icon: { kind: 'none' },
      titleStyle: { ...label, color: col('main-color'), gap: mm(1.6) },
      body: sansBody,
      lists: { color: col('main-color') },
      marginTop: pt(4), marginBottom: pt(9), keepTogether: true,
    },
    {
      // The quote in the bold of the text face and the part colour, under a
      // large opening corner bracket, the vertical form of 『 (neither
      // Chinese nor Japanese has an italic to set a pull quote in).
      id: 'quote', name: names.quote.name,
      span: 'column', placement: 'here',
      backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(1), right: mm(0), bottom: mm(2.4), left: mm(0) },
      icon: { kind: 'glyph', glyph: '﹃', fontFamily: f.text, fontWeight: 700, size: mm(12), color: col('band'), align: 'top', position: 'inline' },
      titleStyle: { gap: mm(1) },
      body: {
        fontFamily: f.text, fontSize: pt(13), lineHeight: pt(21), fontWeight: 700, boldFontWeight: 700, color: col('band'), boldColor: col('ink'),
        italicColor: col('band'), textAlign: 'left', paragraphSpacing: false, firstLineIndent: mm(0),
      },
      marginTop: pt(6), marginBottom: pt(10), keepTogether: true,
    },
    {
      // A dark panel across both tiers, its text in three tiers of its own.
      id: 'figures', name: names.figures.name, title: names.figures.title,
      span: 'page', placement: 'here',
      backgroundEnabled: true, background: col('ink'), border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(4), right: mm(6), bottom: mm(3.5), left: mm(6) },
      icon: { kind: 'none' }, columnGap: mm(8),
      titleStyle: { ...label, color: col('gilt'), gap: mm(3) },
      body: {
        fontFamily: f.sans, fontSize: pt(8.3), lineHeight: pt(13.5), color: col('mist'), boldColor: col('white'),
        textAlign: bodyAlign, paragraphSpacing: true, firstLineIndent: mm(0),
      },
      marginTop: pt(4), marginBottom: pt(8), keepTogether: true,
    },
  ];
}

/** The contents on one page, one column to an entry: the chapter's number
 *  and title from the head of the column, a dotted leader down to the folio
 *  at its foot, and the chapter's summary in the next column; a part opens
 *  with a square in its colour and `partRow` (its label and name).
 *  `uprightSummary` sets the summaries upright (a face with no italic
 *  would otherwise be slanted by the renderer). */
export function verticalToc(f: VerticalFaces, partRow: string, uprightSummary = false) {
  return {
    levels: [{
      level: 1, fontFamily: f.sans, fontSize: pt(11), lineHeight: pt(14), fontWeight: 700, color: col('ink'),
      numberWidth: mm(14), numberGap: mm(3), numberFontFamily: f.sans, numberFontSize: pt(9), numberColor: col('band'), marginTop: pt(1),
    }],
    unnumbered: { fontFamily: f.text, fontWeight: 400, color: col('ink') },
    pageNumber: { fontFamily: f.sans, fontSize: pt(9), fontWeight: 700, color: col('ink'), width: mm(14) },
    leader: { enabled: true, char: '·', gap: mm(1.5) },
    subtitle: { enabled: true, attr: 'summary', fontFamily: f.text, fontSize: pt(8), ...(uprightSummary ? { italic: false } : {}), color: col('muted'), indent: mm(17) },
    parts: {
      enabled: true, height: pt(14), marginTop: pt(6), marginBottom: pt(2),
      design: slot(
        box('tocPartBand', 'band', { anchor: at('container', 'left'), width: 3, height: 3 }),
        text('tocPart', partRow, {
          anchor: at('#tocPartBand', 'right-of'), offset: [3, 0], width: 150,
          size: 9, family: f.sans, weight: 700, color: 'band', tracking: 1,
        }),
      ),
    },
  };
}
