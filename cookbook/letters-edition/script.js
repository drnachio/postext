// ═══ Postext Cookbook · Nº 064 · Letters edition: datelines and signatures ════════════
// https://postext.dev/en/cookbook/letters-edition
// Code: MIT · Text: Frederick II and Voltaire, 1740 and 1778 (PD) · Cover photo: diffusion models
// Fonts: Crimson Pro, IM Fell French Canon, IM Fell DW Pica SC (SIL OFL) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'letters-edition';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: iron-gall ink on cream paper, wax red, green morocco and gilt
const palette = {
  ink: '#2a2320', // the text: a warm near-black
  paper: '#f6efe2', // the page, and the lettering on the cover
  seal: '#9c2b24', // the letter numbers
  leather: '#2a4536', // the cover: a green morocco binding
  gilt: '#d0b67c', // its tooled border and the names on it
  muted: '#75695d', // the running heads
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's default colours, the italic of the headnote among them, link to 'main-color';
  // here it is the ink, not the default blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const TRIM = { width: 140, height: 210 }; // the French 14 × 21 format
const LEAD = 14.4; // pt: the body's leading, the grid every letter starts on
const LINES = 33; // lines of text on a full page
const TOP = 22; // mm: the top margin
const MARGIN = { top: TOP, inner: 17.5, outer: 14.5, // mm, mirrored
  bottom: TRIM.height - TOP - (LINES * LEAD * 25.4) / 72 }; // ends the page on line 33
const sc = { fontFamily: 'IM Fell DW Pica SC' }; // its lower case is cut as small capitals
const fell = { fontFamily: 'IM Fell French Canon', italic: true }; // the display italic
const crimson = { fontFamily: 'Crimson Pro' }; // the text face
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: a letter head read from the heading, and styles for the letter's parts
// Each letter is a level-1 heading that carries its place and date as attributes:
//   # Frédéric à Voltaire {place="À Charlottembourg" date="6 juin 1740"}
// (a value holds no { or }, and one with " goes in single quotes: gotcha attr-values)
const letterHead = { enabled: true, slot: { elements: [
  // {number} prints numberingTemplate '{1:I}' (gotcha: heading-number-placeholders).
  { kind: 'text', id: 'number', content: 'Lettre {number}', ...sc, fontSize: pt(9),
    letterSpacing: pt(1.8), color: col('seal'), placement: at('container', 'top-left') },
  { kind: 'text', id: 'title', content: '{titleText}', ...fell, fontSize: pt(15),
    color: col('ink'),
    placement: at('#number', 'below', 0, 1) },
  // The dateline spans the measure under the title and sets its words flush right.
  { kind: 'text', id: 'dateline', content: '{attr.place}, le {attr.date}.', ...crimson,
    italic: true, fontSize: pt(10.4), color: col('ink'), align: 'right',
    placement: { ...at('#title', 'below', 0, 1.5), size: { width: 'fill' } } },
] } };
// The salutation, the signature and the postscript, each a :::paragraphs{style="…"} container:
//   :::paragraphs{style="signature"}
//   Fédéric.
//   :::
const letterParts = [
  { id: 'vedette', firstLineIndent: pt(0) }, // 'Sire,' on a line of its own, flush left
  { id: 'signature', ...sc, fontSize: pt(10.5), textAlign: 'right', marginTop: pt(LEAD / 2) },
  { id: 'postscript', fontSize: pt(9), lineHeight: pt(12.6), marginTop: pt(LEAD / 2) },
];
// Hooked up below: letterHead designs the level-1 heading, letterParts joins paragraphStyles.
// #endregion

// #region letters: numbered I, II, III and run on, two grid lines apart
const letters = { level: 1, numberingTemplate: '{1:I}', advancedDesign: letterHead,
  // Written out: 1.4.1 drops the H1 page break for any headings object (gotcha:
  // headings-drop-h1-break), and a fixed engine would put each letter on a recto.
  breakBefore: { enabled: false }, marginTop: pt(2 * LEAD),
  // The hidden heading line is measured in the heading face: italic keeps it the IM Fell cut
  // that FONTS loads. Upright, it would need the roman, which FONTS
  // leaves out; the layout would change only for a title long enough to wrap.
  italic: true };
// #endregion

// #region running-heads: the correspondents on the verso, the date of the letter on the recto
const HEAD_Y = 12; // mm from the top edge
const head = (id, content, parity, placement, look = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', ...sc, fontSize: pt(8.5), letterSpacing: pt(0.9), color: col('muted'),
  placement, ...look });
const folio = { ...crimson, fontSize: pt(9), letterSpacing: pt(0), color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', at('page', 'top-left', MARGIN.outer, HEAD_Y), folio),
  head('verso-names', '{author}', 'even', at('page', 'top-left', MARGIN.outer + 8, HEAD_Y)),
  // {attr.date} reads the last letter that starts on or before the page.
  head('recto-date', '{attr.date}', 'odd', at('page', 'top-right', -(MARGIN.outer + 8), HEAD_Y),
    { ...crimson, italic: true, fontSize: pt(9.5), letterSpacing: pt(0) }),
  head('recto-folio', '{pageNumber}', 'odd', at('page', 'top-right', -MARGIN.outer, HEAD_Y),
    folio),
] };
// #endregion

