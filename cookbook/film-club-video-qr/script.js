// ═══ Postext Cookbook · Nº 131 · Film club programme with video QR codes ═════════
// https://postext.dev/en/cookbook/film-club-video-qr
// Code: MIT · Text and title cards: original (CC BY 4.0) · Films: Blender Foundation (CC BY)
// Fonts: Literata, Big Shoulders Display, Barlow Semi Condensed (SIL OFL) · Needs postext ≥ 1.16.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes, parseVideoUrl, videoWatchUrl,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'film-club-video-qr';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a screen-black ink, one red, and a colour for each film
const palette = {
  ink: '#1d1b20', paper: '#f6f1e7', // text and the cover band; the page
  accent: '#b8321c', gold: '#e9b44c', muted: '#6b6157', // kickers; the band's accent; credits
  orange: '#1f3d44', peach: '#3f6b35', mango: '#2c3746', spring: '#3d5a78', // the title cards
};
// A linked colour carries its hex too, so designs and defaults read the same value.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Literata', 'Big Shoulders Display', 'Barlow Semi Condensed'];
const TRIM = { w: 165, h: 235 }; // mm: a programme booklet, a little larger than A5
const [TOP, INNER, OUTER, LEAD] = [22, 18, 22, 14]; // margins in mm (a 125 mm measure); leading, pt
const CARD = { w: 1600, h: 900 }; // px: the title cards, 16:9 like the films, 325 dpi at 125 mm

// #region answer: a video resource per film, printed as its poster with a play mark and a QR code
const videoStyle = {
  // The mark sits top left and the code bottom right, so they never meet on a 70 mm poster.
  playMark: { shape: 'rounded', position: 'top-left', size: mm(8), inset: mm(4),
    color: col('paper'), background: col('accent'), backgroundOpacity: 1 },
  // https://youtu.be/<id> is 28 characters: 29 modules at level Q, and a quiet zone of 2 a side
  // makes modules of 0.61 mm on a 20 mm plate, twice what a phone camera needs.
  qr: { position: 'bottom-right', size: mm(20), inset: mm(3), errorCorrection: 'Q',
    quietZone: 2, color: col('ink'), background: col('paper'), radius: mm(1.2) },
  linkPoster: true, // the PDF draws a link over each poster
};
const film = (f) => ({
  id: f.id, typeId: 'video', kind: 'video', createdAt: 0, updatedAt: 0,
  caption: `${f.title}. ${t(f.about)}.`, altText: t(f.alt),
  note: `${f.licence} · ${f.address}`, // for a phone that does not read the code
  placement: { position: 'here' }, // set where ::resource puts it, under the opener
  video: {
    // The short address printed under the picture, expanded to the one the QR code holds.
    source: 'youtube', url: videoWatchUrl(parseVideoUrl(f.address)), // https://youtu.be/<id>
    // Any picture can be the poster: here a title card drawn below, at its pixel size.
    poster: { fileId: `${f.id}.png`, format: 'png', width: CARD.w, height: CARD.h },
  },
});
// "Film 1" instead of "Video 1.1": one count for the season, not per chapter.
const [FILM, FILMS_NAME] = [t({ en: 'Film', es: 'Película' }), t({ en: 'Films', es: 'Películas' })];
const filmType = (type) => ({ ...type, name: FILM, namePlural: FILMS_NAME, shortLabel: FILM,
  captionPrefix: FILM, numberingTemplate: '{n}', resetOn: 'never' });
// #endregion

