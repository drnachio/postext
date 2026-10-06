import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

/**
 * Several videos on the pages at once (#507). Every video on show is drawn
 * into one canvas, each into a slot of its own, and the canvas goes to the
 * GPU as one texture: a page's shader finds each picture's slot there. One
 * upload a frame for all of them, and one texture unit, however many play.
 * A slot holds only the part of the picture the page shows (its crop),
 * at about the size it is seen on screen.
 */

/** The most videos drawn on the pages at once; any more show their
 *  posters. */
export const MAX_PAGE_VIDEOS = 8;
/** The atlas's widest and tallest, px. */
export const ATLAS_MAX = 2048;
/** Clear pixels between two slots. */
const ATLAS_GAP = 2;

export interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Packs pictures of the given sizes (px) into an atlas no wider and no
 * taller than `max`: shelves of the tallest first, all of them scaled down
 * together when they do not fit at their own size. The atlas is as small
 * as its slots allow. Rects are in px, in the order the sizes were given.
 */
export function packVideoAtlas(sizes: readonly { width: number; height: number }[], max = ATLAS_MAX): { width: number; height: number; rects: AtlasRect[] } {
  if (!sizes.length) return { width: 0, height: 0, rects: [] };
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]!.height - sizes[a]!.height);
  const area = sizes.reduce((s, z) => s + Math.max(1, z.width) * Math.max(1, z.height), 0);
  const widest = Math.max(...sizes.map((z) => z.width + ATLAS_GAP));
  const tallest = Math.max(...sizes.map((z) => z.height + ATLAS_GAP));
  // A first guess that leaves shelves room to waste, then smaller until
  // they fit.
  let scale = Math.min(1, Math.sqrt((0.8 * max * max) / area), max / widest, max / tallest);
  for (let tries = 0; tries < 60; tries++) {
    const rects: AtlasRect[] = new Array(sizes.length);
    let x = 0;
    let y = 0;
    let shelf = 0;
    let width = 0;
    for (const i of order) {
      const w = Math.max(2, Math.floor(sizes[i]!.width * scale));
      const h = Math.max(2, Math.floor(sizes[i]!.height * scale));
      if (x > 0 && x + w > max) {
        y += shelf + ATLAS_GAP;
        x = 0;
        shelf = 0;
      }
      rects[i] = { x, y, width: w, height: h };
      x += w + ATLAS_GAP;
      shelf = Math.max(shelf, h);
      width = Math.max(width, x - ATLAS_GAP);
    }
    const height = y + shelf;
    if (height <= max && width <= max) return { width, height, rects };
    scale *= 0.9;
  }
  // Never reached for MAX_PAGE_VIDEOS pictures; kept finite all the same.
  const side = Math.floor(max / Math.ceil(Math.sqrt(sizes.length)));
  const per = Math.floor(max / side);
  return {
    width: max,
    height: max,
    rects: sizes.map((_, i) => ({ x: (i % per) * side, y: Math.floor(i / per) * side, width: side - ATLAS_GAP, height: side - ATLAS_GAP })),
  };
}

/** A video to draw into the atlas: its element, the part of its picture
 *  shown (fractions of it) and the size it is wanted at (px). */
export interface AtlasVideo {
  element: HTMLVideoElement;
  crop?: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
}

interface Slot extends AtlasVideo {
  rect: AtlasRect;
  /** It has been drawn at least once (its slot shows the picture). */
  drawn: boolean;
  callback: number;
  /** The time of the frame drawn last (the frame-by-frame fallback). */
  last: number;
}

/**
 * The atlas itself: a canvas, its texture and the videos drawn into it,
 * each drawn again at every new frame it presents
 * (`requestVideoFrameCallback`, else each animation frame it has moved).
 * `onFrame` is told when the texture has changed (`first`: a slot has been
 * drawn for the first time, so the pages may show it now).
 */
export class VideoAtlas {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  texture: CanvasTexture | null = null;
  private slots: Slot[] = [];
  /** Elements the atlas cannot draw (a cross-origin picture read without
   *  CORS would taint it, and every other video with it). */
  private refused = new WeakSet<HTMLVideoElement>();
  private probe: CanvasRenderingContext2D | null = null;
  private disposed = false;

  constructor(
    private onFrame: (first: boolean) => void,
    private max = ATLAS_MAX,
  ) {}

  /** The atlas's size, px. */
  get size(): { width: number; height: number } {
    return { width: this.canvas?.width ?? 1, height: this.canvas?.height ?? 1 };
  }

