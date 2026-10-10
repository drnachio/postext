// ═══ Postext Cookbook · Nº 140 · A physics letter with a data figure across the top ═══
// https://postext.dev/en/cookbook/physics-letter-two-columns
// Code: MIT · Text: Abbott et al., PRL 116, 061102 (CC BY 3.0) · Data: GWOSC (CC BY 4.0)
// Fonts: Gelasio, Albert Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, registerCitationEngine,
  defaultResourceTypes, initMathEngine, renderMath,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'physics-letter-two-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink and one blue for the text; the detectors' colours for the data
const palette = { ink: '#171a21', accent: '#25578a', tint: '#eef2f6', rule: '#b7c0ca',
  muted: '#5a636e', paper: '#ffffff' };
const data = { hanford: '#cf5f24', livingston: palette.accent, purple: '#74519c' }; // figures
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SERIF, SANS] = ['Gelasio', 'Albert Sans'];
// mm: US Letter, head, foot and side margins, gutter; then the measure and one column
const [TRIM_W, TRIM_H, TOP, BOTTOM, SIDE, GUTTER] = [215.9, 279.4, 21, 21, 16, 7];
const MEASURE = TRIM_W - 2 * SIDE;
const COLUMN = (MEASURE - GUTTER) / 2;
const [BODY, LEAD] = [9.3, 12.4]; // pt: a letter journal's density, two columns of 88 mm

// #region answer: physics citations [1] and [2–4], from the bundled IEEE style
// [@key] numbers works by first citation. APS journals print [1,2] and [2–4] in one pair of
// brackets and list "A. Einstein, Sitzungsber. K. Preuss. Akad. Wiss. 1, 688 (1916).": no
// title, volume bold. No APS style is bundled: four edits turn the IEEE file into one.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const ARTICLE = '<group delimiter=" "><text variable="container-title"/><text '
  + 'variable="volume" font-weight="bold" suffix=","/><text variable="page"/><date '
  + 'variable="issued" prefix="(" suffix=")"><date-part name="year"/></date></group>';
const BOOK = '<group delimiter=" "><group delimiter=", "><choose><if type="chapter"><text '
  + 'variable="container-title" prefix="in " font-style="italic"/></if><else><text variable='
  + '"title" font-style="italic"/></else></choose><names variable="editor" prefix="edited by ">'
  + '<name and="text" initialize-with=". "/></names><text variable="collection-title"/><text '
  + 'variable="volume" prefix="Vol. "/></group><group prefix="(" suffix=")" delimiter=", ">'
  + '<text variable="publisher"/><text variable="publisher-place"/><date variable="issued">'
  + '<date-part name="year"/></date></group></group><text variable="page" prefix="pp. "/>';
const aps = STYLES.ieee
  .replace('<citation>', '<citation collapse="citation-number">') // [2–4], not [2], [3], [4]
  .replace(/<layout delimiter=", ">\s*<group prefix="\[" suffix="\]" delimiter=", ">/,
    '<layout prefix="[" suffix="]" delimiter=","><group delimiter=", ">') // [1,2]
  .replace('et-al-min="7"', 'et-al-min="11"') // ten authors are listed, as in the letter
  .replace(/<bibliography[\s\S]*<\/bibliography>/, '<bibliography second-field-align="flush">'
    + '<layout suffix="."><text variable="citation-number" prefix="[" suffix="]"/><text '
    + 'macro="author"/><choose><if type="manuscript"><text variable="note" prefix=" "/></if>'
    + `<else><group prefix=", " delimiter=", "><choose><if type="article-journal">${ARTICLE}`
    + `</if><else-if type="book chapter" match="any">${BOOK}</else-if><else><text variable=`
    + '"URL"/><text variable="note"/></else></choose></group></else></choose></layout>'
    + '</bibliography>');
const citations = { style: 'custom', customStyle: aps, link: true,
  bibliography: { fontSize: em(0.84), lineHeight: pt(9.5), entrySpacing: pt(0.4),
    labelWidth: mm(6.2) } }; // the [64] column: turnovers line up after the widest label
// #endregion

