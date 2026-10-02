import type {
  CalloutStyleConfig,
  HeadingStyleConfig,
  ParagraphStyleConfig,
  PostextConfig,
} from 'postext';
import { defaultResourceTypes } from 'postext';
import { guideLang, type GuideLang } from '../defaultResources/lang';
import {
  DISPLAY, GUIDE_COVER_RESOURCE_ID, GUIDE_FOLIO, HEAD, M_BOTTOM, M_INNER, M_OUTER, M_TOP, PAGE_H, PAGE_W, SANS, TEXT, TEXT_W,
  at, box, col, colorPalette, image, mm, pt, rule, slot, text, type TextOpts,
} from './guideKit';
import { createChineseGuideConfig } from './guideConfigZh';

export { GUIDE_COVER_RESOURCE_ID, GUIDE_PART_COLOURS } from './guideKit';

// The design of the built-in Postext guide: a 21 × 28 cm two-column book in
// the colours and typefaces of the Postext brand (Fraunces for display, Lora
// for the text, Geist for labels, Bricolage Grotesque for section headings,
// gilt and blue on dark ink). A cover, a
// self-numbering contents page, three part dividers — each recolouring the
// palette-linked `band` colour with `:::part{palette=…}` — chapter openers
// on a full-bleed band, running heads, and the callout styles the guide
// uses to show the engine at work. Every font is served by Google Fonts, so
// the preset carries no font files.
//
// The Chinese edition is a vertical book bound on the right, designed in
// `guideConfigZh.ts` on the same page and palette.
//
// Geometry: a 170 mm text area in two 80.5 mm columns keeps the page/column
// width ratio the example figures are drawn for (≈ 2.11, see
// `defaultResources`), so their type comes out the same size at both spans.

/** The Latin editions. */
type LatinLang = Exclude<GuideLang, 'zh-Hans'>;

const GUTTER = 9;
/** Height of a chapter opener's band below the top margin. */
const OPENER_H = 74;
/** Height of the cover artwork (full bleed, 3 mm of bleed each side). */
const COVER_ART_H = 168;

/** The design's own words. `kicker` heads a chapter opener, `partLabel`
 *  a part divider, `tocPart` a part row of the contents. */
const WORDING: Record<LatinLang, { book: string; kicker: string; partLabel: string; tocPart: string }> = {
  en: { book: 'The Postext Guide', kicker: 'Chapter {chapterNumber} · {partTitle}', partLabel: 'Part', tocPart: 'Part {number} · {titleText}' },
  es: { book: 'Guía de Postext', kicker: 'Capítulo {chapterNumber} · {partTitle}', partLabel: 'Parte', tocPart: 'Parte {number} · {titleText}' },
};

/** How a small label is set: in capitals, spaced out (`tracking` in points). */
function label(tracking: number): Pick<TextOpts, 'upper' | 'tracking'> {
  return { upper: true, tracking };
}

function coverDesign() {
  return {
    enabled: true,
    minHeight: mm(PAGE_H),
    slot: slot(
      box('coverBg', 'night', { anchor: at('bleed', 'top-left') }),
      image('coverArt', GUIDE_COVER_RESOURCE_ID, { anchor: at('bleed', 'top-left'), width: PAGE_W + 6, height: COVER_ART_H }),
      text('coverKicker', '{attr.kicker}', {
        anchor: at('page', 'top-left'), offset: [M_OUTER, COVER_ART_H + 2], width: TEXT_W,
        size: 9, weight: 600, color: 'gilt', ...label(2.6),
      }),
      text('coverTitle', '{title}', {
        anchor: at('#coverKicker', 'below'), offset: [0, 3], width: TEXT_W,
        size: 88, family: DISPLAY, weight: 700, color: 'white', lineHeight: 0.95,
      }),
      rule('coverRule', 'gilt', { anchor: at('#coverTitle', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
      text('coverSubtitle', '{subtitle}', {
        anchor: at('#coverRule', 'below'), offset: [0, 5], width: 140,
        size: 17, family: TEXT, italic: true, color: 'white', lineHeight: 1.25,
      }),
      text('coverPublisher', '{attr.publisher}', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -14], width: TEXT_W,
        size: 7.5, color: 'mist', ...label(1.6),
      }),
    ),
  };
}

/** The back cover, the last verso: the night of the front, the three part
 *  colours as bands, the name, a few lines on the engine and, at the foot,
 *  where to find it and its licence. */
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
      text('backTitle', '{attr.book}', {
        anchor: at('page', 'top-left'), offset: [M_OUTER, y + 12], width: TEXT_W,
        size: 44, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1,
      }),
      text('backBlurb', '{attr.blurb}', {
        anchor: at('#backTitle', 'below'), offset: [0, 9], width: 128,
        size: 14, family: TEXT, italic: true, color: 'white', lineHeight: 1.4,
      }),
      rule('backRule', 'gilt', { anchor: at('#backBlurb', 'below'), offset: [0, 9], width: 34, thickness: 2 }),
      text('backSite', 'postext.dev · github.com/drnachio/postext', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -22], width: TEXT_W,
        size: 9, weight: 600, color: 'gilt', ...label(1.6),
      }),
      text('backLicence', '{attr.licence}', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -14], width: TEXT_W,
        size: 7.5, color: 'mist', ...label(1.6),
      }),
    ),
  };
}

