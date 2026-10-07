// ═══ Postext Cookbook · Nº 146 · A daily strip and a Sunday half page in the newspaper ═══
// https://postext.dev/en/cookbook/newspaper-daily-strip
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Newsreader, Archivo Narrow, Comic Neue, Bangers and 12 more (OFL) · Needs postext ≥ 1.20.1
//
// Two pages of a newspaper's pull-out comics section: a four-panel daily strip across the head
// of a four-column page, and a Sunday half page with its own panel grid. Both are :::strip blocks
// in the text: the columns flow around them as they flow around a page-wide figure.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the sample's language: 'en' | 'es' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt'
const RECIPE = 'newspaper-daily-strip';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: newsprint, ink and the paper's red
const palette = {
  ink: '#16181b', // text, rules, panel borders and the lettering
  paper: '#f6f3ec', // newsprint
  accent: '#b3261e', // section flags, kickers and the sound effects
  tint: '#e9e4d8', // the advert's box
  rule: '#8f9196', // the column rules
  muted: '#575b61', // bylines and the folio line
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion

// #region editions: the newspaper's text, label and lettering faces in each script
const [TEXT, LABEL, LETTERING, SFX] = t({
  en: ['Newsreader', 'Archivo Narrow', 'Comic Neue', 'Bangers'],
  es: ['Newsreader', 'Archivo Narrow', 'Comic Neue', 'Bangers'],
  ca: ['Newsreader', 'Archivo Narrow', 'Comic Neue', 'Bangers'],
  pt: ['Newsreader', 'Archivo Narrow', 'Comic Neue', 'Bangers'],
  zh: ['Noto Serif SC', 'Noto Sans SC', 'ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou'],
  ja: ['Noto Serif JP', 'Noto Sans JP', 'Zen Antique', 'Dela Gothic One'],
  ar: ['Noto Naskh Arabic', 'Noto Kufi Arabic', 'Playpen Sans Arabic', 'Lalezar'],
});
const CJK = LANG === 'zh' || LANG === 'ja';
// Design text aligns to physical sides: an Arabic page starts on the right.
const [START, END] = LANG === 'ar' ? ['right', 'left'] : ['left', 'right'];
// #endregion
const MARGIN = { top: 31, bottom: 14, side: 12 }; // mm: a newspaper's narrow, even margins
const GUTTER = 4; // mm: four columns of 48.5 mm on the 206 mm text width
const LEAD = CJK ? 15 : LANG === 'ar' ? 16 : 12.2; // pt: the baseline grid
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const label = (size, look = {}) => ({ fontFamily: LABEL, fontSize: pt(size), fontWeight: 700,
  color: col('ink'), ...look });

// #region answer: a page-wide daily strip and a Sunday half page, set in the columns
// In the Markdown each strip is a fenced block, where the paper wants it:
//   :::strip{split="55 / * [40 | *]" height=210mm}   the Sunday half page, on the cover
//   :::strip{split="* | * | * | *" span=page placement=bottom}   the daily: four square panels
// On the one-column cover the Sunday strip is set in the text, 210 mm deep. Inside, the daily
// floats to the foot of the page, as wide as its four columns, and the columns of the article
// end level above it. A strip never splits; one that does not fit moves to the next page.
// The panels, gutters and balloons come from the comics settings, as on a comic page.
const comics = {
  gutter: { horizontal: mm(3), vertical: mm(3) },
  panel: { borderWidth: pt(0.75), borderColor: col('ink'), background: col('paper') },
  lettering: { fontFamily: LETTERING, fontSize: pt(7.5), color: col('ink'), inset: mm(1) },
  balloonStyles: [
    { id: 'speech', fill: col('paper'), stroke: col('ink') },
    { id: 'whisper', fill: col('paper'), stroke: col('ink') },
    { id: 'shout', fill: col('paper'), stroke: col('ink') },
    { id: 'caption', fill: col('accent'), stroke: col('accent'), color: col('paper'),
      fontFamily: LABEL, bold: true },
    { id: 'sfx', fontFamily: SFX, color: col('accent'), haloColor: col('paper') },
  ],
};
const layout = { layoutType: 'multiple', columnCount: 4, gutterWidth: mm(GUTTER),
  columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.4) } };
// #endregion

// The section flag heads every page of the pull-out: its name over a 3 pt bar, the folio line
// above it. It lives in the header, so the cover's strip starts right under it, and a float
// written after an opener can still take that page's foot (gotcha: top-float-next-page).
const WIDTH = 230 - 2 * MARGIN.side; // mm: the text width
const SECTION = t({ en: 'Funnies', es: 'Tebeos', ca: 'Còmics', zh: '漫画版', ar: 'صفحة الكوميكس',
  ja: '漫画面', pt: 'Quadrinhos' });
