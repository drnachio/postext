import type {
  CalloutStyleConfig,
  DesignTextElement,
  HeadingStyleConfig,
  ParagraphStyleConfig,
  PostextConfig,
} from 'postext';
import { defaultResourceTypes } from 'postext';
import {
  DISPLAY, GUIDE_COVER_RESOURCE_ID, GUIDE_FOLIO, M_BOTTOM, M_INNER, M_OUTER, M_TOP, PAGE_H, PAGE_W,
  at, box, col, colorPalette, em, image, mm, pt, rule, slot, text, type PaletteId,
} from './guideKit';

// The Chinese edition of the Postext guide: a vertical book bound on the
// right, as a Chinese book was set before horizontal type took over the
// mainland — columns read top to bottom and right to left, the spine on
// the right, page 1 on the left of it and the spreads turning leftward. It
// keeps the Latin editions' page, palette, part colours and cover art, and
// sets its text as a mainland book: Noto Serif SC (思源宋体) for the text,
// Noto Sans SC (思源黑体) for headings, labels and captions, justified with
// a two-character indent, Kaiming punctuation and GB line breaking, the
// quotation marks turned into the corner brackets 『』「」 down the column.
//
// On a vertical page the flow is a horizontal page turned a quarter turn
// clockwise, so every design below is written in that turned frame: x runs
// down the sheet, y leftward from its right edge; a design's `width` is a
// length down the sheet and its `height` a breadth across it; `below` is
// the next column to the left. The two columns of the layout are two tiers
// (栏) stacked on the page; chapters open with a band down the right edge,
// the running heads stand in the fore-edge margin, and the folios are
// Chinese numerals (一〇三). Figures, tables and captions stay upright and
// horizontal, as in most vertical books (clreq §2.1.1).

/** 思源宋体: the text. */
const ZH_TEXT = 'Noto Serif SC';
/** 思源黑体: headings, labels, captions, boxes. */
const ZH_SANS = 'Noto Sans SC';

/** Body size and line pitch, in points. */
const BODY = 9.5;
const LEAD = 16;
/** Characters down a tier: two tiers of whole characters fill the 234 mm
 *  type area, the gap between them about four characters. */
const TIER_CHARS = 33;
const TEXT_H = PAGE_H - M_TOP - M_BOTTOM;
const GUTTER = TEXT_H - (2 * TIER_CHARS * BODY * 25.4) / 72;

/** Breadth of a chapter opener's band inside the type area. */
const OPENER_W = 64;
/** Breadth of the cover artwork, from the left bleed to the title strip
 *  (`COVER_ZH_VW` at 5 units a millimetre). */
const COVER_ART_W = 148;

const BOOK = 'Postext指南';

/** Chinese numerals for the folios and the contents: 一〇三. */
const PAGE_NUMBERS = 'cjk-decimal';

/** The cover: a vertical title strip down the right of the sheet — the
 *  kicker, "Postext" turned down the column, a gilt rule and the subtitle,
 *  and the publisher's line at its foot — beside the art, a page of this
 *  book drawn as the engine lays it out, bled off the left edge. */
function coverDesign() {
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
        size: 9, family: ZH_SANS, weight: 700, color: 'gilt', tracking: 1,
      }),
      // The title is the Latin word "Postext", turned down the column.
      text('coverTitle', '{title}', {
        anchor: at('#coverKicker', 'below'), offset: [0, 2], width: 200,
        size: 76, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1,
      }),
      rule('coverRule', 'gilt', { anchor: at('#coverTitle', 'below'), offset: [0, 3], width: 34, thickness: 2 }),
      text('coverSubtitle', '{subtitle}', {
        anchor: at('#coverRule', 'below'), offset: [0, 3], width: 150,
        size: 15, family: ZH_TEXT, color: 'white', lineHeight: 1.3, tracking: 2,
      }),
      text('coverPublisher', '{attr.publisher}', {
        anchor: at('page', 'top-left'), offset: [160, 12], width: PAGE_H - 160 - M_BOTTOM,
        size: 7.5, family: ZH_SANS, color: 'mist', lineHeight: 1.6,
      }),
    ),
  };
}

/** The back cover, the last page: the night of the front, a strip down the
 *  right as on the cover — the three part colours as bands, "Postext"
 *  turned down the column, a gilt rule and a few lines on the engine — and
 *  where to find it at the foot of the strip. */
