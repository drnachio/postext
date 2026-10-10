// ═══ Postext Cookbook · Nº 063 · Certificate with a guilloche border ═══════════════
// https://postext.dev/en/cookbook/certificate-single-page
// Code: MIT · Text: original (CC BY 4.0) · Guilloche and seal: generated in code (CC BY 4.0)
// Fonts: Rosarivo, Pinyon Script, Aboreto (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// End-of-course certificates, one page per student, drawn by one heading style, in one PDF.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'certificate-single-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1f2a2e', // text and the student's name
  teal: '#1f5f5b', // the frame, the title lines
  gold: '#b08d57', // hairlines and the rule under the name; never text (2.9:1 on paper)
  seal: '#8d2c2c', // the seal and the serial number
  rule: '#8f8878', // signature lines
  muted: '#6d6a60', // the lead-in, the signatories' roles, the imprint
  paper: '#fbf8ef', // the sheet
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [W, H] = t({ en: [215.9, 279.4], es: [210, 297] }); // US Letter; A4 for the Spanish diploma
const MARGIN = 32; // mm on every side, inside the frame's inner rule (26 mm in)
const SIDE = 50; // mm: the certificate's side margins, a 116 mm measure (110 on A4)
// Positions are drawn on US Letter and stretched to A4: y(90) is 90 mm down on Letter.
const y = (mm) => (mm * H) / 279.4;
const SIGN = y(194); // mm from the top: the seal's top edge, where the text area ends
const SEAL = { w: 40, h: 45, r: 17 }; // mm: the seal with its ribbon tails, and its disc's radius
const at = (edge, x, top) => ({ anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(top) } });
const caps = { fontFamily: 'Aboreto', textTransform: 'uppercase', color: col('teal') };

// #region answer: one heading style draws the whole certificate
const certificate = () => ({ // a function: it uses the elements defined below
  id: 'certificate',
  // Section geometry, for this style's pages only: a narrower measure, and a text area that
  // ends at the seal, so a citation too long for the page moves on instead of running under it.
  margins: { left: mm(SIDE), right: mm(SIDE), bottom: mm(H - SIGN) },
  // Header and footer elements paint over the page and reserve nothing (gotcha:
  // header-paints-over-text), so the frame, the seal and the signatures go there. In the
  // opener the signature lines would count towards its height (gotcha:
  // opener-reserves-anchored), and a design that reaches below the text area takes the page.
  header: { elements: [frame, serial] },
  footer: { elements: signatures },
  // The citation starts 18 lines of the 17 pt grid under the top margin, 140 mm down (19
  // lines, 146 mm, on A4): an opener's height rounds up to whole lines, and without
  // marginBottom: 0 the level's 0.5 em under a heading would add a line. minHeight is a
  // floor: the title block alone would start the citation at 128 mm (134 mm on A4).
  advancedDesign: { enabled: true, minHeight: mm(y(106)), slot: { elements: title } },
  marginBottom: mm(0),
});
// Hook-up: headingStyles: [certificate()], and in the Markdown one heading per student:
// # Imogen Achterberg {style="certificate" serial="26-031"}
// #endregion

// #region frame: the guilloche is an SVG resource, drawn by an image element in the header
const frame = { kind: 'image', id: 'frame', resourceId: 'guilloche',
  placement: { anchor: { to: 'page', edge: 'top-left' }, // the trim box
    size: { width: 'fill', height: 'fill' } } }; // the SVG has the page's proportions
const serial = { kind: 'text', id: 'serial', ...caps, fontSize: pt(8.5), letterSpacing: pt(1.6),
  content: t({ en: 'No. {attr.serial}', es: 'N.º {attr.serial}' }), // from the heading line
  color: col('seal'), align: 'right', placement: at('top-right', -MARGIN, 29) };
const PX = 10; // declared pixels per mm: an SVG resource only needs the right proportions
const svg = (id, w, h, altText) => ({ id, typeId: 'figure', kind: 'svg', createdAt: 0,
  updatedAt: 0, altText, svg: { fileId: `${id}.svg`, width: w * PX, height: h * PX } });
const resources = [
  svg('guilloche', W, H, t({ en: 'A teal guilloche border with cream rosettes at the corners.',
    es: 'Una orla de guilloché verde azulado con rosetas color crema en las esquinas.' })),
  svg('seal', SEAL.w, SEAL.h, t({ en: 'A red seal with a serrated edge and two ribbon tails.',
    es: 'Un sello rojo de borde dentado con dos cintas.' })),
];
// #endregion

