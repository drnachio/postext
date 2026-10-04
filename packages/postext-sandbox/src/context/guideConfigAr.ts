import type {
  CalloutStyleConfig,
  HeadingStyleConfig,
  ParagraphStyleConfig,
  PostextConfig,
} from 'postext';
import { defaultResourceTypes } from 'postext';
import {
  DISPLAY, GUIDE_COVER_RESOURCE_ID, GUIDE_FOLIO, M_BOTTOM, M_INNER, M_OUTER, M_TOP, PAGE_H, PAGE_W, TEXT_W,
  at, box, col, colorPalette, em, image, mm, pt, rule, slot, text, type TextOpts,
} from './guideKit';

// The Arabic edition of the Postext guide, in Modern Standard Arabic, set as
// an Arabic book: right to left and bound on the right, so its first page
// stands to the left of the spine and its spreads read from the right page
// to the left one. It keeps the Latin editions' page, two columns, palette
// and part colours and the shape of their designs, and sets its text as an
// Arabic book is set:
//
// - Amiri, the Naskh of the Būlāq and Amīriyya presses, for the text: 12 pt
//   on 20 (1.67 em: the guide's prose is unvocalised), justified with
//   kashida on the Naskh rules, never hyphenated;
// - Noto Kufi Arabic for headings, titles and the large numerals;
// - IBM Plex Sans Arabic for the small type: running heads, folios, captions,
//   tables, boxes and kickers;
// - emphasis in bold (Arabic has no italic), no tracking and no capitals
//   anywhere Arabic is set;
// - every number the engine writes in Arabic-Indic digits (٠–٩), chapters
//   named by their ordinals (الفصل الثالث), captions set شكل ٣-٢: …
//
// The engine lays a right-to-left page out as a left-to-right one seen in a
// mirror, so the designs laid out in the flow (the cover, the openers, the
// part pages, the contents) are written as the Latin ones are and come out
// mirrored: the opener's numeral on the left, the kicker and the title from
// the right. The running heads and folios stand on the sheet, where left and
// right are the paper's: they are set here for a book bound on the right —
// the book's name on the even page (the right-hand one), the chapter on the
// odd page (the left-hand one), each folio in the outer corner.

/** The text: Amiri, a Naskh with curved kashidas and a Latin of its own. */
export const AR_TEXT = 'Amiri';
/** Headings, titles and display numerals. */
export const AR_HEAD = 'Noto Kufi Arabic';
/** Running heads, folios, captions, tables, boxes and labels. */
export const AR_SANS = 'IBM Plex Sans Arabic';

/** Body size and leading, in points. */
const BODY = 12;
const LEAD = 20;

const GUTTER = 9;
/** Height of a chapter opener's band below the top margin. */
const OPENER_H = 74;
/** Height of the cover artwork (full bleed, 3 mm of bleed each side). */
const COVER_ART_H = 168;

/** The design's own words. The chapter's number is spelled out as an
 *  ordinal in the kicker (الفصل الثالث) and stands in digits beside it. */
const BOOK = 'دليل Postext';
const KICKER = 'الفصل {numberOrdinalWords} · {partTitle}';
const PART_LABEL = 'الجزء';
const TOC_PART = 'الجزء {numberOrdinalWords} · {titleText}';

/** A text element in the Arabic small face unless told otherwise. Never
 *  tracked nor set in capitals: letter-spacing breaks the joins of Arabic
 *  letters, and Arabic has no case. */
function t(id: string, content: string, o: Omit<TextOpts, 'tracking' | 'upper' | 'italic'>) {
  return text(id, content, { family: AR_SANS, ...o });
}