// #region title: the title, Figure 1 across the page, then the byline and the abstract
const text = (id, content, family, size, extra) => ({ kind: 'text', id, content, align: 'left',
  fontFamily: family, fontSize: pt(size), color: col('ink'), overflow: 'wrap', ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const caps = (size) => ({ fontWeight: 700, letterSpacing: pt(size * 0.2),
  textTransform: 'uppercase', color: col('accent') });
const letter = { id: 'letter', numbered: false, span: 'page', marginBottom: pt(0),
  advancedDesign: { enabled: true, minHeight: mm(21), slot: { elements: [
    text('kicker', '{attr.kicker}', SANS, 7.5, { ...caps(7.5),
      placement: at('container', 'top-left', 0, 2, MEASURE) }),
    text('title', '{titleText}', SANS, 23, { fontWeight: 700, lineHeight: 1.08,
      placement: at('#kicker', 'below', 0, 2.2, MEASURE) }),
  ] } } };
const box = { padding: { top: mm(2.6), right: mm(12), bottom: mm(2.4), left: mm(12) },
  background: col('tint'), marginTop: pt(0), marginBottom: pt(LEAD), span: 'page',
  body: { fontSize: pt(9.3), lineHeight: pt(12.6), firstLineIndent: pt(0) } };
// ::resource{id="fig1"} right under the title, placed { position: 'here', span: 'page' }:
// it spans both columns on page 1, where a float could only follow its citation.
const paragraphStyles = [
  { id: 'byline', fontFamily: SANS, fontSize: pt(10), lineHeight: pt(12.6), fontWeight: 600,
    textAlign: 'center', firstLineIndent: pt(0) },
  { id: 'dates', fontFamily: SANS, fontSize: pt(7.6), lineHeight: pt(12.6), textAlign: 'center',
    color: col('muted'), firstLineIndent: pt(0) },
  { id: 'colophon', fontFamily: SANS, fontSize: pt(7), lineHeight: pt(9.4), color: col('muted'),
    textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
];
// #endregion

// Running heads 12 mm from the trim; the opener has the source line at its foot.
const head = (id, content, parity, edge, x, extra) => text(id, content, SANS, 7.5, {
  parity, pages: 'body', fontWeight: 500, color: col('muted'), overflow: 'clip',
  placement: at('page', edge, x, 12, 120), ...extra });
const folio = { fontWeight: 700, color: col('accent') };
const right = { align: 'right' };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', SIDE, folio),
  head('v-title', 'B. P. Abbott et al. · Observation of gravitational waves', 'even',
    'top-left', SIDE + 7),
  head('r-title', 'GW150914 · a binary black hole merger', 'odd', 'top-right', -SIDE - 7,
    right),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', -SIDE, { ...folio, ...right }),
] };
const footer = { elements: [
  head('source', 'Re-set from Phys. Rev. Lett. 116, 061102 (2016) · CC BY 3.0 · '
    + 'doi:10.1103/PhysRevLett.116.061102', 'all', 'bottom-left', SIDE,
  { pages: 'opener', placement: at('page', 'bottom-left', SIDE, -12, 160) }),
  head('drop-folio', '{pageNumber}', 'all', 'bottom-right', -SIDE, { ...folio, ...right,
    pages: 'opener', placement: at('page', 'bottom-right', -SIDE, -12, 10) }),
] };

const sans = (size, weight) => ({ fontFamily: SANS, fontSize: pt(size), fontWeight: weight });
const config = () => ({
  locale: 'en-us', colorPalette, citations, header, footer, paragraphStyles,
  // FIG. 1 and TABLE I in the captions, Fig. 1 and Table I in the text: the APS convention
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}',
    resetOn: 'never', ...(type.id === 'figure' ? { captionPrefix: 'FIG.' }
      : { captionPrefix: 'TABLE', counterFormat: 'upper-roman', shortLabel: 'Table',
        captionStyle: { position: 'above' } }) })),
  calloutStyles: [{ id: 'front', ...box }],
  headingStyles: [letter, { id: 'back', numbered: false, ...sans(8, 700),
    textTransform: 'uppercase', color: col('ink') }],
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(SIDE), right: mm(SIDE),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: mm(3.5),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  math: { marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2) },
  // Notes lettered a, b: the numbers in brackets belong to the references.
  footnotes: { numberFormat: 'lower-alpha', fontSize: pt(7.8), lineHeight: pt(10),
    separator: { color: col('rule') } },
  headings: { fontFamily: SANS, color: col('accent'), fontWeight: 700, levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // any page: no forced recto
    { level: 2, numberingTemplate: '{2:I}.', ...sans(11.5, 700), lineHeight: pt(LEAD * 1.5),
      marginTop: pt(LEAD / 2), marginBottom: pt(0) },
    { level: 3, numberingTemplate: '{3:A}.', ...sans(10, 600), color: col('ink'),
      lineHeight: pt(LEAD), marginTop: pt(LEAD / 2), marginBottom: pt(0) },
  ] },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackgroundEnabled: false, bodyFontFamily: SANS, bodyFontSize: pt(8.2),
    bodyColor: col('ink'), cellPadding: mm(0.9) },
  captionStyle: { fontFamily: SANS, fontSize: pt(7.6), lineHeight: pt(10), color: col('ink'),
    labelBold: true, labelColor: col('accent'), gap: mm(2),
    note: { fontSize: pt(6.8), color: col('muted') } },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // title, abstract, sections I–III
