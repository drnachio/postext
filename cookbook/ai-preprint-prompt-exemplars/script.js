// ═══ Postext Cookbook · Nº 137 · An AI preprint with prompt exemplars in boxes ═══════
// https://postext.dev/en/cookbook/ai-preprint-prompt-exemplars
// Code: MIT · Text: Wei et al. 2022, arXiv:2201.11903 (CC BY 4.0) · Charts: drawn in code
// Fonts: Newsreader, IBM Plex Sans, IBM Plex Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerCitationEngine, registerResourceImage,
  inlineSvgFonts,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'ai-preprint-prompt-exemplars';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a cool ink, a prompt blue, an answer green and a red for the wrong answer
const palette = { ink: '#1b1e24', accent: '#1f5fa6', green: '#21744a', red: '#b3362d',
  tint: '#e9f0f8', mint: '#e6f2eb', rule: '#b4bcc8', muted: '#5b6270', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SERIF, SANS, MONO] = ['Newsreader', 'IBM Plex Sans', 'IBM Plex Mono'];
// US letter, two columns of 85.5 mm as ML venues print.
const [TRIM_W, TRIM_H, TOP, BOTTOM, SIDE, GUTTER] = [215.9, 279.4, 22, 22, 19, 7];
const MEASURE = TRIM_W - 2 * SIDE;
const COLUMN = (MEASURE - GUTTER) / 2;
const LEAD = 12.8; // pt
const ZERO = pt(0);

// #region answer: Figure 1 as boxes: two columns, a tab on each box, a ✓ or ✗ in the corner
// :::columns{count=2 breaks="4"} inside the "figure" box opens the right column at its fourth
// block; each nested box counts as one block (gotcha: callout-columns).
const tab = (fill) => ({ fontFamily: SANS, fontSize: pt(7), fontWeight: 600,
  color: col('paper'), background: col(fill), position: 'top-left', inset: mm(3),
  height: mm(4.2), offset: mm(2.1), paddingX: mm(2.2) }); // straddles the top edge
const exemplar = (id, fill, ink, extra) => ({ id, background: col(fill),
  border: { enabled: true, color: col('rule'), width: pt(0.6) }, borderRadius: mm(2.4),
  padding: { top: mm(4.4), right: mm(3), bottom: mm(2.6), left: mm(3) },
  marginTop: mm(4.2), marginBottom: ZERO, label: tab(ink),
  body: { fontFamily: MONO, fontSize: pt(7.8), lineHeight: pt(10.4), color: col('ink'),
    boldColor: col(ink), // **…** marks the chain of thought: the highlight of the original
    textAlign: 'left', hyphenation: false, paragraphSpacing: true, firstLineIndent: ZERO },
  ...extra });
const mark = (id) => ({ icon: { kind: 'resource', resourceId: id, size: mm(5.6),
  position: 'corner', cornerSide: 'right' } }); // a badge on the top-right corner
const promptBoxes = [
  { id: 'figure', span: 'page', backgroundEnabled: false, border: { enabled: false },
    padding: mm(0), columnGap: mm(6), marginTop: ZERO, marginBottom: pt(LEAD),
    body: { fontFamily: SANS, fontSize: pt(8.4), lineHeight: pt(11.4), color: col('ink'),
      boldColor: col('accent'), textAlign: 'left', paragraphSpacing: true,
      firstLineIndent: ZERO } },
  exemplar('input', 'tint', 'accent'),
  exemplar('right', 'mint', 'green', mark('mark-right')),
  exemplar('wrong', 'mint', 'green', mark('mark-wrong')),
];
// #endregion

// #region citations: author–year as in a natbib preprint, "(Brown et al., 2020)"
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
// Chicago author-date writes (Brown et al. 2020); ML venues put a comma before the year.
const AUTHOR_YEAR = '<group delimiter=" ">\n            <text macro="author-inline"/>';
const natbib = STYLES['chicago-author-date']
  .replace(AUTHOR_YEAR, AUTHOR_YEAR.replace('" "', '", "'));
