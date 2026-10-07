// ═══ Postext Cookbook · Nº 148 · A comic EPUB read panel by panel ═══════════════════
// https://postext.dev/en/cookbook/comic-epub-guided-view
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Comic Neue, Bangers and the faces of five editions (OFL) · Needs postext ≥ 1.21.0
//
// A short comic laid out once and exported four ways: a PDF for print, a fixed-layout EPUB
// whose region-based navigation lets a reading system step through it panel by panel, the
// same EPUB with Kindle Panel View, and a reflowable EPUB with each panel's lines as text.
// Each file is read back to list what a reader will find in it.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { renderToEpub, readEpub } from 'https://esm.sh/postext-epub';

const LANG = 'en'; // @lang: the sample's language ('en' | 'es' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt')
const RECIPE = 'comic-epub-guided-view';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the night sea, the lighthouse red and the yellow of the captions
const palette = {
  ink: '#1b2430', // panel borders, lettering and the title page
  accent: '#b8322a', // the lighthouse red: title and sound effects
  caption: '#f4e7bf', // caption boxes
  muted: '#5f6873', // folios and the imprint
  paper: '#fdfbf6',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion

// #region editions: six editions, each lettered in faces for its script
const [LETTERING, SFX] = t({
  en: ['Comic Neue', 'Bangers'], es: ['Comic Neue', 'Bangers'], ca: ['Comic Neue', 'Bangers'],
  ja: ['Zen Antique', 'Dela Gothic One'], zh: ['ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou'],
  ar: ['Playpen Sans Arabic', 'Lalezar'], pt: ['Comic Neue', 'Bangers'],
});
// #endregion

const comics = {
  gutter: { horizontal: mm(4), vertical: mm(3) },
  panel: { borderWidth: pt(1), borderColor: col('ink'), background: col('paper') },
  lettering: { fontFamily: LETTERING, fontSize: pt(8), color: col('ink'), inset: mm(1.5) },
  balloonStyles: [{ id: 'speech', stroke: col('ink') }, { id: 'caption', fill: col('caption'),
    stroke: col('ink') }, { id: 'sfx', fontFamily: SFX, color: col('accent') }],
  // The names the reflowable EPUB prints before each line ("Maya: …").
  cast: [{ id: 'maya', name: 'Maya' }, { id: 'tomas', name: t({ en: 'Tomás', es: 'Tomás',
    ca: 'Tomàs', zh: '托马斯', ar: 'توماس', ja: 'トマス', pt: 'Tomás' }) }],
  runningHeads: true, // the folio on every comic page
};
const footer = { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', pages: 'comic',
  fontFamily: LETTERING, fontSize: pt(7.5), color: col('muted'), align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: mm(0), y: mm(-8) } } }] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-gb', es: 'es', ca: 'ca', ja: 'ja', zh: 'zh-Hans', ar: 'ar', pt: 'pt-BR' }),
  colorPalette, comics,
  // The trim of an American comic book, 6⅝ × 10³⁄₁₆ in.
  page: { sizePreset: 'custom', width: mm(168), height: mm(259), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(14), bottom: mm(18), left: mm(13), right: mm(11), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: LETTERING, fontSize: pt(10.5), lineHeight: pt(15), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'), textAlign: 'left',
    firstLineIndent: pt(0), paragraphSpacing: true, hyphenation: { enabled: false } },
  headings: { fontFamily: SFX, color: col('accent'), fontWeight: 400,
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, fontSize: pt(44), lineHeight: pt(48), breakBefore: { enabled: true,
        parity: 'any' }, marginTop: mm(60), marginBottom: pt(15) },
      { level: 2, fontFamily: LETTERING, fontSize: pt(14), fontWeight: 700, color: col('ink'),
        marginTop: pt(0), marginBottom: pt(15) },
    ] },
  paragraphStyles: [{ id: 'imprint', fontSize: pt(7.5), lineHeight: pt(10), color: col('muted'),
    marginTop: mm(90) }], header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the five pictures of Nº 144, with the same safe areas and anchors
