// ═══ Postext Cookbook · Nº 153 · One page lettered in six languages ═══════════════════
// https://postext.dev/en/cookbook/one-page-six-languages
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Comic Neue, Bangers, the comic faces of each script (OFL) · Needs postext ≥ 1.20.1
// One comic page, its split and its five pictures fixed, lettered from a script per
// language: each edition sets its own page, and the French one beside it.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultComicFont, defaultComicSfxFont,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the edition: 'en' | 'es' | 'ja' | 'zh' | 'ar' (French rides along)
const RECIPE = 'one-page-six-languages';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink and paper, the lighthouse red for the sound effect
const palette = {
  ink: '#1b1d22', // borders, lettering
  red: '#c23a2b', // the purr (4.9:1 on paper)
  caption: '#f3ead2', // narration boxes, the colour of old charts
  muted: '#5d6068', // the footer
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'red (defaults)', value: { hex: palette.red, model: 'hex' } },
];
// #endregion

// #region answer: one config for every language; the locale picks face, direction and columns
const LOCALE = t({ en: 'en-gb', es: 'es', ja: 'ja', zh: 'zh-Hans', ar: 'ar' });
const comics = {
  // No fontFamily: each language is lettered in its own comic face (defaultComicFont):
  // Comic Neue, Zen Antique for Japanese, Noto Sans SC, Playpen Sans Arabic. The size is
  // one for the whole book: a longer translation grows its balloons, never shrinks its text.
  lettering: { fontSize: pt(8.5), lineHeight: 1.12, color: col('ink') },
  // writingMode 'auto' (the default): Japanese is lettered in vertical columns.
  // readingDirection 'auto': an Arabic page reads from the right, so the
  // tier of three panels is laid out right to left from the same split. The art keeps
  // its drawn direction (mirrorArt: false).
  panel: { borderWidth: pt(1), borderColor: col('ink') },
  gutter: { horizontal: mm(4), vertical: mm(3) },
  balloonStyles: [
    { id: 'caption', fill: col('caption'), stroke: col('ink'), strokeWidth: pt(0.6) },
    { id: 'sfx', color: col('red'), halo: pt(1.4), haloColor: col('paper'), rotate: -8 },
  ],
  readingDirection: 'auto', // the default, written out: it is what an edition flips
  cast: [{ id: 'maya', name: 'Maya' }, { id: 'tomas', name: 'Tomás' }],
  runningHeads: true, // the footer prints on the comic page
};
// #endregion

const NAMES = { en: 'English', es: 'Español', ja: '日本語', zh: '中文', ar: 'العربية', fr: 'Français' };
const footerFor = (lang, locale) => ({ elements: [{ kind: 'text', id: 'edition',
  content: `${NAMES[lang]} · ${defaultComicFont(locale)}`, fontFamily: defaultComicFont(locale),
  fontSize: pt(8), color: col('muted'), align: 'center', pages: 'comic',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-8) } } }] });

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LOCALE,
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(170), height: mm(260), dpi: 150, // a comic book
    margins: { top: mm(14), bottom: mm(18), left: mm(12), right: mm(12), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: defaultComicFont(LOCALE), fontSize: pt(10), lineHeight: pt(14),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink') },
  headings: { color: col('ink'),
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] }, // the H1 break
  comics,
  header: { elements: [] },
  footer: footerFor(LANG, LOCALE),
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the page in the edition's language
const french = /* @content:fr */ ''; // content.fr.en.md: the French page, in every edition

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Comic Neue': ['400', '700', '400i', '700i'], Bangers: ['400'], // Latin
  'Zen Antique': ['400'], 'Dela Gothic One': ['400'], // Japanese
  'Noto Sans SC': ['400', '700'], 'ZCOOL KuaiLe': ['400'], // Chinese
  'Playpen Sans Arabic': ['400', '700'], Lalezar: ['400'], // Arabic
};

