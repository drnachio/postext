// ═══ Postext Cookbook · Nº 149 · Manga read right to left, lettered vertically ══════
// https://postext.dev/en/cookbook/manga-right-to-left
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Zen Antique, Comic Neue and six more (SIL OFL 1.1) · Needs postext ≥ 1.20.1
// Two pages of a kendo manga: the Japanese original, then the same pages lettered again.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: this edition's language; the Japanese original faces it
const RECIPE = 'manga-right-to-left';

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
  pt: { locale: 'pt-BR', faces: ['Comic Neue', 'Bangers'] },
  zh: { locale: 'zh-Hans', faces: ['Noto Sans SC', 'ZCOOL KuaiLe'] },
  ar: { locale: 'ar', faces: ['Playpen Sans Arabic', 'Lalezar'] },
};

// #region answer: the art reads right to left, so every edition does
const comics = (lang) => ({
  // The pages were drawn for right-to-left reading: panel 1 sits top right. The
  // reading direction stays 'auto', which follows the art in a left-to-right
  // language too: the English page keeps the Japanese panel order.
  artDirection: 'rtl',
  mirrorArt: false, // never flop the art: Hana's grip on the sword, the kimono's fold
  gutter: { horizontal: mm(4.5), vertical: mm(2) }, // a tier gap twice the panel gap
  panel: { borderWidth: pt(0.9), borderColor: col('ink'), background: col('paper') },
  lettering: {
    fontFamily: EDITIONS[lang].faces[0], color: col('ink'),
    fontSize: pt(['ja', 'zh'].includes(lang) ? 8.5 : 7.5), // one size per edition
    // 'auto' sets Japanese in columns of 8 characters at most and drops the final 。.
    // Chinese goes in columns too: a book bound on the right never mixes the two.
    writingMode: lang === 'zh' ? 'vertical' : 'auto',
  },
  balloonStyles: balloons(),
});
// #endregion