const citations = { style: 'custom', customStyle: natbib, link: true,
  bibliography: { fontSize: em(0.8), lineHeight: pt(10.2), entrySpacing: pt(1.8),
    hangingIndent: mm(4), doi: 'text' } };
// #endregion

// #region title: venue line, title, authors and affiliation, then a source note
const text = (id, content, family, size, extra) => ({ kind: 'text', id, content, align: 'left',
  fontFamily: family, fontSize: pt(size), color: col('ink'), overflow: 'wrap', ...extra });
const at = (to, edge, y, width = MEASURE) => ({ anchor: { to, edge },
  offset: { x: ZERO, y: mm(y) }, size: { width: mm(width), height: 'auto' } });
const titleBlock = { enabled: true, minHeight: mm(58), slot: { elements: [
  text('venue', '{attr.venue}', MONO, 7.5, { fontWeight: 500, letterSpacing: pt(0.6),
    color: col('accent'), placement: at('container', 'top-left', 0) }),
  text('title', '{titleText}', SERIF, 23, { fontWeight: 600, lineHeight: 1.1,
    placement: at('#venue', 'below', 5) }),
  text('authors', '{attr.authors}', SANS, 9.6, { fontWeight: 500, lineHeight: 1.45,
    placement: at('#title', 'below', 6) }),
  text('affiliation', '{attr.affiliation}', SANS, 8.6, { color: col('muted'),
    placement: at('#authors', 'below', 1.2) }),
  { kind: 'rule', id: 'rule', thickness: pt(0.5), color: col('rule'),
    placement: at('#affiliation', 'below', 4) },
  text('note', '{attr.note}', SERIF, 8.2, { fontStyle: 'italic', lineHeight: 1.35,
    color: col('muted'), placement: at('#rule', 'below', 2) }),
] } };
// #endregion

// #region figures: the redrawn charts keep the paper's numbers, so the types carry them
// Figure 1 is boxes, which the figure counter does not see: number the charts by type.
const numbered = (id, word, n, extra) => ({ id, name: `${word} ${n}`,
  shortLabel: `${word} ${n}`, captionPrefix: `${word} ${n}`, numberingTemplate: '',
  resetOn: 'never', counterFormat: 'decimal', ...extra });
const resourceTypes = [numbered('mark', 'Mark', ''), numbered('fig2', 'Figure', 2),
  numbered('fig4', 'Figure', 4),
  numbered('tab2', 'Table', 2, { captionStyle: { position: 'above' } })];
const ACROSS = { position: 'top', span: 'page' }; // a float over both columns
const svg = (id, typeId, file, [width, height], caption, note, altText, placement) => ({
  id, typeId, kind: 'svg', createdAt: 0, updatedAt: 0,
  placement: placement ?? { position: 'top' }, svg: { fileId: file, width, height },
  caption, note, altText });
// #endregion

const head = (id, content, parity, edge, x, extra) => text(id, content, SANS, 7.6, {
  parity, pages: 'body', letterSpacing: pt(0.3), color: col('muted'), overflow: 'clip',
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(14) },
    size: { width: mm(110) } }, ...extra });
const folio = { fontWeight: 600, color: col('accent') };
const right = { align: 'right' };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', SIDE, folio),
  head('v-title', 'Wei et al. · Chain-of-Thought Prompting', 'even', 'top-left', SIDE + 8),
  head('r-title', 'Abridged from arXiv:2201.11903 · CC BY 4.0', 'odd', 'top-right',
    -SIDE - 8, right),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', -SIDE, { ...folio, ...right }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0, {
  ...folio, align: 'center', pages: 'opener', placement: { anchor: { to: 'page',
    edge: 'bottom' }, offset: { x: ZERO, y: mm(-14) }, size: { width: mm(20) } } })] };

