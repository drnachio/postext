// ═══ Postext Cookbook · Nº 048 · Code listings and keycaps ═══
// https://postext.dev/en/cookbook/code-listings-and-keycaps
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Charis SIL, Sora, JetBrains Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, prepareFonts, withLoadedFonts, renderPageToCanvas,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'code-listings-and-keycaps';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#1b1f24', muted: '#5c636b', ember: '#9a5410', // text, heads, accent
  night: '#0e1116', code: '#d3d9df', amber: '#f2b134', phosphor: '#3ddc84', // the listings
  slate: '#8a939d' }; // comments in a listing, the outline of a key (code is its face)
// Every colour is linked to its palette entry by id.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ember })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, MONO] = ['Charis SIL', 'Sora', 'JetBrains Mono'];
const LEAD = 14.5; // pt: the body leading, the page's baseline grid
const ZERO = pt(0);

// #region answer: a fence is a code listing; codeStyle gives it a dark box
// A ``` fence is a listing set line by line as written: indents, blank lines and the output
// columns of a session are kept. The rest of the fence line (Terminal, backup.sh) is its
// title; with a label set, it goes on the tab.
// The text after a listing goes in :::paragraphs{style="resume"}: flush, as after a heading.
const resume = { id: 'resume', firstLineIndent: ZERO };
const codeStyle = {
  fontFamily: MONO, fontSize: pt(8.6), lineHeight: pt(12.4), color: col('code'),
  background: col('night'), span: 'page', // across the text and the margin
  padding: { top: mm(4), right: mm(5), bottom: mm(4), left: mm(5) },
  marginTop: mm(6), marginBottom: mm(2.5),
  label: { fontFamily: MONO, fontSize: pt(7), fontWeight: 700, color: col('phosphor'),
    background: col('night'), height: mm(5), offset: mm(5), paddingX: mm(3), // the tab
    position: 'top-left' },
  tokens: tokens(), // the colours, below
  inline: { fontSize: em(0.88) }, // `grep` in running text: the code face, no box
};
// #endregion

// #region paint: keywords amber, strings green, comments slate; a session's typed lines amber
function tokens() {
  const plain = { color: col('code') }; // every other kind in the listing's own colour
  return {
    keyword: { color: col('amber'), bold: true }, function: { color: col('amber'), bold: true },
    string: { color: col('phosphor'), italic: true },
    comment: { color: col('slate'), italic: false }, // upright: the default comment is italic
    prompt: { color: col('amber'), bold: true }, output: plain, // what you type, the answer
    number: plain, type: plain, variable: plain, meta: plain, operator: plain, punctuation: plain,
  };
}
// #endregion

// #region keycaps: keys are chips
// Chips never break or stretch, so a line with keys puts all its slack in its word spaces;
// the breaker tries other breaks before a space passes 140 % (default 200 %).
const spacing = { maxWordSpacing: 1.4 }; // spread into bodyText
const chipStyles = [
  { id: 'key', fontFamily: MONO, fontSize: pt(7.8), bold: true, color: col('ink'),
    background: col('code'), borderColor: col('slate'), borderWidth: pt(0.6),
    borderRadius: pt(1.6), paddingX: em(0.45), paddingY: em(0.14), gap: em(0.3) },
];
// #endregion

// #region sheet: a two-column cheat sheet floated to the foot of its page
const sheet = { id: 'sheet', background: col('night'), span: 'page', placement: 'bottom',
  marginTop: mm(6), marginBottom: mm(2.5),
  columnGap: mm(8), padding: { top: mm(5), right: mm(6), bottom: mm(5.5), left: mm(6) },
  titleStyle: { fontFamily: MONO, fontSize: pt(7.5), fontWeight: 700, gap: mm(3.5),
    color: col('phosphor'), textTransform: 'uppercase', letterSpacing: pt(1.5) },
  body: { fontFamily: DISPLAY, fontSize: pt(8.4), lineHeight: pt(13), textAlign: 'left',
    color: col('code'), boldColor: col('amber'), italicColor: col('phosphor'),
    paragraphSpacing: false, firstLineIndent: ZERO } };
// #endregion

