// ═══ Postext Cookbook · Nº 166 · Numbered chorale examples in a harmony method ══
// https://postext.dev/en/cookbook/conservatory-method-chorales
// Code: MIT · Text and four-part settings: original (CC BY 4.0) · Melodies: public domain
// Fonts: Crimson Pro, Playfair Display, Fira Sans Condensed (OFL 1.1) · Needs postext ≥ 1.65.0
import {
  buildDocumentWithFonts, renderPageToCanvas, defaultResourceTypes, initMusicEngine,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'conservatory-method-chorales';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// A claret accent on warm paper tones, every colour linked by id.
const palette = { ink: '#1f1a17', accent: '#7a2531', tint: '#f5eee6', rule: '#cdbfb2',
  muted: '#6a5f57', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const [TEXT, DISPLAY, LABEL] = ['Crimson Pro', 'Playfair Display', 'Fira Sans Condensed'];
const OUTER = 16; // outer margin in mm: running heads and folios align to it
const LEAD = 14.2; // body leading in pt

// #region answer: score resources typed 'example', floated and numbered like figures
// In the Markdown, :ref{id="ex-old-hundredth" style="full"} prints 'Example 4.4' ('Ejemplo
// 4.4' in Spanish) and ::resource{id="…"} anchors the float after the paragraph that cites it.
const example = (id, source, placement, styleId) => {
  const [caption, note, altText] = CAPTIONS[id];
  return { id, typeId: 'example', kind: 'score', caption, note, altText, placement,
    score: { format: 'humdrum', source, styleId }, createdAt: 0, updatedAt: 0 };
};
// The **kern sources are in #region art-scores; captions in content.captions.<lang>.md.
const resources = () => [
  example('ex-cadences', CADENCES, { position: 'bottom' }, 'column'),
  example('ex-nun-danket', NUN_DANKET, { position: 'top' }, 'column'),
  example('ex-nun-danket-3', NUN_DANKET_3, { position: 'auto' }, 'column'),
  // Across both columns in the document's own score style: the whole tune in two systems.
  example('ex-old-hundredth', OLD_HUNDREDTH, { position: 'top', span: 'page' }),
  example('ex-deceptive', DECEPTIVE, { position: 'auto', span: 'page' }),
];
// #endregion

// #region scores: one score style for the page-wide chorale, a smaller one for the columns
const scoreStyle = {
  staffSize: mm(5.4), musicFont: 'Bravura', barNumbers: 'system', color: col('ink'),
  textFont: TEXT, // the Roman numerals under the bass, in the text face
  marginTop: pt(4), marginBottom: pt(2),
};
const scoreStyles = [ // rastral 4.6 mm: four staves of a chorale fit a column in two systems
  { id: 'column', name: t({ en: 'Column examples', es: 'Ejemplos de columna' }),
    staffSize: mm(4.6), barNumbers: 'none', spacing: 0.8 },
];
// #endregion

// #region opener: kicker, title, deck and a short rule across both columns, sunk 46 mm
const label = { fontFamily: LABEL, fontWeight: 600, textTransform: 'uppercase' };
const opener = {
  enabled: true, minHeight: mm(46),
  slot: { elements: [
      { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, fontSize: pt(9),
        letterSpacing: pt(1.8), color: col('accent'), align: 'left',
        placement: { anchor: { to: 'container', edge: 'top-left' },
          offset: { x: mm(0), y: mm(6) } } },
      { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(36),
        lineHeight: 1.05, fontWeight: 400, color: col('ink'), align: 'left',
        placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { x: mm(0), y: mm(3) },
          size: { width: mm(150), height: 'auto' } } },
      { kind: 'text', id: 'deck', content: '{attr.deck}', fontFamily: TEXT, fontSize: pt(13),
        lineHeight: 1.25, italic: true, color: col('muted'), align: 'left',
        placement: { anchor: { to: '#title', edge: 'below' }, offset: { x: mm(0), y: mm(3) },
          size: { width: mm(120), height: 'auto' } } },
      { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5), color: col('accent'),
        placement: { anchor: { to: '#deck', edge: 'below' }, offset: { x: mm(0), y: mm(5) },
          size: { width: mm(18) } } },
  ] },
};
// #endregion

