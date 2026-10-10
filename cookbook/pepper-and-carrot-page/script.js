// ═══ Postext Cookbook · Nº 155 · A Pepper&Carrot page re-lettered from its transcript ═══
// https://postext.dev/en/cookbook/pepper-and-carrot-page
// Code: MIT · Text and art: David Revoy and translators, Pepper&Carrot ep. 8 (CC BY 4.0)
// Fonts: Comic Neue, Bangers, Grenze Gotisch and 11 more (OFL) · Needs postext ≥ 1.25.0
//
// Two pages of an open-licensed webcomic, Pepper&Carrot episode 8 by David Revoy, set again
// from his text-free artwork: the panels are cut from his pages, the speakers' anchors come
// from the tails of his balloons, and the words come from the official translations, so the
// engine letters every edition itself.
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the sample's language: 'en' | 'es' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt'
const RECIPE = 'pepper-and-carrot-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: Pepper's red, the demons' black and a warm ink
const palette = {
  ink: '#241a14', // lettering and the title page
  accent: '#a8241c', // Pepper's red: the title and the sound effect
  demon: '#0f0f0f', // the demons' balloons, as Revoy letters them
  gilt: '#e4cf96', // the title tooled on the spell book's cover
  plate: '#151a20', // the dark halo that lifts the gilt off the cover
  muted: '#6a5c52', // credits and folios
  paper: '#fffdf8',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion

// #region editions: the lettering, sound-effect, demon, title-page and book-title faces
const [LETTERING, SFX, DEMON, TEXT, PLATE] = t({
  en: ['Comic Neue', 'Bangers', 'Grenze Gotisch', 'Source Serif 4', 'Zen Antique'],
  es: ['Comic Neue', 'Bangers', 'Grenze Gotisch', 'Source Serif 4', 'Zen Antique'],
  ca: ['Comic Neue', 'Bangers', 'Grenze Gotisch', 'Source Serif 4', 'Zen Antique'],
  ja: ['Zen Antique', 'Dela Gothic One', 'Dela Gothic One', 'Noto Serif JP', 'Zen Antique'],
  zh: ['ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou', 'ZCOOL QingKe HuangYou', 'Noto Serif SC',
    'Noto Sans SC'],
  ar: ['Playpen Sans Arabic', 'Lalezar', 'Lalezar', 'Noto Naskh Arabic', 'Lalezar'],
  pt: ['Comic Neue', 'Bangers', 'Grenze Gotisch', 'Source Serif 4', 'Zen Antique'],
});
// #endregion

// #region answer: Revoy's page grid, his speakers, and one balloon style per voice
// The Markdown is the episode's transcript turned into a script, one line per balloon:
//   :::page{split="29.9 / 49.3 / *"}        the page's three tiers, measured on his page
//   ::panel{art=e08p05-1}
//   pepper{shout break}: How could they do this to me ?!! To **me** !!!
//   monster: Monšters of Chaosāh àt your šeŗvice!
//   sfx{plate at="77.3% 14.4%" rotate=-11 skew=-8}: Incantations\
//     for Demons of\
//     CHAOSAH\
//     Vol .1                                 the book's title, a line per line of the cover
// The cast gives the demons Revoy's black balloons and a blackletter voice (its diacritics are
// his: the demons speak with an accent); 'plate' gilds the title on the book's cover.
const comics = {
  gutter: { horizontal: mm(5.4), vertical: mm(2.4) }, // his white gutters, measured
  panel: { borderWidth: pt(0), background: col('paper') }, // no frames: the art meets the white
  lettering: { fontFamily: LETTERING, fontSize: pt(10), color: col('ink'), inset: mm(2) },
  balloonStyles: [
    { id: 'speech', stroke: col('ink'), strokeWidth: pt(0.8) },
    { id: 'shout', stroke: col('ink'), strokeWidth: pt(1) },
    { id: 'caption', fill: col('paper'), stroke: col('ink') },
    { id: 'sfx', fontFamily: SFX, color: col('accent'), haloColor: col('paper') },
    { id: 'plate', shape: 'none', tail: 'none', fontFamily: PLATE, fontScale: 0.88,
      align: 'center', aspect: 3, color: col('gilt'), halo: pt(0.5), haloColor: col('plate'),
      letterSpacing: pt(0.2) }, // text tooled on an object, here a book's cover
  ],
  cast: [{ id: 'pepper', name: 'Pepper' }, { id: 'carrot', name: 'Carrot' },
    { id: 'monster', name: t({ en: 'Monsters of Chaosah', es: 'Demonios de Caosah',
      ca: 'Monstres del Chaosah', zh: '浑沌魔兽', ar: 'وحوش الفوضى', ja: 'ケイオサーの怪物',
      pt: 'Monstros do Caosah' }),
    fill: col('demon'), color: col('paper'), fontFamily: DEMON }],
  runningHeads: true, // the folio on comic pages
};
// #endregion

const footer = { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', pages: 'comic',
  fontFamily: TEXT, fontSize: pt(7.5), color: col('muted'), align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: mm(0), y: mm(-3) } } }] };

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es', ca: 'ca', ja: 'ja', zh: 'zh-Hans', ar: 'ar', pt: 'pt-BR' }),
  colorPalette, comics,
  // Revoy's pages are A4 with 8.5 mm of white around the art.
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(8.5), bottom: mm(8.7), left: mm(8.5), right: mm(8.2) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(15), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'), textAlign: 'left',
    firstLineIndent: pt(0), paragraphSpacing: true, hyphenation: { enabled: false } },
  headings: { fontFamily: LETTERING, color: col('ink'), fontWeight: 700,
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, fontSize: pt(30), lineHeight: pt(36), color: col('accent'), marginTop: mm(70),
        marginBottom: pt(15), breakBefore: { enabled: true, parity: 'any' } },
      { level: 2, fontSize: pt(10), lineHeight: pt(15), marginTop: mm(20), marginBottom: pt(4) },
    ] },
  paragraphStyles: [{ id: 'lead', fontSize: pt(13), lineHeight: pt(19) },
    { id: 'credits', fontSize: pt(8.5), lineHeight: pt(12), color: col('muted'),
      spaceBetween: pt(6) }],
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the six panels: safe areas and the speakers his balloon tails point at
// From the episode's pipeline: panels cut from the text-free pages, anchors where the tails of
// the English balloons end. Fractions of each picture, the same in every language.
const area = (x, y, width, height) => ({ x, y, width, height });
const ART = {
  'e08p05-1': { width: 1200, height: 500, safeArea: area(0.02, 0.03, 0.85, 0.93),
    anchors: [{ id: 'pepper', x: 0.4249, y: 0.6863 }] },
  'e08p05-2': { width: 1200, height: 823, safeArea: area(0.1, 0.09, 0.77, 0.81),
    anchors: [{ id: 'pepper', x: 0.7858, y: 0.6274 }] },
  'e08p05-3': { width: 1200, height: 342, safeArea: area(0.09, 0.12, 0.81, 0.88),
    anchors: [{ id: 'sfx', x: 0.1861, y: 0.66 }] },
  'e08p06-1': { width: 1200, height: 646, safeArea: area(0.15, 0.06, 0.73, 0.9),
    anchors: [{ id: 'monster', x: 0.4808, y: 0.293 }] },
  'e08p06-2': { width: 1200, height: 290, safeArea: area(0.59, 0.15, 0.3, 0.77) },
  'e08p06-3': { width: 1200, height: 730, safeArea: area(0.09, 0.1, 0.77, 0.7) },
};
const ALT = {
  'e08p05-1': t({ en: 'Lightning. Pepper, furious, pulls a book with a demon’s face on its cover '
      + 'from the shelf. Carrot is terrified.',
    es: 'Relámpagos. Pimienta, furiosa, saca de la estantería un libro con la cara de un demonio '
      + 'en '
      + 'la tapa. Zanahoria está aterrado.',
    ca: 'Llamps. La Pepper, furiosa, treu del prestatge un llibre amb la cara d’un dimoni a la '
      + 'coberta. En Carrot està aterrit.',
    zh: '电闪雷鸣。小辣椒怒气冲冲地从书架上抽出一本封面有恶魔脸的书。胡萝卜吓坏了。',
    ar: 'برق. فُلفُل غاضبة تسحب من الرف كتابًا على غلافه وجه شيطان، وجزرة مذعور.',
    ja: '稲妻。怒ったペッパーが、表紙に悪魔の顔のある本を棚から引き抜く。キャロットはおびえている。',
    pt: 'Relâmpagos. Pepper, furiosa, tira da estante um livro com a cara de um demônio na capa. '
      + 'Carrot está apavorado.' }),
  'e08p05-2': t({ en: 'From above, in the rain, Pepper draws three glowing red magic circles on '
      + 'the ground with her wand. Carrot watches.',
    es: 'Desde arriba, bajo la lluvia, Pimienta traza con su varita tres círculos mágicos rojos en '
      + 'el suelo. Zanahoria mira.',
    ca: 'Des de dalt, sota la pluja, la Pepper traça amb la vareta tres cercles màgics vermells a '
      + 'terra. En Carrot mira.',
    zh: '俯视：雨中，小辣椒用魔杖在地上画出三个发光的红色魔法阵，胡萝卜在一旁看着。',
    ar: 'من الأعلى، تحت المطر، ترسم فُلفُل بعصاها ثلاث دوائر سحرية حمراء متوهجة على الأرض، وجزرة '
      + 'يراقب.',
    ja: '上から見たところ。雨の中、ペッパーが杖で地面に赤く光る魔法陣を三つ描く。キャロットが見ている。',
    pt: 'Vista de cima, na chuva, Pepper traça com a varinha três círculos mágicos vermelhos e '
      + 'brilhantes no chão. Carrot observa.' }),
  'e08p05-3': t({ en: 'Red light floods the scene. Pepper, grim, holds the open book.',
    es: 'Una luz roja lo inunda todo. Pimienta, seria, sostiene el libro abierto.',
    ca: 'Una llum vermella ho inunda tot. La Pepper, seriosa, aguanta el llibre obert.',
    zh: '红光笼罩一切。小辣椒神情严峻，捧着打开的书。',
    ar: 'ضوء أحمر يغمر المشهد، وفُلفُل متجهّمة تمسك الكتاب مفتوحًا.',
    ja: '赤い光があたりを満たす。ペッパーが険しい顔で、開いた本を持っている。',
    pt: 'Uma luz vermelha inunda a cena. Pepper, séria, segura o livro aberto.' }),
  'e08p06-1': t({ en: 'Pepper and Carrot stand before three huge red-eyed demons that rise in the '
      + 'storm, lightning around them.',
    es: 'Pimienta y Zanahoria ante tres enormes demonios de ojos rojos que se alzan en la '
      + 'tormenta, entre relámpagos.',
    ca: 'La Pepper i en Carrot davant de tres dimonis enormes d’ulls vermells que s’alcen en la '
      + 'tempesta, entre llamps.',
    zh: '小辣椒和胡萝卜站在三个红眼巨魔面前，巨魔在暴风雨中升起，四周电光闪闪。',
    ar: 'فُلفُل وجزرة أمام ثلاثة شياطين ضخمة بعيون حمراء تنهض في العاصفة والبرق حولها.',
    ja: '嵐の中に現れた赤い目の巨大な悪魔三体の前に、ペッパーとキャロットが立つ。まわりに稲妻。',
    pt: 'Pepper e Carrot diante de três demônios enormes de olhos vermelhos que surgem na '
      + 'tempestade, entre relâmpagos.' }),
  'e08p06-2': t({ en: 'Pepper smiles a sly smile.', es: 'Pimienta sonríe con malicia.',
    ca: 'La Pepper somriu amb malícia.', zh: '小辣椒狡黠地一笑。', ar: 'فُلفُل تبتسم ابتسامة ماكرة.',
    ja: 'ペッパーがにやりと笑う。', pt: 'Pepper dá um sorriso malicioso.' }),
  'e08p06-3': t({ en: 'The party: Pepper, Carrot and the three demons drink tea around the table '
      + 'by candlelight, all smiling.',
    es: 'La fiesta: Pimienta, Zanahoria y los tres demonios toman té alrededor de la mesa a la luz '
      + 'de las velas, sonrientes.',
    ca: 'La festa: la Pepper, en Carrot i els tres dimonis prenen te al voltant de la taula a la '
      + 'llum de les espelmes, somrients.',
    zh: '派对：小辣椒、胡萝卜和三个恶魔围着桌子，在烛光下喝茶，个个笑容满面。',
    ar: 'الحفلة: فُلفُل وجزرة والشياطين الثلاثة يشربون الشاي حول المائدة على ضوء الشموع، مبتسمين.',
    ja: 'パーティー。ペッパーとキャロットと三体の悪魔が、ろうそくの明かりのテーブルを囲んでお茶を飲み、'
      + 'みんな笑っている。',
    pt: 'A festa: Pepper, Carrot e os três demônios tomam chá em volta da mesa à luz de velas, '
      + 'todos sorrindo.' }),
};
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face of the six editions; each edition loads the latin files of all of them and the
// Japanese, Chinese or Arabic files of its own.
const FONTS = {
  'Comic Neue': ['400', '400i', '700', '700i'],
  Bangers: ['400'],
  'Grenze Gotisch': ['400', '700'],
  'Source Serif 4': ['400', '700'],
  'Zen Antique': ['400'],
  'Dela Gothic One': ['400'],
  'Noto Serif JP': ['400', '700'],
  'ZCOOL KuaiLe': ['400'],
  'ZCOOL QingKe HuangYou': ['400'],
  'Noto Serif SC': ['400', '700'],
  'Noto Sans SC': ['400'],
  'Playpen Sans Arabic': ['400', '700'],
  Lalezar: ['400'],
  'Noto Naskh Arabic': ['400', '700'],
};

