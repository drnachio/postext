// ═══ Postext Cookbook · Nº 018 · Section heads seven levels deep ═════════════════
// https://postext.dev/en/cookbook/section-heads-field-manual
// Code: MIT · Text: original (CC BY 4.0) · Picture: drawn in code (MIT)
// Fonts: IBM Plex Serif, Sans Condensed, Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'section-heads-field-manual';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // forest green for structure, a signal amber for numbers
  ink: '#1d2320', // text: a green-black
  band: '#2f6b3f', // the accent: rules, run-in terms, bullets, numbers, folios (6.4:1)
  signal: '#e0a526', // the number pills, with ink on them (7.3:1)
  sage: '#7a9e80', // the second bullet and the profile's upper contours
  tint: '#e9f0e6', // the opener's sky; the legend on the green (5.5:1)
  muted: '#5f6a62', // running heads, level 7, roman list numbers, the colophon (5.6:1)
};
// col(id): a colour linked to its palette entry, in text styles and design slots alike.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// Defaults this config does not restate link to 'main-color', so it points at the accent.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.band })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const TRIM = { width: 176, height: 250 }; // mm: ISO B5, a common size for field manuals
const [TOP, INNER, OUTER] = [22, 16, 14]; // mm: margins; the running heads align to OUTER
const LEAD = 13.2; // pt: the body leading, the pitch of the baseline grid
const LINES = 44; // grid lines in the text block, so every full column ends on one baseline
const [DISPLAY, LABEL] = ['IBM Plex Sans Condensed', 'IBM Plex Mono']; // with the serif text
const at = (to, edge, x, y) => ({ anchor: { to, edge }, offset: { x, y } });

// #region answer: section numbers 1.1 … 1.12 in an amber pill that widens with the number
const H2 = 13.5; // pt: the number and the title share one size and one line height,
const LH = 1.2; // so, under the same top padding, they share one baseline
// Every section head starts on a grid line, so the 3 pt the pill falls short of two lines
// is the gap the grid snap leaves between the pill and the text under it.
const PILL_H = 2 * LEAD - 3, PAD = (PILL_H - H2 * LH) / 2; // pt
const face = { fontFamily: DISPLAY, fontWeight: 700, fontSize: pt(H2), lineHeight: LH };
const pill = { kind: 'text', id: 'pill', content: '{number}', ...face, color: col('ink'),
  box: { backgroundColor: col('signal'), borderRadius: mm(3), // no width: the pill is its
    padding: { top: pt(PAD), bottom: pt(PAD), left: mm(1.8), right: mm(1.8) } }, // number
  placement: at('container', 'top-left') }; // plus its padding
// 'right-of' hangs the title on the pill's right edge and aligns its lines left, so a long
// title wraps beside the number, never under it.
const sectionTitle = (from) => ({ kind: 'text', id: 'title', content: '{titleText}', ...face,
  color: col('ink'), overflow: 'wrap', box: { padding: { top: pt(PAD) } },
  placement: at(`#${from}`, 'right-of', mm(2.2)) });
// The H1 counter, a point, the H2 counter: 1.1 … 1.12 in the pill. h2 joins headings.levels.
const h2 = { level: 2, numberingTemplate: '{1}.{2}',
  advancedDesign: { enabled: true, slot: { elements: [pill, sectionTitle('pill')] } } };
// #endregion

// #region ruled: level 3, a green rule over the number and a tracked capital title
// A rule, a mono number and a tracked title: three elements, so this head is a design.
const small = { fontSize: pt(8.4), lineHeight: LH };
const DROP = 6; // pt: the rule drops this far toward the number, which keeps its grid line
const h3 = { level: 3, numberingTemplate: '{1}.{2}.{3}', // 1.5.1: restarts under every H2
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.75), color: col('band'),
      placement: { ...at('container', 'top-left', mm(0), pt(DROP)), size: { width: 'fill' } } },
    { kind: 'text', id: 'num', content: '{number}', fontFamily: LABEL, fontWeight: 500, ...small,
      color: col('band'), placement: at('#rule', 'below', mm(0), pt(LEAD - DROP)) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontWeight: 600,
      ...small, letterSpacing: pt(1.35), textTransform: 'uppercase', color: col('ink'),
      overflow: 'wrap', placement: at('#num', 'right-of', mm(2)) },
  ] } } };
// #endregion

