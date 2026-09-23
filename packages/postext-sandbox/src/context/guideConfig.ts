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

// The design of the built-in Postext guide: a 21 × 28 cm two-column book in
// the colours and typefaces of the Postext brand (Fraunces for display, Lora
// for the text, Geist for labels, gilt and blue on dark ink). A cover, a
// self-numbering contents page, three part dividers — each recolouring the
// palette-linked `band` colour with `:::part{palette=…}` — chapter openers
// on a full-bleed band, running heads, and the callout styles the guide
// uses to show the engine at work. Every font is served by Google Fonts, so
// the preset carries no font files.
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

const PALETTE_NAMES: Record<'en' | 'es', Record<PaletteId, string>> = {
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
};

/** Part colours, as `:::part{palette="band=#…"}` in the guide's markdown. */
export const GUIDE_PART_COLOURS = { foundations: '#2b4acb', craft: '#b7820f', practice: '#c0452f' } as const;

const WORDING = {
  en: { book: 'The Postext Guide', chapter: 'Chapter', part: 'Part' },
  es: { book: 'Guía de Postext', chapter: 'Capítulo', part: 'Parte' },
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

/** Resource id of the cover artwork (see `defaultResources`). */
export const GUIDE_COVER_RESOURCE_ID = 'guide-cover';

function coverDesign() {
  return {
    enabled: true,
    minHeight: mm(PAGE_H),
    slot: slot(
      box('coverBg', 'night', { anchor: at('bleed', 'top-left') }),
      image('coverArt', GUIDE_COVER_RESOURCE_ID, { anchor: at('bleed', 'top-left'), width: PAGE_W + 6, height: COVER_ART_H }),
      text('coverKicker', '{attr.kicker}', {
        anchor: at('page', 'top-left'), offset: [M_OUTER, COVER_ART_H + 2], width: TEXT_W,
        size: 9, weight: 600, color: 'gilt', upper: true, tracking: 2.6,
      }),
      text('coverTitle', '{title}', {
        anchor: at('#coverKicker', 'below'), offset: [0, 3], width: TEXT_W,
        size: 88, family: DISPLAY, weight: 700, color: 'white', lineHeight: 0.95,
      }),
      rule('coverRule', 'gilt', { anchor: at('#coverTitle', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
      text('coverSubtitle', '{subtitle}', {
        anchor: at('#coverRule', 'below'), offset: [0, 5], width: 140,
        size: 17, family: TEXT, italic: true, color: 'white', lineHeight: 1.25,
      }),
      text('coverPublisher', '{attr.publisher}', {
        anchor: at('page', 'bottom-left'), offset: [M_OUTER, -14], width: TEXT_W,
        size: 7.5, color: 'mist', upper: true, tracking: 1.6,
      }),
    ),
  };
}

/** Contents and other unnumbered front pages: a thin part-colour stripe at
 *  the head of the page, the title and a short rule. */
function frontOpener() {
  return {
    enabled: true,
    minHeight: mm(30),
    slot: slot(
      box('frontStripe', 'band', { anchor: at('bleed', 'top-left'), height: 5 }),
      text('frontTitle', '{titleText}', {
        anchor: at('container', 'top-left'), offset: [0, 2], width: TEXT_W,
        size: 34, family: DISPLAY, weight: 700, lineHeight: 1.05,
      }),
      rule('frontRule', 'band', { anchor: at('#frontTitle', 'below'), offset: [0, 5], width: 34, thickness: 2 }),
    ),
  };
}

/** A chapter opener: a full-bleed band in the part colour holding the
 *  chapter kicker, the title and the chapter's lead (`lead` attribute), with
 *  the chapter number set large at the outer edge. */
function chapterOpener(lang: 'en' | 'es') {
  const w = WORDING[lang];
  return {
    enabled: true,
    minHeight: mm(OPENER_H + 6),
    slot: slot(
      box('openerBand', 'band', { anchor: at('bleed', 'top-left'), height: 3 + M_TOP + OPENER_H }),
      box('openerFoot', 'ink', { anchor: at('bleed', 'top-left'), offset: [0, 3 + M_TOP + OPENER_H], height: 1.6 }),
      text('openerNumber', '{chapterNumber}', {
        anchor: at('container', 'top-right'), offset: [0, -6], width: 60,
        size: 118, family: DISPLAY, weight: 800, color: 'white', align: 'right', lineHeight: 1,
      }),
      text('openerKicker', `${w.chapter} {chapterNumber} · {partTitle}`, {
        anchor: at('container', 'top-left'), offset: [0, 4], width: 110,
        size: 8.5, weight: 600, color: 'white', upper: true, tracking: 2.2, overflow: 'ellipsis-end',
      }),
      rule('openerRule', 'white', { anchor: at('#openerKicker', 'below'), offset: [0, 3.5], width: 22, thickness: 1.5 }),
      text('openerTitle', '{titleText}', {
        anchor: at('#openerRule', 'below'), offset: [0, 5], width: 120,
        size: 32, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1.04,
      }),
      text('openerLead', '{attr.lead}', {
        anchor: at('#openerTitle', 'below'), offset: [0, 5], width: TEXT_W - 22,
        size: 10.5, family: TEXT, italic: true, color: 'white', lineHeight: 1.36, hyphenate: true,
      }),
    ),
  };
}

function partDesign(lang: 'en' | 'es') {
  return slot(
    box('partBg', 'band', { anchor: at('bleed', 'top-left') }),
    box('partNight', 'ink', { anchor: at('bleed', 'bottom-left'), height: 60 }),
    text('partLabel', WORDING[lang].part, {
      anchor: at('page', 'top-left'), offset: [M_OUTER, 46], width: TEXT_W,
      size: 10, weight: 600, color: 'white', upper: true, tracking: 3,
    }),
    text('partNumber', '{number}', {
      anchor: at('#partLabel', 'below'), offset: [0, 1], width: TEXT_W,
      size: 150, family: DISPLAY, weight: 800, color: 'white', lineHeight: 1,
    }),
    rule('partRule', 'white', { anchor: at('#partNumber', 'below'), offset: [0, 4], width: 34, thickness: 2 }),
    text('partTitle', '{titleText}', {
      anchor: at('#partRule', 'below'), offset: [0, 6], width: TEXT_W,
      size: 42, family: DISPLAY, weight: 700, color: 'white', lineHeight: 1.02,
    }),
    text('partBook', WORDING[lang].book, {
      anchor: at('page', 'bottom-left'), offset: [M_OUTER, -24], width: TEXT_W,
      size: 8, weight: 600, color: 'mist', upper: true, tracking: 2,
    }),
  );
}

/** Verso: folio and the book; recto: the chapter and folio. */
function runningHeads(lang: 'en' | 'es') {
  const y = M_TOP - 12;
  const common = { pages: 'body' as const, size: 7.5, color: 'muted' as const, upper: true, tracking: 1.4, overflow: 'ellipsis-end' as const };
  return slot(
    text('folioEven', '{pageNumber}', { ...common, anchor: at('page', 'top-left'), offset: [M_OUTER, y], parity: 'even', weight: 700, color: 'band', size: 8.5, tracking: 0 }),
    text('bookEven', WORDING[lang].book, { ...common, anchor: at('page', 'top-left'), offset: [M_OUTER + 10, y], width: 110, parity: 'even' }),
    text('chapterOdd', '{chapterTitle}', { ...common, anchor: at('page', 'top-right'), offset: [-(M_OUTER + 10), y], width: 110, parity: 'odd', align: 'right' }),
    text('folioOdd', '{pageNumber}', { ...common, anchor: at('page', 'top-right'), offset: [-M_OUTER, y], parity: 'odd', weight: 700, color: 'band', size: 8.5, tracking: 0, align: 'right' }),
    rule('headRuleEven', 'rule', { anchor: at('page', 'top-left'), offset: [M_OUTER, y + 5.5], width: TEXT_W, thickness: 0.5, parity: 'even', pages: 'body' }),
    rule('headRuleOdd', 'rule', { anchor: at('page', 'top-left'), offset: [M_INNER, y + 5.5], width: TEXT_W, thickness: 0.5, parity: 'odd', pages: 'body' }),
  );
}

function openerFooter() {
  return slot(
    text('folioOpener', '{pageNumber}', {
      anchor: at('page', 'bottom'), offset: [0, -(M_BOTTOM - 10)], width: 30, pages: 'opener',
      size: 8.5, weight: 700, color: 'band', align: 'center',
    }),
  );
}

function headingStyles(): HeadingStyleConfig[] {
  const empty = slot();
  return [
    {
      id: 'cover', name: 'Cover', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: coverDesign(),
      header: empty, footer: empty,
      layout: { layoutType: 'single' },
      margins: { top: mm(PAGE_H - 96), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(PAGE_W - M_INNER - 110) },
    },
    {
      id: 'contents', name: 'Contents', numbered: false, toc: false, span: 'page',
      breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: frontOpener(),
      layout: { layoutType: 'single' },
    },
  ];
}

function paragraphStyles(): ParagraphStyleConfig[] {
  return [
    { id: 'colophon', name: 'Colophon', fontFamily: SANS, fontSize: pt(7.5), lineHeight: pt(11), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(5), color: col('muted'), boldColor: col('ink') },
    { id: 'standfirst', name: 'Standfirst', fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(17), textAlign: 'left', firstLineIndent: mm(0), spaceBetween: pt(6), marginBottom: pt(6), color: col('ink'), boldColor: col('band'), hyphenation: false },
    { id: 'signature', name: 'Signature', fontFamily: SANS, fontSize: pt(8), lineHeight: pt(11), textAlign: 'right', firstLineIndent: mm(0), marginTop: pt(4), color: col('muted') },
  ];
}

function calloutStyles(lang: 'en' | 'es'): CalloutStyleConfig[] {
  const label = { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: pt(1.6) };
  const sansBody = {
    fontFamily: SANS, fontSize: pt(8.3), lineHeight: pt(12), color: col('ink'), boldColor: col('ink'),
    textAlign: 'left' as const, hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
  };
  return [
    {
      // "Try it in the Sandbox": a hands-on step next to the prose.
      id: 'try', name: lang === 'es' ? 'Pruébalo' : 'Try it', title: lang === 'es' ? 'Pruébalo en el Sandbox' : 'Try it in the Sandbox',
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
      id: 'note', name: lang === 'es' ? 'Nota técnica' : 'Technical note', title: lang === 'es' ? 'Nota técnica' : 'Technical note',
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
      // Pull quote: display italic in the part colour between two rules.
      id: 'quote', name: lang === 'es' ? 'Cita destacada' : 'Pull quote',
      span: 'column', placement: 'here',
      backgroundEnabled: false, border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(3.2), right: mm(0), bottom: mm(2.4), left: mm(0) },
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('band') },
      icon: { kind: 'none' },
      body: {
        fontFamily: DISPLAY, fontSize: pt(14.5), lineHeight: pt(18.5), color: col('band'), boldColor: col('ink'),
        textAlign: 'left', hyphenation: false, paragraphSpacing: false, firstLineIndent: mm(0),
      },
      marginTop: pt(6), marginBottom: pt(10), keepTogether: true,
    },
    {
      // Key figures: a dark page-wide panel set in balanced columns.
      id: 'figures', name: lang === 'es' ? 'Cifras' : 'Key figures', title: lang === 'es' ? 'En cifras' : 'In figures',
      span: 'page', placement: 'here',
      backgroundEnabled: true, background: col('ink'), border: { enabled: false }, borderRadius: mm(0),
      padding: { top: mm(4), right: mm(6), bottom: mm(3.5), left: mm(6) },
      icon: { kind: 'none' }, columnGap: mm(8),
      titleStyle: { ...label, color: col('gilt'), gap: mm(3) },
      body: {
        fontFamily: SANS, fontSize: pt(8.3), lineHeight: pt(12), color: col('mist'), boldColor: col('white'),
        textAlign: 'left', hyphenation: false, paragraphSpacing: true, firstLineIndent: mm(0),
      },
      marginTop: pt(4), marginBottom: pt(8), keepTogether: true,
    },
  ];
}

function toc(lang: 'en' | 'es') {
  const entry = {
    fontFamily: DISPLAY, fontSize: pt(12), lineHeight: pt(15), fontWeight: 600, color: col('ink'),
    numberWidth: mm(11), numberGap: mm(2), numberFontFamily: SANS, numberFontSize: pt(9), numberColor: col('band'), marginTop: pt(5),
  };
  return {
    levels: [{ level: 1, ...entry }],
    unnumbered: { fontFamily: TEXT, fontWeight: 400, italic: true, color: col('ink') },
    pageNumber: { fontFamily: SANS, fontSize: pt(9), fontWeight: 700, color: col('ink'), width: mm(10) },
    leader: { enabled: true, char: '.', gap: mm(1.5) },
    subtitle: { enabled: true, attr: 'summary', fontFamily: TEXT, fontSize: pt(8), italic: true, color: col('muted'), indent: mm(13) },
    parts: {
      enabled: true, height: pt(18), marginTop: pt(18), marginBottom: pt(2),
      design: slot(
        box('tocPartBand', 'band', { anchor: at('container', 'left'), width: 8, height: 8 }),
        text('tocPart', `${WORDING[lang].part} {number} · {titleText}`, {
          anchor: at('#tocPartBand', 'right-of'), offset: [3, 0], width: 150,
          size: 9, weight: 700, color: 'band', upper: true, tracking: 2,
        }),
      ),
    },
  };
}

/** The Postext guide's configuration for `locale` (English or Spanish). */
export function createPostextGuideConfig(locale = 'en'): PostextConfig {
  const lang: 'en' | 'es' = locale.toLowerCase().startsWith('es') ? 'es' : 'en';
  const names = PALETTE_NAMES[lang];
  return {
    locale: lang === 'es' ? 'es' : 'en-us',
    page: {
      sizePreset: '21x28', width: mm(PAGE_W), height: mm(PAGE_H),
      margins: { top: mm(M_TOP), bottom: mm(M_BOTTOM), left: mm(M_INNER), right: mm(M_OUTER), mirror: true },
      pageNumbering: { format: 'decimal', startAt: 1 },
    },
    layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
    bodyText: {
      fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(13.6), textAlign: 'justify',
      firstLineIndent: mm(4), indentAfterHeading: false, paragraphSpacing: false,
      color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
      referenceColor: col('band'), referenceBold: true, referenceItalic: false,
      hyphenation: { enabled: true, locale: lang === 'es' ? 'es' : 'en-us' },
      avoidWidows: true, avoidOrphans: true, avoidRunts: true, optimalLineBreaking: true,
    },
    headings: {
      fontFamily: DISPLAY, color: col('ink'), keepWithNext: true,
      levels: [
        {
          level: 1, fontSize: pt(28), lineHeight: pt(32), fontWeight: 700, span: 'page',
          breakBefore: { enabled: true, parity: 'any' }, numberingTemplate: '{1}',
          advancedDesign: chapterOpener(lang),
        },
        {
          level: 2, fontSize: pt(15.5), lineHeight: pt(19), fontWeight: 650, color: col('band'),
          numberingTemplate: '{1}.{2}  ', marginTop: pt(20), marginBottom: pt(6),
        },
        {
          level: 3, fontFamily: SANS, fontSize: pt(9.4), lineHeight: pt(13.6), fontWeight: 700,
          textTransform: 'uppercase', numberingTemplate: '', marginTop: pt(13), marginBottom: pt(3),
        },
      ],
    },
    headingStyles: headingStyles(),
    paragraphStyles: paragraphStyles(),
    calloutStyles: calloutStyles(lang),
    parts: {
      breakBefore: { parity: 'odd' },
      breakAfter: { enabled: true, parity: 'any' },
      margins: { top: mm(172), bottom: mm(70), left: mm(M_INNER), right: mm(M_OUTER + 40) },
      design: partDesign(lang),
      bodyStyle: {
        fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(16), color: col('white'), textAlign: 'left',
        numberColor: col('white'), bulletColor: col('white'),
        orderedLists: { numberFormat: 'arabic', separator: '', gap: mm(3), indent: mm(9), fontFamily: SANS, numberFontSize: pt(9), itemSpacing: pt(2) },
      },
    },
    toc: toc(lang),
    header: runningHeads(lang),
    footer: openerFooter(),
    captionStyle: {
      fontFamily: SANS, fontSize: pt(7.4), color: col('ink'), align: 'left', gap: mm(1.8),
      labelBold: true, labelColor: col('band'), descriptionItalic: false,
      note: { fontSize: pt(6.4), color: col('muted'), italic: false, gap: mm(0.6) },
    },
    tableStyle: {
      bodyFontFamily: SANS, bodyFontSize: pt(7.8), bodyColor: col('ink'),
      headerFontFamily: SANS, headerFontSize: pt(7.6), headerBold: true, headerColor: col('white'),
      headerBackgroundEnabled: true, headerBackground: col('ink'),
      borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.1), rules: 'horizontal',
    },
    unorderedLists: { bulletChar: '•', color: col('band') },
    orderedLists: { color: col('band') },
    colorPalette: (Object.keys(COLOURS) as PaletteId[]).map((id) => ({ id, name: names[id], value: { hex: COLOURS[id], model: 'hex' } })),
    resourceTypes: defaultResourceTypes(lang),
    pdfGeneration: { outlines: true },
  };
}
