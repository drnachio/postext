// ═══ Postext Cookbook · Nº 003 · Chapter opener on a full-bleed band ══════════════
// https://postext.dev/en/cookbook/chapter-opener-bleed-band
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Roboto Serif, Archivo, Archivo Narrow (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// Two chapters of a geology textbook. Every level-1 heading becomes a colour band bled off the
// top of the page, its number standing on the band's foot; a heading style recolours chapter 4.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'chapter-opener-bleed-band';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: semantic colours, and the style that swaps a chapter's
const palette = {
  ink: '#1b1f23', // text: a cool near-black
  band: '#c2562b', // the chapter colour: band, tab, section numbers, references, captions
  band2: '#2e6f73', // the second chapter colour, a teal; the sea in Figure 3.1
  land: '#d5cbc0', // the crust in the drawings
  muted: '#6b6259', // running heads and the colophon
  paper: '#ffffff', // type on the band
};
// col(id): a colour linked to its palette entry, with the entry's hex beside the link.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the band, so nothing prints blue.
  { id: 'main-color', name: 'band (defaults)', value: { hex: palette.band, model: 'hex' } },
];
// {style="teal"} on a heading line swaps 'band' up to the next level-1 heading: the style's
// palette reaches design slots through their link and repaints every text colour equal to
// the base 'band'.
const headingStyles = [{ id: 'teal', palette: { band: palette.band2 } }];
// #endregion

// #region answer: the opener: a bleed band, the numeral on its foot, texts from the heading
const TOP = 24; // top margin, mm: the opener's container starts here
const OUTER = 16; // outer margin, mm: the numeral and the folios line up on it
const BLEED = 0; // mm: 0 on screen; about 3 for print, which also switches on page.cutLines
const BAND = 100; // mm from the trim to the foot of the band
const NUMERAL = 168; // pt; the baseline of a design text sits 0.8 down its line box
const PT = 25.4 / 72; // mm in a point
const AIR = 12; // mm, foot to text: ≥ 0.2 × NUMERAL × PT ≈ 11.9, the numeral box below its baseline
const BEARING = 2; // mm past the text edge: a rough optical nudge, as each digit's bearing differs
const bleedTop = { to: 'bleed', edge: 'top-left' }; // the trim's corner, pushed out by BLEED
// Design text centres by default; in a heading design it wraps by default too.
const onBand = { color: col('paper'), align: 'left' };
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' }, offset: { y: mm(y) },
  size: { width: mm(width) } }); // chained: a longer title pushes the standfirst down
const opener = { enabled: true,
  // The text starts below the lowest element or minHeight (gotcha: opener-reserves-anchored).
  minHeight: mm(BAND - TOP + AIR), // clears the numeral, so the text starts AIR below the foot
  slot: {
    elements: [ // array order is paint order: the band first, the type on top
      { kind: 'box', id: 'band', style: { backgroundColor: col('band') }, placement: {
        anchor: bleedTop, size: { height: mm(BLEED + BAND) } } }, // no width: runs to the far edge
      { kind: 'rule', id: 'foot', color: col('ink'), thickness: mm(1.6), placement: {
        anchor: bleedTop, offset: { y: mm(BLEED + BAND) } } },
      { kind: 'text', id: 'numeral', content: '{chapterNumber}', ...onBand,
        fontFamily: 'Archivo', fontWeight: 800, fontSize: pt(NUMERAL),
        lineHeight: 1, // a box as tall as the type: the y below counts on it
        placement: { anchor: { to: 'page', edge: 'top-right' }, // the fore-edge of a recto
          offset: { x: mm(BEARING - OUTER), y: mm(BAND - 0.8 * NUMERAL * PT) } } }, // on the foot
      { kind: 'text', id: 'kicker', ...onBand, fontFamily: 'Archivo Narrow', fontWeight: 600,
        content: `${t({ en: 'Chapter', es: 'Capítulo' })} {chapterNumber} · {attr.topic}`,
        fontSize: pt(8.5), letterSpacing: pt(2), textTransform: 'uppercase',
        placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(7) } } },
      { kind: 'text', id: 'title', content: '{titleText}', ...onBand, // breaks at the \\
        fontFamily: 'Archivo', fontWeight: 800, fontSize: pt(34), lineHeight: 1.02,
        placement: below('kicker', 3, 118) },
      { kind: 'text', id: 'lead', content: '{attr.lead}', ...onBand, fontFamily: 'Roboto Serif',
        italic: true, fontSize: pt(10.5), lineHeight: 1.36, placement: below('title', 6, 100) },
    ],
  },
}; // hook-up: headings.levels[0] = { span: 'page', breakBefore, advancedDesign: opener }
// #endregion

