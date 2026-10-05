import { flowToPage, isHlsMimeType, resourceBlockToPage, type VDTBlock, type VDTDocument, type VDTPage, type VDTResourceVideo } from "postext";
import type { PageVideoFrame } from "./pageFlip";

/**
 * Videos on Folio's pages (#477): where each video resource's picture lies
 * on a page as bound, and how a `<video>` element is given its source (a
 * file, or an HLS stream through hls.js where the browser has no HLS of
 * its own).
 */

/** A video printed on a page: its place (see {@link PageVideoFrame}), what
 *  plays and a key that finds it again in another layout of the book. */
export interface PageVideoSpot extends PageVideoFrame {
  /** The resource's id and its occurrence on the page. */
  key: string;
  resourceId: string;
  video: VDTResourceVideo;
  /** The picture's height on the page, in the page's own px. */
  heightPx: number;
}

/** The video resources printed on a page, in the order they are painted:
 *  each picture's place in fractions of the page as bound (trimmed), with
 *  the turns the page and the block give it. A mirrored (right-to-left)
 *  page sets its pictures unmirrored, as the renderers do. */
export function pageVideoSpots(page: VDTPage, doc: VDTDocument): PageVideoSpot[] {
  const out: PageVideoSpot[] = [];
  const blocks: VDTBlock[] = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])];
  const inset = Math.max(0, doc.trimOffset);
  const tw = page.width - 2 * inset;
  const th = page.height - 2 * inset;
  if (!(tw > 0 && th > 0)) return out;
  const seen = new Map<string, number>();
  for (const block of blocks) {
    const rb = block.resourceBlock;
    if (!rb || rb.kind !== "video" || !rb.video) continue;
    const bx = (rb.rotation ? 0 : block.bbox.x) + rb.bodyRect.x;
    const by = (rb.rotation ? 0 : block.bbox.y) + rb.bodyRect.y;
    const { width: bw, height: bh } = rb.bodyRect;
    if (!(bw > 0 && bh > 0)) continue;
    // The body's corners: in the block's frame, the page's flow frame,
    // then on the sheet.
    const onSheet = (x: number, y: number) => {
      const f = resourceBlockToPage(rb, x, y);
      const p = flowToPage(page, f.x, f.y);
      return { x: (p.x - inset) / tw, y: (p.y - inset) / th };
    };
    let origin = onSheet(bx, by);
    const right = onSheet(bx + bw, by);
    const below = onSheet(bx, by + bh);
    let across = { x: right.x - origin.x, y: right.y - origin.y };
    let down = { x: below.x - origin.x, y: below.y - origin.y };
    // A mirrored flow lays the box out mirrored but turns the picture back
    // in it: the axis that runs across the sheet is reversed again.
    if (page.flow?.writingMode === "horizontal-tb") {
      if (Math.abs(across.x) >= Math.abs(down.x)) {
        origin = { x: origin.x + across.x, y: origin.y + across.y };
        across = { x: -across.x, y: -across.y };
      } else {
        origin = { x: origin.x + down.x, y: origin.y + down.y };
        down = { x: -down.x, y: -down.y };
      }
    }
    const id = rb.resource.id;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    out.push({
      key: `${id}#${n}`,
      resourceId: id,
      video: rb.video,
      origin,
      across,
      down,
      heightPx: bh,
      ...(rb.bodySource ? { crop: { ...rb.bodySource } } : {}),
    });
  }
  return out;
}

/** Whether a point of the page (fractions from its top left corner) lies on
 *  a spot's picture. */
