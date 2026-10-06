// ═══ Postext Cookbook · Nº 138 · Machine-learning paper with theorems and proofs ═══
// https://postext.dev/en/cookbook/ml-paper-theorems-proofs
// Code: MIT · Text: Rafailov et al. 2023, arXiv:2305.18290 (CC BY 4.0), abridged · Art: code
// Fonts: Spectral, Work Sans, JetBrains Mono (SIL OFL 1.1) · Needs postext ≥ 1.19.0
// DPO (NeurIPS 2023) re-set as a preprint: numbered equations with labels and references,
// definition, lemma and theorem boxes, proofs that end in a square, author–year citations.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  registerCitationEngine, defaultResourceTypes, initMathEngine, renderMath,
} from 'https://esm.sh/postext?bundle';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'ml-paper-theorems-proofs';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1d1a22', accent: '#6b2a5f', // text; plum: the band, labels, theorem stripes
  ochre: '#a8621c', tint: '#f4edf2', // the RLHF route in Figure 1; the theorem fill
  rule: '#cfc3cc', muted: '#675f6b', // hairlines; running heads, notes
  mist: '#e3c9dc', paper: '#ffffff', // type and curves on the band; white
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [SERIF, SANS, MONO] = ['Spectral', 'Work Sans', 'JetBrains Mono'];
const [BODY, LEAD] = [9.6, 13.4]; // pt: one column of 130 mm, about 74 characters a line
// mm: a 7 × 10 in trim, as technical books and many preprint series print
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER] = [178, 254, 22, 22, 21, 27];
const MEASURE = TRIM_W - INNER - OUTER;

// #region answer: amsthm in Markdown: numbered equations, theorems and proofs
// \label{eq:x} in a display formula numbers it, on its row of an align; a box opened as
// :::callout{type="lemma" #lem:x} counts as a statement. \eqref{eq:x}, \ref{lem:x} and
// :ref{id="lem:x"} print the number and link to it.
const equationNumbering = { // (1) to (13): one sequence through the paper and its appendix
  numberingTemplate: '{n}', resetOn: 'never', format: '({n})' };
// A proof's label has no number. Its □ is $\square$ in the text: an endMark: '□' would be set
// in Spectral, which has no such glyph.
const proofLabel = (label) => ({ label, counter: false, bold: false, italic: true });
const statements = [ // a counter per kind, as the paper has it: Definition 1, Lemma 1, Theorem 1
  { id: 'definition', numbering: { label: 'Definition' } },
  { id: 'lemma', numbering: { label: 'Lemma' } }, // counter: 'theorem' would share one sequence
  { id: 'theorem', numbering: { label: 'Theorem' } },
  { id: 'proof', numbering: proofLabel('Proof') },
  { id: 'sketch', numbering: proofLabel('Proof Sketch') },
];
// #endregion

// #region theorems: one look per environment, the statements set in italics
const box = ({ id, ...numbered }, extra) => ({ id, marginTop: pt(LEAD * 0.6),
  marginBottom: pt(LEAD * 0.6), backgroundEnabled: false,
  snapToGrid: false, // exact space round a statement, as amsthm's \topsep; one column, no grid
  padding: { top: mm(1.8), right: mm(4), bottom: mm(1.8), left: mm(4) },
  body: { italic: true, firstLineIndent: pt(0), boldColor: col('ink') }, ...extra, ...numbered });
const stripe = (color) => ({ enabled: true, side: 'left', width: pt(3), color: col(color) });
const proof = { keepTogether: false, // a long proof runs on to the next page
  // A proof is upright text with an italic run-in label, set off by space alone.
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  body: { firstLineIndent: pt(0), italicColor: col('ink') } };
const look = { definition: { stripe: stripe('rule') }, lemma: { stripe: stripe('accent') },
  theorem: { backgroundEnabled: true, background: col('tint') }, proof, sketch: proof };
