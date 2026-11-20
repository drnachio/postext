/**
 * A production sheet as a page Postext composes: the page is the sheet's
 * trim with its bleed and its fold marks, and a page template has a frame
 * for each zone (inside its safe area) that the cover's Markdown fills by
 * slot, the spine's turned to read along it, and the ISBN barcode drawn
 * in the back cover's corner by the spine.
 */

import { DEFAULT_SPINE_TEXT } from '../defaults/output/production.js';
import type { PageTemplate } from '../composed/types/templates.js';
import type { FrameConfig } from '../composed/types/frames.js';
import type { DesignElement, DesignImageElement } from '../types/designElements.js';
import type { Dimension, PageConfig } from '../types/page.js';
import type { Resource } from '../types/resources/resources.js';
import type { ProductionVersion } from '../types/output/production.js';
import { isbnBarcodeSvg } from './barcodeSvg.js';
import type { CoverZoneName, ProductionSheet, SheetLine, SheetRect, SheetZone } from './geometry.js';
import { mirrorBleedSvg } from './mirrorBleed.js';
import { needsArt, shapeArt, shapeArtSvg } from './shapes.js';
import { coverElementRect, type CoverDesign } from './coverDesign.js';
import {
  MIRROR_RESOURCE_ID,
  clippedEffectId,
  clippedPictureSvg,
  coverArtId,
  designElements,
  elementDrawing,
  elementPath,
  finishElements,
  onSheet,
  overElements,
  underContentSvg,
  withClip,
  type MirrorPicture,
} from './coverArt.js';

const mm = (value: number): Dimension => ({ value: Math.round(value * 1000) / 1000, unit: 'mm' });

/** The zones a cover's Markdown fills; joints and the endpaper's hinge
 *  take nothing. */
const SLOT_ZONES: ReadonlySet<CoverZoneName> = new Set(['flapBack', 'back', 'spine', 'front', 'flapFront', 'pastedown', 'flyleaf']);

export const BARCODE_RESOURCE_ID = 'isbn-barcode';

export interface CoverPageOptions {
  /** Id of the page template. Default `'cover'`. */
  templateId?: string;
  /** How the spine is lettered (see `DEFAULT_SPINE_TEXT`). */
  spineText?: ProductionVersion['spineText'];
  /** The ISBN as written: its barcode goes in the back cover. */
  isbn?: string;
  isbnAddOn?: string;
  /** Printed as text above the barcode: the whole work's ISBN as the
   *  caller words it (`ISBN obra completa 978-…`), for a volume of a
   *  collection or a work in several volumes. */
  workIsbnCaption?: string;
  /** Barcode size against nominal (0.8 … 2). Default 1. */
  barcodeMagnification?: number;
  design?: CoverDesign;
  /** Where each zone's text sits in it, top to bottom. Default `'top'`;
   *  the spine's text is always centred across it. */
  verticalAlign?: Partial<Record<CoverZoneName, 'top' | 'middle' | 'bottom'>>;
  /** How finishes are drawn: `'screen'` (the default) in their colour on
   *  screen, translucent, to see what they cover; `'press'` as solid
   *  spot-colour plates that overprint, for the PDF. */
  finishes?: 'screen' | 'press';
  /** The book's resources, for the contour and proportions of a picture a
   *  finish takes its shape from. */
  resources?: readonly Resource[];
  /** Mirror bleed: the design is drawn this far past the trim, mm, and
   *  beyond it the background and the movable elements are mirrored out to
   *  the sheet's edge (./mirrorBleed.ts). Unset: no mirroring. */
  mirrorMargin?: number;
  /** The pictures the mirror draws, and the effects cut to an outline,
   *  by resource id: a PNG or JPEG as a data URI and its size in px. A
   *  picture missing here is left out of the mirror, and an effect's is
   *  drawn whole. */
  mirrorPictures?: Readonly<Record<string, MirrorPicture>>;
  /** Text boxes placed by hand, each a frame of its own over the zones'
   *  (whose slots then go unused): a title here, an author there. */
  textBoxes?: readonly CoverTextFrame[];
}

/** A text box of a cover: a frame the Markdown slot `name` fills, on
 *  `rect` (mm on the sheet, from its bleed's corner), its text laid
 *  along it or, with `rotate`, across it and turned a quarter about its
 *  centre (to read up the spine, −90, or down it, 90). */