const sans = (size) => ({ fontFamily: SANS, fontSize: pt(size), fontWeight: 600 });
const config = () => ({
  locale: 'en-us', colorPalette, citations, resourceTypes, header, footer,
  crossRefs: { section: 'Section {n}' }, // \cref prints "Section 3"
  calloutStyles: [...promptBoxes,
    { id: 'abstract', span: 'page', background: col('tint'), marginTop: ZERO,
      padding: { top: mm(2.8), right: mm(14), bottom: mm(3), left: mm(14) },
      marginBottom: pt(LEAD / 2),
    titleStyle: { ...sans(7.6), color: col('accent'), textTransform: 'uppercase',
      letterSpacing: pt(1.2), gap: mm(1.4) },
    body: { fontFamily: SERIF, fontSize: pt(9.3), lineHeight: pt(12.4), textAlign: 'justify',
      firstLineIndent: mm(4), italicColor: col('ink') } }],
  headingStyles: [
    { id: 'paper', numbered: false, span: 'page', advancedDesign: titleBlock },
    { id: 'back', numbered: false },
  ],
  paragraphStyles: [{ id: 'colophon', fontFamily: SANS, fontSize: pt(7.2), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: ZERO, marginTop: pt(LEAD) }],
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(SIDE), right: mm(SIDE),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { fontFamily: SERIF, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: mm(3.5), maxJustifyTracking: 10,
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: SANS, color: col('ink'), fontWeight: 600, levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // gotcha: headings-drop-h1-break
    { level: 2, ...sans(11), numberingTemplate: '{2}', numberSeparator: ' ',
      lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) },
    { level: 3, ...sans(9.6), numberingTemplate: '{2}.{3}', numberSeparator: ' ',
      lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: ZERO },
  ] },
  orderedLists: { numberFormat: 'arabic', fontFamily: SANS, fontWeight: 600,
    color: col('accent'), marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2) },
  unorderedLists: { bulletChar: '–', color: col('accent'), marginTop: pt(LEAD / 2),
    marginBottom: pt(LEAD / 2) },
  footnotes: { fontFamily: SERIF, fontSize: pt(8.4), lineHeight: pt(11), color: col('ink') },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('accent'), headerColor: col('paper'), headerBold: true,
    headerFontFamily: SANS, headerFontSize: pt(7.4), bodyFontFamily: SANS,
    bodyFontSize: pt(7.4), bodyColor: col('ink'), cellPadding: mm(1.1) },
  captionStyle: { fontFamily: SANS, fontSize: pt(8.4), color: col('ink'), labelBold: true,
    labelColor: col('accent'), gap: mm(2.4), note: { fontSize: pt(7), color: col('muted') } },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // title, abstract, Figure 1, sections 1–3
const later = /* @content:later */ ''; // sections 4–7, notes, references, colophon
const refs = /* @content:refs */ ''; // the paper's own references, as BibTeX

