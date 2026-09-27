// ═══ Postext Cookbook · Nº 043 · Facing translation, stanza by stanza ═══════════════════
// https://postext.dev/en/cookbook/bilingual-facing-verse
// Code: MIT · Text: original (CC BY 4.0) · Salt pans and flamingo: drawn in code
// Fonts: Castoro, Castoro Titling, Tenor Sans (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'bilingual-facing-verse';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#1f2430', // the text: a blue-black
  madder: '#9a3c52', // the one accent: numerals, poem titles, the other language's title
  brine: '#e7aaa2', // the pink of the crystallising ponds
  sky: '#dfe7ec', // the sky before sunrise
  dawn: '#f6dccb', // the sky at the horizon
  muted: '#6a6770', // running heads, folios, the author's name, the colophon
  paper: '#ffffff',
};
// col() writes the hex beside the id, since designs and running heads do not read the
// palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const TRIM_W = 156, TRIM_H = 234; // mm
const TOP = 22, OUTER = 18, INNER = 20; // mm: the text block is 118 mm wide
const LEAD = 14.5; // pt: the leading of the note and of every line of verse
const GAP = 8; // mm between the original and the translation: each column is 55 mm wide

// #region answer: a poem and its translation: a box with two columns and a fixed break
// Each poem is a box titled with its numeral, holding one two-column group. breaks="14"
// opens the second column at the group's 14th block, since the Spanish title and its 12
// lines come before it. A :::space is not a block, so stanza gaps leave the count alone:
//   :::callout{type="poem" title="I"}
//   :::columns{count=2 breaks="14"}
//   Spanish title, :::space{lines=0.5}, 12 lines with a :::space between stanzas
//   English title, :::space{lines=0.5}, 12 lines with a :::space between stanzas
//   :::
//   :::
// Both columns open on the same line, so matching :::space gaps keep the stanzas level.
// A box keeps together and a group never splits (gotcha: callout-columns): a poem that does
// not fit moves whole to the next page.
const poem = {
  id: 'poem',
  backgroundEnabled: false, // no fill, border or stripe
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  columnGap: mm(GAP),
  titleStyle: { fontFamily: 'Castoro Titling', fontSize: pt(22), fontWeight: 400,
    color: col('madder'), gap: pt(4) },
  // A box starts on the first grid line at least two lines down: 10.2 mm under the drawing,
  // 12.3 mm under a poem, whose box ends off the grid. The default marginBottom (0.75 em)
  // would add to marginTop and open 17.4 mm between poems.
  marginTop: pt(LEAD * 2), marginBottom: pt(0),
};
// #endregion

// #region verse: a paragraph per line, turnovers that hang, a title over each column
// Every line of verse is a paragraph of this style, set ragged so that no line is stretched.
// A line too long for its 55 mm column turns over 2 em in, where it cannot pass for the
// next line; the Spanish stanza opposite then ends with :::space{lines=2}, not :::space.
const verse = { id: 'verse', textAlign: 'left', hangingIndent: em(2) };
// Castoro Titling draws capitals only. A paragraph style's margins do not count inside a box
// (gotcha: box-paragraph-margins), so :::space{lines=0.5} sets each title off its poem.
const poemTitle = { id: 'poem-title', fontFamily: 'Castoro Titling', fontSize: pt(9.5),
  color: col('madder'), firstLineIndent: pt(0) };
// #endregion

// #region note: the author's note, justified and hyphenated in the edition's language
const LOCALE = t({ en: 'en-us', es: 'es' }); // exact codes (gotcha: hyphenation-locales)
const bodyText = {
  fontFamily: 'Castoro', fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
  italicColor: col('ink'), firstLineIndent: mm(4.5), indentAfterHeading: false,
  minWordSpacing: 0.8, maxWordSpacing: 1.35, // word spaces from 0.8 to 1.35 of normal
  // No bold on these pages: ink keeps a **bold** or a :ref added later off the default blue
  // (#295AA3). References take boldColor while referenceColor is unset.
  boldColor: col('ink'),
};
// The heading prints its title 36 mm down the text block, and the note starts under it.
const notePage = { id: 'note', advancedDesign: { enabled: true, slot: {
  elements: [{ kind: 'text', id: 'title', content: '{titleText}', align: 'left',
    fontFamily: 'Castoro Titling', fontSize: pt(13), color: col('madder'), overflow: 'wrap',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(36) } } }],
} } };
// #endregion