const results = /* @content:results */ ''; // sections IV–VI, acknowledgments, colophon
const refs = /* @content:refs */ ''; // BibTeX of the works the kept text cites
const captions = /* @content:captions */ ''; // "fig1" on a line, then its caption
const source = [markdown, results, refs].join('\n\n');
const caption = Object.fromEntries(captions.trim().split(/\n\s*\n/)
  .map((part) => [part.slice(0, part.indexOf('\n')), part.slice(part.indexOf('\n') + 1)]));

// #region table: Table I, its asymmetric errors written as maths in the cells
// A cell sets $…$ in the line, at the table's size: the errors stack over and under the value.
const VALUES = [['Primary black hole mass', '$36^{+5}_{-4}\\,M_\\odot$'],
  ['Secondary black hole mass', '$29^{+4}_{-4}\\,M_\\odot$'],
  ['Final black hole mass', '$62^{+4}_{-4}\\,M_\\odot$'],
  ['Final black hole spin', '$0.67^{+0.05}_{-0.07}$'],
  ['Luminosity distance', '$410^{+160}_{-180}$ Mpc'],
  ['Source redshift $z$', '$0.09^{+0.03}_{-0.04}$']];
const table = { model: { columnWidths: [1.3, 1], rows: VALUES.map(([label, value]) =>
  [{ content: label, verticalAlign: 'middle' }, { content: value }]) } };
// #endregion