const theoremStyles = [...statements.map((s) => box(s, look[s.id])),
  box({ id: 'restated' }, look.lemma)]; // Lemma 1 again in the appendix, with no new number
// #endregion

// #region title: a plum band with the title, the byline under it, the source at the foot
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), align: 'left',
  overflow: 'wrap', placement, ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const caps = (size, fontWeight = 600) => ({ fontWeight, letterSpacing: pt(size * 0.18),
  textTransform: 'uppercase' });
const BAND = 80; // mm from the trim's top to the foot of the band
const titleBlock = {
  enabled: true,
  minHeight: mm(BAND + 13 - TOP), // the band, then the byline: the abstract starts under it
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('accent') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' },
        size: { width: 'fill', height: mm(BAND + 3) } } }, // + 3 mm of bleed
    { kind: 'image', id: 'curves', resourceId: 'sigmoids', // drawn in code: σ(βu)
      placement: at('page', 'top-left', 70, 3, 108) },
    text('kicker', 'Preprint · Machine learning · Re-set and abridged', SANS, 7.5, 'mist',
      at('page', 'top-left', INNER, 30, 120), caps(7.5)),
    text('title', '{titleText}', SERIF, 25, 'paper', at('#kicker', 'below', 0, 3.5, MEASURE),
      { fontWeight: 600, lineHeight: 1.08 }),
    text('venue', 'NeurIPS 2023 · arXiv:2305.18290v3 · CC BY 4.0', MONO, 7, 'mist',
      at('page', 'top-left', INNER, BAND - 7, 120), { overflow: 'clip' }),
    text('authors', '{attr.authors}', SANS, 9.5, 'ink', at('page', 'top-left', INNER, BAND + 6,
      MEASURE), { fontWeight: 500, lineHeight: 1.45 }),
    text('affiliations', '{attr.affiliations}', SANS, 7.5, 'muted',
      at('#authors', 'below', 0, 1.4, MEASURE)),
  ] },
};
const head = (id, content, parity, edge, x, extra) => text(id, content, SANS, 7.5, 'muted',
  at('page', `top-${edge}`, x, 13), { overflow: 'clip', ...caps(7.5, 500), align: edge,
    parity, pages: 'body', ...extra });
const folio = { fontWeight: 700, color: col('accent') };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'left', OUTER, folio),
  head('v-title', 'Rafailov, Sharma, Mitchell, Ermon, Manning & Finn', 'even', 'left', OUTER + 9),
  head('r-title', 'Direct Preference Optimization', 'odd', 'right', -(OUTER + 9)),
  head('r-folio', '{pageNumber}', 'odd', 'right', -OUTER, folio),
] };
const footer = { elements: [ // the first page: where the text comes from, and its licence
  text('source', 'Abridged from Rafailov, R. et al. (2023), Advances in Neural Information '
    + 'Processing Systems 36, arXiv:2305.18290v3, CC BY 4.0 · equations renumbered, '
    + 'Figure 1 redrawn', MONO, 6.2,
  'muted', at('page', 'bottom-left', INNER, -13, MEASURE - 10), { pages: 'opener' }),
  text('drop-folio', '{pageNumber}', SANS, 7.5, 'accent', at('page', 'bottom-right', -OUTER, -13),
    { ...folio, align: 'right', pages: 'opener', overflow: 'clip' }),
] };
// #endregion

