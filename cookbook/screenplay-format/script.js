// ═══ Postext Cookbook · Nº 061 · Screenplay format ═══════════════════════════════
// https://postext.dev/en/cookbook/screenplay-format
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Courier Prime, Oswald (SIL OFL 1.1), Special Elite (Apache 2.0) · Needs postext ≥ 1.25.0
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'screenplay-format';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // black type on white bond, and a card cover in goldenrod
  ink: '#1b1b1b', // every line of the script
  paper: '#ffffff',
  hole: '#e3e1db', // the punched holes down the left edge of each script page
  card: '#e6b84a', // the cover stock
  cardDark: '#b98a2a', // the label's shadow and the rims of the punched holes
  cardInk: '#4a3510', // the small print on the cover (6.3:1 on the card)
  brass: '#a8812f', // the brads
  brassLight: '#e9cf82', // the glint on each brad
  stamp: '#8f231c', // the draft stamp (4.7:1 on the card)
};
// The hex as well as the id: design slots read only the hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to main-color: pointed at the ink, anything left unset prints black.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ink })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const TEXT = 'Courier Prime';
const IN = 25.4; // mm in an inch: the format is specified in inches
const LEAD = 12; // pt: 12-point Courier at six lines to the inch, so one line is one grid line
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region page: US Letter, a 1.5-inch binding margin, Courier 12 on 12, ragged right
const MARGIN = { top: 1, bottom: 1, left: 1.5, right: 1 }; // inches: the left one takes the brads
const page = { sizePreset: 'custom', width: mm(8.5 * IN), height: mm(11 * IN), dpi: 150,
  margins: { top: mm(MARGIN.top * IN), bottom: mm(MARGIN.bottom * IN),
    left: mm(MARGIN.left * IN), right: mm(MARGIN.right * IN) } };
const bodyText = { fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(LEAD), color: col('ink'),
  textAlign: 'left', firstLineIndent: pt(0), // action: flush left, never justified
  paragraphSpacing: true, // a blank line between paragraphs
  // No :ref in this script, but one added later prints in ink, not the default link blue:
  // main-color does not reach this key (gotcha: palette-skips-designs).
  referenceColor: col('ink') };
// #endregion

// #region answer: a speech is a callout with no frame, padded to the 3.5-inch dialogue block
// Positions from the left edge of the sheet, in inches, as screenwriting software gives them.
const DIALOGUE = { left: 2.5, right: 6 }; // the block of speech, 3.5 inches wide
const CUE = 3.7; // the character's name
const TEXT_RIGHT = 8.5 - MARGIN.right; // 7.5: where action lines end
const CUE_LINE = 1.2 * 12; // pt: a callout title sits on a line 1.2 times its size
const dialogue = {
  id: 'dialogue',
  backgroundEnabled: false, // no fill and no border: the box is only a measure
  padding: { top: pt(LEAD - CUE_LINE), bottom: pt(0), // −2.4 pt: see the title below
    left: mm((DIALOGUE.left - MARGIN.left) * IN), // 1 inch in from the action
    right: mm((TEXT_RIGHT - DIALOGUE.right) * IN) }, // 1.5 inches short of it
  // The fence's title is the cue: title="Dora (cont’d)" prints DORA (CONT’D) at 3.7 inches,
  // in the headings' Courier, with no gap under it (the default is half a line). Its 14.4-pt
  // line starts 2.4 pt above the box, so a speech is a whole number of 12-pt lines and the
  // name sits 0.48 pt above its grid line.
  titleStyle: { fontWeight: 400, textTransform: 'uppercase',
    indent: mm((CUE - DIALOGUE.left) * IN), gap: pt(0) },
  body: { paragraphSpacing: false }, // no blank line before a parenthetical mid-speech
  marginTop: pt(LEAD), marginBottom: pt(LEAD), // one blank line above and below
  // Snapped to the grid, a box keeps its bottom margin and the next speech adds its top
  // margin: two blank lines between speeches. Unsnapped, the two margins collapse into one.
  snapToGrid: false,
};
// #endregion

// #region styles: parentheticals start at 3.1 inches; transitions end at the right margin
const PAREN = 3.1;
const paragraphStyles = [
  { id: 'paren', firstLineIndent: mm((PAREN - DIALOGUE.left) * IN) }, // inside a speech
  { id: 'transition', textAlign: 'right' }, // CUT TO:, flush with the action's right edge
];
// #endregion

// #region slugline: each scene heading carries its number in both margins
// Each number sits in a box half an inch wide, text aligned left, so that 9, 12 and an
// inserted 12A start at the same place on both sides.
const NUMBER_W = 0.5; // inches
const number = (id, edge, x) => ({ kind: 'text', id, content: '{number}', fontFamily: TEXT,
  fontSize: pt(12), fontWeight: 700, lineHeight: 1, color: col('ink'), align: 'left',
  placement: { ...at('container', edge, x * IN), size: { width: mm(NUMBER_W * IN) } } });