// #region art: the four figures, drawn from GWOSC's open data in the page's palette
// GWOSC's Fig. 1, 2 and 4 files (strain in 10^-21, log10 of counts) on a regular grid, each
// sample written as its change from the one before: a base-64 digit, 32 for none.
const SERIES = { // [first value, step, one character per sample]
  hObs: [0.025, 0.03,
    'eghgfegiigddfkmkeaaeijhgfhjhgdcdimplfXWZionhbadkmkfdglnjcZZgjjebdhlkdZZfjmiijmlhcbfjkgdaZa'
    + 'dgkkigefhijiihifedefhhhggfhihhfefghhiijifeddddgkjhddgjifbdfjkhdcdhiihgefghjjhedeghihhjkjhf'
    + 'fgihgfegfeeeggeedghhcabgijjiijjihgeeghggffhihhimnjecdgigecddfecacdfgghiggfgikkjhijkljihihg'
    + 'ffghgeccbehhfbWWbinmhbcglmjgeehloomgefkpohXUVaeecaZbfiiijjmmjijnppkfaZaYXWXZfjnqrtsojaSNOV'
    + 'hszynaQRalqpibbchiijjjgdbdhkkgdcdfijifecdehjkmjfdegheccfjmkigfffeghih'],
  lObs: [-0.119, 0.03,
    'deghhhfgklifdegjihddgjjgdcdhjjgdcehlmjgdeikkhbaafhggfghhhgefgiigedeghiijiiijhedceiiigeeffg'
    + 'hiihggeddgihgeddfhihikjgdbbfkomhdbdfgjlljhecdghgeeghiigeddffeeehiifdcfhfffhjmmkifffddehjkg'
    + 'dcfijjhhihgghiigdceggdcbcfigfdeijjiffhihedgmpoicXYeknnjhgikieZYadfhhhfedefffdfgjjihhfhhjln'
    + 'mjfddghggfeeegffaYYchjihgihiiiiilmnlifdefdcbbbccbbdhjknnnmllljfZVSWbfgjnuxtjVMOZmuuofZXafg'
    + 'ggggefefhkmlhebcfhigddfjmnjfddfiigfefihgffhigfedefghhgffgghhfefghgghi'],
  hNR: [0.0, 0.03,
    'ggghgggfgfgggggghggfgfggfggggggggghghhghggggggghghghggfgffggfgggfggggghghgggfggggghghgggff'
    + 'gfgfgfggfggggghghghgggggghhhhhgggggggfgggggfggggggggfgffffgggggggfgfgfggggghghghhhihihhhgg'
    + 'gghghggggfffeefefeffefffggghhghhghhhhiiiiihighggggfgffffefefffeffeefefgggihhiihihiiiiiiiih'
    + 'hghggfgeeddccdcddeeffffghhijjkklklkkkjjihffdcaaaaabbddffhiklmnonnljhebZXVVWZcgmrvxwriYPLPX'
    + 'lvyvkaSSYgopmhcacfikkifedffhiihhfgfggfgffgfgfgggfhgghhhggfggggghhhhhg'],
  lNR: [0.031, 0.03,
    'gfgghgghggggggggggfgfgfgfggghggfggfgggghghghggghgggggggfgfggghggggggfgggghghghgghgggggggfg'
    + 'fgfggggggfgffgfgggghggghgggghggggggghghghhghgfggggghggghfggfgfgffffffffgfgghggggfhgghihhih'
    + 'highhhghgggffffgfffgffefeeffgfghghghhghihhihhhhghhhhhhgggeffeefeffeffeefffgggghhhhiiijjjjj'
    + 'ihhhhgfgffeeddccdcddeeefggiikkllllkkjhhgfedcbbaabcdfhjlnnponkheaWUTUZgnuxuncURTclssngaYafj'
    + 'lkhedcfgiiigffefgghhgghghghgggghgggfgffggggghgfgffgfggghhgghgggggghgf'],
  hFull: [0.436, 0.03,
    'fgffffeffefefefeffefffffgfgfggghghhghhihhihihihiihhihhhhhhghggggfgfffffeffeefeefeefeffffff'
    + 'ggfhgghghhihhihiiihiiihihihhhhghgggfgffffefeeeeeefeeeeffefgfgfghghhhhihiiiiiiiiiiiihhhhhgg'
    + 'ggfffefeeeeedeedeeefeffgfgghhhhihijijijijiiiiihhghgffffeeededdddedeeeeffgghhhiijijkjjjjjji'
    + 'iihggffeeedcdcccdcdeeefghhijjklklklkjjiigfeddbbaababcdegijkmnooonlkhebZWVUVYbgmrwxwqiXOKNX'
    + 'lw1wlZRSZhppnhcabeijkhgeeeghihgfgfggghgggfggghgggfgggghggfgggggghfggg'],
  sep: [4.705, 0.01,
    'ffeffeffefffeffefefefefefefefeefeeefeeeeeeeeeedeeedededdedddddcddccccccbbbaaaZZYXWVUSQNL'],
  vel: [0.326, 0.001,
    'ghghghghgghghghghhghghghghhghhghhghhhghhhhhhhhhhhhhhhhihhihihiiihjiiijjjjjkkklmmnppsuy28'],
  pyBg: [0.453, 0.1,
    'lihdcccbcbccccdeeefeeeheggdihhdiiggfWkcijOweVU3hRXggggg-icStiPU-iVUXggggggggggggg'],
  pyBgEx: [0.453, 0.1,
    'lihdcccbcbccccddedfdffcZfdZXpgXgggggggggggggggggggggggggggggggggggggggggggggggggg'],
  cwbBg3: [1.247, 0.1,
    'ededdeddddeddddddddddeecgZOyOygOgggggggggggggggggggggggggggggggggggggggggggggggggggggg'],
};
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const decode = (key) => { const [first, step, s] = SERIES[key]; const out = [first];
  for (const c of s) out.push(out.at(-1) + step * (B64.indexOf(c) - 32));
  return out; };