export interface CoverTextFrame {
  name: string;
  rect: SheetRect;
  rotate?: 90 | -90;
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface CoverPage {
  /** The page: the sheet's trim, no margins, its bleed and fold marks. */
  page: PageConfig;
  template: PageTemplate;
  /** The barcode's resource, when there is an ISBN that reads. */
  resources: Resource[];
  /** The bytes of those resources by `fileId`. */
  files: Record<string, Uint8Array>;
  /** The frames the Markdown can fill, by slot name: the zones' and the
   *  text boxes'. */
  slots: string[];
  /** With a mirror bleed, the part of the sheet the design is drawn on
   *  (the trim and the design margin past it); the rest is mirrored. */
  designed?: SheetRect;
  /** The pictures that kept the mirror bleed from being made (the mirror
   *  draws only PNG and JPEG pictures it was given): the design then runs
   *  to the sheet's edge as it is. */
  mirrorSkipped?: string[];
  /** The pictures of effects cut to an outline that were drawn whole (the
   *  cut draws only PNG and JPEG pictures it was given). */
  clipSkipped?: string[];
}

function frameFor(
  zone: SheetZone,
  sheet: ProductionSheet,
  spineText: Required<NonNullable<ProductionVersion['spineText']>>,
  vertical?: 'top' | 'middle' | 'bottom',
): FrameConfig | undefined {
  const s = zone.safe;
  const at = (x: number, y: number) => ({ anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(x - sheet.trim.x), y: mm(y - sheet.trim.y) } });
  if (zone.name !== 'spine') {
    return {
      name: zone.name,
      width: mm(s.width),
      height: mm(s.height),
      placement: at(s.x, s.y),
      optional: true,
      ...(vertical && vertical !== 'top' ? { verticalAlign: vertical } : {}),
    };
  }
  if (zone.rect.width < spineText.minSpine) return undefined;
  // Laid out along the spine, then turned about its centre to read up
  // (−90°) or down (90°) it.
  const length = s.height;
  const across = s.width;
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  return {
    name: 'spine',
    width: mm(length),
    height: mm(across),
    rotate: spineText.direction === 'bottomToTop' ? -90 : 90,
    verticalAlign: 'middle',
    placement: at(cx - length / 2, cy - across / 2),
    optional: true,
  };
}

/** The page and the template that compose a production sheet (see
 *  `versionSheets`). Spread `page` into the cover's config with the
 *  book's typography, add `template` to its `pageTemplates`, the
 *  resources to its content and the files to the PDF's `resourceBytes`;
 *  then write the cover as `::::page{template="cover"}` with a
 *  `:::frame{slot="…"}` for each zone (see `coverMarkdown`). */
