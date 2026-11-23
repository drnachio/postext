/**
 * A production sheet as a page Postext composes (#1667): the page is the
 * sheet's trim with its bleed and its fold marks, and a page template has
 * a frame for each zone (inside its safe area) that the cover's Markdown
 * fills by slot, the spine's turned to read along it, the design drawn as
 * the template's decoration, and the ISBN barcode in the back cover's
 * corner by the spine.
 */

import { DEFAULT_SPINE_TEXT } from '../defaults/output/production.js';
import type { PageTemplate } from '../composed/types/templates.js';
import type { FrameConfig } from '../composed/types/frames.js';
import type { DesignElement, DesignImageElement } from '../types/designElements.js';
import type { Dimension, PageConfig } from '../types/page.js';
import type { Resource } from '../types/resources/resources.js';
import type { ProductionVersion } from '../types/output/production.js';
import type { CoverConfig } from '../types/output/cover.js';
import { coverTextBoxFrame, keptCoverTextBoxes, mirrorFrame, resolveCoverTextBoxes, type CoverTextBoxIssue } from './coverTextBoxes.js';
import { isbnBarcodeSvg } from './barcodeSvg.js';
import type { CoverZoneName, ProductionSheet, SheetLine, SheetRect, SheetZone } from './geometry.js';
import { mirrorBleedSvg } from './mirrorBleed.js';
import { needsArt, shapeArt, shapeArtSvg } from './shapes.js';
import { coverElementRect } from './coverDesign.js';
import { finite } from './svgSafe.js';
import {
  COVER_ID_PREFIX,
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

export type { MirrorPicture } from './coverArt.js';
export { COVER_ID_PREFIX } from './coverArt.js';

const mm = (value: number): Dimension => ({ value: Math.round(finite(value) * 1000) / 1000, unit: 'mm' });
const px = (v: number) => (v / 25.4) * 96;

/** The zones a cover's Markdown fills; joints and the endpaper's hinge
 *  take nothing. */
export const COVER_SLOT_ZONES: readonly CoverZoneName[] = ['flapBack', 'back', 'spine', 'front', 'flapFront', 'pastedown', 'flyleaf'];
const SLOT_ZONES: ReadonlySet<string> = new Set(COVER_SLOT_ZONES);

/** The id of the cover's page template. */
export const COVER_TEMPLATE_ID = COVER_ID_PREFIX;
export const BARCODE_RESOURCE_ID = `${COVER_ID_PREFIX}-isbn`;

export interface CoverPageOptions {
  /** The cover's design (`PostextConfig.cover`). */
  cover?: CoverConfig;
  /** How the spine is lettered (see `DEFAULT_SPINE_TEXT`). */
  spineText?: ProductionVersion['spineText'];
  /** The ISBN as written: its barcode goes in the back cover. */
  isbn?: string;
  isbnAddOn?: string;
  /** Printed as text above the barcode: the whole work's ISBN as the
   *  caller words it (`ISBN obra completa 978-…`). */
  workIsbnCaption?: string;
  /** The book's resources, for the contour and proportions of a picture a
   *  finish takes its shape from. */
  resources?: readonly Resource[];
  /** The pictures the mirror bleed draws, and the effects cut to an
   *  outline, by resource id: a PNG or JPEG as a data URI and its size in
   *  px. A picture missing here is left out of the mirror, and an
   *  effect's is drawn whole. */
  mirrorPictures?: Readonly<Record<string, MirrorPicture>>;
  /** The page is laid out right to left (a horizontal book whose
   *  `direction` is rtl): its flow is painted mirrored, so the frames are
   *  placed mirrored to land on their zones. */
  mirrored?: boolean;
  /** The book is set in vertical lines: the sheet stays a horizontal page,
   *  and the zones' frames are set vertical, the spine's down the spine
   *  without a turn. */
  vertical?: boolean;
}

/** Something a cover could not do as its design asks. */
export type CoverIssue =
  /** A text box whose name is not letters, digits, `-` and `_`, is a
   *  zone's, or is another box's: left out. */
  | { kind: 'coverTextBoxName'; name: string }
  /** A text box's anchor or continuation the cover cannot follow (#1679). */
  | CoverTextBoxIssue
  /** The mirror bleed needs pictures it was not given as PNG or JPEG data:
   *  the design runs to the sheet's edge as it is. */
  | { kind: 'coverMirrorSkipped'; resources: string[] }
  /** The mirror bleed reached its most bands before the sheet's edge. */
  | { kind: 'coverMirrorCapped' }
  /** Pictures cut to an outline drawn whole: their data was not given. */
  | { kind: 'coverClipSkipped'; resources: string[] }
  /** A barcode asked smaller than 80 % of nominal, set at 80 %. */
  | { kind: 'coverBarcodeSize'; asked: number }
  /** An ISBN that does not read: no barcode. */
  | { kind: 'coverIsbnInvalid'; isbn: string };

export interface CoverPage {
  /** The page: the sheet's trim, no margins, its bleed and fold marks. */
  page: PageConfig;
  template: PageTemplate;
  /** The barcode's resource and the pictures the cover makes of itself. */
  resources: Resource[];
  /** The bytes of those resources by `fileId`. */
  files: Record<string, Uint8Array>;
  /** The frames the Markdown can fill, by slot name: the zones' and the
   *  text boxes'. */
  slots: string[];
  /** With a mirror bleed, the part of the sheet the design is drawn on. */
  designed?: SheetRect;
  issues: CoverIssue[];
}

function frameFor(
  zone: SheetZone,
  sheet: ProductionSheet,
  spineText: Required<NonNullable<ProductionVersion['spineText']>>,
  vertical?: 'top' | 'middle' | 'bottom',
  verticalLines = false,
): FrameConfig | undefined {
  const s = zone.safe;
  const at = (x: number, y: number) => ({ anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(x - sheet.trim.x), y: mm(y - sheet.trim.y) } });
  const mode = verticalLines ? { writingMode: 'vertical-rl' as const } : {};
  if (zone.name !== 'spine') {
    return {
      name: zone.name,
      width: mm(s.width),
      height: mm(s.height),
      placement: at(s.x, s.y),
      optional: true,
      ...mode,
      ...(vertical === 'middle' || vertical === 'bottom' ? { verticalAlign: vertical } : {}),
    };
  }
  if (zone.rect.width < spineText.minSpine) return undefined;
  // A vertical book's spine reads down it as its lines do.
  if (verticalLines) return { name: 'spine', width: mm(s.width), height: mm(s.height), placement: at(s.x, s.y), optional: true, ...mode };
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

/** A resource of a picture the cover makes of itself: an SVG of `w` × `h`
 *  mm, decorative. */
function svgResource(id: string, w: number, h: number, extra: Partial<Resource> = {}): Resource {
  return { id, typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: px(w), height: px(h) }, ...extra } as Resource;
}

