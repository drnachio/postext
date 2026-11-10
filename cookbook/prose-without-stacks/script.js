// ═══ Postext Cookbook · Nº 184 · Prose without stacks ═════════════════════════════
// https://postext.dev/en/cookbook/prose-without-stacks
// Code: MIT · Text: Dickens, 1843; Clarín, 1893 (public domain) · Paintings: diffusion model
// Fonts: Spectral, Spectral SC, Cormorant Garamond (SIL OFL 1.1) · Needs postext ≥ 1.73.0
//
// A pocket edition set twice from the same text. The first proof keeps the line breaks the
// breaker finds and reports every stack (two lines in a row that end or start alike); the
// second weighs each stack in the breaker's demerits and sets the paragraph another way.
// Each proof marks its stacks in the text and lists them on a slip after the colophon.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'prose-without-stacks';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a proofreader's red pencil over a warm book ink
const palette = {
  ink: '#241f1b', // text: a warm near-black
  accent: '#8e2f1d', // kicker, the slip's stripe and label: the red of a proof pencil
  mark: '#f4cfc2', // the band under a stacked word, pale enough for ink on top
  tint: '#f5efe6', // the slip's background
  rule: '#d2c8bb', // hairlines
  muted: '#6b6158', // running heads, colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [TEXT, LABEL, DISPLAY] = ['Spectral', 'Spectral SC', 'Cormorant Garamond'];
const [BODY, LEAD] = [9.6, 13.4]; // pt
const LINE = (LEAD * 25.4) / 72; // mm: one line, 4.73
const [TRIM_W, TRIM_H, TOP, INNER, OUTER, LINES] = [115, 180, 17, 15, 17, 30];
const MEASURE = TRIM_W - INNER - OUTER; // 83 mm: about 50 characters, a narrow pocket measure

// #region answer: stacks reported in the first proof and weighed in the second
const bodyText = {
  fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
  hyphenation: { enabled: true }, optimalLineBreaking: true, // stacks need the K–P breaker
  avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  // A stack: two lines in a row that end on the same word or the same last characters
  // (“sole” over “sole”), or that start alike (“The” over “the”). 'warn' reports each one
  // and changes nothing; 'avoid' adds stackPenalty to the demerits of every break that
  // makes one, so the breaker sets the paragraph another way where the spacing allows.
  stacks: 'avoid', // the first proof sets 'warn' (see proofs)
  // Three characters by default; the Spanish rule counts a repeated syllable (co-/co-).
  stackMinCharacters: t({ en: 3, es: 2 }),
  // Default 3000, the cost of two hyphens in a row; a monosyllable (“his”, “lo”) costs twice.
  // 3000 kept two stacks of the first proof per edition: 10000 trades them for looser lines.
  stackPenalty: 10000,
  maxWordSpacing: 2, // the default: past it a line is never set, stack or not
};
// #endregion

// #region opener: the painting over the measure, kicker and title under it
const PICTURE = { width: MEASURE, height: 11 * LINE }; // 83 × 52 mm, the painting's 3:2
const at = (to, edge, y, size) => ({ anchor: { to, edge }, offset: { x: mm(0), y: mm(y) },
  ...(size && { size }) });
const opener = {
  enabled: true, minHeight: pt(16 * LEAD), // the text starts on the seventeenth line
  slot: { elements: [
    { kind: 'image', id: 'art', resourceId: '{attr.art}', fit: 'cover', placement: at('container',
      'top', 0, { width: mm(PICTURE.width), height: mm(PICTURE.height) }) },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: LABEL, fontWeight: 600,
      fontSize: pt(8.5), letterSpacing: pt(1.7), color: col('accent'), align: 'left',
      placement: at('container', 'top-left', PICTURE.height + 5.5) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, italic: true,
      fontWeight: 500, fontSize: pt(27), lineHeight: 1.05, color: col('ink'), align: 'left',
      placement: at('#kicker', 'below', 1.5, { width: mm(MEASURE), height: 'auto' }) },
  ] },
};
// #endregion

// #region heads: the author on the verso, the title on the recto, a drop folio on the opener
const head = (id, content, parity, edge, x, extra = {}, y = 10.5) => ({ kind: 'text', id,
  content, parity, pages: 'body', fontFamily: LABEL, fontWeight: 500, fontSize: pt(8),
  letterSpacing: pt(1.2), color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } }, ...extra });