  /** Where an element's picture lies in the atlas (fractions of it, from
   *  its top left corner), once it has been drawn there. */
  rectOf(element: HTMLVideoElement): AtlasRect | null {
    const s = this.slots.find((x) => x.element === element);
    if (!s?.drawn || !this.canvas) return null;
    const { width, height } = this.canvas;
    return { x: s.rect.x / width, y: s.rect.y / height, width: s.rect.width / width, height: s.rect.height / height };
  }

  /** Draws these videos from now on (the first `MAX_PAGE_VIDEOS`), packed
   *  afresh: each is drawn at once with the frame it shows. */
  set(videos: readonly AtlasVideo[]) {
    const next = videos.filter((v) => !this.refused.has(v.element)).slice(0, MAX_PAGE_VIDEOS);
    for (const s of this.slots) this.unwatch(s);
    if (!next.length) {
      this.slots = [];
      this.free();
      return;
    }
    const packed = packVideoAtlas(next, this.max);
    this.slots = next.map((v, i) => ({ ...v, rect: packed.rects[i]!, drawn: false, callback: 0, last: -1 }));
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d");
    }
    const canvas = this.canvas;
    if (canvas.width !== packed.width || canvas.height !== packed.height) {
      canvas.width = packed.width;
      canvas.height = packed.height;
      // A texture keeps the size it was first given: a new one for a new
      // size.
      this.texture?.dispose();
      this.texture = null;
    } else this.ctx?.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.texture) {
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      this.texture = tex;
    }
    for (const s of this.slots) {
      this.draw(s);
      if (this.slots.includes(s)) this.watch(s);
    }
    this.texture.needsUpdate = true;
  }

  /** Draws a video's current frame into its slot; false when it has none
   *  to give yet. */
  private draw(s: Slot): boolean {
    const el = s.element;
    const ctx = this.ctx;
    if (!ctx || el.readyState < 2 || !el.videoWidth || !el.videoHeight) return false;
    if (!s.drawn && !this.readable(el)) {
      this.refused.add(el);
      this.unwatch(s);
      this.slots = this.slots.filter((x) => x !== s);
      return false;
    }
    const c = s.crop ?? { x: 0, y: 0, width: 1, height: 1 };
    const vw = el.videoWidth;
    const vh = el.videoHeight;
    const { x, y, width, height } = s.rect;
    try {
      ctx.drawImage(el, c.x * vw, c.y * vh, Math.max(1, c.width * vw), Math.max(1, c.height * vh), x, y, width, height);
    } catch {
      return false;
    }
    const first = !s.drawn;
    s.drawn = true;
    s.last = el.currentTime;
    if (this.texture) this.texture.needsUpdate = true;
    if (first) this.onFrame(true);
    return true;
  }

  /** Whether the canvas may read an element's picture (its server allowed
   *  it, or it is the page's own): tried once, on a canvas of its own. */
  private readable(el: HTMLVideoElement): boolean {
    try {
      if (!this.probe) {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        this.probe = c.getContext("2d", { willReadFrequently: true });
      }
      if (!this.probe) return true;
      this.probe.drawImage(el, 0, 0, 1, 1);
      this.probe.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      // A tainted probe stays tainted: the next element gets a fresh one.
      this.probe = null;
      return false;
    }
  }

  private watch(s: Slot) {
    const el = s.element;
    const frames = hasFrameCallbacks(el);
    const next = () => {
      if (this.disposed || !this.slots.includes(s)) return;
      // Without frame callbacks: a frame only when the picture has moved.
      const moved = frames || el.currentTime !== s.last || !s.drawn;
      if (moved && this.draw(s)) this.onFrame(false);
      if (!this.slots.includes(s)) return;
      s.callback = frames ? el.requestVideoFrameCallback(next) : requestAnimationFrame(next);
    };
    s.callback = frames ? el.requestVideoFrameCallback(next) : requestAnimationFrame(next);
  }

  private unwatch(s: Slot) {
    if (!s.callback) return;
    if (hasFrameCallbacks(s.element)) s.element.cancelVideoFrameCallback(s.callback);
    else cancelAnimationFrame(s.callback);
    s.callback = 0;
  }

  private free() {
    this.texture?.dispose();
    this.texture = null;
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = null;
    this.ctx = null;
  }

  dispose() {
    for (const s of this.slots) this.unwatch(s);
    this.slots = [];
    this.free();
    this.disposed = true;
  }
}

/** The browser tells when a video presents a new frame. */
const hasFrameCallbacks = (el: HTMLVideoElement) => typeof (el as Partial<HTMLVideoElement>).requestVideoFrameCallback === "function";