const aside = { id: 'aside', span: 'side', backgroundEnabled: false, // notes in the margin
  stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('ember') },
  padding: { top: mm(2.2), right: ZERO, bottom: ZERO, left: ZERO },
  titleStyle: { fontFamily: MONO, fontSize: pt(7.5), fontWeight: 700, color: col('ember'),
    textTransform: 'uppercase', letterSpacing: pt(1.2), gap: mm(1.2) },
  body: { fontFamily: TEXT, fontSize: pt(8.6), lineHeight: pt(12.5), textAlign: 'left',
    firstLineIndent: ZERO } };
const colophon = { ...aside, id: 'colophon', stripe: { enabled: false }, body: { ...aside.body,
  fontFamily: MONO, fontSize: pt(7.5), lineHeight: pt(10.5), color: col('muted'),
  italicColor: col('muted') } };

// #region steps: numbered steps on the grid, a prompt sign for a separator
const orderedLists = { fontFamily: DISPLAY, fontWeight: 800, color: col('ember'),
  gap: em(0.7), separator: '›', separatorGap: em(0.25), separatorFontFamily: MONO,
  separatorFontWeight: 700, separatorColor: col('muted'),
  marginTop: ZERO, marginBottom: ZERO }; // the default 1.5 em opens 5.3 mm above and below
// #endregion

const OUTER = 15; // mm: the outer margin; the running heads align to it
const text = (id, content, family, size, look, placement) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col('ink'), placement, ...look,
  align: 'left' }); // design text is centred by default; an opener wraps its text
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { x: ZERO, y: mm(y) }, size: { width } });
const opener = { enabled: true, slot: { elements: [
  text('kicker', '{attr.kicker}', MONO, 8, { fontWeight: 700, letterSpacing: pt(1.6),
    textTransform: 'uppercase', color: col('ember') },
  { anchor: { to: 'container', edge: 'top-left' }, offset: { x: ZERO, y: mm(4) } }),
  text('title', '{titleText}', DISPLAY, 33, { fontWeight: 800, lineHeight: 1.04 },
    below('kicker', 3.5, mm(118))),
  text('lead', '{attr.lead}', TEXT, 12, { italic: true, lineHeight: 1.36 },
    below('title', 5, 'fill')),
] } };
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: MONO, fontSize: pt(7.5),
  letterSpacing: pt(1.1), textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(12) } }, ...extra,
});
const folio = { fontWeight: 700, color: col('ember') };

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // the hyphenation patterns of each edition
  colorPalette, chipStyles, orderedLists, paragraphStyles: [resume],
  calloutStyles: [sheet, aside, colophon], codeStyle,
  // #region page: a text column and a margin column that only listings and notes enter
  page: { sizePreset: 'custom', width: mm(178), height: mm(229), margins: {
    top: mm(22), bottom: mm(21), left: mm(20), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: 26, gutterWidth: mm(6),
    sideColumnRole: 'floats', sideColumnSide: 'outer' },
  // #endregion
  bodyText: { ...spacing, // keycaps
    fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    firstLineIndent: mm(4.5), indentAfterHeading: false },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 800, levels: [
    // parity 'odd': the next recto; the default 'always-odd' also leaves a blank page before it.
    { level: 1, breakBefore: { enabled: true, parity: 'odd' }, advancedDesign: opener },
    { level: 2, fontSize: pt(13), lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: ZERO },
  ] },
  header: { elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
    head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
    head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8)),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
  ] },
  footer: { elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0, {
    ...folio, pages: 'opener', // the opener has no running head: its folio drops to the foot
    placement: { anchor: { to: 'container', edge: 'top' }, offset: { x: ZERO, y: mm(9) } } })] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
const continuation = { pageIndexOffset: 48, pageNumbering: { startAt: 49 } }; // p. 49, a recto

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Charis SIL': ['400', '400i'], Sora: ['400', '700', '800'],
  'JetBrains Mono': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await prepareFonts(markdown, config(), kitFonts(FONTS));
const build = () => buildDocument({ markdown, continuation }, config());
const doc = await withLoadedFonts(build, { ...kitFonts(FONTS), text: markdown });
showPages(doc, { title: t({ en: 'The Shell, Gently', es: 'La terminal, con calma' }) });

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
