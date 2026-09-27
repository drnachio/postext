// ═══ Postext Cookbook · Nº 048 · Code listings and keycaps without code blocks ═══
// https://postext.dev/en/cookbook/code-listings-and-keycaps
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Charis SIL, Sora, JetBrains Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'code-listings-and-keycaps';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#1b1f24', muted: '#5c636b', ember: '#9a5410', // text, heads, accent
  night: '#0e1116', code: '#d3d9df', amber: '#f2b134', phosphor: '#3ddc84', // the listings
  slate: '#8a939d' }; // comments in a listing, the outline of a key (code is its face)
// Design elements read the hex, not the palette id (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ember })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, MONO] = ['Charis SIL', 'Sora', 'JetBrains Mono'];
const LEAD = 14.5; // pt: the body leading, the page's baseline grid
const [NBSP, ZERO] = ['\u00a0', pt(0)];

// #region answer: a fenced block becomes a dark box with one escaped paragraph per line
// Postext sets no fenced code, so the Markdown is rewritten before the build:
// ```bash backup.sh … ``` → :::callout{type="listing" label="backup.sh"} … :::
// Characters Markdown would read as emphasis, a superscript or subscript, code or maths get
// a backslash (gotcha: dollar-math). The parser drops a backslash only before those, so any
// other backslash in the code prints as typed. ']\u2060(' keeps '[a](b)' from becoming a link.
const escape = (text) => text.replace(/[*_^~`$]/g, '\\$&').replace(/\]\(/g, ']\u2060(');
function codeLine(line, lang) {
  // A word joiner (U+2060) opens every line, so a leading '#', '-', '1.' or '>' stays text
  // (gotcha: digit-period-list). Parsing trims leading spaces, no-break ones included;
  // the word joiner in front keeps them.
  const indent = line.match(/^ */)[0].length; // indent listings with spaces, not tabs
  const body = (lang === 'console' ? session : paint)(line.slice(indent));
  const runs = body.replace(/ {2,}/g, (run) => NBSP.repeat(run.length)); // output columns
  return `\u2060${NBSP.repeat(indent)}${runs}`;
}
// The label stops at a double quote, which would close the attribute.
const listings = (markdown) => markdown.replace(/^```(\w*) *([^"\n]*).*\n([\s\S]*?)^```$/gm,
  (_, lang, label, code) => [`:::callout{type="listing" label="${label || lang}"}`,
    // One paragraph per line; a blank line keeps the word joiner alone.
    ...code.replace(/\n$/, '').split('\n').map((line) => codeLine(line, lang)), ':::',
  ].join('\n\n'));
// The text after a listing goes in :::paragraphs{style="resume"}: flush, as after a heading.
const resume = { id: 'resume', firstLineIndent: ZERO };
const listing = {
  id: 'listing', background: col('night'), span: 'page', // across the text and the margin
  padding: { top: mm(4), right: mm(5), bottom: mm(4), left: mm(5) },
  marginTop: mm(6), marginBottom: mm(2.5),
  label: { fontFamily: MONO, fontSize: pt(7), fontWeight: 700, color: col('phosphor'),
    background: col('night'), height: mm(5), offset: mm(5), paddingX: mm(3), // the tab
    position: 'top-left' },
  body: { fontFamily: MONO, fontSize: pt(8.6), lineHeight: pt(12.4), textAlign: 'left',
    color: col('code'), boldColor: col('amber'), italicColor: col('phosphor'), // paint()
    // One paragraph per line of code: no space between them, even if bodyText adds some.
    paragraphSpacing: false, firstLineIndent: ZERO },
};
// #endregion

// #region paint: keywords bold, strings italic, comments a chip with no box
const KEYWORDS = 'if|then|else|elif|fi|for|in|do|done|while|until|case|esac' // reserved words
  + '|set|echo|cd|export|local|read'; // builtins; programs such as mkdir and rsync stay plain
const TOKEN = new RegExp(`("(?:\\\\.|[^"\\\\])*"|'[^']*')` // a quoted string
  + `|((?:^|(?<=\\s))#.*$)|\\b(${KEYWORDS})\\b`, 'g'); // a comment, a keyword
function paint(line) {
  let out = '';
  let last = 0;
  for (const { 0: token, 1: string, 2: comment, index } of line.matchAll(TOKEN)) {
    out += escape(line.slice(last, index));
    if (string) out += `*${escape(string)}*`;
    else if (comment) out += `:chip[${chipText(comment)}]{style="rem"}`;
    else out += `**${token}**`;
    last = index + token.length;
  }
  return out + escape(line.slice(last));
}
// In a session, what you type after the prompt is bold; the shell's answer stays plain.
const session = (line) => line.startsWith('$ ') ? `\\$ **${escape(line.slice(2))}**` : escape(line);
// #endregion

// #region keycaps: keys, and inline code in the mono face, are chips
// Chips never break or stretch, so a line with keys puts all its slack in its word spaces;
// the breaker tries other breaks before a space passes 140 % (default 200 %). Inside a chip
// maths stays literal, so '$' needs no backslash there, but ']' does.
const spacing = { maxWordSpacing: 1.4 }; // spread into bodyText
const chipText = (text) => text.replace(/[*_^~`]/g, '\\$&').replace(/]/g, '\\]');
const inlineCode = (markdown) => markdown.replace(/(?<!\\)`([^`\n]+)`/g,
  (_, code) => `:chip[${chipText(code)}]{style="code"}`);
const bare = { backgroundEnabled: false, borderWidth: ZERO, paddingX: ZERO, gap: ZERO };
const chipStyles = [
  { id: 'key', fontFamily: MONO, fontSize: pt(7.8), bold: true, color: col('ink'),
    background: col('code'), borderColor: col('slate'), borderWidth: pt(0.6),
    borderRadius: pt(1.6), paddingX: em(0.45), paddingY: em(0.14), gap: em(0.3) },
  { id: 'code', fontFamily: MONO, fontSize: em(0.88), ...bare }, // `grep` in running text
  { id: 'rem', fontFamily: MONO, color: col('slate'), ...bare }, // a comment in a listing
];
// #endregion

// #region sheet: a two-column cheat sheet floated to the foot of its page
const sheet = { ...listing, id: 'sheet', label: undefined, placement: 'bottom',
  columnGap: mm(8), padding: { top: mm(5), right: mm(6), bottom: mm(5.5), left: mm(6) },
  titleStyle: { fontFamily: MONO, fontSize: pt(7.5), fontWeight: 700, gap: mm(3.5),
    color: col('phosphor'), textTransform: 'uppercase', letterSpacing: pt(1.5) },
  body: { ...listing.body, fontFamily: DISPLAY, fontSize: pt(8.4), lineHeight: pt(13) } };
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
  align: 'left', overflow: 'wrap' }); // design text is centred and cut with '…' by default
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { x: ZERO, y: mm(y) }, size: { width } });
const opener = { enabled: true, slot: { elements: [
  text('kicker', '{attr.kicker}', MONO, 8, { fontWeight: 700, letterSpacing: pt(1.6),
    textTransform: 'uppercase', color: col('ember') },
  { anchor: { to: 'container', edge: 'top-left' }, offset: { x: ZERO, y: mm(4) } }),
  // Design lineHeights are multiples (gotcha: design-lineheight-multiple).
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

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette, chipStyles, orderedLists, paragraphStyles: [resume],
  calloutStyles: [listing, sheet, aside, colophon],
  // #region page: a text column and a margin column that only listings and notes enter
  page: { sizePreset: 'custom', width: mm(178), height: mm(229), margins: {
    top: mm(22), bottom: mm(21), left: mm(20), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: 26, gutterWidth: mm(6),
    sideColumnRole: 'floats', sideColumnSide: 'outer' },
  // #endregion
  bodyText: { ...spacing, // keycaps
    fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    firstLineIndent: mm(4.5), indentAfterHeading: false,
    maxRuntTracking: 0, // tracking it cannot paint (gotcha: runt-tracking-unpainted)
  },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 800, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
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
const source = inlineCode(listings(markdown)); // fences first: their backticks are escaped
const continuation = { pageIndexOffset: 48, pageNumbering: { startAt: 49 } }; // p. 49, a recto

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Charis SIL': ['400', '400i'], Sora: ['400', '700', '800'],
  'JetBrains Mono': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const build = () => buildDocument({ markdown: source, continuation }, config());
const doc = await buildWithFonts(build, markdown);
showPages(doc, { title: t({ en: 'The Shell, Gently', es: 'La terminal, con calma' }) });

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