// The heading's own text is not painted but still measured: at the level's default 15 pt,
// scene 1's heading would wrap and reserve a second line.
const slugline = { level: 2, fontSize: pt(12), lineHeight: pt(LEAD),
  marginTop: pt(2 * LEAD), marginBottom: pt(LEAD), // two blank lines above, one below
  numberingTemplate: '{2}', // the scene count, which {number} prints
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'text', id: 'heading', content: '{titleText}', fontFamily: TEXT, fontSize: pt(12),
      fontWeight: 700, lineHeight: 1, color: col('ink'), align: 'left', overflow: 'wrap',
      placement: { ...at('container', 'top-left'), size: { width: 'fill' } } },
    number('left', 'top-left', -0.6), // starts at 0.9 inches from the edge of the sheet
    number('right', 'top-right', 0.25 + NUMBER_W), // starts a quarter inch past the text
  ] } } };
const headings = {
  // The family of the speech titles, and the one the headings' unpainted text is measured
  // in (left unset, a sixth face, Open Sans Bold, would be loaded for nothing).
  fontFamily: TEXT,
  // Script pages end where the last whole speech or paragraph ends. Balancing would add
  // blank lines above sluglines to fill them, and push a closing speech to the foot
  // (gotcha: balancing-drops-last-box).
  balancing: { enabled: false },
  levels: [
    // Any headings object drops the H1 page break (gotcha: headings-drop-h1-break).
    { level: 1, breakBefore: { enabled: true, parity: 'any' } },
    slugline,
  ] };
// #endregion

// #region furniture: the script's pages are punched, and numbered from page 2 on
// Three holes down the bound edge, 4.25 inches apart, as a three-hole punch leaves them.
const HOLES = [1.25, 5.5, 9.75].map((y) => y * IN); // mm: hole centres from the top
const EDGE = 0.375 * IN; // mm: from the bound edge to the centre of each hole
const HOLE = 7; // mm across
const punched = HOLES.map((y, i) => ({ kind: 'box', id: `punch${i}`,
  style: { backgroundColor: col('hole'), borderRadius: mm(HOLE / 2) },
  placement: { ...at('page', 'top-left', EDGE - HOLE / 2, y - HOLE / 2),
    size: { width: mm(HOLE), height: mm(HOLE) } } }));
// The script's first page opens with its title, an H1 that breaks the page, so the page is
// an 'opener' and pages: 'body' leaves it unnumbered, as the format asks.
const folio = { kind: 'text', id: 'folio', content: '{pageNumber}.', pages: 'body',
  fontFamily: TEXT, fontSize: pt(12), color: col('ink'), align: 'right',
  placement: at('page', 'top-right', -MARGIN.right * IN, 0.5 * IN) };
// The title's style carries the header of its section: the pages from the title to the end.
const title = { id: 'script', header: { elements: [...punched, folio] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: TEXT, fontSize: pt(12),
      lineHeight: 1, textTransform: 'uppercase', color: col('ink'), align: 'center',
      placement: { ...at('container', 'top'), size: { width: 'fill' } } },
  ] } }, // H1's own line, 1.2 × 18 pt, would reserve 21.6 pt and drop FADE IN: 9.6 pt
  lineHeight: pt(LEAD), marginBottom: pt(LEAD) };
// #endregion

// #region art: the card covers: a three-hole punch, brass brads, a typed label, two stamps
const [W, H] = [8.5 * IN, 11 * IN]; // mm: the sheet
const PT = 25.4 / 72; // mm in a point
const box = (id, x, y, w, h, style) => ({ kind: 'box', id, style,
  placement: { ...at('page', 'top-left', x, y), size: { width: mm(w), height: mm(h) } } });
const circle = (id, cx, cy, d, style) => box(id, cx - d / 2, cy - d / 2, d, d,
  { ...style, borderRadius: mm(d / 2) });
const line = (id, content, x, y, w, style) => ({ kind: 'text', id, content, lineHeight: 1,
  ...style, placement: { ...at('page', 'top-left', x, y), size: { width: mm(w) } } });
const card = box('card', 0, 0, W, H, { backgroundColor: col('card') });
// Outside, a brass head in the top and bottom holes; the middle hole stays empty, as on
// studio scripts, and shows the white page under the cover.
const heads = HOLES.flatMap((y, i) => (i === 1
  ? [circle('hole', EDGE, y, HOLE, { backgroundColor: col('paper'),
    borderColor: col('cardDark'), borderWidth: pt(1) })]
  : [circle(`shade${i}`, EDGE + 0.5, y + 0.7, 11.5, { backgroundColor: col('cardDark') }),
    circle(`head${i}`, EDGE, y, 11, { backgroundColor: col('brass') }),
    circle(`glint${i}`, EDGE - 1.8, y - 1.8, 3.6, { backgroundColor: col('brassLight') })]));
