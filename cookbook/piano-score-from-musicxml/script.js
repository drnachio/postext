// ═══ Postext Cookbook · Nº 167 · A piano score from MusicXML over several pages ═══════
// https://postext.dev/en/cookbook/piano-score-from-musicxml
// Code: MIT · Text: original (CC BY 4.0) · Music: Mutopia Project (public domain)
// Fonts: Libre Caslon Text, Bodoni Moda, Archivo Narrow (SIL OFL 1.1) · Needs postext ≥ 1.65.0
import {
  buildDocumentWithFonts, renderPageToCanvas, initMusicEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'piano-score-from-musicxml';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a plate-black ink, one deep green accent, every colour linked by id
const palette = {
  ink: '#1b1a18', // the notes and the text: a warm near-black
  accent: '#2f5a46', // titles' kickers, rules: the green of an old music-shop wrapper
  tint: '#eef2ee',
  rule: '#b9c4bc', // hairlines
  muted: '#625f59', // running heads, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const SERIF = 'Libre Caslon Text';
const DISPLAY = 'Bodoni Moda';
const LABEL = 'Archivo Narrow';
const OUTER = 20; // outer margin in mm: the running heads align to it
const LEAD = 14.5; // body leading in pt

// #region answer: the score style of a performing edition, and a MusicXML file in a fence
const scoreStyle = {
  staffSize: mm(7), // the rastral of a performing edition: read at arm's length
  musicFont: 'Bravura', // the engraved plate look
  barNumbers: 'system', // a number at the head of each system, as editions print them
  spacing: 1.7, // about four bars to a system, eight systems to a piece
  systemGap: mm(14), // room for the ledger lines above and below the grand staff
  marginTop: pt(LEAD),
  marginBottom: pt(0),
  minSystemsAtBreak: 2, // never one system alone at a foot or the head of a page
  color: col('ink'),
};
// A fence breaks between systems, so a piece runs on over pages; a score resource is kept
// whole. The file is what notation software exports: the Markdown keeps a placeholder
// line in each fence and the pen puts the fetched file there.
const SCORES = {
  'bwv-anh-114': asset('bwv-anh-114.musicxml'),
  'bwv-anh-115': asset('bwv-anh-115.musicxml'),
};
async function withScores(text) {
  const files = await Promise.all(Object.entries(SCORES).map(async ([id, url]) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Score not found (${res.status}): ${url}`);
    return [id, (await res.text()).trim()];
  }));
  return files.reduce((md, [id, xml]) => md.replace(`{{${id}}}`, () => xml), text);
}
// #endregion

// #region openers: title centred, the catalogue number left, the composer right
const label = (id, content, edge, x, y, extra = {}) => ({
  kind: 'text', id, content, fontFamily: LABEL, fontSize: pt(9), fontWeight: 500,
  color: col('ink'), align: edge.endsWith('right') ? 'right' : 'left',
  placement: { anchor: { to: 'container', edge }, offset: { x: mm(x), y: mm(y) } }, ...extra,
});
const kicker = { fontSize: pt(8.5), fontWeight: 700, letterSpacing: pt(1.6),
  textTransform: 'uppercase', color: col('accent'), align: 'center' };
const centred = (to, y) => ({ anchor: { to, edge: to === 'container' ? 'top' : 'below' },
  offset: { x: mm(0), y: mm(y) }, size: { width: 'fill' } });
const pieceOpener = {
  enabled: true,
  minHeight: mm(34),
  slot: { elements: [
    label('kicker', '{attr.kicker}', 'top', 0, 2,
      { ...kicker, placement: centred('container', 2) }),
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(26),
      fontWeight: 500, color: col('ink'), align: 'center',
      placement: centred('#kicker', 2.5) },
    label('catalogue', '{attr.catalogue}', 'bottom-left', 0, -3),
    label('composer', '{attr.composer}', 'bottom-right', 0, -3, { italic: true }),
  ] },
};
const frontOpener = {
  enabled: true,
  minHeight: mm(78),
  slot: { elements: [
    label('kicker', '{attr.kicker}', 'top', 0, 14,
      { ...kicker, placement: centred('container', 14) }),
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(52),
      fontWeight: 500, color: col('ink'), align: 'center',
      placement: centred('#kicker', 5) },
    { kind: 'text', id: 'composer', content: '{attr.composer}', fontFamily: SERIF,
      fontSize: pt(13), italic: true, color: col('ink'), align: 'center',
      placement: centred('#title', 4) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.75), color: col('accent'),
      placement: { anchor: { to: '#composer', edge: 'below', at: 'center' }, offset: { y: mm(8) },
        size: { width: mm(24) } } },
  ] },
};
// #endregion

// #region running-heads: the piece on every page after its first, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body',
  fontFamily: LABEL, fontSize: pt(8), fontWeight: 600, letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(12) } }, ...extra,
});
const folio = { fontWeight: 700, color: col('ink'), letterSpacing: pt(0) };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{chapterTitle}', 'even', 'top-left', OUTER + 9),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 9)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [] };
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }),
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(230), height: mm(305), dpi: 150,
    margins: { top: mm(22), bottom: mm(22), left: mm(24), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: SERIF, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: DISPLAY, color: col('ink'), fontWeight: 500,
    levels: [
      // Each piece opens on a verso, so it reads across the spread with no page turn.
      { level: 1, fontSize: pt(26), breakBefore: { parity: 'even' }, advancedDesign: pieceOpener },
      { level: 2, fontFamily: LABEL, fontSize: pt(8.5), lineHeight: pt(LEAD), fontWeight: 700,
        letterSpacing: pt(1.4), textTransform: 'uppercase', color: col('accent'),
        marginTop: pt(LEAD), marginBottom: pt(0) },
    ],
  },
  headingStyles: [
    { id: 'front', numbered: false, breakBefore: { parity: 'odd' }, advancedDesign: frontOpener,
      header: { elements: [] }, footer: { elements: [] } },
  ],
  paragraphStyles: [
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  scoreStyle,
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = await withScores(/* @content */ ''); // content.<lang>.md, then the two files

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Libre Caslon Text': ['400', '400i', '700'],
  'Bodoni Moda': ['500'],
  'Archivo Narrow': ['400', '500', '500i', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await initMusicEngine(); // the engraver (Verovio) loads only for books with music
const doc = await buildDocumentWithFonts({ markdown }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Two Menuets', es: 'Dos minuetos' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit
