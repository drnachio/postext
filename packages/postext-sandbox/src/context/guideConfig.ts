import type {
  AnchorEdge,
  CalloutStyleConfig,
  ColorValue,
  DesignBoxElement,
  DesignElement,
  DesignImageElement,
  DesignRuleElement,
  DesignSlot,
  DesignTextElement,
  Dimension,
  ElementAnchor,
  ElementPlacement,
  HeadingStyleConfig,
  PageParity,
  PageRoleFilter,
  ParagraphStyleConfig,
  PostextConfig,
} from 'postext';
import { defaultResourceTypes } from 'postext';
import { guideLang, type GuideLang } from '../defaultResources/lang';

// The design of the built-in Postext guide: a 21 × 28 cm two-column book in
// the colours and typefaces of the Postext brand (Fraunces for display, Lora
// for the text, Geist for labels, Bricolage Grotesque for section headings,
// gilt and blue on dark ink). A cover, a
// self-numbering contents page, three part dividers — each recolouring the
// palette-linked `band` colour with `:::part{palette=…}` — chapter openers
// on a full-bleed band, running heads, and the callout styles the guide
// uses to show the engine at work. Every font is served by Google Fonts, so
// the preset carries no font files.
//
// The Chinese edition keeps the page, the colours and the cover, and sets
// its text as a mainland book: Noto Serif SC (思源宋体) for the text, Noto
// Sans SC (思源黑体) for headings, labels and captions, justified with a
// two-character indent, Kaiming punctuation and GB line breaking. Fraunces
// stays where the text is Latin: the cover title and the large chapter and
// part numerals. Where the Latin design sets italics (leads, the cover
// subtitle, the contents summaries, pull quotes) the Chinese one sets the
// upright text face, or its bold for the pull quote: Chinese has no italic,
// and a Kai face (楷体) would be a third CJK family for the previews to
// fetch, about as heavy again as the two the book needs.
//
// Geometry: a 170 mm text area in two 80.5 mm columns keeps the page/column
// width ratio the example figures are drawn for (≈ 2.11, see
// `defaultResources`), so their type comes out the same size at both spans.

const PAGE_W = 210;
const PAGE_H = 280;
const M_TOP = 24;
const M_BOTTOM = 22;
const M_INNER = 20;
const M_OUTER = 20;
const TEXT_W = PAGE_W - M_INNER - M_OUTER;
const GUTTER = 9;
/** Height of a chapter opener's band below the top margin. */
const OPENER_H = 74;
/** Height of the cover artwork (full bleed, 3 mm past the trim each side). */
const COVER_ART_H = 168;

const DISPLAY = 'Fraunces';
const TEXT = 'Lora';
const SANS = 'Geist';
/** Section headings (levels 2 and 3), in the part colour. */
const HEAD = 'Bricolage Grotesque';
/** The Chinese edition's text face (思源宋体). */
const ZH_TEXT = 'Noto Serif SC';
/** The Chinese edition's headings, labels and captions (思源黑体). */
const ZH_SANS = 'Noto Sans SC';

/** The faces each role is set in, per edition. */
interface Faces {
  /** Titles: chapter openers, parts, contents entries. */
  display: string;
  /** Running text, leads, subtitles. */
  text: string;
  /** Labels, running heads, captions, tables, boxes. */
  sans: string;
  /** Section headings. */
  head: string;
}
const LATIN_FACES: Faces = { display: DISPLAY, text: TEXT, sans: SANS, head: HEAD };
const ZH_FACES: Faces = { display: ZH_SANS, text: ZH_TEXT, sans: ZH_SANS, head: ZH_SANS };
const facesOf = (lang: GuideLang): Faces => (lang === 'zh-Hans' ? ZH_FACES : LATIN_FACES);

const COLOURS = {
  ink: '#15171c',
  night: '#0e1014',
  paper: '#ffffff',
  white: '#ffffff',
  // The part colour: gilt by default, blue / gilt / vermilion per part.
  band: '#b7820f',
  gilt: '#d8a21a',
  'main-color': '#2b4acb',
  vermilion: '#c0452f',
  muted: '#6c7079',
  mist: '#b9bcc4',
  rule: '#d9d5cc',
  tint: '#f7f1e3',
  panel: '#f1f3f8',
} as const;
type PaletteId = keyof typeof COLOURS;

