// ═══ Postext Cookbook · Nº 014 · Justification lab ════════════════════════════════
// https://postext.dev/en/cookbook/justification-lab
// Code: MIT · Text: original (CC BY 4.0) · Diagram: generated in code (CC BY 4.0)
// Fonts: Petrona, Bricolage Grotesque, Source Code Pro (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// A type journal's essay set twice from one design, Knuth–Plass and greedy: the two page 2s
// side by side with their loose lines marked from the layout tree, then the published pages.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  parseMarkdownWithIssues,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'justification-lab';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Graphite, paper, one highlighter yellow; col() writes hex too (gotcha: palette-skips-designs).
const palette = {
  ink: '#1f2124', // text: a graphite near-black
  graphite: '#2e3136', // the accent: the opener band, the bench box, folios
  marker: '#ffe14d', // highlighter yellow: glue and loose lines, never type on white
  haze: '#c3c7cc', // type on graphite: the standfirst, the diagram's labels
  muted: '#66686c', // running heads, settings lines, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.graphite, model: 'hex' } }, // no blue
];
const [TEXT, DISPLAY, MONO] = ['Petrona', 'Bricolage Grotesque', 'Source Code Pro'];
const [BODY, LEAD] = [9.5, 13]; // pt: body size and leading, the grid both columns share
// mm: an A5 trim, mirrored margins and a narrow gutter: two columns of about 40 characters
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER, GUTTER] = [148, 210, 20, 20, 16, 13, 5];
const MEASURE = TRIM_W - INNER - OUTER; // mm: 119, the text width the opener aligns to
const caps = (size, weight = 500) => ({ fontFamily: MONO, fontSize: pt(size), fontWeight: weight,
  letterSpacing: pt(size * 0.16), textTransform: 'uppercase' }); // tracked mono labels

// #region answer: one design, two line breakers: Knuth–Plass inside fences, greedy without
// Knuth–Plass breaking, hyphenation and the widow, orphan and runt penalties are all on by
// default. A narrow column also needs a tighter fence round the glue, in multiples of a
// normal word space (defaults 0.6 and 2): lines past the upper fence cost more than any
// hyphen, so the breaker hyphenates or re-breaks the paragraph before it stretches that far.
const FENCES = { minWordSpacing: 0.8, maxWordSpacing: 1.6 };
const bodyText = { // config().bodyText
  fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  firstLineIndent: mm(4), indentAfterHeading: false, // justified and hyphenated by default
  ...FENCES,
};
// Hyphenation follows the document's locale, by exact code (gotcha: hyphenation-locales):
const locale = t({ en: 'en-us', es: 'es' }); // config().locale; 'es-ES' would be English
// The control: first-fit breaking, which sets each line once and moves on, with the widow and
// orphan guards off (runts are priced inside Knuth–Plass only). Same text, fonts and measure;
// a fresh object on every call, like config() itself, because the engine caches resolved
// configs by identity (gotcha: config-cache-identity).
const GREEDY = { optimalLineBreaking: false, avoidWidows: false, avoidOrphans: false };
const control = () => ({ ...config(), bodyText: { ...bodyText, ...GREEDY } });
// #endregion

// #region opener: the title on a graphite band, with the diagram drawn in as an image element
const BAND = 104; // mm from the trim's top edge to the band's foot
const DIAGRAM = { y: 64, w: MEASURE + 8, h: 34 }; // mm: its top on the page, width, height
const LABEL = 7; // pt: the diagram's labels, tracked less than caps() so the legend fits
const text = (id, content, family, size, color, x, y, extra) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col(color), align: 'left', overflow: 'wrap',
  placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) },
    size: { width: mm(MEASURE) } }, ...extra });