// #region citations: author–year from BibTeX, in Cite Them Right Harvard
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = { style: 'harvard-cite-them-right', link: true,
  bibliography: { fontSize: pt(8.2), lineHeight: pt(10.8), hangingIndent: mm(5),
    entrySpacing: pt(1.6), doi: 'link' } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'en-us', colorPalette, resourceTypes, citations,
  crossRefs: { section: 'Section {n}' }, // "Section 5", as the paper writes it
  page: { width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, // LaTeX sets \ref upright and regular
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  math: { marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2), equationNumbering },
  headings: { fontFamily: SANS, color: col('ink'), fontWeight: 600,
  // A short page takes at most one grid line more above a heading: a paper's heads keep their
  // spacing, and a page held short by a tall display may end a few lines up.
  balancing: { maxLinesPerHeading: 1 },
  levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // gotcha: headings-drop-h1-break
    { level: 2, numberingTemplate: '{2}', fontSize: pt(11.5), lineHeight: pt(LEAD),
      marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) },
    { level: 3, numberingTemplate: '{2}.{3}', fontSize: pt(9.8), lineHeight: pt(LEAD),
      marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  headingStyles: [
    { id: 'paper', numbered: false, advancedDesign: titleBlock, fontSize: pt(BODY),
      lineHeight: pt(LEAD), marginTop: pt(0), marginBottom: pt(0) }, // the band draws the title
    { id: 'back', numbered: false },
    { id: 'appendix', numberingTemplate: '{2:A}' },
    { id: 'appendix-sub', numberingTemplate: '{2:A}.{3}' },
  ],
  calloutStyles: [...theoremStyles,
    { id: 'abstract', title: 'Abstract', marginTop: pt(0), marginBottom: pt(LEAD),
      backgroundEnabled: false, stripe: { enabled: true, side: 'top', width: pt(2.5),
        color: col('accent') },
      padding: { top: mm(2.5), right: mm(8), bottom: mm(1), left: mm(8) },
      titleStyle: { fontFamily: SANS, fontSize: pt(7.5), ...caps(7.5, 700),
        color: col('accent'), gap: mm(1.2), lineHeight: pt(LEAD) },
      body: { fontSize: pt(9.3), lineHeight: pt(13), firstLineIndent: pt(0) } }],
  paragraphStyles: [{ id: 'colophon', fontFamily: SANS, fontSize: pt(7), lineHeight: pt(9.5),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD * 2) }],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('accent'), headerColor: col('paper'), headerFontFamily: SANS,
    headerFontSize: pt(8), bodyFontFamily: SERIF, bodyFontSize: pt(9), bodyColor: col('ink'),
    cellPadding: mm(1.3) },
  captionStyle: { fontFamily: SANS, fontSize: pt(8), color: col('ink'), labelBold: true,
    labelColor: col('accent'), gap: mm(2.2), note: { fontSize: pt(7), color: col('muted') } },
  header, footer,
});
// Figure 1, Table 1: numbered through the paper ("{n}"), the table captioned above.
const resourceTypes = defaultResourceTypes(LANG).map((type) => ({ ...type,
  numberingTemplate: '{n}', resetOn: 'never',
  ...(type.id === 'table' && { captionStyle: { position: 'above' } }) }));

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // title, abstract, sections 1, 3 and 4
const theory = /* @content:theory */ ''; // sections 5 to 7 and the place of the references
const appendix = /* @content:appendix */ ''; // appendix A.1 and A.5
const references = /* @content:references */ ''; // the works the kept text cites, as BibTeX
const source = [markdown, theory, appendix, references].join('\n\n');

const ood = { headerRowCount: 2, columnWidths: [1, 1, 1], rows: [
  ['', { content: 'Win rate vs. ground truth', colSpan: 2 }],
  ['Alg.', 'Temp 0', 'Temp 0.25'], ['DPO', '0.36', '0.31'], ['PPO', '0.26', '0.23'],
].map((row) => row.map((c) => ({ align: 'center',
  ...(typeof c === 'string' ? { content: c } : c) }))) };