/** The page and the template that compose a production sheet (see
 *  `versionSheets`). `buildCover` puts them together with the book; a host
 *  may also spread `page` into a config of its own, add `template` to its
 *  `pageTemplates`, the resources to its content and the files to the
 *  PDF's `resourceBytes`, and write the cover as
 *  `::::page{template="postext-cover"}` with a `:::frame{slot="…"}` for
 *  each zone. */
export function coverPage(sheet: ProductionSheet, options: CoverPageOptions = {}): CoverPage {
  const cover = options.cover;
  const issues: CoverIssue[] = [];
  const spineText = { ...DEFAULT_SPINE_TEXT, ...options.spineText };
  const frames: FrameConfig[] = [];
  for (const zone of sheet.zones) {
    if (!SLOT_ZONES.has(zone.name)) continue;
    const frame = frameFor(zone, sheet, spineText, cover?.verticalAlign?.[zone.name], options.vertical);
    if (frame) frames.push(frame);
  }
  const { boxes, dropped } = keptCoverTextBoxes(cover?.textBoxes, COVER_SLOT_ZONES);
  for (const name of dropped) issues.push({ kind: 'coverTextBoxName', name });
  const resolved = resolveCoverTextBoxes(sheet, boxes);
  issues.push(...resolved.issues);
  const byName = new Map(boxes.map((b) => [b.name, b]));
  for (const box of boxes) frames.push(coverTextBoxFrame(box, sheet, resolved, byName));
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
  const template: PageTemplate = { id: COVER_TEMPLATE_ID, area: 'trim', frames: options.mirrored ? frames.map(mirrorFrame) : frames, header: false, footer: false };
  const resources: Resource[] = [];
  const files: Record<string, Uint8Array> = {};
  const addSvg = (resource: Resource, svg: string) => {
    resources.push(resource);
    files[resource.svg!.fileId] = new TextEncoder().encode(svg);
  };
  // Past the design margin, the background and the movable elements
  // folded out to the sheet's edge, over them and under the text.
  const margin = cover?.mirrorMargin;
  const under = typeof margin === 'number' && sheet.kind !== 'promo' && cover
    ? underContentSvg(sheet, cover, options.mirrorPictures ?? {})
    : undefined;
  // A picture the mirror cannot draw would leave a hole its ground fills:
  // then the design goes to the edge as it is.
  const mirror = under?.content && under.missing.length === 0 ? mirrorBleedSvg(sheet, margin!, under.content, under.defs) : undefined;
  if (under && under.missing.length > 0 && mirrorBleedSvg(sheet, margin!, 'x')) issues.push({ kind: 'coverMirrorSkipped', resources: [...new Set(under.missing)] });
  if (mirror?.capped) issues.push({ kind: 'coverMirrorCapped' });
  // The boxes and shapes with a gradient or a shadow, each drawn as a
  // picture of its own.
  const art = new Map<string, SheetRect>();
  for (const el of [...(cover?.elements ?? []), ...(cover?.effects ?? [])]) {
    if (el.kind === 'image' || !needsArt(el)) continue;
    const rect = coverElementRect(sheet, el);
    const path = rect ? elementPath(el, rect) : undefined;
    if (!rect || !path || rect.width <= 0 || rect.height <= 0) continue;
    const drawn = shapeArt(rect, path, el.color, el, el.opacity ?? 1, `a-${el.id}`);
    addSvg(svgResource(coverArtId(el.id), drawn.bounds.width, drawn.bounds.height), shapeArtSvg(drawn));
    art.set(el.id, drawn.bounds);
  }
  // The pictures cut to an outline (an element's, an effect's), each as a
  // picture of its own.
  const clipped = new Map<string, string>();
  const clipSkipped = new Set<string>();
  for (const el of [...(cover?.elements ?? []), ...(cover?.effects ?? [])]) {
    if (el.kind !== 'image' || !el.clip || !el.resourceId) continue;
    const rect = coverElementRect(sheet, el);
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const picture = options.mirrorPictures?.[el.resourceId];
    const svg = picture ? clippedPictureSvg(rect, el.clip, picture) : undefined;
    if (!svg) {
      clipSkipped.add(el.resourceId);
      continue;
    }
    const id = clippedEffectId(el.id);
    addSvg(svgResource(id, rect.width, rect.height), svg);
    clipped.set(el.id, id);
  }
  if (clipSkipped.size > 0) issues.push({ kind: 'coverClipSkipped', resources: [...clipSkipped] });
  const elements: DesignElement[] = designElements(sheet, cover, !!mirror, art, clipped);
  if (mirror) {
    addSvg(svgResource(MIRROR_RESOURCE_ID, sheet.width, sheet.height), mirror.svg);
    elements.push({ kind: 'image', id: 'cover-mirror', resourceId: MIRROR_RESOURCE_ID, decorative: true, fit: 'contain', placement: onSheet({ x: 0, y: 0, width: sheet.width, height: sheet.height }) });
    for (const el of cover?.elements ?? []) if (el.bleed === 'own') elements.push(...elementDrawing(sheet, withClip(el, clipped), 'cover-el', false, art));
  }
  elements.push(...overElements(sheet, cover, clipped, art));
  elements.push(...barcodeElements(sheet, options, addSvg, issues));
  elements.push(...finishElements(sheet, cover, options.resources ?? []));
  if (elements.length > 0) template.decoration = { elements };
  return {
    page,
    template,
    resources,
    files,
    slots: frames.map((f) => f.name as string),
    ...(mirror ? { designed: mirror.designed } : {}),
    issues,
  };
}

