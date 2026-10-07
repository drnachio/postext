// ═══ Postext Cookbook · Nº 154 · One comic page across a double spread ═══════════════
// https://postext.dev/en/cookbook/comic-double-spread
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Patrick Hand, Bangers, the comic faces of each script (OFL) · Needs postext ≥ 1.20.0
// One split tree laid across two facing pages: a panorama runs over the spine, and the
// tier under it splits at the spine's gutter. Same album, same lettering as Nº 152.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultComicFont, defaultComicSfxFont,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the album: 'es' | 'en' | 'ca' | 'zh' | 'ar' | 'ja'
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

const LOCALE = t({ es: 'es', en: 'en-gb', ca: 'ca', zh: 'zh-Hans', ar: 'ar', ja: 'ja' });
const LATIN = ['es', 'en', 'ca'].includes(LANG);
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
    zh: '帕科爷爷', ar: 'الجد باكو', ja: 'パコおじいちゃん' }) },
];
// #endregion

const COLOPHON = t({
  es: 'Rotulado en Patrick Hand y Bangers (SIL OFL) · Dibujo: generado con modelos de difusión',
  en: 'Lettered in Patrick Hand and Bangers (SIL OFL) · Art: generated with diffusion models',
  ca: 'Retolat en Patrick Hand i Bangers (SIL OFL) · Dibuix: generat amb models de difusió',
  zh: '嵌字：Noto Sans SC、ZCOOL KuaiLe（SIL OFL）· 画面：由扩散模型生成',
  ar: 'الخطوط: Playpen Sans Arabic وLalezar (SIL OFL) · الرسوم: مولّدة بنماذج الانتشار',
  ja: '写植：Zen Antique、Dela Gothic One（SIL OFL）・ 作画：拡散モデルで生成',
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
    alt: 'Panorama of the crowded market hall: tiny Lola stands lost on the far left; far '
      + 'right, her grandfather searches the crowd.',
    anchors: [
      who('lola', .065, .58, [.063, .55], [.045, .51, .04, .11]),
      who('paco', .925, .38, [.925, .34], [.9, .3, .05, .12]),
    ],
  },
  ds2: { width: 1152, height: 1152, safeArea: box([.25, .05, .5, .92]),
    alt: 'Lola, tearful, stands among grown-ups\' legs and shopping bags.',
    anchors: [
      who('lola', .505, .24, [.48, .17], [.4, .1, .18, .19]),
    ],
  },
  ds3: { width: 1000, height: 1000, safeArea: box([.15, .05, .7, .92]),
    alt: 'Paco stands on a fruit crate and whistles through his fingers; shoppers turn to '
      + 'look.',
    anchors: [
      who('paco', .5, .2, [.47, .14], [.38, .08, .17, .16]),
      who('sfx', .62, .17),
    ],
  },
  ds4: { width: 1200, height: 800, safeArea: box([.2, .05, .62, .75]),
    alt: 'Lola leaps into her grandfather\'s arms; his beret flies off and the '
      + 'stallholders smile.',
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
  zh: '横跨两页的漫画', ar: 'صفحة قصص مصوّرة على صفحتين متقابلتين', ja: '見開きの漫画' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
