// ═══ Postext Cookbook · Nº 109 · A Maghreb edition of an Arabic text, with European digits ═══
// https://postext.dev/en/cookbook/maghreb-edition-european-digits
// Code: MIT · Text: original Arabic prose (CC BY 4.0) · Pattern: drawn in code
// Fonts: Noto Naskh Arabic, Noto Kufi Arabic (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the chapter is Arabic in both editions
const RECIPE = 'maghreb-edition-european-digits';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// The green and cobalt of Fes tilework, on a white book paper.
const palette = {
  ink: '#1c1d1b', // text
  green: '#1d6650', // the accent: headings, the list numbers, the notes' rule
  cobalt: '#25488a', // the tile's second colour
  ochre: '#c99a3e', // the tile's third colour
  muted: '#62655f', // folios, captions' notes, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.green })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, LABEL] = ['Noto Naskh Arabic', 'Noto Kufi Arabic'];

// #region marks: list numbers, note markers and figure numbers in the same digits
// «1-» and «(1)», as Arabic books write them; the number itself follows numerals.
const orderedLists = { color: col('green'), fontWeight: 700, marginTop: pt(0),
  marginBottom: pt(0), levels: [{ level: 1, numberFormat: 'arabic', separator: '-' }] };
const footnotes = { markerTemplate: '({n})', numbering: 'page', noteNumberPosition: 'inline',
  fontSize: pt(10), lineHeight: pt(15), separator: { width: 0.3, color: col('green') } };
// A colon after the label: a full stop after a number reads as a decimal point.
const captionStyle = { fontFamily: TEXT, fontSize: pt(10), color: col('ink'), labelBold: true,
  labelColor: col('green'), labelSeparator: ': ', note: { color: col('muted') } };
// #endregion

// #region answer: ar-MA prints 1, 2, 3 in every number the engine writes
const config = () => ({
  // Written out, never LANG (gotcha: arabic-locale-tag). The Moroccan tag keeps the text right
  // to left and the binding on the right, and sets numerals: 'auto' to European digits: the
  // folios, the chapter and section numbers, the list, the notes and the figure number.
  locale: 'ar-MA',
  colorPalette,
  page: { width: mm(135), height: mm(210), dpi: 150, pageNumbering: { startAt: 41 },
    margins: { top: mm(22), bottom: mm(22), left: mm(19), right: mm(16), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(12.5), lineHeight: pt(20.5), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1.5), indentAfterHeading: false },
  headings: { fontFamily: LABEL, fontWeight: 700, color: col('green'), levels: [
    // A chapter opens on an odd page, with no blank page forced before it.
    { level: 1, fontSize: pt(26), lineHeight: pt(41), numberingTemplate: 'الفصل {1}',
      numberSeparator: ': ', breakBefore: { enabled: true, parity: 'odd' },
      marginTop: pt(0), marginBottom: pt(10) },
    { level: 2, fontSize: pt(13), lineHeight: pt(20.5), numberingTemplate: '{1}-{2}',
      numberSeparator: '  ', marginTop: pt(20.5), marginBottom: pt(0) },
  ] },
  orderedLists, footnotes, captionStyle,
  paragraphStyles: [{ id: 'colophon', fontFamily: TEXT, fontSize: pt(8.5), lineHeight: pt(11),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(20.5) }],
  header: { elements: [] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', fontFamily: LABEL,
    fontSize: pt(9), color: col('muted'), align: 'center',
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-12) } } }] },
});
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Arabic text in both

// #region art: a band of zellige, eight-pointed stars set in cobalt, green and ochre
// The star is two squares turned 45°; between four stars a small square. Paths only.
const star = (cx, cy, r) => {
  const pts = [];
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    const d = k % 2 ? r * 0.7654 : r; // where the two squares' sides cross
    pts.push(`${(cx + d * Math.sin(a)).toFixed(2)} ${(cy - d * Math.cos(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
};
function zellige(W, H, S) {
  let stars = '';
  let inner = '';
  let squares = '';
  for (let y = 0; y <= H + S; y += S) {
    for (let x = 0; x <= W + S; x += S) {
      stars += star(x, y, S * 0.47);
      inner += star(x, y, S * 0.2);
      squares += `M${x + S / 2} ${y + S / 2 - S * 0.17}l${S * 0.17} ${S * 0.17}`
        + `l${-S * 0.17} ${S * 0.17}l${-S * 0.17} ${-S * 0.17}Z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${palette.green}"/>`
    + `<path d="${stars}" fill="${palette.cobalt}" stroke="${palette.paper}" stroke-width="0.5"/>`
    + `<path d="${inner}" fill="${palette.paper}"/>`
    + `<path d="${squares}" fill="${palette.ochre}" stroke="${palette.paper}" stroke-width="0.4"/>`
    + '</svg>';
}
// #endregion
const [BAND_W, BAND_H] = [100, 58]; // mm: the measure, and a band a little over half as deep
const resources = [{ id: 'zellige', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'zellige.svg', width: BAND_W * 10, height: BAND_H * 10 },
  caption: 'زليج من نجوم ثمانية الرؤوس، على طريقة الفسيفساء الفاسية',
  altText: t({ en: 'Eight-pointed cobalt stars outlined in white on a green ground, with small '
    + 'ochre squares between them.', es: 'Estrellas cobalto de ocho puntas perfiladas en blanco '
    + 'sobre fondo verde, con pequeños cuadrados ocre entre ellas.' }) }];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  'Noto Naskh Arabic': ['400', '700'], // TEXT: the chapter, notes, captions; bold emphasis
  'Noto Kufi Arabic': ['400', '700'], // LABEL: headings, folios
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// Each Arabic face's letters live in a file of their own (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown + resources[0].caption);
await loadSvg('zellige.svg', zellige(BAND_W, BAND_H, 13));
const doc = await withLoadedFonts(() => buildDocument({ markdown, resources }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'A Maghreb edition with European digits',
  es: 'Una edición magrebí con cifras europeas' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images arabic book · the Cookbook inlines cookbook/_kit/*.js here