export function coverPage(sheet: ProductionSheet, options: CoverPageOptions = {}): CoverPage {
  const spineText = { ...DEFAULT_SPINE_TEXT, ...options.spineText };
  const frames: FrameConfig[] = [];
  for (const zone of sheet.zones) {
    if (!SLOT_ZONES.has(zone.name)) continue;
    const frame = frameFor(zone, sheet, spineText, options.verticalAlign?.[zone.name]);
    if (frame) frames.push(frame);
  }
  for (const box of options.textBoxes ?? []) {
    const r = box.rect;
    const turned = !!box.rotate;
    // A turned box is laid out with its sides swapped, then turned about
    // its centre into the rectangle it was given.
    const w = turned ? r.height : r.width;
    const h = turned ? r.width : r.height;
    frames.push({
      name: box.name,
      width: mm(w),
      height: mm(h),
      ...(box.rotate ? { rotate: box.rotate } : {}),
      ...(box.verticalAlign && box.verticalAlign !== 'top' ? { verticalAlign: box.verticalAlign } : {}),
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(r.x + r.width / 2 - w / 2 - sheet.trim.x), y: mm(r.y + r.height / 2 - h / 2 - sheet.trim.y) } },
      optional: true,
    });
  }
  // Fold marks inside the trim only: a case's turn-in folds are its trim.
  const folds = sheet.lines
    .map((l) => l.x - sheet.trim.x)
    .filter((x) => x > 0.01 && x < sheet.trim.width - 0.01)
    .map(mm);
  const page: PageConfig = {
    sizePreset: 'custom',
    width: mm(sheet.trim.width),
    height: mm(sheet.trim.height),
    margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) },
    // A screen picture has no bleed and no marks.
    cutLines: sheet.kind === 'promo'
      ? { enabled: false }
      : { enabled: true, bleed: mm(sheet.bleed), ...(folds.length ? { foldMarks: folds } : {}) },
  };
  const template: PageTemplate = {
    id: options.templateId ?? 'cover',
    area: 'trim',
    frames,
    header: false,
    footer: false,
  };
  const resources: Resource[] = [];
  const files: Record<string, Uint8Array> = {};
  // Past the design margin, the background and the movable elements
  // folded out to the sheet's edge, over them and under the text.
  const under = options.mirrorMargin !== undefined && sheet.kind !== 'promo' && options.design
    ? underContentSvg(sheet, options.design, options.mirrorPictures ?? {})
    : undefined;
  // A picture the mirror cannot draw (no data, an SVG) would leave a hole
  // its ground fills: then the design goes to the edge as it is.
  const mirror = under?.content && under.missing.length === 0 ? mirrorBleedSvg(sheet, options.mirrorMargin!, under.content, under.defs) : undefined;
  const mirrorSkipped = under && under.missing.length > 0 && mirrorBleedSvg(sheet, options.mirrorMargin!, 'x') ? [...new Set(under.missing)] : undefined;
  // The boxes and shapes with a gradient or a shadow, each drawn as a
  // picture of its own.
  const art = new Map<string, SheetRect>();
  for (const el of [...(options.design?.elements ?? []), ...(options.design?.effects ?? [])]) {
    if (el.kind === 'image' || !needsArt(el)) continue;
    const rect = coverElementRect(sheet, el);
    const path = rect ? elementPath(el, rect) : undefined;
    if (!rect || !path || rect.width <= 0 || rect.height <= 0) continue;
    const drawn = shapeArt(rect, path, el.color, el, el.opacity ?? 1, `a-${el.id}`);
    const id = coverArtId(el.id);
    const fileId = `${id}.svg`;
    const px = (v: number) => (v / 25.4) * 96;
    resources.push({ id, typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId, width: px(drawn.bounds.width), height: px(drawn.bounds.height) } } as Resource);
    files[fileId] = new TextEncoder().encode(shapeArtSvg(drawn));
    art.set(el.id, drawn.bounds);
  }
  // The pictures cut to an outline (an element's, an effect's), each as a
  // picture of its own.
  const clipped = new Map<string, string>();
  const clipSkipped: string[] = [];
  for (const el of [...(options.design?.elements ?? []), ...(options.design?.effects ?? [])]) {
    if (el.kind !== 'image' || !el.clip || !el.resourceId) continue;
    const rect = coverElementRect(sheet, el);
    const picture = options.mirrorPictures?.[el.resourceId];
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    if (!picture) {
      clipSkipped.push(el.resourceId);
      continue;
    }
    const id = clippedEffectId(el.id);
    const fileId = `${id}.svg`;
    const px = (v: number) => (v / 25.4) * 96;
    resources.push({ id, typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId, width: px(rect.width), height: px(rect.height) } } as Resource);
    files[fileId] = new TextEncoder().encode(clippedPictureSvg(rect, el.clip, picture));
    clipped.set(el.id, id);
  }
  const elements: DesignElement[] = designElements(sheet, options.design, !!mirror, art, clipped);
  if (mirror) {
    const fileId = `${MIRROR_RESOURCE_ID}.svg`;
    const px = (v: number) => (v / 25.4) * 96;
    resources.push({
      id: MIRROR_RESOURCE_ID,
      typeId: 'figure',
      kind: 'svg',
      createdAt: 0,
      updatedAt: 0,
      svg: { fileId, width: px(sheet.width), height: px(sheet.height) },
    } as Resource);
    files[fileId] = new TextEncoder().encode(mirror.svg);
    elements.push({ kind: 'image', id: MIRROR_RESOURCE_ID, resourceId: MIRROR_RESOURCE_ID, decorative: true, fit: 'contain', placement: onSheet({ x: 0, y: 0, width: sheet.width, height: sheet.height }) });
  }
  if (mirror) for (const el of options.design?.elements ?? []) if (el.bleed === 'own') elements.push(...elementDrawing(sheet, withClip(el, clipped), 'cover-el', false, art));
  elements.push(...overElements(sheet, options.design, clipped, art));
  const back = sheet.zones.find((z) => z.name === 'back');
  const barcode = options.isbn && back
    ? isbnBarcodeSvg(options.isbn, { addOn: options.isbnAddOn, magnification: options.barcodeMagnification })
    : undefined;
  if (barcode && back) {
    const fileId = `${BARCODE_RESOURCE_ID}.svg`;
    const px = (v: number) => (v / 25.4) * 96;
    resources.push({
      id: BARCODE_RESOURCE_ID,
      typeId: 'figure',
      kind: 'svg',
      altText: `ISBN ${options.isbn}`,
      createdAt: 0,
      updatedAt: 0,
      svg: { fileId, width: px(barcode.width), height: px(barcode.height) },
    } as Resource);
    files[fileId] = new TextEncoder().encode(barcode.svg);
    // In the back cover's corner by the spine and the foot (Spanish ISBN
    // agency, BISG), inside its safe area.
    const s = back.safe;
    // Over the text, the effects and the logos: nothing hides it.
    const element: DesignImageElement = {
      kind: 'image',
      id: BARCODE_RESOURCE_ID,
      resourceId: BARCODE_RESOURCE_ID,
      over: true,
      placement: {
        anchor: { to: 'page', edge: 'top-left' },
        offset: { x: mm(s.x + s.width - barcode.width - sheet.trim.x), y: mm(s.y + s.height - barcode.height - sheet.trim.y) },
        size: { width: mm(barcode.width), height: mm(barcode.height) },
      },
    };
    elements.push(element);
    // The whole work's ISBN, as text over the barcode, as wide as it.
    if (options.workIsbnCaption) {
      const height = 3.5;
      elements.push({
        kind: 'text',
        id: 'isbn-work',
        over: true,
        content: options.workIsbnCaption.replace(/\{/g, '{{').replace(/\}/g, '}}'),
        fontSize: { value: 6.5, unit: 'pt' },
        color: { hex: '#000000', model: 'hex' },
        align: 'center',
        verticalAlign: 'bottom',
        placement: {
          anchor: { to: 'page', edge: 'top-left' },
          offset: { x: mm(s.x + s.width - barcode.width - sheet.trim.x), y: mm(s.y + s.height - barcode.height - height - sheet.trim.y) },
          size: { width: mm(barcode.width), height: mm(height) },
        },
      } as DesignElement);
    }
  }
  elements.push(...finishElements(sheet, options.design, options.finishes ?? 'screen', options.resources ?? []));
  if (elements.length > 0) template.decoration = { elements };
  return {
    page,
    template,
    resources,
    files,
    slots: frames.map((f) => f.name as string),
    ...(mirror ? { designed: mirror.designed } : {}),
    ...(mirrorSkipped ? { mirrorSkipped } : {}),
    ...(clipSkipped.length > 0 ? { clipSkipped: [...new Set(clipSkipped)] } : {}),
  };
}