/** The ISBN barcode in the back cover's corner by the spine and the foot
 *  (Spanish ISBN agency, BISG), inside its safe area, over the text, the
 *  effects and the logos; the whole work's ISBN as text above it. */
function barcodeElements(sheet: ProductionSheet, options: CoverPageOptions, addSvg: (r: Resource, svg: string) => void, issues: CoverIssue[]): DesignElement[] {
  const back = sheet.zones.find((z) => z.name === 'back');
  if (!options.isbn || !back) return [];
  const asked = finite(options.cover?.barcodeMagnification, 1);
  if (asked < 0.8) issues.push({ kind: 'coverBarcodeSize', asked });
  const barcode = isbnBarcodeSvg(options.isbn, { addOn: options.isbnAddOn, magnification: asked });
  if (!barcode) {
    issues.push({ kind: 'coverIsbnInvalid', isbn: options.isbn });
    return [];
  }
  addSvg(svgResource(BARCODE_RESOURCE_ID, barcode.width, barcode.height, { altText: `ISBN ${options.isbn}` }), barcode.svg);
  const s = back.safe;
  const x = s.x + s.width - barcode.width - sheet.trim.x;
  const y = s.y + s.height - barcode.height - sheet.trim.y;
  // Decorative: the digits under the bars are the ISBN a reader reads.
  const element: DesignImageElement = {
    kind: 'image',
    id: 'cover-isbn',
    resourceId: BARCODE_RESOURCE_ID,
    decorative: true,
    over: true,
    placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) }, size: { width: mm(barcode.width), height: mm(barcode.height) } },
  };
  const out: DesignElement[] = [element];
  if (options.workIsbnCaption) {
    const height = 3.5;
    out.push({
      kind: 'text',
      id: 'cover-isbn-work',
      over: true,
      // Literal text: a brace would read as a field.
      content: options.workIsbnCaption.replace(/\{/g, '{{').replace(/\}/g, '}}'),
      fontSize: { value: 6.5, unit: 'pt' },
      color: { hex: '#000000', model: 'hex' },
      align: 'center',
      verticalAlign: 'bottom',
      placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y - height) }, size: { width: mm(barcode.width), height: mm(height) } },
    } as DesignElement);
  }
  return out;
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
