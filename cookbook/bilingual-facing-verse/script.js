// ═══ Postext Cookbook · Nº 043 · Facing translation, stanza by stanza ═══════════════════
// https://postext.dev/en/cookbook/bilingual-facing-verse
// Code: MIT · Text: original (CC BY 4.0) · Salt pans and flamingo: diffusion models
// Fonts: Castoro, Castoro Titling, Tenor Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'bilingual-facing-verse';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#1f2430', // the text: a blue-black
  madder: '#9a3c52', // the one accent: numerals, poem titles, the other language's title
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
// keepTogether: false lets a poem that does not fit go on overleaf. A group with breaks is
// cut stream by stream (flow="parallel"): each language goes on in its own column, level.
const poem = {
  id: 'poem',
  backgroundEnabled: false, // no fill, border or stripe
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  columnGap: mm(GAP),
  titleStyle: { fontFamily: 'Castoro Titling', fontSize: pt(22), fontWeight: 400,
    color: col('madder'), gap: pt(4) },
  // A box starts on the first grid line at least two lines down: 10.2 mm under the picture,
  // 12.3 mm under a poem, whose box ends off the grid. The default marginBottom (0.75 em)
  // would add to marginTop and open 17.4 mm between poems.
  marginTop: pt(LEAD * 2), marginBottom: pt(0),
  keepTogether: false, // a long poem goes on overleaf instead of moving whole
};
// #endregion

// #region verse: a :::verse block per column, turnovers that hang, a title over each column
// Each half of a poem is a :::verse block, a line of verse a line of Markdown and a blank line
// between stanzas. A line too long for its 55 mm column turns over 2 em in, where it cannot
// pass for the next line; the Spanish half then ends that stanza's block and a
// :::space{lines=2} before the next keeps the stanzas level across the gutter.
const verse = { id: 'verse', hangingIndent: em(2) };
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

// #region front: the title page and the picture over the poems, each a heading's design
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
const BAND = 84; // mm: the picture of the salt pans, from the top edge of the page
const UNDER = Math.floor((BAND - TOP) / ((LEAD * 25.4) / 72)); // 12 grid lines to its foot
const poemsOpener = {
  id: 'poems', span: 'page', // span 'page': a column clips its design
  // An image reserves no height (gotcha: opener-image-no-reserve). minHeight, a whole number
  // of lines, plus the level's one-line bottom margin end the heading at the picture's foot.
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
// The note and the picture open their pages ('opener'): a folio at the foot instead.
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

// #region art: the salt pans at sunrise and a flamingo, two watercolours in assets/
// Each JPEG is cut to its frame: the band 156 × 84 mm, the flamingo 34 × 44 mm on white paper.
const picture = (id, fileId, w, h, altText) => ({ id, typeId: 'figure', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, altText, bitmap: { fileId, format: 'jpeg', width: w, height: h } });
// Nothing cites them: the heading designs show them.
const resources = [
  picture('salina', 'salina-1560.jpg', 1560, 840, t({
    en: 'Salt pans at sunrise: pink ponds, white heaps of salt, a chapel on the horizon '
      + 'and flamingos standing over their reflections.',
    es: 'Salinas al amanecer: balsas rosas, montones de sal, una ermita en el horizonte y '
      + 'flamencos de pie sobre su reflejo.' })),
  picture('flamingo', 'flamingo-680.jpg', 680, 880, t({
    en: 'A flamingo standing on one leg among ripples.',
    es: 'Un flamenco sobre una pata entre las ondas del agua.' })),
];
for (const { bitmap } of resources) await loadImage(bitmap.fileId, asset(bitmap.fileId));
// #endregion

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
