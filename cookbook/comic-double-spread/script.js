// ═══ Postext Cookbook · Nº 154 · One comic page across a double spread ═══════════════
// https://postext.dev/en/cookbook/comic-double-spread
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Patrick Hand, Bangers, the comic faces of each script (OFL) · Needs postext ≥ 1.20.1
// One split tree laid across two facing pages: a panorama runs over the spine, and the
// tier under it splits at the spine's gutter. Same album, same lettering as Nº 152.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultComicFont, defaultComicSfxFont,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the album's language: 'es' | 'en' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt'
const RECIPE = 'comic-double-spread';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the album's flat colours
const palette = {
  ink: '#1d1b19', // outlines, lettering, folios
  orange: '#d9601a', // the sound effect
  cartouche: '#fbe8a6', // narration boxes
  balloon: '#ffffff',
  muted: '#5f5a54', // the colophon
  paper: '#fffdf8',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'orange (defaults)', value: { hex: palette.orange, model: 'hex' } },
];
// #endregion

const LOCALE = t({ es: 'es', en: 'en-gb', ca: 'ca', zh: 'zh-Hans', ar: 'ar', ja: 'ja',
  pt: 'pt-BR' });
const LATIN = ['es', 'en', 'ca', 'pt'].includes(LANG);
const LETTER = LATIN ? 'Patrick Hand' : defaultComicFont(LOCALE); // mixed-case hand lettering
const DISPLAY = defaultComicSfxFont(LOCALE); // Bangers, Dela Gothic One, ZCOOL KuaiLe, Lalezar

// #region answer: one split across two facing pages, opened on a verso
// The content writes :::page{spread split="55 / * [25 | 25 | *]"}: one frame from the verso's
// outer margin to the recto's (the inner margins drop out), split as one page. The panorama
// crosses the spine; the line at 50 % of the lower tier is the spine itself, so its gutter
// straddles the fold and no panel is cut by it.
const comics = {
  gutter: { horizontal: mm(5), vertical: mm(4) }, // 2 mm of white on each side of the fold
  panel: { borderWidth: pt(0.75), borderColor: col('ink'), background: col('paper') },
  lettering: { fontFamily: LETTER, fontSize: pt(LATIN ? 9.5 : 8.5), lineHeight: 1.1,
    color: col('ink') },
  runningHeads: true, // folios on both halves
};
// A spread opens on a verso, an even page. Page 1 of a document is a recto, so the engine
// would leave it blank and start on page 2; this episode continues an album at page 2.
const continuation = { pageIndexOffset: 1, pageNumbering: { startAt: 2 } };
// #endregion

// #region balloons: the album's balloons and cartouches (Nº 152)
comics.balloonStyles = [
  { id: 'speech', fill: col('balloon'), stroke: col('ink'), strokeWidth: pt(0.6) },
  { id: 'caption', fill: col('cartouche'), stroke: col('ink'), strokeWidth: pt(0.6),
    padding: em(0.45), aspect: 3.4 },
  { id: 'shout', fill: col('balloon'), stroke: col('ink'), burstPoints: 16, fontScale: 1.2 },
  { id: 'whisper', fill: col('balloon'), stroke: col('ink') },
  { id: 'sfx', fontFamily: DISPLAY, color: col('orange'), halo: pt(1.6), haloColor: col('ink'),
    fontScale: 3.2 },
];
comics.cast = [
  { id: 'lola', name: 'Lola' },
  { id: 'paco', name: t({ es: 'el abuelo Paco', en: 'Grandpa Paco', ca: "l'avi Paco",
    zh: '帕科爷爷', ar: 'الجد باكو', ja: 'パコおじいちゃん', pt: 'o vovô Paco' }) },
];
// #endregion

