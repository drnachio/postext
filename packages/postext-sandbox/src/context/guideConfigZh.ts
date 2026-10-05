import type {
  CalloutStyleConfig,
  DesignTextElement,
  HeadingStyleConfig,
  ParagraphStyleConfig,
  PostextConfig,
} from 'postext';
import { defaultResourceTypes } from 'postext';
import {
  GUIDE_FOLIO, M_BOTTOM, M_INNER, M_OUTER, M_TOP, PAGE_H, PAGE_W,
  at, box, col, colorPalette, em, mm, pt, slot, type PaletteId,
} from './guideKit';
import {
  verticalBackCover, verticalCallouts, verticalChapterOpener, verticalContentsOpener, verticalCover, verticalPartDesign, verticalToc,
  type VerticalFaces,
} from './guideVerticalKit';

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
// The designs it shares with the Japanese edition (cover, back cover,
// contents, opener, part divider, boxes) are in `guideVerticalKit.ts`,
// written, as every design of a vertical page, in the flow's turned frame.
// The two columns of the layout are two tiers
// (栏) stacked on the page; chapters open with a band down the right edge,
// the running heads stand in the fore-edge margin, and the folios are
// Chinese numerals (一〇三). Figures, tables and captions stay upright and
// horizontal, as in most vertical books (clreq §2.1.1).

/** 思源宋体: the text. */
const ZH_TEXT = 'Noto Serif SC';
/** 思源黑体: headings, labels, captions, boxes. */
const ZH_SANS = 'Noto Sans SC';
const FACES: VerticalFaces = { text: ZH_TEXT, sans: ZH_SANS };

/** Body size and line pitch, in points. */
const BODY = 9.5;
const LEAD = 16;
/** Characters down a tier: two tiers of whole characters fill the 234 mm
 *  type area, the gap between them about four characters. */
const TIER_CHARS = 33;
const TEXT_H = PAGE_H - M_TOP - M_BOTTOM;
const GUTTER = TEXT_H - (2 * TIER_CHARS * BODY * 25.4) / 72;

const BOOK = 'Postext指南';

/** Chinese numerals for the folios and the contents: 一〇三. */
const PAGE_NUMBERS = 'cjk-decimal';

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
      advancedDesign: verticalCover(FACES),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
      // The colophon on the back of the cover stands in the lower left of
      // the page, where the book's last columns end.
      margins: { top: mm(PAGE_H - 132), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(PAGE_W - M_INNER - 92) },
    },
    {
      id: 'contents', name: '目录', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: verticalContentsOpener(FACES),
      layout: { layoutType: 'single' },
    },
    {
      // The last page: Folio turns it as the back cover.
      id: 'back', name: '封底', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'even' },
      advancedDesign: verticalBackCover(FACES),
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

/** The four boxes, named in Chinese: 试一试 (a hands-on step), 技术说明,
 *  醒目引文 (the pull quote) and 数字一览 (the panel of figures). Ragged at
 *  the foot, as the Latin boxes are ragged right: the boxes quote code, and
 *  a justified column of Chinese would be spread wide before a long name. */
function calloutStyles(): CalloutStyleConfig[] {
  return verticalCallouts(FACES, {
    try: { name: '试一试', title: '在Sandbox中试一试' },
    note: { name: '技术说明', title: '技术说明' },
    quote: { name: '醒目引文' },
    figures: { name: '数字一览', title: '数字一览' },
  }, 'left');
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
          advancedDesign: verticalChapterOpener(FACES),
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
      design: verticalPartDesign(FACES, '第{numberHan}篇', BOOK),
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
    toc: verticalToc(FACES, '第{numberHan}篇 · {titleText}'),
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

