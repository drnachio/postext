// The guide's print cover (#1670): the book as a paperback and a hardcover,
// and a cover sheet in the brand of its front and back pages. The night
// ground, the cover picture across the head of the front, the three part
// colours on the back, a gloss varnish over the picture; the title,
// subtitle and author on the front come from the edition's metadata, the
// back cover's text and the spine's line from its cover Markdown
// (`guideCoverMarkdown`).

import type { ParagraphStyleConfig } from 'postext';
import type { CoverConfig, ProductionConfig } from 'postext/production';
import type { GuideLang } from '../defaultResources/lang.js';
import { COLOURS, DISPLAY, GUIDE_COVER_RESOURCE_ID, M_OUTER, PAGE_H, PAGE_W, col, mm, pt } from './guideKit.js';

/** The cover picture's height on the front, mm: as on the book's own
 *  cover page. */
const ART_H = 150;
/** Its width down a vertical edition's front, mm, bleed included: as on
 *  that edition's cover page. */
const VERTICAL_ART_W = 148;

const VERSION_NAMES: Record<GuideLang, [paperback: string, hardcover: string]> = {
  en: ['Paperback', 'Hardcover'],
  es: ['Rústica', 'Cartoné'],
  ca: ['Rústica', 'Cartoné'],
  'pt-BR': ['Brochura', 'Capa dura'],
  fr: ['Broché', 'Relié'],
  de: ['Broschur', 'Hardcover'],
  it: ['Brossura', 'Cartonato'],
  'zh-Hans': ['平装', '精装'],
  ar: ['غلاف ورقي', 'غلاف مقوى'],
  ja: ['並製', '上製'],
};

/** The spine's line in each edition (#1686): the book's name and its
 *  licence, in place of the title and author the metadata would give. The
 *  Chinese and Japanese lines keep their edition's ways: no space between
 *  Han and Latin, and the Japanese one parted by a full-width space. */
const SPINE_LINES: Record<GuideLang, string> = {
  en: 'Postext · Open Source MIT License',
  es: 'Postext · Licencia MIT de código abierto',
  ca: 'Postext · Llicència MIT de codi obert',
  'pt-BR': 'Postext · Licença MIT de código aberto',
  fr: 'Postext · Licence MIT open source',
  de: 'Postext · Open-Source-Lizenz MIT',
  it: 'Postext · Licenza MIT open source',
  'zh-Hans': 'Postext · 开源MIT许可证',
  ar: 'Postext · رخصة MIT مفتوحة المصدر',
  ja: 'Postext　オープンソースMITライセンス',
};

/** The two print versions of the guide: perfect bound and in a flat-spined
 *  case. No ISBN: the guide is not sold. Its spine is under 6 mm, and the
 *  title still reads on it at 5. */
export function guideProduction(lang: GuideLang): ProductionConfig {
  const [paperback, hardcover] = VERSION_NAMES[lang];
  return {
    versions: [
      { id: 'paperback', name: paperback, binding: 'perfect', spineText: { minSpine: 5 } },
      { id: 'hardcover', name: hardcover, binding: 'case-flat' },
    ],
  };
}

/** The cover's design. A horizontal edition has the picture across the
 *  head of the front and the part colours over the back cover's text; a
 *  right-to-left one has its front on the left of the sheet, its fore-edge
 *  bleed on the left. A vertical edition follows its own cover page: the
 *  picture down the front's fore-edge side, the title in the strip by the
 *  spine, the part colours down the back's fore-edge. */