function coverDesign() {
  return {
    enabled: true,
    minHeight: mm(PAGE_H),
    slot: slot(
      box('coverBg', 'night', { anchor: at('bleed', 'top-left') }),
      image('coverArt', GUIDE_COVER_RESOURCE_ID, { anchor: at('bleed', 'top-left'), width: PAGE_W + 6, height: COVER_ART_H }),
      t('coverKicker', '{attr.kicker}', {
        anchor: at('page', 'top-left'), offset: [M_OUTER, COVER_ART_H + 2], width: TEXT_W,
        size: 10, weight: 600, color: 'gilt', lineHeight: 1.5,
      }),
      // The title is the brand, "Postext", in the brand's Fraunces: Latin
      // on an Arabic cover, set flush with the start of the lines (right).
      text('coverTitle', '{title}', {
        anchor: at('#coverKicker', 'below'), offset: [0, 2], width: TEXT_W,
        size: 88, family: DISPLAY, weight: 700, color: 'white', lineHeight: 0.95,
      }),
      rule('coverRule', 'gilt', { anchor: at('#coverTitle', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
      t('coverSubtitle', '{subtitle}', {
        anchor: at('#coverRule', 'below'), offset: [0, 4], width: 140,
        size: 21, family: AR_TEXT, color: 'white', lineHeight: 1.45,
      }),
      t('coverPublisher', '{attr.publisher}', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -14], width: TEXT_W,
        size: 8, color: 'mist', lineHeight: 1.5,
      }),
    ),
  };
}

/** The back cover, the last page: the night of the front, the three part
 *  colours as bands, the book's name, a few lines on the engine and, at the
 *  foot, where to find it and its licence. */
function backCoverDesign() {
  const y = 62;
  const band = (id: string, color: 'main-color' | 'gilt' | 'vermilion', k: number) =>
    box(id, color, { anchor: at('page', 'top-left'), offset: [M_OUTER + k * 14, y], width: 12, height: 2.5 });
  return {
    enabled: true,
    minHeight: mm(PAGE_H),
    slot: slot(
      box('backBg', 'night', { anchor: at('bleed', 'top-left') }),
      band('backBandFoundations', 'main-color', 0),
      band('backBandCraft', 'gilt', 1),
      band('backBandPractice', 'vermilion', 2),
      t('backTitle', '{attr.book}', {
        anchor: at('page', 'top-left'), offset: [M_OUTER, y + 12], width: TEXT_W,
        size: 38, family: AR_HEAD, weight: 700, color: 'white', lineHeight: 1.35,
      }),
      t('backBlurb', '{attr.blurb}', {
        anchor: at('#backTitle', 'below'), offset: [0, 8], width: 128,
        size: 15, family: AR_TEXT, color: 'white', lineHeight: 1.65,
      }),
      rule('backRule', 'gilt', { anchor: at('#backBlurb', 'below'), offset: [0, 9], width: 34, thickness: 2 }),
      // Two Latin addresses: read left to right, in the order written.
      t('backSite', 'postext.dev · github.com/drnachio/postext', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -22], width: TEXT_W,
        size: 9, weight: 600, color: 'gilt', direction: 'ltr', align: 'right',
      }),
      t('backLicence', '{attr.licence}', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -14], width: TEXT_W,
        size: 8, color: 'mist', lineHeight: 1.5,
      }),
    ),
  };
}

/** Contents and other unnumbered front pages: a thin part-colour stripe at
 *  the head of the page, the title and a short rule. */
function frontOpener() {
  return {
    enabled: true,
    minHeight: mm(32),
    slot: slot(
      box('frontStripe', 'band', { anchor: at('bleed', 'top-left'), height: 5 }),
      t('frontTitle', '{titleText}', {
        anchor: at('container', 'top-left'), offset: [0, 1], width: TEXT_W,
        size: 30, family: AR_HEAD, weight: 700, lineHeight: 1.35,
      }),
      rule('frontRule', 'band', { anchor: at('#frontTitle', 'below'), offset: [0, 4], width: 34, thickness: 2 }),
    ),
  };
}

/** A chapter opener: a full-bleed band in the part colour holding the
 *  kicker (الفصل الثالث · الصنعة), the title and the chapter's lead, with
 *  the chapter's number in Arabic-Indic digits set large at the end of the
 *  band — the left, the outer side of the right-hand page a chapter opens
 *  on. */
