// ═══ Postext Cookbook · Nº 008 · A family of textbook boxes ═══════════════════════
// https://postext.dev/en/cookbook/textbook-box-family
// Code: MIT · Text: original (CC BY 4.0) · Drawings and icons: generated in code (CC BY 4.0)
// Fonts: Noto Serif, Lexend, Barlow Semi Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage,
  defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'textbook-box-family';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: three hues for six kinds of box; everything links to an entry
const palette = { ink: '#1f2430', paper: '#ffffff', // text; type on stripes and tabs
  band: '#ab2e78', tintBand: '#fae3ef', // the chapter's magenta: opener, objectives, self-check
  tip: '#25734a', tintTip: '#e2f0e7', // study tips and lab work
  warn: '#e39422', tintWarn: '#fcefd8', warnInk: '#94540a', // frame and badge; tint; its type
  mist: '#e8e3f0', rule: '#dccfd8', muted: '#675e66' }; // feature box; lines in drawings; heads
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the band, so nothing prints blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.band })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
// Label face (box text and titles, tabs, captions, heads); leading in pt; outer margin in mm
const LABEL = 'Barlow Semi Condensed', LEAD = 13.4, OUTER = 16, GAP = 1.5; // GAP: title gap, mm

// #region base: what every box shares; each kind brings its colour and its one device
const box = (id, hue, device) => ({ id, marginTop: pt(LEAD), marginBottom: pt(LEAD / 2),
  padding: { top: mm(2.8), right: mm(3.4), bottom: mm(3.2), left: mm(3.4) },
  titleStyle: { fontFamily: LABEL, fontSize: pt(8.5), color: col(hue), // bold by default
    textTransform: 'uppercase', letterSpacing: pt(1.4), gap: mm(GAP) },
  body: { fontFamily: LABEL, fontSize: pt(9.6), lineHeight: pt(12.6), color: col('ink'),
    boldColor: col(hue), textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true },
  lists: { color: col(hue), gap: mm(2.2), itemSpacing: pt(2.4) }, // bullets and numbers
  ...device }); // the kind's title, fill and device: its spread wins over the base
// An SVG or bitmap resource, fitted into a square of that size (width × size with `width`).
const icon = (id, size, more) => ({ kind: 'resource', resourceId: id, size: mm(size), ...more });
// #endregion

// #region answer: three devices: an icon on a wide stripe, a numbered tab, an outer badge
// box(id, hue, device) is the shared base: the hue colours the title, bullets and key terms.
const TAB = 5, BADGE = 7.4; // in mm: the tab's height (and offset), the warning badge's size
const calloutStyles = [
  // The first style is also the one a missing or misspelt type falls back to.
  box('objectives', 'band', { title: t({ en: 'In this chapter', es: 'En este capítulo' }),
    background: col('tintBand'), stripe: { enabled: true, width: mm(7.5), color: col('band') },
    icon: icon('target', 5) }), // on a side stripe (left by default) the icon is centred on it
  box('feature', 'band', { background: col('mist'),
    titleStyle: { fontFamily: 'Lexend', fontSize: pt(10.5), color: col('ink'), gap: mm(1.6) },
    // Printed only where the fence has label="…": the tab, the flask beside it, a rule to them.
    label: { fontFamily: LABEL, fontSize: pt(8), color: col('paper'), background: col('ink'),
      position: 'top-left', // this verso's outer corner, above the badge ('top-right' by default)
      height: mm(TAB), offset: mm(TAB), paddingX: mm(2.3), // offset = height: on the top edge
      icon: { resourceId: 'flask', width: mm(4.4), gap: mm(1.2) },
      rule: { enabled: true, color: col('ink'), width: pt(1.2) } } }),
  box('warning', 'warnInk', { background: col('tintWarn'), borderRadius: mm(1.4),
    border: { enabled: true, color: col('warn'), width: pt(0.75) },
    // The badge hangs half past the outer corner: sides of half badge + GAP align the title.
    padding: { top: mm(2.8), right: mm(BADGE / 2 + GAP), bottom: mm(3.2),
      left: mm(BADGE / 2 + GAP) },
    icon: icon('caution', BADGE, { position: 'corner', cornerSide: 'outer' }) }),
]; // straight into config(), followed by the 'more' styles
// #endregion

