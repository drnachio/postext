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
  at, box, col, colorPalette, em, mm, pt, slot, text, type PaletteId,
} from './guideKit';
import {
  verticalBackCover, verticalCallouts, verticalChapterOpener, verticalContentsOpener, verticalCover, verticalPartDesign, verticalToc,
  type VerticalFaces,
} from './guideVerticalKit';

// The Japanese edition of the Postext guide: a vertical book bound on the
// right (縦組み・右綴じ), set after the Requirements for Japanese Text Layout
// (JLReq) — columns read top to bottom and right to left, page 1 on the
// left of the spine and the spreads turning leftward. It keeps the other
// editions' page, palette, part colours and cover art, and shares the
// Chinese edition's designs (`guideVerticalKit.ts`): cover, back cover,
// contents, the opener's band down the right edge, part dividers, boxes.
//
// What is Japanese about it:
// - Faces: Noto Serif JP (源ノ明朝) for the text, Noto Sans JP (源ノ角ゴシ
//   ック) for headings, labels and captions; the mincho/gothic pairing of
//   JLReq §4.1.3.
// - The 版面 is built from the inside out (JLReq §2.4): 9.25 pt type, the
//   bunko size, 34 characters down each of two tiers (段), the lines on a
//   16 pt pitch (a 0.73 em line gap, room for ruby and sesame marks), a
//   gap of about four characters between the tiers.
// - `locale: 'ja'` gives every Japanese rule its auto value: kinsoku at
//   JIS X 4051's very strict level, full-width 約物 with pair compression,
//   ぶら下げ of 、。, a space after ？！, a paragraph-opening 「 in the second
//   half of the indent, sesame 圏点 for `*…*`, 『』 for `:book`, 図/表
//   numbered by chapter. Nothing below restates them.
// - One-em paragraph indent, first paragraph after a heading included.
// - Section headings take 行取り and 字下げ (JLReq §4.1.6, §4.1.3): three
//   lines of the tier, three characters down from its head.
// - Running heads and folios are horizontal, in the head and foot margins
//   at the fore-edge side of the type area (JLReq §2.6): the book's name on
//   right-hand (even) pages, the chapter on left-hand (odd) ones, Arabic
//   folios under the type area. A heading may close the last column of an
//   even page, its text going on across the spread (§4.1.7 b).
// - Chapters 第一章…第十一章, parts 第一部…第三部, captions 図3-1.

/** 源ノ明朝: the text. */
const JA_TEXT = 'Noto Serif JP';
/** 源ノ角ゴシック: headings, labels, captions, boxes, running heads. */
const JA_SANS = 'Noto Sans JP';
const FACES: VerticalFaces = { text: JA_TEXT, sans: JA_SANS };

/** Body size and line pitch, in points: the bunko size (新潮文庫 since
 *  2002) on a pitch of about 1.75 em. */
const BODY = 9.25;
const LEAD = 16;
/** Characters down a tier: two tiers of whole characters in the 234 mm of
 *  the type area, the gap between them about four characters (JLReq's
 *  two-tier example keeps two). */
const TIER_CHARS = 34;
const TEXT_H = PAGE_H - M_TOP - M_BOTTOM;
const GUTTER = TEXT_H - (2 * TIER_CHARS * BODY * 25.4) / 72;
/** One body em, in millimetres: running heads stand that far above the
 *  type area and in from its fore-edge side (JLReq §2.6.1). */
const BODY_EM = (BODY * 25.4) / 72;

const BOOK = 'Postext入門';

/** A horizontal running head or folio, set in the sans at the fore-edge
 *  side of the type area: on the right of a right-hand (even) page, on the
 *  left of a left-hand (odd) one. */
function edgeText(
  id: string,
  content: string,
  o: { parity: 'odd' | 'even'; foot: boolean; size: number; color: PaletteId; weight?: number; pages: 'body' | 'opener'; inset: number },
): DesignTextElement {
  const right = o.parity === 'even';
  // A head's box stands one em over the type area; a folio's top one em
  // under it.
  const y = o.foot ? -(M_BOTTOM - BODY_EM - o.size * 0.42) : M_TOP - BODY_EM - o.size * 0.42;
  return text(id, content, {
    anchor: at('page', `${o.foot ? 'bottom' : 'top'}-${right ? 'right' : 'left'}`),
    offset: [right ? -(M_OUTER + o.inset) : M_OUTER + o.inset, y],
    width: 120, size: o.size, family: JA_SANS, weight: o.weight ?? 400, color: o.color,
    align: right ? 'right' : 'left', overflow: 'ellipsis-end', parity: o.parity, pages: o.pages,
  });
}