const PALETTE_NAMES: Record<GuideLang, Record<PaletteId, string>> = {
  en: {
    ink: 'Ink', night: 'Cover night', paper: 'Paper', white: 'White', band: 'Part colour', gilt: 'Gilt',
    'main-color': 'Postext blue', vermilion: 'Vermilion', muted: 'Muted grey', mist: 'Mist', rule: 'Rules',
    tint: 'Warm tint', panel: 'Cool panel',
  },
  es: {
    ink: 'Tinta', night: 'Noche de cubierta', paper: 'Papel', white: 'Blanco', band: 'Color de parte', gilt: 'Oro',
    'main-color': 'Azul Postext', vermilion: 'Bermellón', muted: 'Gris de notas', mist: 'Bruma', rule: 'Filetes',
    tint: 'Fondo cálido', panel: 'Fondo frío',
  },
  'zh-Hans': {
    ink: '墨色', night: '封面夜色', paper: '纸色', white: '白色', band: '篇色', gilt: '金色',
    'main-color': 'Postext蓝', vermilion: '朱红', muted: '注释灰', mist: '雾灰', rule: '线条',
    tint: '暖色底', panel: '冷色底',
  },
};

/** Part colours, as `:::part{palette="band=#…"}` in the guide's markdown. */
export const GUIDE_PART_COLOURS = { foundations: '#2b4acb', craft: '#b7820f', practice: '#c0452f' } as const;

/** The design's own words. `kicker` heads a chapter opener, `partLabel`
 *  a part divider, `tocPart` a part row of the contents. */
const WORDING: Record<GuideLang, { book: string; kicker: string; partLabel: string; tocPart: string }> = {
  en: { book: 'The Postext Guide', kicker: 'Chapter {chapterNumber} · {partTitle}', partLabel: 'Part', tocPart: 'Part {number} · {titleText}' },
  es: { book: 'Guía de Postext', kicker: 'Capítulo {chapterNumber} · {partTitle}', partLabel: 'Parte', tocPart: 'Parte {number} · {titleText}' },
  // Chapters number themselves 第一章 (`{chapterNumber}`); a part reads its
  // number from `:::part{number="II"}` as Chinese numerals (第二篇).
  'zh-Hans': { book: 'Postext指南', kicker: '{chapterNumber} · {partTitle}', partLabel: '第{numberHan}篇', tocPart: '第{numberHan}篇 · {titleText}' },
};

const mm = (value: number): Dimension => ({ value, unit: 'mm' });
const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const col = (id: PaletteId): ColorValue => ({ hex: COLOURS[id], model: 'hex', paletteId: id });
const at = (to: ElementAnchor['to'], edge: AnchorEdge): ElementAnchor => ({ to, edge });

interface Common {
  anchor: ElementAnchor;
  offset?: [number, number];
  parity?: PageParity;
  pages?: PageRoleFilter;
}
const placement = (o: Common, size?: ElementPlacement['size']): ElementPlacement => ({
  anchor: o.anchor,
  offset: { x: mm(o.offset?.[0] ?? 0), y: mm(o.offset?.[1] ?? 0) },
  ...(size ? { size } : {}),
});
const filters = (o: Common) => ({ ...(o.parity ? { parity: o.parity } : {}), ...(o.pages ? { pages: o.pages } : {}) });

interface TextOpts extends Common {
  width?: number;
  size: number;
  family?: string;
  weight?: number;
  italic?: boolean;
  color?: PaletteId;
  align?: DesignTextElement['align'];
  lineHeight?: number;
  tracking?: number;
  upper?: boolean;
  overflow?: DesignTextElement['overflow'];
  hyphenate?: boolean;
}
function text(id: string, content: string, o: TextOpts): DesignTextElement {
  return {
    kind: 'text',
    id,
    ...filters(o),
    placement: placement(o, { width: o.width !== undefined ? mm(o.width) : 'auto', height: 'auto' }),
    content,
    fontFamily: o.family ?? SANS,
    fontSize: pt(o.size),
    fontWeight: o.weight ?? 400,
    italic: o.italic ?? false,
    color: col(o.color ?? 'ink'),
    align: o.align ?? 'left',
    verticalAlign: 'middle',
    lineHeight: o.lineHeight ?? 1.2,
    overflow: o.overflow ?? 'wrap',
    ...(o.tracking ? { letterSpacing: pt(o.tracking) } : {}),
    ...(o.upper ? { textTransform: 'uppercase' as const } : {}),
    ...(o.hyphenate ? { hyphenate: true } : {}),
  };
}
function box(id: string, fill: PaletteId, o: Common & { width?: number; height?: number }): DesignBoxElement {
  return {
    kind: 'box',
    id,
    ...filters(o),
    placement: placement(o, {
      width: o.width !== undefined ? mm(o.width) : 'fill',
      height: o.height !== undefined ? mm(o.height) : 'fill',
    }),
    style: { backgroundColor: col(fill), borderRadius: mm(0) },
  };
}
function rule(id: string, color: PaletteId, o: Common & { width: number; thickness: number }): DesignRuleElement {
  return {
    kind: 'rule',
    id,
    ...filters(o),
    direction: 'horizontal',
    placement: placement(o, { width: mm(o.width) }),
    color: col(color),
    thickness: pt(o.thickness),
  };
}
function image(id: string, resourceId: string, o: Common & { width: number; height: number }): DesignImageElement {
  return { kind: 'image', id, ...filters(o), placement: placement(o, { width: mm(o.width), height: mm(o.height) }), resourceId };
}
const slot = (...elements: DesignElement[]): DesignSlot => ({ elements });