// #region more: a badge threaded on a thin rule, a strip of pictograms, a marker outside
const BULB = 6.4; // the study tip's badge in mm: the text clears it
const moreStyles = [
  box('tip', 'tip', { title: t({ en: 'Study tip', es: 'Para recordar' }),
    backgroundEnabled: false, stripe: { enabled: true, width: pt(2.5), color: col('tip') },
    // A stripe narrower than its icon: the badge sits on it at the top and hides it there.
    padding: { top: mm(0.6), right: mm(0), bottom: mm(0.6), left: mm(BULB / 2 + 2) },
    icon: icon('bulb', BULB) }),
  box('safety', 'tip', { background: col('tintTip'), marginTop: pt(4), // under its heading
    icon: icon('safety', 7, { width: mm(24.5), align: 'center' }) }), // 3 pictograms, 1 image
  box('check', 'band', { background: col('tintBand'),
    // Outside the frame: [marker][rule][gap][box], the rule as tall as the box.
    marker: { kind: 'resource', resourceId: 'check', size: mm(7), align: 'top', gap: mm(3),
      rule: { enabled: true, color: col('band'), width: pt(0.75) } } }),
];
// #endregion

// #region opener: a cell cut by the corner of the page, the chapter number inside it
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement,
  overflow: 'wrap', align: 'left', ...extra }); // gotcha: overflow-ellipsis-default
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { y: mm(y) }, size: { width: mm(width) } });
const chapter = t({ en: 'Chapter {chapterNumber}', es: 'Capítulo {chapterNumber}' });
const opener = { enabled: true, minHeight: mm(66), slot: { elements: [
  { kind: 'image', id: 'cell', resourceId: 'cell', placement: { anchor: { to: 'page',
    edge: 'top-right' }, offset: { x: mm(58), y: mm(-71) }, size: { width: mm(150) } } },
  text('numeral', '{chapterNumber}', 'Lexend', 118, 'paper', { anchor: { to: 'page',
    edge: 'top-right' }, offset: { x: mm(-OUTER), y: mm(14) } },
    { fontWeight: 800, lineHeight: 1, align: 'right' }),
  text('kicker', `${chapter} · {attr.unit}`, LABEL, 9, 'band', { anchor: { to: 'container',
    edge: 'top-left' }, offset: { y: mm(3) } },
    { fontWeight: 700, letterSpacing: pt(1.8), textTransform: 'uppercase' }),
  text('title', '{titleText}', 'Lexend', 34, 'ink', below('kicker', 2.5, 112),
    { fontWeight: 700, lineHeight: 1.04 }),
  text('lead', '{attr.lead}', 'Noto Serif', 10.5, 'ink', below('title', 5, 98),
    { italic: true, lineHeight: 1.42 }),
] } };
// #endregion

// Heads 12.8 mm below the trim (the larger folio 0.4 mm higher), titles 8.5 mm in from folios.
const head = (id, content, parity, edge, x, extra, y = 12.8) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: LABEL, fontSize: pt(7.8), fontWeight: 600,
  letterSpacing: pt(1.3), textTransform: 'uppercase', color: col('muted'), ...extra,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } } });
const folio = { fontFamily: 'Lexend', fontSize: pt(9), fontWeight: 700, color: col('band') };
const header = { elements: [ // folios on the fore-edge, never on the opener
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio, 12.4),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8.5),
  head('recto-title', `${chapter} · {chapterTitle}`, 'odd', 'top-right', -(OUTER + 8.5)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio, 12.4),
] }; // the opener's folio drops to the foot:
const footer = { elements: [{ ...head('drop', '{pageNumber}', 'all', 'bottom', 0, folio, -12),
  pages: 'opener' }] };

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // exact codes only (gotcha: hyphenation-locales)
  resourceTypes: defaultResourceTypes(LANG), // "Figura" (gotcha: resource-types-locale)
  colorPalette, header, footer,
  page: { width: mm(210), height: mm(280), dpi: 150, margins: { top: mm(24), bottom: mm(22),
    left: mm(20), right: mm(OUTER), mirror: true } }, // left is the inner margin
  layout: { layoutType: 'double', gutterWidth: mm(8) },
  bodyText: { fontFamily: 'Noto Serif', fontSize: pt(9.4), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('band'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false }, // hyphens: default
  headings: { fontFamily: 'Lexend', color: col('band'), levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
    { level: 2, fontSize: pt(12.5), lineHeight: pt(LEAD), numberingTemplate: '{1}.{2}',
      marginTop: pt(LEAD * 1.4), marginBottom: pt(LEAD * 0.6) }, // 3 lines, close to its text
    { level: 3, fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('tip'),
      marginTop: pt(LEAD), marginBottom: pt(0) }, // a line clear of the text, on its box
  ] },
  // In 1.4.1 a box's lists.color reaches its numbers only if it differs from these bullets'.
  unorderedLists: { color: col('ink'), marginTop: pt(0), marginBottom: pt(0) },
  orderedLists: { fontFamily: 'Lexend', color: col('tip'), marginTop: pt(0), marginBottom: pt(0) },
  calloutStyles: [...calloutStyles, ...moreStyles],
  captionStyle: { fontFamily: LABEL, fontSize: pt(8.8), color: col('ink'),
    labelColor: col('band'), gap: mm(1.8) },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7.6), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region icons: icons are resources too: declared with the content, registered by file id