function chapterOpener() {
  return {
    enabled: true,
    minHeight: mm(OPENER_H + 6),
    slot: slot(
      box('openerBand', 'band', { anchor: at('bleed', 'top-left'), height: 3 + M_TOP + OPENER_H }),
      box('openerFoot', 'ink', { anchor: at('bleed', 'top-left'), offset: [0, 3 + M_TOP + OPENER_H], height: 1.6 }),
      t('openerNumber', '{chapterNumber}', {
        anchor: at('container', 'top-right'), offset: [0, -8], width: 50,
        size: 100, family: AR_HEAD, weight: 800, color: 'white', align: 'right', lineHeight: 1.25,
      }),
      t('openerKicker', KICKER, {
        anchor: at('container', 'top-left'), offset: [0, 2], width: 112,
        size: 9.5, weight: 600, color: 'white', lineHeight: 1.5, overflow: 'ellipsis-end',
      }),
      rule('openerRule', 'white', { anchor: at('#openerKicker', 'below'), offset: [0, 3], width: 22, thickness: 1.5 }),
      t('openerTitle', '{titleText}', {
        anchor: at('#openerRule', 'below'), offset: [0, 3.5], width: 118,
        size: 25, family: AR_HEAD, weight: 700, color: 'white', lineHeight: 1.35,
      }),
      t('openerLead', '{attr.lead}', {
        anchor: at('#openerTitle', 'below'), offset: [0, 3.5], width: TEXT_W - 22,
        size: 11.5, family: AR_TEXT, color: 'white', lineHeight: 1.6,
      }),
    ),
  };
}

/** A part divider: the page in the part colour over a band of ink, the
 *  label, the part's number in Arabic-Indic digits set large, a white rule
 *  and the title, the part's chapters below; the book's name at the foot. */
function partDesign() {
  return slot(
    box('partBg', 'band', { anchor: at('bleed', 'top-left') }),
    box('partNight', 'ink', { anchor: at('bleed', 'bottom-left'), height: 60 }),
    t('partLabel', PART_LABEL, {
      anchor: at('page', 'top-left'), offset: [M_OUTER, 44], width: TEXT_W,
      size: 14, family: AR_HEAD, weight: 700, color: 'white', lineHeight: 1.4,
    }),
    // The number as a figure (١، ٢، ٣) whatever the markup writes (I, II).
    t('partNumber', '{numberDecimal}', {
      anchor: at('#partLabel', 'below'), offset: [0, -2], width: TEXT_W,
      size: 140, family: AR_HEAD, weight: 800, color: 'white', lineHeight: 1.15,
    }),
    rule('partRule', 'white', { anchor: at('#partNumber', 'below'), offset: [0, 2], width: 34, thickness: 2 }),
    t('partTitle', '{titleText}', {
      anchor: at('#partRule', 'below'), offset: [0, 5], width: TEXT_W,
      size: 40, family: AR_HEAD, weight: 700, color: 'white', lineHeight: 1.3,
    }),
    t('partBook', BOOK, {
      anchor: at('page', 'bottom-left'), offset: [M_OUTER, -24], width: TEXT_W,
      size: 9, weight: 600, color: 'mist',
    }),
  );
}

/** Running heads for a book bound on the right. They stand on the sheet,
 *  where left and right are the paper's: the even page is the right-hand
 *  page of a spread, its folio in the top right corner and the book's name
 *  beside it; the odd page is the left-hand one, its folio in the top left
 *  corner and the chapter's title beside it. A rule under each. */
