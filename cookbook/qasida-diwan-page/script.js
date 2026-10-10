// ═══ Postext Cookbook · Nº 110 · A qasida on a diwan page, in two hemistichs ═══════════
// https://postext.dev/en/cookbook/qasida-diwan-page
// Code: MIT · Text: al-Mutanabbī, Dīwān, ar.wikisource (PD) · Pictures: none
// Fonts: Amiri, Aref Ruqaa, Noto Kufi Arabic (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocument, withLoadedFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'qasida-diwan-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Black text and red rubrics on a warm paper, as a Cairo diwan of the 1900s prints them.
const palette = {
  ink: '#1f1a16', // text: a warm near-black
  rubric: '#9a2b1f', // the accent: titles, the metre, the headpiece rules
  tint: '#f1e6cf', // the headpiece band
  rule: '#b8a27c', // hairlines
  muted: '#6b6156', // running heads and the note on the text
  paper: '#fbf7ee', // a cream paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'rubric (defaults)', value: { hex: palette.rubric, model: 'hex' } },
];
const NASKH = 'Amiri'; // the text: a Bulaq Naskh
const RUQAA = 'Aref Ruqaa'; // display: the titles
const KUFI = 'Noto Kufi Arabic'; // labels: metre, running heads, folios
const [SIZE, LEAD] = [13, 21]; // pt: the prose, at 1.6 × for a lightly vocalised headnote
const [OUTER, TOP] = [18, 23]; // mm: a 17 × 24 cm diwan

// #region answer: one bayt a line, both hemistichs stretched to one width
// In the Markdown, a :::verse block takes one bayt a line, the ṣadr and the ʿajuz parted
// by ||:
//   :::verse{style="bayt"}
//   عَلى قَدْرِ أهْلِ العَزْم تأتي العَزائِمُ || وَتأتي علَى قَدْرِ الكِرامِ المَكارمُ
//   :::
// The ṣadr goes on the right, the ʿajuz on the left, both stretched to the width of the
// widest half with a gap of 2 em between them. The style gives the poem its face and a
// leading deep enough for the harakat: 1.9 × the size.
const bayt = { id: 'bayt', fontFamily: NASKH, fontSize: pt(14), lineHeight: pt(26.6),
  color: col('ink'), marginTop: pt(LEAD / 2), marginBottom: pt(LEAD) };
// Justified lines lengthen their words with kashidas (tatweel) before they open the
// spaces wide: 'auto' is the default in an Arabic document, written out here to say so.
// A hemistich may stretch a word twice as far as a line of prose does: 1.2 em.
const bodyKashida = { kashida: 'auto', kashidaPatterns: 'naskh', kashidaMaxLength: 0.6 };
// #endregion

// #region opener: a headpiece band with the title in Ruqʿa and the metre under it
const rule = (id, y, thickness) => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(thickness), color: col('rubric'),
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(y) },
    size: { width: 'fill' } } });
const opener = {
  enabled: true, minHeight: mm(46),
  slot: { elements: [
    { kind: 'box', id: 'band', reserve: false, style: { backgroundColor: col('tint') },
      placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(4) },
        size: { width: 'fill', height: mm(26) } } },
    rule('band-top', 4, 1.5), rule('band-foot', 30, 0.5),
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: RUQAA, fontWeight: 700,
      fontSize: pt(34), lineHeight: 1.1, align: 'center', color: col('rubric'),
      placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(7.5) } } },
    { kind: 'text', id: 'metre', content: '{attr.metre}', fontFamily: KUFI, fontWeight: 500,
      fontSize: pt(9), align: 'center', color: col('muted'),
      placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(35) } } },
  ] },
};
// #endregion

// #region title: the diwan's half-title, centred on the page
const at = (y) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) } });
const line = (id, content, y, style) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', color: col('ink'), placement: at(y), ...style });
const titlePage = {
  id: 'title', span: 'page', runningChapter: false,
  breakBefore: { enabled: true, parity: 'any' },
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    line('diwan', 'ديوان', 52, { fontFamily: RUQAA, fontWeight: 700, fontSize: pt(64),
      lineHeight: 1.2, color: col('rubric') }),
    line('poet', '{titleText}', 84, { fontFamily: NASKH, fontWeight: 700, fontSize: pt(20) }),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.75),
      color: col('rubric'), placement: { anchor: { to: 'page', edge: 'top' },
        offset: { y: mm(100) }, size: { width: mm(24) } } },
    line('rhyme', '{attr.rhyme}', 106, { fontFamily: KUFI, fontWeight: 500, fontSize: pt(11),
      color: col('rubric') }),
    line('latin', '{attr.latin}', 150, { fontFamily: NASKH, fontSize: pt(9.5),
      color: col('muted'), italic: true }),
  ] } },
};
// #endregion

// #region heads: the book on the verso, the rhyme on the recto, folios outside
// Running heads stay on the sheet's sides: in a book bound on the right the verso (even)
// is the right-hand page, so its outer edge, where the folio goes, is the right one.
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: KUFI, fontWeight: 500, fontSize: pt(8.5),
  color: col('muted'), placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(12) } },
  ...extra });
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-right', -OUTER, { color: col('ink') }),
  head('verso-book', '{title}', 'even', 'top-right', -(OUTER + 10)),
  head('recto-rhyme', '{subtitle}', 'odd', 'top-left', OUTER + 10),
  head('recto-folio', '{pageNumber}', 'odd', 'top-left', OUTER, { color: col('ink') }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0, {
  pages: 'opener', color: col('ink'),
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-12) } } })] };
// #endregion

const config = () => ({
  locale: 'ar', // right to left, bound on the right, digits ٠–٩ (gotcha: arabic-locale-tag)
  colorPalette,
  page: { width: mm(170), height: mm(240), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(22), left: mm(21), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: NASKH, fontSize: pt(SIZE), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1.5), indentAfterHeading: false,
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true, ...bodyKashida },
  // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
  headings: { fontFamily: RUQAA, fontWeight: 700, color: col('rubric'),
    levels: [{ level: 1, fontSize: pt(34), breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener }] },
  headingStyles: [titlePage],
  paragraphStyles: [bayt,
    { id: 'note', fontFamily: NASKH, fontSize: pt(9.5), lineHeight: pt(14), color: col('muted'),
      boldColor: col('ink'), italicColor: col('muted'), textAlign: 'justify',
      firstLineIndent: pt(0), marginTop: pt(LEAD), hyphenation: { enabled: true, locale: LANG } },
    { id: 'colophon', fontFamily: NASKH, fontSize: pt(8), lineHeight: pt(11),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(7) },
  ],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  Amiri: ['400', '400i', '700'], // NASKH: the poem, the headnote, the poet; the note's Latin
  'Aref Ruqaa': ['700'], // RUQAA: ديوان and the title
  'Noto Kufi Arabic': ['500'], // KUFI: metre, rhyme, running heads and folios
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// The arabic file of each face, which loadFonts leaves out (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'A qasida on a diwan page',
  es: 'Una casida en una página de diván' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf arabic book · the Cookbook inlines cookbook/_kit/*.js here
