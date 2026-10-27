import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml, TASK_BOX_SIDE_EM, TASK_BOX_TICK, taskBoxSize, taskBoxSvgBody, taskBoxTick } from '../../../index.js';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../../index.js';
import { elementsOf } from '../../htmlText.js';

// #765: the box of a task item (`- [ ]`, `- [x]`) is drawn by the engine.
// Up to postext 1.28 it was the character ☐ (☑ when done) in the list's
// face: no text face holds it, so its shape and its width, which the
// item's text starts after, came from a font of the system.

const BOX = '\u2610';
const TICKED = '\u2611';

/** Every string a measuring context was asked for. 7 px a character,
 *  whatever the font. */
const measured: string[] = [];
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    measured.push(s);
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test', fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...extra,
});

/** The stroke of a box of side 6 at weight 700: a tenth of the side. */
const STROKE = 6 * (700 / 7000);

const MD = ['- [ ] Buy the paper', '- [x] Set the type', '- A plain bullet'].join('\n');

const items = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'listItem');

/** What `build` asked the measuring contexts for. */
function measuresOf(build: () => void): string[] {
  measured.length = 0;
  build();
  return [...measured];
}
// The first layouts of the file: a width asked for again comes from a cache.
const drawnMeasures = measuresOf(() => buildDocument({ markdown: MD }, config()));
const characterMeasures = measuresOf(() => buildDocument({ markdown: MD }, config({ unorderedLists: { taskBox: 'character' } })));

describe('the measure of a task item (#765)', () => {
  it('asks no font for the box, where the character of 1.28 was measured in the list face', () => {
    expect(drawnMeasures.length).toBeGreaterThan(0);
    expect(drawnMeasures.filter((s) => s.includes(BOX) || s.includes(TICKED))).toEqual([]);
    // The bullet of the third item is still text.
    expect(drawnMeasures).toContain('\u2022');
    expect(characterMeasures).toContain(BOX);
    expect(characterMeasures).toContain(TICKED);
  });
});

