import { describe, it, expect } from 'vitest';
import { zlibSync } from 'fflate';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { exclusionInsets } from '../../../pipeline/callouts/calloutLayout.js';
import { lineInsetsAt } from '../../../measure/types.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import {
  contourInsetSteps,
  contourOnPage,
  contourRowsOf,
  decodePngAlpha,
  polygonRows,
  scaleContourAbout,
  traceAlpha,
  traceResourceContour,
  withContourTrace,
} from '../../../contour/index.js';
import { traceBundleContours, planBundle } from '../../../bundle/codec.js';
import { normalizeFrame } from '../../../composed/templates.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, Resource, VDTBlock, VDTDocument, VDTExclusionContour, VDTLine } from '../../../index.js';

// #883: text that runs round the real shape of a picture (`wrap:
// 'contour'`): a polygon or the alpha channel of a bitmap.

// 7 px a character, whatever the font.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// ---------------------------------------------------------------------------
// A PNG writer for the tests (RGBA, 8 bits, filter 0).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};
/** A `w` × `h` PNG whose pixel (x, y) has the opacity `alpha(x, y)`. */
function png(w: number, h: number, alpha: (x: number, y: number) => number, colorType: 6 | 2 = 6): Uint8Array {
  const channels = colorType === 6 ? 4 : 3;
  const raw = new Uint8Array((w * channels + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * channels + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const at = row + 1 + x * channels;
      raw[at] = 200; raw[at + 1] = 60; raw[at + 2] = 40;
      if (channels === 4) raw[at + 3] = alpha(x, y);
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** A disc filling a `size` square picture. */
const discPng = (size: number): Uint8Array => png(size, size, (x, y) => ((x + 0.5 - size / 2) ** 2 + (y + 0.5 - size / 2) ** 2 <= (size / 2) ** 2 ? 255 : 0));

// ---------------------------------------------------------------------------

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** A 260 px measure at 72 dpi; 10 px text on 14 px lines. */
const config = (extra: Partial<PostextConfig> = {}, body: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'left', boldFontWeight: 700, hyphenation: { enabled: false }, ...body },
  ...extra,
});
const LEFT = 20;
const MEASURE = 260;

const sentence = 'The heap needs a cubic metre of mixed waste before it holds its heat.';
const para = (n: number) => Array.from({ length: n }, () => sentence).join(' ');

/** A triangle standing on its base, its apex at the top right: wide at the
 *  foot, narrow at the head. */
const TRIANGLE = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
/** A diamond (a rhombus): widest at mid-height. */
const DIAMOND = [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }];

const svgFigure = (placement: Resource['placement'], contour?: Resource['contour'], id = 'fig'): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption: '', createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: 400, height: 400 },
  placement: { position: 'here', ...placement },
  ...(contour ? { contour } : {}),
});

const build = (md: string, resources: Resource[], cfg: PostextConfig = config()): VDTDocument =>
  buildDocument({ markdown: md, resources }, cfg, createMeasurementCache());
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.pages[0]!.columns[0]!.blocks.filter((b) => b.type === 'paragraph');
const wrapWarnings = (doc: VDTDocument): Extract<ContentWarning, { kind: 'textWrap' }>[] =>
  (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'textWrap' }> => w.kind === 'textWrap');
const lineRight = (l: VDTLine): number => (l.measure ? l.measure.x + l.measure.width : LEFT + MEASURE);
const lineLeft = (l: VDTLine): number => (l.measure ? l.measure.x : LEFT);

