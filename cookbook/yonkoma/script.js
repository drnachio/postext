// ═══ Postext Cookbook · Nº 151 · Two yonkoma strips on a page ═════════════════════════
// https://postext.dev/en/cookbook/yonkoma
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Zen Antique, Comic Neue and six more (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A page of a cat-café yonkoma: two four-panel strips side by side, the right one first.
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: this edition's language; the Japanese original faces it
const RECIPE = 'yonkoma';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black ink on a warm white, one screen-tone grey
const palette = {
  ink: '#151413', // panel borders, balloon outlines, the lettering
  paper: '#fdfcf9', // the page and the balloons
  tone: '#e8e6e1', // the inner-voice box, a light screen tone
  muted: '#6f6b64',
  accent: '#a8322b', // the cover red (the Folio case in recipe.json)
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion

// The engine's lettering and sound-effect faces per language (defaultComicFont and
// defaultComicSfxFont), written out so FONTS and the PDF know them.
const EDITIONS = {
  ja: { locale: 'ja', faces: ['Zen Antique', 'Dela Gothic One'] },
  en: { locale: 'en-us', faces: ['Comic Neue', 'Bangers'] },
  es: { locale: 'es', faces: ['Comic Neue', 'Bangers'] },
  ca: { locale: 'ca', faces: ['Comic Neue', 'Bangers'] },
  zh: { locale: 'zh-Hans', faces: ['Noto Sans SC', 'ZCOOL KuaiLe'] },
  ar: { locale: 'ar', faces: ['Playpen Sans Arabic', 'Lalezar'] },
  pt: { locale: 'pt-BR', faces: ['Comic Neue', 'Bangers'] },
};

// #region answer: two columns of four, read from the right
// content.<lang>.md splits the page `* [* / * / * / *] | * [* / * / * / *]`: two equal
// columns, each cut into four equal panels. The reading direction lays the first column
// out on the right, so the strip that opens the page is the right-hand one, as in a
// yonkoma magazine, and each strip still reads top to bottom. The gutter between the
// strips is wider than the gutters between their panels, so the eye drops down a strip
// before it crosses to the next.
const comics = (lang) => ({
  artDirection: 'rtl', // the right strip first, in every edition
  mirrorArt: false,
  gutter: { horizontal: mm(3), vertical: mm(9) }, // 3 mm between panels, 9 mm between strips
  panel: { borderWidth: pt(0.9), borderColor: col('ink'), background: col('paper') },
  lettering: {
    fontFamily: EDITIONS[lang].faces[0], color: col('ink'),
    fontSize: pt(['ja', 'zh'].includes(lang) ? 8 : 7), // a yonkoma letters smaller than a story
    writingMode: lang === 'zh' ? 'vertical' : 'auto',
    maxColumnChars: 6, // short columns: a yonkoma panel is wider than it is tall
  },
  balloonStyles: balloons(),
});
// #endregion

// #region balloons: round speech, and a black box for each strip's title
const balloons = () => [
  { id: 'speech', fill: col('paper'), stroke: col('ink'), strokeWidth: pt(0.6), roundness: 2.4 },
  { id: 'shout', fill: col('paper'), stroke: col('ink'), burstPoints: 16 },
  // caption{title}: the strip's title, white on black in the first panel's corner
  { id: 'title', shape: 'rectangle', fill: col('ink'), stroke: col('ink'), color: col('paper'),
    bold: true, tail: 'none', position: 'top-start', butt: true, align: 'center' },
  { id: 'sfx', color: col('ink'), haloColor: col('paper'), fontScale: 1.8 }, // chibi: small effects
];
// #endregion

const config = () => ({
  // Each edition's language, written out (gotcha: ja-locale-tag); the original is built
  // with 'ja' in every edition (edition('ja') below).
  locale: t({ ja: 'ja', en: 'en-us', es: 'es', ca: 'ca', zh: 'zh-Hans', ar: 'ar', pt: 'pt-BR' }),
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(148), height: mm(210), dpi: 150, // A5, a yonkoma anthology
    binding: 'right', backgroundColor: col('paper'), // manga open from the right, in any language
    margins: { top: mm(15), bottom: mm(15), left: mm(14), right: mm(14), mirror: true },
  },
  bodyText: {
    fontFamily: 'Zen Antique', fontSize: pt(9), lineHeight: pt(15), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  },
  headings: { fontFamily: 'Zen Antique', color: col('ink'),
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] }, // the H1 break
  header: { elements: [] }, // comic pages are all panels: no running heads, no folios
  footer: { elements: [] },
  comics: comics(LANG),
});
// Another edition changes the language and the faces; the strips and their order stay.
const edition = (lang) => ({ ...config(), locale: EDITIONS[lang].locale, comics: comics(lang) });

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: this edition's lettering
const original = /* @content@ja */ ''; // content.ja.md, the original, in every edition
const english = /* @content@en */ ''; // the Japanese edition faces the original with it
// The same panels and speaker ids in every file; only the words change.

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Zen Antique': ['400'], 'Dela Gothic One': ['400'], 'Comic Neue': ['400', '700', '400i', '700i'],
  Bangers: ['400'], 'Noto Sans SC': ['400', '700'], 'ZCOOL KuaiLe': ['400'],
  'Playpen Sans Arabic': ['400', '700'], Lalezar: ['400'],
};