// #region vietnamese: a translator's name the latin-ext file does not cover
// The credits thank Hồ Nhựt Châu. Vietnamese letters live in a Fontsource file of their own,
// which neither loadFonts nor the PDF providers fetch: the page loads it for the credits' face,
// and the PDF provider adds it to that face when the page sets one of its letters.
const VI_RANGE = 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,'
  + 'U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB';
const VI = /[ĂăĐđƠơƯưẠ-ỹ]/u;
const viFile = (family, weight) => `https://cdn.jsdelivr.net/npm/@fontsource/`
  + `${fontsourceId(family)}@5/files/${fontsourceId(family)}-vietnamese-${weight}-normal.woff2`;
async function loadVietnamese(family) {
  if (!VI.test(markdown)) return;
  document.fonts.add(await new FontFace(family, `url(${viFile(family, 400)})`,
    { weight: '400', unicodeRange: VI_RANGE }).load());
}
async function pdfFonts(family, weight, style, request) {
  const files = [await comicPdfProvider(family, weight, style, request)].flat();
  const text = String.fromCodePoint(...(request?.codePoints ?? []));
  if (family !== TEXT || !VI.test(text)) return files;
  const res = await fetch(viFile(family, 400));
  return [...files, await decompressWoff2(new Uint8Array(await res.arrayBuffer()))];
}
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const faces = Object.fromEntries([LETTERING, SFX, DEMON, TEXT, PLATE].map((f) => [f, FONTS[f]]));
await loadFonts(FONTS, markdown);
await loadCjkFonts(faces, markdown, { vertical: LANG === 'ja' }); // ja balloons are vertical
await loadArabicFonts(faces, markdown);
await loadComicFonts({ [LETTERING]: FONTS[LETTERING], [SFX]: FONTS[SFX], [DEMON]: FONTS[DEMON] },
  markdown); // the bold and italic the lettering faces do not ship
await loadVietnamese(TEXT);
const panel = async (id, url) => ({ ...(await comicPanel(id, url, { ...ART[id], alt: ALT[id] })),
  note: 'David Revoy, www.peppercarrot.com (CC BY 4.0)' }); // the credit every picture carries
const resources = await Promise.all([
  panel('e08p05-1', asset('e08p05-1.jpg')), panel('e08p05-2', asset('e08p05-2.jpg')),
  panel('e08p05-3', asset('e08p05-3.jpg')), panel('e08p06-1', asset('e08p06-1.jpg')),
  panel('e08p06-2', asset('e08p06-2.jpg')), panel('e08p06-3', asset('e08p06-3.jpg')),
]);
const doc = await withLoadedFonts(() => buildDocument({ markdown, resources }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'A Pepper&Carrot page re-lettered from its transcript',
  es: 'Una página de Pepper&Carrot rotulada de nuevo a partir de su transcripción',
  pt: 'Uma página de Pepper&Carrot reletreirada pela transcrição' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: pdfFonts, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