// #region running-heads: book title on the verso, chapter on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', ...label, fontSize: pt(7.8),
  letterSpacing: pt(1.2), color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(12) } }, ...extra,
});
const folio = { fontWeight: 700, color: col('accent') };
const header = {
  elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
    head('verso-title', '{title}', 'even', 'top-left', OUTER + 9),
    head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 9)),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
  ],
};
const footer = { // the opener's drop folio, centred under the text block
  elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0, { ...folio, pages: 'opener',
    placement: { anchor: { to: 'container', edge: 'top' }, offset: { x: mm(0), y: mm(8) } } })],
};
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation, and the name of the Example type
  resourceTypes: defaultResourceTypes(LANG), // the engine adds Example (Ejemplo) in locale
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(210), height: mm(280), dpi: 150,
    margins: { top: mm(22), bottom: mm(22), left: mm(20), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'double', gutterWidth: mm(7) },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(10.8), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('accent'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: DISPLAY, color: col('ink'), fontWeight: 700,
    levels: [
      { level: 1, span: 'page', fontSize: pt(36), breakBefore: { parity: 'odd' },
        advancedDesign: opener, marginBottom: pt(0) },
      { level: 2, fontSize: pt(13.5), lineHeight: pt(LEAD), marginTop: pt(LEAD),
        marginBottom: pt(LEAD / 2) },
    ],
  },
  unorderedLists: { bulletChar: '–', color: col('accent'),
    marginTop: pt(0), marginBottom: pt(0) },
  orderedLists: { numberFormat: 'arabic', color: col('accent'), fontWeight: 700,
    marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  calloutStyles: [
    { id: 'rule', title: t({ en: 'Rule', es: 'Regla' }), background: col('tint'),
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
      padding: { top: mm(3), right: mm(3.5), bottom: mm(3), left: mm(3.5) },
      titleStyle: { ...label, fontSize: pt(8), fontWeight: 700, letterSpacing: pt(1.2),
        color: col('accent') },
      body: { fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(13), color: col('ink'),
        firstLineIndent: pt(0), boldColor: col('ink'), italicColor: col('ink') } },
  ],
  captionStyle: { fontFamily: LABEL, fontSize: pt(8.4), color: col('ink'), gap: mm(1.5),
    labelBold: true, labelColor: col('accent'), note: { color: col('muted'), gap: mm(0.5) } },
  scoreStyle,
  scoreStyles,
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// Caption, credit note ('-' for none) and alt text of each example, one block per example.
const CAPTIONS = Object.fromEntries((/* @content:captions */ '').trim().split(/\n\s*\n/)
  .map((block) => block.split('\n').map((line) => line.trim()))
  .map(([id, caption, note, alt]) => [id, [caption, note === '-' ? undefined : note, alt]]));

// #region humdrum: aligned columns become tab-separated **kern, the Spanish numerals uppercase
// Each example lists its spines as Humdrum wants them, lowest first: the bass staff split into
// tenor and bass, the **harm spine (printed under that staff), the treble staff split into
// soprano and alto. Writing them with spaces keeps the pen free of tab characters.
const kern = (meter, body) => [
  '**kern **harm **kern', '*clefF4 * *clefG2', '*k[f#] * *k[f#]', `*M${meter} * *M${meter}`,
  '*^ * *^', ...body.trim().split('\n'), '== == == == ==', '*- *- *- *- *-',
].map((row) => row.trim().split(/ +/)
  // Spanish harmony books write every degree in capitals: vi is VI, iib is IIb.
  .map((cell) => (LANG === 'es' && /^(?:i{1,3}|iv|vi{0,2})[bc7]?$/.test(cell)
    ? cell.replace(/^[iv]+/, (degree) => degree.toUpperCase()) : cell))
  .join('\t')).join('\n');
// #endregion

// #region art-scores: the five examples; spines: tenor bass | harm | soprano alto
const CADENCES = kern('2/2', `
  2A   2D    V    2f#  2d
  2B   2GG   I    2g   2d
  =||  =||   =||  =||  =||
  2d   2D    V    2a   2f#
  2d   2GG   I    2b   2g
  =||  =||   =||  =||  =||
  2d   2GG   I    2b   2g
  2d   2D    V    2a   2f#
  =||  =||   =||  =||  =||
  2c   2C    IV   2g   2e
  2B   2GG   I    2g   2d
  =||  =||   =||  =||  =||
  2A   2D    V    2f#  2d
  2G   2E    vi   2g   2B`);

const NUN_DANKET = kern('4/4', `
  4B   4GG   I    4dd  4g
  =    =     =    =    =
  4A   4D    V    4dd  4f#
  4G   4BB   Ib   4dd  4g
  4c   4AA   ii   4ee  4e
  4G   4C    IV   4ee  4e
  =    =     =    =    =
  2B   2GG;  I    2dd; 2g
  4r   4ry   .    4r   4ry
  4d   4GG   I    4b   4g
  =    =     =    =    =
  4e   4C    IV   4cc  4g
  4d   4GG   I    4b   4g
  4A   4FF#  Vb   4a   4d
  8G   8GG   I    8b   8d
  8G   8EE   IVb  8cc  8c
  =    =     =    =    =
  2c   4C    iib  2a   4e
  .    4D    V7   .    4f#
  4B   4GG;  I    4g;  4d`);

const NUN_DANKET_3 = kern('4/4', `
  4c   4AA   ii   4a   4e
  =    =     =    =    =
  4A   4C    iib  4a   4e
  4d   4D    V    4a   4f#
  4d   4GG   I    4b   4g
  4d   4BB   Ib   4b   4g
  =    =     =    =    =
  2d   2D;   V    2a;  2f#
  4r   4ry   .    4r   4ry`);

const OLD_HUNDREDTH = kern('2/2', `
  2B   2G    I    2g   2d
  4B   4E    vi   4g   4e
  4B   4BB   iii  4f#  4d
  =    =     =    =    =
  4G   4C    IV   4e   4c
  4G   4GG   I    4d   4B
  2G   2E    vi   2g   2B
  =    =     =    =    =
  2F#  2D    V    2a   2d
  2G   2GG;  I    2b;  2d
  =||  =||   =||  =||  =||
  2G   2GG   I    2b   2d
  4G   4E    vi   4b   4e
  4G   4D    Ic   4b   4g
  =    =     =    =    =
  4c   4C    iib  4a   4e
  4G   4BB   Ib   4g   4d
  2G   2E    IVb  2cc  2g
  =    =     =    =    =
  2d   2D    Ic   2b   2g
  2d   2D;   V    2a;  2f#
  =||  =||   =||  =||  =||
  2B   2GG   I    2g   2d
  4A   4FF#  Vb   4a   4d
  4G   4GG   I    4b   4d
  =    =     =    =    =
  4E   4C    iib  4a   4e
  4G   4BB   Ib   4g   4d
  2G   2E    IVb  2e   2c
  =    =     =    =    =
  2A   2D    V    2f#  2d
  2B   2GG;  I    2g;  2d
  =||  =||   =||  =||  =||
  2G   2BB   Ib   2dd  2d
  2G   2GG   I    2b   2d
  =    =     =    =    =
  2G   2C    IV   2g   2e
  4c   4C    iib  4a   4e
  4c   4AA   ii   4cc  4e
  =    =     =    =    =
  2G   2D    Ic   2b   2d
  2F#  2D    V    2a   2d
  =    =     =    =    =
  1G   1GG;  I    1g;  1B`);

// The last line twice: the first time V moves to vi (E minor under the tonic note).
const LAST_LINE = (bass, degree) => `
  2G   2BB   Ib   2dd  2d
  2G   2GG   I    2b   2d
  =    =     =    =    =
  2G   2C    IV   2g   2e
  4c   4C    iib  4a   4e
  4c   4AA   ii   4cc  4e
  =    =     =    =    =
  2G   2D    Ic   2b   2d
  2F#  2D    V    2a   2d
  =    =     =    =    =
  1G   ${bass}  ${degree}  1g;  1B`;
const DECEPTIVE = kern('2/2', `${LAST_LINE('1E;', 'vi')}
  =  =  =  =  =${LAST_LINE('1GG;', 'I')}`);
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Crimson Pro': ['400', '400i', '600', '700'], // text, and the numerals under the music
  'Playfair Display': ['400', '700'], // display: chapter title, section heads
  'Fira Sans Condensed': ['400', '600', '700'], // labels: kicker, heads, captions, the box
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: start the engraver, then set chapter 4 of the method from page 61
await initMusicEngine(); // until it runs, every score is laid out as a grey box
const continuation = { pageNumbering: { startAt: 61 }, // odd: the opener is a recto
  headings: { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }; // the next # is chapter 4
const doc = await buildDocumentWithFonts({ markdown, resources: resources(), continuation },
  config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Numbered chorale examples in a harmony method',
  es: 'Corales numerados en un método de armonía' }) });
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