function runningHeads() {
  const y = M_TOP - 12.5;
  const head = { pages: 'body' as const, size: 8, color: 'muted' as const, overflow: 'ellipsis-end' as const };
  const folio = { pages: 'body' as const, size: 9, weight: 700, color: 'band' as const };
  return slot(
    // The blank page that faces a part divider is set in the part's own
    // colour, as in the Latin editions.
    box('partFacing', 'band', { anchor: at('bleed', 'top-left'), parity: 'even', pages: 'blank' }),
    t('folioEven', '{pageNumber}', { ...folio, anchor: at('page', 'top-right'), offset: [-M_OUTER, y], parity: 'even', align: 'right' }),
    t('bookEven', BOOK, { ...head, anchor: at('page', 'top-right'), offset: [-(M_OUTER + 10), y], width: 110, parity: 'even', align: 'right' }),
    t('chapterOdd', '{chapterTitle}', { ...head, anchor: at('page', 'top-left'), offset: [M_OUTER + 10, y], width: 110, parity: 'odd', align: 'left' }),
    t('folioOdd', '{pageNumber}', { ...folio, anchor: at('page', 'top-left'), offset: [M_OUTER, y], parity: 'odd', align: 'left' }),
    rule('headRuleEven', 'rule', { anchor: at('page', 'top-left'), offset: [M_INNER, y + 6], width: TEXT_W, thickness: 0.5, parity: 'even', pages: 'body' }),
    rule('headRuleOdd', 'rule', { anchor: at('page', 'top-left'), offset: [M_OUTER, y + 6], width: TEXT_W, thickness: 0.5, parity: 'odd', pages: 'body' }),
  );
}

/** The folio of an opener, centred at the foot of the page. */
function openerFooter() {
  return slot(
    t('folioOpener', '{pageNumber}', {
      anchor: at('page', 'bottom'), offset: [0, -(M_BOTTOM - 10)], width: 30, pages: 'opener',
      size: 9, weight: 700, color: 'band', align: 'center',
    }),
  );
}

function headingStyles(): HeadingStyleConfig[] {
  const empty = slot();
  return [
    {
      id: 'cover', name: 'الغلاف', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: coverDesign(),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
      margins: { top: mm(PAGE_H - 104), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(PAGE_W - M_INNER - 116) },
    },
    {
      id: 'contents', name: 'المحتويات', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: frontOpener(),
      layout: { layoutType: 'single' },
    },
    {
      // The last page, always an even one: Folio turns it as the back cover.
      id: 'back', name: 'الغلاف الخلفي', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'even' },
      advancedDesign: backCoverDesign(),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
    },
  ];
}

function paragraphStyles(): ParagraphStyleConfig[] {
  return [
    { id: 'colophon', name: 'بيانات النشر', fontFamily: AR_SANS, fontSize: pt(8), lineHeight: pt(13.5), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(5), color: col('muted'), boldColor: col('ink') },
    { id: 'standfirst', name: 'التمهيد', fontFamily: AR_TEXT, fontSize: pt(14), lineHeight: pt(24), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(6), marginBottom: pt(6), color: col('ink'), boldColor: col('band') },
    // Right is the end of an Arabic line: the signature stands on the left.
    { id: 'signature', name: 'التوقيع', fontFamily: AR_SANS, fontSize: pt(8.5), lineHeight: pt(13), textAlign: 'right', firstLineIndent: mm(0), marginTop: pt(4), color: col('muted') },
  ];
}