describe('the box of a task item in the layout (#765)', () => {
  const doc = buildDocument({ markdown: MD }, config());
  const [open, done, bullet] = items(doc);

  it('is a square of 0.6 em of the marker, its stroke a tenth of the side at weight 700', () => {
    expect(TASK_BOX_SIDE_EM).toBe(0.6);
    expect(open!.bulletBox).toEqual({ side: 6, stroke: STROKE, checked: false });
    expect(done!.bulletBox).toEqual({ side: 6, stroke: STROKE, checked: true });
    expect(bullet!.bulletBox).toBeUndefined();
    expect(taskBoxSize(10, 700)).toEqual({ side: 6, stroke: STROKE });
    expect(STROKE).toBeCloseTo(0.6, 12);
    // Lighter with the weight, and never under a twentieth of the side.
    expect(taskBoxSize(10, 400).stroke).toBeCloseTo(6 * (400 / 7000), 10);
    expect(taskBoxSize(10, 100).stroke).toBeCloseTo(0.3, 10);
  });

  it('carries no character and no face of its own', () => {
    for (const item of [open!, done!]) {
      expect(item.bulletText).toBeUndefined();
      expect(item.bulletFontString).toBeUndefined();
      expect(item.listKind).toBe('task');
      expect(item.bulletColor).toBe(bullet!.bulletColor);
    }
    expect(bullet!.bulletText).toBe('\u2022');
  });

  it('starts at the item\u2019s indent, centred where a bullet is, and the text starts a gap after its side', () => {
    for (const item of [open!, done!]) {
      const line = item.lines[0]!;
      expect(item.bulletOffsetX).toBe(item.bbox.x);
      // 0.3 em of the text above the baseline: at the text's size the box
      // stands on the baseline.
      expect(item.bulletY).toBeCloseTo(line.baseline - 3, 10);
      expect(item.bulletY! + item.bulletBox!.side / 2).toBeCloseTo(line.baseline, 10);
      // side (6) + gap (0.5 em = 5)
      expect(line.bbox.x - item.bulletOffsetX!).toBeCloseTo(11, 10);
    }
    // The bullet keeps the room its face gives it: 7 px in this measure.
    expect(bullet!.lines[0]!.bbox.x - bullet!.bulletOffsetX!).toBeCloseTo(12, 10);
  });

  it('follows the size and the weight of its level', () => {
    const big = buildDocument({ markdown: MD }, config({ unorderedLists: { bulletFontSize: pt(20), fontWeight: 400 } }));
    const [first] = items(big);
    expect(first!.bulletBox!.side).toBeCloseTo(12, 10);
    expect(first!.bulletBox!.stroke).toBeCloseTo(12 * (400 / 7000), 10);
    expect(first!.lines[0]!.bbox.x - first!.bulletOffsetX!).toBeCloseTo(17, 10);
  });

  it('sets a character of the author\u2019s own as text, measured in the list face', () => {
    const own = buildDocument({ markdown: MD }, config({ unorderedLists: { taskCheckboxChar: '[ ]', taskCheckedChar: '[x]' } }));
    const [a, b] = items(own);
    expect([a!.bulletText, b!.bulletText]).toEqual(['[ ]', '[x]']);
    expect(a!.bulletBox ?? b!.bulletBox).toBeUndefined();
    expect(a!.bulletFontString).toMatch(/Test/);
    expect(a!.lines[0]!.bbox.x - a!.bulletOffsetX!).toBeCloseTo(3 * 7 + 5, 10);
    // One state named, the other left to the default: each on its own.
    const mixed = buildDocument({ markdown: MD }, config({ unorderedLists: { taskCheckedChar: '\u2713' } }));
    const [c, d] = items(mixed);
    expect(c!.bulletBox).toEqual({ side: 6, stroke: STROKE, checked: false });
    expect(d!.bulletText).toBe('\u2713');
    expect(d!.bulletBox).toBeUndefined();
  });

  it('keeps the character of 1.28 under taskBox: character', () => {
    const legacy = buildDocument({ markdown: MD }, config({ unorderedLists: { taskBox: 'character' } }));
    const [a, b] = items(legacy);
    expect([a!.bulletText, b!.bulletText]).toEqual([BOX, TICKED]);
    expect(a!.bulletBox ?? b!.bulletBox).toBeUndefined();
    expect(a!.bulletFontString).toMatch(/Test/);
    // The width the measure gives the character: 7 px here.
    expect(a!.lines[0]!.bbox.x - a!.bulletOffsetX!).toBeCloseTo(12, 10);
  });

  it('draws the box of an item inside a callout too', () => {
    const boxed = buildDocument({ markdown: [':::callout{type="note"}', '- [x] Inside the box', ':::'].join('\n') }, config());
    const inside = boxed.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).filter((b) => b.type === 'listItem');
    expect(inside.length).toBeGreaterThan(0);
    expect(inside[0]!.bulletBox?.checked).toBe(true);
    expect(inside[0]!.bulletText).toBeUndefined();
  });
});

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const at = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

interface Stroke { points: Array<[number, number]>; rect: boolean; color: unknown; width: unknown; cap: unknown }