const across = (y) => ({ ...at('page', 'top-left', MARGIN.side, y), size: { width: mm(WIDTH) } });
const header = { elements: [
  { kind: 'text', id: 'folio', content: '{pageNumber}  ·  {title}  ·  {publishDate}',
    ...label(8, { color: col('muted') }), align: START, placement: across(8) },
  { kind: 'text', id: 'flag', content: SECTION, ...label(30, { color: col('accent') }),
    lineHeight: 1, align: START, placement: across(12.5) },
  { kind: 'text', id: 'tag', content: '{subtitle}', ...label(9, { color: col('muted') }),
    align: END, placement: across(19.5) },
  { kind: 'rule', id: 'bar', thickness: pt(3), color: col('ink'), placement: across(24.5) },
] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-gb', es: 'es', ca: 'ca', ja: 'ja', zh: 'zh-Hans', ar: 'ar',
    pt: 'pt-BR' }),
  colorPalette, comics,
  layout: { layoutType: 'single' }, // the cover; the inside page is a section in four columns
  // The pull-out is a tabloid sheet folded once more: 230 × 310 mm.
  page: { sizePreset: 'custom', width: mm(230), height: mm(310), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.side),
      right: mm(MARGIN.side) } },
  bodyText: { fontFamily: TEXT, fontSize: pt(CJK ? 8.5 : 9), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: CJK ? em(1) : mm(3), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: TEXT, fontWeight: 700, color: col('ink'),
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, span: 'page', fontSize: pt(28), lineHeight: pt(32), marginTop: pt(0),
        marginBottom: pt(LEAD * 0.5), breakBefore: { enabled: true, parity: 'any' } },
      { level: 2, fontFamily: LABEL, fontSize: pt(12), lineHeight: pt(LEAD),
        marginTop: pt(LEAD), marginBottom: pt(0) },
      { level: 3, fontFamily: LABEL, fontSize: pt(9.5), lineHeight: pt(LEAD),
        marginTop: pt(LEAD), marginBottom: pt(0) },
    ] },
  // An H1 opens the inside page, and its style turns that page into four columns.
  headingStyles: [{ id: 'inside', layout }],
  paragraphStyles: [
    { id: 'contents', fontFamily: LABEL, fontSize: pt(14), lineHeight: pt(LEAD * 1.5),
      textAlign: 'left', firstLineIndent: pt(0), spaceBetween: pt(LEAD * 0.5) },
    { id: 'byline', ...label(8.5, { color: col('muted') }), textAlign: 'left',
      firstLineIndent: pt(0), marginBottom: pt(LEAD * 0.5) },
    { id: 'flush', firstLineIndent: pt(0), textAlign: 'left' }, // letters, ragged
    { id: 'imprint', ...label(7, { color: col('muted'), fontWeight: 400 }), textAlign: 'left',
      firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  calloutStyles: [{ id: 'ad', background: col('tint'), keepTogether: true,
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
    padding: { top: mm(3), right: mm(4), bottom: mm(4), left: mm(4) },
    titleStyle: { ...label(7.5, { color: col('muted') }), gap: mm(2) }, // "Advertisement"
    body: { fontFamily: LABEL, fontSize: pt(11), lineHeight: pt(LEAD * 1.2), textAlign: 'left',
      firstLineIndent: pt(0), paragraphSpacing: true } }],
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the seven pictures: safe area, speakers' anchors and avoid zones
// From the art manifest; fractions of each picture, the same in every language.
const face = (x, y, width, height) => ({ x, y, width, height });
const ART = {
  po1: { width: 1024, height: 1024, safeArea: face(0.11, 0.22, 0.71, 0.45),
    anchors: [{ id: 'pip', x: 0.27, y: 0.58, face: face(0.11, 0.44, 0.22, 0.2) },
      { id: 'otto', x: 0.67, y: 0.37, face: face(0.56, 0.23, 0.24, 0.22) }] },
  po2: { width: 1024, height: 1024, safeArea: face(0.07, 0.14, 0.79, 0.56),
    anchors: [{ id: 'pip', x: 0.23, y: 0.62, face: face(0.07, 0.5, 0.22, 0.18) },
      { id: 'otto', x: 0.75, y: 0.31, face: face(0.52, 0.14, 0.33, 0.22) }],
    avoid: [face(0.28, 0.17, 0.38, 0.39)] },
  po3: { width: 1024, height: 1024, safeArea: face(0.03, 0.18, 0.72, 0.56),
    anchors: [{ id: 'pip', x: 0.275, y: 0.36, face: face(0.1, 0.19, 0.25, 0.21) }],
    avoid: [face(0.34, 0.41, 0.64, 0.41)] },
  po4: { width: 1024, height: 1024, safeArea: face(0.07, 0.19, 0.84, 0.53),
    anchors: [{ id: 'pip', x: 0.23, y: 0.61, face: face(0.07, 0.48, 0.22, 0.18) },
      { id: 'otto', x: 0.69, y: 0.36, face: face(0.53, 0.19, 0.39, 0.23) }],
    avoid: [face(0.31, 0.63, 0.05, 0.08), face(0.39, 0.32, 0.29, 0.18)] },
  po5: { width: 1400, height: 600, safeArea: face(0.16, 0.17, 0.6, 0.66),
    anchors: [{ id: 'pip', x: 0.345, y: 0.53, face: face(0.29, 0.4, 0.09, 0.18) },
      { id: 'otto', x: 0.625, y: 0.33, face: face(0.58, 0.17, 0.12, 0.23) }] },
  po6: { width: 1152, height: 1152, safeArea: face(0.3, 0.21, 0.43, 0.35),
    anchors: [{ id: 'pip', x: 0.46, y: 0.39, face: face(0.35, 0.25, 0.2, 0.18) },
      { id: 'fish', x: 0.66, y: 0.46, face: face(0.64, 0.41, 0.07, 0.12) }] },
  po7: { width: 1400, height: 933, safeArea: face(0.07, 0.15, 0.81, 0.65),
    anchors: [{ id: 'pip', x: 0.195, y: 0.64, face: face(0.1, 0.56, 0.15, 0.14) },
      { id: 'otto', x: 0.795, y: 0.35, face: face(0.7, 0.18, 0.18, 0.22) },
      { id: 'sfx', x: 0.62, y: 0.7 }],
    avoid: [face(0.44, 0.3, 0.15, 0.32)] },
};
const ALT = {
  po1: t({ en: 'Pip the penguin waddles into Otto the walrus’s tiny bakery, waving.',
    es: 'Pip, el pingüino, entra saludando en la pequeña panadería de Otto, la morsa.',
    ca: 'En Pip, el pingüí, entra saludant a la petita fleca de l’Otto, la morsa.',
    zh: '企鹅皮普摇摇摆摆走进海象奥托的小面包店，挥着手。',
    ar: 'البطريق بيب يدخل مخبز الفظّ أوتو الصغير وهو يلوّح.',
    ja: 'ペンギンのピップが手を振りながら、セイウチのオットーの小さなパン屋に入ってくる。',
    pt: 'O pinguim Pip entra acenando na padariazinha da morsa Otto.' }),
  po2: t({ en: 'Otto proudly holds up a croissant as big as Pip.',
    es: 'Otto enseña orgulloso un cruasán tan grande como Pip.',
    ca: 'L’Otto ensenya orgullós un croissant tan gran com en Pip.',
    zh: '奥托得意地举起一个和皮普一样大的羊角面包。',
    ar: 'أوتو يرفع بفخر كرواسونًا بحجم بيب.',
    ja: 'オットーが、ピップと同じくらい大きなクロワッサンを得意げに持ち上げる。',
    pt: 'Otto ergue, todo orgulhoso, um croissant do tamanho do Pip.' }),
  po3: t({ en: 'Pip stands on the counter next to the giant croissant, scratching his head.',
    es: 'Pip, de pie en el mostrador junto al cruasán gigante, se rasca la cabeza.',
    ca: 'En Pip, dret al taulell al costat del croissant gegant, es grata el cap.',
    zh: '皮普站在柜台上，挨着巨大的羊角面包挠头。',
    ar: 'بيب واقف على المنضدة بجانب الكرواسون العملاق يحكّ رأسه.',
    ja: 'ピップがカウンターの巨大なクロワッサンの横に立ち、頭をかいている。',
    pt: 'Pip, de pé no balcão ao lado do croissant gigante, coça a cabeça.' }),
  po4: t({ en: 'Otto munches the big half of the croissant; Pip holds a tiny end piece.',
    es: 'Otto se come la mitad grande del cruasán; Pip sostiene una punta diminuta.',
    ca: 'L’Otto es menja la meitat gran del croissant; en Pip aguanta una punta minúscula.',
    zh: '奥托大口吃着大半个羊角面包；皮普手里拿着一小截面包尖。',
    ar: 'أوتو يلتهم النصف الكبير من الكرواسون، وبيب يمسك طرفًا صغيرًا.',
    ja: 'オットーがクロワッサンの大きいほうをほおばり、ピップは小さな端っこを持っている。',
    pt: 'Otto devora a metade grande do croissant; Pip segura uma pontinha.' }),
  po5: t({ en: 'Pip and Otto fish through a hole in an ice floe beside a tiny bakery hut.',
    es: 'Pip y Otto pescan por un agujero en un témpano, junto a una caseta de panadería.',
    ca: 'En Pip i l’Otto pesquen per un forat en un glaç, al costat d’una caseta de fleca.',
    zh: '皮普和奥托在浮冰的冰洞里钓鱼，旁边是一间小面包屋。',
    ar: 'بيب وأوتو يصطادان من ثقب في جليد طافٍ بجانب كوخ مخبز صغير.',
    ja: '流氷の穴でピップとオットーが釣りをしている。そばに小さなパン屋の小屋。',
    pt: 'Pip e Otto pescam num buraco do bloco de gelo, ao lado de uma padariazinha.' }),
  po6: t({ en: 'Pip proudly holds up a tiny, unimpressed fish.',
    es: 'Pip levanta orgulloso un pez diminuto y nada impresionado.',
    ca: 'En Pip aixeca orgullós un peix minúscul i gens impressionat.',
    zh: '皮普得意地举起一条小小的、一脸不屑的鱼。',
    ar: 'بيب يرفع بفخر سمكة صغيرة لا يبدو عليها أي إعجاب.',
    ja: 'ピップが、少しもうれしそうでない小さな魚を得意げに持ち上げる。',
    pt: 'Pip ergue, todo orgulhoso, um peixinho nada impressionado.' }),
  po7: t({ en: 'Otto reels in a soggy boot; Pip has fallen on his back laughing.',
    es: 'Otto saca del agua una bota empapada; Pip se ha caído de espaldas de la risa.',
    ca: 'L’Otto treu de l’aigua una bota xopa; en Pip ha caigut d’esquena de riure.',
    zh: '奥托钓上来一只湿透的靴子；皮普笑得仰面摔倒。',
    ar: 'أوتو يسحب حذاءً مبتلًا، وبيب سقط على ظهره من الضحك.',
    ja: 'オットーがずぶぬれの長靴を釣り上げ、ピップは笑いころげてあおむけに倒れている。',
    pt: 'Otto puxa uma bota encharcada; Pip caiu de costas de tanto rir.' }),
};
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face of the six editions; each edition loads the latin files of all of them and the
// Chinese, Japanese or Arabic files of its own (gotcha: fonts-first).
const FONTS = {
  Newsreader: ['400', '400i', '700'],
  'Archivo Narrow': ['400', '700'],
  'Comic Neue': ['400', '400i', '700', '700i'],
  Bangers: ['400'],
  'Noto Serif SC': ['400', '700'],
  'Noto Sans SC': ['400', '700'],
  'ZCOOL KuaiLe': ['400'],
  'ZCOOL QingKe HuangYou': ['400'],
  'Noto Serif JP': ['400', '700'],
  'Noto Sans JP': ['400', '700'],
  'Zen Antique': ['400'],
  'Dela Gothic One': ['400'],
  'Noto Naskh Arabic': ['400', '700'],
  'Noto Kufi Arabic': ['400', '700'],
  'Playpen Sans Arabic': ['400', '700'],
  Lalezar: ['400'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const faces = Object.fromEntries([TEXT, LABEL, LETTERING, SFX].map((f) => [f, FONTS[f]]));
await loadFonts(FONTS, markdown);
await loadCjkFonts(faces, markdown);
await loadArabicFonts(faces, markdown);
await loadComicFonts({ [LETTERING]: FONTS[LETTERING], [SFX]: FONTS[SFX] }, markdown);
const panel = (id, url) => comicPanel(id, url, { ...ART[id], alt: ALT[id] });
const resources = await Promise.all([
  panel('po1', asset('po1.jpg')), panel('po2', asset('po2.jpg')), panel('po3', asset('po3.jpg')),
  panel('po4', asset('po4.jpg')), panel('po5', asset('po5.jpg')), panel('po6', asset('po6.jpg')),
  panel('po7', asset('po7.jpg')),
]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'A daily strip and a Sunday half page in the newspaper',
  es: 'Una tira diaria y media página dominical en el periódico',
  pt: 'Uma tirinha diária e meia página de domingo no jornal' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
