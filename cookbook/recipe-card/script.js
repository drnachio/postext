// ═══ Postext Cookbook · Nº 033 · Recipe card: ingredients beside the method ═══════
// https://postext.dev/en/cookbook/recipe-card
// Code: MIT · Text: original (CC BY 4.0) · Photos: diffusion models · Pictograms: CC BY 4.0
// Fonts: Young Serif, Figtree, Caveat (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'recipe-card';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#2b2118', muted: '#76634e', // text; folios and the colophon
  paper: '#f7eddb', card: '#fffdf8', // the cream page; the white recipe card on it
  tomato: '#bf3d29', olive: '#6b7a3a', tint: '#f6e3c1' }; // numbers and tab; dashes; tags
// Each colour names its palette entry and carries its hex.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the tomato, so nothing prints blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.tomato })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, HAND] = ['Figtree', 'Young Serif', 'Caveat'];
const PAGE = { w: 190, h: 250, top: 22, inner: 18, outer: 16 }; // mm, mirrored margins
const [BODY, LEAD] = [9.4, 12.8]; // pt: the text of the cards and the notes under them

// #region answer: a white card with a servings tab, two columns inside it
// In the Markdown, :::callout{type="card" label="SERVES 4"} holds a :::columns{count=2} group
// of two nested boxes, :::callout{type="column" title="Ingredients"} and one for the method.
// The group levels its columns by cutting between blocks or lines, so loose lists would run
// the method on under the ingredients. A nested box is one block that never splits, so the
// only cut left is between the two.
const TAB = 5.6; // mm: the tab's height, and how far it rises above the card
const card = { id: 'card', background: col('card'),
  padding: { top: mm(4.5), right: mm(6), bottom: mm(5), left: mm(6) },
  // No space of its own above: the tab starts on the first grid line under the opener.
  columnGap: mm(7), marginTop: mm(0),
  // label="…" on the fence prints here: a tab on the top-right corner, a cutlery pictogram
  // beside it and a rule from the far corner that makes the tab part of the card.
  label: { fontFamily: TEXT, fontSize: pt(8), color: col('card'), // bold by default
    background: col('tomato'), height: mm(TAB), offset: mm(TAB), paddingX: mm(2.6),
    icon: { resourceId: 'cutlery', width: mm(TAB * 6 / 8), gap: mm(1.6) }, // as tall as the tab
    rule: { enabled: true, color: col('tomato'), width: pt(1.2) } } };
// The two columns: frameless boxes whose only device is a tracked title.
const NONE = { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) };
const column = { id: 'column', backgroundEnabled: false, padding: NONE,
  lists: { gap: mm(2.2), itemSpacing: pt(3.5) }, // for the steps as well as the dashes
  titleStyle: { fontFamily: TEXT, fontSize: pt(8), color: col('tomato'), // bold by default
    textTransform: 'uppercase', letterSpacing: pt(1.5), gap: mm(2.4) } };
// config() plugs them in: calloutStyles: [card, column, prep].
// #endregion

// #region prep: a checklist under a header with a strip of three pictograms
// :::callout{type="prep" title="Before you start"}, closed at once, is a header: a box that
// holds only its title and icon. The icon is one picture of three drawings; a width KIT times
// its size makes its box a strip, and the picture is fitted into width × size, left of the
// title. Tasks set inside the box would start after that column, 21 mm in, so the '- [ ]'
// items follow the box, where they print the default task box, '☐'.
const [STRIP, KIT] = [5, 30 / 8]; // mm: the strip's height; the drawing's width over height
const prep = { id: 'prep', backgroundEnabled: false, padding: NONE,
  marginTop: pt(LEAD), marginBottom: column.titleStyle.gap, // the tasks follow at this gap
  icon: { kind: 'resource', resourceId: 'kit', size: mm(STRIP), width: mm(STRIP * KIT),
    align: 'center' }, // the title centred on the strip
  titleStyle: { ...column.titleStyle, color: col('olive') } };