// #region films: the four films, their YouTube addresses and what their title cards draw
const FILMS = [
  { id: 'elephants-dream', address: 'youtu.be/TLkA0RELQ1g', title: 'Elephants Dream', year: 2006,
    director: 'Bassam Kurdali', licence: 'CC BY 2.5', colour: 'orange', motif: 'gears',
    about: { en: 'Project Orange, Blender Foundation', es: 'Proyecto Orange, Blender Foundation' },
    alt: { en: 'Title card for Elephants Dream: copper gears and cables on deep teal.',
      es: 'Cartela de Elephants Dream: engranajes y cables de cobre sobre verde azulado.' } },
  { id: 'big-buck-bunny', address: 'youtu.be/aqz-KE-bpKQ', title: 'Big Buck Bunny', year: 2008,
    director: 'Sacha Goedegebure', licence: 'CC BY 3.0', colour: 'peach', motif: 'meadow',
    about: { en: 'Project Peach, Blender Institute', es: 'Proyecto Peach, Blender Institute' },
    alt: { en: 'Title card for Big Buck Bunny: a peach sun over green hills and butterflies.',
      es: 'Cartela de Big Buck Bunny: un sol melocotón sobre colinas verdes y mariposas.' } },
  { id: 'tears-of-steel', address: 'youtu.be/R6MlUcmOul8', title: 'Tears of Steel', year: 2012,
    director: 'Ian Hubert', licence: 'CC BY 3.0', colour: 'mango', motif: 'city',
    about: { en: 'Project Mango, Blender Institute', es: 'Proyecto Mango, Blender Institute' },
    alt: { en: 'Title card for Tears of Steel: a skyline with a church spire under a ringed moon.',
      es: 'Cartela de Tears of Steel: un perfil urbano con una aguja de iglesia bajo una luna.' } },
  { id: 'spring', address: 'youtu.be/WhWc3b3KhnY', title: 'Spring', year: 2019,
    director: 'Andy Goralczyk', licence: 'CC BY 4.0', colour: 'spring', motif: 'ridges',
    about: { en: 'Blender Studio', es: 'Blender Studio' },
    alt: { en: 'Title card for Spring: misty ridges, dark firs and one red light.',
      es: 'Cartela de Spring: crestas en la niebla, abetos oscuros y una luz roja.' } },
];
// #endregion

// #region furniture: the cover band, the film openers and the folios
const text = (id, content, fontFamily, size, color, placement, more = {}) => ({ kind: 'text',
  id, content, fontFamily, fontSize: pt(size), color: col(color), align: 'left',
  overflow: 'wrap', placement, ...more }); // wrap, never '…' (gotcha: overflow-ellipsis-default)
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const caps = (s) => ({ fontWeight: 600, textTransform: 'uppercase', letterSpacing: pt(s * 0.2) });
const BAND = 126; // mm: the cover's screen-black band, from the trim's top edge
const MEASURE = TRIM.w - INNER - OUTER;
const CHIP = (MEASURE - 9) / 4; // four chips in the films' colours, 3 mm apart
const coverStyle = () => ({
  id: 'cover', numbered: false, footer: { elements: [] }, // no folio on the cover
  marginBottom: pt(LEAD), // a line of paper between the band and the text
  advancedDesign: { enabled: true, minHeight: mm(BAND - TOP), slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('ink') },
      placement: { ...at('page', 'top-left', 0, 0), size: { width: 'fill', height: mm(BAND) } } },
    text('kicker', '{attr.kicker}', LABEL, 9, 'gold', at('page', 'top-left', INNER, 14), caps(9)),
    text('title', '{titleText}', DISPLAY, 88, 'paper', at('page', 'top-left', INNER - 1, 28,
      MEASURE), { fontWeight: 800, textTransform: 'uppercase', lineHeight: 0.86 }),
    text('standfirst', '{attr.standfirst}', TEXT, 13, 'paper',
      at('page', 'top-left', INNER, 85, 104), { italic: true, lineHeight: 1.3 }),
    ...FILMS.flatMap((f, i) => [
      { kind: 'box', id: `chip-${i}`, style: { backgroundColor: col(f.colour) },
        placement: { ...at('page', 'top-left', INNER + i * (CHIP + 3), 103),
          size: { width: mm(CHIP), height: mm(9) } } },
      text(`chip-label-${i}`, t({ en: `${6 + 7 * i} Nov`, es: `${6 + 7 * i} nov` }), LABEL, 8,
        'paper', at('page', 'top-left', INNER + i * (CHIP + 3) + 2.5, 105.6), caps(8)),
    ]),
    text('dates', '{attr.dates}', LABEL, 8.5, 'gold', at('page', 'top-left', INNER, 116), caps(9)),
  ] } },
});
const opener = () => ({ enabled: true, minHeight: mm(22), slot: { elements: [
  text('kicker', '{attr.kicker}', LABEL, 8.5, 'accent', at('container', 'top-left', 0, 0),
    caps(8.5)),
  text('title', '{titleText}', DISPLAY, 34, 'ink', at('#kicker', 'below', 0, 1.5, MEASURE),
    { fontWeight: 800, textTransform: 'uppercase', lineHeight: 1 }),
  text('credits', '{attr.credits}', LABEL, 9.5, 'muted', at('#title', 'below', 0, 1.5, MEASURE),
    { fontWeight: 500 }),
] } });
const foot = (id, content, parity, edge, x, more = {}) => text(id, content, LABEL, 7.5, 'muted',
  at('page', edge, x, TRIM.h - 13), { ...caps(7.5), parity, pages: 'all', ...more });