// #region title: the opener holds the title block; the name is the heading's own text
const centred = (top) => at('top', 0, y(top)); // tracked or not, the letters are centred
const title = [
  { kind: 'text', id: 'kicker', ...caps, fontSize: pt(9.5), letterSpacing: pt(2.4),
    content: t({ en: 'The Quoin Room · Letterpress workshop',
      es: 'La Cuña · Taller de tipografía' }),
    placement: centred(39) },
  { kind: 'text', id: 'title', content: t({ en: 'Certificate', es: 'Diploma' }), ...caps,
    fontSize: pt(46), lineHeight: 1, letterSpacing: pt(3), placement: centred(48) },
  { kind: 'text', id: 'of', content: t({ en: 'of completion', es: 'de aprovechamiento' }),
    ...caps, fontSize: pt(11), letterSpacing: pt(4), placement: centred(68) },
  { kind: 'text', id: 'lead', content: t({ en: 'This certifies that', es: 'Se otorga a' }),
    fontFamily: 'Rosarivo', italic: true, fontSize: pt(13), color: col('muted'),
    placement: centred(90) },
  { kind: 'text', id: 'name', content: '{titleText}', fontFamily: 'Pinyon Script',
    fontSize: pt(48), lineHeight: 1.25, // 60 pt from line to line of a long name
    color: col('ink'), align: 'center', overflow: 'wrap', // a long name takes a second line
    placement: { ...centred(97), size: { width: mm(W - 2 * MARGIN) } } },
  { kind: 'rule', id: 'underline', direction: 'horizontal', thickness: pt(0.75),
    color: col('gold'), placement: { anchor: { to: '#name', edge: 'below' },
      offset: { x: mm(18), y: mm(5) }, size: { width: mm(W - 2 * MARGIN - 36) } } },
];
// #endregion

// #region signatures: seal, signature lines, names and roles, hung from the seal's top edge
const SIGNED = t({ en: [['Harriet Colfax', 'Master printer'], ['Samuel Okoro', 'Course tutor']],
  es: [['Pilar Ansón', 'Directora del taller'], ['Julián Oteo', 'Profesor del curso']] });
