// ═══ Postext Cookbook · Nº 152 · An album page in clear line, with narration captions ═══
// https://postext.dev/en/cookbook/tebeo-album-page
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Patrick Hand, Bangers, the comic faces of each script (OFL) · Needs postext ≥ 1.21.0
// A Spanish album page in the Franco-Belgian way: four tiers, yellow narration boxes, and
// balloons lettered in upper and lower case. Every edition re-letters the same split and art.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultComicFont, defaultComicSfxFont,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the album's language: 'es' | 'en' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt'
const RECIPE = 'tebeo-album-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: flat clear-line colours: ink, the oranges, the yellow of the cartouches
const palette = {
  ink: '#1d1b19', // outlines, lettering
  orange: '#d9601a', // the title and the sound effect (3.6:1 on paper, display sizes only)
  cartouche: '#fbe8a6', // narration boxes
  balloon: '#ffffff',
  muted: '#5f5a54', // credits
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
// A hand that letters in upper and lower case for the Latin editions; the engine's comic
// faces for Chinese, Japanese and Arabic, which a Latin hand cannot set.
const LATIN = ['es', 'en', 'ca', 'pt'].includes(LANG);
const LETTER = LATIN ? 'Patrick Hand' : defaultComicFont(LOCALE);
const DISPLAY = defaultComicSfxFont(LOCALE); // Bangers, Dela Gothic One, ZCOOL KuaiLe, Lalezar

// #region answer: the album's look: thin square frames, yellow cartouches, mixed-case lettering
const comics = {
  gutter: { horizontal: mm(4.5), vertical: mm(3.5) }, // between tiers, between panels
  panel: { borderWidth: pt(0.75), borderColor: col('ink'), background: col('paper') },
  panelStyles: [{ id: 'open', borderStyle: 'none' }], // the last panel: an epilogue, unframed
  lettering: { fontFamily: LETTER, fontSize: pt(LATIN ? 9 : 8), lineHeight: 1.1,
    color: col('ink'), textTransform: 'none' }, // European letterers write in mixed case
  balloonStyles: [
    { id: 'speech', fill: col('balloon'), stroke: col('ink'), strokeWidth: pt(0.6) },
    // Narration: rectangles butted into a corner of the panel, never with a tail.
    { id: 'caption', fill: col('cartouche'), stroke: col('ink'), strokeWidth: pt(0.6),
      padding: em(0.45), aspect: 3.4 },
    { id: 'shout', fill: col('balloon'), stroke: col('ink'), burstPoints: 16, fontScale: 1.2 },
    { id: 'thought', fill: col('balloon'), stroke: col('ink') },
    { id: 'sfx', fontFamily: DISPLAY, color: col('orange'), halo: pt(1.6), haloColor: col('ink'),
      fontScale: 2.8 },
  ],
  cast: [ // names for the tagged PDF and EPUB, which read the balloons aloud
    { id: 'lola', name: 'Lola' },
    { id: 'paco', name: t({ es: 'el abuelo Paco', en: 'Grandpa Paco', ca: "l'avi Paco",
      zh: '帕科爷爷', ar: 'الجد باكو', ja: 'パコおじいちゃん', pt: 'o vovô Paco' }) },
    { id: 'carmen', name: 'Carmen' },
  ],
  runningHeads: true, // the folio prints on the comic page too
};
// #endregion

// #region title-page: the page facing the story: series, title in the sound-effect face, vignette
const centred = (id, y) => ({ anchor: { to: id, edge: 'below' }, offset: { y: mm(y) },
  size: { width: 'fill', height: 'auto' } }); // full width, so align: 'center' centres it
const titlePage = {
  id: 'title-page', numbered: false, toc: false, breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, minHeight: mm(212), slot: { elements: [
    { kind: 'text', id: 'series', content: '{attr.series}', fontFamily: LETTER, fontSize: pt(17),
      color: col('ink'), align: 'center', overflow: 'wrap',
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(24) },
        size: { width: 'fill', height: 'auto' } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(58),
      lineHeight: 1.05, color: col('orange'), align: 'center', overflow: 'wrap',
      placement: centred('#series', 5) },
    { kind: 'image', id: 'vignette', resourceId: 't3', decorative: true, // 3 : 2, uncropped
      placement: { anchor: { to: '#title', edge: 'below' }, offset: { x: mm(10), y: mm(14) },
        size: { width: mm(180), height: mm(120) } } },
  ] } },
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LOCALE,
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(230), height: mm(300), dpi: 150, // a hardback album
    backgroundColor: col('paper'),
    margins: { top: mm(18), bottom: mm(22), left: mm(16), right: mm(14), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: LETTER, fontSize: pt(11), lineHeight: pt(15), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'center', firstLineIndent: mm(0), hyphenation: { enabled: false },
  },
  headings: { fontFamily: DISPLAY, color: col('orange'),
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] }, // the H1 break
  headingStyles: [titlePage],
  paragraphStyles: [
    { id: 'credits', fontFamily: LETTER, fontSize: pt(9.5), lineHeight: pt(13),
      color: col('muted'), textAlign: 'center', marginTop: pt(6) },
  ],
  comics,
  header: { elements: [] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', fontFamily: LETTER,
    fontSize: pt(10), color: col('ink'), align: 'center', pages: 'comic', // not on the title
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-10) } } }] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the title page, then the :::page

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Patrick Hand': ['400'], Bangers: ['400'], // Latin editions
  'Noto Sans SC': ['400', '700'], 'ZCOOL KuaiLe': ['400'], // Chinese
  'Zen Antique': ['400'], 'Dela Gothic One': ['400'], // Japanese
  'Playpen Sans Arabic': ['400', '700'], Lalezar: ['400'], // Arabic
};