// #endregion

// #region steps: big step numbers in the display face, an olive full stop after each
// Young Serif has old-style figures: 1 and 2 stand 0.56 em, a little above its 0.50 em
// x-height, so 5.1 mm at STEP. A list number is centred 0.3 em (of the text) above the item's
// first baseline, with the canvas 'middle' baseline, which Chrome puts 0.24 em above Young
// Serif's own (gotcha: list-number-centred). DROP centres the figures on the step's first two
// lines, from the cap height of the first to the baseline of the second.
const [STEP, FIGURE, MIDDLE, CAP] = [26, 0.56, 0.24, 0.7]; // pt; em of each face
const DROP = (LEAD - CAP * BODY) / 2 + 0.3 * BODY + (FIGURE / 2 - MIDDLE) * STEP; // pt
const orderedLists = { fontFamily: DISPLAY, fontWeight: 400, // Young Serif ships 400 only
  numberFontSize: pt(STEP), color: col('tomato'),
  separatorColor: col('olive'), separatorGap: pt(0.6), // the default '.' as its own run
  numberVerticalOffset: pt(DROP) };
// #endregion

// #region chips: tags for diet and occasion, as pills in the text
const chipStyles = [{ id: 'tag', fontSize: em(0.86), bold: true, background: col('tint'),
  borderWidth: pt(0), borderRadius: em(1), // no outline; a radius past half the height: a pill
  paddingX: em(0.7), paddingY: em(0.18), gap: em(0.3) }];
// #endregion

// #region opener: the photograph bled across the head, the title and pills set on it
const BAND = 104; // mm: the photo's foot; the pills sit 13 mm above it, the lead 6 mm below
const NOTE = { x: 18, y: 24, w: 70 }; // mm on the page: the box ends 2 mm before the arrow
const at = (x, y, size) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: mm(x), y: mm(y - PAGE.top) }, size }); // y in mm from the top of the page
const text = (id, content, family, size, placement, extra) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col('ink'), align: 'left',
  overflow: 'wrap', placement, ...extra }); // a foot wraps too, where the default is '…'
const tracked = { fontWeight: 700, textTransform: 'uppercase', letterSpacing: pt(1.6) };
// Pills are text boxes chained right-of each other; each prints one heading attribute.
const pill = (id, after) => text(id, `{attr.${id}}`, TEXT, 8.4, after ? { anchor:
  { to: `#${after}`, edge: 'right-of' }, offset: { x: mm(1.8) } } : at(0, BAND - 13), {
  fontWeight: 600, box: { backgroundColor: col('card'), borderRadius: mm(3),
    padding: { top: mm(1.1), right: mm(2.8), bottom: mm(1.1), left: mm(2.8) } } });
// One heading style for every recipe; each heading names its photo: art="tortilla".
const opener = { id: 'receta', advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'art', resourceId: '{attr.art}', // filled in per heading, like a text
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: mm(PAGE.w), height: mm(BAND) } } },
    { kind: 'image', id: 'arrow', resourceId: 'arrow', // the note's arrow, over the photo
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: mm(PAGE.w), height: mm(BAND) } } },
    text('note', '{attr.note}', HAND, 19, { anchor: { to: 'page', edge: 'top-left' },
      offset: { x: mm(NOTE.x), y: mm(NOTE.y) }, size: { width: mm(NOTE.w) } },
    { fontWeight: 600, align: 'right' }), // on the page, like the arrow and the photo
    pill('time'), pill('level', 'time'), pill('season', 'level'),
    text('title', '{titleText}', DISPLAY, 42, { anchor: { to: '#time', edge: 'above' },
      offset: { y: mm(-3.2) }, size: { width: mm(96) } }, // two lines: the \\ in the heading
    { lineHeight: 1 }), // set solid: 42 pt from line to line
    text('kicker', '{attr.kicker}', TEXT, 8.2, { anchor: { to: '#title', edge: 'above' },
      offset: { y: mm(-2.4) }, size: { width: mm(96) } }, tracked),
    // The lead is the design's lowest element: the opener reserves down to its last line, and
    // the card starts under it without a minHeight.
    text('lead', '{attr.lead}', TEXT, 10.5, at(0, BAND + 6, { width: mm(122) }),
      { italic: true, lineHeight: 1.45 }),
  ] } } };