const folio = { fontFamily: TEXT, letterSpacing: pt(0), color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-author', '{author}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{title}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'odd', 'bottom-right', -OUTER,
  { ...folio, pages: 'opener' }, -11)] }; // the opener's folio sits at the foot
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }), // each edition's hyphenation patterns
  colorPalette,
  page: { width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(TRIM_H - TOP - LINES * LINE), left: mm(INNER),
      right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText,
  headings: { fontFamily: DISPLAY, color: col('ink'), levels: [{ level: 1,
    breakBefore: { enabled: true, parity: 'odd' }, marginBottom: pt(0),
    advancedDesign: opener }] },
  // The band under a stacked word: painted under ordinary text, so the lines stay as set.
  markStyles: [{ id: 'stack', name: t({ en: 'Stack', es: 'Repetición' }), background: col('mark'),
    color: col('ink'), paddingX: em(0.1), paddingTop: em(0.02), paddingBottom: em(0.08) }],
  calloutStyles: [{ id: 'proof', title: t({ en: 'Proof', es: 'Prueba' }),
    background: col('tint'), stripe: { enabled: true, side: 'top', width: pt(2.5),
      color: col('accent') },
    padding: { top: mm(2.5), right: mm(3.5), bottom: mm(2.5), left: mm(3.5) },
    titleStyle: { fontFamily: LABEL, fontSize: pt(8), fontWeight: 600, letterSpacing: pt(1.2),
      color: col('accent') },
    body: { fontFamily: TEXT, fontSize: pt(8.2), lineHeight: pt(11.2), color: col('ink'),
      textAlign: 'left', firstLineIndent: pt(0), boldColor: col('ink'),
      italicColor: col('ink') } }],
  paragraphStyles: [{ id: 'colophon', fontFamily: TEXT, fontSize: pt(7.2), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header, footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region art: the opener's painting, one per edition: a JPEG in assets/, no lettering
const ART = t({ en: 'carol', es: 'cordera' }); // the heading's art="…" attribute
const resources = [{ id: ART, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${ART}-1100.jpg`, format: 'jpeg', width: 1100, height: 733 },
  altText: t({
    en: 'A Victorian counting-house on a foggy evening: through the open door an old man in '
      + 'black counts coins at a high desk by a small fire, and a clerk writes by one candle.',
    es: 'Un prado en cuesta de Asturias: una vaca rubia echada en la hierba, dos niños '
      + 'abrazados a un poste del telégrafo y, abajo, un tren que sale de la trinchera.' }) }];
const ARTS = { carol: asset('carol-1100.jpg'), cordera: asset('cordera-1100.jpg') };
await loadImage(`${ART}-1100.jpg`, ARTS[ART]);
// #endregion
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Spectral: ['400', '400i', '600'], 'Spectral SC': ['500', '600'],
  'Cormorant Garamond': ['500i'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region marks: each stack the build reported, marked on both of its lines
// A warning names its first line by its place in the source. The repeated edge of that
// line and the next is found in each line's stretch of the source and the whole word
// around it wrapped in :mark[…]: a band under ordinary text, so the breaks stay the same.
const LETTER = /[\p{L}\p{N}’-]/u;
const edgeOf = (text, n, end) => { // the words at a line's edge holding its first/last n
  const s = text.replace(end ? /[^\p{L}\p{N}]+$/u : /^[^\p{L}\p{N}]+/u, '');
  const cut = end ? s.lastIndexOf(' ', s.length - n) + 1 : s.indexOf(' ', n);
  return end ? s.slice(cut) : s.slice(0, cut < 0 ? undefined : cut);
};
function markStacks(source, doc, stacks) {
  const lines = doc.blocks.flatMap((b) => b.lines.map((line, i) => [line, b.lines[i + 1]]));
  const spans = new Map(); // start → end of each marked word in the source
  for (const w of stacks) {
    const pair = lines.find(([line]) => line.sourceStart === w.sourceStart);
    for (const line of pair?.[1] ? pair : []) {
      const piece = edgeOf(line.text.trim(), w.text.length, w.edge === 'end');
      const range = source.slice(line.sourceStart, line.sourceEnd);
      let from = line.sourceStart
        + (w.edge === 'end' ? range.lastIndexOf(piece) : range.indexOf(piece));
      if (from < line.sourceStart) continue;
      let to = from + piece.length; // a piece of a hyphenated word takes the whole word
      while (from > 0 && LETTER.test(source[from - 1])) from--;
      while (to < source.length && LETTER.test(source[to])) to++;
      if (!/[*_[\]\n]/.test(source.slice(from, to))) spans.set(from, to);
    }
  }
  return [...spans].sort(([x], [y]) => y - x).reduce((md, [from, to]) => `${md.slice(0, from)}`
    + `:mark[${md.slice(from, to)}]{style="stack"}${md.slice(to)}`, source);
}
// #endregion

// #region proofs: the same text twice, 'warn' then 'avoid', each with its stacks marked
const quote = (s) => t({ en: `“${s}”`, es: `«${s}»` });
const SIDE = { end: t({ en: 'end', es: 'final' }), start: t({ en: 'start', es: 'principio' }) };
const tally = (n) => t({ en: `${n} stack${n === 1 ? '' : 's'}`,
  es: `${n} repetici${n === 1 ? 'ón' : 'ones'}` });
const byPage = (stacks) => Object.entries(Object.groupBy(stacks, (w) => w.pageIndex + 1))
  .map(([page, list]) => `${t({ en: 'p.', es: 'pág.' })} ${page}: ${list.map((w) =>
    `${quote(w.text)} (${SIDE[w.edge]})`).join(', ')}.`);
const slip = (mode, stacks) => ['', `:::callout{type="proof" title="${mode === 'warn'
  ? t({ en: 'First proof', es: 'Primeras pruebas' })
  : t({ en: 'Second proof', es: 'Segundas pruebas' })}"}`,
`${t({ en: 'Set with', es: 'Compuesto con' })} stacks: '${mode}' · ${tally(stacks.length)}.`,
...byPage(stacks).flatMap((line) => ['', line]), ':::', ''].join('\n');
const build = (md, stacks) => buildDocumentWithFonts({ markdown: md, resources },
  { ...config, bodyText: { ...bodyText, stacks } }, kitFonts(FONTS));
async function proof(mode) {
  const plain = await build(markdown, mode); // pass 1: where the stacks are
  const stacks = (plain.contentWarnings ?? []).filter((w) => w.kind === 'stack');
  return build(markStacks(markdown, plain, stacks) + slip(mode, stacks), mode); // pass 2
}
const docs = { warn: await proof('warn'), avoid: await proof('avoid') };
// #endregion

const TITLE = t({ en: 'Prose without stacks', es: 'Prosa sin repeticiones' });
const show = (key) => showPages(docs[key], { title: `${TITLE} · stacks: '${key}'` });
const button = (key) => Object.assign(document.createElement('button'),
  { type: 'button', textContent: key, onclick: () => show(key) });
document.getElementById('pt-actions').prepend(button('warn'), button('avoid'));
show('warn');

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