// #region table: Table 2 of the paper, standard against chain of thought on five benchmarks
const SETS = ['GSM8K', 'SVAMP', 'ASDiv', 'AQuA', 'MAWPS'];
const RESULTS = [ // model, size, then standard / CoT pairs per benchmark; * CoT beats standard
  ['UL2', '20B', '4.1 4.4* 10.1 12.5* 16.0 16.9* 20.5 23.6* 16.6 19.1*'],
  ['LaMDA', '420M', '2.6 0.4 2.5 1.6 3.2 0.8 23.5 8.3 3.2 0.9'],
  ['', '2B', '3.6 1.9 3.3 2.4 4.1 3.8 22.9 17.7 3.9 3.1'],
  ['', '8B', '3.2 1.6 4.3 3.4 5.9 5.0 22.8 18.6 5.3 4.8'],
  ['', '68B', '5.7 8.2* 13.6 18.8* 21.8 23.1* 22.3 20.2 21.6 30.6*'],
  ['', '137B', '6.5 14.3* 29.5 37.5* 40.1 46.6* 25.5 20.6 43.2 57.9*'],
  ['GPT', '350M', '2.2 0.5 1.4 0.8 2.1 0.8 18.1 8.7 2.4 1.1'],
  ['', '1.3B', '2.4 0.5 1.5 1.7 2.6 1.4 12.6 4.3 3.1 1.7'],
  ['', '6.7B', '4.0 2.4 6.1 3.1 8.6 3.6 15.4 13.4 8.8 3.5'],
  ['', '175B', '15.6 46.9* 65.7 68.9* 70.3 71.3* 24.8 35.8* 72.7 87.1*'],
  ['Codex', '–', '19.7 63.1* 69.9 76.4* 74.0 80.4* 29.5 45.3* 78.7 92.6*'],
  ['PaLM', '8B', '4.9 4.1 15.1 16.8* 23.7 25.2* 19.3 21.7* 26.2 30.5*'],
  ['', '62B', '9.6 29.9* 48.2 46.7 58.7 61.9* 25.6 22.4 61.8 80.3*'],
  ['', '540B', '17.9 56.9* 69.4 79.0* 72.1 73.9* 25.2 35.8* 79.2 93.3*'],
];
const cell = (content, extra) => ({ content, align: 'right', ...extra });
const tableRows = () => [
  [cell('Model', { isHeader: true, align: 'left', colSpan: 2 }), { content: '',
    hiddenBy: { row: 0, col: 0 } }, // gotcha: merged-cells-hiddenby
  ...SETS.flatMap((set, i) => [cell(set, { isHeader: true, align: 'center', colSpan: 2 }),
    { content: '', hiddenBy: { row: 0, col: 2 + 2 * i } }])],
  [cell('', { isHeader: true }), cell('', { isHeader: true }),
    ...SETS.flatMap(() => [cell('standard', { isHeader: true }), cell('CoT', { isHeader: true })])],
  ...RESULTS.map(([model, size, values]) => [cell(model ? `**${model}**` : '', { align: 'left' }),
    cell(size, { align: 'left' }),
    ...values.split(' ').map((v) => cell(v.endsWith('*') ? `**${v.slice(0, -1)}**` : v))]),
];
// #endregion

const resources = () => [
  svg('fig-gsm8k', 'fig2', 'gsm8k.svg', [860, 380],
    'PaLM 540B uses chain-of-thought prompting to achieve new state-of-the-art performance '
      + 'on the GSM8K benchmark of math word problems. Finetuned GPT-3 and prior best are '
      + 'from @cobbe2021training.',
    'Redrawn from the values in the paper’s Figure 2.',
    'Bars of GSM8K solve rate: finetuned GPT-3 175B 33, prior best 55, PaLM 540B with '
      + 'standard prompting 18 and with chain-of-thought prompting 57.'),
  svg('fig-scale', 'fig4', 'scale.svg', [1780, 900],
    'Chain-of-thought prompting enables large language models to solve challenging math '
      + 'problems. Notably, chain-of-thought reasoning is an emergent ability of increasing '
      + 'model scale. Prior best numbers are from @cobbe2021training for GSM8K, '
      + '@jie2022learning for SVAMP, and @lan2021mwptoolkit for MAWPS.',
    'Redrawn from the solve rates in the paper’s Table 2; the prior-best lines are those '
      + 'of its Figure 4.',
    'Nine small charts of solve rate against model size. For LaMDA, GPT and PaLM on GSM8K, '
      + 'SVAMP and MAWPS, chain-of-thought prompting stays at or below standard prompting '
      + 'for small models and rises above it at about 100B parameters.', ACROSS),
  { id: 'tab-math', typeId: 'tab2', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: ACROSS,
    caption: 'Standard prompting versus chain of thought prompting on five arithmetic '
      + 'reasoning benchmarks. Note that chain of thought prompting is an emergent ability of '
      + 'model scale—it does not positively impact performance until used with a model of '
      + 'sufficient scale.',
    note: 'Solve rates (%). Bold: chain of thought above standard prompting.',
    table: { model: { headerRowCount: 2, rows: tableRows(),
      columnWidths: [1.3, 1, ...SETS.flatMap(() => [1, 1])] } } },
  ...['right', 'wrong'].map((id) => ({ id: `mark-${id}`, typeId: 'mark', kind: 'svg',
    createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: 64, height: 64 } })),
];