const opener = () => ({ // a function: the diagram's constants are defined further down
  enabled: true,
  slot: { elements: [
    // The band box reserves the opener's height, and the H1's default marginBottom adds a line
    // of white: the body starts on the second grid line under the band. The diagram could not
    // reserve it, as images never count (gotcha: opener-image-no-reserve).
    { kind: 'box', id: 'band', style: { backgroundColor: col('graphite') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' },
        size: { width: 'fill', height: mm(BAND) } } },
    text('kicker', '{attr.kicker}', MONO, 7.5, 'marker', INNER, TOP, caps(7.5, 600)),
    text('title', '{titleText}', DISPLAY, 29, 'paper', INNER, TOP + 5, // one line in both
      { fontWeight: 800, lineHeight: 1.02 }), // a multiple (gotcha: design-lineheight-multiple)
    text('standfirst', '{attr.standfirst}', TEXT, 10.5, 'haze', INNER, TOP + 19,
      { italic: true, lineHeight: 1.3 }),
    { kind: 'image', id: 'diagram', resourceId: 'diagram', placement: { anchor: { to: 'page',
      edge: 'top-left' }, offset: { x: mm(INNER), y: mm(DIAGRAM.y) },
    size: { width: mm(DIAGRAM.w), height: mm(DIAGRAM.h) } } },
    // An SVG image cannot use web fonts (gotcha: svg-no-webfonts): its labels are design text.
    ...diagramLabels().map(([id, words, x, y]) => text(id, words, MONO, LABEL, 'haze',
      INNER + x, DIAGRAM.y + y, { ...caps(LABEL), letterSpacing: pt(0.5) })),
  ] },
});
// #endregion

const HEAD_Y = 11; // mm from the top (bottom) edge: running heads in the margin, folios outside
const head = (id, content, parity, edge, x, extra) => ({ ...text(id, content, MONO, 7.5,
  'muted', 0, 0, caps(7.5)), parity, pages: 'body', align: edge.split('-')[1], // left | right
  placement: { anchor: { to: 'page', edge },
    offset: { x: mm(x), y: mm(edge.startsWith('top') ? HEAD_Y : -HEAD_Y) } }, ...extra });
const folio = { fontFamily: DISPLAY, fontWeight: 800, fontSize: pt(8), letterSpacing: pt(0),
  color: col('graphite') };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('v-title', '{title} · {subtitle}', 'even', 'top-left', OUTER + 8),
  head('r-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8)),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom-right', -OUTER,
  { ...folio, pages: 'opener' })] }; // the opener's folio drops to its foot

// #region bench: three slips in a 2 × 2 grid, each a nested box with a body style of its own
// A box sets all its :::columns in one body style, so each setting is a nested box; breaks="3"
// counts a nested box as one block (gotcha: callout-columns). The bench floats to a page foot.
const [SLIP_GAP, FRAME] = [3, 4]; // mm: between slips; the bench's frame round them
const slip = (id, body) => ({ id, background: col('paper'), marginBottom: mm(SLIP_GAP),
  padding: { top: mm(2.2), right: mm(2.6), bottom: mm(2.4), left: mm(2.6) },
  titleStyle: { fontFamily: MONO, fontSize: pt(6.6), fontWeight: 600, color: col('muted'),
    gap: mm(1.6) }, // code keeps its case: textAlign, not TEXTALIGN
  body: { fontSize: pt(8.6), lineHeight: pt(11.6), firstLineIndent: pt(0), ...body } });