export function spotContains(spot: PageVideoFrame, x: number, y: number): boolean {
  const px = x - spot.origin.x;
  const py = y - spot.origin.y;
  const s = (px * spot.across.x + py * spot.across.y) / (spot.across.x ** 2 + spot.across.y ** 2);
  const t = (px * spot.down.x + py * spot.down.y) / (spot.down.x ** 2 + spot.down.y ** 2);
  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

/** hls.js, as much of it as is used here. */
interface HlsLike {
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  on(event: string, cb: (event: string, data: { levels?: { height: number }[]; fatal?: boolean; type?: string }) => void): void;
  startLoad(): void;
  recoverMediaError(): void;
  autoLevelCapping: number;
}
interface HlsConstructor {
  new (config?: Record<string, unknown>): HlsLike;
  isSupported(): boolean;
  Events: { MANIFEST_PARSED: string; ERROR: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
}

/** The variant to cap a stream at: the tallest no taller than `maxHeight`
 *  (with a quarter of slack), else the shortest there is. */
export function hlsLevelCap(levels: readonly { height: number }[], maxHeight: number): number {
  let cap = -1;
  let lowest = -1;
  levels.forEach((l, i) => {
    if (lowest < 0 || l.height < levels[lowest]!.height) lowest = i;
    if (l.height <= maxHeight * 1.25 && (cap < 0 || l.height > levels[cap]!.height)) cap = i;
  });
  return cap >= 0 ? cap : lowest;
}

/**
 * Gives a `<video>` its source: a file's address as it is, or an HLS
 * stream (`hls`, or an `.m3u8` address). A stream plays through hls.js
 * (loaded on demand) wherever Media Source Extensions exist, its quality
 * capped at the variant nearest `maxHeight` px tall, so a picture a few
 * hundred pixels tall never pulls a 4K variant; the browser's own HLS
 * (Safari on iOS) is the fallback, or the first choice with `native:
 * 'prefer'` (a player shown at its size, which picks its own variant).
 * A fatal network or media error is retried once each. `lazy` loads no
 * segment before the first play. Resolves to a function that lets the
 * source go; rejects when the stream cannot play.
 */
export async function attachVideoSource(
  element: HTMLVideoElement,
  url: string,
  options: { hls?: boolean; maxHeight?: number; lazy?: boolean; native?: "prefer" | "avoid"; corsTag?: boolean } = {},
): Promise<() => void> {
  const hls = options.hls ?? /\.m3u8(?:$|[?#])/i.test(url);
  const nativeHls = hls && !!element.canPlayType("application/vnd.apple.mpegurl");
  const plain = () => {
    element.src = url;
    return () => {
      element.removeAttribute("src");
      element.load();
    };
  };
  if (!hls || (nativeHls && options.native === "prefer")) return plain();
  let Hls: HlsConstructor | null = null;
  try {
    Hls = ((await import("hls.js")) as unknown as { default: HlsConstructor }).default;
  } catch {
    Hls = null;
  }
  if (!Hls || !Hls.isSupported()) {
    if (nativeHls) return plain();
    throw new Error("HLS is not supported");
  }
  const H = Hls;
  const player = new H({
    capLevelToPlayerSize: false,
    startLevel: -1,
    autoStartLoad: !options.lazy,
    // `corsTag`: every playlist and segment is asked for with a query of its
    // own, so the browser's cache never hands back a copy fetched without
    // CORS by another player of the same stream (a plain <video> sends no
    // Origin, and a server that answers it without `Vary: Origin` gets that
    // copy reused for this cross-origin read, which then fails: playback
    // stops at the first such segment).
    ...(options.corsTag ? { xhrSetup: (xhr: XMLHttpRequest, u: string) => xhr.open("GET", corsTagged(u), true) } : {}),
  });
  if (options.lazy) element.addEventListener("play", () => player.startLoad(), { once: true });
  const maxHeight = options.maxHeight;
  if (maxHeight) {
    player.on(H.Events.MANIFEST_PARSED, (_e, data) => {
      const cap = hlsLevelCap(data.levels ?? [], maxHeight);
      if (cap >= 0) player.autoLevelCapping = cap;
    });
  }
  const retried = new Set<string>();
  player.on(H.Events.ERROR, (_e, data) => {
    if (!data.fatal || !data.type || retried.has(data.type)) return;
    retried.add(data.type);
    if (data.type === H.ErrorTypes.NETWORK_ERROR) player.startLoad();
    else if (data.type === H.ErrorTypes.MEDIA_ERROR) player.recoverMediaError();
  });
  player.loadSource(url);
  player.attachMedia(element);
  return () => player.destroy();
}

/** An address with the query that keeps its cache entry apart (see
 *  `corsTag`). */
export function corsTagged(url: string): string {
  if (/^(blob|data):/i.test(url) || /[?&]pt-cors(=|&|$)/.test(url)) return url;
  const at = url.indexOf("#");
  const base = at < 0 ? url : url.slice(0, at);
  const hash = at < 0 ? "" : url.slice(at);
  return `${base}${base.includes("?") ? "&" : "?"}pt-cors=1${hash}`;
}

/** Whether a video plays from an HLS address. */
export function isHlsVideo(video: Pick<VDTResourceVideo, "mimeType">, url: string): boolean {
  return isHlsMimeType(video.mimeType) || /\.m3u8(?:$|[?#])/i.test(url);
}