// #region front: the title page and the drawing over the poems, each a heading's design
const onPage = (y) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) } });
const face = (id, content, font, size, y, extra = {}) => ({ kind: 'text', id, content,
  fontFamily: font, fontSize: pt(size), color: col('ink'), align: 'center', overflow: 'wrap',
  placement: onPage(y), ...extra });
const tracked = { letterSpacing: pt(2), textTransform: 'uppercase' };
const image = (id, placement) => ({ kind: 'image', id, resourceId: id, placement });
const titlePage = {
  id: 'title-page',
  header: { elements: [] }, footer: { elements: [] }, // no running head, no folio
  advancedDesign: { enabled: true, slot: { elements: [
    face('author', '{author}', 'Tenor Sans', 9, 44, { ...tracked, color: col('muted') }),
    // A multiple of the size, never pt() (gotcha: design-lineheight-multiple).
    face('title', '{titleText}', 'Castoro Titling', 34, 58, { lineHeight: 1 }),
    face('other', '{attr.other}', 'Castoro', 16, 76, { italic: true, color: col('madder') }),
    image('flamingo', { ...onPage(96), size: { width: mm(34) } }),
    face('edition', '{attr.edition}', 'Tenor Sans', 8.5, 170, tracked),
    face('version', '{attr.version}', 'Castoro', 10.5, 176, { italic: true }),
    face('press', '{attr.press}', 'Tenor Sans', 8, 206, { ...tracked, color: col('muted') }),
  ] } },
};
const BAND = 84; // mm: the drawing of the salt pans, from the top edge of the page
const UNDER = Math.floor((BAND - TOP) / ((LEAD * 25.4) / 72)); // 12 grid lines to its foot
const poemsOpener = {
  id: 'poems', span: 'page', // span 'page': a column clips its design
  // An image reserves no height (gotcha: opener-image-no-reserve). minHeight, a whole number
  // of lines, plus the level's one-line bottom margin end the heading at the drawing's foot.
  advancedDesign: { enabled: true, minHeight: pt(LEAD * (UNDER - 1)), slot: { elements: [
    image('salina', { anchor: { to: 'page', edge: 'top-left' }, size: { width: 'fill' } }),
    face('title', '{titleText}', 'Castoro Titling', 38, 17, { lineHeight: 1 }),
    face('other', '{attr.other}', 'Castoro', 15, 33, { italic: true, color: col('madder') }),
  ] } },
};
// #endregion

// #region heads: the Spanish title over the verso, the English title over the recto
const edgeAt = (edge, x, y) => ({ anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } });
const head = (id, content, parity, placement, extra = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: 'Tenor Sans', fontSize: pt(7.5), color: col('muted'),
  ...tracked, letterSpacing: pt(1.5), placement, ...extra });
const folio = { color: col('ink'), letterSpacing: pt(0) };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', edgeAt('top-left', OUTER, 12), folio),
  head('verso-title', 'Sal de agosto', 'even', edgeAt('top-left', OUTER + 8, 12)),
  head('recto-title', 'August Salt', 'odd', edgeAt('top-right', -(OUTER + 8), 12)),
  head('recto-folio', '{pageNumber}', 'odd', edgeAt('top-right', -OUTER, 12), folio),
] };
// The note and the drawing open their pages ('opener'): a folio at the foot instead.
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', edgeAt('bottom', 0, -12),
  { ...folio, pages: 'opener' })] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LOCALE,
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(22), left: mm(INNER), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText,
  headings: {
    // The headings print designs, but their blocks carry this face: left out, the build
    // would ask for Open Sans 700, and Castoro Titling ships a 400 only.
    fontFamily: 'Castoro Titling', fontWeight: 400,
    balancing: { enabled: false }, // on, poem III drops 22.5 mm (gotcha: balancing-drops-last-box)
    levels: [ // restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break)
      { level: 1, marginBottom: pt(LEAD), breakBefore: { enabled: true, parity: 'any' } },
    ],
  },
  headingStyles: [titlePage, notePage, poemsOpener],
  calloutStyles: [poem],
  paragraphStyles: [verse, poemTitle,
    { id: 'signature', textAlign: 'right', firstLineIndent: pt(0), marginTop: pt(LEAD) },
    { id: 'colophon', fontFamily: 'Tenor Sans', fontSize: pt(7.5), lineHeight: pt(11),
      color: col('muted'), textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD * 3) },
  ],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the salt pans at sunrise, and a flamingo for the title page