// #region opener: the chapter number in the section pill, scaled up, over the trail's profile
const DEPTH = 96; // mm: the profile's foot, measured from the top of the page
const CLEAR = 6; // mm: the least room between the profile's foot and the text under it
const LEGEND = 7; // mm: how far the legend's top sits above the profile's foot
const big = { ...face, fontSize: pt(54), lineHeight: 1, color: col('ink') };
// The opener reserves height down to the profile's foot; minHeight reaches CLEAR mm past
// it, so the text starts on the first grid line CLEAR mm or more under the picture.
const opener = { enabled: true, minHeight: mm(DEPTH - TOP + CLEAR), slot: { elements: [
  { kind: 'image', id: 'profile', resourceId: 'profile',
    placement: { ...at('page', 'top-left'), size: { width: 'fill' } } },
  { kind: 'text', id: 'num', content: '{number}', ...big, box: { backgroundColor: col('signal'),
    borderRadius: mm(4), padding: { top: pt(4), bottom: pt(4), left: mm(4), right: mm(4) } },
    placement: at('container', 'top-left') },
  { kind: 'text', id: 'title', content: '{titleText}', ...big, box: { padding: { top: pt(4) } },
    placement: at('#num', 'right-of', mm(4)) },
  { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: 'IBM Plex Serif', italic: true,
    fontSize: pt(11.5), lineHeight: 1.3, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { ...at('#num', 'below', mm(0), mm(5)), size: { width: mm(100) } } },
  // The legend is design text over the picture: each edition words it in its heading.
  { kind: 'text', id: 'legend', content: '{attr.profile}', fontFamily: LABEL, fontWeight: 500,
    fontSize: pt(7), color: col('tint'), placement: at('page', 'top-right', mm(-OUTER),
      mm(DEPTH - LEGEND)) },
] } };
// #endregion

// #region levels: numbers down to 1.1.1, then italic, bold and label faces for 4 to 6
const headings = { fontFamily: DISPLAY, color: col('ink'), // every head sits on the grid,
  lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(0), // a line above, none below
  levels: [
    // Each chapter opens on a recto.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      numberingTemplate: '{1}', advancedDesign: opener },
    h2, h3,
    // No template below level 3, so no number: each level changes face, colour or case.
    { level: 4, fontFamily: 'IBM Plex Serif', fontWeight: 400, italic: true, fontSize: pt(11) },
    { level: 5, fontSize: pt(9.4), color: col('band') },
    { level: 6, fontFamily: LABEL, fontWeight: 600, fontSize: pt(7.8), textTransform: 'uppercase' },
  ] };
// #endregion

// #region styles: a seventh level and an unnumbered section as heading styles; run-in terms
const headingStyles = [
  // Markdown stops at ######: '###### Rock bar {style="level7"}' stays level 6 in the
  // outline and is set in lower case, lighter and grey.
  { id: 'level7', fontFamily: DISPLAY, fontWeight: 500, italic: true, fontSize: pt(8.4),
    textTransform: 'none', color: col('muted') },
  // numbered: false: no number, and the H2 counter does not move. An empty {number} would
  // still paint the amber pill, so the style draws a hollow square in its place.
  { id: 'checklist', numbered: false, advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'box', id: 'box', style: { borderColor: col('signal'), borderWidth: pt(1.8),
      borderRadius: mm(1.5) }, placement: { ...at('container', 'top-left'),
      size: { width: pt(PILL_H), height: pt(PILL_H) } } },
    sectionTitle('box'),
  ] } } },
];
const paragraphStyles = [
  // Run-in heads: the bold term opening each rule prints in the accent, not in body ink.
  { id: 'rules', boldColor: col('band'), firstLineIndent: pt(0) },
  { id: 'colophon', fontFamily: LABEL, fontSize: pt(6.8), lineHeight: pt(9),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
];
// #endregion

// #region lists: bullets that fade with depth; numbers 1. then a) then i.; task boxes
// Zero margins keep lists on the grid; a '- [ ]' item's bullet becomes taskCheckboxChar, '☐'.
const unorderedLists = { gap: mm(2), marginTop: pt(0), marginBottom: pt(0), color: col('band'),
  levels: [{ level: 2, bulletChar: '–', color: col('sage') }] }; // '•' stays at level 1
// Level 1 keeps the defaults: 'arabic' and a full stop.
const orderedLists = { fontFamily: DISPLAY, color: col('band'), gap: mm(1.6),
  marginTop: pt(0), marginBottom: pt(0), levels: [
    { level: 2, numberFormat: 'lower-alpha', separator: ')' },
    { level: 3, numberFormat: 'lower-roman', color: col('muted') }] };
// #endregion

// Running heads, HEAD mm from the trim: folio and book on versos, chapter and folio on rectos.
const HEAD = 12; // mm; an opener keeps only a drop folio, HEAD mm above its foot
const FOLIO_GAP = 9; // mm from a folio to the title beside it
const runHead = { fontFamily: DISPLAY, fontWeight: 600, fontSize: pt(7.8), letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('muted') };
const folio = { ...runHead, fontFamily: LABEL, color: col('band') };
const head = (id, content, parity, edge, x, style = runHead) => ({ kind: 'text', id, content,
  parity, pages: 'body', ...style, placement: at('page', edge, mm(x), mm(HEAD)) });

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // each edition's hyphenation patterns
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - (LINES * LEAD * 25.4) / 72),
      left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  bodyText: { fontFamily: 'IBM Plex Serif', fontSize: pt(9.4), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    minWordSpacing: 0.85, maxWordSpacing: 1.4 }, // a narrow band: an even grey, line to line
  headings, headingStyles, paragraphStyles, unorderedLists, orderedLists,
  header: { elements: [head('v-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
    head('v-book', '{title}', 'even', 'top-left', OUTER + FOLIO_GAP),
    head('r-chapter', t({ en: 'Chapter {chapterNumber} · {chapterTitle}',
      es: 'Capítulo {chapterNumber} · {chapterTitle}' }), 'odd', 'top-right', -(OUTER + FOLIO_GAP)),
    head('r-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
  ] },
  footer: { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}', pages: 'opener',
    ...folio, placement: at('page', 'bottom', mm(0), mm(-HEAD)) }] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// The profile is a resource that no :ref cites: only the opener's image element draws it.