/** Contents and other unnumbered front pages: a thin part-colour stripe at
 *  the head of the page, the title and a short rule. */
function frontOpener() {
  return {
    enabled: true,
    minHeight: mm(30),
    slot: slot(
      box('frontStripe', 'band', { anchor: at('bleed', 'top-left'), height: 5 }),
      text('frontTitle', '{titleText}', {
        anchor: at('container', 'top-left'), offset: [0, 2], width: TEXT_W,
        size: 34, family: DISPLAY, weight: 700, lineHeight: 1.05,
      }),
      rule('frontRule', 'band', { anchor: at('#frontTitle', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
    ),
  };
}

/** A chapter opener: a full-bleed band in the part colour holding the
 *  chapter kicker, the title and the chapter's lead (`lead` attribute), with
 *  the chapter number set large at the outer edge. */
function chapterOpener(lang: LatinLang) {
  return {
    enabled: true,
    minHeight: mm(OPENER_H + 6),
    slot: slot(
      box('openerBand', 'band', { anchor: at('bleed', 'top-left'), height: 3 + M_TOP + OPENER_H }),
      box('openerFoot', 'ink', { anchor: at('bleed', 'top-left'), offset: [0, 3 + M_TOP + OPENER_H], height: 1.6 }),
      text('openerNumber', '{chapterNumber}', {
        anchor: at('container', 'top-right'), offset: [0, -6], width: 60,
        size: 118, family: DISPLAY, weight: 800, color: 'white', align: 'right', lineHeight: 1,
      }),
      text('openerKicker', WORDING[lang].kicker, {
        anchor: at('container', 'top-left'), offset: [0, 4], width: 110,
        size: 8.5, weight: 600, color: 'white', ...label(2.2), overflow: 'ellipsis-end',
      }),
      rule('openerRule', 'white', { anchor: at('#openerKicker', 'below'), offset: [0, 3.5], width: 22, thickness: 1.5 }),
      text('openerTitle', '{titleText}', {
        anchor: at('#openerRule', 'below'), offset: [0, 5], width: 120,
        size: 32, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1.04,
      }),
      text('openerLead', '{attr.lead}', {
        anchor: at('#openerTitle', 'below'), offset: [0, 5], width: TEXT_W - 22,
        size: 10.5, family: TEXT, italic: true, color: 'white', lineHeight: 1.36, hyphenate: true,
      }),
    ),
  };
}

function partDesign(lang: LatinLang) {
  return slot(
    box('partBg', 'band', { anchor: at('bleed', 'top-left') }),
    box('partNight', 'ink', { anchor: at('bleed', 'bottom-left'), height: 60 }),
    text('partLabel', WORDING[lang].partLabel, {
      anchor: at('page', 'top-left'), offset: [M_OUTER, 46], width: TEXT_W,
      size: 10, weight: 600, color: 'white', upper: true, tracking: 3,
    }),
    // The number as the markup writes it (I, II, III), in Fraunces.
    text('partNumber', '{number}', {
      anchor: at('#partLabel', 'below'), offset: [0, 1], width: TEXT_W,
      size: 150, family: DISPLAY, weight: 800, color: 'white', lineHeight: 1,
    }),
    rule('partRule', 'white', { anchor: at('#partNumber', 'below'), offset: [0, 4], width: 34, thickness: 2 }),
    text('partTitle', '{titleText}', {
      anchor: at('#partRule', 'below'), offset: [0, 6], width: TEXT_W,
      size: 42, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1.02,
    }),
    text('partBook', WORDING[lang].book, {
      anchor: at('page', 'bottom-left'), offset: [M_OUTER, -24], width: TEXT_W,
      size: 8, weight: 600, color: 'mist', ...label(2),
    }),
  );
}

/** Verso: folio and the book; recto: the chapter and folio. */
function runningHeads(lang: LatinLang) {
  const y = M_TOP - 12;
  const common = { pages: 'body' as const, size: 7.5, color: 'muted' as const, upper: true, tracking: 1.4, overflow: 'ellipsis-end' as const };
  return slot(
    // The blank verso that faces a part divider is set in the part's own
    // colour (a blank parity page before a part page already takes its
    // palette), so the divider opens as a spread. Parts break `always-odd`
    // and chapters open on versos, so the only blank versos in the book
    // are those.
    box('partFacing', 'band', { anchor: at('bleed', 'top-left'), parity: 'even', pages: 'blank' }),
    text('folioEven', '{pageNumber}', { ...common, anchor: at('page', 'top-left'), offset: [M_OUTER, y], parity: 'even', weight: 700, color: 'band', size: 8.5, tracking: 0 }),
    text('bookEven', WORDING[lang].book, { ...common, anchor: at('page', 'top-left'), offset: [M_OUTER + 10, y], width: 110, parity: 'even' }),
    text('chapterOdd', '{chapterTitle}', { ...common, anchor: at('page', 'top-right'), offset: [-(M_OUTER + 10), y], width: 110, parity: 'odd', align: 'right' }),
    text('folioOdd', '{pageNumber}', { ...common, anchor: at('page', 'top-right'), offset: [-M_OUTER, y], parity: 'odd', weight: 700, color: 'band', size: 8.5, tracking: 0, align: 'right' }),
    rule('headRuleEven', 'rule', { anchor: at('page', 'top-left'), offset: [M_OUTER, y + 5.5], width: TEXT_W, thickness: 0.5, parity: 'even', pages: 'body' }),
    rule('headRuleOdd', 'rule', { anchor: at('page', 'top-left'), offset: [M_INNER, y + 5.5], width: TEXT_W, thickness: 0.5, parity: 'odd', pages: 'body' }),
  );
}

function openerFooter() {
  return slot(
    text('folioOpener', '{pageNumber}', {
      anchor: at('page', 'bottom'), offset: [0, -(M_BOTTOM - 10)], width: 30, pages: 'opener',
      size: 8.5, weight: 700, color: 'band', align: 'center',
    }),
  );
}

function headingStyles(): HeadingStyleConfig[] {
  const empty = slot();
  return [
    {
      id: 'cover', name: 'Cover', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: coverDesign(),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
      margins: { top: mm(PAGE_H - 96), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(PAGE_W - M_INNER - 110) },
    },
    {
      id: 'contents', name: 'Contents', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: frontOpener(),
      layout: { layoutType: 'single' },
    },
    {
      // The last page, always a verso: Folio turns it as the back cover.
      id: 'back', name: 'Back cover', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'even' },
      advancedDesign: backCoverDesign(),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
    },
  ];
}

function paragraphStyles(): ParagraphStyleConfig[] {
  return [
    { id: 'colophon', name: 'Colophon', fontFamily: SANS, fontSize: pt(7.5), lineHeight: pt(11), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(5), color: col('muted'), boldColor: col('ink') },
    { id: 'standfirst', name: 'Standfirst', fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(17), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(6), marginBottom: pt(6), color: col('ink'), boldColor: col('band'), hyphenation: false },
    { id: 'signature', name: 'Signature', fontFamily: SANS, fontSize: pt(8), lineHeight: pt(11), textAlign: 'right', firstLineIndent: mm(0), marginTop: pt(4), color: col('muted') },
  ];
}

/** Names and titles of the callout styles. */
const CALLOUT_WORDS: Record<LatinLang, { try: [string, string]; note: [string, string]; quote: string; figures: [string, string] }> = {
  en: { try: ['Try it', 'Try it in the Sandbox'], note: ['Technical note', 'Technical note'], quote: 'Pull quote', figures: ['Key figures', 'In figures'] },
  es: { try: ['Pruébalo', 'Pruébalo en el Sandbox'], note: ['Nota técnica', 'Nota técnica'], quote: 'Cita destacada', figures: ['Cifras', 'En cifras'] },
};

function calloutStyles(lang: LatinLang): CalloutStyleConfig[] {
  const words = CALLOUT_WORDS[lang];
  const label = { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: pt(1.6) };
  const sansBody = {
    fontFamily: SANS, fontSize: pt(8.3), lineHeight: pt(12), color: col('ink'), boldColor: col('ink'),
    textAlign: 'left' as const, hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
  };
  return [
    {
      // "Try it in the Sandbox": a hands-on step next to the prose.
      id: 'try', name: words.try[0], title: words.try[1],
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
      // A technical aside: the fine print of a feature.
      id: 'note', name: words.note[0], title: words.note[1],
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
      // Pull quote: display italic in the part colour, the text hung to the
      // right of a large opening quotation mark, as in a magazine.
      id: 'quote', name: words.quote,
      span: 'column', placement: 'here',
      backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
      // The glyph is centred in its 22 mm square, about 5.8 mm in from the
      // square's edge: the negative left padding sets the mark flush with
      // the column's text, and the gap leaves it clear of the quote.
      padding: { top: mm(1), right: mm(0), bottom: mm(2.4), left: mm(-5.8) },
      icon: { kind: 'glyph', glyph: '“', fontFamily: DISPLAY, fontWeight: 800, size: mm(22), color: col('band'), align: 'top', position: 'inline' },
      titleStyle: { gap: mm(-1.5) },
      body: {
        fontFamily: DISPLAY, fontSize: pt(14.5), lineHeight: pt(18.5), color: col('band'), boldColor: col('ink'),
        italicColor: col('band'), textAlign: 'left', hyphenation: false, paragraphSpacing: false, firstLineIndent: mm(0),
      },
      marginTop: pt(6), marginBottom: pt(10), keepTogether: true,
    },
    {
      // Key figures: a dark page-wide panel set in balanced columns.
      id: 'figures', name: words.figures[0], title: words.figures[1],
      span: 'page', placement: 'here',
      backgroundEnabled: true, background: col('ink'), border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(4), right: mm(6), bottom: mm(3.5), left: mm(6) },
      icon: { kind: 'none' }, columnGap: mm(8),
      titleStyle: { ...label, color: col('gilt'), gap: mm(3) },
      body: {
        fontFamily: SANS, fontSize: pt(8.3), lineHeight: pt(12), color: col('mist'), boldColor: col('white'),
        textAlign: 'left', hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
      },
      marginTop: pt(4), marginBottom: pt(8), keepTogether: true,
    },
  ];
}

function toc(lang: LatinLang) {
  return {
    levels: [{
      level: 1, fontFamily: DISPLAY, fontSize: pt(12), lineHeight: pt(15), fontWeight: 600, color: col('ink'),
      numberWidth: mm(11), numberGap: mm(2), numberFontFamily: SANS, numberFontSize: pt(9), numberColor: col('band'), marginTop: pt(5),
    }],
    unnumbered: { fontFamily: TEXT, fontWeight: 400, italic: true, color: col('ink') },
    pageNumber: { fontFamily: SANS, fontSize: pt(9), fontWeight: 700, color: col('ink'), width: mm(10) },
    leader: { enabled: true, char: '.', gap: mm(1.5) },
    subtitle: { enabled: true, attr: 'summary', fontFamily: TEXT, fontSize: pt(8), italic: true, color: col('muted'), indent: mm(13) },
    parts: {
      enabled: true, height: pt(18), marginTop: pt(18), marginBottom: pt(2),
      design: slot(
        box('tocPartBand', 'band', { anchor: at('container', 'left'), width: 8, height: 8 }),
        text('tocPart', WORDING[lang].tocPart, {
          anchor: at('#tocPartBand', 'right-of'), offset: [3, 0], width: 150,
          size: 9, weight: 700, color: 'band', ...label(2),
        }),
      ),
    },
  };
}

/** The Postext guide's configuration for `locale`: the English, Spanish or
 *  Chinese edition (any Chinese tag reads the Chinese one, set vertically). */
export function createPostextGuideConfig(locale = 'en'): PostextConfig {
  const lang = guideLang(locale);
  if (lang === 'zh-Hans') return createChineseGuideConfig();
  return {
    locale: lang === 'es' ? 'es' : 'en-us',
    page: {
      sizePreset: '21x28', width: mm(PAGE_W), height: mm(PAGE_H),
      margins: { top: mm(M_TOP), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(M_OUTER), mirror: true },
      pageNumbering: { format: 'decimal', startAt: 1 },
    },
    layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
    bodyText: {
      fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(13.6), textAlign: 'justify',
      firstLineIndent: mm(4), indentAfterHeading: false, paragraphSpacing: false,
      color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
      referenceColor: col('band'), referenceBold: true, referenceItalic: false,
      hyphenation: { enabled: true, locale: lang === 'es' ? 'es' : 'en-us' },
      avoidWidows: true, avoidOrphans: true, avoidRunts: true, optimalLineBreaking: true,
    },
    headings: {
      fontFamily: DISPLAY, color: col('ink'), keepWithNext: true,
      levels: [
        {
          // Chapters open on a verso, across from their first recto.
          level: 1, fontSize: pt(28), lineHeight: pt(32), fontWeight: 700, span: 'page',
          breakBefore: { enabled: true, parity: 'even' }, numberingTemplate: '{1}',
          advancedDesign: chapterOpener(lang),
        },
        {
          level: 2, fontFamily: HEAD, fontSize: pt(13.5), lineHeight: pt(17), fontWeight: 700, color: col('band'),
          numberingTemplate: '', marginTop: pt(18), marginBottom: pt(5),
        },
        {
          level: 3, fontFamily: HEAD, fontSize: pt(10), lineHeight: pt(13.6), fontWeight: 700, color: col('band'),
          numberingTemplate: '', marginTop: pt(12), marginBottom: pt(3),
        },
        {
          level: 4, fontFamily: HEAD, fontSize: pt(9.4), lineHeight: pt(13.6), fontWeight: 600, color: col('band'),
          numberingTemplate: '', marginTop: pt(10), marginBottom: pt(2),
        },
      ],
    },
    headingStyles: headingStyles(),
    paragraphStyles: paragraphStyles(),
    calloutStyles: calloutStyles(lang),
    parts: {
      // A part opens on a recto facing a verso in its colour: `always-odd` lays one
      // blank leaf before it (the coloured verso) and pads a white recto first
      // when the chapter before ends on a verso. Its first chapter opens on
      // the back of the divider, a verso.
      breakBefore: { parity: 'always-odd' },
      breakAfter: { enabled: true, parity: 'even' },
      margins: { top: mm(172), bottom: mm(70), left: mm(M_INNER), right: mm(M_OUTER + 40) },
      design: partDesign(lang),
      bodyStyle: {
        fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(16), color: col('white'), textAlign: 'left',
        numberColor: col('white'), bulletColor: col('white'),
        // Numbers on the margin the label, number and title hang from.
        orderedLists: { numberFormat: 'arabic', separator: '', gap: mm(3), indent: mm(0), fontFamily: SANS, numberFontSize: pt(9), itemSpacing: pt(2) },
      },
    },
    toc: toc(lang),
    // On screen the book reads as one scroll: no section dividers (the parts
    // still colour their chapters).
    htmlViewer: { overrides: { parts: { page: false } } },
    folio: GUIDE_FOLIO,
    header: runningHeads(lang),
    footer: openerFooter(),
    captionStyle: {
      fontFamily: SANS, fontSize: pt(7.4), color: col('ink'), align: 'left', gap: mm(1.8),
      labelBold: true, labelColor: col('band'), descriptionItalic: false,
      note: { fontSize: pt(6.4), color: col('muted'), italic: false, gap: mm(0.6) },
    },
    tableStyle: {
      bodyFontFamily: SANS, bodyFontSize: pt(7.8), bodyColor: col('ink'),
      headerFontFamily: SANS, headerFontSize: pt(7.6), headerBold: true, headerColor: col('white'),
      headerBackgroundEnabled: true, headerBackground: col('ink'),
      borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.1), rules: 'horizontal',
    },
    unorderedLists: { bulletChar: '•', color: col('band') },
    orderedLists: { color: col('band') },
    colorPalette: colorPalette(lang),
    resourceTypes: defaultResourceTypes(lang),
    pdfGeneration: { outlines: true },
  };
}