// #region art: the panel manifest: safe areas, speakers' mouths, heads and faces, in fractions
const box = ([x, y, width, height]) => ({ x, y, width, height });
const who = (id, x, y, head, face) => ({ id, x, y,
  ...(head && { head: { x: head[0], y: head[1] } }), ...(face && { face: box(face) }) });
const ART = {
  'lh-arrive': { width: 1100, height: 733, safeArea: box([.2, .2, .42, .64]),
    alt: t({ en: 'A girl in a yellow raincoat walks up a coastal path towards a red-and-white '
        + 'lighthouse, a fat orange cat trotting ahead; storm clouds gather over the sea.',
      es: 'Una niña con chubasquero amarillo sube por un camino de costa hacia un faro '
        + 'rojo y blanco, con un gato naranja gordo trotando delante; sobre el mar se '
        + 'acumulan nubes de tormenta.',
      zh: '一个穿黄色雨衣的女孩沿着海边小路走向红白相间的灯塔，一只胖橘猫小跑在前面；海上聚起了暴风雨的乌云。',
      ar: 'فتاة بمعطف مطر أصفر تصعد دربًا ساحليًا نحو منارة حمراء وبيضاء، وأمامها قط '
        + 'برتقالي سمين يهرول، والغيوم تتجمّع فوق البحر.',
      ja: '黄色いレインコートの女の子が、赤と白の灯台へ続く海辺の小道をのぼっていく。前を太ったオレンジ色の猫が小走りし、海の上には嵐の雲が集まっている。' }),
    anchors: [
      who('maya', .29, .52, [.27, .47], [.22, .42, .12, .16]),
      who('biscuit', .4, .68, [.4, .66], [.37, .64, .07, .08]),
    ],
    avoid: [box([.51, .09, .1, .43])],
  },
  'lh-radio': { width: 1000, height: 1000, safeArea: box([.02, .36, .56, .56]),
    alt: t({ en: 'The old keeper, white-bearded in a navy sweater and cap, taps a valve radio '
        + 'in the lamp room, microphone in hand; the great lens glows beside him.',
      es: 'El viejo farero, de barba blanca, jersey azul marino y gorra, golpea una radio '
        + 'de válvulas en la sala de la lámpara con el micrófono en la mano; a su lado '
        + 'brilla la gran lente.',
      zh: '白胡子的老守塔人穿着藏青色毛衣、戴着帽子，在灯室里手握话筒敲着一台电子管收音机；巨大的透镜在他身旁发光。',
      ar: 'حارس المنارة العجوز بلحيته البيضاء وكنزته الكحلية وقبعته ينقر على مذياع قديم '
        + 'في غرفة الفانوس والميكروفون في يده، والعدسة الكبيرة تتوهّج بجانبه.',
      ja: '白いひげの老灯台守が、紺のセーターに帽子姿で、灯室でマイクを握って真空管ラジオをたたいている。そばで大きなレンズが光っている。' }),
    anchors: [
      who('tomas', .345, .52, [.38, .44], [.29, .4, .16, .18]),
    ],
    avoid: [box([0, .44, .22, .26])],
  },
  'lh-maya': { width: 1100, height: 1100, safeArea: box([.22, .2, .56, .75]),
    alt: t({ en: 'Close-up of Maya frowning at the floor and pointing down.',
      es: 'Primer plano de Maya, que frunce el ceño mirando al suelo y señala hacia abajo.',
      zh: '玛雅的特写：她皱着眉头看着地板，手指向下指。',
      ar: 'لقطة قريبة لمايا وهي تعقد حاجبيها ناظرةً إلى الأرض وتشير إلى أسفل.',
      ja: 'マヤのアップ。眉をひそめて床を見つめ、下を指さしている。' }),
    anchors: [
      who('maya', .54, .565, [.5, .3], [.4, .33, .24, .29]),
    ],
    avoid: [box([.27, .73, .25, .22])],
  },
  'lh-biscuit': { width: 1000, height: 1000, safeArea: box([.38, .26, .56, .59]),
    alt: t({ en: 'Under the desk, the fat orange cat sleeps on his back on top of the black '
        + 'radio cable, squashing it flat.',
      es: 'Bajo la mesa, el gato naranja gordo duerme panza arriba encima del cable negro '
        + 'de la radio y lo aplasta.',
      zh: '桌子底下，胖橘猫四脚朝天地睡在收音机的黑色电线上，把电线压得扁扁的。',
      ar: 'تحت المكتب ينام القط البرتقالي السمين على ظهره فوق سلك المذياع الأسود ويسحقه.',
      ja: '机の下で、太ったオレンジ色の猫がラジオの黒いコードの上にあおむけで眠り、コードをぺしゃんこにしている。' }),
    anchors: [
      who('biscuit', .72, .355, [.73, .32], [.64, .27, .2, .18]),
    ],
    avoid: [box([.93, .28, .07, .24]), box([0, .72, .4, .1])],
  },
  'lh-beam': { width: 1200, height: 800, safeArea: box([.14, .02, .73, .64]),
    alt: t({ en: 'Night: the lighthouse beam sweeps over a dark sea; Maya and her grandfather '
        + 'stand on the lantern gallery, and far out a fishing boat shows its lights.',
      es: 'De noche, el haz del faro barre un mar oscuro; Maya y su abuelo están en la '
        + 'galería de la linterna y a lo lejos se ven las luces de un pesquero.',
      zh: '夜里，灯塔的光束扫过漆黑的海面；玛雅和外公站在灯室外的回廊上，远处一艘渔船亮着灯。',
      ar: 'ليلًا يمسح شعاع المنارة بحرًا مظلمًا، ومايا وجدّها واقفان على شرفة الفانوس، '
        + 'وفي البعيد قارب صيد بأضوائه.',
      ja: '夜。灯台の光の帯が暗い海をなでる。マヤと祖父は灯室の回廊に立ち、沖には漁船の明かりが見える。' }),
    anchors: [
      who('maya', .235, .15, null, [.21, .11, .05, .07]),
      who('tomas', .3, .145, null, [.28, .11, .04, .06]),
    ],
    avoid: [box([.79, .55, .08, .09])],
  },

};
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const text = markdown + french + Object.values(NAMES).join(' ');
const faces = Object.fromEntries([LOCALE, 'fr'].flatMap((l) => [defaultComicFont(l),
  defaultComicSfxFont(l)]).map((family) => [family, FONTS[family]]));