const PX_PER_MM = 10; // drawn in mm, declared at 10 px to the mm
const R = (x) => Math.round(x * 100) / 100;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${R(w * PX_PER_MM)}" `
  + `height="${R(h * PX_PER_MM)}" viewBox="0 0 ${R(w)} ${R(h)}">${body}</svg>`;
const line = (x1, y1, x2, y2, color, width, extra = '') => `<path d="M${R(x1)} ${R(y1)}L${R(x2)} `
  + `${R(y2)}" stroke="${color}" stroke-width="${width}" fill="none" ${extra}/>`;
const poly = (pts, color, width, extra = '') => `<path d="${pts.map(([x, y], i) =>
  `${i ? 'L' : 'M'}${R(x)} ${R(y)}`).join('')}" fill="none" `
  + `stroke="${color}" stroke-width="${width}" stroke-linejoin="round" ${extra}/>`;
// Labels are MathJax paths, \textsf for words: the axes carry formulas, set like the
// maths of the text, and paths stay vector in the PDF.
function tex(markup, x, y, size, anchor = 0, color = palette.ink, rotate = false) {
  const r = renderMath(markup, false, 100);
  const k = size / 1000;
  const dx = -anchor * r.viewBox.width * k;
  return `<g transform="translate(${R(x)} ${R(y)})${rotate ? ' rotate(-90)' : ''} `
    + `translate(${R(dx)} 0) scale(${k})" fill="${color}">`
    + `${r.paths.map((p) => `<path d="${p.d}"/>`).join('')}</g>`;
}
const sf = (s) => `\\textsf{${s}}`;
function panel(x, y, w, h, [t0, t1], [v0, v1], series) {
  const X = (t) => x + ((t - t0) / (t1 - t0)) * w;
  const Y = (v) => y + h - ((Math.max(v0, Math.min(v1, v)) - v0) / (v1 - v0)) * h;
  let out = `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" fill="none" `
    + `stroke="${palette.rule}" stroke-width="0.2"/>`;
  if (v0 < 0) out += line(x, Y(0), x + w, Y(0), palette.rule, 0.15);
  for (const [values, start, step, color, width] of series) {
    const pts = values.map((v, i) => [start + i * step, v]).filter(([t]) => t >= t0 && t <= t1);
    out += poly(pts.map(([t, v]) => [X(t), Y(v)]), color, width);
  }
  return { out, X, Y };
}
const residual = (d) => { // the published residual is the data less the waveform
  const nr = decode(`${d}NR`);
  return decode(`${d}Obs`).map((v, i) => v - nr[i]);
};
const DT = 8 / 16384; // s: every eighth sample of the 16 384 Hz files