let seed = 2408; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => `#${hex(palette[a]).map((v, i) => Math.round(v * (1 - k)
  + hex(palette[b])[i] * k).toString(16).padStart(2, '0')).join('')}`;
const f = (n) => n.toFixed(1);
const PX = 10; // a drawing w × h mm has a viewBox in tenths of a millimetre
const svgOf = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" `
  + `height="${h * PX}" viewBox="0 0 ${w * PX} ${h * PX}">${body}</svg>`;
const poly = (pts, fill) => `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z" `
  + `fill="${fill}"/>`;
const line = (d, stroke, w) => `<path d="${d}" fill="none" stroke="${stroke}" `
  + `stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const disk = (x, y, r, fill) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"/>`;
const mirror = (y, a, body) => `<g transform="translate(0 ${f(2 * y)}) scale(1 -1)" `
  + `opacity="${a}">${body}</g>`; // a reflection in still water

// A flamingo standing, asleep with its head on its back, or feeding with its head in the
// water; the foot at (x, y), h tall, facing right (dir 1) or left (dir -1).
function flamingo(x, y, h, dir, pose) {
  const s = h / 100;
  const P = (u, v) => `${f(x + dir * u * s)} ${f(y - v * s)}`;
  const [pink, wing, bill] = [mix('brine', 'madder', 0.3), mix('brine', 'madder', 0.62),
    mix('brine', 'paper', 0.55)];
  const out = [line(`M${P(0, 0)}L${P(1, 27)}L${P(0, 53)}`, pink, 1.4 * s)];
  out.push(pose === 'feed' ? line(`M${P(9, 0)}L${P(7, 27)}L${P(5, 53)}`, pink, 1.4 * s)
    : line(`M${P(3, 53)}L${P(12, 42)}L${P(3, 36)}`, pink, 1.3 * s)); // the other leg, tucked
  out.push(`<path d="M${P(-12, 62)}C${P(-10, 72)} ${P(16, 73)} ${P(28, 58)}C${P(16, 52)} `
    + `${P(-4, 52)} ${P(-12, 62)}Z" fill="${pink}"/>`,
  `<path d="M${P(2, 66)}C${P(12, 69)} ${P(21, 64)} ${P(28, 58)}C${P(18, 58)} ${P(9, 60)} `
    + `${P(2, 66)}Z" fill="${wing}"/>`);
  const [neck, hx, hy, turn] = { // the neck, the head, and the bill's bend in degrees
    stand: [`M${P(-9, 64)}C${P(-20, 74)} ${P(3, 81)} ${P(-2, 90)}C${P(-5, 96)} ${P(-1, 100)} `
      + `${P(4, 99)}`, 4, 98, 0],
    sleep: [`M${P(-9, 64)}C${P(-12, 76)} ${P(4, 78)} ${P(9, 71)}`, 10, 70, 20],
    feed: [`M${P(-10, 61)}C${P(-22, 60)} ${P(-23, 30)} ${P(-17, 8)}`, -17, 7, 150],
  }[pose];
  out.push(line(neck, pink, 3.6 * s), disk(x + dir * hx * s, y - hy * s, 3.8 * s, pink));
  // The bill: pale at the base, bent down halfway, black at the tip.
  const a = (turn * Math.PI) / 180;
  const B = (u, v) => P(hx + u * Math.cos(a) + v * Math.sin(a),
    hy - u * Math.sin(a) + v * Math.cos(a));
  out.push(`<path d="M${B(0, 3)}L${B(7, 2.4)}L${B(11, -1)}L${B(8, -2.6)}L${B(0, -2.4)}Z" `
    + `fill="${bill}"/>`, `<path d="M${B(7, 2.4)}L${B(11, -1)}L${B(11, -7)}L${B(8, -2.6)}Z" `
    + `fill="${palette.ink}"/>`);
  return out.join('');
}

