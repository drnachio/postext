// ═══ Postext Cookbook · Nº 111 · Fully vocalised classical prose with Qur'anic brackets ═══
// https://postext.dev/en/cookbook/vocalised-classical-prose
// Code: MIT · Text: al-Hamadhānī, Maqāmāt, ar.wikisource (PD) · Pictures: none
// Fonts: Amiri, Aref Ruqaa (SIL OFL 1.1) · Needs postext ≥ 1.15.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'vocalised-classical-prose';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Black text and a red title on a cream page, as the Beirut and Cairo editions of the
// Maqāmāt print them.
const palette = {
  ink: '#211b17', // text: a warm near-black
  rubric: '#94291d', // the accent: the title
  muted: '#6b6156', // the author's name, the Latin title line, the note on the text
  paper: '#fbf7ee', // a cream paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'rubric (defaults)', value: { hex: palette.rubric, model: 'hex' } },
];
const NASKH = 'Amiri'; // the text: a Bulaq Naskh, with its own Latin for the note
const RUQAA = 'Aref Ruqaa'; // display: the title

// #region answer: a leading of 2 × the size for text with every vowel written
// Every letter of this maqāma carries its vowel: fatḥa and shadda over the letters, kasra
// and kasratān under them, often two marks on one letter. The marks sit in the leading,
// which never grows for them, so the leading is chosen for the most vocalised line of the
// book. Unvocalised prose sets well at 1.6 × the size; fully vocalised text needs
// 1.9–2.1 ×: here 14 pt on 28 pt, 2 ×, so a kasra hanging under one line clears a shadda
// standing on the line below. Any closer and the build reports the paragraph
// (arabicMarksExceedLeading) with the leading it would need.
const SIZE = 14; // pt
const LEAD = 2 * SIZE; // pt: 28
const bodyText = {
  fontFamily: NASKH, fontSize: pt(SIZE), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  // Justified with kashidas, the default in an Arabic book, written out to say so:
  // a line widens at its joins as well as at its spaces.
  textAlign: 'justify', kashida: 'auto', kashidaPatterns: 'naskh',
  firstLineIndent: em(1.5), indentAfterHeading: false, // on the start side, the right
  optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true,
};
// #endregion

// #region page: a 14 × 21 cm book page, seventeen lines of 28 pt
// 166 mm of text block hold seventeen lines on the 28 pt pitch (9.88 mm). The measure is
// 106 mm, about twelve words of vocalised Naskh.
const page = {
  sizePreset: 'custom', width: mm(140), height: mm(210), dpi: 150,
  backgroundColor: col('paper'),
  // mirror: left is the inner margin, at the spine (the right edge of an odd page here)
  margins: { top: mm(22), bottom: mm(22), left: mm(18), right: mm(16), mirror: true },
};
// #endregion

// #region titles: the maqāma's title in Ruqʿa, its author and a Latin line under it
// The headings carry no design: the title's line box, three lines of the grid deep, lowers
// it on the page (a top margin is dropped at the head of a page), and the levels under it
// keep to the 28 pt pitch, so the text starts on a line of the grid.
const headings = {
  fontFamily: NASKH, color: col('ink'), textAlign: 'center',
  levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, fontFamily: RUQAA, fontWeight: 700, fontSize: pt(32), lineHeight: pt(LEAD * 3),
      color: col('rubric'), marginTop: pt(0), marginBottom: pt(0),
      breakBefore: { enabled: true, parity: 'odd' } },
    { level: 2, fontWeight: 700, fontSize: pt(15), lineHeight: pt(LEAD), color: col('ink'),
      marginTop: pt(0), marginBottom: pt(0) },
    { level: 3, fontWeight: 400, fontSize: pt(10), lineHeight: pt(LEAD), color: col('muted'),
      marginTop: pt(0), marginBottom: pt(LEAD) },
  ],
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ar', // right to left, bound on the right, digits ٠–٩ (gotcha: arabic-locale-tag)
  colorPalette,
  page,
  layout: { layoutType: 'single' }, // the default is two columns
  bodyText,
  headings,
  header: { elements: [] }, // a single maqāma: no running heads
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  Amiri: ['400', '700'], // NASKH: the maqāma, the author, the note and its Latin
  'Aref Ruqaa': ['700'], // RUQAA: the title
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// The arabic file of each face, which loadFonts leaves out (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'Fully vocalised classical prose',
  es: 'Prosa clásica con todas sus vocales' }) });

// @kit core fonts viewer arabic book · the Cookbook inlines cookbook/_kit/*.js here