function calloutStyles(): CalloutStyleConfig[] {
  // Box titles in the small face's bold, neither spaced nor in capitals.
  const label = { fontFamily: AR_SANS, fontSize: pt(8.5), fontWeight: 700, letterSpacing: pt(0) };
  // Ragged, as the Latin boxes are: they quote code, and a justified line
  // would be stretched wide before a long name.
  const sansBody = {
    fontFamily: AR_SANS, fontSize: pt(9), lineHeight: pt(15), color: col('ink'), boldColor: col('ink'),
    textAlign: 'left' as const, paragraphSpacing: true, firstLineIndent: mm(0),
  };
  return [
    {
      // جرّبه: a hands-on step next to the prose, its stripe on the start
      // side of the box (the right).
      id: 'try', name: 'جرّبه', title: 'جرّبه في Sandbox',
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
      id: 'note', name: 'ملاحظة تقنية', title: 'ملاحظة تقنية',
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
      // اقتباس بارز: the quote in Amiri bold, in the part colour, behind a
      // thick rule on its start side. Arabic has no italic to set a pull
      // quote in, and a hung quotation mark would turn with the line.
      id: 'quote', name: 'اقتباس بارز',
      span: 'column', placement: 'here',
      backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(1.5), right: mm(0), bottom: mm(2), left: mm(5) },
      stripe: { enabled: true, side: 'left', width: pt(4), color: col('band') },
      icon: { kind: 'none' },
      titleStyle: { gap: mm(1) },
      body: {
        fontFamily: AR_TEXT, fontSize: pt(15), lineHeight: pt(25), fontWeight: 700, boldFontWeight: 700, color: col('band'), boldColor: col('ink'),
        italicColor: col('band'), textAlign: 'left', paragraphSpacing: false, firstLineIndent: mm(0),
      },
      marginTop: pt(6), marginBottom: pt(10), keepTogether: true,
    },
    {
      // بالأرقام: a dark page-wide panel set in balanced columns.
      id: 'figures', name: 'أرقام', title: 'بالأرقام',
      span: 'page', placement: 'here',
      backgroundEnabled: true, background: col('ink'), border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(4), right: mm(6), bottom: mm(3.5), left: mm(6) },
      icon: { kind: 'none' }, columnGap: mm(8),
      titleStyle: { ...label, color: col('gilt'), gap: mm(3) },
      body: {
        fontFamily: AR_SANS, fontSize: pt(9), lineHeight: pt(15), color: col('mist'), boldColor: col('white'),
        textAlign: 'left', paragraphSpacing: true, firstLineIndent: mm(0),
      },
      marginTop: pt(4), marginBottom: pt(8), keepTogether: true,
    },
  ];
}

/** The contents: the number (٣) and the title from the right, a dotted
 *  leader to the folio on the left, the chapter's summary under its title;
 *  a part opens with a square in its colour and its name (الجزء الثاني ·
 *  الصنعة). */
function toc() {
  return {
    levels: [{
      level: 1, fontFamily: AR_HEAD, fontSize: pt(11.5), lineHeight: pt(19), fontWeight: 600, color: col('ink'),
      numberWidth: mm(9), numberGap: mm(2), numberFontFamily: AR_SANS, numberFontSize: pt(10), numberColor: col('band'), marginTop: pt(5),
    }],
    unnumbered: { fontFamily: AR_TEXT, fontWeight: 400, color: col('ink') },
    pageNumber: { fontFamily: AR_SANS, fontSize: pt(10), fontWeight: 700, color: col('ink'), width: mm(10) },
    leader: { enabled: true, char: '.', gap: mm(1.5) },
    subtitle: { enabled: true, attr: 'summary', fontFamily: AR_TEXT, fontSize: pt(9.5), color: col('muted'), indent: mm(11) },
    parts: {
      enabled: true, height: pt(20), marginTop: pt(16), marginBottom: pt(2),
      design: slot(
        box('tocPartBand', 'band', { anchor: at('container', 'left'), width: 8, height: 8 }),
        t('tocPart', TOC_PART, {
          anchor: at('#tocPartBand', 'right-of'), offset: [3, 0], width: 150,
          size: 10, weight: 700, color: 'band',
        }),
      ),
    },
  };
}