const COLOPHON = t({
  es: 'Rotulado en Patrick Hand y Bangers (SIL OFL) · Dibujo: generado con modelos de difusión',
  en: 'Lettered in Patrick Hand and Bangers (SIL OFL) · Art: generated with diffusion models',
  ca: 'Retolat en Patrick Hand i Bangers (SIL OFL) · Dibuix: generat amb models de difusió',
  zh: '嵌字：Noto Sans SC、ZCOOL KuaiLe（SIL OFL）· 画面：由扩散模型生成',
  ar: 'الخطوط: Playpen Sans Arabic وLalezar (SIL OFL) · الرسوم: مولّدة بنماذج الانتشار',
  ja: '写植：Zen Antique、Dela Gothic One（SIL OFL）・ 作画：拡散モデルで生成',
  pt: 'Letreirado em Patrick Hand e Bangers (SIL OFL) · Arte: gerada com modelos de difusão',
});
const foot = (id, content, y, extra) => ({ kind: 'text', id, content, fontFamily: LETTER,
  align: 'center', pages: 'comic',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(y) } }, ...extra });

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LOCALE,
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(230), height: mm(300), dpi: 150, // the album of Nº 152
    backgroundColor: col('paper'),
    margins: { top: mm(18), bottom: mm(22), left: mm(16), right: mm(14), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: LETTER, fontSize: pt(11), lineHeight: pt(15), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink') },
  headings: { fontFamily: DISPLAY, color: col('orange'),
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] }, // the H1 break
  comics,
  header: { elements: [] },
  footer: { elements: [
    foot('folio', '{pageNumber}', -13, { fontSize: pt(10), color: col('ink') }),
    foot('colophon', COLOPHON, -7, { fontSize: pt(7), color: col('muted'), parity: 'odd' }),
  ] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: one :::page{spread}

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Patrick Hand': ['400'], Bangers: ['400'], // Latin editions
  'Noto Sans SC': ['400', '700'], 'ZCOOL KuaiLe': ['400'], // Chinese
  'Zen Antique': ['400'], 'Dela Gothic One': ['400'], // Japanese
  'Playpen Sans Arabic': ['400', '700'], Lalezar: ['400'], // Arabic
};

// #region art: the panel manifest: safe areas, speakers' mouths, heads and faces, in fractions
// The panorama is 1,900 px wide: across the 432 mm of the spread it prints at about 112 dpi.
const box = ([x, y, width, height]) => ({ x, y, width, height });
const who = (id, x, y, head, face) => ({ id, x, y,
  ...(head && { head: { x: head[0], y: head[1] } }), ...(face && { face: box(face) }) });