/** Running heads after JLReq §2.6, the double method: the book's name on
 *  the even (right-hand) pages, the chapter's number and title on the odd
 *  (left-hand) ones, each indented one em from the fore-edge side of the
 *  type area, a little smaller than the text. Body pages only: openers,
 *  part dividers and blank pages carry none. */
function runningHeads() {
  return slot(
    // The blank page that faces a part divider is set in the part's own
    // colour (a blank parity page before a part page already takes its
    // palette), so the divider opens as a spread.
    box('partFacing', 'band', { anchor: at('bleed', 'top-left'), parity: 'even', pages: 'blank' }),
    edgeText('headEven', BOOK, { parity: 'even', foot: false, size: 7.5, color: 'muted', pages: 'body', inset: BODY_EM }),
    edgeText('headOdd', '{chapterNumber}　{chapterTitle}', { parity: 'odd', foot: false, size: 7.5, color: 'muted', pages: 'body', inset: BODY_EM }),
  );
}

/** Folios in Arabic numerals under the type area at its fore-edge side
 *  (JLReq §2.6.1: a horizontal folio takes Arabic figures, even in a
 *  vertical book) — in white on an opener, a right-hand page whose band
 *  covers that corner. */
function folios() {
  return slot(
    edgeText('folioEven', '{pageNumber}', { parity: 'even', foot: true, size: 8.5, weight: 700, color: 'band', pages: 'body', inset: 0 }),
    edgeText('folioOdd', '{pageNumber}', { parity: 'odd', foot: true, size: 8.5, weight: 700, color: 'band', pages: 'body', inset: 0 }),
    edgeText('folioOpener', '{pageNumber}', { parity: 'even', foot: true, size: 8.5, weight: 700, color: 'white', pages: 'opener', inset: 0 }),
  );
}

function headingStyles(): HeadingStyleConfig[] {
  const empty = slot();
  return [
    {
      id: 'cover', name: '表紙', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: verticalCover(FACES),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
      // The credits on the back of the cover stand in the lower left of
      // the page, where the book's last columns end.
      margins: { top: mm(PAGE_H - 132), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(PAGE_W - M_INNER - 92) },
    },
    {
      id: 'contents', name: '目次', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: verticalContentsOpener(FACES),
      layout: { layoutType: 'single' },
    },
    {
      // The last page: Folio turns it as the back cover.
      id: 'back', name: '裏表紙', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'even' },
      advancedDesign: verticalBackCover(FACES),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
    },
  ];
}

function paragraphStyles(): ParagraphStyleConfig[] {
  return [
    { id: 'colophon', name: '奥付', fontFamily: JA_SANS, fontSize: pt(7.5), lineHeight: pt(12.5), textAlign: 'justify', firstLineIndent: mm(0), spaceBetween: pt(5), color: col('muted'), boldColor: col('ink') },
    { id: 'standfirst', name: 'リード', fontFamily: JA_TEXT, fontSize: pt(12), lineHeight: pt(20), textAlign: 'justify', firstLineIndent: mm(0), spaceBetween: pt(6), marginBottom: pt(6), color: col('ink'), boldColor: col('band') },
    // 地から一字上げ: the signature at the foot of its column, one
    // character up from it (Aozora ［＃地から１字上げ］).
    { id: 'signature', name: '署名', fontFamily: JA_SANS, fontSize: pt(8), lineHeight: pt(12), textAlign: 'right', endIndent: em(1), firstLineIndent: mm(0), marginTop: pt(4), color: col('muted') },
  ];
}

/** The four boxes, named in Japanese: やってみよう (a hands-on step), 技術メモ,
 *  引用 (the pull quote) and 数字で見る (the panel of figures). Justified,
 *  as Japanese text always is (JLReq §3.8.1). */
function calloutStyles(): CalloutStyleConfig[] {
  return verticalCallouts(FACES, {
    try: { name: 'やってみよう', title: 'Sandboxでやってみよう' },
    note: { name: '技術メモ', title: '技術メモ' },
    quote: { name: '引用' },
    figures: { name: '数字で見る', title: '数字で見る' },
  }, 'justify');
}