const footer = { elements: [ // folios at the outer foot, the programme's name beside them
  foot('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, { color: col('ink') }),
  foot('verso-title', '{title}', 'even', 'top-left', OUTER + 7),
  foot('recto-title', '{title}', 'odd', 'top-right', -(OUTER + 7), { align: 'right' }),
  foot('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER,
    { color: col('ink'), align: 'right' }),
] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), colorPalette, videoStyle,
  resourceTypes: defaultResourceTypes(LANG).map((ty) => (ty.id === 'video' ? filmType(ty) : ty)),
  page: { sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(24), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(9.8), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: DISPLAY, fontWeight: 700, color: col('ink'), levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, fontSize: pt(34), breakBefore: { enabled: true, parity: 'any' },
      marginBottom: pt(0), advancedDesign: opener() }, // minHeight alone sets the gap
    { level: 2, fontSize: pt(13), lineHeight: pt(LEAD), textTransform: 'uppercase',
      letterSpacing: pt(0.6), marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  headingStyles: [coverStyle()],
  captionStyle: { fontFamily: LABEL, fontSize: pt(8.5), color: col('ink'), gap: pt(5),
    labelBold: true, labelColor: col('accent'),
    note: { fontSize: pt(7.5), color: col('muted') } },
  paragraphStyles: [ // ragged and unhyphenated, so no web address breaks
    { id: 'credits', fontFamily: LABEL, fontWeight: 500, fontSize: pt(9), lineHeight: pt(12),
      color: col('ink'), boldColor: col('ink'), textAlign: 'left', hyphenation: false,
      firstLineIndent: pt(0), spaceBetween: pt(3) },
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10), color: col('muted'),
      textAlign: 'left', hyphenation: false, firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: a title card per film, drawn on a canvas with the page's own fonts
// A canvas, not an SVG: an SVG drawn as an image cannot reach the page's web fonts
// (gotcha: svg-no-webfonts). Seeded, so every run draws the same cards.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16)
  * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
const MOTIFS = {
  gears(g, rand, bg) { // a machine without end: three gears and the cables between them
    const copper = '#d98a45';
    g.lineWidth = 4;
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = `${copper}88`;
      g.beginPath();
      g.moveTo(0, 90 + rand() * 380);
      g.bezierCurveTo(300 + rand() * 300, rand() * 500, 600 + rand() * 200, 100 + rand() * 400,
        1000 + rand() * 300, 120 + rand() * 300);
      g.stroke();
    }
    for (const [x, y, r, teeth] of [[1150, 300, 215, 18], [835, 160, 112, 11], [905, 455, 88, 9]]) {
      g.beginPath();
      for (let k = 0; k <= teeth * 4; k++) {
        const a = (k / (teeth * 4)) * Math.PI * 2;
        const rr = k % 4 < 2 ? r : r * 0.84;
        g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      }
      g.fillStyle = mix(bg, '#000000', 0.25);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = copper;
      g.stroke();
      g.beginPath();
      g.arc(x, y, r * 0.3, 0, Math.PI * 2);
      g.stroke();
    }
  },
  meadow(g, rand, bg) { // a peach sun, three hills, butterflies
    g.fillStyle = '#f5b98a';
    g.beginPath();
    g.arc(1180, 250, 165, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 6; i++) { // butterflies: two pairs of wings each
      const [x, y, s] = [760 + rand() * 640, 90 + rand() * 300, 14 + rand() * 12];
      g.fillStyle = i % 2 ? '#f6f1e7' : '#e9b44c';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + side * s * 1.4, y - s);
        g.lineTo(x + side * s * 1.1, y + s * 0.7);
        g.fill();
      }
    }
    [[470, 0.15], [560, 0.35], [650, 0.55]].forEach(([base, dark], layer) => {
      g.fillStyle = mix(bg, '#000000', dark);
      g.beginPath();
      g.moveTo(0, CARD.h);
      for (let x = 0; x <= CARD.w; x += 20) {
        g.lineTo(x, base + 60 * Math.sin(x / (260 + layer * 90) + layer * 2));
      }
      g.lineTo(CARD.w, CARD.h);
      g.fill();
    });
  },
  city(g, rand, bg) { // a skyline, one church spire, a ringed moon
    g.strokeStyle = '#e9b44c';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(1240, 210, 105, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(1240, 210, 190, 34, -0.3, 0, Math.PI * 2);
    g.stroke();
    const shade = mix(bg, '#000000', 0.45);
    for (let x = 520; x < CARD.w; x += 46 + rand() * 60) {
      const [w, h] = [40 + rand() * 70, 90 + rand() * 300];
      g.fillStyle = shade;
      g.fillRect(x, 560 - h, w, CARD.h);
      g.fillStyle = '#e9b44c';
      for (let wy = 580 - h; wy < 540; wy += 26) {
        if (rand() < 0.18) g.fillRect(x + 8 + rand() * (w - 22), wy, 8, 12);
      }
    }
    g.fillStyle = shade; // the Oude Kerk's spire stands over the rest
    g.beginPath();
    g.moveTo(940, 560);
    g.lineTo(1000, 90);
    g.lineTo(1060, 560);
    g.fill();
    g.fillRect(0, 560, CARD.w, CARD.h);
  },
  ridges(g, rand, bg) { // misty ridges, dark firs and one red light
    g.fillStyle = mix(bg, '#f6f1e7', 0.55);
    g.beginPath();
    g.arc(1260, 170, 85, 0, Math.PI * 2);
    g.fill();
    [[300, 0.35], [400, 0.15], [500, -0.15], [600, -0.4]].forEach(([base, k]) => {
      g.fillStyle = k > 0 ? mix(bg, '#f6f1e7', k) : mix(bg, '#000000', -k);
      g.beginPath();
      g.moveTo(0, CARD.h);
      for (let x = 0; x <= CARD.w; x += 80) g.lineTo(x, base - rand() * 110);
      g.lineTo(CARD.w, CARD.h);
      g.fill();
    });
    g.fillStyle = mix(bg, '#000000', 0.6);
    for (let i = 0; i < 9; i++) {
      const [x, h] = [760 + i * 70 + rand() * 30, 130 + rand() * 120];
      g.beginPath();
      g.moveTo(x - h * 0.22, 640);
      g.lineTo(x, 640 - h);
      g.lineTo(x + h * 0.22, 640);
      g.fill();
    }
    g.fillStyle = '#e0452c';
    g.beginPath();
    g.arc(640, 500, 11, 0, Math.PI * 2);
    g.fill();
  },
};
async function titleCard(f) {
  const canvas = Object.assign(document.createElement('canvas'), { width: CARD.w, height: CARD.h });
  const g = canvas.getContext('2d');
  const bg = palette[f.colour];
  g.fillStyle = bg;
  g.fillRect(0, 0, CARD.w, CARD.h);
  MOTIFS[f.motif](g, mulberry32(f.year), bg);
  // Lower left, clear of the play mark (top left) and the QR plate (bottom right).
  g.fillStyle = '#e9b44c';
  g.font = `600 34px "${LABEL}"`;
  g.letterSpacing = '7px';
  g.fillText(`${t({ en: 'Blender open movie', es: 'Película abierta de Blender' })} · ${f.year}`
    .toUpperCase(), 96, 612);
  g.letterSpacing = '0px';
  g.fillStyle = '#f6f1e7';
  let size = 154;
  do g.font = `800 ${size -= 4}px "${DISPLAY}"`;
  while (g.measureText(f.title.toUpperCase()).width > 1080);
  g.fillText(f.title.toUpperCase(), 92, 760);
  g.font = `500 40px "${LABEL}"`;
  g.fillText(`${t({ en: 'Directed by', es: 'Dirigida por' })} ${f.director}`, 96, 826);
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
  await loadImage(`${f.id}.png`, URL.createObjectURL(blob)); // the canvas and the PDF
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages and the cards use (gotcha: fonts-first)
  Literata: ['400', '400i'], // the programme notes, the cover's standfirst
  'Big Shoulders Display': ['700', '800'], // titles, on the pages and the cards
  'Barlow Semi Condensed': ['500', '600', '700'], // kickers, credits, captions, folios
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
for (const f of FILMS) await titleCard(f); // after the fonts: the cards set type too
const resources = FILMS.map(film);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Film club programme', es: 'Programa de cineclub' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