function figure1(W) { // the hero: three rows, Hanford left, Livingston right
  const [LM, GAP, TOPR, RH, RG] = [12, 5, 6, 14, 2];
  const PW = (W - LM - GAP - 1) / 2;
  const H = TOPR + 3 * RH + 2 * RG + 8.4;
  const T = [0.25, 0.46];
  const V = [-1.35, 1.35];
  const hObs = decode('hObs');
  const flipped = hObs.map((v) => -v); // H1 inverted, and moved 6.9 ms earlier below
  const rowsOf = [[[[hObs, 0.25, DT, data.hanford, 0.32]],
    [[decode('lObs'), 0.25, DT, data.livingston, 0.32], [flipped, 0.25 - 0.0069, DT,
      data.hanford, 0.22]]],
  [[[decode('hNR'), 0.25, DT, data.hanford, 0.38]], [[decode('lNR'), 0.25, DT,
    data.livingston, 0.38]]],
  [[[residual('h'), 0.25, DT, palette.muted, 0.28]], [[residual('l'), 0.25, DT,
    palette.muted, 0.28]]]];
  const labels = [['H1 observed', 'L1 observed'], ['Numerical relativity',
    'Numerical relativity'], ['Residual', 'Residual']];
  let out = tex(sf('Hanford, Washington (H1)'), LM, 3.8, 3.1, 0, data.hanford)
    + tex(sf('Livingston, Louisiana (L1)'), LM + PW + GAP, 3.8, 3.1, 0, data.livingston)
    + tex(sf('with H1 shifted and inverted'), W - 1, 3.8, 2.5, 1, data.hanford);
  rowsOf.forEach((row, r) => row.forEach((series, c) => {
    const x = LM + c * (PW + GAP);
    const y = TOPR + r * (RH + RG);
    const p = panel(x, y, PW, RH, T, V, series);
    out += p.out + tex(sf(labels[r][c]), x + 1.6, y + 3.2, 2.5, 0, palette.muted);
    if (c === 0) {
      for (const v of [-1, 0, 1]) out += tex(v.toFixed(1), x - 1.2,
        p.Y(v) + 0.9, 2.4, 1, palette.muted);
    }
    if (r === 2) {
      for (const t of [0.3, 0.35, 0.4, 0.45]) {
        out += line(p.X(t), y + RH, p.X(t), y + RH + 0.9, palette.muted, 0.2)
          + tex(t.toFixed(2), p.X(t), y + RH + 4, 2.4, 0.5, palette.muted);
      }
      out += tex(sf('Time (s)'), x + PW / 2, y + RH + 7.8, 2.6, 0.5, palette.muted);
    }
  }));
  out += tex(`${sf('Strain (')}10^{-21}${sf(')')}`, 3.2, TOPR + (3 * RH + 2 * RG) / 2, 2.7, 0.5,
    palette.muted, true);
  return svg(W, H, out);
}

function figure2(W) { // one column: the full-band strain, then separation and velocity
  const [LM, RM, PH] = [10, 10, 20];
  const PW = W - LM - RM;
  const H = 6 + PH + 4 + PH + 11;
  const T = [0.25, 0.46];
  const top = panel(LM, 6, PW, PH, T, [-1.4, 1.4],
    [[decode('hFull'), 0.25, DT, data.hanford, 0.32]]);
  const y2 = 6 + PH + 4;
  const sep = panel(LM, y2, PW, PH, T, [0, 5],
    [[decode('sep'), 0.25, 32 / 16384, palette.ink, 0.38]]);
  const vel = panel(LM, y2, PW, PH, T, [0.3, 0.6],
    [[decode('vel'), 0.25, 32 / 16384, data.livingston, 0.38]]);
  let out = top.out + sep.out + vel.out
    + tex(`${sf('Strain (')}10^{-21}${sf(')')}`, 3, 6 + PH / 2, 2.5, 0.5, palette.muted, true)
    + tex(`${sf('Separation (')}R_S${sf(')')}`, 3, y2 + PH / 2, 2.5, 0.5, palette.ink, true)
    + tex(`${sf('Velocity (')}c${sf(')')}`, W - 1.2, y2 + PH / 2, 2.5, 0.5, data.livingston,
      true)
    + tex('v/c = (GM\\pi f/c^3)^{1/3}', LM + 2, vel.Y(0.36), 2.6, 0, data.livingston)
    + tex(sf('Separation'), LM + 2, sep.Y(3.9), 2.5, 0, palette.ink);
  const tick = (v, y) => tex(String(v), LM - 1.2, y + 0.9, 2.3, 1, palette.muted);
  for (const v of [-1, 0, 1]) out += tick(v, top.Y(v));
  for (const v of [1, 2, 3, 4]) out += tick(v, sep.Y(v));
  for (const v of [0.3, 0.4, 0.5]) {
    out += tex(v.toFixed(1), LM + PW + 1.2, vel.Y(v) + 0.9, 2.3, 0, data.livingston);
  }
  for (const t of [0.3, 0.35, 0.4, 0.45]) {
    out += tex(t.toFixed(2), top.X(t), y2 + PH + 4, 2.3, 0.5, palette.muted);
  }
  return svg(W, H, out + tex(sf('Time (s)'), LM + PW / 2, H - 1.4, 2.5, 0.5, palette.muted));
}