function backCoverDesign() {
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
        size: 13, family: ZH_TEXT, color: 'white', lineHeight: 1.7, tracking: 1,
      }),
      text('backSite', '{attr.licence}', {
        anchor: at('page', 'top-left'), offset: [200, 12], width: PAGE_H - 200 - M_BOTTOM,
        size: 7.5, family: ZH_SANS, color: 'mist', lineHeight: 1.6,
      }),
    ),
  };
}

/** The contents page: a part-colour stripe down the right edge, the title
 *  in the first column and a short rule under it. */
function frontOpener() {
  return {
    enabled: true,
    minHeight: mm(22),
    slot: slot(
      box('frontStripe', 'band', { anchor: at('bleed', 'top-left'), height: 5 }),
      text('frontTitle', '{titleText}', {
        anchor: at('container', 'top-left'), offset: [0, 0], width: 80,
        size: 30, family: ZH_SANS, weight: 700, lineHeight: 1.2, tracking: 8,
      }),
      rule('frontRule', 'band', { anchor: at('#frontTitle', 'below'), offset: [0, 4], width: 34, thickness: 2 }),
    ),
  };
}

/** A chapter opener: a band in the part colour down the right edge of the
 *  page, bled off the head, the foot and the fore-edge, holding the kicker
 *  (第三章 · 技艺), a white rule, the title and the lead in columns from the
 *  right, with the chapter's number set large at the foot of the band. */
function chapterOpener() {
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
      text('openerKicker', '{chapterNumber} · {partTitle}', {
        anchor: at('container', 'top-left'), offset: [0, 1], width: 120,
        size: 9, family: ZH_SANS, weight: 700, color: 'white', tracking: 1, overflow: 'ellipsis-end',
      }),
      rule('openerRule', 'white', { anchor: at('#openerKicker', 'below'), offset: [0, 3], width: 22, thickness: 1.5 }),
      text('openerTitle', '{titleText}', {
        anchor: at('#openerRule', 'below'), offset: [0, 4], width: 150,
        size: 26, family: ZH_SANS, weight: 700, color: 'white', lineHeight: 1.25,
      }),
      text('openerLead', '{attr.lead}', {
        anchor: at('#openerTitle', 'below'), offset: [0, 4], width: 150,
        size: 10, family: ZH_TEXT, color: 'white', lineHeight: 1.75,
      }),
    ),
  };
}

/** A part divider: the page in the part colour, a band of ink down its left
 *  edge; from the right, the label (第二篇), a white rule and the title set
 *  large, and the part's chapters listed further left. */