const PX_PER_MM = 10;
const resources = () => [
  { id: 'sigmoids', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'sigmoids.svg', width: 108 * PX_PER_MM, height: 24 * PX_PER_MM },
    caption: '', altText: 'Logistic curves of growing steepness.' },
  { id: 'pipeline', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'pipeline.svg', width: MEASURE * PX_PER_MM, height: 64 * PX_PER_MM },
    placement: { position: 'top' },
    caption: '**DPO optimizes for human preferences while avoiding reinforcement learning.** '
      + 'Existing methods for fine-tuning language models with human feedback first fit a '
      + 'reward model to a dataset of prompts and human preferences over pairs of responses, '
      + 'and then use RL to find a policy that maximizes the learned reward. In contrast, DPO '
      + 'directly optimizes for the policy best satisfying the preferences with a simple '
      + 'classification objective, fitting an *implicit* reward model whose corresponding '
      + 'optimal policy can be extracted in closed form.',
    note: 'Redrawn from Figure 1 of Rafailov et al. (2023).',
    altText: 'Two pipelines side by side. RLHF: preference data, a reward model fitted by '
      + 'maximum likelihood, then a loop of sampling and reinforcement learning. DPO: '
      + 'preference data straight to the final language model by maximum likelihood.' },
  { id: 'ood', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    table: { model: ood }, placement: { position: 'here', width: 0.5, align: 'center' },
    caption: 'GPT-4 win rates vs. ground truth summaries for out-of-distribution '
      + 'CNN/DailyMail input articles.' },
];

