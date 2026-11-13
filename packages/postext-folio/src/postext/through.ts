// What a die-cut page shows through its holes, for the WebGL book (#1569):
// the pages beneath, as deep as the holes line up (`seeThrough`), drawn into
// one picture at half the page painting's size, with the depth of the layer
// each texel shows (in leaves) in its alpha. The book's shader walks that
// depth along the view ray: each layer shifts by its own parallax and the
// cut walls show where the ray meets paper. `composeThrough` bakes its
// shadows and walls into a flat picture, right for a flat viewer; here the
// walls and shadows are the shader's, so the layers are drawn bare.
import { resolveFolioConfig, seeThrough, traceDiePaths, type SeeThroughLayer, type VDTDocument } from 'postext';
import type { FaceThroughData } from '../pageFlip/through.js';

/** The deepest a tunnel is followed: past this the pages beneath are too
 *  far down (and too dark) to tell apart. */
export const MAX_THROUGH_DEPTH = 32;

const layersCache = new WeakMap<VDTDocument, Map<number, SeeThroughLayer[]>>();

/** The layers page `i` shows through its holes (none for a page without
 *  any), once per document. */
export function throughLayers(doc: VDTDocument, i: number): SeeThroughLayer[] {
  let byPage = layersCache.get(doc);
  if (!byPage) layersCache.set(doc, (byPage = new Map()));
  let layers = byPage.get(i);
  if (!layers) {
    layers = doc.pages[i]?.dieCut?.holes.length ? seeThrough(doc, i, MAX_THROUGH_DEPTH) : [];
    byPage.set(i, layers);
  }
  return layers;
}

/** The pages seen through page `i`'s holes (the board past the book's end
 *  left out). */
export function pagesThrough(doc: VDTDocument, i: number): number[] {
  return throughLayers(doc, i).map((l) => l.pageIndex).filter((j) => j >= 0);
}

/** Whether page `i`'s painting has transparent parts: holes, or paper cut
 *  away past its leaf's outline. */
export function isCut(doc: VDTDocument, i: number): boolean {
  const cut = doc.pages[i]?.dieCut;
  return !!cut && (cut.holes.length > 0 || !!cut.outline);
}

/** The window of pages to paint: `around` (the pages in reach of the open
 *  spread), and the pages their holes show that are not among them (`deep`,
 *  painted smaller: they are seen only through a hole). */
export function withPagesThrough(doc: VDTDocument, around: Iterable<number>): { keep: Set<number>; deep: Set<number> } {
  const keep = new Set(around);
  const deep = new Set<number>();
  for (const i of [...keep]) {
    for (const j of pagesThrough(doc, i)) {
      if (keep.has(j)) continue;
      keep.add(j);
      deep.add(j);
    }
  }
  return { keep, deep };
}

/**
 * The through picture of page `i` (see the module comment), `width` px
 * wide, from the paintings of the pages beneath (trimmed, as Folio paints
 * them; `canvasOf` gives none for a page not painted yet: its paper is
 * drawn). RGB the layer seen straight down, A its depth: 0 off the holes,
 * k for the k-th layer beneath (the board past the book's end included).
 * Undefined for a page without holes or where no canvas can be read.
 */
export function paintThrough(doc: VDTDocument, i: number, width: number, canvasOf: (j: number) => CanvasImageSource | null | undefined): FaceThroughData | undefined {
  const page = doc.pages[i];
  const layers = throughLayers(doc, i);
  if (!page || layers.length === 0) return undefined;
  const inset = Math.max(0, doc.trimOffset);
  const trimW = page.width - 2 * inset;
  const trimH = page.height - 2 * inset;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round((w * trimH) / trimW));
  const scale = w / trimW;
  const colour = document.createElement("canvas");
  const depth = document.createElement("canvas");
  colour.width = depth.width = w;
  colour.height = depth.height = h;
  const silhouette = document.createElement("canvas");
  silhouette.width = w;
  silhouette.height = h;
  const c = colour.getContext("2d");
  const d = depth.getContext("2d");
  const s = silhouette.getContext("2d");
  if (!c || !d || !s) return undefined;
  const board = resolveFolioConfig(doc.config.folio).binding.coverColor.hex;
  for (const ctx of [c, d, s]) ctx.setTransform(scale, 0, 0, scale, -inset * scale, -inset * scale);
  // Deepest first: each layer over the ones beneath, where every page
  // above it has a hole.
  for (let k = layers.length - 1; k >= 0; k--) {
    const layer = layers[k]!;
    for (const ctx of [c, d]) {
      ctx.save();
      for (const clip of layer.clips) {
        ctx.beginPath();
        traceDiePaths(ctx, clip);
        ctx.clip("nonzero");
      }
    }
    const image = layer.pageIndex >= 0 ? canvasOf(layer.pageIndex) : undefined;
    if (image) c.drawImage(image, inset, inset, trimW, trimH);
    else {
      c.fillStyle = layer.pageIndex < 0 ? board : (doc.pages[layer.pageIndex]?.background ?? "#ffffff");
      c.fillRect(0, 0, page.width, page.height);
    }
    // The layer's depth, where it is not cut away itself (its own holes
    // show the next layer, already drawn): its silhouette in its code.
    const code = `rgb(${k + 1}, 0, 0)`;
    if (image) {
      s.globalCompositeOperation = "copy";
      s.drawImage(image, inset, inset, trimW, trimH);
      s.globalCompositeOperation = "source-in";
      s.fillStyle = code;
      s.fillRect(0, 0, page.width, page.height);
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.drawImage(silhouette, 0, 0);
    } else {
      d.fillStyle = code;
      d.fillRect(0, 0, page.width, page.height);
    }
    c.restore();
    d.restore();
  }
  let rgb: Uint8ClampedArray;
  let z: Uint8ClampedArray;
  try {
    rgb = c.getImageData(0, 0, w, h).data;
    z = d.getImageData(0, 0, w, h).data;
  } catch {
    return undefined;
  } finally {
    for (const canvas of [colour, depth, silhouette]) canvas.width = canvas.height = 0;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < data.length; p += 4) {
    // A texel the hole covers less than half of is paper.
    const code = z[p + 3]! >= 128 ? z[p]! : 0;
    data[p] = rgb[p]!;
    data[p + 1] = rgb[p + 1]!;
    data[p + 2] = rgb[p + 2]!;
    data[p + 3] = code;
  }
  return { width: w, height: h, data, layers: layers.length };
}

const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object | null | undefined) => {
  if (!o) return 0;
  let id = ids.get(o);
  if (!id) ids.set(o, (id = nextId++));
  return id;
};
const throughCache = new WeakMap<VDTDocument, Map<number, { key: string; through: FaceThroughData | undefined }>>();

/**
 * Page `i`'s through picture, `width` px wide, built again only when the
 * paintings it is drawn from change (a page beneath repainted, or painted
 * for the first time): cached by document, page and those paintings.
 */
export function cachedThrough(doc: VDTDocument, i: number, width: number, canvasOf: (j: number) => HTMLCanvasElement | null | undefined): FaceThroughData | undefined {
  const key = `${Math.round(width)}|${pagesThrough(doc, i).map((j) => idOf(canvasOf(j))).join(",")}`;
  let byPage = throughCache.get(doc);
  if (!byPage) throughCache.set(doc, (byPage = new Map()));
  const hit = byPage.get(i);
  if (hit?.key === key) return hit.through;
  const through = paintThrough(doc, i, width, canvasOf);
  byPage.set(i, { key, through });
  return through;
}