// Sunrise over the salt pans: the sierra, the church, heaps of salt and flamingos in the
// nearest pond.
function saltPans(w, h) {
  const [W, H] = [w * PX, h * PX];
  const HZ = H * 0.6; // the horizon
  const out = [`<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${palette.sky}"/><stop offset="0.6" `
    + `stop-color="${mix('sky', 'dawn', 0.55)}"/><stop offset="1" stop-color="${palette.dawn}"/>`
    + `</linearGradient></defs>`, `<rect width="${W}" height="${f(HZ + 2)}" fill="url(#sky)"/>`,
  disk(W * 0.22, HZ - 52, 44, mix('dawn', 'brine', 0.55))]; // the sun, still behind the sierra
  for (const [lift, amp, k, from] of [[16, 46, 0.24, 0], [4, 20, 0.36, 0.45]]) {
    const pts = [[W * from, HZ + 2]];
    const ph = rand() * 6;
    for (let x = W * from; x <= W + 20; x += 20) {
      const n = 0.5 + 0.3 * Math.sin(x / 210 + ph) + 0.2 * Math.sin(x / 67 + ph * 2);
      pts.push([x, HZ - lift - amp * n * Math.min(1, (x - W * from + 60) / 300)]);
    }
    pts.push([W + 20, HZ + 2]);
    out.push(poly(pts, mix('sky', 'ink', k)));
  }
  const cx = W * 0.8; // the church of the salt pans, alone on the horizon
  out.push(poly([[cx, HZ], [cx, HZ - 30], [cx + 36, HZ - 44], [cx + 72, HZ - 30], [cx + 72, HZ]],
    palette.paper), poly([[cx + 66, HZ], [cx + 66, HZ - 70], [cx + 76, HZ - 82],
    [cx + 86, HZ - 70], [cx + 86, HZ]], palette.paper),
  disk(cx + 76, HZ - 62, 4, palette.ink), poly([[cx + 14, HZ], [cx + 14, HZ - 14],
    [cx + 22, HZ - 14], [cx + 22, HZ]], mix('sky', 'ink', 0.36)));
  out.push(`<rect y="${f(HZ)}" width="${W}" height="${f(H - HZ)}" `
    + `fill="${mix('dawn', 'ink', 0.1)}"/>`); // the dikes: bare earth between the ponds
  // Rows of ponds, deeper towards the viewer; the dikes between them run to one point.
  const rows = [HZ + 5, HZ + 16, HZ + 34, HZ + 64, HZ + 118, H + 10];
  const vx = W * 0.47;
  const at = (y, u) => vx + (u * W * 1.8 - W * 0.4 - vx) * ((y - HZ + 30) / (H - HZ + 30));
  for (let r = 0; r < rows.length - 1; r++) {
    const [y0, y1] = [rows[r] + 1 + r, rows[r + 1] - 1 - r];
    const n = [9, 7, 5, 4, 2][r];
    for (let i = 0; i < n; i++) {
      const [u0, u1] = [i / n + 0.003 * (r + 1), (i + 1) / n - 0.003 * (r + 1)];
      const pond = rand() < 0.25 && r < 4 ? mix('sky', 'brine', 0.3)
        : mix('brine', 'sky', Math.max(0, 0.5 - r * 0.12 - rand() * 0.15));
      out.push(poly([[at(y0, u0), y0], [at(y0, u1), y0], [at(y1, u1), y1], [at(y1, u0), y1]],
        pond));
    }
  }
  for (let i = 0; i < 26; i++) { // ripples on the nearest pond
    const [x, y] = [rand() * W, rows[4] + 20 + rand() * (H - rows[4] - 20)];
    const l = 20 + rand() * 50;
    out.push(line(`M${f(x)} ${f(y)}h${f(l)}`, mix('brine', 'paper', 0.45), 2));
  }
  for (const [u, sz] of [[0.09, 1], [0.16, 0.8], [0.57, 1.15], [0.66, 0.9]]) { // salt heaps
    const [x, y, hw, hh] = [W * u, rows[2] - 1, 70 * sz, 44 * sz];
    out.push(`<path d="M${f(x - hw)} ${f(y)}L${f(x - hw * 0.14)} ${f(y - hh)}Q${f(x)} `
      + `${f(y - hh * 1.08)} ${f(x + hw * 0.14)} ${f(y - hh)}L${f(x + hw)} ${f(y)}Z" `
      + `fill="${palette.paper}"/>`, poly([[x + hw * 0.1, y - hh * 0.98], [x + hw, y],
      [x + hw * 0.25, y]], mix('brine', 'paper', 0.62)));
  }
  const flock = [[0.07, 190, 1, 'stand'], [0.19, 170, 1, 'sleep'], [0.32, 180, -1, 'feed'],
    [0.64, 200, 1, 'feed'], [0.77, 175, -1, 'sleep'], [0.9, 205, -1, 'stand']];
  for (const [u, fh, dir, pose] of flock) {
    const [x, y] = [W * u + (rand() - 0.5) * 30, H - 70 - rand() * 50];
    out.push(mirror(y, 0.3, flamingo(x, y, fh, dir, pose)), flamingo(x, y, fh, dir, pose));
  }
  return svgOf(w, h, out.join(''));
}