// #region heads: folios and heads on body pages, a thumb tab that bleeds, drop folios
const HEAD = 15.5; // mm from the trim to the folio's and the head's baseline: 8.5 above TOP
const INSET = 9; // mm from the folio's edge to the head: room for a three-digit folio
const TAB = { y: 36, w: 9, h: 26 }; // the thumb tab, mm: its top, its width, its height
const tabSize = (w) => ({ width: mm(w), height: mm(TAB.h) });
const baseline = (size) => mm(HEAD - 0.96 * size * PT); // box: 1.2 × size, baseline 0.8 down
const label = { fontFamily: 'Archivo Narrow', fontSize: pt(7.5), fontWeight: 600,
  letterSpacing: pt(1.3), textTransform: 'uppercase', color: col('muted') };
const folio = { fontFamily: 'Archivo', fontSize: pt(9), fontWeight: 800, color: col('ink') };
const side = (parity) => { // the fore-edge is a verso's left edge and a recto's right edge
  const [edge, s] = parity === 'even' ? ['left', 1] : ['right', -1]; // s: into the page
  const at = (to, x, y, size) => ({ anchor: { to, edge: `top-${edge}` },
    offset: { x: mm(s * x), y }, ...(size && { size }) });
  return [
    { kind: 'text', id: `folio-${parity}`, content: '{pageNumber}', ...folio,
      placement: at('page', OUTER, baseline(9)) },
    // Textbooks name the chapter on the verso and the section on the recto; there is no
    // section placeholder, so the recto names the book.
    { kind: 'text', id: `head-${parity}`, content: s > 0 ? '{chapterTitle}' : '{title}',
      ...label, placement: at('page', OUTER + INSET, baseline(7.5)) },
    { kind: 'box', id: `tab-${parity}`, style: { backgroundColor: col('band') }, // off the trim
      placement: at('bleed', 0, mm(BLEED + TAB.y), tabSize(BLEED + TAB.w)) },
    { kind: 'text', id: `tab-no-${parity}`, content: '{chapterNumber}', ...folio, fontSize: pt(13),
      color: col('paper'), // design text centres by default: here, on the trimmed tab
      placement: at('page', 0, mm(TAB.y), tabSize(TAB.w)) },
  ].map((element) => ({ ...element, parity, pages: 'body' })); // never on an opener
};
const header = { elements: [...side('even'), ...side('odd')] };
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
  ...folio, color: col('band'), pages: 'opener', // centred by its anchor
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(10) } } }] };
// #endregion

const LEAD = 13.2; // body leading in pt: the baseline grid
const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation, and "Figura" in the Spanish captions
  colorPalette, headingStyles,
  page: { width: mm(210), height: mm(280), dpi: 150, // a textbook trim; 150 dpi is for the screen
    cutLines: { enabled: BLEED > 0, bleed: mm(BLEED) }, // bleed and crop marks once BLEED is set
    margins: { top: mm(TOP), bottom: mm(22), left: mm(20), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(8) },
  bodyText: { fontFamily: 'Roboto Serif', fontSize: pt(9.3), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('band'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false }, // book texture
  // #region levels: the H1 takes the page and draws the opener; sections number in the band
  headings: {
    fontFamily: 'Archivo', color: col('band'),
    levels: [
      // parity: 'odd' keeps openers on rectos, so the numeral's right-edge anchor is the
      // fore-edge. The copy is fitted so no chapter spills a few lines onto a page of its own,
      // which would leave that page and a blank verso before the next opener.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        // 0: the hidden title's default 0.5 em would add a grid line, and AIR alone sets the gap
        marginBottom: pt(0), advancedDesign: opener },
      { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), numberingTemplate: '{1}.{2}',
        marginTop: pt(LEAD), marginBottom: pt(0) }, // one grid line above, none below
    ],
  },
  // #endregion
  orderedLists: { fontFamily: 'Archivo', color: col('band'), // numbers bold by default
    marginTop: pt(0), marginBottom: pt(0) },
  captionStyle: { fontFamily: 'Archivo Narrow', fontSize: pt(8.5), labelColor: col('band'),
    gap: mm(2.2) }, // the text in bodyText's ink, the label bold in the chapter colour
  paragraphStyles: [{ id: 'colophon', fontFamily: 'Archivo Narrow', fontSize: pt(7.5),
    lineHeight: pt(10), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
    marginTop: pt(LEAD) }],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: two drawings made of shapes only; their labels live in the captions
const PX = 10; // SVG pixels per viewBox unit: 348 units = 174 mm, so about 500 dpi in print
const svg = (w, h, body) => ({ width: w * PX, height: h * PX, // the size the resource declares
  markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" height="${h * PX}" `
    + `viewBox="0 0 ${w} ${h}">${body}</svg>` });
