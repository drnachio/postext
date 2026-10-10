// ═══ Postext Cookbook · Nº 130 · Japanese in Latin letters: Takuboku's Rōmaji Diary ════
// https://postext.dev/en/cookbook/romaji-nikki
// Code: MIT · Text: Ishikawa Takuboku, 1909 (public domain); transcription (CC BY 4.0)
// Fonts: Source Serif 4, Source Sans 3, Noto Serif JP (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A diary written in Japanese with Latin letters, and its reading in kana under each paragraph.
import { buildDocument, withLoadedFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the note; the diary is Japanese in both editions
const RECIPE = 'romaji-nikki';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: diary ink, a faded indigo, the cream of a notebook
const palette = {
  ink: '#22201d', // the rōmaji
  indigo: '#34497a', // the date and the title (8.4:1 on the paper)
  kana: '#5a554e', // the transcription, a step lighter than the text (7:1)
  rule: '#c9c1b2',
  muted: '#6f6a62', // running heads, folios, the note
  paper: '#fcfaf4',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'indigo (defaults)', value: { hex: palette.indigo, model: 'hex' } },
];
// #endregion

const SERIF = 'Source Serif 4'; // the rōmaji: ô û â ê in latin, ō ū in latin-ext
const SANS = 'Source Sans 3'; // labels, running heads, folios, the note
const MINCHO = 'Noto Serif JP'; // the kana: Noto Serif JP's Latin is Source Serif's
const [BODY, LEAD] = [10.5, 15]; // pt

// #region answer: a Japanese text in Latin letters is tagged ja-Latn
// ja-Latn is Japanese written in Latin script (BCP 47). Its language is ja, so the kana
// under each paragraph get the Japanese rules (kinsoku, 、。 spacing, the space after ！)
// and the built-in strings are Japanese; and Japanese has no hyphenation patterns, so the
// rōmaji is never divided at a line end. English patterns would divide tatinobotta or
// Surigarasu by English syllables, not by the morae a Japanese reader hears.
const language = { locale: 'ja-Latn' }; // spread into the config
const bodyText = {
  fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: em(1.2), indentAfterHeading: false,
  optimalLineBreaking: true, maxWordSpacing: 1.8, // no hyphens: the spaces take the slack
};
// The reading in kana, under its paragraph: smaller, a shade lighter, indented.
const kana = { id: 'kana', fontFamily: MINCHO, fontSize: pt(8.6), lineHeight: pt(LEAD),
  color: col('kana'), textAlign: 'justify', indent: em(1.5), firstLineIndent: em(1),
  marginTop: pt(LEAD / 4), marginBottom: pt(LEAD * 0.75) };
// #endregion

// #region title: the diary's own heading lines on an indigo field, like a cloth notebook
const onField = { color: col('paper'), align: 'center', overflow: 'wrap' };
const title = {
  id: 'title', numbered: false, toc: false, span: 'page', runningChapter: false,
  breakBefore: { enabled: true, parity: 'any' }, // its page is an opener: no running heads
  advancedDesign: { enabled: true, minHeight: mm(166), slot: { elements: [
    { kind: 'box', id: 'field', style: { backgroundColor: col('indigo') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill',
        height: 'fill' } } },
    { kind: 'text', id: 'lines', content: '{attr.lines}', ...onField, fontFamily: SERIF,
      fontWeight: 600, fontSize: pt(20), lineHeight: 1.9, letterSpacing: pt(5),
      placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(18) } } },
    { kind: 'rule', id: 'rule', thickness: pt(0.5), color: col('paper'),
      placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(122) },
        size: { width: mm(24) } } },
    { kind: 'text', id: 'note', content: '{attr.note}', inlineMarks: true, ...onField,
      fontFamily: SANS, fontSize: pt(8.5), lineHeight: 1.5, placement: { anchor: { to:
        'container', edge: 'top' }, offset: { y: mm(130) }, size: { width: mm(84) } } },
  ] } },
};
// The entry: its day as a heading, the address under it from an attribute.
const entry = {
  level: 2, fontFamily: SANS, fontWeight: 600, fontSize: pt(10), letterSpacing: pt(2.5),
  color: col('indigo'), marginTop: pt(LEAD), marginBottom: pt(LEAD), advancedDesign: {
    enabled: true, minHeight: pt(2 * LEAD), slot: { elements: [
      { kind: 'text', id: 'day', content: '{titleText}', fontFamily: SANS, fontWeight: 600,
        fontSize: pt(10), letterSpacing: pt(2.5), color: col('indigo'),
        placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { kind: 'text', id: 'place', content: '{attr.place}', fontFamily: SANS, fontSize: pt(7.5),
        letterSpacing: pt(1), color: col('muted'), overflow: 'wrap', align: 'left',
        placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: pt(LEAD) },
          size: { width: 'fill' } } },
    ] } },
};
// #endregion

// #region heads: the diary's name on the verso, the place on the recto, folios outside
const head = (id, content, parity, edge) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: SANS, fontSize: pt(7.5), letterSpacing: pt(1.5), color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(edge.endsWith('left') ? 16 : -16),
    y: mm(13) } } });
const header = { elements: [
  head('folio-even', '{pageNumber}', 'even', 'top-left'),
  head('book', 'ROMAZI NIKKI · 1909', 'even', 'top'),
  head('place', 'TOKYO · APRIL', 'odd', 'top'),
  head('folio-odd', '{pageNumber}', 'odd', 'top-right'),
] };
// #endregion

const config = () => ({
  ...language, // ja-Latn, written out (gotcha: ja-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(148), height: mm(210), dpi: 150, // A5
    backgroundColor: col('paper'),
    // A measure of about 70 characters: with no hyphens, a narrower one sets loose lines.
    margins: { top: mm(22), bottom: mm(22), left: mm(17), right: mm(17), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText,
  headings: { fontFamily: SANS, fontWeight: 600, color: col('indigo'),
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }, entry] },
  headingStyles: [title],
  paragraphStyles: [kana,
    { id: 'note', fontFamily: SANS, fontSize: pt(7.8), lineHeight: pt(11.5), color: col('muted'),
      boldColor: col('ink'), boldFontWeight: 600, textAlign: 'left', firstLineIndent: em(0),
      marginTop: pt(2 * LEAD) }],
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same diary in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Source Serif 4': ['400', '400i', '600'], 'Source Sans 3': ['400', '400i', '600'],
  'Noto Serif JP': ['400'] };
const kanaText = (markdown.match(/:::paragraphs\{style="kana"\}[\s\S]*?:::/g) ?? []).join('');

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown); // and the latin-ext files, for the ō of the note
await loadCjkFonts({ [MINCHO]: FONTS[MINCHO] }, kanaText);
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showPages(doc, { title: t({ en: 'The Rōmaji Diary', es: 'El diario en rōmaji' }) });
// #region macrons: the PDF gets each Latin face's latin-ext file too
// Fontsource keeps ō ū ā in a latin-ext file. cjkPdfProvider serves Noto Serif JP from its
// slices, and adds that file after the latin one for a Latin face whose text needs it.
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer pdf cjk