// #region art: the two charts and the two marks, labels in IBM Plex Sans
const n2 = (v) => +v.toFixed(2);
const label = (x, y, s, { size = 2.5, anchor = 'start', fill = palette.muted, w = 400 } = {}) =>
  `<text x="${n2(x)}" y="${n2(y)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" `
  + `font-family="${SANS}" font-weight="${w}">${s}</text>`;
const frame = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" `
  + `width="${w * 10}" height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const dashes = (x0, x1, y, on = 1.4, off = 1) => {
  let d = '';
  for (let x = x0; x < x1; x += on + off) d += `M${n2(x)} ${n2(y)}H${n2(Math.min(x + on, x1))}`;
  return d;
};

function barChart() { // Figure 2: 86 × 36 mm, a column wide
  const bars = [['Finetuned GPT-3 175B', 33, palette.rule], ['Prior best', 55, palette.muted],
    ['PaLM 540B: standard prompting', 18, palette.rule],
    ['PaLM 540B: chain-of-thought prompting', 57, palette.accent]];
  const [W, L, R, T, H] = [86, 50, 7, 2, 5.4];
  const x = (v) => L + (v / 100) * (W - L - R);
  let out = '';
  for (const v of [0, 20, 40, 60, 80, 100]) {
    out += `<path d="M${n2(x(v))} ${T - 1}V${T + 4 * (H + 1.6)}" stroke="${palette.rule}" `
      + 'stroke-width="0.15"/>' + label(x(v), T + 4 * (H + 1.6) + 3.2, v,
      { anchor: 'middle', size: 2.4 });
  }
  bars.forEach(([name, v, fill], i) => {
    const y = T + i * (H + 1.6);
    out += label(L - 2, y + H * 0.66, name, { anchor: 'end', fill: palette.ink, size: 2.3 })
      + `<rect x="${L}" y="${n2(y)}" width="${n2(x(v) - L)}" height="${H}" fill="${fill}"/>`
      + label(x(v) + 1.2, y + H * 0.68, v, { fill: palette.ink, size: 2.7, w: 600 });
  });
  return frame(W, 38, out + label(x(50), 37.4, 'GSM8K solve rate (%)',
    { anchor: 'middle', size: 2.4 }));
}

const SIZES = { LaMDA: [0.42, 2, 8, 68, 137], GPT: [0.35, 1.3, 6.7, 175], PaLM: [8, 62, 540] };
const PRIOR = { GSM8K: 55, SVAMP: 47.3, MAWPS: 88.4 };
const TOP_OF = { GSM8K: 60, SVAMP: 80, MAWPS: 100 };
function series(set, model) { // the Table 2 rows of a model family, standard and CoT
  const col0 = 2 * SETS.indexOf(set);
  const rows = RESULTS.filter((_, i) => RESULTS.slice(0, i + 1).map((r) => r[0])
    .filter(Boolean).at(-1) === model);
  const val = (r, k) => parseFloat(r[2].split(' ')[col0 + k]);
  return [rows.map((r) => val(r, 0)), rows.map((r) => val(r, 1))];
}
function scaleChart() { // Figure 4: 178 × 86 mm, three benchmarks by three families
  const [L, G, PW, PH, T] = [20, 7, 47.3, 17, 13];
  let out = '';
  const legend = [['Standard prompting', palette.muted, 0.7], ['Chain-of-thought prompting',
    palette.accent, 1.1]];
  legend.forEach(([name, c, r], i) => {
    const lx = L + i * 46;
    out += `<path d="M${lx} 4H${lx + 6}" stroke="${c}" stroke-width="0.5"/>`
      + `<circle cx="${lx + 3}" cy="4" r="${r}" fill="${c}"/>` + label(lx + 8, 4.9, name,
      { fill: palette.ink, size: 2.6 });
  });
  out += `<path d="${dashes(L + 104, L + 110, 4)}" stroke="${palette.ink}" stroke-width="0.4"/>`
    + label(L + 112, 4.9, 'Prior supervised best', { fill: palette.ink, size: 2.6 });
  ['GSM8K', 'SVAMP', 'MAWPS'].forEach((set, row) => {
    const y0 = T + row * (PH + 8);
    const y = (v) => y0 + PH - (v / TOP_OF[set]) * PH;
    out += label(0, y0 + PH / 2 + 1, set, { size: 2.5, fill: palette.ink, w: 600 });
    Object.entries(SIZES).forEach(([model, xs], c) => {
      const x0 = L + c * (PW + G);
      const lo = Math.log10(xs[0] / 1.6);
      const hi = Math.log10(xs.at(-1) * 1.6);
      const x = (s) => x0 + ((Math.log10(s) - lo) / (hi - lo)) * PW;
      if (row === 0) out += label(x0 + PW / 2, T - 3, model, { anchor: 'middle', size: 2.7,
        fill: palette.ink, w: 600 });
      for (let v = 0; v <= TOP_OF[set]; v += TOP_OF[set] / 4) {
        out += `<path d="M${x0} ${n2(y(v))}H${x0 + PW}" stroke="${palette.rule}" `
          + `stroke-width="${v ? 0.12 : 0.3}"/>`;
        if (c === 0) out += label(x0 - 1.2, y(v) + 0.8, v, { anchor: 'end', size: 2.2 });
      }
      out += `<path d="${dashes(x0, x0 + PW, y(PRIOR[set]))}" stroke="${palette.ink}" `
        + 'stroke-width="0.35"/>';
      if (row === 2) xs.forEach((s) => { out += label(x(s), y0 + PH + 3.4, s, { size: 2.2,
        anchor: 'middle' }); });
      series(set, model).forEach((vals, k) => {
        const [c2, r] = k ? [palette.accent, 1.1] : [palette.muted, 0.7];
        const pts = vals.map((v, i) => `${n2(x(xs[i]))} ${n2(y(v))}`);
        out += `<path d="M${pts.join('L')}" fill="none" stroke="${c2}" stroke-width="0.5"/>`
          + pts.map((p) => `<circle cx="${p.split(' ')[0]}" cy="${p.split(' ')[1]}" r="${r}" `
            + `fill="${c2}"/>`).join('');
      });
    });
  });
  return frame(178, 90, out + label(L + (3 * PW + 2 * G) / 2, 89,
    'Model scale (# parameters in billions)', { anchor: 'middle', size: 2.5 }));
}
const markSvg = (fill, path) => '<svg xmlns="http://www.w3.org/2000/svg" width="64" '
  + `height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${fill}"/>`
  + `<path d="${path}" fill="none" stroke="#ffffff" stroke-width="7" `
  + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Newsreader: ['400', '400i', '600', '700'],
  'IBM Plex Sans': ['400', '500', '600'],
  'IBM Plex Mono': ['400', '500', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const source = [markdown, later, refs].join('\n\n');
await Promise.all([loadSvg('gsm8k.svg', barChart()), loadSvg('scale.svg', scaleChart()),
  loadSvg('right.svg', markSvg(palette.green, 'M18 33l9 9 19-20')),
  loadSvg('wrong.svg', markSvg(palette.red, 'M21 21l22 22M43 21L21 43'))]);
const content = { markdown: source, resources: resources() };
const doc = await buildDocumentWithFonts(content, config(), kitFonts(FONTS));
showPages(doc, { title: 'An AI preprint with prompt exemplars' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit
