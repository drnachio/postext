// ═══ Postext Cookbook · Nº 150 · An action page with slanted gutters ═════════════════
// https://postext.dev/en/cookbook/manga-action-slants
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Zen Antique, Comic Neue and six more (SIL OFL 1.1) · Needs postext ≥ 1.20.1
// The last page of a kendo final: slanted panels, a borderless strike, ドン kept in every edition.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: this edition's language; the Japanese original faces it
const RECIPE = 'manga-action-slants';

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

// #region answer: the slant is in the split; the impact is in the panel and the effect
// The page is split in content.<lang>.md: `* [40~55 | *]` runs the gutter of the third
// tier from 40 % at the top to 55 % at the bottom, so both panels lean into the strike,
// and `24 [58~64 | *]` tilts the last tier the other way. The panel that lands the blow
// is drawn with `border=none`: no frame, so its speed lines run straight to the gutter.
// ドン keeps its Japanese face in every edition (`font=` on the line);
// the translations add a small subtitle under it, the way licensed manga gloss a drawn
// sound effect instead of redrawing it.
const comics = (lang) => ({
  artDirection: 'rtl', // drawn for right-to-left reading: slants and order mirror with it
  mirrorArt: false,
  gutter: { horizontal: mm(4), vertical: mm(2.5) }, // a slanted gutter keeps its width
  panel: { borderWidth: pt(1.1), borderColor: col('ink'), background: col('paper') },
  lettering: {
    fontFamily: EDITIONS[lang].faces[0], color: col('ink'),
    fontSize: pt(['ja', 'zh'].includes(lang) ? 8.5 : 7.5),
    writingMode: lang === 'zh' ? 'vertical' : 'auto',
  },
  balloonStyles: balloons(),
});
// #endregion