// #region balloons: oval speech, a dashed whisper, a grey box for the inner voice
const balloons = () => [
  { id: 'speech', fill: col('paper'), stroke: col('ink'), strokeWidth: pt(0.6), roundness: 2 },
  { id: 'whisper', fill: col('paper'), stroke: col('ink'), roundness: 2 },
  { id: 'thought', fill: col('paper'), stroke: col('ink') },
  { id: 'inner', fill: col('tone'), stroke: col('tone'), strokeWidth: pt(0), italic: false },
  { id: 'caption', fill: col('paper'), stroke: col('ink'), strokeWidth: pt(0.5) },
  { id: 'sfx', color: col('ink'), haloColor: col('paper') },
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  // Each edition's language, written out (gotcha: ja-locale-tag); the original is built
  // with 'ja' in every edition (edition('ja') below).
  locale: t({ ja: 'ja', en: 'en-us', es: 'es', ca: 'ca', zh: 'zh-Hans', ar: 'ar', pt: 'pt-BR' }),
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(128), height: mm(182), dpi: 150, // B6, a tankōbon
    binding: 'right', backgroundColor: col('paper'), // manga open from the right, in any language
    margins: { top: mm(13), bottom: mm(15), left: mm(11), right: mm(11), mirror: true },
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
// Another edition changes the language, and with it the faces, the writing mode and the
// house rules of the lettering. Nothing else: not the page, not the panels.
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

// #region art: nine panels, with each speaker's mouth, head and face marked once
const ART = { // fractions of the picture: the same in every language
  dojo: {
    alt: t({ en: 'The old wooden kendo dojo at dusk, its doors open and lit.',
      es: 'El viejo dojo de madera al anochecer, con las puertas abiertas e iluminadas.',
      ca: 'L’antic dojo de fusta al capvespre, amb les portes obertes i il·luminades.',
      pt: 'O velho dojô de madeira ao anoitecer, com as portas abertas e iluminadas.',
      zh: '黄昏时分的老木造剑道场，门敞开着，里面亮着灯。',
      ar: 'قاعة الكندو الخشبية القديمة عند الغسق، أبوابها مفتوحة ومضاءة.',
      ja: '夕暮れの古い木造の剣道場。戸が開いて、中に明かりがともっている。' }),
  safeArea: { x: 0.45, y: 0.32, width: 0.5, height: 0.51 },
  anchors: [{ id: 'dojo', x: 0.66, y: 0.63 }] },
  swing: {
    alt: t({ en: 'Hana, alone in the dojo, swings her bamboo sword overhead.',
      es: 'Hana, sola en el dojo, alza la espada de bambú sobre la cabeza.',
      ca: 'La Hana, sola al dojo, aixeca l’espasa de bambú per sobre del cap.',
      pt: 'Hana, sozinha no dojô, ergue a espada de bambu acima da cabeça.',
      zh: '花独自在道场里，把竹剑高举过头。',
      ar: 'هانا وحدها في القاعة ترفع سيف الخيزران فوق رأسها.',
      ja: 'ひとり道場で、竹刀を頭上に振りかぶる花。' }),
  safeArea: { x: 0.36, y: 0, width: 0.31, height: 0.5 },
  avoid: [{ x: 0.43, y: 0, width: 0.17, height: 0.12 }],
  anchors: [{ id: 'hana', x: 0.535, y: 0.28, head: { x: 0.53, y: 0.22 },
    face: { x: 0.49, y: 0.14, width: 0.11, height: 0.17 } }] },
  doorway: {
    alt: t({ en: 'Sora peeks round the sliding door, holding a shrine charm.',
      es: 'Sora se asoma por la puerta corredera con un amuleto en la mano.',
      ca: 'En Sora treu el cap per la porta corredissa amb un amulet a la mà.',
      pt: 'Sora espia pela porta de correr com um amuleto na mão.',
      zh: '空从拉门后探出头，手里攥着护身符。',
      ar: 'سورا يطلّ من وراء الباب المنزلق وفي يده تميمة.',
      ja: 'お守りを手に、引き戸の陰からのぞく空。' }),
  safeArea: { x: 0.37, y: 0.09, width: 0.34, height: 0.5 },
  avoid: [{ x: 0.49, y: 0.41, width: 0.08, height: 0.1 }],
  anchors: [{ id: 'sora', x: 0.545, y: 0.31, head: { x: 0.55, y: 0.22 },
    face: { x: 0.47, y: 0.16, width: 0.2, height: 0.18 } }] },
  closeup: {
    alt: t({ en: "Close-up of Hana's sweating, startled face.",
      es: 'Primer plano del rostro sudoroso y sobresaltado de Hana.',
      ca: 'Primer pla de la cara suada i sobresaltada de la Hana.',
      pt: 'Primeiro plano do rosto suado e assustado de Hana.',
      zh: '花满脸是汗、吃了一惊的特写。',
      ar: 'لقطة قريبة لوجه هانا المتعرّق المذعور.',
      ja: '汗をかき、はっとした花の顔のアップ。' }),
  safeArea: { x: 0.27, y: 0.28, width: 0.43, height: 0.51 },
  anchors: [{ id: 'hana', x: 0.475, y: 0.665, head: { x: 0.45, y: 0.35 },
    face: { x: 0.3, y: 0.3, width: 0.4, height: 0.45 } }] },
  charm: {
    alt: t({ en: 'Sora holds out the charm; Hana looks at it, sword on her shoulder.',
      es: 'Sora le tiende el amuleto; Hana lo mira con la espada al hombro.',
      ca: 'En Sora li allarga l’amulet; la Hana el mira amb l’espasa a l’espatlla.',
      pt: 'Sora estende o amuleto; Hana olha para ele com a espada no ombro.',
      zh: '空递出护身符，花扛着竹剑看着它。',
      ar: 'سورا يمدّ التميمة، وهانا تنظر إليها والسيف على كتفها.',
      ja: '空がお守りを差し出し、竹刀を肩にかついだ花がそれを見る。' }),
  safeArea: { x: 0.21, y: 0.09, width: 0.56, height: 0.53 },
  avoid: [{ x: 0.43, y: 0.47, width: 0.06, height: 0.09 }],
  anchors: [{ id: 'sora', x: 0.325, y: 0.335, head: { x: 0.29, y: 0.22 },
    face: { x: 0.26, y: 0.17, width: 0.11, height: 0.2 } },
  { id: 'hana', x: 0.675, y: 0.335, head: { x: 0.665, y: 0.22 },
    face: { x: 0.62, y: 0.17, width: 0.11, height: 0.2 } }] },
  coach: {
    alt: t({ en: 'Coach Mori in the doorway, backlit, arms crossed.',
      es: 'El entrenador Mori en la puerta, a contraluz, de brazos cruzados.',
      ca: 'L’entrenador Mori a la porta, a contrallum, de braços plegats.',
      pt: 'O treinador Mori na porta, contra a luz, de braços cruzados.',
      zh: '森老师站在门口，背着光，双臂抱在胸前。',
      ar: 'المدرّب موري عند الباب، والضوء خلفه، عاقدًا ذراعيه.',
      ja: '逆光の戸口で腕を組んで立つ森先生。' }),
  safeArea: { x: 0.33, y: 0.13, width: 0.3, height: 0.32 },
  anchors: [{ id: 'mori', x: 0.425, y: 0.215, head: { x: 0.42, y: 0.17 },
    face: { x: 0.37, y: 0.13, width: 0.1, height: 0.11 } }] },
  smile: {
    alt: t({ en: "Close-up of Mori's stern face breaking into a small smile.",
      es: 'Primer plano del rostro severo de Mori, que esboza una sonrisa.',
      ca: 'Primer pla de la cara severa d’en Mori, que esbossa un somriure.',
      pt: 'Primeiro plano do rosto severo de Mori, que esboça um sorriso.',
      zh: '森老师严肃的脸上露出一丝笑意的特写。',
      ar: 'لقطة قريبة لوجه موري الصارم وقد ارتسمت عليه ابتسامة.',
      ja: '厳しい顔がふっとゆるむ森先生のアップ。' }),
  safeArea: { x: 0.43, y: 0.21, width: 0.51, height: 0.53 },
  anchors: [{ id: 'mori', x: 0.69, y: 0.52, head: { x: 0.6, y: 0.25 },
    face: { x: 0.45, y: 0.28, width: 0.45, height: 0.32 } }] },
  kneel: {
    alt: t({ en: 'Kneeling, Hana ties the charm to her armour; Sora scratches his head.',
      es: 'De rodillas, Hana se ata el amuleto a la armadura; Sora se rasca la cabeza.',
      ca: 'De genolls, la Hana es lliga l’amulet a l’armadura; en Sora es grata el cap.',
      pt: 'De joelhos, Hana amarra o amuleto na armadura; Sora coça a cabeça.',
      zh: '花跪坐着把护身符系在护具上，空挠着头。',
      ar: 'هانا جاثية تربط التميمة بدرعها، وسورا يحكّ رأسه.',
      ja: '正座してお守りを防具に結ぶ花と、頭をかく空。' }),
  safeArea: { x: 0.21, y: 0.08, width: 0.61, height: 0.48 },
  avoid: [{ x: 0.27, y: 0.43, width: 0.06, height: 0.12 }],
  anchors: [{ id: 'hana', x: 0.305, y: 0.245, head: { x: 0.3, y: 0.17 },
    face: { x: 0.25, y: 0.1, width: 0.11, height: 0.17 } },
  { id: 'sora', x: 0.7, y: 0.25, head: { x: 0.71, y: 0.15 },
    face: { x: 0.64, y: 0.1, width: 0.13, height: 0.18 } }] },
  roof: {
    alt: t({ en: 'Seen from behind, Hana and Sora sit on the school roof at sunset.',
      es: 'De espaldas, Hana y Sora sentados en la azotea del instituto al atardecer.',
      ca: 'D’esquena, la Hana i en Sora asseguts al terrat de l’institut a la posta.',
      pt: 'De costas, Hana e Sora sentados no terraço da escola ao pôr do sol.',
      zh: '夕阳下，花和空坐在学校楼顶的背影。',
      ar: 'هانا وسورا جالسان على سطح المدرسة عند الغروب، من الخلف.',
      ja: '夕焼けの屋上に並んで座る花と空の後ろ姿。' }),
  safeArea: { x: 0.24, y: 0.41, width: 0.47, height: 0.31 },
  anchors: [{ id: 'hana', x: 0.36, y: 0.52, head: { x: 0.36, y: 0.48 },
    face: { x: 0.31, y: 0.43, width: 0.11, height: 0.14 } },
  { id: 'sora', x: 0.63, y: 0.52, head: { x: 0.625, y: 0.47 },
    face: { x: 0.58, y: 0.41, width: 0.1, height: 0.15 } }] },
};
const panels = () => Promise.all([
  comicPanel('dojo', asset('kendo-dojo.jpg'), ART.dojo),
  comicPanel('swing', asset('kendo-swing.jpg'), ART.swing),
  comicPanel('doorway', asset('kendo-doorway.jpg'), ART.doorway),
  comicPanel('closeup', asset('kendo-closeup.jpg'), ART.closeup),
  comicPanel('charm', asset('kendo-charm.jpg'), ART.charm),
  comicPanel('coach', asset('kendo-coach.jpg'), ART.coach),
  comicPanel('smile', asset('kendo-smile.jpg'), ART.smile),
  comicPanel('kneel', asset('kendo-kneel.jpg'), ART.kneel),
  comicPanel('roof', asset('kendo-roof.jpg'), ART.roof),
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
  return buildWithFonts(() => buildDocument({ markdown: TEXT[lang], resources,
    continuation: { pageIndexOffset: 1 } }, edition(lang)), TEXT[lang]);
};
const docs = [await build('ja'), await build(FACING)];
// #endregion
const TITLE = t({
  en: 'A manga read right to left', es: 'Un manga que se lee de derecha a izquierda',
  ca: 'Un manga que es llegeix de dreta a esquerra', zh: '从右往左读的漫画',
  pt: 'Um mangá lido da direita para a esquerda',
  ar: 'مانغا تُقرأ من اليمين إلى اليسار', ja: '右から左へ読む漫画' });
showBook(docs, { title: TITLE });
offerPdf(() => renderToPdf(docs, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
