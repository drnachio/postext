// ═══ Postext Cookbook · Nº 114 · A Bulaq page: the text framed by its commentary ════════
// https://postext.dev/en/cookbook/bulaq-framed-page
// Code: MIT · Text: Ibn ʿAqīl, Sharḥ; Ibn Mālik, Alfiyya, ar.wikisource (PD) · Pictures: none
// Fonts: Amiri, Aref Ruqaa (SIL OFL 1.1) · Needs postext ≥ 1.15.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'bulaq-framed-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Black and a brown-red on a toned paper: the two inks of a Cairo press around 1900.
const palette = {
  ink: '#1d1915', // text and frame rules
  rubric: '#8e3020', // the accent: lemmas of the glosses, the matn, titles
  rule: '#3a312a', // the frame
  muted: '#6a6056', // the note on the text
  paper: '#f6efe0', // a toned paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'rubric (defaults)', value: { hex: palette.rubric, model: 'hex' } },
];
const NASKH = 'Amiri'; // the text, the matn and the glosses
const RUQAA = 'Aref Ruqaa'; // the title page and the chapter title
const TRIM = { width: 170, height: 240 }; // mm
const M = { top: 34, bottom: 24, inner: 20, outer: 15 }; // mm: the type area inside the frame

// #region answer: the commentary's column beside the text, both inside one ruled frame
// The text runs in the main column of a column-and-a-half layout; the side column, on the
// outer side, takes only boxes with span 'side', so each gloss stands level with the
// paragraph it comments on. A column rule parts the two, as the jadwal of a Bulaq page does.
const layout = { layoutType: 'oneAndHalf', sideColumnRole: 'floats', sideColumnSide: 'outer',
  sideColumnPercent: 31, gutterWidth: mm(7),
  columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.6) } };
// A gloss is a callout with no box: the margin's own face, its lemma bold in the rubric.
const hashiya = { id: 'hashiya', span: 'side', backgroundEnabled: false, borderRadius: pt(0),
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  stripe: { enabled: false }, border: { enabled: false },
  body: { fontFamily: NASKH, fontSize: pt(10), lineHeight: pt(16), color: col('ink'),
    boldColor: col('rubric'), textAlign: 'justify', firstLineIndent: pt(0),
    paragraphSpacing: true } };
// #endregion

// #region frame: a double rule round the type area and a band for the running head
// Page-level design elements are physical: the frame follows the margins of each side of
// the spread. In a book bound on the right the even page is the right-hand one, its spine
// on its left, so its inner margin is the left one.
const frame = (parity, withBand = true) => {
  const left = parity === 'even' ? M.inner : M.outer;
  const width = TRIM.width - M.inner - M.outer;
  const box = (id, inset, thickness) => ({ kind: 'box', id: `${id}-${parity}`, parity,
    style: { borderColor: col('rule'), borderWidth: pt(thickness) },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      offset: { x: mm(left - 4 + inset), y: mm(M.top - 13 + inset) },
      size: { width: mm(width + 8 - 2 * inset),
        height: mm(TRIM.height - M.top - M.bottom + 17 - 2 * inset) } } });
  return [box('outer', 0, 1.4), box('inner', 1.3, 0.4), ...(withBand ? [
    { kind: 'rule', id: `band-${parity}`, parity, direction: 'horizontal', thickness: pt(0.4),
      color: col('rule'), placement: { anchor: { to: 'page', edge: 'top-left' },
        offset: { x: mm(left - 2.7), y: mm(M.top - 4) },
        size: { width: mm(width + 5.4) } } }] : [])];
};
// The chapter centred in the band, the folio at its outer end.
const band = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: NASKH, fontWeight: 700, fontSize: pt(10.5),
  color: col('ink'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(M.top - 11) } }, ...extra });
const header = { elements: [...frame('even'), ...frame('odd'),
  band('head', '{chapterTitle}', 'all', 'top', 0),
  band('folio-even', '{pageNumber}', 'even', 'top-right', -(M.outer + 1), { pages: 'all' }),
  band('folio-odd', '{pageNumber}', 'odd', 'top-left', M.outer + 1, { pages: 'all' })] };
// #endregion

// #region title: the title page, framed like the text pages
const line = (id, content, y, style) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', color: col('ink'),
  placement: { anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) },
    size: { width: mm(110) } }, ...style });
const titlePage = { id: 'title', span: 'page', runningChapter: false,
  breakBefore: { enabled: true, parity: 'any' }, header: { elements: [] },
  footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [...frame('odd', false),
    line('book', '{titleText}', 64, { fontFamily: RUQAA, fontWeight: 700, fontSize: pt(40),
      lineHeight: 1.3, color: col('rubric') }),
    line('on', '{attr.on}', 88, { fontFamily: NASKH, fontWeight: 700, fontSize: pt(17) }),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.75), color: col('rubric'),
      placement: { anchor: { to: 'page', edge: 'top' }, offset: { y: mm(104) },
        size: { width: mm(30) } } },
    line('margin', '{attr.margin}', 112, { fontFamily: NASKH, fontSize: pt(13) }),
    line('latin', '{attr.latin}', 196, { fontFamily: NASKH, fontSize: pt(9), italic: true,
      color: col('muted') }),
  ] } } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ar', // right to left, bound on the right, digits ٠–٩ (gotcha: arabic-locale-tag)
  colorPalette,
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(M.top), bottom: mm(M.bottom),
      left: mm(M.inner), right: mm(M.outer), mirror: true } },
  layout,
  bodyText: { fontFamily: NASKH, fontSize: pt(12.5), lineHeight: pt(20.5), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1.2), indentAfterHeading: false,
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true },
  // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
  headings: { fontFamily: RUQAA, fontWeight: 700, color: col('rubric'), textAlign: 'center',
    levels: [{ level: 1, fontSize: pt(22), lineHeight: pt(32), marginTop: pt(0),
      marginBottom: pt(8), breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [titlePage],
  calloutStyles: [hashiya],
  paragraphStyles: [
    // The matn's bayts: bold and in the rubric, as Ibn ʿAqīl's printers set the Alfiyya.
    { id: 'matn', fontFamily: NASKH, fontWeight: 700, fontSize: pt(12.5),
      lineHeight: pt(23), color: col('rubric'), marginTop: pt(4), marginBottom: pt(6) },
    { id: 'note', fontFamily: NASKH, fontSize: pt(9), lineHeight: pt(13), color: col('muted'),
      boldColor: col('ink'), textAlign: 'justify', firstLineIndent: pt(0), marginTop: pt(10),
      hyphenation: { enabled: true, locale: LANG } },
    { id: 'colophon', fontFamily: NASKH, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(6) },
  ],
  header, footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  Amiri: ['400', '400i', '700'], // NASKH: text, matn, glosses; the Latin lines
  'Aref Ruqaa': ['700'], // RUQAA: the title page and the chapter title
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// The arabic file of each face, which loadFonts leaves out (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'A Bulaq page', es: 'Una página de Bulaq' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf arabic book · the Cookbook inlines cookbook/_kit/*.js here
