import type {
  AnchorEdge,
  CodeStyleConfig,
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
  FolioConfig,
  PageParity,
  PageRoleFilter,
} from 'postext';
import type { GuideLang } from '../defaultResources/lang.js';

// What every edition of the built-in Postext guide shares: the page, the
// Postext palette, the part colours and the small builders its designs are
// written with. The Latin editions are designed in `guideConfig.ts`, the
// Chinese one, set vertically, in `guideConfigZh.ts`, the Japanese one, set
// vertically too, in `guideConfigJa.ts` (the designs the two vertical books
// share are in `guideVerticalKit.ts`), the Arabic one, set right to left
// and bound on the right, in `guideConfigAr.ts`.

export const PAGE_W = 210;
export const PAGE_H = 280;
export const M_TOP = 24;
export const M_BOTTOM = 22;
export const M_INNER = 20;
export const M_OUTER = 20;
export const TEXT_W = PAGE_W - M_INNER - M_OUTER;

export const DISPLAY = 'Fraunces';
export const TEXT = 'Lora';
export const SANS = 'Geist';
/** Section headings (levels 2 and 3), in the part colour. */
export const HEAD = 'Bricolage Grotesque';

export const COLOURS = {
  ink: '#15171c',
  night: '#0e1014',
  paper: '#ffffff',
  white: '#ffffff',
  // The part colour: gilt by default, blue / gilt / teal / vermilion per part.
  band: '#8f6408',
  gilt: '#d8a21a',
  'main-color': '#2b4acb',
  vermilion: '#c0452f',
  teal: '#1f7a6d',
  muted: '#6c7079',
  mist: '#b9bcc4',
  rule: '#d9d5cc',
  tint: '#f7f1e3',
  panel: '#f1f3f8',
} as const;
export type PaletteId = keyof typeof COLOURS;

export const PALETTE_NAMES: Record<GuideLang, Record<PaletteId, string>> = {
  en: {
    ink: 'Ink', night: 'Cover night', paper: 'Paper', white: 'White', band: 'Part colour', gilt: 'Gilt',
    'main-color': 'Postext blue', vermilion: 'Vermilion', teal: 'Teal', muted: 'Muted grey', mist: 'Mist', rule: 'Rules',
    tint: 'Warm tint', panel: 'Cool panel',
  },
  es: {
    ink: 'Tinta', night: 'Noche de cubierta', paper: 'Papel', white: 'Blanco', band: 'Color de parte', gilt: 'Oro',
    'main-color': 'Azul Postext', vermilion: 'Bermellón', teal: 'Verde azulado', muted: 'Gris de notas', mist: 'Bruma', rule: 'Filetes',
    tint: 'Fondo cálido', panel: 'Fondo frío',
  },
  'zh-Hans': {
    ink: '墨色', night: '封面夜色', paper: '纸色', white: '白色', band: '篇色', gilt: '金色',
    'main-color': 'Postext蓝', vermilion: '朱红', teal: '青绿', muted: '注释灰', mist: '雾灰', rule: '线条',
    tint: '暖色底', panel: '冷色底',
  },
  ca: {
    ink: 'Tinta', night: 'Nit de coberta', paper: 'Paper', white: 'Blanc', band: 'Color de part', gilt: 'Or',
    'main-color': 'Blau Postext', vermilion: 'Vermelló', teal: 'Verd blavós', muted: 'Gris de notes', mist: 'Boira', rule: 'Filets',
    tint: 'Fons càlid', panel: 'Fons fred',
  },
  ar: {
    ink: 'الحبر', night: 'ليل الغلاف', paper: 'الورق', white: 'الأبيض', band: 'لون الجزء', gilt: 'الذهبي',
    'main-color': 'أزرق Postext', vermilion: 'الزنجفري', teal: 'الأزرق المخضر', muted: 'رمادي الحواشي', mist: 'الضباب', rule: 'الخطوط',
    tint: 'خلفية دافئة', panel: 'خلفية باردة',
  },
  ja: {
    ink: '墨', night: '表紙の夜色', paper: '紙', white: '白', band: '部の色', gilt: '金',
    'main-color': 'Postextの青', vermilion: '朱', teal: '青緑', muted: '注記の灰色', mist: '霧の灰色', rule: '罫',
    tint: '暖色の地', panel: '寒色の地',
  },
  'pt-BR': {
    ink: 'Tinta', night: 'Noite da capa', paper: 'Papel', white: 'Branco', band: 'Cor da parte', gilt: 'Ouro',
    'main-color': 'Azul Postext', vermilion: 'Vermelhão', teal: 'Verde-azulado', muted: 'Cinza das notas', mist: 'Névoa', rule: 'Fios',
    tint: 'Fundo quente', panel: 'Fundo frio',
  },
  fr: {
    ink: 'Encre', night: 'Nuit de couverture', paper: 'Papier', white: 'Blanc', band: 'Couleur de partie', gilt: 'Or',
    'main-color': 'Bleu Postext', vermilion: 'Vermillon', teal: 'Bleu canard', muted: 'Gris des notes', mist: 'Brume', rule: 'Filets',
    tint: 'Fond chaud', panel: 'Fond froid',
  },
  de: {
    ink: 'Tinte', night: 'Umschlagnacht', paper: 'Papier', white: 'Weiß', band: 'Teilfarbe', gilt: 'Gold',
    'main-color': 'Postext-Blau', vermilion: 'Zinnoberrot', teal: 'Petrol', muted: 'Notizgrau', mist: 'Nebel', rule: 'Linien',
    tint: 'Warmer Grund', panel: 'Kühler Grund',
  },
  it: {
    ink: 'Inchiostro', night: 'Notte di copertina', paper: 'Carta', white: 'Bianco', band: 'Colore di parte', gilt: 'Oro',
    'main-color': 'Blu Postext', vermilion: 'Vermiglione', teal: 'Verde petrolio', muted: 'Grigio delle note', mist: 'Foschia', rule: 'Filetti',
    tint: 'Fondo caldo', panel: 'Fondo freddo',
  },
};