// #region art: σ(βu) on the band, and Figure 1, its words in Work Sans carried in the SVG
const R = (x) => Math.round(x * 100) / 100;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX_PER_MM}" `
  + `height="${h * PX_PER_MM}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
function sigmoids() { // 108 × 24 mm over the kicker: σ(βu) for β from 0.25 to 4
  let out = '';
  [0.25, 0.4, 0.6, 1, 1.6, 2.5, 4].forEach((beta, i) => {
    const pts = Array.from({ length: 105 }, (_, k) => {
      const u = (k - 52) / 8; // u from −6.5 to 6.5
      return `${k ? 'L' : 'M'}${R(2 + k)} ${R(22 - 20 / (1 + Math.exp(-beta * u)))}`;
    }).join('');
    out += `<path d="${pts}" fill="none" stroke="${palette.mist}" stroke-width="${R(0.3
      + i * 0.06)}" stroke-opacity="${R(0.25 + i * 0.1)}"/>`;
  });
  return svg(108, 24, out);
}
async function inlineFace(family, weight) { // a face an SVG image can use (svg-no-webfonts)
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}`
    + '-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `@font-face{font-family:'${family}';font-weight:${weight};`
    + `src:url(data:font/woff2;base64,${btoa(bin)})}`;
}
function tex(markup, x, y, size, color = 'ink', anchor = 0) { // maths as MathJax paths
  const r = renderMath(markup, false, 100);
  const k = size / 1000;
  return `<g transform="translate(${R(x - anchor * r.viewBox.width * k)} ${R(y)}) scale(${k})" `
    + `fill="${palette[color]}">${r.paths.map((p) => `<path d="${p.d}"/>`).join('')}</g>`;
}
const words = (x, y, s, { size = 2.6, weight = 400, color = 'ink', anchor = 'start' } = {}) =>
  `<text x="${R(x)}" y="${R(y)}" font-family="${SANS}" font-weight="${weight}" `
  + `font-size="${size}" fill="${palette[color]}" text-anchor="${anchor}">${s}</text>`;
const rect = (x, y, w, h, stroke, fill = 'paper', r = 1.2) => `<rect x="${x}" y="${y}" `
  + `width="${w}" height="${h}" rx="${r}" fill="${palette[fill]}" stroke="${palette[stroke]}" `
  + 'stroke-width="0.35"/>';
function arrow(points, color) { // a line with a drawn head, never an SVG marker
  const [[x1, y1], [x2, y2]] = points.slice(-2);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = [a - 0.45, a + 0.45].map((t) => `${R(x2 - 2 * Math.cos(t))} ${R(y2 - 2
    * Math.sin(t))}`);
  return `<path d="M${points.map(([x, y]) => `${R(x)} ${R(y)}`).join('L')}" fill="none" `
    + `stroke="${palette[color]}" stroke-width="0.45"/><path d="M${head[0]}L${R(x2)} ${R(y2)}`
    + `L${head[1]}Z" fill="${palette[color]}"/>`;
}
function preferences(x, y, w) { // a prompt and two answers, the preferred one first
  const page = (dx) => rect(x + dx, y + 15.5, 6, 7.2, 'rule', 'paper', 0.6)
    + [0, 1, 2].map((l) => `<path d="M${x + dx + 1.2} ${y + 17.6 + l * 1.6}h3.6" `
      + `stroke="${palette.rule}" stroke-width="0.4"/>`).join('');
  return rect(x, y, w, 25, 'rule', 'tint')
    + words(x + 2.4, y + 4.6, 'PREFERENCE DATA', { size: 2.1, weight: 600, color: 'muted' })
    + tex('x', x + 2.4, y + 9.8, 3) + words(x + 4.3, y + 9.8, ': “write me a poem about',
      { size: 2.25 }) + words(x + 5.2, y + 13, 'the history of jazz”', { size: 2.25 })
    + page(2.4) + tex('y_w', x + 9.4, y + 20.6, 3) + tex('\\succ', x + 14, y + 20.4, 3, 'accent')
    + page(18.4) + tex('y_l', x + 25.4, y + 20.6, 3);
}
function pipeline(face) { // 130 × 64 mm: RLHF on the left, DPO on the right
  const title = (x, name, sub, color) => words(x, 4, name, { size: 3.2, weight: 600, color })
    + words(x, 8, sub, { size: 2.3, color: 'muted' });
  const model = (x, y, w, label, color) => rect(x, y, w, 9, color)
    + words(x + w / 2, y + 5.8, label, { size: 2.6, weight: 600, color, anchor: 'middle' });
  const note = (x, y, lines, color, anchor) => lines.map((line, i) => words(x, y + i * 3, line,
    { size: 2.3, color, anchor })).join('');
  return svg(MEASURE, 64, `<style>${face}</style>`
    + title(0, 'RLHF', 'Reinforcement learning from human feedback', 'ochre')
    + preferences(0, 14, 32)
    + arrow([[33, 26.5], [48, 26.5]], 'ochre') + note(40.5, 22.4, ['maximum'], 'ochre', 'middle')
    + note(40.5, 31.4, ['likelihood'], 'ochre', 'middle')
    + model(49, 22, 25, 'reward model', 'ochre') + model(49, 50, 25, 'LM policy', 'ochre')
    + arrow([[55, 31.5], [55, 49]], 'ochre')
    + note(53.4, 41.6, ['label rewards,', 'reinforcement', 'learning'], 'ochre', 'end')
    + arrow([[68, 49], [68, 31.5]], 'ochre') + note(69.6, 39, ['sample', 'completions'], 'ochre')
    + `<path d="M88 2V62" stroke="${palette.rule}" stroke-width="0.3"/>`
    + title(93, 'DPO', 'Direct preference optimization', 'accent')
    + preferences(93, 14, 37)
    + arrow([[111.5, 39.5], [111.5, 49]], 'accent')
    + note(113.2, 43.4, ['maximum', 'likelihood'], 'accent', 'start')
    + model(99, 50, 25, 'final LM', 'accent'));
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages paint, loaded before the first build (gotcha: fonts-first)
  Spectral: ['400', '400i', '600', '700', '700i'],
  'Work Sans': ['400', '400i', '500', '600', '700'],
  'JetBrains Mono': ['400'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await initMathEngine(); // gotcha: math-bundle. Unawaited, formulas paint as grey boxes
await loadFonts(FONTS, source);
await loadSvg('sigmoids.svg', sigmoids());
await loadSvg('pipeline.svg', pipeline(await inlineFace(SANS, 400) + await inlineFace(SANS, 600)));
const content = () => ({ markdown: source, resources: resources() });
const doc = await buildWithFonts(() => buildDocument(content(), config()), source);
showPages(doc, { title: 'Machine-learning paper with theorems and proofs' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // text in the Fontsource faces; formulas and figures as vector paths

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