function figure3(W) { // the interferometer, after the published diagram (not to scale)
  const [H, bx, by, iy, sy] = [57, 28, 40, 27, 46]; // height; beam splitter; mirror heights
  const beam = (x1, y1, x2, y2, w = 0.9) => line(x1, y1, x2, y2, data.hanford, w,
    'stroke-opacity="0.55"');
  const mirror = (x, y, vertical, color = palette.ink) => (vertical
    ? `<rect x="${x - 0.7}" y="${y - 3}" width="1.4" height="6" fill="${color}"/>`
    : `<rect x="${x - 3}" y="${y - 0.7}" width="6" height="1.4" fill="${color}"/>`);
  const label = (s, x, y, anchor = 0) => tex(sf(s), x, y, 2.4, anchor, palette.ink);
  const small = (s, x, y, anchor = 0) => tex(sf(s), x, y, 2.2, anchor, palette.muted);
  const mid = (40 + W - 6) / 2; // the middle of the inline arm
  return svg(W, H, beam(9, by, bx, by) + beam(bx, by, W - 6, by, 1.6) + beam(bx, by, bx, 4, 1.6)
    + beam(bx, by, bx, 51, 0.6)
    + `<rect x="1" y="${by - 3}" width="8" height="6" rx="0.6" fill="${palette.ink}"/>`
    + mirror(17, by, true) + mirror(40, by, true, palette.accent)
    + mirror(W - 6, by, true, palette.accent) + mirror(bx, iy, false, palette.accent)
    + mirror(bx, 4, false, palette.accent) + mirror(bx, sy, false)
    + line(bx - 3, by + 3, bx + 3, by - 3, palette.ink, 0.8)
    + `<rect x="${bx - 2.2}" y="51" width="4.4" height="3.4" fill="${palette.muted}"/>`
    + label('Laser source', 1, by + 6.4) + small('20 W', 5, by - 4.2, 0.5)
    + label('Power recycling', 17, by - 7.4, 0.5) + small('700 W', 22.5, by - 1.4, 0.5)
    + label('Beam splitter', bx + 2.4, by + 4.4) + label('Signal recycling', bx + 4, sy + 1.2)
    + label('Photodetector', bx + 4, 54) + label('Input test mass', 41.6, by - 4.2)
    + label('End test mass', W - 7.6, by - 4.2, 1) + label('Input test mass', bx + 4, iy + 1.2)
    + label('End test mass', bx + 4, 5.2) + small('4 km', mid, by + 4.4, 0.5)
    + small('4 km', bx - 2, (4 + iy) / 2 + 1, 1) + small('100 kW', mid, by - 1.4, 0.5)
    + line(40, by + 2, W - 6, by + 2, palette.muted, 0.15)
    + line(bx - 1.2, 4, bx - 1.2, iy, palette.muted, 0.15));
}

