import type {
  AnchorEdge,
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
import type { GuideLang } from '../defaultResources/lang';

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
export type PaletteId = keyof typeof COLOURS;

export const PALETTE_NAMES: Record<GuideLang, Record<PaletteId, string>> = {
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
  ca: {
    ink: 'Tinta', night: 'Nit de coberta', paper: 'Paper', white: 'Blanc', band: 'Color de part', gilt: 'Or',
    'main-color': 'Blau Postext', vermilion: 'Vermelló', muted: 'Gris de notes', mist: 'Boira', rule: 'Filets',
    tint: 'Fons càlid', panel: 'Fons fred',
  },
  ar: {
    ink: 'الحبر', night: 'ليل الغلاف', paper: 'الورق', white: 'الأبيض', band: 'لون الجزء', gilt: 'الذهبي',
    'main-color': 'أزرق Postext', vermilion: 'الزنجفري', muted: 'رمادي الحواشي', mist: 'الضباب', rule: 'الخطوط',
    tint: 'خلفية دافئة', panel: 'خلفية باردة',
  },
  ja: {
    ink: '墨', night: '表紙の夜色', paper: '紙', white: '白', band: '部の色', gilt: '金',
    'main-color': 'Postextの青', vermilion: '朱', muted: '注記の灰色', mist: '霧の灰色', rule: '罫',
    tint: '暖色の地', panel: '寒色の地',
  },
  'pt-BR': {
    ink: 'Tinta', night: 'Noite da capa', paper: 'Papel', white: 'Branco', band: 'Cor da parte', gilt: 'Ouro',
    'main-color': 'Azul Postext', vermilion: 'Vermelhão', muted: 'Cinza das notas', mist: 'Névoa', rule: 'Fios',
    tint: 'Fundo quente', panel: 'Fundo frio',
  },
};

/** Part colours, as `:::part{palette="band=#…"}` in the guide's markdown. */
export const GUIDE_PART_COLOURS = { foundations: '#2b4acb', craft: '#b7820f', practice: '#c0452f' } as const;

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
