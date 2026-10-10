// ═══ Postext Cookbook · Nº 099 · A legal opinion cited in OSCOLA ══════════════════
// https://postext.dev/en/cookbook/legal-opinion-oscola
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Libre Baskerville, Libre Caslon Display, Libre Franklin (OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'legal-opinion-oscola';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a law-report claret for the band, ink and cream paper for the rest
const palette = {
  ink: '#1f1b1a', claret: '#5e1b26', tint: '#ecdcd8', rule: '#bfb4ad', muted: '#6b625d',
  paper: '#fcfaf6',
};
// Each colour carries its hex and the palette entry it follows.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.claret })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Libre Baskerville', DISPLAY = 'Libre Caslon Display', LABEL = 'Libre Franklin';
const TRIM = { width: 162, height: 240 }; // a law-journal offprint
const MARGIN = { top: 23, bottom: 22, inner: 19, outer: 21 };
const LEAD = 13.6; // pt
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region oscola: two patches to the bundled OSCOLA style, applied before the build
// The bundled oscola.csl writes a paragraph pinpoint in brackets only in a case's first
// note: a later note printed "Robinson (n 1) para 55" and "ibid 27", and a repeated
// statute "ibid 7". These two replacements give "Robinson (n 1) [55]", "ibid [27]" and
// "ibid s 7", as OSCOLA prints them.
const LOCATOR = `<macro name="label-locator"><choose>
  <if type="legal_case" locator="paragraph">
    <text variable="locator" prefix="[" suffix="]"/></if>
  <else-if locator="page"><text variable="locator"/></else-if>
  <else><group delimiter=" "><label form="short" strip-periods="true" variable="locator"/>
    <text variable="locator"/></group></else>
</choose></macro>`;
const OSCOLA = STYLES.oscola
  .replace(/<macro name="label-locator">[\s\S]*?<\/macro>/, LOCATOR)
  .replace(/(<if position="ibid-with-locator">[\s\S]*?)<text variable="locator"\/>/,
    '$1<text macro="label-locator"/>');
// #endregion

// #region answer: OSCOLA footnotes for cases, statutes and articles
// The text cites with [@robinson2018, para 21]; OSCOLA is a note style, so each citation
// becomes a footnote: the case in full the first time, "ibid" when the note before cites
// the same authority, "Robinson (n 1) [55]" after that. Case names come out italic,
// statutes roman, and no abbreviation takes a full stop (AC, HL, UKSC, edn, n, s).
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'custom', customStyle: OSCOLA, // the bundled 'oscola', patched above
  locale: 'en-GB', // OSCOLA's words stay English in the Spanish edition too
  notes: 'footnote',
  link: false, // a case comment has no bibliography to link to
  bibliography: { auto: false }, // OSCOLA articles cite in the notes only
};
// The citation notes share the numbering and the look of the author's own [^notes].
const footnotes = {
  placement: 'column', numbering: 'chapter',
  fontSize: pt(7.8), lineHeight: pt(10.2), spaceBetween: pt(2.2),
  textAlign: 'left', // ragged: long report citations would open wide gaps if justified
  separator: { width: 0.25, lineWidth: pt(0.5), color: col('rule') },
};
// #endregion

// #region opener: the claret band holds the case name, its citation and the title
const BAND = 124; // mm from the trim's top
const big = (id, content, family, size, color, y, extra = {}) => ({
  kind: 'text', id, content, fontFamily: family, fontSize: pt(size), lineHeight: 1.08, color,
  align: 'left', overflow: 'wrap', ...extra,
  placement: { ...at('container', 'top-left', 0, y), size: { width: mm(118), height: 'auto' } },
});
const opener = {
  enabled: true,
  minHeight: mm(BAND - MARGIN.top + 8), // the text starts 8 mm under the band
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('claret') },
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: mm(BAND) } } },
    big('kicker', '{attr.kicker}', LABEL, 7.4, col('tint'), 2,
      { fontWeight: 600, letterSpacing: pt(1.4), textTransform: 'uppercase' }),
    big('case', '{attr.case}', TEXT, 60, col('paper'), 9, { italic: true }),
    big('parties', '{attr.parties}', TEXT, 12.5, col('tint'), 33, { italic: true }),
    big('citation', '{attr.citation}', TEXT, 10.5, col('tint'), 40),
    { kind: 'box', id: 'hairline', style: { backgroundColor: col('tint') },
      placement: { ...at('container', 'top-left', 0, 51),
        size: { width: mm(30), height: pt(0.6) } } },
    big('title', '{titleText}', DISPLAY, 27, col('paper'), 57),
    big('byline', '{attr.byline}', LABEL, 8.5, col('tint'), 82,
      { fontWeight: 500, letterSpacing: pt(0.5) }),
  ] },
};
// #endregion

const head = (id, content, parity, edge, x, align) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: LABEL, fontWeight: 500,
  fontSize: pt(7.2), letterSpacing: pt(1), textTransform: 'uppercase', color: col('muted'),
  align, placement: at('page', edge, x, 13),
});
const journal = t({ en: 'Notes on Obligations', es: 'Cuadernos de Obligaciones' });

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // picks the hyphenation patterns
  colorPalette,
  citations,
  footnotes,
  page: {
    sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: TEXT, fontWeight: 400, color: col('ink'),
    levels: [
      // A new page on either side: the default would wait for a recto.
      { level: 1, fontSize: pt(27), breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: opener },
      { level: 2, italic: true, fontSize: pt(12), color: col('claret'),
        lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) },
    ],
  },
  paragraphStyles: [
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(6.8), lineHeight: pt(9.2),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header: { elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, 'left'),
    head('verso-journal', journal, 'even', 'top-left', MARGIN.outer + 8, 'left'),
    head('recto-title', '{title}', 'odd', 'top-right', -(MARGIN.outer + 8), 'right'),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer, 'right'),
  ] },
  footer: { elements: [ // a drop folio on the opener page only
    { kind: 'text', id: 'drop-folio', content: '{pageNumber}', pages: 'opener',
      fontFamily: LABEL, fontWeight: 500, fontSize: pt(7.2), color: col('muted'),
      align: 'center', placement: at('page', 'bottom', 0, -11) },
  ] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses.
const FONTS = {
  'Libre Baskerville': ['400', '400i', '700'],
  'Libre Caslon Display': ['400'],
  'Libre Franklin': ['400', '500', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
const title = t({ en: 'A legal opinion cited in OSCOLA',
  es: 'Un dictamen jurídico citado en OSCOLA' });
showPages(doc, { title });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