// #endregion

// Folios at the foot of the outer corner: the book on versos, the recipe on rectos.
const foot = (id, content, parity, edge, x, look) => text(id, content, TEXT, 7.6,
  { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-12) } },
  { color: col('muted'), parity, align: edge.endsWith('left') ? 'left' : 'right', ...look });
const folio = { fontFamily: DISPLAY, fontSize: pt(10), color: col('tomato') };
const footer = { elements: [
  foot('verso-folio', '{pageNumber}', 'even', 'bottom-left', PAGE.outer, folio),
  foot('verso-book', '{title}', 'even', 'bottom-left', PAGE.outer + 9, tracked),
  foot('recto-dish', '{chapterTitle}', 'odd', 'bottom-right', -(PAGE.outer + 9), tracked),
  foot('recto-folio', '{pageNumber}', 'odd', 'bottom-right', -PAGE.outer, folio),
] };

const config = () => ({
  colorPalette, chipStyles, orderedLists, footer, header: { elements: [] },
  page: { width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(PAGE.top), bottom: mm(20), left: mm(PAGE.inner),
      right: mm(PAGE.outer), mirror: true } }, // left is the inner margin
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: mm(0) }, // ragged and flush: the notes under the cards
  // A designed heading's own text is hidden but still measured: in Young Serif 400, the only
  // weight it ships, not in the default Open Sans 700 that FONTS does not load.
  headings: { fontFamily: DISPLAY, fontWeight: 400, levels: [
    // 'any': each recipe opens the next page, whichever side it is on.
    { level: 1, breakBefore: { enabled: true, parity: 'any' } },
  ] },
  headingStyles: [opener],
  // Olive dashes for the whole document: an olive lists.color on the column style would turn
  // the step numbers olive too (gotcha: box-list-colour-numbers).
  unorderedLists: { bulletChar: '–', color: col('olive'),
    marginTop: mm(0), // under the checklist's header, the header's marginBottom alone
    marginBottom: pt(LEAD / 2) }, // half a line above the tags
  calloutStyles: [card, column, prep],
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7.4), lineHeight: pt(10),
    color: col('muted'), marginTop: pt(LEAD) }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the note's arrow and the pictograms, drawn in the palette's colours
// The dishes are photographs, JPEGs in assets/ cut to the band's 190 × 104 mm. The arrow from
// the handwritten note to the dish and the line pictograms stay vector; the note itself is a
// design element set in Caveat.
const n = (v) => +v.toFixed(2);
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" `
  + `fill="${fill}"${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stroke = (d, color, width, extra = '') => path(d, 'none', ` stroke="${color}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}`);
const group = (x, y, turn, body) => `<g transform="translate(${n(x)} ${n(y)}) `
  + `rotate(${n(turn)})">${body}</g>`;
// A hand-drawn line and its head, as paths, never a <marker>, in a box as large as the photo:
// it runs from the end of the note, over the plate's rim, to the edge of the dish.
const arrow = svgDoc(PAGE.w, BAND, stroke('M90 29C97 26 102 28 106 33', palette.ink, 0.55)
  + group(106, 33, 62, stroke('M-2.4-1.3L0 0-2.4 1.5', palette.ink, 0.55)));
const cutlery = svgDoc(6, 8, stroke('M1.6 .6V7.4M.6 .6V2.6C.6 3.4 2.6 3.4 2.6 2.6V.6',
  palette.tomato, 0.55) + stroke('M4.6 7.4V.6C5.8 1.4 5.8 3.6 4.6 4.4', palette.tomato, 0.55));
// The kit in line drawings: a bowl with two eggs, the frying pan and the plate that turns the
// tortilla over, in a box KIT times as wide as it is tall.
const egg = (x, turn) => `<ellipse cx="${x}" cy="2.5" rx="1.05" ry="1.35" `
  + `transform="rotate(${turn} ${x} 2.5)" fill="none" stroke="${palette.olive}" `
  + 'stroke-width=".6"/>';
const kit = svgDoc(8 * KIT, 8, egg(3, -12) + egg(5, 14)
  + stroke('M.6 3.9H7.4M1 3.9C1 6.4 2.4 7.4 4 7.4S7 6.4 7 3.9', palette.olive, 0.7)
  + stroke('M9.8 4.4H16.8M10.2 4.4L10.8 6.7C10.9 7.1 11.2 7.3 11.6 7.3H15C15.4 7.3 15.7 7.1 '
    + '15.8 6.7L16.4 4.4', palette.olive, 0.7) + stroke('M16.8 5L20.2 4.1', palette.olive, 1.1)
  + circle(26.2, 4.2, 3.3, 'none', ` stroke="${palette.olive}" stroke-width=".7"`)
  + circle(26.2, 4.2, 2, 'none', ` stroke="${palette.olive}" stroke-width=".5"`));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses. Layout measures with the browser's fonts, so the
// kit loads them from Fontsource before the first build.
const FONTS = { Figtree: ['400', '400i', '600', '700'], 'Young Serif': ['400'], Caveat: ['600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region pictures: the photos and the pictograms are resources, cited by id, never by :ref
// The opener's image elements and both icons name a resource id; the resource names the file
// the canvas paints (loadImage or loadSvg registers it). No :ref cites them, so none is numbered.
const photo = (id, altText) => ({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  altText, bitmap: { fileId: `${id}-1520.jpg`, format: 'jpeg', width: 1520, height: 832 } });
const ART = { // markup, width and height in mm, and the alt text
  arrow: [arrow, PAGE.w, BAND, t({ en: 'An arrow to the dish', es: 'Una flecha al plato' })],
  cutlery: [cutlery, 6, 8, t({ en: 'Fork and knife', es: 'Tenedor y cuchillo' })],
  kit: [kit, 8 * KIT, 8, t({ en: 'A bowl with two eggs, a frying pan and a plate',
    es: 'Un bol con dos huevos, una sartén y un plato' })] };
const resources = [
  photo('tortilla', t({ en: 'A potato omelette with a slice pulled out, on a blue-rimmed plate '
    + 'and a red-checked napkin', es: 'Una tortilla de patatas con una porción separada, en un '
    + 'plato de borde azul sobre una servilleta de cuadros rojos' })),
  photo('gazpacho', t({ en: 'A bowl of gazpacho with diced vegetables and a spoon, on a '
    + 'blue-checked napkin beside a tomato', es: 'Un cuenco de gazpacho con dados de verdura '
    + 'y una cuchara, sobre una servilleta de cuadros azules junto a un tomate' })),
  ...Object.entries(ART).map(([id, [, w, h, altText]]) => ({ id, typeId: 'figure',
    kind: 'svg', createdAt: 0, updatedAt: 0, altText, svg: { fileId: `${id}.svg`, width: w * 10,
      height: h * 10 } })), // 10 px a millimetre: the sizes only set the aspect ratio here
];
const photos = resources.filter((r) => r.kind === 'bitmap').map((r) => r.bitmap.fileId);
await Promise.all([...photos.map((file) => loadImage(file, asset(file))),
  ...Object.entries(ART).map(([id, [svg]]) => loadSvg(`${id}.svg`, svg))]);
// #endregion
// The excerpt is pages 58 and 59 of the book: 57 pages come before it, so the tortilla opens
// on a verso and the two recipes face each other.
const doc = await buildDocumentWithFonts({ markdown, resources,
  continuation: { pageIndexOffset: 57, pageNumbering: { startAt: 58 } } }, config(),
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Recipe card', es: 'Tarjeta de receta' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