function figure4(W) { // two histograms on a log scale, from GWOSC's Fig. 4 data
  const [LM, GAP, PH] = [12, 9, 44];
  const PW = (W - LM - GAP - 2) / 2;
  const H = 4 + PH + 9.4;
  const X = [7, 24.5];
  const LV = [-7, 2.6]; // 10^-7 to 400 events
  const stairs = (logs, first, p) => { // one step per 0.2-wide bin, broken where it is empty
    const pts = [];
    logs.forEach((v, i) => {
      if (v <= LV[0]) { if (pts.length && pts[pts.length - 1]) pts.push(null); return; }
      const [a, b] = [first + 0.2 * i, first + 0.2 * (i + 1)];
      pts.push([p.X(a), p.Y(v)], [p.X(b), p.Y(v)]);
    });
    return pts.reduce((acc, q) => {
      if (q) acc[acc.length - 1].push(q); else acc.push([]);
      return acc;
    }, [[]]).filter((run) => run.length);
  };
  const marks = (list, p, color) => list.map(([x, n]) => `<circle cx="${R(p.X(x + 0.1))}" `
    + `cy="${R(p.Y(Math.log10(n)))}" r="0.75" fill="${color}"/>`).join('');
  const sides = [
    { x: LM, label: '\\eta_c', lines: [['cwbBg3', 7.0724, palette.ink]],
      dots: [[C3, data.hanford]] },
    { x: LM + PW + GAP, label: '\\hat\\rho_c', lines: [['pyBg', 7.2159, palette.ink],
      ['pyBgEx', 7.2159, data.purple]], dots: [[PYCBC, data.hanford]] },
  ];
  let out = '';
  for (const side of sides) {
    const p = panel(side.x, 4, PW, PH, X, LV, []);
    out += p.out;
    for (const [key, first, color] of side.lines) {
      for (const run of stairs(decode(key), first, p)) out += poly(run, color, 0.35);
    }
    for (const [list, color] of side.dots) out += marks(list, p, color);
    for (const e of [-6, -4, -2, 0, 2]) {
      out += line(side.x, p.Y(e), side.x + 0.9, p.Y(e), palette.muted, 0.2)
        + tex(`10^{${e}}`, side.x - 1.2, p.Y(e) + 0.9, 2.3, 1, palette.muted);
    }
    for (const x of [8, 12, 16, 20, 24]) {
      out += line(p.X(x), 4 + PH, p.X(x), 4 + PH - 0.9, palette.muted, 0.2)
        + tex(String(x), p.X(x), 4 + PH + 3.8, 2.3, 0.5, palette.muted);
    }
    out += tex(`${sf('Detection statistic')}\\ ${side.label}`, side.x + PW / 2, H - 0.8, 2.6,
      0.5, palette.muted)
      + tex(sf('GW150914'), p.X(side.dots[0][0].at(-1)[0] + 0.1) - 1.4, p.Y(0) - 2.2, 2.4, 1,
        data.hanford);
  }
  return svg(W, H, out + tex(sf('Number of events'), 3, 4 + PH / 2, 2.6, 0.5, palette.muted,
    true));
}
// Candidate events [statistic, count]: the nonzero bins of the same files.
const C3 = [[7.07, 11], [7.27, 8], [7.47, 7], [7.67, 3], [7.87, 3], [8.07, 1], [19.97, 1]];
const PYCBC = [[7.22, 4], [7.42, 14], [7.62, 12], [7.82, 16], [8.02, 7], [8.22, 3], [8.42, 1],
  [8.82, 1], [9.42, 1], [23.42, 1]]; // left edges of the 0.2-wide bins, as in the files
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages paint
  Gelasio: ['400', '400i', '700', '700i'],
  'Albert Sans': ['400', '400i', '500', '600', '600i', '700', '700i'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await initMathEngine(); // gotcha: math-bundle. Unawaited, every formula is a grey box
const figures = { // width, drawing, placement, alt text
  fig1: [MEASURE, figure1, { position: 'here', span: 'page' }, 'One chirp in both detectors.'],
  fig2: [COLUMN, figure2, { position: 'top' }, 'Strain; separation falls, speed rises.'],
  fig3: [COLUMN, figure3, { position: 'auto' }, 'A Michelson interferometer with arm cavities.'],
  fig4: [MEASURE, figure4, { position: 'top', span: 'page' }, 'GW150914 far beyond the noise.'] };
const resources = [];
for (const [id, [width, draw, placement, altText]] of Object.entries(figures)) {
  const markup = draw(width);
  const height = Number(/height="([\d.]+)"/.exec(markup)[1]) / PX_PER_MM;
  await loadSvg(`${id}.svg`, markup);
  resources.push({ id, typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, placement,
    svg: { fileId: `${id}.svg`, width: width * PX_PER_MM, height: height * PX_PER_MM },
    caption: caption[id], note: caption[`${id}.note`], altText });
}
resources.push({ id: 'tab1', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  placement: { position: 'auto' }, caption: caption.tab1, note: caption['tab1.note'], table });
const doc = await buildDocumentWithFonts({ markdown: source, resources }, config(),
  kitFonts(FONTS));
showPages(doc, { title: 'A physics letter with its figure across both columns' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // formulas and figures stay vector paths

// @kit