// mm: each signature line stops 3 mm short of the seal (56 on Letter, 53 on A4)
const LINE = (W - 2 * MARGIN - 2 * SEAL.r) / 2 - 3;
const under = (id, gap, x = 0) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { x: mm(x), y: mm(gap) }, size: { width: mm(LINE) } });
const signatures = [
  { kind: 'image', id: 'seal', resourceId: 'seal',
    placement: { ...at('top', 0, SIGN), size: { width: mm(SEAL.w) } } },
  ...SIGNED.flatMap(([who, role], i) => [
    { kind: 'rule', id: `line${i}`, direction: 'horizontal', thickness: pt(0.6), color: col('rule'),
      placement: { ...at('top-left', i ? W - MARGIN - LINE : MARGIN, SIGN + 23),
        size: { width: mm(LINE) } } },
    { kind: 'text', id: `who${i}`, content: who, fontFamily: 'Rosarivo', fontSize: pt(10.5),
      color: col('ink'), align: 'center', placement: under(`line${i}`, 1.6) },
    { kind: 'text', id: `role${i}`, content: role, ...caps, fontSize: pt(7.5),
      letterSpacing: pt(1.4), color: col('muted'), align: 'center',
      placement: under(`who${i}`, 0.6) },
  ]),
  { kind: 'text', id: 'imprint', fontFamily: 'Rosarivo', italic: true, fontSize: pt(7),
    content: t({ en: 'Printed at the Quoin Room · set in Rosarivo, Pinyon Script and Aboreto',
      es: 'Impreso en La Cuña · compuesto en Rosarivo, Pinyon Script y Aboreto' }),
    color: col('muted'), placement: at('top', 0, SIGN + 50) },
];
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // the PDF's /Lang; centred text is never hyphenated
  colorPalette,
  page: { width: mm(W), height: mm(H), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(MARGIN), bottom: mm(MARGIN), left: mm(MARGIN), right: mm(MARGIN) } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: 'Rosarivo', fontSize: pt(11.5), lineHeight: pt(17), color: col('ink'),
    // Ink for the italic (the course title, the date line) and for any bold you add to the
    // wording; referenceColor falls back to boldColor.
    boldColor: col('ink'), italicColor: col('ink'),
    textAlign: 'center', firstLineIndent: pt(0), paragraphSpacing: true,
  },
  // The design replaces the heading's own text, which the PDF still tags and bookmarks: set it
  // in a face the pages load, regular, since Rosarivo has no bold.
  headings: { fontFamily: 'Rosarivo', fontWeight: 400,
    // One page per student, no blank backs; the certificate style inherits it.
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [certificate()],
  header: { elements: [] }, // no page-wide furniture: the certificate style sets its own
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the wording every certificate shares

// #region merge: the class list becomes one styled heading per student
// Name and serial: {titleText} and {attr.serial} in the designs (gotcha: attr-values).
const CLASS = t({
  en: [['Imogen Achterberg', '26-031'], ['Tomás Okafor', '26-032'], ['Ruth Adair', '26-033']],
  es: [['Lucía Beltrán Ochoa', '26-017'], ['Íñigo Sarasola', '26-018'], ['Ana Rius', '26-019']],
});
const merged = CLASS.map(([name, serial]) =>
  `# ${name} {style="certificate" serial="${serial}"}\n\n${markdown}`).join('\n\n');
const metadata = { // the PDF's title and author
  title: t({ en: 'Certificates of completion, fall 2026',
    es: 'Diplomas del curso de otoño de 2026' }),
  author: t({ en: 'The Quoin Room', es: 'La Cuña' }) };
// #endregion

// #region art: the guilloche frame and the seal, drawn as SVG paths
// Strokes and fills only: no <marker>, filter or mask, so the PDF keeps both drawings vector
// (gotcha: svg-no-marker-filters), and no text. No random numbers, so every build draws the
// same curves.
const TAU = 2 * Math.PI;
const r2 = (v) => Math.round(v * 100) / 100;
// A polyline in relative moves, about a tenth smaller than in absolute coordinates.
const polyline = (pts, close = false) => `M${r2(pts[0][0])} ${r2(pts[0][1])}l${pts.slice(1)
  .map(([x, y], i) => `${r2(x - pts[i][0])} ${r2(y - pts[i][1])}`).join(' ')}${close ? 'z' : ''}`;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// A hypotrochoid: the path of a pen at distance d from the centre of a circle of radius r
// rolling inside one of radius R, scaled to `radius` mm. It closes after r / gcd(R, r) turns.
function spiro(R, r, d, radius, steps = 1400) {
  const k = radius / (R - r + d);
  return polyline(Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * TAU * (r / gcd(R, r));
    return [((R - r) * Math.cos(a) + d * Math.cos(((R - r) / r) * a)) * k,
      ((R - r) * Math.sin(a) - d * Math.sin(((R - r) / r) * a)) * k];
  }), true);
}
// One lens of the border, `len` mm long and up to `half` mm either side of its axis: strands
// that cross at a steady rate, under an envelope that pinches them together at both ends.
const lens = (len, half, count, color) => Array.from({ length: count }, (_, k) =>
  `<path stroke="${color}" d="${polyline(Array.from({ length: 97 }, (_, i) => {
    const s = (i / 96) * len;
    const envelope = 0.56 - 0.44 * Math.cos((TAU * s) / len);
    return [s, half * envelope * Math.sin((2 * TAU * s) / len + (TAU * k) / count)];
  }))}"/>`).join('');