/** The Arabic edition's configuration. */
export function createArabicGuideConfig(): PostextConfig {
  return {
    // The language gives the rest: right to left (`direction: 'auto'`),
    // bound on the right (`page.binding: 'auto'`), Arabic-Indic digits
    // (`numerals: 'auto'`), the built-in words شكل and جدول.
    locale: 'ar',
    page: {
      sizePreset: '21x28', width: mm(PAGE_W), height: mm(PAGE_H),
      margins: { top: mm(M_TOP), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(M_OUTER), mirror: true },
      pageNumbering: { format: 'decimal', startAt: 1 },
    },
    layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
    bodyText: {
      // 12 pt on 20: a Naskh looks smaller than a Latin face at one size,
      // and the occasional mark needs room in the leading.
      fontFamily: AR_TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), textAlign: 'justify',
      firstLineIndent: em(1.25), indentAfterHeading: false, paragraphSpacing: false,
      color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
      referenceColor: col('band'), referenceBold: true, referenceItalic: false,
      hyphenation: { enabled: false },
      kashida: 'auto', kashidaPatterns: 'naskh',
      emphasis: 'auto',
      avoidWidows: true, avoidOrphans: true, avoidRunts: true, optimalLineBreaking: true,
    },
    headings: {
      fontFamily: AR_HEAD, color: col('ink'), keepWithNext: true,
      levels: [
        {
          // Chapters open on an even page, the right-hand page of a
          // right-bound spread, across from their first odd page.
          level: 1, fontSize: pt(25), lineHeight: pt(34), fontWeight: 700, span: 'page',
          breakBefore: { enabled: true, parity: 'even' }, numberingTemplate: '{1}',
          advancedDesign: chapterOpener(),
        },
        {
          level: 2, fontFamily: AR_HEAD, fontSize: pt(13.5), lineHeight: pt(23), fontWeight: 700, color: col('band'),
          numberingTemplate: '', marginTop: pt(17), marginBottom: pt(4),
        },
        {
          level: 3, fontFamily: AR_HEAD, fontSize: pt(11), lineHeight: pt(LEAD), fontWeight: 700, color: col('band'),
          numberingTemplate: '', marginTop: pt(12), marginBottom: pt(2),
        },
        {
          level: 4, fontFamily: AR_HEAD, fontSize: pt(10), lineHeight: pt(LEAD), fontWeight: 600, color: col('band'),
          numberingTemplate: '', marginTop: pt(10), marginBottom: pt(1),
        },
      ],
    },
    headingStyles: headingStyles(),
    paragraphStyles: paragraphStyles(),
    calloutStyles: calloutStyles(),
    parts: {
      // A part opens on an odd page (the left-hand one) facing an even page
      // in its colour, and its first chapter opens on the back of the
      // divider, as in the Latin editions.
      breakBefore: { parity: 'always-odd' },
      breakAfter: { enabled: true, parity: 'even' },
      margins: { top: mm(178), bottom: mm(66), left: mm(M_INNER), right: mm(M_OUTER + 40) },
      design: partDesign(),
      bodyStyle: {
        fontFamily: AR_TEXT, fontSize: pt(12.5), lineHeight: pt(21), color: col('white'), textAlign: 'left',
        numberColor: col('white'), bulletColor: col('white'),
        orderedLists: { numberFormat: 'arabic', separator: '', gap: mm(3), indent: mm(0), fontFamily: AR_SANS, numberFontSize: pt(10), itemSpacing: pt(1) },
      },
    },
    toc: toc(),
    // On screen the book reads as one scroll: no section dividers (the parts
    // still colour their chapters).
    htmlViewer: { overrides: { parts: { page: false } } },
    folio: GUIDE_FOLIO,
    header: runningHeads(),
    footer: openerFooter(),
    captionStyle: {
      // شكل ٣-٢: …: a colon after the number, since a full stop after
      // Arabic-Indic digits reads as the decimal separator.
      fontFamily: AR_SANS, fontSize: pt(8), color: col('ink'), align: 'left', gap: mm(1.8),
      labelBold: true, labelColor: col('band'), descriptionItalic: false, labelSeparator: ': ',
      note: { fontSize: pt(7), color: col('muted'), italic: false, gap: mm(0.6) },
    },
    tableStyle: {
      bodyFontFamily: AR_SANS, bodyFontSize: pt(8.3), bodyColor: col('ink'),
      headerFontFamily: AR_SANS, headerFontSize: pt(8.1), headerBold: true, headerColor: col('white'),
      headerBackgroundEnabled: true, headerBackground: col('ink'),
      borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.2), rules: 'horizontal',
    },
    unorderedLists: { bulletChar: '•', color: col('band') },
    orderedLists: {
      color: col('band'),
      // ١- then أ- then (١), as Arabic books number their lists.
      levels: [
        { level: 1, numberFormat: 'arabic', separator: '-' },
        { level: 2, numberFormat: 'abjad', separator: '-' },
        { level: 3, numberFormat: 'arabic', prefix: '(', separator: ')' },
      ],
    },
    colorPalette: colorPalette('ar'),
    resourceTypes: defaultResourceTypes('ar'),
    pdfGeneration: { outlines: true },
  };
}