const resources = [{ id: 'profile', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'profile.svg', width: TRIM.width * 10, height: DEPTH * 10 },
  altText: t({ en: 'A 376 m climb in 4.2 km; amber dots mark twelve sites flagged for water bars.',
    es: 'Subida de 376 m en 4,2 km; puntos ámbar en doce sitios balizados para desviadores.' }) }];

// #region art: the trail's elevation profile, drawn in code with a seeded PRNG
function profileSvg() {
  // Survey points, distance (km) and elevation (m): an easy valley, then the climb.
  const KM = 4.2;
  const pts = [[0, 1180], [0.8, 1190], [1.5, 1204], [2.1, 1226], [2.6, 1262], [3.0, 1330],
    [3.35, 1412], [3.7, 1486], [4.0, 1535], [4.2, 1556]];
  const Y0 = DEPTH - 12; // mm: where 1180 m sits in the picture
  const K = 50 / 376; // mm of picture per metre of climb
  const elev = (d) => { // smoothstep between survey points: monotone, no overshoot
    const next = pts.findIndex(([x]) => x > d);
    const i = next < 0 ? pts.length - 2 : Math.max(0, next - 1);
    const [[x0, e0], [x1, e1]] = [pts[i], pts[i + 1]];
    const u = Math.min(1, (d - x0) / (x1 - x0));
    return e0 + (e1 - e0) * u * u * (3 - 2 * u);
  };
  let seed = 18; // Mulberry32: the same wobble on every run
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const N = 220;
  const crest = Array.from({ length: N + 1 }, (_, i) => [(TRIM.width * i) / N,
    Y0 - (elev((KM * i) / N) - 1180) * K + (rand() - 0.5) * 0.5]);
  const xy = (list) => list.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L');
  // Contour bands every 50 m, from the band green in the valley to sage on the ridge: each
  // band is the profile clipped between two contours.
  const mix = (a, b, u) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16)
    * (1 - u) + parseInt(b.slice(i, i + 2), 16) * u).toString(16).padStart(2, '0')).join('');
  const bands = Array.from({ length: 8 }, (_, k) => {
    const floor = Y0 - k * 50 * K;
    const top = crest.map(([x, y]) => [x, Math.min(floor, Math.max(y, floor - 50 * K))]);
    return `<path d="M0 ${floor}L${xy(top)}L${TRIM.width} ${floor}Z" `
      + `fill="${mix(palette.band, palette.sage, k / 7)}"/>`;
  }).join('');
  // The twelve flagged sites, placed one per 32 m of climb: they crowd where it steepens.
  const dots = Array.from({ length: 12 }, (_, k) => {
    const target = 1180 + 32 * (k + 0.5);
    let [lo, hi] = [0, KM];
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      if (elev(mid) < target) lo = mid; else hi = mid;
    }
    return `<circle cx="${((TRIM.width * lo) / KM).toFixed(2)}" `
      + `cy="${(Y0 - (target - 1180) * K).toFixed(2)}" r="1.9" fill="${palette.signal}" `
      + `stroke="${palette.ink}" stroke-width="0.35"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TRIM.width * 10}" `
    + `height="${DEPTH * 10}" viewBox="0 0 ${TRIM.width} ${DEPTH}">`
    + `<rect width="${TRIM.width}" height="${DEPTH}" fill="${palette.tint}"/>`
    + `<path d="M0 ${DEPTH}L${xy(crest)}L${TRIM.width} ${DEPTH}Z" fill="${palette.band}"/>`
    + `${bands}<path d="M${xy(crest)}" fill="none" stroke="${palette.ink}" `
    + `stroke-width="0.7" stroke-linejoin="round"/>${dots}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages paint, loaded before the first build.
const FONTS = { 'IBM Plex Serif': ['400', '400i', '700'],
  'IBM Plex Sans Condensed': ['500i', '600', '700'], 'IBM Plex Mono': ['400', '500', '600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('profile.svg', profileSvg());
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Section heads seven levels deep',
  es: 'Títulos de sección hasta siete niveles' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