await loadFonts(FONTS, text); // the Latin files of every face
await loadCjkFonts(faces, markdown + NAMES[LANG]);
await loadArabicFonts(faces, markdown + NAMES[LANG]);
await loadComicFonts(faces, text);
const resources = await Promise.all([
  comicPanel('lh-arrive', asset('lh-arrive.jpg'), ART['lh-arrive']),
  comicPanel('lh-radio', asset('lh-radio.jpg'), ART['lh-radio']),
  comicPanel('lh-maya', asset('lh-maya.jpg'), ART['lh-maya']),
  comicPanel('lh-biscuit', asset('lh-biscuit.jpg'), ART['lh-biscuit']),
  comicPanel('lh-beam', asset('lh-beam.jpg'), ART['lh-beam']),
]);
// #region editions: the edition's page, then the French one from the same config and art
const build = (md, cfg) =>
  buildWithFonts(() => buildDocument({ markdown: md, resources }, cfg), md);
const docs = [await build(markdown, config())];
// French is not a site language, so every edition carries its page: the same config
// with another locale, as a new object (the engine caches resolved configs by identity).
docs.push(await build(french, { ...config(), locale: 'fr', footer: footerFor('fr', 'fr') }));
// #endregion
showBook(docs, { title: t({ en: 'One page in six languages', es: 'Una página en seis idiomas',
  ja: '六つの言語で写植した一ページ', zh: '用六种语言嵌字的一页漫画', ar: 'صفحة واحدة بست لغات' }) });
offerPdf(() => renderToPdf(docs[0], { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}-${LANG}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
