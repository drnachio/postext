// ═══ Postext Cookbook · Nº 136 · A living newspaper of video loops ══════════════
// https://postext.dev/en/cookbook/living-newspaper-video-loops
// Code: MIT · Text: original (CC BY 4.0) · Clips: generated with diffusion models (CC BY 4.0)
// Fonts: Oswald, Libre Caslon Text, Courier Prime (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en')
const RECIPE = 'living-newspaper-video-loops';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: newsprint, a warm black and a dark red for the flags
const palette = {
  ink: '#16130f', // text, rules and the nameplate
  paper: '#f3efe4', // newsprint, and type reversed out of ink or red
  flag: '#8e1b14', // the one accent: section flags, kickers, the jump lines
  tint: '#e6dfcf', // the In brief strip
  rule: '#8f897c', // hairlines: the column rules
  muted: '#5b554b', // bylines, captions' credits, the imprint
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [ // defaults link to 'main-color': point it at the ink, never blue
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const MARGIN = { top: 12, bottom: 12, side: 12 }; // mm: a tabloid's narrow margins
const GUTTER = 4.5; // mm between the four columns
const LEAD = 11.6; // body leading in pt: the baseline grid
const oswald = (size, weight, look = {}) => ({ fontFamily: 'Oswald', fontSize: pt(size),
  fontWeight: weight, color: col('ink'), ...look });
const caps = (size, weight, colour = 'ink') => oswald(size, weight, { color: col(colour),
  textTransform: 'uppercase', letterSpacing: pt(size * 0.12) });
const typed = (size, look = {}) => ({ fontFamily: 'Courier Prime', fontSize: pt(size),
  color: col('ink'), ...look }); // the dateline and the captions: a typewriter
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', color: col('ink'), ...look, placement }); // wraps, in a running head too
const rule = (id, under, weight, gap = 0) => ({ kind: 'rule', id, thickness: pt(weight),
  color: col('ink'), placement: { ...at(under, 'above', 0, -gap), size: { width: 'fill' } } });
const depth = (lines) => ({ kind: 'box', id: 'depth', style: {}, placement: {
  ...at('container', 'top-left'), size: { width: 'fill', height: pt(lines * LEAD) } } });

// #region answer: every picture is a clip that loops, autoplays and plays with the others
// A video resource prints its poster (the first frame) on the flat page. In Folio, and in the
// HTML viewer, the poster comes alive: autoplay starts it muted when its page is on show, loop
// keeps it going, and exclusive: false lets it run alongside the other clips instead of
// pausing them, as one exclusive player at a time would.
const videoStyle = {
  playMark: { enabled: false }, // a press photograph, not a play button
  qr: { enabled: false }, // the clips live on the page, not behind a link
  linkPoster: false,
  player: { autoplay: true, loop: true, muted: true, exclusive: false, controls: false },
};
const clip = (id, url, [w, h], placement, caption, altText) => ({ id, typeId: 'picture',
  kind: 'video', createdAt: 0, updatedAt: 0, caption, altText, placement,
  video: { source: 'file', fileId: `${id}-loop.mp4`, url, // url: where the clip plays from
    format: 'mp4', width: w, height: h, duration: 5,
    poster: { fileId: `${id}-poster.jpg`, format: 'jpeg', width: w, height: h } } });
// #endregion

// #region clips: where each loop sits on the four-column grid
const resources = [
  clip('mayor', asset('mayor-loop.mp4'), [640, 480],
    { position: 'top', span: 'column', columns: 3 },
    '**Mrs Edith Rowe** speaks from the platform at the foot of Quay Hill before cutting '
      + 'the ribbon.',
    'A woman in a dark coat and small hat speaks at a draped podium, one hand raised.'),
  clip('clock', asset('clock-loop.mp4'), [480, 640],
    { position: 'top', span: 'column', columns: 2 },
    '**Twelve o’clock** on the Guildhall tower, for the first time since 1924.',
    'A stone clock tower against clouds, pigeons on its ledge.'),
  clip('fisherman', asset('fisherman-loop.mp4'), [640, 480],
    { position: 'auto', span: 'column', columns: 2 },
    '**Skipper Jacob Hosking** and the 82-pound cod on the quay.',
    'An old fisherman in an oilskin laughs, holding up a huge cod.'),
  clip('aviator', asset('aviator-loop.mp4'), [640, 480],
    { position: 'top', span: 'column', columns: 2 },
    '**Miss Constance Lacey** waves from the cockpit on Wexcombe Common.',
    'A young woman in a flying helmet waves from the open cockpit of a biplane.'),
  clip('actress', asset('actress-loop.mp4'), [480, 640],
    { position: 'top', span: 'column', columns: 2 },
    '**Miss Rosalind Avery** as Hester Lane, on the garden steps in Act III.',
    'An actress in a long gown on a garden stage set, one arm outstretched.'),
  clip('keeper', asset('keeper-loop.mp4'), [640, 480],
    { position: 'top', span: 'column', columns: 3 },
    '**Tom Rundle** at Gannet Park, before the penalty he saved.',
    'A goalkeeper in a flat cap crouches on his line in front of a packed terrace.'),
];
// #endregion

// The three small tables: the week's tides, the picture houses and the cricket.
const cell = (content, align = 'left') => ({ content, align });
const head = (content, align = 'left') => ({ content, align, isHeader: true });
const table = (id, caption, columnWidths, rows, placement) => ({ id, typeId: 'picture',
  kind: 'table', createdAt: 0, updatedAt: 0, caption, placement, table: { model: {
    headerRowCount: 1, columnWidths, rows: [rows[0].map((h, i) => head(h, i ? 'right' : 'left')),
      ...rows.slice(1).map((r) => r.map((c, i) => cell(c, i ? 'right' : 'left')))] } } });
resources.push(
  table('tides', '**High water at Wexcombe Quay**', [1.2, 1, 1, 0.9], [
    ['Day', 'Morning', 'Evening', 'Feet'], ['Sat 10', '5.12', '5.38', '16.4'],
    ['Sun 11', '5.58', '6.21', '16.9'], ['Mon 12', '6.41', '7.03', '17.2'],
    ['Tue 13', '7.23', '7.44', '17.3'], ['Wed 14', '8.04', '8.25', '17.0']],
  { position: 'here' }),
  table('pictures', '**This week at the picture houses**', [1, 2.2, 1.3], [
    ['House', 'Programme', 'Shows'], ['Regal', 'All Aboard for Lisbon', '2.30, 6, 8.30'],
    ['Electric', 'The Lone Rider of Red Mesa', '6.15, 8.40'],
    ['Both', 'Children’s matinée', 'Sat 10.30']], { position: 'here' }),
  table('wireless', '**The Regional programme**', [0.8, 2.6], [
    ['Time', 'Programme'], ['6.0', 'The Children’s Hour'], ['6.40', 'News and weather'],
    ['7.0', 'Cornish Songs, by the Wexcombe Male Voice Choir'],
    ['7.45', 'Talk: The Coasting Trade, by a ship’s master'],
    ['8.15', 'Dance Music from the Assembly Rooms'], ['10.0', 'Second news; shipping']],
  { position: 'here' }),
  table('fixtures', '**This week’s fixtures**', [1.1, 2.3, 1.1], [
    ['Day', 'Match', 'Ground'], ['Sat 10', 'Cricket: Wexcombe v. Truro', 'The Rec'],
    ['Wed 14', 'Bowls: Park v. Hayle', 'Park green'],
    ['Sat 17', 'Cricket: Redruth v. Wexcombe', 'Redruth'],
    ['Sat 24', 'County Cup final: Athletic v. Rovers', 'Gannet Park']], { position: 'here' }),
  table('wheelers', '**Fifty miles: the first five**', [0.3, 1.2, 1.9], [
    ['', 'Rider', 'Time'], ['1', 'L. Uren', '2 h 11 m 40 s'], ['2', 'T. Bray', '2 h 14 m 05 s'],
    ['3', 'S. Harvey', '2 h 15 m 52 s'], ['4', 'C. Nance', '2 h 19 m 31 s'],
    ['5', 'R. Jenkin', '2 h 20 m 18 s']], { position: 'here' }),
  table('scores', '**Wexcombe v. St Austell**', [1.6, 0.7, 1.7], [
    ['Innings', 'Runs', 'Best'], ['Wexcombe', '168', 'Dunstan 64'],
    ['St Austell', '127', 'Carne 5 for 22']], { position: 'here' }));

// #region nameplate: the front page's H1 is the paper's name, ruled above and below
const nameplate = { enabled: true, slot: { elements: [
  depth(10), // the masthead is ten grid lines deep; the rules and the dateline hang from it
  { kind: 'rule', id: 'foot', thickness: pt(2.5), color: col('ink'),
    placement: { ...at('#depth', 'align-bottom', 0, -1.5), size: { width: 'fill' } } },
  ...[['left', '{attr.issue}'], ['center', '{publishDate}'], ['right', '{attr.price}']].map(
    ([align, content]) => text(`date-${align}`, content, { ...typed(9, { fontWeight: 700 }),
      align }, { ...at('#foot', 'above', 0, -1.6), size: { width: 'fill' } })),
  rule('thin', '#date-left', 0.6, 1.8),
  text('name', '{titleText}', { ...oswald(66, 700, { textTransform: 'uppercase',
    letterSpacing: pt(1.5) }), lineHeight: 1, align: 'center' },
  { ...at('#thin', 'above', 0, -2), size: { width: 'fill' } }),
  // Two ears over the name: the paper's age on the left, the weather on the right.
  text('since', '{attr.since}', { ...caps(8, 600, 'flag'), align: 'left' },
    { ...at('container', 'top-left', 0, 1), size: { width: mm(90) } }),
  text('weather', 'Weather: {attr.weather}', { ...typed(8.5, { italic: true }), align: 'right' },
    { ...at('container', 'top-right', 0, 1), size: { width: mm(110) } }),
] } };
// #endregion

// #region pages: a section flag on each inside page, a folio line at the head
const section = { enabled: true, slot: { elements: [
  depth(3),
  { kind: 'rule', id: 'bar', thickness: pt(3), color: col('ink'),
    placement: { ...at('#depth', 'align-bottom', 0, -2), size: { width: 'fill' } } },
  text('flag', '{titleText}', { ...caps(13, 700, 'paper'), box: { backgroundColor: col('flag'),
    padding: { top: mm(1.4), right: mm(3.2), bottom: mm(1.2), left: mm(3.2) } } },
  at('#bar', 'above')),
] } };
const folio = (parity, side, s) => [
  text(`n-${parity}`, '{pageNumber}', { ...oswald(11, 700), align: side },
    at('page', `top-${side}`, s * MARGIN.side, 5)),
  text(`t-${parity}`, '{title} · {publishDate}', { ...typed(8), align: side },
    at(`#n-${parity}`, s > 0 ? 'right-of' : 'left-of', s * 3, 0.7)),
].map((element) => ({ ...element, parity }));
const header = { elements: [...folio('even', 'left', 1), ...folio('odd', 'right', -1)] };
// #endregion

const banner = { id: 'banner', backgroundEnabled: false, marginTop: pt(0),
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  marginBottom: pt(LEAD / 2), titleStyle: { ...caps(9, 700, 'flag'), gap: mm(1.4) },
  body: { fontFamily: 'Libre Caslon Text', fontSize: pt(12), lineHeight: pt(15),
    textAlign: 'center', firstLineIndent: pt(0) } };
const briefs = { id: 'briefs', background: col('tint'), columnGap: mm(GUTTER),
  padding: { top: mm(3), right: mm(4), bottom: mm(4), left: mm(4) },
  titleStyle: { ...caps(10, 700, 'flag'), gap: mm(2) },
  body: { fontFamily: 'Libre Caslon Text', fontSize: pt(8.4), lineHeight: pt(11),
    textAlign: 'left', firstLineIndent: pt(0) } };
const headline = (id, size, look = {}) => ({ id, fontFamily: 'Oswald', fontWeight: 600,
  fontSize: pt(size), lineHeight: pt(size * 1.05), marginBottom: pt(size * 0.3), ...look });
// A box in a column (the tram fares), and the small advertisements across the page's foot.
const info = { id: 'info', background: col('tint'), marginTop: pt(LEAD), marginBottom: pt(LEAD),
  padding: { top: mm(2.5), right: mm(3), bottom: mm(3), left: mm(3) },
  stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('flag') },
  titleStyle: { ...oswald(11, 600), gap: mm(1.5) },
  body: { fontFamily: 'Libre Caslon Text', fontSize: pt(8.4), lineHeight: pt(11),
    textAlign: 'left', firstLineIndent: pt(0) } };
const ads = { ...briefs, id: 'ads', background: col('paper'),
  border: { enabled: true, width: pt(0.6), color: col('ink') },
  body: { ...typed(8), lineHeight: pt(10.6), textAlign: 'left', firstLineIndent: pt(0) } };
const label = { fontFamily: 'Courier Prime', fontSize: pt(8), firstLineIndent: pt(0) };

const config = () => ({
  colorPalette, resourceTypes, videoStyle,
  page: { sizePreset: 'tabloid', dpi: 150, backgroundColor: col('paper'), // 280 × 430 mm
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.side),
      right: mm(MARGIN.side) } },
  layout: { layoutType: 'multiple', columnCount: 4, gutterWidth: mm(GUTTER),
    columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.4) } },
  bodyText: { fontFamily: 'Libre Caslon Text', fontSize: pt(8.8), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), textAlign: 'justify', firstLineIndent: mm(3),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    minWordSpacing: 0.75, maxWordSpacing: 1.6, avoidWidows: true, avoidOrphans: true,
    maxJustifyTracking: 15 }, // ‰ of an em: narrow columns justify with a little tracking
  headings: { fontFamily: 'Oswald', fontWeight: 600, marginBottom: pt(0), levels: [
    // Each section opens a page, on either side.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: section },
    { level: 2, fontSize: pt(20), lineHeight: pt(22), marginTop: pt(LEAD) },
    { level: 3, fontSize: pt(10.5), lineHeight: pt(LEAD), fontWeight: 700,
      marginTop: pt(LEAD / 2) },
  ] },
  headingStyles: [
    { id: 'front', advancedDesign: nameplate, header: { elements: [] } },
    { id: 'section' }, // inside pages: the flag of the level-1 design
    headline('lead', 44, { fontWeight: 700 }), headline('second', 20),
    headline('third', 12, { marginBottom: pt(2) }),
  ],
  calloutStyles: [banner, briefs, info, ads],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: 'Oswald',
    headerFontSize: pt(7.5), bodyFontFamily: 'Courier Prime', bodyFontSize: pt(7.8),
    cellPadding: mm(1.1) },
  paragraphStyles: [{ ...label, id: 'byline', textAlign: 'left', color: col('muted') },
    { id: 'flush', firstLineIndent: pt(0) },
    { ...label, id: 'jump', textAlign: 'right', color: col('flag') },
    { id: 'imprint', ...label, fontSize: pt(6.8), lineHeight: pt(9), textAlign: 'left',
      color: col('muted'), marginTop: pt(LEAD) }],
  captionStyle: { fontFamily: 'Courier Prime', fontSize: pt(7.8), gap: mm(1.4),
    note: { fontSize: pt(6.6), color: col('muted') } },
  header, footer: { elements: [] },
  folio: { tilt: 24, paper: { type: 'newsprint', grammage: 45, shade: '#f9f7f1' },
    binding: { type: 'folded', cover: 'pages' }, surface: { type: 'oak' },
    lighting: { environment: 'daylight' } },
});
// An unnumbered type: captions print without "Figure 1".
const resourceTypes = [{ id: 'picture', name: 'Picture', shortLabel: 'Picture',
  captionPrefix: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal' }];

// ─── 2 · Content ────────────────────────────────────────────────────────────
const front = /* @content */ ''; // content.en.md: the front page and Town & Harbour
const arts = /* @content:stage */ ''; // content.stage.en.md: Stage & Screen
const sport = /* @content:sport */ ''; // content.sport.en.md: Sport
const markdown = [front, arts, sport].join('\n\n'); // one document, four pages

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Libre Caslon Text': ['400', '400i', '700'], Oswald: ['600', '700'],
  'Courier Prime': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(resources.filter((r) => r.kind === 'video').map(({ video: { poster } }) =>
  loadImage(poster.fileId, asset(poster.fileId)))); // the printed frames
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: 'The Wexcombe Lantern · a living newspaper' });

// #region folio: the newspaper in 3D, every clip playing on the open pages at once
const stage = Object.assign(document.createElement('section'),
  { id: 'folio', ariaLabel: 'The newspaper in 3D' });
stage.style.cssText = 'height: min(82vh, 820px); margin: 0 auto; max-width: 1280px';
document.getElementById('pages').before(stage);
createFolioFromDocument(stage, doc, {
  // Folio plays each clip from its video.url, muted, while its page is on show.
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' },
  onChange: ({ pages }) => kitStatus(`${doc.pages.length} pages · open at `
    + pages.map((i) => doc.pages[i].pageLabel || i + 1).join('–')),
});
// #endregion

// @kit