// Inside, the holes are at the right edge, with the prongs of two brads through them.
const prongs = HOLES.flatMap((y, i) => [
  circle(`hole${i}`, W - EDGE, y, HOLE, { backgroundColor: col('cardInk') }),
  ...(i === 1 ? [] : [box(`prong${i}`, W - EDGE - 1.1, y - 4.2, 2.2, 8.4,
    { backgroundColor: col('brassLight'), borderRadius: mm(1.1) })]),
]);
const stamp = (id, x, y, w, h) => [
  box(id, x, y, w, h,
    { borderColor: col('stamp'), borderWidth: pt(1.8), borderRadius: mm(1.5) }),
  box(`${id}-rim`, x + 1.4, y + 1.4, w - 2.8, h - 2.8,
    { borderColor: col('stamp'), borderWidth: pt(0.6), borderRadius: mm(1) }),
];
const typed = (size) => ({ fontFamily: TEXT, fontSize: pt(size), color: col('ink') });
// Tracked capitals, centred. 1.4.1 centres a tracked line with the tracking after its last
// letter, half a unit left of the middle: the box moves right by that half.
const caps = (id, content, x, y, w, size, track, color) => line(id, content,
  x + (track * PT) / 2, y, w, { align: 'center', fontFamily: 'Oswald', fontWeight: 500,
    fontSize: pt(size), letterSpacing: pt(track), textTransform: 'uppercase', color: col(color) });
const small = { fontFamily: TEXT, fontSize: pt(7.5), color: col('cardInk'), align: 'left' };
const LABEL = { w: 120, h: 64, y: 78 }; // mm: a white label, centred across the sheet
const LABEL_X = (W - LABEL.w) / 2;
const DRAFT = { w: 56, h: 20 }; // mm: under the label, flush with its right edge
[DRAFT.x, DRAFT.y] = [LABEL_X + LABEL.w - DRAFT.w, LABEL.y + LABEL.h + 9];
const center = { align: 'center' };
// span: 'page' on both: kept in the column, the card is clipped an inch from the top and foot.
const cover = { id: 'cover', span: 'page',
  advancedDesign: { enabled: true, slot: { elements: [
    card, ...heads,
    box('shadow', LABEL_X + 1.2, LABEL.y + 1.4, LABEL.w, LABEL.h,
      { backgroundColor: col('cardDark'), borderRadius: mm(2) }),
    box('label', LABEL_X, LABEL.y, LABEL.w, LABEL.h,
      { backgroundColor: col('paper'), borderRadius: mm(2) }),
    line('name', '{titleText}', LABEL_X, LABEL.y + 15, LABEL.w, { ...center,
      fontFamily: 'Special Elite', fontSize: pt(32), textTransform: 'uppercase',
      color: col('ink') }),
    line('credit', '{attr.credit}', LABEL_X, LABEL.y + 37, LABEL.w, { ...center, ...typed(12) }),
    line('author', '{author}', LABEL_X, LABEL.y + 44, LABEL.w, { ...center, ...typed(12) }),
    ...stamp('draft-box', DRAFT.x, DRAFT.y, DRAFT.w, DRAFT.h),
    caps('draft', '{attr.draft}', DRAFT.x, DRAFT.y + 3.6, DRAFT.w, 15, 2.2, 'stamp'),
    caps('date', '{attr.date}', DRAFT.x, DRAFT.y + 12.4, DRAFT.w, 8.5, 1.6, 'stamp'),
    caps('company', '{attr.company}', 0, 250, W, 10, 3, 'cardInk'),
  ] } } };
const COPY = { w: 64, h: 24, x: IN, y: IN + 28 }; // mm: the copy number, under the notice
const flyleaf = { id: 'flyleaf', span: 'page', // the inside of the cover, facing script page 1
  advancedDesign: { enabled: true, slot: { elements: [
    card, ...prongs,
    line('notice', '{attr.notice}', IN, IN, 120, { ...typed(10), lineHeight: 1.3,
      color: col('cardInk'), align: 'left', overflow: 'wrap' }),
    ...stamp('copy-box', COPY.x, COPY.y, COPY.w, COPY.h),
    caps('copy', '{attr.copy}', COPY.x, COPY.y + 6.2, COPY.w, 26, 3.5, 'stamp'),
    line('colophon', '{attr.colophon}', IN, 250, 150, small),
    line('fonts', '{attr.fonts}', IN, 254.5, 150, small),
  ] } } };
// #endregion

const config = () => ({
  colorPalette,
  page,
  layout: { layoutType: 'single' },
  bodyText,
  headings,
  headingStyles: [cover, flyleaf, title],
  paragraphStyles,
  calloutStyles: [dialogue],
  // Empty slots: by default the header prints the section's title at the top of each cover
  // and the footer a page number at the foot of every page.
  header: { elements: [] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Courier Prime': ['400', '700'], // the script, the typed label and the colophon
  'Special Elite': ['400'], // the title typed on the label
  Oswald: ['500'], // the stamps and the company
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Lost Property · a short film',
  es: 'Objetos perdidos · un cortometraje' }) });

// @kit