/** A 2D context that tracks its transform and records every text it is
 *  asked to paint and every path it strokes, the points on the sheet.
 *  Every method it does not know is a no-op. */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: string[]; strokes: Stroke[] } {
  const texts: string[] = [];
  const strokes: Stroke[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  let path: Array<[number, number]> = [];
  let rect = false;
  const t: Record<string, unknown> = {
    font: '', textAlign: 'left', direction: 'ltr', textBaseline: 'alphabetic', letterSpacing: '0px', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    save() { stack.push(m); },
    restore() { m = stack.pop() ?? m; },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) { m = mul(m, [a, b, c, d, e, f]); },
    translate(x: number, y: number) { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale(x: number, y: number) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    measureText(s: string) { return { width: [...s].length * 7 }; },
    fillText(text: string) { texts.push(text); },
    strokeText(text: string) { texts.push(text); },
    beginPath() { path = []; rect = false; },
    moveTo(x: number, y: number) { path.push(at(m, x, y)); },
    lineTo(x: number, y: number) { path.push(at(m, x, y)); },
    rect(x: number, y: number, w: number, h: number) { rect = true; path.push(at(m, x, y), at(m, x + w, y + h)); },
    stroke() { strokes.push({ points: path, rect, color: t.strokeStyle, width: t.lineWidth, cap: t.lineCap }); },
  };
  const ctx = new Proxy(t, {
    get(target, key) {
      if (typeof key === 'string' && key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key as string] = value; return true; },
    deleteProperty(target, key) { delete target[key as string]; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, texts, strokes };
}

const paint = (doc: VDTDocument) => {
  const rec = recordingCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, rec.canvas);
  return rec;
};

/** The tick of a recorded page, its points from the centre of the box
 *  outline stroked just before it. */
function tickOf(strokes: Stroke[]): Array<[number, number]> {
  const i = strokes.findIndex((s) => !s.rect && s.points.length === 3);
  const box = strokes[i - 1]!;
  const cx = (box.points[0]![0] + box.points[1]![0]) / 2;
  const cy = (box.points[0]![1] + box.points[1]![1]) / 2;
  return strokes[i]!.points.map(([x, y]) => [x - cx, y - cy]);
}

describe('the box of a task item on the canvas (#765)', () => {
  const doc = buildDocument({ markdown: MD }, config());
  const [open, done] = items(doc);

  it('strokes paths and paints no text for it', () => {
    const { texts, strokes } = paint(doc);
    expect(texts.join(' ')).toContain('Buy');
    expect(texts.some((s) => s.includes(BOX) || s.includes(TICKED))).toBe(false);
    // The bullet of the third item is text, as before.
    expect(texts).toContain('\u2022');
    const boxes = strokes.filter((s) => s.rect);
    expect(boxes).toHaveLength(2);
    // The outline stands inside the square: from half a stroke in.
    for (const [box, item] of [[boxes[0]!, open!], [boxes[1]!, done!]] as const) {
      const [[x0, y0], [x1, y1]] = box.points as [[number, number], [number, number]];
      expect(x0).toBeCloseTo(item.bulletOffsetX! + 0.3, 10);
      expect(x1).toBeCloseTo(item.bulletOffsetX! + 5.7, 10);
      expect(y0).toBeCloseTo(item.bulletY! - 2.7, 10);
      expect(y1).toBeCloseTo(item.bulletY! + 2.7, 10);
      expect(box.width).toBe(STROKE);
      expect(box.color).toBe(item.bulletColor);
    }
  });

  it('ticks the done item only, with round ends', () => {
    const { strokes } = paint(doc);
    const ticks = strokes.filter((s) => !s.rect && s.points.length === 3);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.cap).toBe('round');
    expect(ticks[0]!.width).toBe(STROKE);
    const cx = done!.bulletOffsetX! + 3;
    const cy = done!.bulletY!;
    ticks[0]!.points.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(cx + (TASK_BOX_TICK[i]![0] - 0.5) * 6, 10);
      expect(y).toBeCloseTo(cy + (TASK_BOX_TICK[i]![1] - 0.5) * 6, 10);
    });
  });

  it('reads the tick the same on a right-to-left page and on a vertical one', () => {
    const upright = tickOf(paint(doc).strokes);
    const rtl = buildDocument({ markdown: MD }, config({ direction: 'rtl', locale: 'en' }));
    expect(rtl.pages[0]!.flow?.writingMode).toBe('horizontal-tb');
    const vertical = buildDocument({ markdown: MD }, config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    expect(vertical.pages[0]!.flow?.writingMode).toBe('vertical-rl');
    for (const turned of [rtl, vertical]) {
      const rec = paint(turned);
      expect(rec.texts.some((s) => s.includes(BOX) || s.includes(TICKED))).toBe(false);
      const tick = tickOf(rec.strokes);
      tick.forEach(([x, y], i) => {
        expect(x).toBeCloseTo(upright[i]![0], 8);
        expect(y).toBeCloseTo(upright[i]![1], 8);
      });
    }
    // The box of a right-to-left item stands on the text's start side, its
    // own side from the block's edge.
    const [first] = items(rtl);
    expect(first!.bulletBox).toEqual({ side: 6, stroke: STROKE, checked: false });
  });

  it('turns the points of the tick back for the flow it is painted in', () => {
    expect(taskBoxTick(10)).toEqual(TASK_BOX_TICK.map(([x, y]) => [(x - 0.5) * 10, (y - 0.5) * 10]));
    expect(taskBoxTick(10, 'mirrored')).toEqual(taskBoxTick(10).map(([x, y]) => [-x, y]));
    expect(taskBoxTick(10, 'vertical')).toEqual(taskBoxTick(10).map(([x, y]) => [y, -x]));
  });
});