const svgResource = (id, width, height, extra) => ({ id, typeId: 'figure', kind: 'svg',
  svg: { fileId: `${id}.svg`, width, height }, createdAt: 0, updatedAt: 0, ...extra });
const pageTop = { position: 'top', span: 'page' }; // a 'top' float opens the page after its :ref
const resources = [
  // Uncited, so never placed as figures: the box styles and the opener use them by id.
  ...['target', 'bulb', 'caution', 'check'].map((id) => svgResource(id, 240, 240)),
  svgResource('flask', 200, 240), svgResource('safety', 760, 240), svgResource('cell', 2000, 2000),
  svgResource('mosaic', 3480, 1240, { placement: pageTop, caption: t({
    en: 'The fluid mosaic: magenta phospholipids, green proteins, an amber carrier with its '
      + 'glucose, grey cholesterol, amber sugars.', // one line: the page is wide
    es: 'El mosaico fluido: fosfolípidos magenta, proteínas verdes, transportadora ámbar con su '
      + 'glucosa, colesterol gris, azúcares ámbar.' }),
    altText: t({ en: 'A cell membrane in section', es: 'Una membrana celular en sección' }) }),
  svgResource('fusion', 1800, 500, { placement: { position: 'here' }, caption: t({
    en: 'Mouse proteins in green, human proteins in magenta (the red dye): the two cells, the '
      + 'hybrid just after fusion and the same hybrid 40 minutes later.',
    es: 'En verde, las proteínas de ratón; en magenta, las humanas (el colorante rojo): las dos '
      + 'células, el híbrido recién fusionado y el mismo híbrido 40 minutos después.' }),
    altText: t({ en: 'Two cells fusing into a hybrid', es: 'Dos células que se fusionan' }) }),
  svgResource('osmosis', 3480, 860, { placement: pageTop, caption: t({
    en: 'Red blood cells in a hypertonic, an isotonic and a hypotonic solution. Arrows show the '
      + 'net flow of water.',
    es: 'Glóbulos rojos en una disolución hipertónica, una isotónica y una hipotónica. Las flechas '
      + 'indican el flujo neto de agua.' }),
    altText: t({ en: 'Blood cells in three solutions', es: 'Glóbulos rojos en tres medios' }) }),
];
// #endregion

