// ═══ Postext Cookbook · Nº 145 · Every kind of balloon on a lighthouse page ═════════
// https://postext.dev/en/cookbook/balloon-kinds
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Comic Neue, Bangers and the faces of five editions (OFL) · Needs postext ≥ 1.21.0
//
// One comic page that uses every kind of balloon the engine draws, with a letterer's style
// sheet in front of it. Each line of the script names its speaker and, when it is not plain
// speech, its kind; the shape, the tail and the type follow from the balloon style.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the sample's language: 'en' | 'es' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt'
const RECIPE = 'balloon-kinds';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a storm at night, and the yellow of the captions
const palette = {
  ink: '#18202b', // panel borders, lettering and text: a blue-black
  accent: '#c2412d', // sound effects and the style sheet's labels
  caption: '#f3e3a8', // narration boxes
  inner: '#e4e8ee', // the inner voice: a cold grey-blue
  muted: '#5c6672', // folios and the imprint
  paper: '#fdfbf6',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion

// #region editions: six editions, each lettered in faces for its script
// The engine's default lettering and sound-effect faces, but for Chinese two ZCOOL faces drawn
// for cartoons. content.<lang>.md holds the words under the same speaker ids.
const [LETTERING, SFX] = t({
  en: ['Comic Neue', 'Bangers'], es: ['Comic Neue', 'Bangers'], ca: ['Comic Neue', 'Bangers'],
  ja: ['Zen Antique', 'Dela Gothic One'], zh: ['ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou'],
  ar: ['Playpen Sans Arabic', 'Lalezar'], pt: ['Comic Neue', 'Bangers'],
});
// #endregion

// #region answer: one balloon style per kind, and a cast that gives the skipper his radio
// A script line is `speaker{kind}: text`. The kinds are balloon styles: the engine ships
// speech, thought, whisper, shout, radio, caption, inner, note and sfx, and a style of the
// same id here changes only what it names. `caption`, `note` and `sfx` are reserved speakers.
const balloonStyles = [
  { id: 'speech', stroke: col('ink') }, // an oval, a curved tail to the mouth
  { id: 'thought', stroke: col('ink') }, // a cloud, bubbles to the head
  { id: 'whisper', stroke: col('ink') }, // a dashed outline, 0.9 × the type
  { id: 'shout', stroke: col('ink'), burstPoints: 16 }, // a burst, bold, 1.15 × the type
  { id: 'radio', stroke: col('ink') }, // a zig-zag outline and tail: a voice through a set
  { id: 'caption', fill: col('caption'), stroke: col('ink') }, // narration, butted to a corner
  { id: 'inner', fill: col('inner'), stroke: col('ink') }, // no tail, italic where it can be
  { id: 'note', fill: col('paper'), stroke: col('ink') }, // the editor's note, 0.8 × the type
  { id: 'sfx', fontFamily: SFX, color: col('accent'), haloColor: col('paper') }, // no balloon
];
const comics = {
  gutter: { horizontal: mm(4), vertical: mm(3) },
  panel: { borderWidth: pt(1), borderColor: col('ink'), background: col('paper') },
  lettering: { fontFamily: LETTERING, fontSize: pt(7.5), color: col('ink'), inset: mm(1) },
  balloonStyles,
  // A speaker's own style: every `skipper:` line comes through the radio unless it says not.
  cast: [{ id: 'skipper', balloonStyle: 'radio', name: t({ en: 'The skipper', es: 'El patrón',
    ca: 'El patró', zh: '船长', ar: 'الربّان', ja: '船長', pt: 'O capitão' }) }],
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
  // The style sheet is set in the lettering face of the edition.
  bodyText: { fontFamily: LETTERING, fontSize: pt(9.5), lineHeight: pt(13.5), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true,
    hyphenation: { enabled: false } },
  headings: { fontFamily: SFX, color: col('accent'), fontWeight: 400,
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, fontSize: pt(34), lineHeight: pt(38), breakBefore: { enabled: true,
        parity: 'any' }, marginTop: mm(18), marginBottom: pt(13.5) },
      { level: 2, fontFamily: LETTERING, fontSize: pt(9.5), fontWeight: 700,
        color: col('accent'), marginTop: pt(13.5), marginBottom: pt(0) },
    ] },
  unorderedLists: { bulletChar: '–', color: col('accent'), fontWeight: 400,
    marginTop: pt(0), marginBottom: pt(0) },
  // The script's markup on the style sheet: a chip in the caption yellow.
  chipStyles: [{ id: 'code', background: col('caption'), color: col('ink'), borderWidth: pt(0),
    borderRadius: pt(1.5), fontFamily: LETTERING, fontSize: em(0.9), paddingX: em(0.3),
    paddingY: em(0.1) }],
  paragraphStyles: [{ id: 'imprint', fontSize: pt(7.5), lineHeight: pt(10), color: col('muted'),
    marginTop: pt(27) }],
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the six pictures: safe area, speakers' anchors and avoid zones
// From the art manifest; fractions of each picture, the same in every language. `skipper` in
// the storm picture is the radio set, the voice's source; in the sea picture, his boat.
const ART = {
  'bk-storm': { width: 1100, height: 733, safeArea: { x: 0.05, y: 0.26, width: 0.52, height: 0.36 },
    anchors: [{ id: 'tomas', x: 0.3, y: 0.44, head: { x: 0.32, y: 0.33 },
      face: { x: 0.26, y: 0.29, width: 0.13, height: 0.21 } },
    { id: 'maya', x: 0.475, y: 0.47, head: { x: 0.48, y: 0.38 },
      face: { x: 0.43, y: 0.35, width: 0.09, height: 0.16 } },
    { id: 'skipper', x: 0.08, y: 0.52 }],
    avoid: [{ x: 0, y: 0.38, width: 0.18, height: 0.28 }],
    alt: t({ en: 'Storm at night in the lamp room: the keeper speaks into the radio microphone '
      + 'while Maya, wrapped in a blanket, listens.',
      es: 'Noche de tormenta en la sala de la linterna: el farero habla por el micrófono de la '
        + 'radio y Maya, envuelta en una manta, escucha.',
      ca: 'Nit de tempesta a la sala de la llanterna: el faroner parla pel micròfon de la ràdio i '
        + 'la Maya, embolicada amb una manta, escolta.',
      zh: '暴风雨之夜的灯室里，守塔人对着收音机的话筒说话，裹着毯子的玛雅在一旁听着。',
      ar: 'ليلة عاصفة في غرفة الفانوس: الحارس يتكلم في ميكروفون المذياع، ومايا الملتفّة ببطانية '
        + 'تصغي.',
      ja: '嵐の夜の灯室。灯台守が無線のマイクに話しかけ、毛布にくるまったマヤが耳をすます。',
      pt: 'Noite de tempestade na sala da lanterna: o faroleiro fala ao microfone do rádio e '
        + 'Maya, enrolada num cobertor, escuta.' }) },
  'bk-whisper': { width: 1152, height: 1152,
    safeArea: { x: 0.36, y: 0.26, width: 0.44, height: 0.48 },
    anchors: [{ id: 'maya', x: 0.53, y: 0.47, head: { x: 0.52, y: 0.33 },
      face: { x: 0.41, y: 0.3, width: 0.19, height: 0.22 } },
    { id: 'biscuit', x: 0.625, y: 0.635, head: { x: 0.66, y: 0.57 },
      face: { x: 0.55, y: 0.5, width: 0.25, height: 0.22 } }],
    avoid: [],
    alt: t({ en: 'Under the desk, Maya whispers behind her hand to the frightened orange cat.',
      es: 'Bajo la mesa, Maya le susurra tapándose la boca al gato naranja asustado.',
      ca: 'Sota la taula, la Maya xiuxiueja tapant-se la boca al gat taronja espantat.',
      zh: '桌子底下，玛雅用手挡着嘴，对受惊的橘猫说悄悄话。',
      ar: 'تحت المكتب تهمس مايا من وراء يدها للقط البرتقالي الخائف.',
      ja: '机の下で、マヤが手で口をかくして、おびえたオレンジ色の猫にささやく。',
      pt: 'Debaixo da mesa, Maya cobre a boca com a mão e sussurra para o gato laranja '
        + 'assustado.' }) },
  'bk-shout': { width: 880, height: 1100, safeArea: { x: 0.22, y: 0.26, width: 0.46, height: 0.42 },
    anchors: [{ id: 'tomas', x: 0.48, y: 0.47, head: { x: 0.42, y: 0.33 },
      face: { x: 0.25, y: 0.28, width: 0.37, height: 0.32 } }],
    avoid: [{ x: 0.53, y: 0.43, width: 0.17, height: 0.27 }],
    alt: t({ en: 'Close-up of the keeper shouting into the microphone, lit from below by the '
      + 'radio dials.',
      es: 'Primer plano del farero gritando al micrófono, iluminado desde abajo por los diales de '
        + 'la radio.',
      ca: 'Primer pla del faroner cridant al micròfon, il·luminat des de baix pels dials de la '
        + 'ràdio.',
      zh: '守塔人对着话筒大喊的特写，收音机的刻度盘从下方照亮他的脸。',
      ar: 'لقطة قريبة للحارس يصرخ في الميكروفون، وأضواء لوحة المذياع تنيره من أسفل.',
      ja: 'マイクに向かって叫ぶ灯台守のアップ。無線機の目盛りの光が下から顔を照らす。',
      pt: 'Close do faroleiro gritando ao microfone, iluminado de baixo pelos mostradores do '
        + 'rádio.' }) },
  'bk-sea': { width: 1200, height: 800, safeArea: { x: 0.1, y: 0.19, width: 0.37, height: 0.57 },
    anchors: [{ id: 'skipper', x: 0.28, y: 0.63 }, { id: 'sfx', x: 0.16, y: 0.36 }],
    avoid: [{ x: 0.13, y: 0.52, width: 0.24, height: 0.23 },
      { x: 0.85, y: 0.19, width: 0.08, height: 0.26 }],
    alt: t({ en: 'A small blue trawler heaves on storm waves at night; lightning on the left, the '
      + 'lighthouse beam on the right.',
      es: 'Un pesquero azul cabecea entre las olas de la tormenta; un rayo a la izquierda, el haz '
        + 'del faro a la derecha.',
      ca: 'Un pesquer blau capcineja entre les onades de la tempesta; un llamp a l’esquerra, el '
        + 'feix del far a la dreta.',
      zh: '夜里，一艘蓝色小渔船在暴风雨的浪头上颠簸；左边是闪电，右边是灯塔的光束。',
      ar: 'قارب صيد أزرق صغير يتقاذفه موج العاصفة ليلًا؛ برق على اليسار وشعاع المنارة على اليمين.',
      ja: '夜の嵐の波にもまれる青い小さな漁船。左に稲妻、右に灯台の光。',
      pt: 'Um pequeno barco pesqueiro azul jogado pelas ondas da tempestade à noite; um raio à '
        + 'esquerda, o facho do farol à direita.' }) },
  'bk-window': { width: 1000, height: 1000,
    safeArea: { x: 0.36, y: 0.27, width: 0.28, height: 0.33 },
    anchors: [{ id: 'maya', x: 0.49, y: 0.41, head: { x: 0.42, y: 0.3 },
      face: { x: 0.41, y: 0.33, width: 0.1, height: 0.13 } }],
    avoid: [{ x: 0.5, y: 0.33, width: 0.1, height: 0.17 },
      { x: 0.83, y: 0.45, width: 0.06, height: 0.08 }],
    alt: t({ en: 'Maya presses her hands and nose to the rainy window, staring out at the storm.',
      es: 'Maya pega las manos y la nariz al cristal mojado y mira la tormenta.',
      ca: 'La Maya enganxa les mans i el nas al vidre mullat i mira la tempesta.',
      zh: '玛雅把双手和鼻子贴在满是雨水的窗户上，望着外面的暴风雨。',
      ar: 'تلصق مايا يديها وأنفها بالزجاج المبلل وتحدّق في العاصفة.',
      ja: 'マヤが雨の窓に両手と鼻を押しつけ、嵐を見つめる。',
      pt: 'Maya cola as mãos e o nariz no vidro molhado e olha a tempestade.' }) },
  'bk-morning': { width: 1000, height: 667,
    safeArea: { x: 0.33, y: 0.06, width: 0.42, height: 0.59 },
    anchors: [{ id: 'tomas', x: 0.565, y: 0.25, head: { x: 0.56, y: 0.15 },
      face: { x: 0.51, y: 0.13, width: 0.1, height: 0.17 } },
    { id: 'maya', x: 0.465, y: 0.29, head: { x: 0.45, y: 0.24 },
      face: { x: 0.41, y: 0.19, width: 0.09, height: 0.14 } },
    { id: 'biscuit', x: 0.685, y: 0.58, head: { x: 0.69, y: 0.55 },
      face: { x: 0.64, y: 0.51, width: 0.09, height: 0.11 } }],
    avoid: [{ x: 0.66, y: 0.08, width: 0.08, height: 0.12 },
      { x: 0.34, y: 0.14, width: 0.06, height: 0.08 }],
    alt: t({ en: 'Next morning on the sunny rocks, Maya, the keeper and the cat wave; the '
      + 'lighthouse stands behind them.',
      es: 'A la mañana siguiente, en las rocas al sol, Maya, el farero y el gato saludan; detrás '
        + 'está el faro.',
      ca: 'L’endemà al matí, a les roques al sol, la Maya, el faroner i el gat saluden; darrere '
        + 'hi ha el far.',
      zh: '第二天早上，阳光照着礁石，玛雅、守塔人和猫在挥手；灯塔立在他们身后。',
      ar: 'في الصباح التالي على الصخور المشمسة يلوّح مايا والحارس والقط، والمنارة خلفهم.',
      ja: '翌朝、日の当たる岩の上でマヤと灯台守と猫が手を振る。後ろに灯台が立つ。',
      pt: 'Na manhã seguinte, nas pedras ao sol, Maya, o faroleiro e o gato acenam; atrás deles '
        + 'está o farol.' }) },
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
  comicPanel('bk-storm', asset('bk-storm.jpg'), ART['bk-storm']),
  comicPanel('bk-whisper', asset('bk-whisper.jpg'), ART['bk-whisper']),
  comicPanel('bk-shout', asset('bk-shout.jpg'), ART['bk-shout']),
  comicPanel('bk-sea', asset('bk-sea.jpg'), ART['bk-sea']),
  comicPanel('bk-window', asset('bk-window.jpg'), ART['bk-window']),
  comicPanel('bk-morning', asset('bk-morning.jpg'), ART['bk-morning']),
]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'Every kind of balloon on a lighthouse page',
  es: 'Todos los bocadillos en una página del faro',
  pt: 'Todos os tipos de balão numa página do farol' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
