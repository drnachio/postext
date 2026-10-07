// ═══ Postext Cookbook · Nº 144 · One set of panels, three page splits ═══════════════
// https://postext.dev/en/cookbook/comic-page-splitters
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Comic Neue, Bangers and the faces of five editions (OFL) · Needs postext ≥ 1.20.1
//
// A layout proof for one page of a comic: the same five pictures and the same lines of
// dialogue laid out under three `split` trees. Each picture carries a safe area, so its subject
// stays in view whether its cell is wide, tall or square, and the lettering is placed again
// around the speakers' anchors on every page and in every language.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the sample's language: 'en' | 'es' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt'
const RECIPE = 'comic-page-splitters';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the night sea, the lighthouse red and the yellow of the captions
const palette = {
  ink: '#1b2430', // panel borders, lettering and text: a blue-black
  accent: '#b8322a', // the lighthouse red: the proof's labels
  caption: '#f4e7bf', // caption boxes, an old-paper yellow
  muted: '#5f6873', // folios and the imprint
  paper: '#fdfbf6',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion

// #region editions: one comic, six editions, each lettered in faces for its script
// The lettering and sound-effect faces of each edition: the engine's defaults, but for Chinese
// two ZCOOL faces drawn for cartoons instead of Noto Sans SC. content.<lang>.md holds the words
// of each edition under the same speaker ids; Japanese balloons are set vertically, and the
// Japanese and Arabic editions, read right to left, mirror the order of the panels in every row.
const [LETTERING, SFX] = t({
  en: ['Comic Neue', 'Bangers'], es: ['Comic Neue', 'Bangers'], ca: ['Comic Neue', 'Bangers'],
  ja: ['Zen Antique', 'Dela Gothic One'], zh: ['ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou'],
  ar: ['Playpen Sans Arabic', 'Lalezar'], pt: ['Comic Neue', 'Bangers'],
});
// #endregion

// #region answer: the comic: a frame, gutters, a panel border, and a page per split
// Every :::page fills the type area; its split attribute cuts it into cells and its ::panel
// lines fill them in reading order (rows top to bottom, columns from the start side):
//   :::page{split="30 / 35 [* | * | *] / *"}    three tiers, the middle one in three
//   :::page{split="60 [* / *] | * [* / * / *]"} two columns, then each column in tiers
//   :::page{split="30 [30 | 20 | *] / *"}       a 30 % tier cut 30 | 20 | rest, then the rest
// A size is a percentage of the parent cell, * shares what is left, [ … ] cuts that cell
// on the other axis. A panel with inset="x y w h" sits over the panel before it.
const comics = {
  gutter: { horizontal: mm(4), vertical: mm(3) }, // between tiers, between panels in a tier
  panel: { borderWidth: pt(1), borderColor: col('ink'), background: col('paper') },
  lettering: { fontFamily: LETTERING, fontSize: pt(8), color: col('ink'), inset: mm(1) },
  balloonStyles: [
    { id: 'speech', stroke: col('ink') },
    { id: 'caption', fill: col('caption'), stroke: col('ink') },
    { id: 'sfx', fontFamily: SFX, color: col('accent'), haloColor: col('paper') },
  ],
  runningHeads: true, // a comic page has no running head unless asked: here, its folio
};
// #endregion

const LABEL = { fontFamily: LETTERING, fontSize: pt(7.5), color: col('muted') };
const footer = { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', ...LABEL,
  align: 'center', placement: { anchor: { to: 'page', edge: 'bottom' },
    offset: { x: mm(0), y: mm(-8) } } }] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es', ca: 'ca', ja: 'ja', zh: 'zh-Hans', ar: 'ar',
    pt: 'pt-BR' }),
  colorPalette, comics,
  // The trim of an American comic book, 6⅝ × 10³⁄₁₆ in; the type area is the panel frame.
  page: { sizePreset: 'custom', width: mm(168), height: mm(259), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(14), bottom: mm(18), left: mm(13), right: mm(11), mirror: true } },
  layout: { layoutType: 'single' },
  // The proof's cover sheet is set in the lettering face of the edition.
  bodyText: { fontFamily: LETTERING, fontSize: pt(10.5), lineHeight: pt(15), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true,
    hyphenation: { enabled: false } },
  headings: { fontFamily: SFX, color: col('accent'), fontWeight: 400,
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, fontSize: pt(34), lineHeight: pt(38), breakBefore: { enabled: true,
        parity: 'any' }, marginTop: mm(30), marginBottom: pt(15) },
      { level: 2, fontFamily: LETTERING, fontSize: pt(10.5), fontWeight: 700,
        color: col('accent'), marginTop: pt(15), marginBottom: pt(0) },
    ] },
  paragraphStyles: [
    { id: 'split', fontSize: pt(10.5), color: col('accent'), textAlign: 'left' }, // the attribute
    { id: 'imprint', fontSize: pt(7.5), lineHeight: pt(10), color: col('muted'),
      marginTop: pt(30) },
  ],
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the five pictures: safe area, speakers' anchors and avoid zones
// From the art manifest; fractions of each picture, the same in every language. The safe
// area is what every crop keeps: Tomás alone, not his radio, so a cell a fifth of the page
// wide still shows him; the lighthouse and the gallery, not the boat, so a tall cell holds them.
const ART = {
  'lh-arrive': { width: 1100, height: 733, safeArea: { x: 0.22, y: 0.08, width: 0.4, height: 0.64 },
    anchors: [{ id: 'maya', x: 0.29, y: 0.52, head: { x: 0.27, y: 0.47 },
      face: { x: 0.22, y: 0.42, width: 0.12, height: 0.16 } },
    { id: 'biscuit', x: 0.4, y: 0.68, face: { x: 0.37, y: 0.64, width: 0.07, height: 0.08 } }],
    avoid: [{ x: 0.51, y: 0.09, width: 0.1, height: 0.43 }],
    alt: t({ en: 'A girl in a yellow raincoat walks up a coastal path towards a red-and-white '
      + 'lighthouse, a fat orange cat ahead of her.',
      es: 'Una niña con chubasquero amarillo sube por un camino de costa hacia un faro rojo y '
        + 'blanco, con un gato naranja gordo delante.',
      ca: 'Una nena amb impermeable groc puja per un camí de costa cap a un far vermell i blanc, '
        + 'amb un gat taronja gras al davant.',
      zh: '一个穿黄色雨衣的女孩沿着海边小路走向红白相间的灯塔，一只胖胖的橘猫走在前面。',
      ar: 'فتاة بمعطف مطر أصفر تصعد دربًا ساحليًا نحو منارة حمراء وبيضاء، وأمامها قط برتقالي سمين.',
      ja: '黄色いレインコートの女の子が、赤と白の灯台へ続く海辺の小道をのぼっていく。前を太ったオレンジ色の猫が歩く。',
      pt: 'Uma menina de capa de chuva amarela sobe um caminho à beira-mar rumo a um farol '
        + 'vermelho e branco, com um gato laranja gordo à frente.' }) },
  'lh-radio': { width: 1000, height: 1000,
    safeArea: { x: 0.27, y: 0.38, width: 0.24, height: 0.3 },
    anchors: [{ id: 'tomas', x: 0.345, y: 0.52, head: { x: 0.38, y: 0.44 },
      face: { x: 0.29, y: 0.4, width: 0.16, height: 0.18 } }],
    avoid: [{ x: 0, y: 0.44, width: 0.22, height: 0.26 }],
    alt: t({ en: 'The old keeper, white-bearded, in a navy sweater and cap, taps a valve radio '
      + 'with the microphone in his hand.',
      es: 'El viejo farero, de barba blanca, jersey azul marino y gorra, golpea una radio de '
        + 'válvulas con el micrófono en la mano.',
      ca: 'El vell faroner, de barba blanca, jersei blau marí i gorra, pica una ràdio de vàlvules '
        + 'amb el micròfon a la mà.',
      zh: '白胡子的老守塔人穿着藏青色毛衣、戴着帽子，手握话筒，敲着一台电子管收音机。',
      ar: 'حارس المنارة العجوز بلحيته البيضاء وكنزته الكحلية وقبعته ينقر على مذياع قديم '
        + 'والميكروفون في يده.',
      ja: '白いひげの老灯台守が、紺のセーターに帽子姿でマイクを握り、真空管ラジオをたたいている。',
      pt: 'O velho faroleiro, de barba branca, suéter azul-marinho e boné, dá batidinhas num '
        + 'rádio valvulado com o microfone na mão.' }) },
  'lh-maya': { width: 1100, height: 1100, safeArea: { x: 0.25, y: 0.27, width: 0.41, height: 0.68 },
    anchors: [{ id: 'maya', x: 0.54, y: 0.565, head: { x: 0.5, y: 0.3 },
      face: { x: 0.4, y: 0.33, width: 0.24, height: 0.29 } }],
    avoid: [{ x: 0.27, y: 0.73, width: 0.25, height: 0.22 }],
    alt: t({ en: 'Close-up of Maya frowning at the floor and pointing down.',
      es: 'Primer plano de Maya, que frunce el ceño mirando al suelo y señala hacia abajo.',
      ca: 'Primer pla de la Maya, que arrufa les celles mirant a terra i assenyala avall.',
      zh: '玛雅的特写：她皱着眉头看着地板，手指向下指。',
      ar: 'لقطة قريبة لمايا وهي تعقد حاجبيها ناظرةً إلى الأرض وتشير إلى أسفل.',
      ja: 'マヤのアップ。眉をひそめて床を見つめ、下を指さしている。',
      pt: 'Close de Maya, de testa franzida, olhando para o chão e apontando para baixo.' }) },
  'lh-biscuit': { width: 1000, height: 1000,
    safeArea: { x: 0.58, y: 0.25, width: 0.42, height: 0.33 },
    anchors: [{ id: 'biscuit', x: 0.72, y: 0.355, head: { x: 0.73, y: 0.32 },
      face: { x: 0.64, y: 0.27, width: 0.2, height: 0.18 } }],
    avoid: [{ x: 0.93, y: 0.28, width: 0.07, height: 0.24 },
      { x: 0, y: 0.72, width: 0.4, height: 0.1 }],
    alt: t({ en: 'Under the desk the fat orange cat sleeps on his back, right on top of the black '
      + 'radio cable.',
      es: 'Bajo la mesa, el gato naranja gordo duerme panza arriba justo encima del cable negro '
        + 'de la radio.',
      ca: 'Sota la taula, el gat taronja gras dorm panxa enlaire just a sobre del cable negre de '
        + 'la ràdio.',
      zh: '桌子底下，胖橘猫四脚朝天地睡着，正好压在收音机的黑色电线上。',
      ar: 'تحت المكتب ينام القط البرتقالي السمين على ظهره فوق سلك المذياع الأسود تمامًا.',
      ja: '机の下で、太ったオレンジ色の猫がラジオの黒いコードの真上にあおむけで眠っている。',
      pt: 'Debaixo da mesa, o gato laranja gordo dorme de barriga para cima bem em cima do cabo '
        + 'preto do rádio.' }) },
  'lh-beam': { width: 1200, height: 800, safeArea: { x: 0.15, y: 0.01, width: 0.25, height: 0.3 },
    anchors: [{ id: 'maya', x: 0.235, y: 0.15,
      face: { x: 0.21, y: 0.11, width: 0.05, height: 0.07 } },
      { id: 'tomas', x: 0.3, y: 0.145, face: { x: 0.28, y: 0.11, width: 0.04, height: 0.06 } }],
    avoid: [{ x: 0.79, y: 0.55, width: 0.08, height: 0.09 }],
    alt: t({ en: 'Night: the beam sweeps over a dark sea; Maya and her grandfather stand on the '
      + 'lantern gallery and a fishing boat shows its lights far out.',
      es: 'De noche, el haz barre un mar oscuro; Maya y su abuelo están en la galería de la '
        + 'linterna y a lo lejos se ven las luces de un pesquero.',
      ca: 'De nit, el feix escombra un mar fosc; la Maya i el seu avi són a la galeria de la '
        + 'llanterna i lluny es veuen els llums d’un pesquer.',
      zh: '夜里，灯塔的光束扫过漆黑的海面；玛雅和外公站在灯室外的回廊上，远处一艘渔船亮着灯。',
      ar: 'ليلًا يمسح الشعاع بحرًا مظلمًا، ومايا وجدّها واقفان على شرفة الفانوس، وفي البعيد قارب '
        + 'صيد بأضوائه.',
      ja: '夜。光の帯が暗い海をなでる。マヤと祖父は灯室の回廊に立ち、沖には漁船の明かりが見える。',
      pt: 'À noite, o facho varre um mar escuro; Maya e o avô estão na galeria da lanterna e, ao '
        + 'longe, aparecem as luzes de um barco de pesca.' }) },
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

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const faces = { [LETTERING]: FONTS[LETTERING], [SFX]: FONTS[SFX] };
await loadFonts(FONTS, markdown);
await loadCjkFonts(faces, markdown, { vertical: LANG === 'ja' }); // ja balloons are vertical
await loadArabicFonts(faces, markdown);
await loadComicFonts(faces, markdown); // the bold and italic the faces do not ship
const resources = await Promise.all([
  comicPanel('lh-arrive', asset('lh-arrive.jpg'), ART['lh-arrive']),
  comicPanel('lh-radio', asset('lh-radio.jpg'), ART['lh-radio']),
  comicPanel('lh-maya', asset('lh-maya.jpg'), ART['lh-maya']),
  comicPanel('lh-biscuit', asset('lh-biscuit.jpg'), ART['lh-biscuit']),
  comicPanel('lh-beam', asset('lh-beam.jpg'), ART['lh-beam']),
]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'One set of panels, three page splits',
  es: 'Las mismas viñetas en tres divisiones de página',
  pt: 'Os mesmos quadros em três divisões de página' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