// #region art: the icons and the drawings, in the palette's colours (seeded)
// No words in them: an SVG drawn as an image cannot use web fonts (gotcha: svg-no-webfonts).
function rng(seed) { // Mulberry32: the same drawing on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const n = (v) => +v.toFixed(2);
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const dot = (x, y, r, fill, extra = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" `
  + `fill="${fill}"${extra}/>`;
const line = (d, stroke, width, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const shape = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const capsule = (x, y, w, h, fill, turn = 0, extra = '') => `<rect x="${n(x - w / 2)}" `
  + `y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(Math.min(w, h) / 2)}" `
  + `fill="${fill}" transform="rotate(${n(turn)} ${n(x)} ${n(y)})"${extra}/>`;
const arrow = (x, y, len, turn, fill) => shape(`M${x} ${y - 0.9}h${len - 4}v-1.9l4 2.8-4 2.8`
  + `v-1.9H${x}Z`, fill, ` transform="rotate(${turn} ${x} ${y})"`); // a path, never a marker

function target() { // white rings on the magenta stripe
  return svg(24, 24, `<g fill="none" stroke="${palette.paper}" stroke-width="2.3">`
    + `<circle cx="12" cy="12" r="9.8"/><circle cx="12" cy="12" r="5.3"/></g>`
    + dot(12, 12, 1.9, palette.paper));
}
function bulb() {
  return svg(24, 24, dot(12, 12, 12, palette.tip) + shape('M12 4.4a5.6 5.6 0 0 0-3.3 10.1c.7.5 1 '
    + '1.1 1 1.9v.6h4.6v-.6c0-.8.3-1.4 1-1.9A5.6 5.6 0 0 0 12 4.4Z', palette.paper)
    + capsule(12, 18.6, 4.6, 1.3, palette.paper) + capsule(12, 20.3, 3, 1.2, palette.paper));
}
function flask() {
  const body = 'M8 2v7L2.4 19.4A2.1 2.1 0 0 0 4.3 22.5h11.4a2.1 2.1 0 0 0 1.9-3.1L12 9V2';
  return svg(20, 24, shape(`${body}Z`, palette.paper) + shape('M5.3 14h9.4l3 5.4a1.1 1.1 0 0 1-1 '
    + '1.6H3.3a1.1 1.1 0 0 1-1-1.6Z', palette.band) + dot(8.6, 17.4, 1.1, palette.paper)
    + dot(11.8, 18.7, 0.8, palette.paper) + line(body, palette.ink, 1.7)
    + line('M6.4 2h7.2', palette.ink, 1.7));
}
function caution() { // ink on amber: white on amber would fail contrast
  return svg(24, 24, dot(12, 12, 11, palette.warn, ` stroke="${palette.paper}" stroke-width="2"`)
    + capsule(12, 10, 2.8, 9.2, palette.ink) + dot(12, 17.6, 1.7, palette.ink));
}
function check() { // a ticked tile: square where the study tip's badge is round
  return svg(24, 24, `<rect width="24" height="24" rx="5.5" fill="${palette.band}"/>`
    + line('M6.3 12.6l3.8 3.8 7.6-8', palette.paper, 2.9));
}
function safety() { // goggles, a glove and a blade: three mandatory-action discs
  const goggles = `<g fill="none" stroke="${palette.paper}" stroke-width="1.5">`
    + '<rect x="4.3" y="9" width="6.6" height="5.6" rx="2.4"/>'
    + '<rect x="13.1" y="9" width="6.6" height="5.6" rx="2.4"/></g>'
    + line('M10.9 11.4q1.1-1 2.2 0M2.6 11.6h1.7M19.7 11.6h1.7', palette.paper, 1.4);
  const glove = shape('M32.4 20.5v-6.6l-2.3-2.7a1.2 1.2 0 0 1 1.8-1.6l1.4 1.5V6.2a1.1 1.1 0 0 1 '
    + '2.2 0v5.2V4.9a1.1 1.1 0 0 1 2.2 0v6.5V5.5a1.1 1.1 0 0 1 2.2 0v6.2V7a1.1 1.1 0 0 1 2.2 0v8.6'
    + 'l-1.2 4.9Z', palette.paper);
  const blade = `<g transform="rotate(-45 64 12)">${capsule(64, 16.3, 3.6, 9, palette.paper)}`
    + shape('M62.2 11.4V6.3L64 3.2l1.8 3.1v5.1Z', palette.paper) + '</g>';
  return svg(76, 24, [12, 38, 64].map((x) => dot(x, 12, 11.4, palette.ink)).join('')
    + goggles + glove + blade);
}
function blob(cx, cy, rx, ry, r, fill, extra = '', square = 2.6) { // a soft, uneven shape
  const pts = Array.from({ length: 16 }, (_, i) => {
    const [c, sn] = [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)];
    const k = 1 + (r() - 0.5) * 0.12;
    const f = (v) => Math.sign(v) * Math.abs(v) ** (2 / square); // squarer than an ellipse
    return [cx + f(c) * rx * k, cy + f(sn) * ry * k];
  });
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2].map(n);
  const d = pts.map((p, i) => `Q${p.map(n)} ${mid(p, pts[(i + 1) % 16])}`).join('');
  return shape(`M${mid(pts[15], pts[0])}${d}Z`, fill, extra);
}
const shine = (cx, cy, rx, ry, r) => blob(cx - rx * 0.28, cy - ry * 0.34, rx * 0.46, ry * 0.4,
  r, palette.paper, ' fill-opacity=".22"');
const pale = ` stroke="${palette.tip}" stroke-width="1.6"`; // a light green protein, outlined
const sugars = (x, y, r, count = 5) => { // a chain of sugars, branched once
  const sugar = (sx, sy) => dot(sx, sy, 2.1, palette.warn,
    ` stroke="${palette.paper}" stroke-width=".7"`);
  let out = '';
  for (let k = 0; k < count; k++, y -= 4.3, x += (r() - 0.5) * 4) {
    out += sugar(x, y) + (k === 2 ? sugar(x + 4.3, y - 1.6) : '');
  }
  return out;
};
function cell() { // a cell drawn as a disc of bilayer: mostly its lower-left quarter shows
  let out = dot(100, 100, 71, palette.band);
  for (let a = 0; a < 360; a += 3.05) {
    const [c, s] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
    const at = (d) => [100 + c * d, 100 + s * d];
    const tail = (d0, d1) => line(`M${at(d0).map(n)}L${at(d1).map(n)}`, palette.rule, 0.8);
    out += tail(90.5, 84.8) + tail(75.8, 81.2) + dot(...at(92.6), 2.6, palette.band)
      + dot(...at(73.6), 2.5, palette.paper);
  }
  [106, 133, 157, 184].forEach((a, k) => { // proteins across the visible arc
    const rad = (a * Math.PI) / 180;
    const fill = k % 2 ? palette.warn : palette.tip;
    out += capsule(100 + Math.cos(rad) * 83, 100 + Math.sin(rad) * 83, 26, 7, fill, a);
  });
  return svg(200, 200, out);
}
function mosaic() { // the membrane in section, 174 × 62 mm; the outside of the cell on top
  const r = rng(5);
  const W = 348;
  const yc = (x) => 70 + 3.4 * Math.sin(x / 44);
  const proteins = [[56, 34, palette.tip, 'channel'], [148, 38, palette.warn, 'carrier'],
    [234, 27, palette.tip], [306, 32, palette.tintTip, 'pale']];
  const clear = (x) => proteins.every(([px, w]) => Math.abs(x - px) > w / 2 + 1.8);
  let out = `<rect width="${W}" height="70" fill="${palette.tintBand}"/>`
    + `<rect y="70" width="${W}" height="54" fill="${palette.mist}"/>`;
  for (let x = 4; x < W; x += 5.9) { // phospholipids: heads out, two tails in
    if (!clear(x)) continue;
    for (const s of [-1, 1]) {
      const y = yc(x) + s * 13;
      for (const dx of [-1, 1]) {
        out += line(`M${n(x + dx)} ${n(y - s * 2.4)}l${n(r() - 0.5)} ${-s * 4}`
          + `l${n(r() - 0.5)} ${-s * 4.6}`, palette.band, 0.75, ' stroke-opacity=".4"');
      }
      out += dot(x, y, 2.75, palette.band);
      if (r() < 0.13 && clear(x + 3)) { // cholesterol among the tails: the only grey rods
        out += capsule(x + 3, y - s * 7.4, 2.1, 7.2, palette.ink, 0, ' fill-opacity=".62"');
      }
    }
  }
  out += sugars(196, yc(196) - 16.5, r, 3); // a glycolipid
  for (const [px, w, fill, kind] of proteins) { // proteins across the bilayer
    const y = yc(px);
    const halves = kind === 'channel' ? [px - w / 4 - 1.3, px + w / 4 + 1.3] : [px];
    for (const x of halves) {
      const rx = kind === 'channel' ? w / 4 : w / 2;
      out += blob(x, y, rx, 21, r, fill, kind === 'pale' ? pale : '') + shine(x, y, rx, 21, r);
    }
    if (kind === 'channel') {
      out += dot(px, y - 7, 2, palette.warnInk) + dot(px, y + 4, 2, palette.warnInk);
    }
    if (kind === 'carrier') { // a glucose held in the carrier's open mouth
      out += shape(`M${px - 7} ${y - 24}L${px} ${y - 12}L${px + 7} ${y - 24}Z`, palette.tintBand)
        + shape(`M${px - 3.6} ${y - 19.5}l1.8-3.1h3.6l1.8 3.1-1.8 3.1h-3.6Z`, palette.paper,
          ` stroke="${palette.ink}" stroke-width=".8"`);
    } else out += sugars(px + (r() - 0.5) * 5, y - 22.5, r);
  }
  out += blob(100, yc(100) + 22.5, 11, 5.5, r, palette.tintTip, pale) // proteins on one face only
    + blob(270, yc(270) - 22, 8.5, 5, r, palette.tip);
  for (let x = 6; x < W; x += 3.2) { // the cytoskeleton under the membrane
    out += dot(x, 111 + 2.2 * Math.sin(x / 7), 1.4, palette.muted, ' fill-opacity=".45"');
  }
  for (let k = 0; k < 9; k++) { // oxygen outside the cell
    const [x, y] = [14 + r() * 320, 8 + r() * 26];
    for (const dx of [0, 2.6]) out += dot(x + dx, y, 1.5, palette.ink, ' fill-opacity=".5"');
  }
  return svg(W, 124, out);
}
function fusion() { // two cells, the hybrid just after fusion, the hybrid 40 minutes later
  const r = rng(3);
  const cellAt = (cx, rx, fill, nuclei, pick) => {
    let out = `<ellipse cx="${cx}" cy="25" rx="${rx}" ry="${Math.min(rx, 15)}" fill="${fill}" `
      + `stroke="${palette.ink}" stroke-width=".8"/>`
      + nuclei.map((x) => dot(x, 25, 4.2, palette.rule)).join('');
    for (let a = 0; a < 360; a += 12) {
      const rad = (a * Math.PI) / 180;
      out += dot(cx + Math.cos(rad) * rx, 25 + Math.sin(rad) * Math.min(rx, 15), 1.7,
        pick(Math.cos(rad), r()));
    }
    return out;
  };
  return svg(180, 50, cellAt(16, 13, palette.tintTip, [16], () => palette.tip)
    + cellAt(45, 13, palette.tintBand, [45], () => palette.band)
    + arrow(65, 25, 12, 0, palette.muted)
    + cellAt(104, 22, palette.paper, [96, 112], (c) => (c < 0 ? palette.tip : palette.band))
    + arrow(132, 25, 12, 0, palette.muted)
    + cellAt(163, 15.5, palette.paper, [158, 168], (c, k) => (k < 0.5 ? palette.tip
      : palette.band)));
}
function osmosis() { // three solutions: water leaves, stays even, floods in
  const r = rng(9);
  const panel = (x, solutes, body, flow) => {
    let out = `<rect x="${x}" width="108" height="86" rx="4" fill="${palette.mist}"/>`;
    for (let k = 0; k < solutes; k++) {
      const [px, py] = [x + 5 + r() * 98, 5 + r() * 76];
      if (Math.hypot(px - x - 54, py - 43) > 30) out += dot(px, py, 1.5, palette.muted);
    }
    for (let k = 0; k < 6; k++) { // arrows: the net flow of water, out (+1) or in (-1)
      const rad = (k * Math.PI) / 3 + 0.5;
      if (flow === 0 && k % 3) continue;
      const d = flow < 0 || (flow === 0 && k) ? 40 : 27;
      out += arrow(x + 54 + Math.cos(rad) * d, 43 + Math.sin(rad) * d, 10,
        (rad * 180) / Math.PI + (d > 30 ? 180 : 0), palette.tip);
    }
    return out + body;
  };
  const at = (k, d) => [54 + Math.cos((k * Math.PI) / 11) * d, 43 + Math.sin((k * Math.PI) / 11)
    * d].map(n);
  const crenated = `M${at(0, 13)}${Array.from({ length: 22 }, (_, k) => (k % 2 ? ''
    : `Q${at(k + 1, 19)} ${at(k + 2, 13)}`)).join('')}Z`; // bumps: control points outside
  const disc = (x, rr) => dot(x + 54, 43, rr, palette.band)
    + dot(x + 54, 43, rr * 0.45, palette.tintBand);
  return svg(348, 86, panel(0, 70, shape(crenated, palette.band), 1)
    + panel(120, 34, disc(120, 17), 0) + panel(240, 8, disc(240, 23), -1));
}
const drawings = { target, bulb, flask, caution, safety, check, cell, mosaic, fusion, osmosis };
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Noto Serif': ['400', '400i', '700'], Lexend: ['700', '800'], // text, display,
  'Barlow Semi Condensed': ['400', '600', '700'] }; // labels

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all([prepareFonts(markdown, config(), kitFonts(FONTS)),
  ...Object.entries(drawings).map(([id, draw]) => loadSvg(`${id}.svg`, draw()))]);
// Folio 27 is odd like page 1, always a recto: parity follows the page (gotcha: parity-page1-recto)
const continuation = { pageNumbering: { startAt: 27 },
  headings: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }; // the next # is chapter 2
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config(),
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Living Matter, chapter 2', es: 'Materia viva, capítulo 2' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