/** The Markdown of a cover: the page fence with a frame for each slot that
 *  has text, in the order of `slots`. */
export function coverMarkdown(templateId: string, content: Partial<Record<string, string>>, slots: readonly string[]): string {
  const parts = [`::::page{template="${templateId}"}`];
  for (const slot of slots) {
    const text = content[slot]?.trim();
    if (text) parts.push(`:::frame{slot="${slot}"}`, text, ':::');
  }
  parts.push('::::');
  return parts.join('\n\n');
}

/** A guide across a sheet for whoever finishes it by hand: a fold, score,
 *  joint or glue line, the edge of a zone, or the edge of a zone's safe
 *  area. `at` is mm from the left (vertical) or top (horizontal) edge of
 *  the trim, as the cover page stands. */
export interface SheetGuide {
  orientation: 'vertical' | 'horizontal';
  at: number;
  kind: SheetLine['kind'] | 'zone' | 'safe';
}

/** The guides of a sheet, each place once (a line before the zone edge it
 *  falls on, a zone edge before a safe edge), none on the trim's edges. */
export function sheetGuides(sheet: ProductionSheet): SheetGuide[] {
  const eps = 0.01;
  const t = sheet.trim;
  const out: SheetGuide[] = [];
  const add = (orientation: SheetGuide['orientation'], sheetAt: number, kind: SheetGuide['kind']) => {
    const at = sheetAt - (orientation === 'vertical' ? t.x : t.y);
    const edge = orientation === 'vertical' ? t.width : t.height;
    if (at <= eps || at >= edge - eps) return;
    if (out.some((g) => g.orientation === orientation && Math.abs(g.at - at) < eps)) return;
    out.push({ orientation, at: Math.round(at * 1000) / 1000, kind });
  };
  for (const l of sheet.lines) add('vertical', l.x, l.kind);
  for (const z of sheet.zones) {
    add('vertical', z.rect.x, 'zone');
    add('vertical', z.rect.x + z.rect.width, 'zone');
  }
  for (const z of sheet.zones) {
    add('vertical', z.safe.x, 'safe');
    add('vertical', z.safe.x + z.safe.width, 'safe');
    add('horizontal', z.safe.y, 'safe');
    add('horizontal', z.safe.y + z.safe.height, 'safe');
  }
  return out;
}