// #region balloons: oval speech, a spiky shout, a grey box for the inner voice
const balloons = () => [
  { id: 'speech', fill: col('paper'), stroke: col('ink'), strokeWidth: pt(0.6), roundness: 2 },
  { id: 'shout', fill: col('paper'), stroke: col('ink'), burstPoints: 18, burstDepth: 0.3 },
  { id: 'thought', fill: col('paper'), stroke: col('ink') },
  { id: 'inner', fill: col('tone'), stroke: col('tone'), strokeWidth: pt(0), italic: false },
  { id: 'caption', fill: col('paper'), stroke: col('ink'), strokeWidth: pt(0.5) },
  // white-edged on the art
  { id: 'sfx', color: col('ink'), haloColor: col('paper'), halo: pt(2.2) },
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
// Another edition changes the language and the faces; the page and its slants stay.
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

// #region art: six panels drawn for the recipe, with each speaker's mouth, head and face marked
const ART = { // fractions of the picture: the same in every language
  final: {
    alt: t({ en: 'The kendo final in a packed gym: two fighters cross swords among three referees.',
      es: 'La final en un pabellón lleno: dos rivales cruzan las espadas entre tres árbitros.',
      ca: 'La final en un pavelló ple: dos rivals creuen les espases entre tres àrbitres.',
      pt: 'A final num ginásio lotado: dois lutadores cruzam as espadas entre três árbitros.',
      zh: '座无虚席的体育馆里的决赛：两名选手在三名裁判之间交剑。',
      ar: 'النهائي في صالة ممتلئة: متباريان يتقاطع سيفاهما بين ثلاثة حكّام.',
      ja: '満員の体育館での決勝。3人の審判の間で2人が剣先を交える。' }),
  safeArea: { x: 0.22, y: 0.44, width: 0.56, height: 0.46 },
  anchors: [{ id: 'hana', x: 0.31, y: 0.51, head: { x: 0.31, y: 0.49 },
    face: { x: 0.28, y: 0.45, width: 0.07, height: 0.1 } },
  { id: 'rival', x: 0.68, y: 0.51, head: { x: 0.68, y: 0.49 },
    face: { x: 0.65, y: 0.46, width: 0.06, height: 0.09 } },
  { id: 'shinpan', x: 0.575, y: 0.585, head: { x: 0.575, y: 0.56 },
    face: { x: 0.56, y: 0.54, width: 0.03, height: 0.06 } }] },
  eyes: {
    alt: t({ en: "Hana's eyes through the bars of her helmet grille.",
      es: 'Los ojos de Hana tras las barras de la rejilla del casco.',
      ca: 'Els ulls de la Hana darrere les barres de la reixa del casc.',
      pt: 'Os olhos de Hana atrás das barras da grade do capacete.',
      zh: '面罩铁栏后花的眼睛。',
      ar: 'عينا هانا خلف قضبان شبكة الخوذة.',
      ja: '面金の向こうの花の目。' }),
  safeArea: { x: 0.22, y: 0.26, width: 0.57, height: 0.38 },
  anchors: [{ id: 'hana', x: 0.5, y: 0.62, head: { x: 0.5, y: 0.4 },
    face: { x: 0.2, y: 0.3, width: 0.6, height: 0.3 } }] },
  lunge: {
    alt: t({ en: 'The opponent lunges at the viewer, speed lines all round.',
      es: 'El rival se lanza hacia el lector entre líneas cinéticas.',
      ca: 'El rival es llança cap al lector entre línies cinètiques.',
      pt: 'O adversário avança contra o leitor entre linhas de velocidade.',
      zh: '对手在速度线中朝读者猛刺过来。',
      ar: 'الخصم يندفع نحو القارئ وسط خطوط السرعة.',
      ja: '集中線の中、こちらへ突いてくる相手。' }),
  safeArea: { x: 0.03, y: 0.01, width: 0.8, height: 0.61 },
  avoid: [{ x: 0.02, y: 0.42, width: 0.23, height: 0.18 }],
  anchors: [{ id: 'rival', x: 0.7, y: 0.2, head: { x: 0.7, y: 0.14 },
    face: { x: 0.63, y: 0.02, width: 0.15, height: 0.24 } }] },
  strike: {
    alt: t({ en: "Hana leaps and strikes the top of the opponent's helmet; the sword bends.",
      es: 'Hana salta y golpea la parte alta del casco del rival; la espada se dobla.',
      ca: 'La Hana salta i colpeja la part alta del casc del rival; l’espasa es doblega.',
      pt: 'Hana salta e acerta o alto do capacete do adversário; a espada se curva.',
      zh: '花跃起击中对手面罩顶部，竹剑弯了起来。',
      ar: 'هانا تقفز وتضرب أعلى خوذة الخصم؛ ينثني السيف.',
      ja: '跳び込んで相手の面を打つ花。竹刀がしなる。' }),
  safeArea: { x: 0.36, y: 0.06, width: 0.42, height: 0.77 },
  avoid: [{ x: 0.52, y: 0.48, width: 0.13, height: 0.16 }],
  anchors: [{ id: 'hana', x: 0.43, y: 0.25, head: { x: 0.43, y: 0.18 },
    face: { x: 0.38, y: 0.07, width: 0.1, height: 0.25 } }, { id: 'sfx', x: 0.75, y: 0.25 }] },
  stands: {
    alt: t({ en: 'Sora jumps up in the stands, fists raised, shouting.',
      es: 'Sora salta en la grada con los puños en alto, gritando.',
      ca: 'En Sora salta a la graderia amb els punys enlaire, cridant.',
      pt: 'Sora pula na arquibancada de punhos erguidos, gritando.',
      zh: '空在看台上跳起来，举着拳头大喊。',
      ar: 'سورا يقفز في المدرّجات رافعًا قبضتيه وهو يصيح.',
      ja: '観客席で拳を突き上げて叫ぶ空。' }),
  safeArea: { x: 0.08, y: 0.07, width: 0.69, height: 0.44 },
  avoid: [{ x: 0.08, y: 0.06, width: 0.12, height: 0.1 },
    { x: 0.64, y: 0.35, width: 0.1, height: 0.12 }],
  anchors: [{ id: 'sora', x: 0.51, y: 0.44, head: { x: 0.5, y: 0.37 },
    face: { x: 0.4, y: 0.3, width: 0.22, height: 0.2 } }] },
  coach: {
    alt: t({ en: 'Mori, arms crossed and eyes closed; behind him the referees raise their flags.',
      es: 'Mori, de brazos cruzados y ojos cerrados; detrás, los árbitros alzan las banderas.',
      ca: 'En Mori, de braços plegats i ulls tancats; darrere, els àrbitres alcen les banderes.',
      pt: 'Mori, de braços cruzados e olhos fechados; atrás, os árbitros erguem as bandeiras.',
      zh: '森老师抱着双臂、闭着眼；身后的裁判举起了旗子。',
      ar: 'موري عاقد الذراعين مغمض العينين، وخلفه يرفع الحكّام راياتهم.',
      ja: '腕を組み目を閉じる森先生。後ろで審判が旗を上げる。' }),
  safeArea: { x: 0.16, y: 0.1, width: 0.76, height: 0.53 },
  avoid: [{ x: 0.55, y: 0.18, width: 0.4, height: 0.17 }],
  anchors: [{ id: 'mori', x: 0.29, y: 0.31, head: { x: 0.29, y: 0.2 },
    face: { x: 0.22, y: 0.1, width: 0.14, height: 0.24 } }] },
};
const panels = () => Promise.all([
  comicPanel('final', asset('match-final.jpg'), ART.final),
  comicPanel('eyes', asset('match-eyes.jpg'), ART.eyes),
  comicPanel('lunge', asset('match-lunge.jpg'), ART.lunge),
  comicPanel('strike', asset('match-strike.jpg'), ART.strike),
  comicPanel('coach', asset('match-coach.jpg'), ART.coach),
  comicPanel('stands', asset('match-stands.jpg'), ART.stands),
]);
// #endregion

// #region fonts: each edition loads its faces with the words they set
const SFX = /^sfx(\{[^}\n]*\})?[ \t]*[:：](.*)$/gm; // sound effects: the second face sets them
async function loadEdition(lang) {
  const text = TEXT[lang];
  const [face, sfx] = EDITIONS[lang].faces;
  const faces = { [face]: FONTS[face], [sfx]: FONTS[sfx] };
  const effects = [...text.matchAll(SFX)];
  for (const [, attrs = '', words] of effects) { // ドン keeps its face in every language
    const family = /font="([^"]+)"/.exec(attrs)?.[1];
    if (!family) continue;
    faces[family] = FONTS[family];
    await loadCjkFonts({ [family]: FONTS[family] }, words, { vertical: true });
  }
  if (['ja', 'zh'].includes(lang)) { // CJK: only the files that hold these characters
    const own = effects.filter(([, attrs = '']) => !attrs.includes('font=')).map((m) => m[2]);
    await loadCjkFonts({ [face]: FONTS[face] }, text.replace(SFX, ''), { vertical: true });
    await loadCjkFonts({ [sfx]: FONTS[sfx] }, own.join(''), { vertical: true });
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
    continuation: { pageIndexOffset: lang === 'ja' ? 1 : 2 } }, edition(lang)), TEXT[lang]);
};
const docs = [await build('ja'), await build(FACING)];
// #endregion
const TITLE = t({
  en: 'An action page with slanted gutters', es: 'Una página de acción con calles inclinadas',
  ca: 'Una pàgina d’acció amb carrers inclinats', zh: '斜向格间的动作页', ar: 'صفحة حركة بفواصل مائلة',
  pt: 'Uma página de ação com sarjetas inclinadas',
  ja: '斜めのコマ割りで組むアクションのページ' });
showBook(docs, { title: TITLE });
offerPdf(() => renderToPdf(docs, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