function partDesign() {
  return slot(
    box('partBg', 'band', { anchor: at('bleed', 'top-left') }),
    box('partNight', 'ink', { anchor: at('bleed', 'bottom-left'), height: 60 }),
    text('partLabel', '第{numberHan}篇', {
      anchor: at('page', 'top-left'), offset: [46, M_OUTER], width: 60,
      size: 13, family: ZH_SANS, weight: 700, color: 'white', tracking: 4,
    }),
    rule('partRule', 'white', { anchor: at('#partLabel', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
    text('partTitle', '{titleText}', {
      anchor: at('#partRule', 'below'), offset: [0, 6], width: 160,
      size: 64, family: ZH_SANS, weight: 700, color: 'white', lineHeight: 1.1, tracking: 10,
    }),
    text('partBook', BOOK, {
      anchor: at('page', 'bottom-left'), offset: [46, -24], width: 100,
      size: 8, family: ZH_SANS, weight: 700, color: 'mist', tracking: 1,
    }),
  );
}

/** A text element set down the fore-edge margin (see the configuration
 *  reference, "Vertical text elements"): four characters below the head of
 *  the type area, or ending five above its foot. */
function foreEdge(
  id: string,
  content: string,
  o: { edge: 'top' | 'bottom'; size: number; color: PaletteId; weight?: number; parity?: 'odd' | 'even'; pages: 'body' | 'opener' },
): DesignTextElement {
  return {
    kind: 'text', id, content, writingMode: 'vertical-rl',
    pages: o.pages, ...(o.parity ? { parity: o.parity } : {}),
    placement: { anchor: at('outer', o.edge), offset: { x: mm(0), y: em(o.edge === 'top' ? 4 : -5) }, size: { width: 'auto', height: 'auto' } },
    fontFamily: ZH_SANS, fontSize: pt(o.size), fontWeight: o.weight ?? 400, italic: false,
    color: col(o.color), align: 'left', verticalAlign: 'middle', lineHeight: 1.2, overflow: 'clip',
    letterSpacing: pt(1),
  };
}

/** Fore-edge heads, as vertical books set them: the book's name down the
 *  outer margin of a verso, the chapter's number and title down that of a
 *  recto, and the folio at the foot of the margin in Chinese numerals — in
 *  white on an opener, where the chapter's band covers the margin. */
function runningHeads() {
  return slot(
    // The blank verso that faces a part divider is set in the part's own
    // colour (a blank parity page before a part page already takes its
    // palette), so the divider opens as a spread. Parts break `always-odd`
    // and chapters open on versos, so the only blank versos in the book
    // are those.
    box('partFacing', 'band', { anchor: at('bleed', 'top-left'), parity: 'even', pages: 'blank' }),
    foreEdge('headEven', BOOK, { edge: 'top', size: 7.6, color: 'muted', parity: 'even', pages: 'body' }),
    foreEdge('headOdd', '{chapterNumber}　{chapterTitle}', { edge: 'top', size: 7.6, color: 'muted', parity: 'odd', pages: 'body' }),
    foreEdge('folio', '{pageNumber}', { edge: 'bottom', size: 8.5, weight: 700, color: 'band', pages: 'body' }),
    foreEdge('folioOpener', '{pageNumber}', { edge: 'bottom', size: 8.5, weight: 700, color: 'white', pages: 'opener' }),
  );
}

function headingStyles(): HeadingStyleConfig[] {
  const empty = slot();
  return [
    {
      id: 'cover', name: '封面', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: coverDesign(),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
      // The colophon on the back of the cover stands in the lower left of
      // the page, where the book's last columns end.
      margins: { top: mm(PAGE_H - 132), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(PAGE_W - M_INNER - 92) },
    },
    {
      id: 'contents', name: '目录', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: frontOpener(),
      layout: { layoutType: 'single' },
    },
    {
      // The last page: Folio turns it as the back cover.
      id: 'back', name: '封底', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'even' },
      advancedDesign: backCoverDesign(),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
    },
  ];
}

function paragraphStyles(): ParagraphStyleConfig[] {
  return [
    { id: 'colophon', name: '版权页', fontFamily: ZH_SANS, fontSize: pt(7.5), lineHeight: pt(12.5), textAlign: 'justify', firstLineIndent: mm(0), spaceBetween: pt(5), color: col('muted'), boldColor: col('ink') },
    { id: 'standfirst', name: '导语', fontFamily: ZH_TEXT, fontSize: pt(12), lineHeight: pt(20), textAlign: 'justify', firstLineIndent: mm(0), spaceBetween: pt(6), marginBottom: pt(6), color: col('ink'), boldColor: col('band') },
    // Right-aligned is foot-aligned down a column: a signature at the foot.
    { id: 'signature', name: '署名', fontFamily: ZH_SANS, fontSize: pt(8), lineHeight: pt(12), textAlign: 'right', firstLineIndent: mm(0), marginTop: pt(4), color: col('muted') },
  ];
}

function calloutStyles(): CalloutStyleConfig[] {
  const label = { fontFamily: ZH_SANS, fontSize: pt(7.5), fontWeight: 700, letterSpacing: pt(0) };
  // Ragged at the foot, as the Latin boxes are ragged right: the boxes
  // quote code, and a justified column of Chinese would be spread wide
  // before a long name.
  const sansBody = {
    fontFamily: ZH_SANS, fontSize: pt(8.3), lineHeight: pt(13.5), color: col('ink'), boldColor: col('ink'),
    textAlign: 'left' as const, paragraphSpacing: true, firstLineIndent: mm(0),
  };
  return [
    {
      // 试一试: a hands-on step next to the prose, its stripe across the
      // head of the box (the flow's left edge is the sheet's head).
      id: 'try', name: '试一试', title: '在Sandbox中试一试',
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
      id: 'note', name: '技术说明', title: '技术说明',
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
      // 醒目引文: the quote in the bold of the text face and the part
      // colour, under a large opening corner bracket, the vertical form of
      // 『 (Chinese has no italic to set a pull quote in).
      id: 'quote', name: '醒目引文',
      span: 'column', placement: 'here',
      backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(1), right: mm(0), bottom: mm(2.4), left: mm(0) },
      icon: { kind: 'glyph', glyph: '﹃', fontFamily: ZH_TEXT, fontWeight: 700, size: mm(12), color: col('band'), align: 'top', position: 'inline' },
      titleStyle: { gap: mm(1) },
      body: {
        fontFamily: ZH_TEXT, fontSize: pt(13), lineHeight: pt(21), fontWeight: 700, boldFontWeight: 700, color: col('band'), boldColor: col('ink'),
        italicColor: col('band'), textAlign: 'left', paragraphSpacing: false, firstLineIndent: mm(0),
      },
      marginTop: pt(6), marginBottom: pt(10), keepTogether: true,
    },
    {
      // 数字一览: a dark panel across both tiers, its text in three tiers
      // of its own.
      id: 'figures', name: '数字一览', title: '数字一览',
      span: 'page', placement: 'here',
      backgroundEnabled: true, background: col('ink'), border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(4), right: mm(6), bottom: mm(3.5), left: mm(6) },
      icon: { kind: 'none' }, columnGap: mm(8),
      titleStyle: { ...label, color: col('gilt'), gap: mm(3) },
      body: {
        fontFamily: ZH_SANS, fontSize: pt(8.3), lineHeight: pt(13.5), color: col('mist'), boldColor: col('white'),
        textAlign: 'left', paragraphSpacing: true, firstLineIndent: mm(0),
      },
      marginTop: pt(4), marginBottom: pt(8), keepTogether: true,
    },
  ];
}