// The title page's vignette: one flamingo among a few ripples.
function vignette(w, h) {
  const [W, H] = [w * PX, h * PX];
  const y = H * 0.62;
  const ripples = [[0.18, 0.08, 0.5], [0.52, 0.1, 0.34], [0.3, 0.2, 0.44], [0.08, 0.26, 0.3],
    [0.58, 0.24, 0.3]].map(([u, v, l]) => line(`M${f(W * u)} ${f(y + H * v * 0.9)}h${f(W * l)}`,
    mix('brine', 'paper', 0.25), 5));
  return svgOf(w, h, [...ripples, flamingo(W * 0.46, y, H * 0.58, 1, 'stand')].join(''));
}

const alt = {
  salina: t({ en: 'Salt pans at sunrise: pink ponds, white heaps of salt, a church on the '
    + 'horizon and flamingos standing over their reflections.',
  es: 'Salinas al amanecer: balsas rosas, montones de sal, una iglesia en el horizonte y '
    + 'flamencos de pie sobre su reflejo.' }),
  flamingo: t({ en: 'A flamingo standing on one leg among ripples.',
    es: 'Un flamenco sobre una pata entre las ondas del agua.' }),
};
const BAND_ART = { salina: [TRIM_W, BAND], flamingo: [34, 44] };
const art = { salina: saltPans(...BAND_ART.salina), flamingo: vignette(...BAND_ART.flamingo) };
for (const [id, svg] of Object.entries(art)) await loadSvg(`${id}.svg`, svg);
// #endregion

// Nothing cites them: the heading designs draw them.
const resources = Object.entries(BAND_ART).map(([id, [w, h]]) => ({ id, typeId: 'figure',
  kind: 'svg', createdAt: 0, updatedAt: 0, altText: alt[id],
  svg: { fileId: `${id}.svg`, width: w * PX, height: h * PX } }));

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded before the first build (gotcha: fonts-first). None of the three ships a bold.
const FONTS = { Castoro: ['400', '400i'], 'Castoro Titling': ['400'], 'Tenor Sans': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()),
  markdown);
showPages(doc, { title: t({ en: 'August Salt · five poems with a facing translation',
  es: 'Sal de agosto · cinco poemas con traducción enfrentada' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