/** How a small label is set: Latin labels in capitals, spaced out
 *  (`tracking` in points); Chinese ones as written, unspaced, since
 *  tracking would space out the letters of a Latin word inside them too. */
function label(lang: GuideLang, tracking: number): Pick<TextOpts, 'family' | 'upper' | 'tracking'> {
  return lang === 'zh-Hans'
    ? { family: ZH_SANS }
    : { upper: true, tracking };
}

/** Resource id of the cover artwork (see `defaultResources`). */
export const GUIDE_COVER_RESOURCE_ID = 'guide-cover';

function coverDesign(lang: GuideLang) {
  const zh = lang === 'zh-Hans';
  return {
    enabled: true,
    minHeight: mm(PAGE_H),
    slot: slot(
      box('coverBg', 'night', { anchor: at('bleed', 'top-left') }),
      image('coverArt', GUIDE_COVER_RESOURCE_ID, { anchor: at('bleed', 'top-left'), width: PAGE_W + 6, height: COVER_ART_H }),
      text('coverKicker', '{attr.kicker}', {
        anchor: at('page', 'top-left'), offset: [M_OUTER, COVER_ART_H + 2], width: TEXT_W,
        size: 9, weight: zh ? 700 : 600, color: 'gilt', ...label(lang, 2.6),
      }),
      // The title is the Latin word "Postext" in every edition.
      text('coverTitle', '{title}', {
        anchor: at('#coverKicker', 'below'), offset: [0, 3], width: TEXT_W,
        size: 88, family: DISPLAY, weight: 700, color: 'white', lineHeight: 0.95,
      }),
      rule('coverRule', 'gilt', { anchor: at('#coverTitle', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
      text('coverSubtitle', '{subtitle}', zh
        ? {
            anchor: at('#coverRule', 'below'), offset: [0, 5], width: 140,
            size: 17, family: ZH_TEXT, color: 'white', lineHeight: 1.4, tracking: 1,
          }
        : {
            anchor: at('#coverRule', 'below'), offset: [0, 5], width: 140,
            size: 17, family: TEXT, italic: true, color: 'white', lineHeight: 1.25,
          }),
      text('coverPublisher', '{attr.publisher}', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -14], width: TEXT_W,
        size: 7.5, color: 'mist', ...label(lang, 1.6),
      }),
    ),
  };
}

/** Contents and other unnumbered front pages: a thin part-colour stripe at
 *  the head of the page, the title and a short rule. */
function frontOpener(lang: GuideLang) {
  const zh = lang === 'zh-Hans';
  return {
    enabled: true,
    minHeight: mm(30),
    slot: slot(
      box('frontStripe', 'band', { anchor: at('bleed', 'top-left'), height: 5 }),
      text('frontTitle', '{titleText}', {
        anchor: at('container', 'top-left'), offset: [0, 2], width: TEXT_W,
        size: zh ? 30 : 34, family: facesOf(lang).display, weight: 700, lineHeight: zh ? 1.2 : 1.05, ...(zh ? { tracking: 4 } : {}),
      }),
      rule('frontRule', 'band', { anchor: at('#frontTitle', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
    ),
  };
}

/** A chapter opener: a full-bleed band in the part colour holding the
 *  chapter kicker, the title and the chapter's lead (`lead` attribute), with
 *  the chapter number set large at the outer edge. The Chinese edition sets
 *  the number in Fraunces too (`{numberDecimal}`, the kicker reads 第一章)
 *  and the lead upright in the text face. */
function chapterOpener(lang: GuideLang) {
  const zh = lang === 'zh-Hans';
  return {
    enabled: true,
    minHeight: mm(OPENER_H + 6),
    slot: slot(
      box('openerBand', 'band', { anchor: at('bleed', 'top-left'), height: 3 + M_TOP + OPENER_H }),
      box('openerFoot', 'ink', { anchor: at('bleed', 'top-left'), offset: [0, 3 + M_TOP + OPENER_H], height: 1.6 }),
      text('openerNumber', zh ? '{numberDecimal}' : '{chapterNumber}', {
        anchor: at('container', 'top-right'), offset: [0, -6], width: 60,
        size: 118, family: DISPLAY, weight: 800, color: 'white', align: 'right', lineHeight: 1,
      }),
      text('openerKicker', WORDING[lang].kicker, {
        anchor: at('container', 'top-left'), offset: [0, 4], width: 110,
        size: zh ? 9 : 8.5, weight: zh ? 700 : 600, color: 'white', ...label(lang, 2.2), overflow: 'ellipsis-end',
      }),
      rule('openerRule', 'white', { anchor: at('#openerKicker', 'below'), offset: [0, 3.5], width: 22, thickness: 1.5 }),
      text('openerTitle', '{titleText}', zh
        ? {
            // Wider than the Latin title: a Chinese title is cut between any
            // two characters, and 输出：Canvas、HTML与PDF needs the room.
            anchor: at('#openerRule', 'below'), offset: [0, 5], width: 132,
            size: 26, family: ZH_SANS, weight: 700, color: 'white', lineHeight: 1.22,
          }
        : {
            anchor: at('#openerRule', 'below'), offset: [0, 5], width: 120,
            size: 32, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1.04,
          }),
      text('openerLead', '{attr.lead}', zh
        ? {
            anchor: at('#openerTitle', 'below'), offset: [0, 5], width: TEXT_W - 22,
            size: 10, family: ZH_TEXT, color: 'white', lineHeight: 1.7,
          }
        : {
            anchor: at('#openerTitle', 'below'), offset: [0, 5], width: TEXT_W - 22,
            size: 10.5, family: TEXT, italic: true, color: 'white', lineHeight: 1.36, hyphenate: true,
          }),
    ),
  };
}

function partDesign(lang: GuideLang) {
  const zh = lang === 'zh-Hans';
  return slot(
    box('partBg', 'band', { anchor: at('bleed', 'top-left') }),
    box('partNight', 'ink', { anchor: at('bleed', 'bottom-left'), height: 60 }),
    text('partLabel', WORDING[lang].partLabel, {
      anchor: at('page', 'top-left'), offset: [M_OUTER, 46], width: TEXT_W,
      size: zh ? 12 : 10, weight: zh ? 700 : 600, color: 'white', ...(zh ? { family: ZH_SANS, tracking: 3 } : { upper: true, tracking: 3 }),
    }),
    // The number as the markup writes it (I, II, III), in Fraunces in
    // every edition; the Chinese label above reads it as 第二篇.
    text('partNumber', '{number}', {
      anchor: at('#partLabel', 'below'), offset: [0, 1], width: TEXT_W,
      size: 150, family: DISPLAY, weight: 800, color: 'white', lineHeight: 1,
    }),
    rule('partRule', 'white', { anchor: at('#partNumber', 'below'), offset: [0, 4], width: 34, thickness: 2 }),
    text('partTitle', '{titleText}', zh
      ? {
          anchor: at('#partRule', 'below'), offset: [0, 6], width: TEXT_W,
          size: 40, family: ZH_SANS, weight: 700, color: 'white', lineHeight: 1.2, tracking: 6,
        }
      : {
          anchor: at('#partRule', 'below'), offset: [0, 6], width: TEXT_W,
          size: 42, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1.02,
        }),
    text('partBook', WORDING[lang].book, {
      anchor: at('page', 'bottom-left'), offset: [M_OUTER, -24], width: TEXT_W,
      size: 8, weight: zh ? 700 : 600, color: 'mist', ...label(lang, 2),
    }),
  );
}

/** Verso: folio and the book; recto: the chapter and folio. The Chinese
 *  recto names the chapter with its number (第三章　排好每一行). */
function runningHeads(lang: GuideLang) {
  const zh = lang === 'zh-Hans';
  const y = M_TOP - 12;
  const common = zh
    ? { pages: 'body' as const, size: 7.5, color: 'muted' as const, family: ZH_SANS, tracking: 0.6, overflow: 'ellipsis-end' as const }
    : { pages: 'body' as const, size: 7.5, color: 'muted' as const, upper: true, tracking: 1.4, overflow: 'ellipsis-end' as const };
  return slot(
    // The blank verso that faces a part divider is set in the part's own
    // colour (a blank parity page before a part page already takes its
    // palette), so the divider opens as a spread. Parts break `always-odd`
    // and chapters open on versos, so the only blank versos in the book
    // are those.
    box('partFacing', 'band', { anchor: at('bleed', 'top-left'), parity: 'even', pages: 'blank' }),
    text('folioEven', '{pageNumber}', { ...common, anchor: at('page', 'top-left'), offset: [M_OUTER, y], parity: 'even', weight: 700, color: 'band', size: 8.5, tracking: 0 }),
    text('bookEven', WORDING[lang].book, { ...common, anchor: at('page', 'top-left'), offset: [M_OUTER + 10, y], width: 110, parity: 'even' }),
    text('chapterOdd', zh ? '{chapterNumber}　{chapterTitle}' : '{chapterTitle}', { ...common, anchor: at('page', 'top-right'), offset: [-(M_OUTER + 10), y], width: 110, parity: 'odd', align: 'right' }),
    text('folioOdd', '{pageNumber}', { ...common, anchor: at('page', 'top-right'), offset: [-M_OUTER, y], parity: 'odd', weight: 700, color: 'band', size: 8.5, tracking: 0, align: 'right' }),
    rule('headRuleEven', 'rule', { anchor: at('page', 'top-left'), offset: [M_OUTER, y + 5.5], width: TEXT_W, thickness: 0.5, parity: 'even', pages: 'body' }),
    rule('headRuleOdd', 'rule', { anchor: at('page', 'top-left'), offset: [M_INNER, y + 5.5], width: TEXT_W, thickness: 0.5, parity: 'odd', pages: 'body' }),
  );
}

function openerFooter(lang: GuideLang) {
  return slot(
    text('folioOpener', '{pageNumber}', {
      anchor: at('page', 'bottom'), offset: [0, -(M_BOTTOM - 10)], width: 30, pages: 'opener',
      size: 8.5, weight: 700, color: 'band', align: 'center', ...(lang === 'zh-Hans' ? { family: ZH_SANS } : {}),
    }),
  );
}

function headingStyles(lang: GuideLang): HeadingStyleConfig[] {
  const empty = slot();
  return [
    {
      id: 'cover', name: 'Cover', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: coverDesign(lang),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
      margins: { top: mm(PAGE_H - 96), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(PAGE_W - M_INNER - 110) },
    },
    {
      id: 'contents', name: 'Contents', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: frontOpener(lang),
      layout: { layoutType: 'single' },
    },
  ];
}

function paragraphStyles(lang: GuideLang): ParagraphStyleConfig[] {
  if (lang === 'zh-Hans') {
    return [
      { id: 'colophon', name: '版权页', fontFamily: ZH_SANS, fontSize: pt(7.5), lineHeight: pt(12.5), textAlign: 'justify', firstLineIndent: mm(0), spaceBetween: pt(5), color: col('muted'), boldColor: col('ink') },
      { id: 'standfirst', name: '导语', fontFamily: ZH_TEXT, fontSize: pt(12), lineHeight: pt(20), textAlign: 'justify', firstLineIndent: mm(0), spaceBetween: pt(6), marginBottom: pt(6), color: col('ink'), boldColor: col('band') },
      { id: 'signature', name: '署名', fontFamily: ZH_SANS, fontSize: pt(8), lineHeight: pt(12), textAlign: 'right', firstLineIndent: mm(0), marginTop: pt(4), color: col('muted') },
    ];
  }
  return [
    { id: 'colophon', name: 'Colophon', fontFamily: SANS, fontSize: pt(7.5), lineHeight: pt(11), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(5), color: col('muted'), boldColor: col('ink') },
    { id: 'standfirst', name: 'Standfirst', fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(17), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(6), marginBottom: pt(6), color: col('ink'), boldColor: col('band'), hyphenation: false },
    { id: 'signature', name: 'Signature', fontFamily: SANS, fontSize: pt(8), lineHeight: pt(11), textAlign: 'right', firstLineIndent: mm(0), marginTop: pt(4), color: col('muted') },
  ];
}

/** Names and titles of the callout styles. */
const CALLOUT_WORDS: Record<GuideLang, { try: [string, string]; note: [string, string]; quote: string; figures: [string, string] }> = {
  en: { try: ['Try it', 'Try it in the Sandbox'], note: ['Technical note', 'Technical note'], quote: 'Pull quote', figures: ['Key figures', 'In figures'] },
  es: { try: ['Pruébalo', 'Pruébalo en el Sandbox'], note: ['Nota técnica', 'Nota técnica'], quote: 'Cita destacada', figures: ['Cifras', 'En cifras'] },
  'zh-Hans': { try: ['试一试', '在 Sandbox 中试一试'], note: ['技术说明', '技术说明'], quote: '醒目引文', figures: ['数字一览', '数字一览'] },
};

function calloutStyles(lang: GuideLang): CalloutStyleConfig[] {
  const zh = lang === 'zh-Hans';
  const words = CALLOUT_WORDS[lang];
  const label = zh
    ? { fontFamily: ZH_SANS, fontSize: pt(7.5), fontWeight: 700, letterSpacing: pt(0) }
    : { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: pt(1.6) };
  const sansBody = zh
    ? {
        // Ragged, as the Latin boxes are: the boxes quote code, and a
        // justified line of Chinese would be spread wide before a long name.
        fontFamily: ZH_SANS, fontSize: pt(8.3), lineHeight: pt(13.5), color: col('ink'), boldColor: col('ink'),
        textAlign: 'left' as const, paragraphSpacing: true, firstLineIndent: mm(0),
      }
    : {
        fontFamily: SANS, fontSize: pt(8.3), lineHeight: pt(12), color: col('ink'), boldColor: col('ink'),
        textAlign: 'left' as const, hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
      };
  return [
    {
      // "Try it in the Sandbox": a hands-on step next to the prose.
      id: 'try', name: words.try[0], title: words.try[1],
      span: 'column', placement: 'here',
      backgroundEnabled: true, background: col('tint'), border: { enabled: false }, borderRadius: mm(1.2),
      padding: { top: mm(3), right: mm(3.5), bottom: mm(2.6), left: mm(4.5) },
      stripe: { enabled: true, side: 'left', width: pt(3), color: col('band') },
      icon: { kind: 'none' },
      titleStyle: { ...label, color: col('band'), gap: mm(1.6) },
      body: sansBody,
      lists: { color: col('band') },
      marginTop: pt(4), marginBottom: pt(9), keepTogether: true,
    },
    {
      // A technical aside: the fine print of a feature.
      id: 'note', name: words.note[0], title: words.note[1],
      span: 'column', placement: 'here',
      backgroundEnabled: true, background: col('panel'), border: { enabled: false }, borderRadius: mm(1.2),
      padding: { top: mm(3), right: mm(3.5), bottom: mm(2.6), left: mm(3.5) },
      icon: { kind: 'none' },
      titleStyle: { ...label, color: col('main-color'), gap: mm(1.6) },
      body: sansBody,
      lists: { color: col('main-color') },
      marginTop: pt(4), marginBottom: pt(9), keepTogether: true,
    },
    {
      // Pull quote: display italic in the part colour, the text hung to the
      // right of a large opening quotation mark, as in a magazine. The
      // Chinese edition sets the quote in the bold of its text face.
      id: 'quote', name: words.quote,
      span: 'column', placement: 'here',
      backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
      // The glyph is centred in its 22 mm square, about 5.8 mm in from the
      // square's edge: the negative left padding sets the mark flush with
      // the column's text, and the gap leaves it clear of the quote.
      padding: { top: mm(1), right: mm(0), bottom: mm(2.4), left: mm(-5.8) },
      icon: { kind: 'glyph', glyph: '“', fontFamily: DISPLAY, fontWeight: 800, size: mm(22), color: col('band'), align: 'top', position: 'inline' },
      titleStyle: { gap: mm(-1.5) },
      body: zh
        ? {
            fontFamily: ZH_TEXT, fontSize: pt(13), lineHeight: pt(21), fontWeight: 700, boldFontWeight: 700, color: col('band'), boldColor: col('ink'),
            italicColor: col('band'), textAlign: 'left', paragraphSpacing: false, firstLineIndent: mm(0),
          }
        : {
            fontFamily: DISPLAY, fontSize: pt(14.5), lineHeight: pt(18.5), color: col('band'), boldColor: col('ink'),
            italicColor: col('band'), textAlign: 'left', hyphenation: false, paragraphSpacing: false, firstLineIndent: mm(0),
          },
      marginTop: pt(6), marginBottom: pt(10), keepTogether: true,
    },
    {
      // Key figures: a dark page-wide panel set in balanced columns.
      id: 'figures', name: words.figures[0], title: words.figures[1],
      span: 'page', placement: 'here',
      backgroundEnabled: true, background: col('ink'), border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(4), right: mm(6), bottom: mm(3.5), left: mm(6) },
      icon: { kind: 'none' }, columnGap: mm(8),
      titleStyle: { ...label, color: col('gilt'), gap: mm(3) },
      body: zh
        ? {
            fontFamily: ZH_SANS, fontSize: pt(8.3), lineHeight: pt(13.5), color: col('mist'), boldColor: col('white'),
            textAlign: 'left', paragraphSpacing: true, firstLineIndent: mm(0),
          }
        : {
            fontFamily: SANS, fontSize: pt(8.3), lineHeight: pt(12), color: col('mist'), boldColor: col('white'),
            textAlign: 'left', hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
          },
      marginTop: pt(4), marginBottom: pt(8), keepTogether: true,
    },
  ];
}

function toc(lang: GuideLang) {
  const zh = lang === 'zh-Hans';
  const entry = zh
    ? {
        fontFamily: ZH_SANS, fontSize: pt(11), lineHeight: pt(16), fontWeight: 700, color: col('ink'),
        numberWidth: mm(14), numberGap: mm(3), numberFontFamily: ZH_SANS, numberFontSize: pt(9), numberColor: col('band'), marginTop: pt(5),
      }
    : {
        fontFamily: DISPLAY, fontSize: pt(12), lineHeight: pt(15), fontWeight: 600, color: col('ink'),
        numberWidth: mm(11), numberGap: mm(2), numberFontFamily: SANS, numberFontSize: pt(9), numberColor: col('band'), marginTop: pt(5),
      };
  return {
    levels: [{ level: 1, ...entry }],
    unnumbered: zh
      ? { fontFamily: ZH_TEXT, fontWeight: 400, color: col('ink') }
      : { fontFamily: TEXT, fontWeight: 400, italic: true, color: col('ink') },
    pageNumber: { fontFamily: facesOf(lang).sans, fontSize: pt(9), fontWeight: 700, color: col('ink'), width: mm(10) },
    leader: { enabled: true, char: '.', gap: mm(1.5) },
    subtitle: zh
      ? { enabled: true, attr: 'summary', fontFamily: ZH_TEXT, fontSize: pt(8), color: col('muted'), indent: mm(17) }
      : { enabled: true, attr: 'summary', fontFamily: TEXT, fontSize: pt(8), italic: true, color: col('muted'), indent: mm(13) },
    parts: {
      enabled: true, height: pt(18), marginTop: pt(18), marginBottom: pt(2),
      design: slot(
        box('tocPartBand', 'band', { anchor: at('container', 'left'), width: 8, height: 8 }),
        text('tocPart', WORDING[lang].tocPart, {
          anchor: at('#tocPartBand', 'right-of'), offset: [3, 0], width: 150,
          size: 9, weight: 700, color: 'band', ...label(lang, 2),
        }),
      ),
    },
  };
}

/** The Postext guide's configuration for `locale`: the English, Spanish or
 *  Simplified Chinese edition (any Chinese tag reads the Chinese one). */
export function createPostextGuideConfig(locale = 'en'): PostextConfig {
  const lang = guideLang(locale);
  const names = PALETTE_NAMES[lang];
  const zh = lang === 'zh-Hans';
  return {
    locale: zh ? 'zh-Hans' : lang === 'es' ? 'es' : 'en-us',
    page: {
      sizePreset: '21x28', width: mm(PAGE_W), height: mm(PAGE_H),
      margins: { top: mm(M_TOP), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(M_OUTER), mirror: true },
      pageNumbering: { format: 'decimal', startAt: 1 },
    },
    layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
    bodyText: zh
      ? {
          // 9.5 pt on 16 pt: 24 characters to a column, a line gap of about
          // 0.7 em; a two-character indent and no space between paragraphs.
          fontFamily: ZH_TEXT, fontSize: pt(9.5), lineHeight: pt(16), textAlign: 'justify',
          firstLineIndent: { value: 2, unit: 'em' }, indentAfterHeading: true, paragraphSpacing: false,
          color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
          referenceColor: col('band'), referenceBold: true, referenceItalic: false,
          hyphenation: { enabled: false },
          avoidWidows: true, avoidOrphans: true, avoidRunts: true, optimalLineBreaking: true,
        }
      : {
          fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(13.6), textAlign: 'justify',
          firstLineIndent: mm(4), indentAfterHeading: false, paragraphSpacing: false,
          color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
          referenceColor: col('band'), referenceBold: true, referenceItalic: false,
          hyphenation: { enabled: true, locale: lang === 'es' ? 'es' : 'en-us' },
          avoidWidows: true, avoidOrphans: true, avoidRunts: true, optimalLineBreaking: true,
        },
    // Mainland conventions, spelled out (they are also what `locale:
    // 'zh-Hans'` resolves to): GB/T 15834 line breaking, Kaiming
    // punctuation with adjacent marks compressed, a quarter em between Han
    // and Latin.
    ...(zh
      ? { cjk: { region: 'mainland' as const, lineBreak: 'gb' as const, punctuationWidth: 'kaiming' as const, compressAdjacent: true, trimLineStart: true, latinSpacing: { value: 0.25, unit: 'em' as const } } }
      : {}),
    headings: zh
      ? {
          fontFamily: ZH_SANS, color: col('ink'), keepWithNext: true,
          levels: [
            {
              // Chapters open on a verso, across from their first recto.
              level: 1, fontSize: pt(26), lineHeight: pt(32), fontWeight: 700, span: 'page',
              breakBefore: { enabled: true, parity: 'even' }, numberingTemplate: '第{1:一}章', numberSeparator: '　',
              advancedDesign: chapterOpener(lang),
            },
            {
              level: 2, fontFamily: ZH_SANS, fontSize: pt(12.5), lineHeight: pt(18), fontWeight: 700, color: col('band'),
              numberingTemplate: '', marginTop: pt(18), marginBottom: pt(5),
            },
            {
              level: 3, fontFamily: ZH_SANS, fontSize: pt(10.5), lineHeight: pt(16), fontWeight: 700, color: col('band'),
              numberingTemplate: '', marginTop: pt(12), marginBottom: pt(3),
            },
            {
              level: 4, fontFamily: ZH_SANS, fontSize: pt(9.5), lineHeight: pt(16), fontWeight: 700, color: col('band'),
              numberingTemplate: '', marginTop: pt(10), marginBottom: pt(2),
            },
          ],
        }
      : {
          fontFamily: DISPLAY, color: col('ink'), keepWithNext: true,
          levels: [
            {
              // Chapters open on a verso, across from their first recto.
              level: 1, fontSize: pt(28), lineHeight: pt(32), fontWeight: 700, span: 'page',
              breakBefore: { enabled: true, parity: 'even' }, numberingTemplate: '{1}',
              advancedDesign: chapterOpener(lang),
            },
            {
              level: 2, fontFamily: HEAD, fontSize: pt(13.5), lineHeight: pt(17), fontWeight: 700, color: col('band'),
              numberingTemplate: '', marginTop: pt(18), marginBottom: pt(5),
            },
            {
              level: 3, fontFamily: HEAD, fontSize: pt(10), lineHeight: pt(13.6), fontWeight: 700, color: col('band'),
              numberingTemplate: '', marginTop: pt(12), marginBottom: pt(3),
            },
            {
              level: 4, fontFamily: HEAD, fontSize: pt(9.4), lineHeight: pt(13.6), fontWeight: 600, color: col('band'),
              numberingTemplate: '', marginTop: pt(10), marginBottom: pt(2),
            },
          ],
        },
    headingStyles: headingStyles(lang),
    paragraphStyles: paragraphStyles(lang),
    calloutStyles: calloutStyles(lang),
    parts: {
      // A part opens on a recto facing a verso in its colour: `always-odd` lays one
      // blank leaf before it (the coloured verso) and pads a white recto first
      // when the chapter before ends on a verso. Its first chapter opens on
      // the back of the divider, a verso.
      breakBefore: { parity: 'always-odd' },
      breakAfter: { enabled: true, parity: 'even' },
      margins: { top: mm(172), bottom: mm(70), left: mm(M_INNER), right: mm(M_OUTER + 40) },
      design: partDesign(lang),
      bodyStyle: zh
        ? {
            fontFamily: ZH_TEXT, fontSize: pt(11), lineHeight: pt(18), color: col('white'), textAlign: 'left',
            numberColor: col('white'), bulletColor: col('white'),
            // The chapters listed as 第三章 排好每一行, the numbers on the
            // margin the label, number and title hang from.
            orderedLists: {
              numberFormat: 'simp-chinese-informal', prefix: '第', separator: '章', gap: mm(3), indent: mm(0),
              fontFamily: ZH_SANS, numberFontSize: pt(9), itemSpacing: pt(2),
            },
          }
        : {
            fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(16), color: col('white'), textAlign: 'left',
            numberColor: col('white'), bulletColor: col('white'),
            // Numbers on the margin the label, number and title hang from.
            orderedLists: { numberFormat: 'arabic', separator: '', gap: mm(3), indent: mm(0), fontFamily: SANS, numberFontSize: pt(9), itemSpacing: pt(2) },
          },
    },
    toc: toc(lang),
    // On screen the book reads as one scroll: no section dividers (the parts
    // still colour their chapters).
    htmlViewer: { overrides: { parts: { page: false } } },
    header: runningHeads(lang),
    footer: openerFooter(lang),
    captionStyle: zh
      ? {
          // 图3-1　标题: the label and number solid, an ideographic space
          // before the description.
          fontFamily: ZH_SANS, fontSize: pt(7.6), color: col('ink'), align: 'left', gap: mm(1.8),
          labelBold: true, labelColor: col('band'), descriptionItalic: false, labelNumberGap: '', labelSeparator: '　',
          note: { fontSize: pt(6.6), color: col('muted'), italic: false, gap: mm(0.6) },
        }
      : {
          fontFamily: SANS, fontSize: pt(7.4), color: col('ink'), align: 'left', gap: mm(1.8),
          labelBold: true, labelColor: col('band'), descriptionItalic: false,
          note: { fontSize: pt(6.4), color: col('muted'), italic: false, gap: mm(0.6) },
        },
    tableStyle: {
      bodyFontFamily: facesOf(lang).sans, bodyFontSize: pt(7.8), bodyColor: col('ink'),
      headerFontFamily: facesOf(lang).sans, headerFontSize: pt(7.6), headerBold: true, headerColor: col('white'),
      headerBackgroundEnabled: true, headerBackground: col('ink'),
      borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.1), rules: 'horizontal',
    },
    unorderedLists: { bulletChar: '•', color: col('band') },
    orderedLists: { color: col('band') },
    colorPalette: (Object.keys(COLOURS) as PaletteId[]).map((id) => ({ id, name: names[id], value: { hex: COLOURS[id], model: 'hex' } })),
    resourceTypes: defaultResourceTypes(zh ? 'zh-Hans' : lang),
    pdfGeneration: { outlines: true },
  };
}