const BAND = [11, 23]; // the teal band, mm in from the trim; the lenses run along its middle
const MID = (BAND[0] + BAND[1]) / 2;
function guillocheSvg() {
  // Each side holds a whole number of lenses about 24 mm long: one tile per side length.
  const tiles = [['h', W - 2 * MID], ['v', H - 2 * MID]].map(([id, run]) => {
    const n = Math.round(run / 24);
    return { id, n, len: run / n, def: `<g id="${id}" stroke-width="0.2">`
      + `${lens(run / n, 5.4, 11, palette.paper)}${lens(run / n, 2.6, 3, palette.gold)}</g>` };
  });
  const use = (id, x, y, turn) => `<use href="#${id}" transform="translate(${r2(x)} ${r2(y)})`
    + ` rotate(${turn})"/>`;
  const uses = tiles.flatMap(({ id, n, len }) => Array.from({ length: n }, (_, i) => MID + i * len)
    .flatMap((p) => (id === 'h' ? [use(id, p, MID, 0), use(id, p, H - MID, 0)]
      : [use(id, MID, p, 90), use(id, W - MID, p, 90)])));
  const ring = (inset, color, width) => `<rect x="${inset}" y="${inset}"`
    + ` width="${r2(W - 2 * inset)}" height="${r2(H - 2 * inset)}" stroke="${color}"`
    + ` stroke-width="${width}"/>`;
  const box = (inset) => `M${inset} ${inset}h${r2(W - 2 * inset)}v${r2(H - 2 * inset)}`
    + `h${r2(2 * inset - W)}z`;
  // A cream medallion on the teal band, so each corner reads as a disc at thumbnail size.
  const rosette = `<g id="rosette"><circle r="10" fill="${palette.paper}" stroke="${palette.gold}"`
    + ` stroke-width="0.6"/><circle r="9.1" stroke="${palette.teal}" stroke-width="0.25"/>`
    + `<path d="${spiro(30, 13, 9, 8.2)}" stroke="${palette.teal}" stroke-width="0.16"/>`
    + `<circle r="1.4" fill="${palette.gold}"/></g>`;
  const corners = [[MID, MID], [W - MID, MID], [MID, H - MID], [W - MID, H - MID]]
    .map(([x, y]) => use('rosette', x, y, 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(W * PX)}" height="${r2(H * PX)}"`
    + ` viewBox="0 0 ${W} ${H}"><defs>${tiles.map((tile) => tile.def).join('')}${rosette}</defs>`
    + `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${ring(9, palette.gold, 0.35)}`
    + `<path fill="${palette.teal}" fill-rule="evenodd" d="${box(BAND[0])}${box(BAND[1])}"/>`
    + `${uses.join('')}${ring(25, palette.gold, 0.6)}${ring(26.2, palette.teal, 0.2)}`
    + `${corners.join('')}</g></svg>`;
}
function sealSvg() {
  const [cx, cy, R] = [SEAL.w / 2, 19, SEAL.r];
  const teeth = Array.from({ length: 144 }, (_, i) => [
    cx + (i % 2 ? R : R - 1.3) * Math.cos((i / 144) * TAU),
    cy + (i % 2 ? R : R - 1.3) * Math.sin((i / 144) * TAU)]);
  // Two ribbon tails behind the seal, notched at the ends; the far one a shade darker.
  const tail = (s) => polyline([[cx + s * 3, cy], [cx + s * 12, cy + 24], [cx + s * 9, cy + 21.6],
    [cx + s * 6, cy + 25.5], [cx - s * 3, cy + 3]], true);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SEAL.w * PX}" height="${SEAL.h * PX}"`
    + ` viewBox="0 0 ${SEAL.w} ${SEAL.h}"><path d="${tail(-1)}" fill="#6f2323"/>`
    + `<path d="${tail(1)}" fill="${palette.seal}"/>`
    + `<path d="${polyline(teeth, true)}" fill="${palette.seal}"/>`
    + `<g fill="none" stroke="${palette.paper}" stroke-linecap="round">`
    + `<circle cx="${cx}" cy="${cy}" r="${R - 3}" stroke-width="0.35"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${R - 3.8}" stroke-width="0.15"/>`
    + `<path transform="translate(${cx} ${cy})" d="${spiro(24, 11, 9, R - 5)}"`
    + ' stroke-width="0.14"/>'
    + `</g><circle cx="${cx}" cy="${cy}" r="1.3" fill="${palette.paper}"/></svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded from Fontsource before the first build: layout measures with them
const FONTS = { Rosarivo: ['400', '400i'], 'Pinyon Script': ['400'], Aboreto: ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('guilloche.svg', guillocheSvg());
await loadSvg('seal.svg', sealSvg());
const doc = await buildDocumentWithFonts({ markdown: merged, metadata, resources },
  config(),
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Certificate with a guilloche border',
  es: 'Diploma con orla de guilloché' }) });
// #region pdf: one document with a page per student, so one PDF holds the whole class
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // bookmarks: one per heading, so one per student
document.querySelector('[data-postext-pdf]').textContent = t({ en: 'Class list → one PDF',
  es: 'Toda la clase en un PDF' });
// #endregion

// @kit