// #region cover: page 1 is a heading style with the art and the title; :::pagebreak ends it
// The Markdown: # Mon sort \\ est changé {style="cover"}, then :::pagebreak, or the headnote
// and the first letter start on the cover (gotcha: cover-pagebreak).
const onCover = (y) => at('page', 'top', 0, y); // centred, y mm below the top edge
const LETTERS = { x: 12, y: 72, w: 116, h: 120 }; // mm: the photograph, inside the fillet
// numbered: false keeps the cover out of the count, so the first letter is I.
const cover = { id: 'cover', numbered: false,
  // span: 'page' although the book has one column. Kept in the column, the design is clipped
  // to the column's top and bottom (paper above and below the leather, no names) and its title
  // loses the \\ break; page 1 would also count as a 'body' page and print the running heads.
  span: 'page', advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'binding', resourceId: 'binding',
      placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: 'fill' } } },
    { kind: 'image', id: 'letters', resourceId: 'letters', placement: { ...at('page', 'top-left',
      LETTERS.x, LETTERS.y), size: { width: mm(LETTERS.w), height: mm(LETTERS.h) } } },
    { kind: 'text', id: 'names', content: '{author}', ...sc, fontSize: pt(9.5),
      letterSpacing: pt(2), color: col('gilt'), placement: onCover(18) },
    // \\ in the heading breaks the title here; lineHeight is a multiple (gotcha:
    // design-lineheight-multiple), and 'wrap' keeps the ellipsis off (overflow-ellipsis-default).
    { kind: 'text', id: 'title', content: '{titleText}', ...fell, fontSize: pt(50),
      lineHeight: 1, color: col('paper'), align: 'center', overflow: 'wrap',
      placement: onCover(24) },
    { kind: 'text', id: 'subtitle', content: '{subtitle}', ...crimson, italic: true,
      fontSize: pt(12), color: col('paper'), placement: onCover(62) },
  ] } } };
// #endregion

// #region text: Crimson Pro at 10/14.4 pt, set in French
// Justification, hyphenation, whole-paragraph line breaking and the widow, orphan and runt
// rules are defaults; locale 'fr' (in the config) picks the French patterns.
// The letters keep the transcription's unspaced ; : ? and !, because a narrow no-break
// space is a place to break the line in 1.4.1 (gotcha: nbsp-breaks).
const bodyText = { fontFamily: 'Crimson Pro', fontSize: pt(10), lineHeight: pt(LEAD),
  color: col('ink'), firstLineIndent: mm(5),
  // No :ref here, but 1.4.1 leaves this one blue whatever main-color says (gotcha:
  // palette-skips-designs), and the default-skin check reads it.
  referenceColor: col('ink'),
  // A word space never shrinks below 75 % of the font's. At the default 60 %, the tightest
  // line on page 5 sets its spaces at 0.70 (each VDT line carries its justifiedSpaceRatio).
  minWordSpacing: 0.75,
  // A runt fix may add tracking 1.4.1 measures but never paints (gotcha:
  // runt-tracking-unpainted); no paragraph here needs one, edited text might.
  maxRuntTracking: 0 };
// #endregion

const config = () => ({
  locale: 'fr', // the exact code of the bundled patterns (gotcha: hyphenation-locales)
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: { layoutType: 'single' },
  bodyText,
  // A heading's own line is hidden under its design but still measured, in this face and weight.
  headings: { fontFamily: 'IM Fell French Canon', fontWeight: 400, levels: [letters] },
  headingStyles: [cover],
  paragraphStyles: [...letterParts,
    // Frederick's verses, a :::verse block 7 mm in with a line of space above and below; the
    // octosyllables start two spaces (indentStep=3.5mm on the fence) further in, 14 mm, and the
    // two closing alexandrines at 7 mm.
    { id: 'verse', indent: mm(7), marginTop: pt(LEAD), marginBottom: pt(LEAD) },
    // The editor's headnote at 9.6 on 13 pt, italic through *…* in the Markdown, since a
    // paragraph style has no italic setting.
    { id: 'headnote', fontSize: pt(9.6), lineHeight: pt(13), firstLineIndent: pt(0) },
    { id: 'colophon', fontSize: pt(7.8), lineHeight: pt(10.8), textAlign: 'left',
      firstLineIndent: pt(0), marginTop: pt(3 * LEAD) }],
  header,
  footer: { elements: [] }, // the folios ride in the header
});

// #region art: the binding drawn in code, and the photograph of the letters laid on it
const W = TRIM.width;
const H = TRIM.height;
// The binding: green leather to the edges, a gilt double fillet and a lozenge at each corner.
function bindingSvg() {
  const tooling = [6, 7.6].map((inset, i) => `<rect x="${inset}" y="${inset}" `
    + `width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="${palette.gilt}" `
    + `stroke-width="${i ? 0.25 : 0.7}"/>`).join('') + [[6, 6], [W - 6, 6], [6, H - 6],
    [W - 6, H - 6]].map(([x, y]) => `<path d="M${x} ${y - 2.4} L${x + 2.4} ${y} L${x} ${y + 2.4} `
    + `L${x - 2.4} ${y} Z" fill="${palette.gilt}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${palette.leather}"/>`
    + `${tooling}</svg>`;
}
// The design's image elements name these by id; loadSvg() and loadImage() below register the
// files. The photograph is a JPEG in assets/ cut to LETTERS' 116 × 120 mm, declared at its
// pixels; its edges fade into the leather's green, so it sits on the drawn binding unseen.
const resources = [{ id: 'binding', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'binding.svg', width: W * 10, height: H * 10 },
  altText: 'A green leather cover with a gilt double fillet and a lozenge at each corner.' },
{ id: 'letters', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'letters-1160.jpg', format: 'jpeg', width: 1160, height: 1200 },
  altText: 'Two folded letters on the green leather: the upper one lies face down, its flap '
    + 'closed by a red wax seal; the lower one shows an address in brown ink.' }];
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces
  'Crimson Pro': ['400', '400i'], 'IM Fell French Canon': ['400i'], 'IM Fell DW Pica SC': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('binding.svg', bindingSvg());
await loadImage('letters-1160.jpg', asset('letters-1160.jpg'));
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Letters edition', es: 'Edición de cartas' }) });

// @kit