/** The Japanese edition's configuration. */
export function createJapaneseGuideConfig(): PostextConfig {
  return {
    locale: 'ja',
    page: {
      sizePreset: '21x28', width: mm(PAGE_W), height: mm(PAGE_H),
      margins: { top: mm(M_TOP), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(M_OUTER), mirror: true },
      // Horizontal folios in Arabic figures (JLReq §2.6.1).
      pageNumbering: { format: 'decimal', startAt: 1 },
      // `binding` stays 'auto': right, for a vertical book.
    },
    layout: { layoutType: 'double', gutterWidth: mm(GUTTER), writingMode: 'vertical-rl' },
    bodyText: {
      // 9.25 pt on 16 pt: 34 characters down a tier, 30 lines a tier; a
      // one-em indent, after a heading too, and no space between
      // paragraphs.
      fontFamily: JA_TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), textAlign: 'justify',
      firstLineIndent: { value: 1, unit: 'em' }, indentAfterHeading: true, paragraphSpacing: false,
      color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
      referenceColor: col('band'), referenceBold: true, referenceItalic: false,
      hyphenation: { enabled: false },
      avoidWidows: true, avoidOrphans: true, avoidRunts: true, optimalLineBreaking: true,
    },
    // The Japanese rules are the `ja` locale's own (see the header); only
    // the two settings the text talks about are spelled out: a quarter em
    // between Japanese and Latin, numbers of up to two digits upright in
    // one cell (縦中横).
    cjk: {
      latinSpacing: { value: 0.25, unit: 'em' }, uprightDigits: 2,
    },
    headings: {
      fontFamily: JA_SANS, color: col('ink'), keepWithNext: true,
      // JLReq §4.1.7 b: a heading may end an even (right-hand) page, its
      // text continuing on the facing page.
      keepWithNextSpread: true,
      levels: [
        {
          // Chapters open on a verso, the right-hand page of a right-bound
          // spread, across from their first recto.
          level: 1, fontSize: pt(26), lineHeight: pt(32), fontWeight: 700, span: 'page',
          breakBefore: { enabled: true, parity: 'even' }, numberingTemplate: '第{1:一}章', numberSeparator: '　',
          advancedDesign: verticalChapterOpener(FACES, '{chapterNumber}　{partTitle}'),
        },
        {
          // 中見出し: three lines of the tier (3行取り), three characters
          // down from its head (字下げ, in body characters).
          level: 2, fontFamily: JA_SANS, fontSize: pt(12), lineHeight: pt(16), fontWeight: 700, color: col('band'),
          numberingTemplate: '', lineSpan: 3, indent: em(3),
        },
        {
          level: 3, fontFamily: JA_SANS, fontSize: pt(10.5), lineHeight: pt(16), fontWeight: 700, color: col('band'),
          numberingTemplate: '', lineSpan: 2, indent: em(4),
        },
        {
          level: 4, fontFamily: JA_SANS, fontSize: pt(BODY), lineHeight: pt(16), fontWeight: 700, color: col('band'),
          numberingTemplate: '', lineSpan: 1, indent: em(5),
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
      design: verticalPartDesign(FACES, '第{numberHan}部', BOOK),
      bodyStyle: {
        fontFamily: JA_TEXT, fontSize: pt(11), lineHeight: pt(18), color: col('white'), textAlign: 'left',
        numberColor: col('white'), bulletColor: col('white'),
        // 第三章 一行を組む, one chapter to a column.
        orderedLists: {
          numberFormat: 'japanese-informal', prefix: '第', separator: '章', gap: mm(3), indent: mm(0),
          fontFamily: JA_SANS, numberFontSize: pt(9), itemSpacing: pt(2),
        },
      },
    },
    // Summaries upright: Japanese has no italic.
    toc: verticalToc(FACES, '第{numberHan}部　{titleText}', true),
    // On screen the book reads as one scroll: no section dividers (the parts
    // still colour their chapters).
    htmlViewer: { overrides: { parts: { page: false } } },
    folio: GUIDE_FOLIO,
    header: runningHeads(),
    footer: folios(),
    captionStyle: {
      // 図3-1　見出し, set across under the upright figure: the label and
      // number solid, an ideographic space before the description.
      fontFamily: JA_SANS, fontSize: pt(7.6), color: col('ink'), align: 'left', gap: mm(1.8),
      labelBold: true, labelColor: col('band'), descriptionItalic: false, labelNumberGap: '', labelSeparator: '　',
      note: { fontSize: pt(6.6), color: col('muted'), italic: false, gap: mm(0.6) },
    },
    tableStyle: {
      bodyFontFamily: JA_SANS, bodyFontSize: pt(7.8), bodyColor: col('ink'),
      headerFontFamily: JA_SANS, headerFontSize: pt(7.6), headerBold: true, headerColor: col('white'),
      headerBackgroundEnabled: true, headerBackground: col('ink'),
      borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.1), rules: 'horizontal',
    },
    // ・ (katakana middle dot) for the bullets: the Japanese list mark.
    unorderedLists: { bulletChar: '・', color: col('band') },
    orderedLists: { color: col('band') },
    colorPalette: colorPalette('ja'),
    resourceTypes: defaultResourceTypes('ja'),
    pdfGeneration: { outlines: true },
  };
}