/** The contents on one page, one column to an entry: 第三章 and the title from the head
 *  of the column, a dotted leader down to the folio at its foot, and the
 *  chapter's summary in the next column; a part opens with a square in its
 *  colour and its name. */
function toc() {
  return {
    levels: [{
      level: 1, fontFamily: ZH_SANS, fontSize: pt(11), lineHeight: pt(14), fontWeight: 700, color: col('ink'),
      numberWidth: mm(14), numberGap: mm(3), numberFontFamily: ZH_SANS, numberFontSize: pt(9), numberColor: col('band'), marginTop: pt(1),
    }],
    unnumbered: { fontFamily: ZH_TEXT, fontWeight: 400, color: col('ink') },
    pageNumber: { fontFamily: ZH_SANS, fontSize: pt(9), fontWeight: 700, color: col('ink'), width: mm(14) },
    leader: { enabled: true, char: '·', gap: mm(1.5) },
    subtitle: { enabled: true, attr: 'summary', fontFamily: ZH_TEXT, fontSize: pt(8), color: col('muted'), indent: mm(17) },
    parts: {
      enabled: true, height: pt(14), marginTop: pt(6), marginBottom: pt(2),
      design: slot(
        box('tocPartBand', 'band', { anchor: at('container', 'left'), width: 3, height: 3 }),
        text('tocPart', '第{numberHan}篇 · {titleText}', {
          anchor: at('#tocPartBand', 'right-of'), offset: [3, 0], width: 150,
          size: 9, family: ZH_SANS, weight: 700, color: 'band', tracking: 1,
        }),
      ),
    },
  };
}