const face = (x, y, width, height) => ({ x, y, width, height });
const ART = {
  'lh-arrive': { width: 1100, height: 733, safeArea: face(0.22, 0.08, 0.4, 0.64),
    anchors: [{ id: 'maya', x: 0.29, y: 0.52, face: face(0.22, 0.42, 0.12, 0.16) },
      { id: 'biscuit', x: 0.4, y: 0.68, face: face(0.37, 0.64, 0.07, 0.08) }],
    avoid: [face(0.51, 0.09, 0.1, 0.43)] },
  'lh-radio': { width: 1000, height: 1000, safeArea: face(0.11, 0.36, 0.36, 0.31),
    anchors: [{ id: 'tomas', x: 0.345, y: 0.52, face: face(0.29, 0.4, 0.16, 0.18) }],
    avoid: [face(0, 0.44, 0.22, 0.26)] },
  'lh-maya': { width: 1100, height: 1100, safeArea: face(0.25, 0.27, 0.41, 0.68),
    anchors: [{ id: 'maya', x: 0.54, y: 0.565, face: face(0.4, 0.33, 0.24, 0.29) }],
    avoid: [face(0.27, 0.73, 0.25, 0.22)] },
  'lh-biscuit': { width: 1000, height: 1000, safeArea: face(0.58, 0.25, 0.42, 0.33),
    anchors: [{ id: 'biscuit', x: 0.72, y: 0.355, face: face(0.64, 0.27, 0.2, 0.18) }],
    avoid: [face(0.93, 0.28, 0.07, 0.24), face(0, 0.72, 0.4, 0.1)] },
  'lh-beam': { width: 1200, height: 800, safeArea: face(0.15, 0.01, 0.25, 0.3),
    anchors: [{ id: 'maya', x: 0.235, y: 0.15, face: face(0.21, 0.11, 0.05, 0.07) },
      { id: 'tomas', x: 0.3, y: 0.145, face: face(0.28, 0.11, 0.04, 0.06) }],
    avoid: [face(0.79, 0.55, 0.08, 0.09)] },
};
const ALT = {
  'lh-arrive': t({ en: 'Maya walks up the coastal path to the lighthouse, the cat ahead of her.',
    es: 'Maya sube por el camino de la costa hacia el faro, con el gato delante.',
    ca: 'La Maya puja pel camí de la costa cap al far, amb el gat al davant.',
    zh: '玛雅沿着海边小路走向灯塔，猫走在她前面。',
    ar: 'مايا تصعد الدرب الساحلي إلى المنارة والقط أمامها.',
    ja: 'マヤが海辺の小道を灯台へのぼっていく。前を猫が歩く。',
    pt: 'Maya sobe a trilha da costa até o farol, com o gato na frente.' }),
  'lh-radio': t({ en: 'The old keeper taps his valve radio, microphone in hand.',
    es: 'El viejo farero golpea su radio de válvulas con el micrófono en la mano.',
    ca: 'El vell faroner pica la ràdio de vàlvules amb el micròfon a la mà.',
    zh: '老守塔人手握话筒，敲着他的电子管收音机。',
    ar: 'الحارس العجوز ينقر على مذياعه القديم والميكروفون في يده.',
    ja: '老灯台守がマイクを握り、真空管ラジオをたたく。',
    pt: 'O velho faroleiro dá umas batidinhas no rádio valvulado, com o microfone na mão.' }),
  'lh-maya': t({ en: 'Maya frowns at the floor and points down.',
    es: 'Maya frunce el ceño mirando al suelo y señala hacia abajo.',
    ca: 'La Maya arrufa les celles mirant a terra i assenyala avall.',
    zh: '玛雅皱着眉看着地板，手指向下。',
    ar: 'مايا تعقد حاجبيها ناظرةً إلى الأرض وتشير إلى أسفل.',
    ja: 'マヤが眉をひそめて床を見つめ、下を指さす。',
    pt: 'Maya franze a testa olhando para o chão e aponta para baixo.' }),
  'lh-biscuit': t({ en: 'The fat orange cat sleeps on his back on the radio cable.',
    es: 'El gato naranja gordo duerme panza arriba sobre el cable de la radio.',
    ca: 'El gat taronja gras dorm panxa enlaire sobre el cable de la ràdio.',
    zh: '胖橘猫四脚朝天睡在收音机的电线上。',
    ar: 'القط البرتقالي السمين نائم على ظهره فوق سلك المذياع.',
    ja: '太ったオレンジ色の猫が、ラジオのコードの上であおむけに眠っている。',
    pt: 'O gato laranja gordo dorme de barriga para cima sobre o cabo do rádio.' }),
  'lh-beam': t({ en: 'Night: the beam sweeps the sea; Maya and her grandfather stand on the '
      + 'gallery.',
    es: 'De noche, el haz barre el mar; Maya y su abuelo están en la galería.',
    ca: 'De nit, el feix escombra el mar; la Maya i el seu avi són a la galeria.',
    zh: '夜里，光束扫过海面；玛雅和外公站在回廊上。',
    ar: 'ليلًا يمسح الشعاع البحر، ومايا وجدّها على الشرفة.',
    ja: '夜。光の帯が海をなでる。マヤと祖父が回廊に立つ。',
    pt: 'À noite, o facho varre o mar; Maya e o avô estão na galeria.' }),
};
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face of the six editions; each edition loads the latin files of all of them and the
// Japanese, Chinese or Arabic files of its own two (gotcha: fonts-first).
const FONTS = {
  'Comic Neue': ['400', '400i', '700', '700i'],
  Bangers: ['400'],
  'Zen Antique': ['400'],
  'Dela Gothic One': ['400'],
  'ZCOOL KuaiLe': ['400'],
  'ZCOOL QingKe HuangYou': ['400'],
  'Playpen Sans Arabic': ['400', '700'],
  Lalezar: ['400'],
};

