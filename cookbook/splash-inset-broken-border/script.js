// ═══ Postext Cookbook · Nº 147 · A splash page, an inset and a broken border ═══════
// https://postext.dev/en/cookbook/splash-inset-broken-border
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Comic Neue, Bangers and the faces of five editions (OFL) · Needs postext ≥ 1.20.1
//
// Two pages of a storm: a splash page that bleeds off all four edges with a small inset panel
// laid over it, then a page whose top tier bleeds off three edges, whose second panel lets a
// gull fly out over its border, and whose last panel holds only captions on a night-blue ground.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the sample's language: 'en' | 'es' | 'ca' | 'zh' | 'ar' | 'ja' | 'pt'
const RECIPE = 'splash-inset-broken-border';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: storm blue, lamplight and the white of the surf
const palette = {
  ink: '#141b24', // panel borders and lettering
  night: '#1d2a3a', // the ground of the text-only panel
  lamp: '#f2c14e', // the captions: the colour of the lantern
  accent: '#e9f0f5', // sound effects: surf white, outlined in ink
  muted: '#5c6672', // folios
  paper: '#fbfaf7',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion

// #region editions: six editions, each lettered in faces for its script
const [LETTERING, SFX] = t({
  en: ['Comic Neue', 'Bangers'], es: ['Comic Neue', 'Bangers'], ca: ['Comic Neue', 'Bangers'],
  ja: ['Zen Antique', 'Dela Gothic One'], zh: ['ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou'],
  ar: ['Playpen Sans Arabic', 'Lalezar'], pt: ['Comic Neue', 'Bangers'],
});
// #endregion

// #region answer: a bleed, an inset and a pop-out, written on the panels themselves
// In the Markdown, the panel attributes do the work:
//   :::page{split="*" bleed}                 one panel, every edge bled off the page
//   ::panel{art=sp-maya-face inset="56 64 38 30"}   over the panel before it: x y w h in %
//   ::panel{art=sp-wave bleed="top start end"}      only the edges that touch the trim
//   ::panel{art=sp-tomas pop=sp-tomas-pop}   a transparent layer drawn over the border
//   ::panel{bg=night}                        no picture: captions on a palette colour
// A bleeding panel runs to the bleed box, 3 mm past the trim, and loses its border on those
// sides. The pop layer is cropped and placed exactly like the panel's picture, then drawn
// after the border without the panel's clip, so whatever it holds outside the cell shows.
const comics = {
  gutter: { horizontal: mm(4), vertical: mm(3) },
  panel: { borderWidth: pt(1.2), borderColor: col('ink'), background: col('paper') },
  lettering: { fontFamily: LETTERING, fontSize: pt(8.5), color: col('ink'), inset: mm(2) },
  balloonStyles: [
    { id: 'speech', stroke: col('ink') },
    { id: 'caption', fill: col('lamp'), stroke: col('ink') },
    { id: 'inner', fill: col('paper'), stroke: col('ink') },
    { id: 'sfx', fontFamily: SFX, color: col('accent'), haloColor: col('ink'), halo: pt(2) },
  ],
  runningHeads: true, // a comic page has no running head unless asked: here, its folio
};
// #endregion

const footer = { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}',
  fontFamily: LETTERING, fontSize: pt(7.5), color: col('muted'), align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: mm(0), y: mm(-7) } } }] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-gb', es: 'es', ca: 'ca', ja: 'ja', zh: 'zh-Hans', ar: 'ar',
    pt: 'pt-BR' }),
  colorPalette, comics,
  // The trim of an American comic book, 6⅝ × 10³⁄₁₆ in, with 3 mm of bleed.
  page: { sizePreset: 'custom', width: mm(168), height: mm(259), bleed: mm(3), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(14), bottom: mm(16), left: mm(13), right: mm(11), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: LETTERING, fontSize: pt(10), lineHeight: pt(14), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink') },
  headings: { fontFamily: SFX, color: col('ink'),
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    levels: [{ level: 1, fontSize: pt(30), breakBefore: { enabled: true, parity: 'any' } }] },
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the five pictures and the gull's layer
// From the art manifest; fractions of each picture, the same in every language. The gull's
// layer is a transparent PNG the size of the keeper's picture, so it shares its crop.
const face = (x, y, width, height) => ({ x, y, width, height });
const ART = {
  'sp-splash': { width: 708, height: 1000, safeArea: face(0.1, 0.12, 0.8, 0.63),
    anchors: [{ id: 'sfx', x: 0.82, y: 0.4 }], avoid: [face(0.28, 0.15, 0.17, 0.35)] },
  'sp-maya-face': { width: 1000, height: 1000, safeArea: face(0.25, 0.2, 0.5, 0.45),
    anchors: [{ id: 'maya', x: 0.52, y: 0.48, face: face(0.37, 0.27, 0.29, 0.31) }] },
  'sp-wave': { width: 1400, height: 600, safeArea: face(0.35, 0, 0.6, 0.9),
    anchors: [{ id: 'sfx', x: 0.6, y: 0.35 }], avoid: [face(0.82, 0.02, 0.06, 0.3)] },
  'sp-tomas': { width: 1000, height: 1000, safeArea: face(0.3, 0.1, 0.5, 0.8),
    anchors: [{ id: 'tomas', x: 0.63, y: 0.345, head: { x: 0.67, y: 0.24 },
      face: face(0.56, 0.17, 0.24, 0.25) }], avoid: [face(0.32, 0.13, 0.15, 0.33)] },
  'sp-tomas-pop': { width: 1000, height: 1000 },
};
const ALT = {
  'sp-splash': t({ en: 'The red-and-white lighthouse in a night storm, waves exploding on the '
      + 'rocks, its beam cutting through the rain, lightning behind.',
    es: 'El faro rojo y blanco en una noche de tormenta: las olas revientan en las rocas, el haz '
      + 'corta la lluvia y detrás cae un rayo.',
    ca: 'El far vermell i blanc en una nit de tempesta: les onades esclaten a les roques, el feix '
      + 'talla la pluja i al darrere cau un llamp.',
    zh: '暴风雨之夜，红白相间的灯塔，浪头在礁石上炸开，光束穿过雨幕，后面是闪电。',
    ar: 'المنارة الحمراء والبيضاء في ليلة عاصفة، والموج يتفجّر على الصخور، وشعاعها يشقّ المطر، '
      + 'وخلفها برق.',
    ja: '嵐の夜の赤と白の灯台。岩に波が砕け、光の帯が雨を切り裂き、後ろで稲妻が光る。',
    pt: 'O farol vermelho e branco numa noite de tempestade: as ondas arrebentam nas pedras, o '
      + 'facho corta a chuva e, atrás, cai um raio.' }),
  'sp-maya-face': t({ en: 'Maya’s face behind a rain-streaked window, hood up, lit by the lamp.',
    es: 'La cara de Maya tras una ventana surcada de lluvia, con la capucha puesta y la luz de la '
      + 'lámpara.',
    ca: 'La cara de la Maya darrere una finestra plena de pluja, amb la caputxa posada i la llum '
      + 'del llum.',
    zh: '玛雅戴着兜帽，脸贴在满是雨痕的窗后，被灯光照亮。',
    ar: 'وجه مايا خلف نافذة يسيل عليها المطر، والقلنسوة على رأسها، ونور المصباح عليها.',
    ja: '雨の筋が流れる窓の向こうに、フードをかぶったマヤの顔。ランプの光に照らされている。',
    pt: 'O rosto de Maya atrás de uma janela riscada de chuva, de capuz, à luz da lamparina.' }),
  'sp-wave': t({ en: 'A huge wave bursts over black rocks below the lighthouse at night.',
    es: 'Una ola enorme revienta sobre las rocas negras al pie del faro, de noche.',
    ca: 'Una onada enorme esclata sobre les roques negres al peu del far, de nit.',
    zh: '夜里，一道巨浪在灯塔下的黑色礁石上炸开。',
    ar: 'موجة هائلة تتفجّر ليلًا فوق الصخور السوداء تحت المنارة.',
    ja: '夜、灯台の下の黒い岩に巨大な波が砕け散る。',
    pt: 'Uma onda enorme arrebenta nas pedras negras ao pé do farol, à noite.' }),
  'sp-tomas': t({ en: 'The keeper in an oilskin on the lantern gallery holds up a storm lantern, '
      + 'his beard whipping in the wind.',
    es: 'El farero, con impermeable de hule en la galería, levanta un farol; el viento le agita '
      + 'la barba.',
    ca: 'El faroner, amb impermeable d’hule a la galeria, aixeca un fanal; el vent li remena la '
      + 'barba.',
    zh: '守塔人穿着油布雨衣站在灯室回廊上，高举一盏防风灯，胡子被风吹得乱飞。',
    ar: 'الحارس بمعطفه المشمّع على شرفة الفانوس يرفع مصباح العاصفة، والريح تعبث بلحيته.',
    ja: '油合羽の灯台守が回廊でカンテラを掲げる。ひげが風にあおられている。',
    pt: 'O faroleiro, de capa impermeável na galeria, ergue um lampião; o vento agita a barba '
      + 'dele.' }),
  'sp-tomas-pop': t({ en: 'A herring gull flies out across the panel’s left border.',
    es: 'Una gaviota sale volando por el borde izquierdo de la viñeta.',
    ca: 'Una gavina surt volant per la vora esquerra de la vinyeta.',
    zh: '一只银鸥飞出格子的左边框。',
    ar: 'نورس فضي يطير خارجًا عبر الحافة اليسرى للإطار.',
    ja: 'セグロカモメがコマの左の枠を越えて飛んでいく。',
    pt: 'Uma gaivota sai voando pela borda esquerda do quadro.' }),
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
const panel = (id, url) => comicPanel(id, url, { ...ART[id], alt: ALT[id] });
const resources = await Promise.all([
  panel('sp-splash', asset('sp-splash.jpg')), panel('sp-maya-face', asset('sp-maya-face.jpg')),
  panel('sp-wave', asset('sp-wave.jpg')), panel('sp-tomas', asset('sp-tomas.jpg')),
  panel('sp-tomas-pop', asset('sp-tomas-pop.png')),
]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'A splash page, an inset and a broken border',
  es: 'Una página splash, una viñeta insertada y un borde roto',
  pt: 'Uma página splash, um quadro inserido e uma borda quebrada' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: comicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic comics