// #region art: eight chibi panels drawn for the recipe, speakers and faces marked once
const cat = (id, x, y, fx, fy, w = 0.12, h = 0.15) => ({ id, x, y,
  face: { x: fx, y: fy, width: w, height: h } });
const nose = (id, x, y) => ({ id, x, y, head: { x, y: y - 0.04 } }); // cats asleep or eating
const ART = { // fractions of the picture: the same in every language
  door: {
    alt: t({ en: "Mugi unlocks the café's glass door; the white, black and calico cats wait.",
      es: 'Mugi abre la puerta de cristal del café; dentro esperan los tres gatos.',
      ca: 'La Mugi obre la porta de vidre del cafè; a dins esperen els tres gats.',
      zh: '麦打开猫咖的玻璃门，三只猫在里面等着。',
      ar: 'موغي تفتح باب المقهى الزجاجي، والقطط الثلاث تنتظر في الداخل.',
      ja: '猫カフェのガラス戸を開けるむぎ。中で3匹の猫が待っている。',
      pt: 'Mugi abre a porta de vidro do café; lá dentro, os três gatos esperam.' }),
  safeArea: { x: 0.09, y: 0.19, width: 0.81, height: 0.52 },
  anchors: [{ id: 'mugi', x: 0.205, y: 0.385, head: { x: 0.17, y: 0.25 },
    face: { x: 0.1, y: 0.2, width: 0.2, height: 0.23 } },
  cat('shiro', 0.5, 0.66, 0.44, 0.55, 0.13), cat('kuro', 0.66, 0.62, 0.61, 0.52, 0.12, 0.14),
  cat('mike', 0.83, 0.645, 0.77, 0.53, 0.12, 0.16)] },
  bowls: {
    alt: t({ en: 'Mugi sets out full food bowls in front of the three cats.',
      es: 'Mugi pone cuencos llenos delante de los tres gatos.',
      ca: 'La Mugi posa bols plens de menjar davant dels tres gats.',
      zh: '麦把装满猫粮的碗摆在三只猫面前。',
      ar: 'موغي تضع صحون طعام ممتلئة أمام القطط الثلاث.',
      ja: '3匹の猫の前に、ご飯を盛った器を並べるむぎ。',
      pt: 'Mugi põe tigelas cheias de comida na frente dos três gatos.' }),
  safeArea: { x: 0.16, y: 0.26, width: 0.74, height: 0.65 },
  anchors: [{ id: 'mugi', x: 0.27, y: 0.465, head: { x: 0.25, y: 0.3 },
    face: { x: 0.17, y: 0.26, width: 0.16, height: 0.24 } },
  cat('shiro', 0.37, 0.63, 0.31, 0.52, 0.13, 0.16), cat('kuro', 0.6, 0.64, 0.55, 0.52, 0.11, 0.16),
  cat('mike', 0.82, 0.62, 0.76, 0.52, 0.12, 0.14)] },
  onebowl: {
    alt: t({ en: 'All three cats push their heads into the same bowl; the others stay full.',
      es: 'Los tres gatos meten la cabeza en el mismo cuenco; los otros siguen llenos.',
      ca: 'Els tres gats fiquen el cap al mateix bol; els altres continuen plens.',
      zh: '三只猫把头挤进同一个碗里，另外两个碗还满着。',
      ar: 'القطط الثلاث تدسّ رؤوسها في الصحن نفسه، والصحنان الآخران ممتلئان.',
      ja: '3匹そろって同じ器に頭を突っこみ、ほかの器は手つかず。',
      pt: 'Os três gatos enfiam a cabeça na mesma tigela; as outras continuam cheias.' }),
  safeArea: { x: 0.05, y: 0.27, width: 0.88, height: 0.66 },
  anchors: [nose('shiro', 0.33, 0.66), nose('kuro', 0.5, 0.6), nose('mike', 0.66, 0.68),
    { id: 'sfx', x: 0.5, y: 0.3 }] },
  toast: {
    alt: t({ en: 'Mugi bites her toast while the three cats stare at it with shining eyes.',
      es: 'Mugi muerde su tostada mientras los tres gatos la miran con ojos brillantes.',
      ca: 'La Mugi mossega la torrada mentre els tres gats la miren amb ulls brillants.',
      zh: '麦咬着吐司，三只猫眼睛发亮地盯着。',
      ar: 'موغي تقضم خبزها المحمّص والقطط الثلاث تحدّق فيه بعيون لامعة.',
      ja: 'トーストをかじるむぎを、3匹がきらきらした目で見つめる。',
      pt: 'Mugi morde a torrada enquanto os três gatos olham para ela com olhos brilhando.' }),
  safeArea: { x: 0.09, y: 0.22, width: 0.85, height: 0.56 },
  avoid: [{ x: 0.6, y: 0.52, width: 0.15, height: 0.1 }],
  anchors: [{ id: 'mugi', x: 0.8, y: 0.5, head: { x: 0.85, y: 0.32 },
    face: { x: 0.75, y: 0.25, width: 0.2, height: 0.33 } },
  cat('shiro', 0.17, 0.71, 0.1, 0.6, 0.14, 0.16), cat('kuro', 0.32, 0.73, 0.26, 0.62, 0.12, 0.14),
  cat('mike', 0.46, 0.66, 0.4, 0.56, 0.12, 0.14)] },
  guest: {
    alt: t({ en: 'A tired office worker walks in, arms out; Mugi greets him from the counter.',
      es: 'Un oficinista cansado entra con los brazos abiertos; Mugi lo saluda desde la barra.',
      ca: 'Un oficinista cansat entra amb els braços oberts; la Mugi el saluda des de la barra.',
      zh: '一个疲惫的上班族张着双臂走进来，麦在柜台后招呼他。',
      ar: 'موظف متعب يدخل فاتحًا ذراعيه، وموغي ترحّب به من خلف المنضدة.',
      ja: '両手を広げて入ってくる疲れた会社員と、カウンターから迎えるむぎ。',
      pt: 'Um funcionário de escritório cansado entra de braços abertos; Mugi o recebe do '
        + 'balcão.' }),
  safeArea: { x: 0.13, y: 0.14, width: 0.74, height: 0.51 },
  anchors: [{ id: 'kyaku', x: 0.31, y: 0.42, head: { x: 0.28, y: 0.3 },
    face: { x: 0.19, y: 0.22, width: 0.21, height: 0.26 } },
  { id: 'mugi', x: 0.76, y: 0.39, head: { x: 0.76, y: 0.28 },
    face: { x: 0.68, y: 0.2, width: 0.18, height: 0.25 } }] },
  nap: {
    alt: t({ en: 'The three cats asleep in one pile on a round cushion.',
      es: 'Los tres gatos dormidos en un montón sobre un cojín redondo.',
      ca: 'Els tres gats adormits en un munt sobre un coixí rodó.',
      zh: '三只猫挤成一团睡在圆垫子上。',
      ar: 'القطط الثلاث نائمة كومةً واحدة على وسادة مستديرة.',
      ja: '丸いクッションの上で、ひとかたまりになって眠る3匹。',
      pt: 'Os três gatos dormem amontoados numa almofada redonda.' }),
  safeArea: { x: 0.27, y: 0.21, width: 0.52, height: 0.55 },
  anchors: [nose('shiro', 0.4, 0.42), nose('kuro', 0.41, 0.7), nose('mike', 0.72, 0.58),
    { id: 'sfx', x: 0.3, y: 0.25 }] },
  laptop: {
    alt: t({ en: 'The office worker sighs at a café table and opens his laptop.',
      es: 'El oficinista suspira en una mesa del café y abre el portátil.',
      ca: 'L’oficinista sospira en una taula del cafè i obre el portàtil.',
      zh: '上班族在咖啡桌前叹了口气，打开笔记本电脑。',
      ar: 'الموظف يتنهّد إلى طاولة في المقهى ويفتح حاسوبه.',
      ja: 'カフェのテーブルでため息をつき、ノートパソコンを開く会社員。',
      pt: 'O funcionário suspira numa mesa do café e abre o notebook.' }),
  safeArea: { x: 0.22, y: 0.25, width: 0.56, height: 0.55 },
  anchors: [{ id: 'kyaku', x: 0.45, y: 0.62, head: { x: 0.39, y: 0.4 },
    face: { x: 0.3, y: 0.3, width: 0.22, height: 0.38 } }] },
  keyboard: {
    alt: t({ en: 'The three cats sit on the keyboard; the worker cries tears of joy.',
      es: 'Los tres gatos se sientan en el teclado; el oficinista llora de alegría.',
      ca: 'Els tres gats seuen damunt del teclat; l’oficinista plora d’alegria.',
      zh: '三只猫坐在键盘上，上班族喜极而泣。',
      ar: 'القطط الثلاث تجلس على لوحة المفاتيح، والموظف يبكي من الفرح.',
      ja: 'キーボードの上に座る3匹と、うれし泣きする会社員。',
      pt: 'Os três gatos sentam no teclado; o funcionário chora de alegria.' }),
  safeArea: { x: 0.07, y: 0.1, width: 0.81, height: 0.78 },
  anchors: [{ id: 'kyaku', x: 0.29, y: 0.42, head: { x: 0.25, y: 0.2 },
    face: { x: 0.15, y: 0.1, width: 0.27, height: 0.4 } },
  cat('shiro', 0.42, 0.57, 0.36, 0.48, 0.13, 0.14), cat('kuro', 0.59, 0.6, 0.53, 0.5, 0.12, 0.14),
  cat('mike', 0.74, 0.62, 0.68, 0.52, 0.12, 0.14)] },
};
const panels = () => Promise.all([
  comicPanel('door', asset('neko-door.jpg'), ART.door),
  comicPanel('bowls', asset('neko-bowls.jpg'), ART.bowls),
  comicPanel('onebowl', asset('neko-onebowl.jpg'), ART.onebowl),
  comicPanel('toast', asset('neko-toast.jpg'), ART.toast),
  comicPanel('guest', asset('neko-guest.jpg'), ART.guest),
  comicPanel('nap', asset('neko-nap.jpg'), ART.nap),
  comicPanel('laptop', asset('neko-laptop.jpg'), ART.laptop),
  comicPanel('keyboard', asset('neko-keyboard.jpg'), ART.keyboard),
]);
// #endregion