// #region embed: the files the pages use, as the EPUB's font files
// For each weight and style the lettering asks for, the file loadComicFonts chose (the
// nearest one Fontsource ships), only the slices whose characters the book sets. A file that
// serves several weights is embedded once, with a weight range ('400 700').
const inRange = (range, cp) => range.split(',').some((part) => {
  const [lo, hi = lo] = part.trim().slice(2).split('-');
  return cp >= parseInt(lo, 16) && cp <= parseInt(hi, 16);
});
async function epubFonts(families, text) {
  const cps = [...new Set(text)].map((ch) => ch.codePointAt(0));
  const byFile = new Map(); // url → the face it serves
  for (const family of families) {
    const meta = await fontsourceMeta(family);
    const asks = [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']];
    for (const [weight, style] of asks) {
      const w = meta.weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a),
        400);
      const s = style === 'italic' && meta.styles.includes('italic') ? 'italic' : 'normal';
      for (const { url, range } of await comicFaceFiles(family, w, s, meta, text)) {
        if (range && !cps.some((cp) => inRange(range, cp))) continue;
        const face = byFile.get(url) ?? { family, style: s, weights: new Set(), range };
        face.weights.add(weight);
        byFile.set(url, face);
      }
    }
  }
  return Promise.all([...byFile].map(async ([url, { family, style, weights, range }]) => ({
    family, style, format: 'woff2', unicodeRange: range,
    weight: weights.size > 1 ? `${Math.min(...weights)} ${Math.max(...weights)}` : [...weights][0],
    bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) })));
}
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const faces = { [LETTERING]: FONTS[LETTERING], [SFX]: FONTS[SFX] };
await loadFonts(FONTS, markdown);
await loadCjkFonts(faces, markdown, { vertical: LANG === 'ja' }); // ja balloons are vertical
await loadArabicFonts(faces, markdown);
await loadComicFonts(faces, markdown); // the bold and italic the faces do not ship
const panel = (id, url) => comicPanel(id, url, { ...ART[id], alt: ALT[id] });
const resources = await Promise.all([
  panel('lh-arrive', asset('lh-arrive.jpg')), panel('lh-radio', asset('lh-radio.jpg')),
  panel('lh-maya', asset('lh-maya.jpg')), panel('lh-biscuit', asset('lh-biscuit.jpg')),
  panel('lh-beam', asset('lh-beam.jpg')),
]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'A comic EPUB read panel by panel',
  es: 'Un EPUB de cómic que se lee viñeta a viñeta', pt: 'Um EPUB de HQ lido quadro a quadro' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// #region answer: the same document as a fixed EPUB with regions, for Kindle, and reflowable
// The fixed layout keeps every printed page and writes regions.xhtml (EPUB Region-Based
// Navigation): one panel region per panel in reading order, its balloons nested in it.
// kindlePanelView adds Kindle's tap-to-magnify targets; the reflowable book sets each panel
// as its cropped picture followed by its lines as text.
const book = {
  metadata: { title: doc.metadata.title, creators: [doc.metadata.author], language: config().locale,
    modified: new Date('2026-10-07T00:00:00Z') }, // a fixed date: the same bytes on every run
  fonts: await epubFonts([LETTERING, SFX], markdown), // every face the pages set, as bytes
  resourceBytes: (fileId) => ({ bytes: imageBytes(fileId), mediaType: 'image/jpeg' }),
  onWarning: (w) => console.warn(`[epub] ${w.kind}`, w.family ?? w.fileId ?? w.detail),
};
const epubs = {
  fixed: await renderToEpub(doc, { ...book, layout: 'fixed' }),
  kindle: await renderToEpub(doc, { ...book, layout: 'fixed', kindlePanelView: true }),
  reflowable: await renderToEpub(doc, { ...book, layout: 'reflowable' }),
};
// #endregion

// #region shelf: each file read back, with the guided view a reading system will follow
const el = (tag, css, text) => Object.assign(document.createElement(tag),
  { textContent: text ?? '' }, { style: css });
const shelf = el('section', 'display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;'
  + 'padding: 24px 16px 0; color: #d9d5cc; font: 13px/1.5 system-ui, sans-serif');
for (const [name, bytes] of Object.entries(epubs)) {
  const epub = readEpub(bytes);
  const regions = new TextDecoder().decode(epub.files.get(`${epub.root}regions.xhtml`)
    ?? new Uint8Array());
  const panels = regions.split('<li epub:type="panel">').slice(1); // one per panel
  const card = el('article', 'width: min(300px, 92vw); padding: 16px; border: 1px solid #2c3038');
  const steps = el('ol', 'margin: 8px 0; padding-left: 22px');
  steps.append(...panels.map((p, i) => el('li', '', `panel ${i + 1}: ${(p.match(
    /epub:type="(balloon|caption|sound-area|text-area)"/g) ?? []).length} text regions`)));
  const link = Object.assign(el('a', 'color: #d8a21a', `Download ${RECIPE}-${name}.epub`), {
    href: URL.createObjectURL(new Blob([bytes])), download: `${RECIPE}-${name}.epub` });
  card.append(el('h2', 'margin: 0; font-size: 15px; color: #f4f1ea', `EPUB 3 · ${name}`),
    el('p', 'margin: 4px 0 0', `${epub.layout} · ${epub.pageProgression} · `
      + `${epub.spine.length} documents · ${Math.round(bytes.length / 1024)} KB`),
    panels.length ? steps : el('p', '', 'No region navigation: the panels are text.'), link);
  shelf.append(card);
}
document.getElementById('pages').before(shelf);
// #endregion

// @kit core fonts viewer pdf images cjk arabic comics