describe('shapes in rows (#883)', () => {
  it('a polygon: per row the extent of the polygon across it', () => {
    const rows = polygonRows(TRIANGLE, 4);
    // Row 0 (y 0–0.25): from x 0.75 to 1; row 3 (0.75–1): from 0 to 1.
    expect(rows.spans).toEqual([0.75, 1, 0.5, 1, 0.25, 1, 0, 1]);
    const d = polygonRows(DIAMOND, 2);
    expect(d.spans).toEqual([0, 1, 0, 1]);
    expect(polygonRows(DIAMOND, 4).spans).toEqual([0.25, 0.75, 0, 1, 0, 1, 0.25, 0.75]);
  });

  it('the alpha channel of a generated PNG of a disc', () => {
    const raster = decodePngAlpha(discPng(64))!;
    expect(raster.width).toBe(64);
    expect(raster.alpha[0]).toBe(0);
    expect(raster.alpha[32 * 64 + 32]).toBe(255);
    const t = traceAlpha(raster, 0.5, 'disc.png');
    expect(t.rows).toBe(64);
    // Narrow at the top, the whole width at mid-height, symmetric.
    const width = (r: number) => t.spans[r * 2 + 1]! - t.spans[r * 2]!;
    expect(width(0)).toBeLessThan(0.3);
    expect(width(32)).toBeCloseTo(1, 1);
    expect(t.spans[0]! + t.spans[1]!).toBeCloseTo(1, 2);
    // An opaque PNG has no transparency; a JPEG never does.
    expect(decodePngAlpha(png(8, 8, () => 255, 2))).toBeNull();
    expect(decodePngAlpha(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it('traces a bitmap resource from its file, and the trace goes with the file and the threshold', async () => {
    const res: Resource = { id: 'disc', typeId: 'figure', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'disc.png', format: 'png', width: 64, height: 64 }, contour: {} };
    const trace = await traceResourceContour(res, discPng(64), 'image/png');
    expect(trace?.fileId).toBe('disc.png');
    const traced = withContourTrace(res, trace);
    expect(contourRowsOf(traced)?.rows).toBe(64);
    // Another threshold or another file: the trace is stale.
    expect(contourRowsOf({ ...traced, contour: { ...traced.contour, threshold: 0.9 } })).toBeUndefined();
    expect(contourRowsOf({ ...traced, bitmap: { ...traced.bitmap!, fileId: 'other.png' } })).toBeUndefined();
    // A JPEG has no alpha channel; `alpha: false` asks for none.
    expect(await traceResourceContour(res, new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg')).toBeNull();
    expect(await traceResourceContour({ ...res, contour: { alpha: false } }, discPng(8), 'image/png')).toBeUndefined();
  });

  it('a bundle reader traces the pictures a contour wrap runs round, and a bundle never stores the trace', async () => {
    const bytes = discPng(32);
    const blob = { fileId: 'disc.png', file: 'resources/disc.png', bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, mime: 'image/png' };
    const base: Resource = { id: 'disc', typeId: 'figure', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'disc.png', format: 'png', width: 32, height: 32 } };
    const [plain] = await traceBundleContours([base], [blob], {});
    expect(plain!.contour).toBeUndefined();
    const [wrapped] = await traceBundleContours([{ ...base, placement: { wrap: 'contour' } }], [blob], {});
    expect(wrapped!.contour?.traced?.rows).toBe(32);
    // A frame that pushes by contour traces every bitmap of the book.
    const tpl: PageTemplate = { id: 't', frames: [{ name: 'pic', exclude: 'push', wrap: 'contour' }] };
    const [framed] = await traceBundleContours([base], [blob], { pageTemplates: [tpl] });
    expect(framed!.contour?.traced).toBeDefined();
    const plan = planBundle({ id: 'b', name: 'B' }, { chapters: [{ title: 'a', markdown: 'x' }], config: {}, resources: [wrapped!] });
    expect(plan.manifest.resources?.[0]?.contour).toEqual({});
  });
});

describe('the shape on the page (#883)', () => {
  const contour = (resource: Resource, crop?: { x: number; y: number; width: number; height: number }, mirrored = false): VDTExclusionContour =>
    contourOnPage(resource, { bodyRect: { x: 100, y: 0, width: 100, height: 100 }, ...(crop ? { bodySource: crop } : {}) }, undefined, { margin: 0, mirrored })!;
  const tri = svgFigure({}, { points: TRIANGLE });

  it('scales the rows to the body; a crop shows only its part of the shape, stretched to the body', () => {
    const whole = contour(tri);
    const at = (c: VDTExclusionContour, y: number) => c.spans.find((s) => y >= s.y && y < s.y + s.height)!;
    expect(at(whole, 1).left).toBeGreaterThan(195);
    expect(at(whole, 99).left).toBeLessThan(102);
    // The lower half of the picture, shown over the whole body: at the
    // body's top the shape is half as wide as it is at its foot.
    const lower = contour(tri, { x: 0, y: 0.5, width: 1, height: 0.5 });
    expect(at(lower, 1).left).toBeGreaterThan(148);
    expect(at(lower, 1).left).toBeLessThan(151);
    // The right half across: the shape at the foot spans the whole body.
    const right = contour(tri, { x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(at(right, 99).left).toBeCloseTo(100, 0);
    expect(right.spans.every((s) => s.left >= 100 - 0.01 && s.right <= 200.01)).toBe(true);
  });

  it('turns the shape on a mirrored (right-to-left) page, where the picture is painted unturned', () => {
    const m = contour(tri, undefined, true);
    const first = m.spans[0]!;
    // The apex stands at the top right of the picture: in the mirrored
    // flow it stands at the flow's left.
    expect(first.left).toBeCloseTo(100, 0);
    expect(first.right).toBeLessThan(110);
  });

  it('sets each line short by the shape beside it, the margin round it, none where the line passes clear', () => {
    const c: VDTExclusionContour = { spans: [{ y: 20, height: 20, left: 0, right: 50 }, { y: 40, height: 20, left: 0, right: 100 }], margin: 0 };
    const steps = contourInsetSteps(c, 'left', 0, 300, 0, 20, 0, 4);
    expect([0, 1, 2, 3, 4].map((li) => lineInsetsAt(steps, li).start)).toEqual([0, 50, 100, 0, 0]);
    const m = contourInsetSteps({ ...c, margin: 5 }, 'left', 0, 300, 0, 20, 0, 4);
    expect([0, 1, 2, 3, 4].map((li) => lineInsetsAt(m, li).start)).toEqual([55, 105, 105, 105, 0]);
    // On a CJK grid the insets are whole characters.
    const q = contourInsetSteps({ ...c, quantum: 12 }, 'left', 0, 300, 0, 20, 0, 4);
    expect([1, 2].map((li) => lineInsetsAt(q, li).start)).toEqual([60, 108]);
    // At the right side, from the measure's end.
    const r = contourInsetSteps({ spans: [{ y: 0, height: 20, left: 250, right: 300 }], margin: 0 }, 'right', 0, 300, 0, 20, 0, 0);
    expect(lineInsetsAt(r, 0)).toEqual({ start: 0, end: 50 });
  });

  it('a box’s exclusion with a contour (frames): the side the shape covers, line by line', () => {
    const c: VDTExclusionContour = { spans: [{ y: 0, height: 20, left: 180, right: 200 }, { y: 20, height: 20, left: 120, right: 200 }], margin: 0 };
    const steps = exclusionInsets([{ x: 120, y: 0, width: 80, height: 40, contour: c }], 0, 200, 0, 20);
    expect([0, 1].map((li) => lineInsetsAt(steps, li).end)).toEqual([20, 80]);
    // Two shapes, one on each side: both sides set short.
    const left: VDTExclusionContour = { spans: [{ y: 0, height: 40, left: 0, right: 30 }], margin: 0 };
    const both = exclusionInsets([{ x: 120, y: 0, width: 80, height: 40, contour: c }, { x: 0, y: 0, width: 30, height: 40, contour: left }], 0, 200, 0, 20);
    expect(lineInsetsAt(both, 1)).toEqual({ start: 30, end: 80 });
  });
});

describe('wrap: "contour" in the flow (#883)', () => {
  it('an inline picture: the lines beside it follow its polygon, at the side its align names', () => {
    const md = `::resource{id="fig"}\n\n${para(8)}`;
    const shaped = build(md, [svgFigure({ wrap: 'contour', align: 'right', width: 0.45 }, { points: TRIANGLE })]);
    const box = build(md, [svgFigure({ wrap: 'right', width: 0.45 })]);
    const ex = shaped.pages[0]!.columns[0]!.exclusions![0]!;
    expect(ex.side).toBe('right');
    expect(ex.contour?.spans.length).toBeGreaterThan(3);
    const lines = paragraphs(shaped).flatMap((b) => b.lines);
    const beside = lines.filter((l) => l.bbox.y < ex.y + ex.height - 0.01);
    // The apex is at the top right: the first lines run almost to the
    // column's right edge, the lines lower down stop short of the
    // triangle's slope, further left each time.
    const ends = beside.map(lineRight);
    expect(ends[0]!).toBeGreaterThan(LEFT + MEASURE - 50);
    for (let i = 1; i < ends.length; i++) expect(ends[i]!).toBeLessThanOrEqual(ends[i - 1]! + 0.01);
    expect(ends[ends.length - 1]!).toBeLessThan(LEFT + MEASURE * 0.6);
    // Round the box, every line beside it is as short as the box.
    const boxEx = box.pages[0]!.columns[0]!.exclusions![0]!;
    const boxLines = paragraphs(box).flatMap((b) => b.lines).filter((l) => l.bbox.y < boxEx.y + boxEx.height - 0.01);
    expect(new Set(boxLines.map((l) => Math.round(lineRight(l)))).size).toBe(1);
    // More words go beside the shape than beside its box.
    const chars = (ls: VDTLine[]) => ls.reduce((a, l) => a + l.text.length, 0);
    expect(chars(beside.slice(0, boxLines.length))).toBeGreaterThan(chars(boxLines));
    expect(wrapWarnings(shaped)).toEqual([]);
  });

  it('a margin keeps the text further from the shape', () => {
    const md = `::resource{id="fig"}\n\n${para(8)}`;
    const ends = (margin: number) => {
      const doc = build(md, [svgFigure({ wrap: 'contour', align: 'right', width: 0.45 }, { points: DIAMOND, margin: pt(margin) })]);
      const ex = doc.pages[0]!.columns[0]!.exclusions![0]!;
      return paragraphs(doc).flatMap((b) => b.lines).filter((l) => l.bbox.y < ex.y + ex.height - 0.01).map(lineRight);
    };
    const tight = ends(2);
    const loose = ends(20);
    expect(Math.min(...loose)).toBeLessThan(Math.min(...tight) - 10);
  });

  it('the alpha channel of a traced PNG (a disc) wraps a float at the head of the column', async () => {
    const res: Resource = {
      id: 'disc', typeId: 'figure', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'disc.png', format: 'png', width: 120, height: 120 },
      placement: { position: 'top', wrap: 'contour', align: 'left', width: 0.45 }, contour: {},
    };
    const traced = withContourTrace(res, await traceResourceContour(res, discPng(120), 'image/png'));
    // Two columns: the float heads the second, its first lines beside it.
    const two = config({ layout: { layoutType: 'double', gutterWidth: pt(10) } });
    two.page = { ...two.page!, width: pt(560) };
    const md = `${para(4)} :ref{id="disc"}\n\n${para(30)}\n\n${para(30)}`;
    const doc = build(md, [traced], two);
    const col = doc.pages[0]!.columns[1]!;
    const ex = col.exclusions?.[0];
    expect(ex?.contour).toBeDefined();
    const lines = col.blocks.flatMap((b) => b.lines).filter((l) => l.bbox.y < ex!.y + ex!.height - 0.01);
    const starts = lines.map(lineLeft);
    // Round a disc at the left: the lines start furthest right at its
    // middle, nearer the column's edge at its top and foot.
    const mid = Math.max(...starts);
    const at = starts.indexOf(mid);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(starts.length - 1);
    expect(starts[0]!).toBeLessThan(mid - 5);
    expect(wrapWarnings(doc)).toEqual([]);
    // Untraced, the same picture runs round its box, with a note.
    const bare = build(md, [res], two);
    const notes = wrapWarnings(bare);
    expect(notes).toEqual([expect.objectContaining({ reason: 'noContour', resourceId: 'disc' })]);
    expect(formatWarning(notes[0]!)).toContain('its shape is not known');
    expect(bare.pages[0]!.columns[1]!.exclusions?.[0]?.contour).toBeUndefined();
  });

  it('on a right-to-left page the shape is turned with the page', () => {
    const md = `::resource{id="fig"}\n\nابدأ ${para(6)}`;
    const ltr = build(md, [svgFigure({ wrap: 'contour', align: 'left', width: 0.45 }, { points: TRIANGLE })]);
    const rtl = build(md, [svgFigure({ wrap: 'contour', align: 'left', width: 0.45 }, { points: TRIANGLE })], config({ direction: 'rtl' } as never));
    const a = ltr.pages[0]!.columns[0]!.exclusions![0]!.contour!;
    const b = rtl.pages[0]!.columns[0]!.exclusions![0]!.contour!;
    // The triangle's vertical edge is its right side: at the flow's left,
    // LTR, the shape's right edge is the same in every band; turned, its
    // left edge is.
    // (The rows of the picture, not the band of its caption.)
    const rows = (c: VDTExclusionContour) => c.spans.filter((s) => s.height < 5);
    expect(new Set(rows(a).map((s) => Math.round(s.right))).size).toBe(1);
    expect(new Set(rows(b).map((s) => Math.round(s.left))).size).toBe(1);
    expect(new Set(rows(b).map((s) => Math.round(s.right))).size).toBeGreaterThan(3);
  });

  it('under a CJK character grid the insets are whole characters', () => {
    const md = `::resource{id="fig"}\n\n${'天地玄黄宇宙洪荒日月盈昃辰宿列张'.repeat(16)}`;
    const doc = build(md, [svgFigure({ wrap: 'contour', align: 'left', width: 0.45 }, { points: DIAMOND })], config({ locale: 'zh', cjk: { grid: { enabled: true } } } as never));
    const ex = doc.pages[0]!.columns[0]!.exclusions![0]!;
    expect(ex.contour?.quantum).toBeCloseTo(10, 6);
    const insets = paragraphs(doc).flatMap((b) => b.lines).filter((l) => l.measure).map((l) => l.measure!.x - LEFT);
    expect(insets.length).toBeGreaterThan(2);
    for (const i of insets) expect(i / 10).toBeCloseTo(Math.round(i / 10), 6);
  });

  it('an SVG with no polygon runs round its box and says so', () => {
    const doc = build(`::resource{id="fig"}\n\n${para(6)}`, [svgFigure({ wrap: 'contour', align: 'right', width: 0.45 })]);
    expect(wrapWarnings(doc)).toEqual([expect.objectContaining({ reason: 'noContour' })]);
    const ex = doc.pages[0]!.columns[0]!.exclusions![0]!;
    expect(ex.contour).toBeUndefined();
    expect(ex.side).toBe('right');
  });
});

describe('a frame that pushes with its picture’s contour (#883)', () => {
  const mm = (value: number) => ({ value, unit: 'mm' as const });
  const PAGE: PostextConfig = {
    page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
    headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  };
  const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  const tpl = (wrap?: 'contour'): PageTemplate => ({ id: 'push', frames: [
    { name: 'text', flow: true, width: mm(150), placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'photo', exclude: 'push', ...(wrap ? { wrap } : {}), layer: 2, width: mm(60), placement: { anchor: { to: 'container', edge: 'top-right' } } },
  ] });
  const pic: Resource = { id: 'pic', typeId: 'figure', kind: 'svg', caption: '', createdAt: 0, updatedAt: 0, svg: { fileId: 'p.svg', width: 400, height: 400 }, contour: { points: TRIANGLE, margin: mm(2) } };
  const md = `::::page{template="push"}\n${words(400)}\n\n::resource{id="pic" slot="photo"}\n::::`;
  const lines = (doc: VDTDocument): VDTLine[] => {
    const page = doc.pages.find((p) => p.composed)!;
    const text = page.composed!.frames.find((f) => f.name === 'text')!;
    return text.blockIds.map((id) => page.floats!.find((b) => b.id === id)!).filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
  };
  const photoRect = (doc: VDTDocument) => doc.pages.find((p) => p.composed)!.composed!.frames.find((f) => f.name === 'photo')!.rect;

  it('the text frame’s lines follow the slope of the picture; with its box they keep one measure', () => {
    const shaped = build(md, [pic], { ...PAGE, pageTemplates: [tpl('contour')] });
    const boxed = build(md, [pic], { ...PAGE, pageTemplates: [tpl()] });
    const rect = photoRect(shaped);
    const beside = (doc: VDTDocument) => lines(doc).filter((l) => l.bbox.y < rect.y + rect.height - 0.01);
    const ends = beside(shaped).map((l) => (l.measure ? l.measure.x + l.measure.width : l.bbox.x + l.bbox.width));
    expect(ends.length).toBeGreaterThan(5);
    // The apex at the top right: lines long at the top, shorter down.
    expect(ends[0]!).toBeGreaterThan(rect.x + rect.width * 0.6);
    expect(ends[ends.length - 1]!).toBeLessThan(rect.x + rect.width * 0.2);
    const boxEnds = beside(boxed).filter((l) => l.measure).map((l) => Math.round(l.measure!.x + l.measure!.width));
    expect(new Set(boxEnds).size).toBe(1);
    expect(boxEnds[0]!).toBeLessThanOrEqual(rect.x);
    expect(wrapWarnings(shaped)).toEqual([]);
  });

  it('pushes with the shape as the reflow ladder scaled the picture', () => {
    const small: PageTemplate = { id: 'push', frames: [
      { name: 'text', flow: true, width: mm(150), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'photo', exclude: 'push', wrap: 'contour', layer: 2, width: mm(60), height: mm(30), fit: { imageMinScale: 0.3 }, placement: { anchor: { to: 'container', edge: 'top-right' } } },
    ] };
    const doc = build(md, [pic], { ...PAGE, pageTemplates: [small] });
    const page = doc.pages.find((p) => p.composed)!;
    const photo = page.composed!.frames.find((f) => f.name === 'photo')!;
    expect(photo.imageScale).toBeLessThan(1);
    const picBlock = photo.blockIds.map((id) => page.floats!.find((b) => b.id === id)!).find((b) => b.type === 'resource')!;
    const body = picBlock.resourceBlock!.bodyRect;
    const bodyBottom = picBlock.bbox.y + body.y + body.height;
    // Beside the scaled picture the lines follow its slope, short of the
    // picture's own (scaled) right edge, not of the frame's; under the
    // figure (its caption keeps its box) they take the whole measure.
    const ls = lines(doc);
    const beside = ls.filter((l) => l.bbox.y < bodyBottom - 60);
    const ends = beside.map((l) => l.measure!.x + l.measure!.width);
    expect(ends[0]!).toBeGreaterThan(photo.rect.x + 0.3 * body.width);
    expect(ends[0]!).toBeLessThan(photo.rect.x + body.width);
    for (let i = 1; i < ends.length; i++) expect(ends[i]!).toBeLessThanOrEqual(ends[i - 1]! + 0.01);
    const under = ls.filter((l) => l.bbox.y > picBlock.bbox.y + picBlock.bbox.height + 40);
    expect(under.length).toBeGreaterThan(0);
    for (const l of under) expect(l.measure).toBeUndefined();
  });

  it('the page memo keys the contour: another margin, polygon or trace lays the page again (#857)', () => {
    const cfg = { ...PAGE, pageTemplates: [tpl('contour')] };
    const ends = (r: Resource) => lines(build(md, [r], cfg)).slice(0, 8).map((l) => Math.round(l.measure ? l.measure.x + l.measure.width : -1));
    const base = ends(pic);
    expect(ends(pic)).toEqual(base);
    expect(ends({ ...pic, contour: { ...pic.contour, margin: mm(8) } })).not.toEqual(base);
    expect(ends({ ...pic, contour: { ...pic.contour, points: DIAMOND } })).not.toEqual(base);
    const bmp = (spans: number[]): Resource => ({ id: 'pic', typeId: 'figure', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'p.png', format: 'png', width: 400, height: 400 }, contour: { traced: { fileId: 'p.png', threshold: 0.5, rows: 2, spans } } });
    expect(ends(bmp([0.9, 1, 0, 1]))).not.toEqual(ends(bmp([0, 1, 0, 1])));
  });

  it('scales a contour about a point (a frame laid out at another scale)', () => {
    const c: VDTExclusionContour = { spans: [{ y: 20, height: 10, left: 10, right: 30 }], margin: 4, quantum: 2 };
    expect(scaleContourAbout(c, 10, 20, 0.5)).toEqual({ spans: [{ y: 20, height: 5, left: 10, right: 20 }], margin: 2, quantum: 1 });
    expect(scaleContourAbout(c, 0, 0, 2, false)).toEqual({ spans: [{ y: 40, height: 20, left: 20, right: 60 }], margin: 4, quantum: 2 });
  });

  it('reads and checks the frame key', () => {
    expect(normalizeFrame({ name: 'a', wrap: 'contour' }).wrap).toBe('contour');
    expect(normalizeFrame({ name: 'a', wrap: 'box' }).wrap).toBeUndefined();
    const w = validatePageTemplates({ pageTemplates: [{ id: 't', frames: [{ name: 'a', wrap: 'shape' as never }] }] });
    expect(w).toEqual([expect.objectContaining({ kind: 'unknownConfigValue', path: '/pageTemplates/0/frames/0/wrap', used: 'box' })]);
  });
});