describe('the box of a task item in the HTML (#765)', () => {
  const doc = buildDocument({ markdown: MD }, config());
  const [open, done] = items(doc);
  const html = renderToHtml(doc);
  const boxes = elementsOf(html, '<div class="pt-bullet pt-task-box"', '</div>').map((e) => e.outer);

  it('is an inline SVG in an image named by the character it stands for', () => {
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain(`role="img" aria-label="${BOX}"`);
    expect(boxes[1]).toContain(`role="img" aria-label="${TICKED}"`);
    for (const [markup, item] of [[boxes[0]!, open!], [boxes[1]!, done!]] as const) {
      expect(markup).toContain(`left:${item.bulletOffsetX}px;top:${item.bulletY! - 3}px;width:6px;height:6px;`);
      expect(markup).toContain(`color:${item.bulletColor};`);
      expect(markup).toContain('<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" width="6" height="6"');
      expect(markup).toContain('<rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" stroke-width="10"/>');
      // No font is named for it.
      expect(markup).not.toMatch(/font:|font-family/);
    }
    expect(boxes[0]).not.toContain('<path');
    expect(boxes[1]).toContain('<path d="M22 52L42 72L78 28" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>');
  });

  it('holds the character as text of no size, so a selection copies it', () => {
    expect(boxes[0]).toMatch(new RegExp(`font-size:0;"><svg .*</svg>${BOX}</div>$`));
    expect(boxes[1]).toMatch(new RegExp(`</svg>${TICKED}</div>$`));
    // The bullet of the plain item is still a text marker.
    expect(html).toMatch(/<div class="pt-bullet" aria-hidden="true"[^>]*>\u2022<\/div>/);
    expect(html).not.toMatch(new RegExp(`<div class="pt-bullet" aria-hidden="true"[^>]*>[${BOX}${TICKED}]`));
  });

  it('draws the tick turned back on a vertical page', () => {
    const vertical = buildDocument({ markdown: MD }, config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const turned = elementsOf(renderToHtml(vertical), '<div class="pt-bullet pt-task-box"', '</div>').map((e) => e.outer);
    expect(turned).toHaveLength(2);
    expect(turned[1]).toContain(taskBoxSvgBody(0.1, true, 'vertical'));
    expect(taskBoxSvgBody(0.1, true, 'vertical')).not.toBe(taskBoxSvgBody(0.1, true));
    expect(taskBoxSvgBody(0.1, true, 'vertical')).toContain('<path d="M52 78L72 58L28 22"');
  });

  it('keeps the character as a text marker under taskBox: character', () => {
    const legacy = renderToHtml(buildDocument({ markdown: MD }, config({ unorderedLists: { taskBox: 'character' } })));
    expect(legacy).not.toContain('pt-task-box');
    expect(legacy).toMatch(new RegExp(`<div class="pt-bullet" aria-hidden="true"[^>]*>${BOX}</div>`));
  });
});