const fill = (id, a = 1) => `fill="${palette[id]}" fill-opacity="${a}"`;
const path = (d, paint) => `<path d="${d}" ${paint}/>`;
const poly = (pts, paint) => path(`M${pts.join('L').replaceAll(',', ' ')}Z`, paint);
const dot = (x, y, r, paint) => `<circle cx="${x}" cy="${y}" r="${r}" ${paint}/>`;
const plume = (x, y, w, h, paint, m = y + h / 2, f = y + h * 0.8) => path(`M${x} ${y}`
  + `C${x} ${m} ${x + w} ${m} ${x + w} ${f}A${w} ${h / 5} 0 0 1 ${x - w} ${f}`
  + `C${x - w} ${m} ${x} ${m} ${x} ${y}Z`, paint); // a teardrop of magma, its tip at (x, y)
const arrow = (x, y, dx, id, a = 1, turn = 0, s = Math.sign(dx)) => path( // never a <marker>
  `M${x} ${y - 0.8}h${dx - s * 5}v-1.8l${s * 5} 2.6l${-s * 5} 2.6v-1.8H${x}Z`,
  `${fill(id, a)} transform="rotate(${turn} ${x} ${y})"`);

// Each drawing takes its chapter's colour: a picture's colours are fixed when it is drawn.
function plateCycle(hot) { // a plate is born at a ridge and sinks under a continent
  const top = [[0, 30], [40, 23], [80, 30], [160, 32], [212, 34], [222, 41], [254, 54],
    [300, 74], [348, 96]]; // the sea floor, then the top of the sinking slab
  const under = (d) => top.map(([x, y], i) => [x, y + (d[i] ?? d.at(-1))]);
  const back = (points) => [...points].reverse();
  const crust = under([5]);
  const lith = under([9, 4, 11, 15]);
  const quakes = [226, 239, 252, 265, 278, 291, 304, 317, 330].map((x, i) => // in the slab
    dot(x, 40 + (x - 222) * 0.44 + (i % 3), 1.5, `${fill('ink')} stroke="${palette.paper}" `
      + 'stroke-width=".6"'));
  return svg(348, 102, `<rect y="24" width="348" height="80" ${fill(hot, 0.15)}/>`
    + poly([[0, 16], [238, 16], [222, 41], ...back(top.slice(0, 5))], fill('band2', 0.3))
    + poly([...crust, ...back(lith)], fill('muted', 0.45)) // the plate
    + poly([...top, ...back(crust)], fill('ink', 0.82)) // its oceanic crust
    + poly([[222, 41], [238, 16], [262, 15], [270, 10], [277, 5], [281, 5], [288, 10],
      [296, 14], [318, 12], [327, 9], [336, 12], [348, 10], [348, 50], [300, 45], [258, 44],
      [240, 47]], fill('land')) // the continent and its volcano
    + plume(41, 23, 9, 26, fill(hot)) + plume(279, 5, 5.5, 26, fill(hot)) + quakes.join('')
    + dot(272, 51, 2.2, fill(hot)) + dot(275, 43, 1.7, fill(hot)) // melt rising
    + arrow(34, 19, -26, 'ink', 0.7) + arrow(90, 23, 70, 'ink', 0.7) // the plates part
    + arrow(60, 68, 56, hot, 0.5) + arrow(284, 74, 31, 'paper', 1, 25));
}