export function guideCover(rtl = false, vertical = false): CoverConfig {
  const hex = (id: keyof typeof COLOURS) => ({ hex: COLOURS[id], model: 'hex' as const });
  type Colour = 'main-color' | 'gilt' | 'teal' | 'vermilion';
  const colours: [string, Colour][] = [['band-foundations', 'main-color'], ['band-craft', 'gilt'], ['band-beyond', 'teal'], ['band-practice', 'vermilion']];
  const varnish = { finishes: [{ id: 'art-varnish', process: 'varnish' as const, sheen: 'gloss' as const, shape: { element: 'art' } }] };
  if (vertical) {
    return {
      background: hex('night'),
      // The blurb's columns stand in the middle of the back, clear of the bands.
      verticalAlign: { back: 'middle' },
      elements: [
        // From the fore-edge bleed (the left: the book is bound on the right).
        { id: 'art', kind: 'image', zone: 'front', x: -3, y: -3, width: VERTICAL_ART_W, height: PAGE_H + 6, resourceId: GUIDE_COVER_RESOURCE_ID, fit: 'cover' },
        ...colours.map(([id, colour], k) => ({ id, kind: 'box' as const, zone: 'back' as const, x: PAGE_W - 12 - 2.5, y: 40 + k * 14, width: 2.5, height: 12, color: hex(colour) })),
      ],
      ...varnish,
    };
  }
  // The back cover's three part colours, as on the book's back page: from
  // the edge the blurb is set against, the right one in a right-to-left book.
  const band = ([id, colour]: [string, Colour], k: number) => ({
    id, kind: 'box' as const, zone: 'back' as const, x: rtl ? PAGE_W - M_OUTER - k * 14 - 12 : M_OUTER + k * 14, y: 30, width: 12, height: 2.5, color: hex(colour),
  });
  return {
    background: hex('night'),
    verticalAlign: { front: 'bottom', back: 'middle' },
    elements: [
      // The picture runs into the bleed at the head and the fore-edge.
      { id: 'art', kind: 'image', zone: 'front', x: rtl ? -3 : 0, y: -3, width: PAGE_W + 3, height: ART_H + 3, resourceId: GUIDE_COVER_RESOURCE_ID, fit: 'cover' },
      ...colours.slice(0, 3).map(band),
    ],
    ...varnish,
  };
}

/** The styles the front and the spine are set in, from the edition's
 *  faces: the title in the brand's display face, as on the cover page.
 *  Only a Latin edition spaces and capitalises the author and the spine:
 *  Arabic letters are never tracked, and a Chinese or Japanese line has no
 *  capitals. */
export function guideCoverStyles(faces: { text: string; sans: string }, align: 'left' | 'right' = 'left', latin = true): ParagraphStyleConfig[] {
  const label = (tracking: number) => (latin ? { letterSpacing: pt(tracking), textTransform: 'uppercase' as const } : {});
  return [
    { id: 'cover-title', name: 'Cover title', fontFamily: DISPLAY, fontSize: pt(66), lineHeight: pt(66), fontWeight: 700, textAlign: align, color: col('white'), hyphenation: false, firstLineIndent: mm(0) },
    { id: 'cover-subtitle', name: 'Cover subtitle', fontFamily: faces.text, fontSize: pt(15), lineHeight: pt(19), italic: true, textAlign: align, color: col('white'), marginTop: pt(10), hyphenation: false, firstLineIndent: mm(0) },
    { id: 'cover-author', name: 'Cover author', fontFamily: faces.sans, fontSize: pt(9), lineHeight: pt(12), fontWeight: 600, textAlign: align, color: col('gilt'), ...label(1.6), marginTop: pt(14), hyphenation: false, firstLineIndent: mm(0) },
    { id: 'cover-blurb', name: 'Back cover', fontFamily: faces.text, fontSize: pt(12), lineHeight: pt(17), textAlign: align, color: col('white'), hyphenation: false, firstLineIndent: mm(0) },
    { id: 'cover-licence', name: 'Back cover licence', fontFamily: faces.sans, fontSize: pt(8), lineHeight: pt(11), fontWeight: 600, textAlign: align, color: col('mist'), ...label(1.2), marginTop: pt(17), hyphenation: false, firstLineIndent: mm(0) },
    { id: 'cover-spine', name: 'Cover spine', fontFamily: faces.sans, fontSize: pt(8), lineHeight: pt(10), fontWeight: 600, textAlign: 'center', color: col('white'), ...label(1.2), hyphenation: false, firstLineIndent: mm(0) },
  ];
}

/** The cover's text of an edition: its spine's line, and the blurb and
 *  the licence line its own back page carries (the `blurb` and `licence`
 *  of its last heading), so the two never drift apart. */
export function guideCoverMarkdown(markdown: string, lang: GuideLang): string {
  const styled = (style: string, text: string) => `:::paragraphs{style="${style}"}\n${text}\n:::\n`;
  const frame = (slot: string, body: string) => `:::frame{slot="${slot}"}\n${body}:::\n`;
  const spine = frame('spine', styled('cover-spine', SPINE_LINES[lang]));
  const last = markdown.lastIndexOf('\n# ');
  if (last < 0) return spine;
  const end = markdown.indexOf('\n', last + 1);
  const heading = markdown.slice(last + 1, end < 0 ? undefined : end);
  const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(heading)?.[1];
  const blurb = attr('blurb');
  if (!blurb) return spine;
  const licence = attr('licence');
  return `${frame('back', `${styled('cover-blurb', blurb)}${licence ? styled('cover-licence', licence) : ''}`)}\n${spine}`;
}