/** The Chinese edition's configuration. */
export function createChineseGuideConfig(): PostextConfig {
  return {
    locale: 'zh-Hans',
    page: {
      sizePreset: '21x28', width: mm(PAGE_W), height: mm(PAGE_H),
      margins: { top: mm(M_TOP), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(M_OUTER), mirror: true },
      pageNumbering: { format: PAGE_NUMBERS, startAt: 1 },
      // `binding` stays 'auto': right, for a vertical book.
    },
    layout: { layoutType: 'double', gutterWidth: mm(GUTTER), writingMode: 'vertical-rl' },
    bodyText: {
      // 9.5 pt on 16 pt: 33 characters down a tier, a line gap of about
      // 0.7 em; a two-character indent and no space between paragraphs.
      fontFamily: ZH_TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), textAlign: 'justify',
      firstLineIndent: { value: 2, unit: 'em' }, indentAfterHeading: true, paragraphSpacing: false,
      color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
      referenceColor: col('band'), referenceBold: true, referenceItalic: false,
      hyphenation: { enabled: false },
      avoidWidows: true, avoidOrphans: true, avoidRunts: true, optimalLineBreaking: true,
    },
    // Mainland conventions, spelled out (they are also what `locale:
    // 'zh-Hans'` resolves to): GB/T 15834 line breaking, Kaiming
    // punctuation with adjacent marks compressed, a quarter em between Han
    // and Latin, numbers of up to two digits upright in one cell.
    cjk: {
      region: 'mainland', lineBreak: 'gb', punctuationWidth: 'kaiming', compressAdjacent: true, trimLineStart: true,
      latinSpacing: { value: 0.25, unit: 'em' }, uprightDigits: 2,
    },
    headings: {
      fontFamily: ZH_SANS, color: col('ink'), keepWithNext: true,
      levels: [
        {
          // Chapters open on a verso, the right-hand page of a right-bound
          // spread, across from their first recto.
          level: 1, fontSize: pt(26), lineHeight: pt(32), fontWeight: 700, span: 'page',
          breakBefore: { enabled: true, parity: 'even' }, numberingTemplate: '第{1:一}章', numberSeparator: '　',
          advancedDesign: chapterOpener(),
        },
        {
          level: 2, fontFamily: ZH_SANS, fontSize: pt(12.5), lineHeight: pt(18), fontWeight: 700, color: col('band'),
          numberingTemplate: '', marginTop: pt(18), marginBottom: pt(5),
        },
        {
          level: 3, fontFamily: ZH_SANS, fontSize: pt(10.5), lineHeight: pt(16), fontWeight: 700, color: col('band'),
          numberingTemplate: '', marginTop: pt(12), marginBottom: pt(3),
        },
        {
          level: 4, fontFamily: ZH_SANS, fontSize: pt(9.5), lineHeight: pt(16), fontWeight: 700, color: col('band'),
          numberingTemplate: '', marginTop: pt(10), marginBottom: pt(2),
        },
      ],
    },
    headingStyles: headingStyles(),
    paragraphStyles: paragraphStyles(),
    calloutStyles: calloutStyles(),
    parts: {
      // A part opens on a recto (the left-hand page) facing a verso in its
      // colour, and its first chapter opens on the back of the divider.
      breakBefore: { parity: 'always-odd' },
      breakAfter: { enabled: true, parity: 'even' },
      // The chapters of the part stand left of its title: on a recto of a
      // right-bound book the inner margin (`left` in a mirrored page) is
      // the sheet's right.
      margins: { top: mm(46), bottom: mm(40), left: mm(86), right: mm(66) },
      design: partDesign(),
      bodyStyle: {
        fontFamily: ZH_TEXT, fontSize: pt(11), lineHeight: pt(18), color: col('white'), textAlign: 'left',
        numberColor: col('white'), bulletColor: col('white'),
        // 第三章 排好每一行, one chapter to a column.
        orderedLists: {
          numberFormat: 'simp-chinese-informal', prefix: '第', separator: '章', gap: mm(3), indent: mm(0),
          fontFamily: ZH_SANS, numberFontSize: pt(9), itemSpacing: pt(2),
        },
      },
    },
    toc: toc(),
    // On screen the book reads as one scroll: no section dividers (the parts
    // still colour their chapters).
    htmlViewer: { overrides: { parts: { page: false } } },
    folio: GUIDE_FOLIO,
    header: runningHeads(),
    footer: slot(),
    captionStyle: {
      // 图3-1　标题, set across under the upright figure: the label and
      // number solid, an ideographic space before the description.
      fontFamily: ZH_SANS, fontSize: pt(7.6), color: col('ink'), align: 'left', gap: mm(1.8),
      labelBold: true, labelColor: col('band'), descriptionItalic: false, labelNumberGap: '', labelSeparator: '　',
      note: { fontSize: pt(6.6), color: col('muted'), italic: false, gap: mm(0.6) },
    },
    tableStyle: {
      bodyFontFamily: ZH_SANS, bodyFontSize: pt(7.8), bodyColor: col('ink'),
      headerFontFamily: ZH_SANS, headerFontSize: pt(7.6), headerBold: true, headerColor: col('white'),
      headerBackgroundEnabled: true, headerBackground: col('ink'),
      borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.1), rules: 'horizontal',
    },
    unorderedLists: { bulletChar: '•', color: col('band') },
    orderedLists: { color: col('band') },
    colorPalette: colorPalette('zh-Hans'),
    resourceTypes: defaultResourceTypes('zh-Hans'),
    pdfGeneration: { outlines: true },
  };
}

