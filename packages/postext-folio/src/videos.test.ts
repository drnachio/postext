import { describe, expect, it } from "vitest";
import type { VDTDocument, VDTPage } from "postext";
import { corsTagged, hlsLevelCap, isHlsVideo, pageVideoSpots, spotContains } from "./videos";

// A 200 × 300 px sheet with a 10 px bleed (trimmed: 180 × 280) and one
// video whose body is 100 × 50 px.
const doc = { trimOffset: 10 } as unknown as VDTDocument;

const videoBlock = (over: Record<string, unknown> = {}) => ({
  bbox: { x: 40, y: 60, width: 100, height: 70 },
  resourceBlock: {
    resource: { id: "reel" },
    kind: "video",
    video: { source: "file", link: "https://media.example.org/reel/master.m3u8", mimeType: "application/vnd.apple.mpegurl" },
    bodyRect: { x: 0, y: 0, width: 100, height: 50 },
    ...over,
  },
});

const pageWith = (block: unknown, flow?: unknown) =>
  ({ width: 200, height: 300, columns: [{ blocks: [block] }], floats: [], ...(flow ? { flow } : {}) }) as unknown as VDTPage;

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("pageVideoSpots", () => {
  it("places an upright video in fractions of the trimmed page", () => {
    const [spot] = pageVideoSpots(pageWith(videoBlock()), doc);
    expect(spot!.key).toBe("reel#0");
    close(spot!.origin, { x: 30 / 180, y: 50 / 280 });
    close(spot!.across, { x: 100 / 180, y: 0 });
    close(spot!.down, { x: 0, y: 50 / 280 });
    expect(spotContains(spot!, 0.4, 0.25)).toBe(true);
    expect(spotContains(spot!, 0.1, 0.25)).toBe(false);
    expect(spotContains(spot!, 0.4, 0.5)).toBe(false);
  });

  it("sets the picture unmirrored on a right-to-left page", () => {
    const flow = { writingMode: "horizontal-tb", direction: "rtl", mirror: { originX: 200 } };
    const [spot] = pageVideoSpots(pageWith(videoBlock(), flow), doc);
    // The box lands mirrored (x 60 … 160 on the sheet); the picture reads
    // left to right inside it.
    close(spot!.origin, { x: 50 / 180, y: 50 / 280 });
    close(spot!.across, { x: 100 / 180, y: 0 });
    close(spot!.down, { x: 0, y: 50 / 280 });
  });

  it("stands a vertical page's upright figure upright on the sheet", () => {
    // The flow turned a quarter clockwise, the block turned back.
    const flow = { writingMode: "vertical-rl", rotation: { direction: "cw", originX: 200, originY: 0, width: 300, height: 200 } };
    const rotation = { direction: "ccw", originX: 40, originY: 160, width: 100, height: 50 };
    const [spot] = pageVideoSpots(pageWith(videoBlock({ rotation, bodyRect: { x: 0, y: 0, width: 100, height: 50 } }), flow), doc);
    expect(Math.abs(spot!.across.y)).toBeLessThan(1e-9);
    expect(spot!.across.x).toBeGreaterThan(0);
    expect(spot!.down.y).toBeGreaterThan(0);
  });

  it("numbers repeated resources and carries a safe-area crop", () => {
    const crop = { x: 0.1, y: 0, width: 0.8, height: 1 };
    const page = { width: 200, height: 300, columns: [{ blocks: [videoBlock(), videoBlock({ bodySource: crop })] }], floats: [] } as unknown as VDTPage;
    const spots = pageVideoSpots(page, doc);
    expect(spots.map((s) => s.key)).toEqual(["reel#0", "reel#1"]);
    expect(spots[1]!.crop).toEqual(crop);
  });

  it("ignores pictures, tables and empty bodies", () => {
    const picture = { bbox: { x: 0, y: 0, width: 10, height: 10 }, resourceBlock: { resource: { id: "f" }, kind: "bitmap", bodyRect: { x: 0, y: 0, width: 10, height: 10 } } };
    expect(pageVideoSpots(pageWith(picture), doc)).toEqual([]);
    expect(pageVideoSpots(pageWith(videoBlock({ bodyRect: { x: 0, y: 0, width: 0, height: 0 } })), doc)).toEqual([]);
  });
});

describe("isHlsVideo", () => {
  it("knows an HLS stream by its media type or its address", () => {
    expect(isHlsVideo({ mimeType: "application/vnd.apple.mpegurl" }, "https://x.org/a")).toBe(true);
    expect(isHlsVideo({}, "https://x.org/reel/master.m3u8?v=1")).toBe(true);
    expect(isHlsVideo({ mimeType: "video/mp4" }, "https://x.org/clip.mp4")).toBe(false);
  });
});

describe("hlsLevelCap", () => {
  const levels = [{ height: 2160 }, { height: 1440 }, { height: 1080 }, { height: 720 }];
  it("caps at the tallest variant the picture needs", () => {
    expect(hlsLevelCap(levels, 800)).toBe(3);
    expect(hlsLevelCap(levels, 900)).toBe(2);
    expect(hlsLevelCap(levels, 2000)).toBe(0);
  });
  it("falls back to the shortest variant for a small picture", () => {
    expect(hlsLevelCap(levels, 300)).toBe(3);
    expect(hlsLevelCap([], 300)).toBe(-1);
  });
});

describe("corsTagged", () => {
  it("adds a query of its own, once, before the fragment", () => {
    expect(corsTagged("https://x.org/a/seg_001.m4s")).toBe("https://x.org/a/seg_001.m4s?pt-cors=1");
    expect(corsTagged("https://x.org/a/master.m3u8?v=2#t=3")).toBe("https://x.org/a/master.m3u8?v=2&pt-cors=1#t=3");
    expect(corsTagged("https://x.org/a.m4s?pt-cors=1")).toBe("https://x.org/a.m4s?pt-cors=1");
    expect(corsTagged("blob:http://x/1")).toBe("blob:http://x/1");
  });
});