const calloutStyles = [
  { id: 'bench', span: 'page', placement: 'bottom', background: col('graphite'),
    columnGap: mm(FRAME), // the foot needs a FRAME too: the last slip's marginBottom is dropped
    padding: { top: mm(3.4), right: mm(FRAME), bottom: mm(FRAME), left: mm(FRAME) },
    titleStyle: { ...caps(7.5, 600), color: col('marker'), gap: mm(2.4) },
    body: { fontSize: pt(8.6), lineHeight: pt(11.6), color: col('paper'), textAlign: 'left',
      firstLineIndent: pt(0) } },
  slip('ragged', { textAlign: 'left' }), // never hyphenated (gotcha: ragged-no-hyphenation)
  slip('unhyphenated', { hyphenation: false }), // justified, like the body text
  slip('justified', {}), // justified and hyphenated: the body text's own settings
  { id: 'settings', backgroundEnabled: false, marginTop: pt(3), marginBottom: pt(3), // config
    stripe: { enabled: true, side: 'left', width: pt(2), color: col('graphite') },
    padding: { top: pt(1), right: pt(0), bottom: pt(1), left: mm(3) },
    body: { fontFamily: MONO, fontSize: pt(7), lineHeight: pt(9.5), color: col('graphite'),
      firstLineIndent: pt(0) } },
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale, colorPalette,
  page: { width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150, margins: { top: mm(TOP),
    bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText,
  headings: { fontFamily: DISPLAY, fontWeight: 800, color: col('ink'),
    levels: [ // restated: a headings object drops the H1 break (gotcha: headings-drop-h1-break)
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        advancedDesign: opener() },
      { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), marginTop: pt(LEAD),
        marginBottom: pt(0) },
    ] },
  paragraphStyles: [
    { id: 'colophon', fontFamily: MONO, fontSize: pt(6.6), lineHeight: pt(9), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  calloutStyles,
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook


// #region art: boxes, glue and penalties: one line as measured and as set, and its resource
const resources = [{ id: 'diagram', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'diagram.svg', width: DIAGRAM.w * 10, height: DIAGRAM.h * 10 }, // 10 px a mm
  altText: t({ en: 'A line of word boxes whose last word overruns the measure; then the same '
    + 'line hyphenated, its springs stretched until it fills the measure exactly.',
  es: 'Una línea de cajas cuya última palabra rebasa la medida; después, la misma línea '
    + 'partida, con los muelles estirados hasta llenar la medida justa.' }) }];
// Word boxes in mm; the long last word may break at a hyphenation penalty after its first part.
const WORDS = [[14], [8], [17], [6.5], [13.5], [10], [16.7, 16]];
const [ROW_H, GLUE, HYPHEN, ROWS] = [4.4, 3.6, 2, [7, 20.5]]; // mm; ROWS: the rows' tops
const SET = WORDS.reduce((sum, w) => sum + w[0], HYPHEN); // the set line: boxes to the hyphen
const STRETCH = (MEASURE - SET) / (WORDS.length - 1) / GLUE; // what fills the measure: ×1.45
const R = (v) => Math.round(v * 100) / 100;
function spring(x, y, w) { // a zigzag of eight turns: glue, stretched or at rest
  const pts = Array.from({ length: 9 }, (_, i) => `${R(x + (i * w) / 8)} ${R(y + (i % 2 ? -1 : 1)
    * 0.9)}`);
  return `<path d="M${R(x)} ${R(y)}L${pts.join('L')}L${R(x + w)} ${R(y)}" fill="none" `
    + `stroke="${palette.marker}" stroke-width="0.45" stroke-linejoin="round"/>`;
}
function row(y, glue, broken) { // one line of boxes; `broken`: set up to the penalty
  let [x, out] = [0, ''];
  const box = (w, h = ROW_H) => { out += `<rect x="${R(x)}" y="${R(y + (ROW_H - h) / 2)}" `
    + `width="${R(w)}" height="${h}" rx="0.5" fill="${palette.paper}"/>`; x += w; };
  WORDS.forEach((word, i) => {
    if (i) { out += spring(x, y + ROW_H / 2, glue); x += glue; }
    box(word[0]);
    if (word.length === 1) return;
    // The penalty: a flagged break inside the word, marked by a yellow wedge. Taken, it sets
    // a hyphen (a short bar); passed over, the rest of the word runs on past the measure.
    out += `<path d="M${R(x - 1.1)} ${y - 2.6}h2.2l-1.1 1.9z" fill="${palette.marker}"/>`;
    if (broken) box(HYPHEN, 1); else box(word[1]);
  });
  return out;
}
function diagram() {
  const measure = `<path d="M${MEASURE - 0.2} 3V${ROWS[1] + ROW_H + 2}" ` // stops over the legend
    + `stroke="${palette.haze}" stroke-width="0.4" stroke-dasharray="0.8 0.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DIAGRAM.w * 10}" `
    + `height="${DIAGRAM.h * 10}" viewBox="0 0 ${DIAGRAM.w} ${DIAGRAM.h}">`
    + `${row(ROWS[0], GLUE, false)}${row(ROWS[1], GLUE * STRETCH, true)}${measure}</svg>`;
}
function diagramLabels() { // [id, text, x, y] in mm from the diagram's top-left corner
  const k = STRETCH.toFixed(2).replace('.', t({ en: '.', es: ',' }));
  return [
    ['l-natural', t({ en: 'As measured: the word overruns',
      es: 'Medida natural: la palabra no cabe' }), 0, ROWS[0] - 5.5],
    ['l-set', t({ en: `As set: hyphenated, each space ×${k}`,
      es: `Compuesta: partida, cada espacio ×${k}` }), 0, ROWS[1] - 5.5],
    ['l-legend', t({ en: 'Box: a word · glue: a space · penalty: a break · dashes: the measure',
      es: 'Caja: palabra · cola: espacio · penalización: corte · trazos: la medida' }),
    0, ROWS[1] + ROW_H + 3.5],
  ];
}
// #endregion

// #region marks: the highlighter: loose lines, lone lines and runts read from the layout tree
// debug.looseLineHighlight is Sandbox-only (gotcha: sandbox-only-warnings), so the pen reads the
// VDT: justified lines carry justifiedSpaceRatio; a paragraph cut by a column is two blocks.
function marks(doc, page) {
  const body = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).filter((b) =>
    b.type === 'paragraph' && b.containerId === undefined && b.textAlign === 'justify');
  const out = [];
  for (const column of page.columns) {
    for (const b of column.blocks.filter((x) => body.includes(x))) {
      const parts = body.filter((o) => o.contentIndex === b.contentIndex);
      b.lines.forEach((line) => {
        const at = { x: b.bbox.x, y: line.bbox.y, w: b.bbox.width, h: line.bbox.height, column };
        if (line.justifiedSpaceRatio > FENCES.maxWordSpacing || line.ragged) {
          out.push({ ...at, kind: 'loose' }); // ragged: past 3×, so the engine set it ragged
        }
        if (b.lines.length === 1 && parts.length > 1) { // Postext's names (see the essay):
          out.push({ ...at, kind: b === parts[0] ? 'widow' : 'orphan' }); // foot : head
        } else if (line.isLastLine && !/\s/.test(line.text.trim())) {
          out.push({ ...at, kind: 'runt' }); // one word alone on a paragraph's last line
        }
      });
    }
  }
  return out;
}
const TAGS = t({ en: { widow: 'widow', orphan: 'orphan', runt: 'runt' },
  es: { widow: 'viuda', orphan: 'huérfana', runt: 'corta' } });
function paintMarks(canvas, list, scale) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0); // page px from here on
  for (const m of list) { // loose lines: a wash; lone lines and runts: a tag in the margin
    const loose = m.kind === 'loose';
    ctx.globalCompositeOperation = loose ? 'multiply' : 'source-over'; // the ink shows through
    ctx.fillStyle = loose ? palette.marker : palette.graphite;
    if (loose) { ctx.fillRect(m.x - 2, m.y + 1, m.w + 4, m.h - 1); continue; }
    ctx.font = `600 ${m.h * 0.48}px "${MONO}"`;
    const w = ctx.measureText(TAGS[m.kind]).width + m.h * 0.5;
    const x = m.column.index === 0 ? m.x - w - m.h * 0.35 : m.x + m.w + m.h * 0.35;
    ctx.fillRect(x, m.y + m.h * 0.12, w, m.h * 0.8);
    ctx.fillStyle = palette.marker;
    ctx.fillText(TAGS[m.kind], x + m.h * 0.25, m.y + m.h * 0.7);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
// #endregion

// #region compare: the control beside the published page, each with its count of marks
function compare(pairs) {
  document.head.insertAdjacentHTML('beforeend', `<style>
    #compare { background: ${palette.graphite}; color: ${palette.haze}; padding: 36px 24px 44px;
      font: 500 12px/1.4 "${MONO}", monospace; } #compare > * { max-width: 860px; margin: 0 auto; }
    #compare h2 { font: 800 clamp(30px, 6vw, 72px)/0.95 "${DISPLAY}", sans-serif; color: #fff;
      margin: 6px auto 26px; letter-spacing: -0.01em; } #compare figure { margin: 0; }
    #compare .kicker { color: ${palette.marker}; letter-spacing: .16em; text-transform: uppercase; }
    #compare .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    #compare canvas { width: 100%; display: block; }
    #compare figcaption { margin-bottom: 12px; text-transform: uppercase; letter-spacing: .12em; }
    #compare figcaption b { display: block; margin-bottom: 6px; color: #fff; letter-spacing: 0;
      font: 800 clamp(18px, 2.4vw, 26px)/1 "${DISPLAY}"; text-transform: none; }
    @media (max-width: 640px) { #compare .pair { grid-template-columns: 1fr; } }</style>`);
  const section = Object.assign(document.createElement('section'), { id: 'compare' });
  section.innerHTML = `<p class="kicker">${t({ en: 'Same text · same design · page 2',
    es: 'El mismo texto · el mismo diseño · página 2' })}</p><h2>${t({
    en: 'Two line breakers', es: 'Dos formas de cortar' })}</h2><div class="pair"></div>`;
  for (const [name, doc] of pairs) {
    const page = doc.pages[1];
    const list = marks(doc, page); // one walk per edition: the counts and the paint share it
    const n = (...kinds) => list.filter((m) => kinds.includes(m.kind)).length;
    const counts = `${t({ en: 'loose', es: 'flojas' })} ${n('loose')} · `
      + `${t({ en: 'lone', es: 'solas' })} ${n('widow', 'orphan')} · `
      + `${t({ en: 'runts', es: 'cortas' })} ${n('runt')}`;
    const figure = document.createElement('figure');
    figure.innerHTML = `<figcaption><b>${name}</b><span>${counts}</span></figcaption>`;
    const canvas = figure.appendChild(document.createElement('canvas'));
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${name}, ${t({ en: 'page', es: 'página' })} 2: ${counts}`);
    renderPageToCanvas(page, doc, canvas, { scale: 1000 / page.width });
    paintMarks(canvas, list, 1000 / page.width);
    section.querySelector('.pair').append(figure);
  }
  document.getElementById('pages').before(section); // #pages: the desk showPages() builds
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages and the comparison paint, loaded before the build (gotcha: fonts-first).
const FONTS = { Petrona: ['400', '400i', '700', '700i'], 'Bricolage Grotesque': ['800'],
  'Source Code Pro': ['400', '500', '600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadSvg('diagram.svg', diagram());
const build = (cfg) => buildWithFonts(() => buildDocument({ markdown, resources }, cfg()),
  markdown);
const greedy = await build(control); // first: the control, for the comparison only
const doc = await build(config); // last: the published pages
showPages(doc, { title: t({ en: 'Justification lab', es: 'Laboratorio de justificación' }) });
compare([[t({ en: 'Greedy, no guards', es: 'Voraz, sin protecciones' }), greedy],
  ['Knuth–Plass', doc]]);
// The engine's own report: parse issues (a ::: left open) and layout warnings, never loose lines.
const { issues } = parseMarkdownWithIssues(markdown);
kitStatus(t({ en: `${doc.pages.length} pages · parse issues ${issues.length} · layout warnings `,
  es: `${doc.pages.length} páginas · problemas de análisis ${issues.length} · avisos ` })
  + (doc.warnings?.length ?? 0));

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