/** Part colours, as `:::part{palette="band=#…"}` in the guide's markdown. */
export const GUIDE_PART_COLOURS = { foundations: '#2b4acb', craft: '#8f6408', beyond: '#1f7a6d', practice: '#c0452f' } as const;

/** Resource id of the cover artwork (see `defaultResources`). */
export const GUIDE_COVER_RESOURCE_ID = 'guide-cover';

/** How the Folio viewer shows the guide: a stapled booklet (its cover a
 *  sheet a little heavier than the pages) on thick gloss coated paper, on a
 *  blue felt mat in studio light, seen from low over its foot and a little
 *  to its left. */
export const GUIDE_FOLIO: FolioConfig = {
  tilt: 44,
  yaw: -14,
  paper: { type: 'coatedGloss', grammage: 170 },
  binding: { type: 'saddleStitch', cover: 'pages' },
  surface: { type: 'felt', color: { hex: '#3a4a86', model: 'hex' } },
  lighting: { environment: 'studio' },
};

export const mm = (value: number): Dimension => ({ value, unit: 'mm' });
export const pt = (value: number): Dimension => ({ value, unit: 'pt' });
export const em = (value: number): Dimension => ({ value, unit: 'em' });
export const col = (id: PaletteId): ColorValue => ({ hex: COLOURS[id], model: 'hex', paletteId: id });
export const at = (to: ElementAnchor['to'], edge: AnchorEdge): ElementAnchor => ({ to, edge });

/** The face of the Postext syntax the guide quotes (`:::callout`,
 *  `cjk.lineBreak`, `buildDocument(…)`): Geist Mono, the brand's sans in
 *  its monospaced cut. */
export const CODE = 'Geist Mono';

/** Inline code in every edition (#845): the syntax set apart from the
 *  sentence in the code face, on a pale fill outlined by a hairline, so it
 *  reads as code on the page, on the warm tint of the "Try it" boxes and on
 *  the cool panel of the notes. The fill and the outline are fixed colours,
 *  not the part colour, which references already wear. */
export function guideCodeStyle(): CodeStyleConfig {
  return {
    fontFamily: CODE,
    inline: {
      fontSize: em(0.84),
      color: col('ink'),
      background: { hex: '#ecebe6', model: 'hex' },
      borderColor: { hex: '#d3d0c7', model: 'hex' },
      borderWidth: pt(0.3),
      borderRadius: em(0.25),
      paddingX: em(0.25),
      paddingY: em(0.12),
    },
  };
}

export interface Common {
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

export interface TextOpts extends Common {
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
  /** Base direction, when it is not the document's (a Latin address on an
   *  Arabic page). */
  direction?: DesignTextElement['direction'];
}
export function text(id: string, content: string, o: TextOpts): DesignTextElement {
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
    ...(o.direction ? { direction: o.direction } : {}),
  };
}
export function box(id: string, fill: PaletteId, o: Common & { width?: number; height?: number }): DesignBoxElement {
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
/** A chapter opener's band in the part colour, bled off the head, and the
 *  ink foot under it (#1293). The band reaches `band` mm below the bleed's
 *  top at least and, past it, `pad` mm below the foot of `below` (the
 *  lead, under the title), so a title or a lead longer than usual stays on
 *  the band; the foot, and the text under the opener, follow it, with the
 *  room under the foot the openers' `minHeight` leaves at the band's least
 *  (6 mm past it, less the 3 mm the band runs above the type area's top
 *  and the 1.6 mm foot), so an opener of the usual length is unchanged. */
export function openerBand(band: number, below: string, pad: number): DesignBoxElement[] {
  const gap = 6 - 3 - 1.6;
  const el = (id: string, fill: PaletteId | undefined, anchor: ElementAnchor, size: ElementPlacement['size']): DesignBoxElement => ({
    kind: 'box', id, placement: placement({ anchor }, size), style: fill ? { backgroundColor: col(fill), borderRadius: mm(0) } : {},
  });
  return [
    el(`${below}Pad`, undefined, at(`#${below}`, 'below'), { width: mm(0), height: mm(pad) }),
    el('openerBand', 'band', at('bleed', 'top-left'), { width: 'fill', height: { to: `#${below}Pad`, edge: 'bottom' }, minHeight: mm(band) }),
    el('openerFoot', 'ink', at('#openerBand', 'below'), { width: { to: 'bleed', edge: 'right' }, height: mm(1.6) }),
    el('openerFootPad', undefined, at('#openerFoot', 'below'), { width: mm(0), height: mm(gap) }),
  ];
}

export function rule(id: string, color: PaletteId, o: Common & { width: number; thickness: number }): DesignRuleElement {
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
export function image(id: string, resourceId: string, o: Common & { width: number; height: number }): DesignImageElement {
  return { kind: 'image', id, ...filters(o), placement: placement(o, { width: mm(o.width), height: mm(o.height) }), resourceId };
}
export const slot = (...elements: DesignElement[]): DesignSlot => ({ elements });

/** The palette as the configuration lists it, named in the edition's language. */
export function colorPalette(lang: GuideLang) {
  const names = PALETTE_NAMES[lang];
  return (Object.keys(COLOURS) as PaletteId[]).map((id) => ({ id, name: names[id], value: { hex: COLOURS[id], model: 'hex' as const } }));
}