function twoVolcanoes(hot) { // a shield (left) and a stratovolcano (right), cut in half
  const G = 70; // the ground line
  const shield = (x, w, h) => `M${x - w} ${G}C${x - w * 0.55} ${G - 2} ${x - w * 0.35} ${G - h} `
    + `${x} ${G - h}C${x + w * 0.35} ${G - h} ${x + w * 0.55} ${G - 2} ${x + w} ${G}Z`; // convex
  const cone = (x, w, h, c = w * 0.055) => `M${x - w} ${G}C${x - w * 0.5} ${G - 3} ${x - w * 0.2} `
    + `${G - h * 0.6} ${x - c} ${G - h}H${x + c}` // concave flanks around a crater
    + `C${x + w * 0.2} ${G - h * 0.6} ${x + w * 0.5} ${G - 3} ${x + w} ${G}Z`;
  const layers = (shape, x, sizes, paints) => sizes.map(([w, h], i) => // eruption on eruption
    path(shape(x, w, h), fill('paper')) + path(shape(x, w, h), paints[i % 2])).join('');
  const ash = [[267, 10, 4], [274, 7, 5.5], [282, 8.5, 5], [289, 5.5, 5], [297, 7, 4.5],
    [304, 5, 3.5], [279, 12, 3.5], [292, 10, 3.5]].map(([x, y, r]) => dot(x, y, r, fill('land')));
  return svg(348, 92, `<rect y="${G}" width="348" height="${92 - G}" ${fill('land')}/>`
    + layers(shield, 91, [[86, 24], [70, 18], [54, 12], [38, 7]], [fill(hot, 0.3), fill(hot, 0.5)])
    + layers(cone, 269, [[74, 56], [61, 46], [48, 36], [35, 26], [22, 16]],
      [fill(hot, 0.55), fill('muted', 0.35)]) // lava, then ash
    + ash.join('') // the explosive one blows ash; the shield only pours lava
    + `<ellipse cx="91" cy="80" rx="24" ry="4.5" ${fill(hot)}/>` // a shallow magma chamber
    + `<ellipse cx="269" cy="86" rx="20" ry="5" ${fill(hot)}/>` // a deeper one
    + path(`M89.5 77V${G - 24}h3V77Z`, fill(hot)) + path(`M267.5 83V${G - 56}h3V83Z`, fill(hot)));
}
const ART = { 'plate-cycle': plateCycle('band'), 'two-volcanoes': twoVolcanoes('band2') };
const ALT = { // the drawings described, for the figures' altText
  'plate-cycle': t({ en: 'A dark plate spreads from a ridge on the left, where magma rises, runs '
    + 'under a pale sea and bends down beneath a continent topped by a volcano; a row of dots '
    + 'along the sinking slab marks earthquakes, and arrows show the plates moving apart.',
  es: 'Una placa oscura nace en una dorsal a la izquierda, donde sube el magma, corre bajo un mar '
    + 'claro y se dobla hacia abajo bajo un continente coronado por un volcán; una fila de puntos '
    + 'a lo largo de la placa que se hunde marca los terremotos, y unas flechas muestran cómo se '
    + 'separan las placas.' }),
  'two-volcanoes': t({ en: 'On the left, a low, broad volcano of thin layers over a shallow magma '
    + 'chamber; on the right, a steep cone of alternating lava and ash layers over a deeper '
    + 'chamber, with a cloud of ash above its crater.',
  es: 'A la izquierda, un volcán bajo y ancho, de capas finas, sobre una cámara magmática poco '
    + 'profunda; a la derecha, un cono empinado de capas alternas de lava y ceniza sobre una '
    + 'cámara más profunda, con una nube de ceniza sobre el cráter.' }),
};
// #endregion

// #region figure: each figure takes the first free slot after its first citation
const figure = (id, placement, caption) => ({ id, typeId: 'figure', kind: 'svg', createdAt: 0,
  updatedAt: 0, svg: { fileId: `${id}.svg`, width: ART[id].width, height: ART[id].height },
  placement, caption, altText: ALT[id] }); // altText: read aloud in a PDF or HTML edition
const resources = [
  // 'auto' may take the citing page's foot, 'top' never can (gotcha: top-float-next-page)
  figure('plate-cycle', { position: 'auto', span: 'page' },
    t({ en: 'A plate’s life in cross-section: born at a ridge (left), it cools as it drifts away '
      + 'and sinks under a continent; dots mark earthquakes.',
    es: 'La vida de una placa, en corte: nace en la dorsal (izquierda), se enfría al alejarse y '
      + 'se hunde bajo el continente; los puntos son terremotos.' })),
  figure('two-volcanoes', { position: 'bottom', span: 'page' }, // under the text on a last page
    t({ en: 'Two volcanoes in cross-section: a broad shield built of runny basalt flows (left) '
      + 'and a steep stratovolcano of lava and ash layers (right).',
    es: 'Dos volcanes en corte: un escudo ancho, de coladas de basalto fluido (izquierda), y un '
      + 'estratovolcán de capas de lava y ceniza (derecha).' })),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build
  'Roboto Serif': ['400', '400i', '700'], Archivo: ['700', '800'],
  'Archivo Narrow': ['400', '400i', '600', '700'] }; // 400i: the colophon's book title

// ─── 4 · Build & show ───────────────────────────────────────────────────────
for (const [id, art] of Object.entries(ART)) await loadSvg(`${id}.svg`, art.markup);
// #region build: chapters 3 and 4 of a longer book, so the counters start where 2 ended
const continuation = { pageNumbering: { startAt: 41 }, // an odd folio: page 1 is still a recto
  headings: { h1: 2, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }; // the next # is chapter 3
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config(),
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Chapter opener on a full-bleed band',
  es: 'Apertura de capítulo sobre banda a sangre' }) });
// #endregion

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
