// ═══ Postext Cookbook · Nº 062 · Shaped verse: Herbert's Easter Wings, centred line by line ═
// https://postext.dev/en/cookbook/shaped-verse
// Code: MIT · Text: G. Herbert, The Temple, 1633 (PD; EEBO-TCP, CC0) · Spanish version: CC BY 4.0
// Fonts: IM Fell English, Great Primer and English SC (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'shaped-verse';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#241d29', // the text: a violet-black
  violet: '#5c2a6f', // the one accent: the titles and the small-capital labels
  paper: '#fbf7ee', // the sheet: an uncoated cream
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // Italic and bold take their colour from 'main-color' unless set. With 'main-color' in ink,
  // the italic subtitle, epigraph and motto print in ink instead of the default blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
const LEAD = 17; // pt: the leading of every line, verse and prose alike

// #region answer: centred text, one line of verse to a paragraph
// Postext joins the lines of a Markdown paragraph, so every line of the poem is a paragraph
// of its own, with a blank line after it. Centred, each line keeps its natural width on the
// axis of the measure, and the lengths Herbert gave his lines draw the figure:
//   Lord, who createdst man in wealth and store,
//
//   Though foolishly he lost the same,
//
//   Decaying more and more,
const verse = {
  fontFamily: 'IM Fell English', fontSize: pt(12.4), lineHeight: pt(LEAD), color: col('ink'),
  textAlign: 'center', // ragged on both sides; 1.4.1 hyphenates justified text only
  firstLineIndent: pt(0), // the default 1.5 em moves every line 3.3 mm off the titles' axis
};
// #endregion

// #region measure: an A5 leaf whose measure holds the longest line whole
// A line too long for the measure wraps, and both halves are centred, which adds a step to
// the outline.
// The widest line, 'Lord, who createdst man in wealth and store,', is 80.7 mm in 12.4 pt
// Fell, so the 110 mm measure takes every line of both poems whole.
const TRIM = { w: 148, h: 210 }; // mm: A5, one A4 sheet folded once
const MARGIN = { top: 22, bottom: 24, inner: 17, outer: 21 }; // mm: the measure is 110 mm
// #endregion

// #region titles: plain headings, centred, in the display face and the accent
// headings.textAlign centres every level. The Fell faces ship weight 400 only, so no level
// asks for bold.
const titles = {
  fontFamily: 'IM Fell Great Primer', fontWeight: 400, color: col('violet'), textAlign: 'center',
  levels: [
    // The keepsake's title opens page 1, where a break changes nothing. It is restated because
    // any headings object drops it, and a second # title would then run on
    // (gotcha: headings-drop-h1-break).
    { level: 1, fontSize: pt(40), lineHeight: pt(LEAD * 3), textTransform: 'uppercase',
      marginBottom: pt(LEAD), breakBefore: { enabled: true, parity: 'odd' } },
    // A poem opens the next page, recto or verso: The Altar (page 2) faces Easter Wings.
    // 1.4.1 drops the top margin of a heading that opens a page, so the title is lowered by
    // its line box instead: three lines deep, it sets the title about 5 mm down. The default
    // half-em margin under it rounds up to a whole line, and each poem starts on line 5.
    { level: 2, fontSize: pt(24), lineHeight: pt(LEAD * 3), textTransform: 'uppercase',
      breakBefore: { enabled: true, parity: 'any' } },
    // The small-capital labels on pages 1 and 4: the sister face at the body size, with no
    // margins, since the :::space lines place them.
    { level: 3, fontFamily: 'IM Fell English SC', fontSize: pt(12.4), lineHeight: pt(LEAD),
      marginTop: pt(0), marginBottom: pt(0) },
  ],
};
// #endregion

// #region pages: four pages, spaced and broken from the Markdown
// A blank line adds no space, so every gap on these pages is a :::space{lines=N}, which adds
// N lines of the 17 pt grid (one without the attribute). ## opens a page for each poem, and
// :::pagebreak opens the last page.
const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette,
  page: { // mirror: left is the inner margin; 150 dpi is for the screen
    sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true },
  },
  layout: { layoutType: 'single' }, // the default is two columns
  // 1.4.1 does not link referenceColor to main-color (gotcha: palette-skips-designs), so a
  // :ref added to these pages would print in the default blue.
  bodyText: { ...verse, referenceColor: col('ink') },
  headings: titles,
  header: { elements: [] }, // a folded keepsake of four pages: no running heads,
  footer: { elements: [] }, // and no folios
});
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses. Layout measures with the browser's fonts, so the
// kit loads them from Fontsource before the first build (gotcha: fonts-first).
const FONTS = {
  'IM Fell English': ['400', '400i'],
  'IM Fell Great Primer': ['400'],
  'IM Fell English SC': ['400'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showPages(doc, { title: t({ en: 'Easter Wings and The Altar', es: 'Alas de Pascua y El altar' }) });

// @kit