// #region fonts: each edition loads its two faces with the words they set
const SFX = /^sfx[^:：\n]*[:：](.*)$/gm; // sound-effect lines: the second face sets them
async function loadEdition(lang) {
  const text = TEXT[lang];
  const [face, sfx] = EDITIONS[lang].faces;
  const faces = { [face]: FONTS[face], [sfx]: FONTS[sfx] };
  if (['ja', 'zh'].includes(lang)) { // CJK: only the files that hold these characters
    const effects = [...text.matchAll(SFX)].map((m) => m[1]).join('');
    await loadCjkFonts({ [face]: FONTS[face] }, text.replace(SFX, ''), { vertical: true });
    await loadCjkFonts({ [sfx]: FONTS[sfx] }, effects, { vertical: true });
  }
  if (lang === 'ar') await loadArabicFonts(faces, text);
  await loadComicFonts(faces, text); // the bold and italic the faces do not ship
}
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region editions: the original on the right-hand page, this edition's lettering facing it
const FACING = LANG === 'ja' ? 'en' : LANG; // Japanese readers see the English edition
const TEXT = { ja: original, [FACING]: LANG === 'ja' ? english : markdown };
await loadFonts(FONTS, Object.values(TEXT).join('\n'));
const resources = await panels();
const build = async (lang) => { // the same pictures and page; this language's lettering
  await loadEdition(lang);
  return withLoadedFonts(() => buildDocument({ markdown: TEXT[lang], resources,
    continuation: { pageIndexOffset: lang === 'ja' ? 1 : 2 } }, edition(lang)),
    { ...kitFonts(FONTS), text: TEXT[lang] });
};
const docs = [await build('ja'), await build(FACING)];
// #endregion
const TITLE = t({
  en: 'Two yonkoma strips on a page', es: 'Dos tiras yonkoma en una página',
  ca: 'Dues tires yonkoma en una pàgina', zh: '一页并排两篇四格漫画', ar: 'شريطا يونكوما في صفحة واحدة',
  ja: '1ページに四コマを2本並べる', pt: 'Duas tiras yonkoma numa página' });
showBook(docs, { title: TITLE });
offerPdf(() => renderToPdf(docs, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