const ART = {
  ds1: { width: 1900, height: 633, safeArea: box([.02, .05, .96, .9]),
    alt: t({ en: 'Panorama of the crowded market hall: tiny Lola stands lost on the far left; '
        + 'far right, her grandfather searches the crowd.',
      es: 'Panorámica del mercado lleno de gente: a la izquierda del todo, Lola, '
        + 'diminuta, está perdida; a la derecha del todo, su abuelo la busca entre la multitud.',
      ca: 'Panoràmica del mercat ple de gent: a l’extrem esquerre, la Lola, petitíssima, '
        + 'està perduda; a l’extrem dret, el seu avi la busca entre la gentada.',
      zh: '拥挤的市场全景：最左边，小小的萝拉迷了路；最右边，她的爷爷在人群中寻找她。',
      ar: 'منظر واسع للسوق المزدحم: لولا الصغيرة تائهة في أقصى اليسار، وفي أقصى اليمين '
        + 'جدّها يبحث عنها بين الناس.',
      ja: '人でいっぱいの市場のパノラマ。左端に小さなローラが迷子になって立ち、右端では祖父が人ごみの中を探している。',
      pt: 'Panorama do mercado lotado: na ponta esquerda, a pequena Lola está perdida; na ponta '
        + 'direita, o avô a procura no meio da multidão.' }),
    anchors: [
      who('lola', .065, .58, [.063, .55], [.045, .51, .04, .11]),
      who('paco', .925, .38, [.925, .34], [.9, .3, .05, .12]),
    ],
  },
  ds2: { width: 1152, height: 1152, safeArea: box([.25, .05, .5, .92]),
    alt: t({ en: "Lola, tearful, stands among grown-ups' legs and shopping bags.",
      es: 'Lola, con lágrimas en los ojos, está de pie entre piernas de mayores y bolsas '
        + 'de la compra.',
      ca: 'La Lola, amb llàgrimes als ulls, és dreta entre cames de grans i bosses de la compra.',
      zh: '萝拉含着眼泪，站在大人们的腿和购物袋之间。',
      ar: 'لولا والدموع في عينيها واقفة بين سيقان الكبار وأكياس التسوّق.',
      ja: '涙ぐんだローラが、大人の足と買い物袋のあいだに立っている。',
      pt: 'Lola, com lágrimas nos olhos, está de pé entre pernas de adultos e sacolas '
        + 'de compras.' }),
    anchors: [
      who('lola', .505, .24, [.48, .17], [.4, .1, .18, .19]),
    ],
  },
  ds3: { width: 1000, height: 1000, safeArea: box([.15, .05, .7, .92]),
    alt: t({ en: 'Paco stands on a fruit crate and whistles through his fingers; shoppers '
        + 'turn to look.',
      es: 'Paco, subido a una caja de fruta, silba con los dedos; la gente se vuelve a mirar.',
      ca: 'En Paco, enfilat a una caixa de fruita, xiula amb els dits; la gent es gira a mirar.',
      zh: '帕科站在水果箱上，用手指吹口哨；买东西的人都回过头来看。',
      ar: 'باكو واقف على صندوق فاكهة ويصفّر بأصابعه، والمتسوّقون يلتفتون لينظروا.',
      ja: 'パコが果物の木箱に乗って指笛を吹き、買い物客がふり返る。',
      pt: 'Paco, em cima de um caixote de frutas, assobia com os dedos; as pessoas se viram '
        + 'para olhar.' }),
    anchors: [
      who('paco', .5, .2, [.47, .14], [.38, .08, .17, .16]),
      who('sfx', .62, .17),
    ],
  },
  ds4: { width: 1200, height: 800, safeArea: box([.2, .05, .62, .75]),
    alt: t({ en: "Lola leaps into her grandfather's arms; his beret flies off and the "
        + "stallholders smile.",
      es: 'Lola salta a los brazos de su abuelo; la boina sale volando y los tenderos sonríen.',
      ca: 'La Lola salta als braços del seu avi; la boina surt volant i els paradistes somriuen.',
      zh: '萝拉扑进爷爷怀里；他的贝雷帽飞了出去，摊主们都笑了。',
      ar: 'لولا تقفز إلى ذراعي جدّها، وقبعته تطير، والباعة يبتسمون.',
      ja: 'ローラが祖父の腕に飛びこむ。ベレー帽が飛び、店の人たちがほほえむ。',
      pt: 'Lola pula nos braços do avô; a boina sai voando e os feirantes sorriem.' }),
    anchors: [
      who('lola', .51, .27, [.47, .2], [.42, .14, .13, .19]),
      who('paco', .595, .31, [.62, .22], [.55, .14, .15, .22]),
    ],
    avoid: [box([.67, .06, .13, .22])],
  },

};
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const faces = { [LETTER]: FONTS[LETTER], [DISPLAY]: FONTS[DISPLAY] }; // this edition's faces
await loadFonts(FONTS, markdown + COLOPHON); // the Latin files of every face
await loadCjkFonts(faces, markdown + COLOPHON);
await loadArabicFonts(faces, markdown + COLOPHON);
await loadComicFonts(faces, markdown + COLOPHON);
const resources = await Promise.all([
  comicPanel('ds1', asset('ds1-1900.jpg'), ART.ds1), comicPanel('ds2', asset('ds2.jpg'), ART.ds2),
  comicPanel('ds3', asset('ds3.jpg'), ART.ds3), comicPanel('ds4', asset('ds4.jpg'), ART.ds4),
]);
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown + COLOPHON);
showBook(doc, { title: t({ es: 'Una página de cómic a doble página',
  en: 'One comic page across a double spread', ca: 'Una pàgina de còmic a doble pàgina',
  zh: '横跨两页的漫画', ar: 'صفحة قصص مصوّرة على صفحتين متقابلتين', ja: '見開きの漫画',
  pt: 'Uma página de quadrinhos em página dupla' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