// #region art: the panel manifest: safe areas, speakers' mouths, heads and faces, in fractions
const box = ([x, y, width, height]) => ({ x, y, width, height });
const who = (id, x, y, head, face) => ({ id, x, y,
  ...(head && { head: { x: head[0], y: head[1] } }), ...(face && { face: box(face) }) });
const ART = {
  t1: { width: 1100, height: 733, safeArea: box([.22, .17, .62, .6]),
    alt: t({ en: 'A sunny Sunday in Madrid: an iron-and-glass market hall on a plaza with shoppers '
        + 'and pigeons.',
      es: 'Un domingo de sol en Madrid: un mercado de hierro y cristal en una plaza, con gente de '
        + 'compras y palomas.',
      ca: 'Un diumenge de sol a Madrid: un mercat de ferro i vidre en una plaça, amb gent '
        + 'comprant i coloms.',
      zh: '马德里一个晴朗的星期天：广场上一座铁架玻璃顶的市场，有买菜的人和鸽子。',
      ar: 'يوم أحد مشمس في مدريد: سوق من الحديد والزجاج في ساحة، فيها متسوّقون وحمام.',
      ja: '晴れた日曜日のマドリード。広場に鉄とガラスの市場が建ち、買い物客とハトがいる。',
      pt: 'Um domingo de sol em Madri: um mercado de ferro e vidro numa praça, com gente fazendo '
        + 'compras e pombos.' }),
  },
  t2: { width: 1000, height: 1000, safeArea: box([.2, .13, .71, .46]),
    alt: t({ en: 'Inside the market, Lola pulls her grandfather Paco by the hand, pointing ahead '
        + 'between the stalls.',
      es: 'Dentro del mercado, Lola tira de la mano de su abuelo Paco y señala adelante, entre '
        + 'los puestos.',
      ca: 'Dins del mercat, la Lola estira el seu avi Paco de la mà i assenyala endavant, entre '
        + 'les parades.',
      zh: '市场里，萝拉拉着爷爷帕科的手，指着摊位之间的前方。',
      ar: 'داخل السوق تشدّ لولا جدّها باكو من يده وتشير إلى الأمام بين الأكشاك.',
      ja: '市場の中、ローラが祖父パコの手を引き、売り場のあいだの先を指さしている。',
      pt: 'Dentro do mercado, Lola puxa o avô Paco pela mão e aponta adiante, entre as '
        + 'bancas.' }),
    anchors: [
      who('paco', .315, .28, [.32, .2], [.22, .13, .17, .19]),
      who('lola', .7, .415, [.66, .33], [.6, .3, .17, .17]),
    ],
    avoid: [box([.82, .4, .1, .06])],
  },
  t3: { width: 1200, height: 800, safeArea: box([.13, .12, .79, .58]),
    alt: t({ en: 'Lola gazes up at a towering pyramid of oranges while Carmen, the fruit seller, '
        + 'polishes an orange.',
      es: 'Lola mira hacia arriba una pirámide altísima de naranjas mientras Carmen, la frutera, '
        + 'saca brillo a una naranja.',
      ca: 'La Lola mira amunt una piràmide altíssima de taronges mentre la Carmen, la fruitera, '
        + 'fa brillar una taronja.',
      zh: '萝拉仰头望着一座高高的橙子金字塔，水果摊主卡门正在擦亮一个橙子。',
      ar: 'لولا تنظر إلى هرم عالٍ من البرتقال، بينما كارمن بائعة الفاكهة تلمّع برتقالة.',
      ja: 'ローラがそびえるオレンジのピラミッドを見上げ、果物屋のカルメンはオレンジをみがいている。',
      pt: 'Lola olha para cima, para uma pirâmide altíssima de laranjas, enquanto Carmen, a '
        + 'feirante, lustra uma laranja.' }),
    anchors: [
      who('lola', .235, .43, [.19, .36], [.14, .3, .13, .18]),
      who('carmen', .795, .27, [.8, .19], [.74, .12, .13, .19]),
    ],
    avoid: [box([.4, .2, .2, .15])],
  },
  t4: { width: 1152, height: 1152, safeArea: box([.08, .08, .76, .65]),
    alt: t({ en: 'Lola reaches for an orange at the bottom of the pile; Paco, alarmed, raises a '
        + 'hand to stop her.',
      es: 'Lola alarga la mano hacia una naranja de la base del montón; Paco, alarmado, levanta '
        + 'la mano para detenerla.',
      ca: 'La Lola allarga la mà cap a una taronja de la base de la pila; en Paco, alarmat, '
        + 'aixeca la mà per aturar-la.',
      zh: '萝拉伸手去拿最底下的一个橙子；帕科吓了一跳，举手想拦住她。',
      ar: 'لولا تمدّ يدها إلى برتقالة في أسفل الكومة، وباكو مذعورًا يرفع يده ليوقفها.',
      ja: 'ローラが山のいちばん下のオレンジに手をのばし、あわてたパコが止めようと手を上げる。',
      pt: 'Lola estica a mão para uma laranja da base da pilha; Paco, assustado, levanta a mão '
        + 'para impedi-la.' }),
    anchors: [
      who('paco', .31, .3, [.28, .17], [.17, .1, .2, .26]),
      who('lola', .635, .485, [.61, .38], [.48, .28, .27, .27]),
    ],
    // Lola's reaching arm and her hand on the orange: the thought balloon keeps off them.
    avoid: [box([.62, .58, .17, .22]), box([.7, .78, .15, .1]), box([.1, .36, .15, .19])],
  },
  t5: { width: 1100, height: 733, safeArea: box([.06, .16, .9, .41]),
    alt: t({ en: "The orange pyramid collapses: oranges roll everywhere, Paco's beret flies off, "
        + "Carmen throws up her hands, pigeons scatter.",
      es: 'La pirámide se derrumba: las naranjas ruedan por todas partes, la boina de Paco sale '
        + 'volando, Carmen levanta los brazos y las palomas huyen.',
      ca: 'La piràmide s’enfonsa: les taronges rodolen per tot arreu, la boina d’en Paco surt '
        + 'volant, la Carmen aixeca els braços i els coloms fugen.',
      zh: '橙子金字塔塌了：橙子滚得到处都是，帕科的贝雷帽飞了出去，卡门举起双手，鸽子四散飞走。',
      ar: 'ينهار هرم البرتقال: البرتقال يتدحرج في كل مكان، وقبعة باكو تطير، وكارمن ترفع يديها، '
        + 'والحمام يتفرّق.',
      ja: 'オレンジのピラミッドがくずれる。オレンジが転がり、パコのベレー帽が飛び、カルメンが両手を上げ、ハトが散る。',
      pt: 'A pirâmide de laranjas desaba: laranjas rolam por toda parte, a boina de Paco sai '
        + 'voando, Carmen ergue os braços e os pombos fogem.' }),
    anchors: [
      who('lola', .15, .44, [.14, .37], [.08, .32, .12, .15]),
      who('paco', .34, .31, [.33, .27], [.27, .22, .12, .14]),
      who('carmen', .81, .37, [.8, .3], [.74, .22, .13, .18]),
      who('sfx', .55, .45),
    ],
    avoid: [box([.24, .12, .09, .1])],
  },
  t6: { width: 1200, height: 800, safeArea: box([.15, .1, .68, .58]),
    alt: t({ en: 'Lola, Paco and Carmen kneel to gather the oranges into the beret and the apron, '
        + 'laughing; a pigeon pecks one.',
      es: 'Lola, Paco y Carmen, de rodillas, recogen las naranjas en la boina y el delantal entre '
        + 'risas; una paloma picotea una.',
      ca: 'La Lola, en Paco i la Carmen, de genolls, recullen les taronges a la boina i al '
        + 'davantal entre rialles; un colom en picoteja una.',
      zh: '萝拉、帕科和卡门跪在地上，笑着把橙子捡进贝雷帽和围裙里；一只鸽子在啄一个橙子。',
      ar: 'لولا وباكو وكارمن جاثون يجمعون البرتقال في القبعة والمريلة وهم يضحكون، وحمامة تنقر '
        + 'واحدة.',
      ja: 'ローラとパコとカルメンがひざをつき、笑いながらオレンジをベレー帽とエプロンに集める。ハトが一つつついている。',
      pt: 'Lola, Paco e Carmen, de joelhos, juntam as laranjas na boina e no avental, rindo; um '
        + 'pombo bica uma delas.' }),
    anchors: [
      who('lola', .245, .42, [.24, .33], [.17, .27, .14, .2]),
      who('paco', .49, .3, [.48, .22], [.42, .14, .14, .2]),
      who('carmen', .73, .28, [.73, .2], [.67, .12, .13, .19]),
    ],
    avoid: [box([.74, .75, .14, .2])],
  },
  t7: { width: 1300, height: 867, safeArea: box([.19, .17, .56, .58]),
    alt: t({ en: "On a park bench, Lola and Paco peel oranges and laugh; a pigeon sits on Paco's "
        + "beret.",
      es: 'En un banco del parque, Lola y Paco pelan naranjas y se ríen; una paloma se ha posado '
        + 'en la boina de Paco.',
      ca: 'En un banc del parc, la Lola i en Paco pelen taronges i riuen; un colom s’ha posat a '
        + 'la boina d’en Paco.',
      zh: '公园长椅上，萝拉和帕科剥着橙子笑着；一只鸽子停在帕科的贝雷帽上。',
      ar: 'على مقعد في الحديقة يقشّر لولا وباكو البرتقال ويضحكان، وحمامة تقف على قبعة باكو.',
      ja: '公園のベンチでローラとパコがオレンジをむいて笑っている。パコのベレー帽にハトがとまっている。',
      pt: 'Num banco de praça, Lola e Paco descascam laranjas e riem; um pombo pousou na boina '
        + 'de Paco.' }),
    anchors: [
      who('lola', .32, .45, [.31, .35], [.24, .3, .15, .22]),
      who('paco', .6, .38, [.65, .25], [.54, .2, .19, .24]),
    ],
    avoid: [box([.6, .01, .13, .15])],
  },

};
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const faces = { [LETTER]: FONTS[LETTER], [DISPLAY]: FONTS[DISPLAY] }; // this edition's two faces
await loadFonts(FONTS, markdown); // the Latin files of every face; then each script's own
await loadCjkFonts(faces, markdown);
await loadArabicFonts(faces, markdown);
await loadComicFonts(faces, markdown);
const resources = await Promise.all([
  comicPanel('t1', asset('t1.jpg'), ART.t1), comicPanel('t2', asset('t2.jpg'), ART.t2),
  comicPanel('t3', asset('t3.jpg'), ART.t3), comicPanel('t4', asset('t4.jpg'), ART.t4),
  comicPanel('t5', asset('t5.jpg'), ART.t5), comicPanel('t6', asset('t6.jpg'), ART.t6),
  comicPanel('t7', asset('t7.jpg'), ART.t7),
]);
// pageIndexOffset 1: the title page is a verso, so it faces the story's first page.
const continuation = { pageIndexOffset: 1, pageNumbering: { startAt: 2 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showBook(doc, { title: t({ es: 'Una página de álbum', en: 'An album page', ca: "Una pàgina d'àlbum",
  zh: '一页欧式漫画', ar: 'صفحة من ألبوم مصوّر', ja: 'BDのアルバムの一ページ',
  pt: 'Uma página de álbum' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
