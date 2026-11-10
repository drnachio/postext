import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../index.js';
import { documentDisplayList } from '../../paint/displayList/index.js';
import { CENTRAL } from '../../measure/cjk/cjkAnnotate.js';
import { STRIKE_AT } from '../../marks/strikeGeometry.js';
import type { PostextConfig, Resource, VDTDocument, VDTLine, VDTLineMark } from '../../index.js';

// Struck-through text (`~~…~~`): the layout is the one without the line,
// and each line holding struck words gets a `VDTLine.marks` line through
// them, which every renderer draws.

// Deterministic text measurement stub (no DOM in the node test env): 7 px
// per character at 16 px, scaled with the font size.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '16');
    return { width: s.length * size * 0.4375 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE: PostextConfig = {
  page: { width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  bodyText: { fontSize: pt(12), lineHeight: pt(16), textAlign: 'left' },
  header: { elements: [] },
  footer: { elements: [] },
};

const build = (markdown: string, config: PostextConfig = PAGE, resources?: Resource[]): VDTDocument =>
  buildDocument({ markdown, ...(resources ? { resources } : {}) }, config, createMeasurementCache());
const lines = (doc: VDTDocument): VDTLine[] => doc.blocks.filter((b) => b.type !== 'resource').flatMap((b) => b.lines);
const strikes = (line: VDTLine): VDTLineMark[] => (line.marks ?? []).filter((m) => m.kind === 'line');
/** The size of the body text, px. */
const emOf = (doc: VDTDocument): number => parseFloat(/(\d*\.?\d+)px/.exec(doc.blocks[0]!.fontString)![1]!);

describe('strikethrough lines', () => {
  it('draws one line through the struck words and the space between them, not past them', () => {
    const doc = build('Widget A ~~old price~~ new price.');
    const [line] = lines(doc);
    const marks = strikes(line!);
    expect(marks).toHaveLength(1);
    const segs = line!.segments!;
    const struck = segs.filter((s) => s.strike);
    expect(struck.map((s) => s.text)).toEqual(['old', 'price']);
    const em = emOf(doc);
    expect(marks[0]!.y).toBeCloseTo(-STRIKE_AT * em, 5);
    expect(marks[0]!.thickness).toBeCloseTo(0.05 * em, 5);
    // From the start of `old` to the end of `price`, the space included.
    const before = segs.slice(0, segs.indexOf(struck[0]!)).reduce((w, s) => w + s.width, 0);
    const through = segs.slice(segs.indexOf(struck[0]!), segs.indexOf(struck[1]!) + 1).reduce((w, s) => w + s.width, 0);
    expect(marks[0]!.x).toBeCloseTo(before, 3);
    expect(marks[0]!.length).toBeCloseTo(through, 3);
  });

  it('leaves the layout as it is without the line', () => {
    const text = 'Widget A was sold for a long time at its old price before the new price list came out in spring, and the change took a while.';
    const struck = build(text.replace('its old price before the new price', '~~its old price before the new price~~'));
    const plain = build(text);
    expect(lines(struck).map((l) => l.text)).toEqual(lines(plain).map((l) => l.text));
    expect(lines(struck).map((l) => l.segments!.map((s) => s.width))).toEqual(lines(plain).map((l) => l.segments!.map((s) => s.width)));
    expect(lines(plain).some((l) => l.marks)).toBe(false);
  });

  it('strikes a run broken over two lines on each of them', () => {
    const doc = build(`Before ~~${'struck words '.repeat(8).trim()}~~ after.`);
    const struckLines = lines(doc).filter((l) => l.segments?.some((s) => s.strike));
    expect(struckLines.length).toBeGreaterThan(1);
    for (const l of struckLines) expect(strikes(l)).toHaveLength(1);
  });

  it('keeps a full stop glued to the run out of the line', () => {
    const doc = build('It cost ~~165~~. Now less.');
    const line = lines(doc)[0]!;
    const seg = line.segments!.find((s) => s.strike)!;
    expect(seg.text).toBe('165.');
    expect(seg.strike).toEqual({ id: 0, from: 0, to: 3 });
    expect(strikes(line)[0]!.length).toBeCloseTo((seg.width * 3) / 4, 3);
  });

  it('keeps two runs side by side apart', () => {
    const line = lines(build('~~one~~ ~~two~~ three'))[0]!;
    expect(strikes(line)).toHaveLength(2);
  });

  it('draws the line in the colour of the struck text', () => {
    const doc = build('Plain **~~bold old~~** text.', { ...PAGE, bodyText: { ...PAGE.bodyText, boldColor: { hex: '#aa0000', model: 'hex' } } } as PostextConfig);
    const marks = strikes(lines(doc)[0]!);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.color).toBe('#aa0000');
  });

  it('strikes the words of a table cell', () => {
    const table: Resource = {
      id: 'prices', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[{ content: 'Item', isHeader: true }, { content: 'Price', isHeader: true }], [{ content: 'Widget A' }, { content: '~~€ 165~~ € 129' }]] } },
      placement: { position: 'here' },
    };
    const doc = build('A list.\n\n::resource{id="prices"}\n\nAfter.', PAGE, [table]);
    const resource = doc.blocks.find((b) => b.type === 'resource' && b.resourceBlock?.table);
    expect(resource).toBeDefined();
    const cellLines = resource!.resourceBlock!.table!.cells.flatMap((c) => c.lines ?? []);
    const struck = cellLines.filter((l) => l.segments?.some((s) => s.strike));
    expect(struck).toHaveLength(1);
    expect(strikes(struck[0]!)).toHaveLength(1);
  });

  it('strikes the words inside a chip, and a chip struck whole', () => {
    const doc = build('Code :chip[~~old~~ new] and ~~:chip[gone]~~ here.');
    const segs = lines(doc).flatMap((l) => l.segments!);
    const chips = segs.filter((s) => s.chip);
    expect(chips).toHaveLength(2);
    const inner = chips[0]!.chip!;
    expect(inner.strikes).toHaveLength(1);
    expect(inner.strikes![0]!.x).toBe(0);
    expect(inner.strikes![0]!.length).toBeCloseTo(inner.runs[0]!.width * (3 / inner.runs[0]!.text.length), 3);
    // A chip struck whole has its words struck, inside its box.
    expect(chips[1]!.chip!.strikes).toHaveLength(1);
    expect(chips[1]!.chip!.strikes![0]!.length).toBeCloseTo(chips[1]!.chip!.runs[0]!.width, 3);
  });

  it('runs the line down the central axis of vertical text', () => {
    const config: PostextConfig = { page: { width: pt(300), height: pt(420) }, layout: { writingMode: 'vertical-rl' }, locale: 'zh-Hans', bodyText: { fontSize: pt(12), lineHeight: pt(20) } };
    const doc = build('原价~~一百元~~，现价八十元。', config);
    const line = lines(doc).find((l) => l.segments?.some((s) => s.strike))!;
    const marks = strikes(line);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.y).toBeCloseTo(-CENTRAL * emOf(doc), 3);
  });
});

describe('strikethrough in the outputs', () => {
  it('wraps the struck words in <s> in HTML and draws the line from the layout', () => {
    const html = renderToHtml(build('Widget A ~~old price~~ new price.'));
    expect(html.match(/<s style="text-decoration:none;">/g)).toHaveLength(2);
    expect(html).toContain('>old<');
    // The line is the line's mark: hidden from assistive technology.
    expect(html).toMatch(/aria-hidden="true" style="position:absolute;left:[\d.]+px;top:-[\d.]+px;width:[\d.]+px;height:[\d.]+px;background:/);
  });

  it('flags whole struck runs in the display list (the Word export)', () => {
    const list = documentDisplayList(build('Widget A ~~old~~ new.'));
    const runs = list.flatMap((p) => p.items).flatMap((i) => (i.kind === 'text' ? i.lines.flatMap((l) => l.runs) : []));
    expect(runs.filter((r) => r.strike).map((r) => r.text)).toEqual(['old']);
  });

  it('flags the spaces inside a struck run, not those around it', () => {
    const list = documentDisplayList(build('Widget A ~~old price~~ new ~~one~~ ~~two~~ end.'));
    const runs = list.flatMap((p) => p.items).flatMap((i) => (i.kind === 'text' ? i.lines.flatMap((l) => l.runs) : []));
    expect(runs.filter((r) => r.strike).map((r) => r.text)).toEqual(['old', ' ', 'price', 'one', 'two']);
  });
});

/** A 2D context that records the rectangles filled on it. */
function recordingCanvas(): { canvas: HTMLCanvasElement; rects: { x: number; y: number; w: number; h: number }[] } {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({ textBaseline: 'alphabetic', font: '' } as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (key === 'fillRect') return (x: number, y: number, w: number, h: number) => { rects.push({ x, y, w, h }); };
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, rects };
}

describe('strikethrough on the canvas', () => {
  it('strokes the line of a struck run and of struck words in a chip', () => {
    const doc = build('Widget A ~~old~~ new, :chip[~~gone~~] here.');
    const line = lines(doc)[0]!;
    const mark = strikes(line)[0]!;
    const chipLine = lines(doc).find((l) => l.segments?.some((s) => s.chip))!;
    const chipSeg = chipLine.segments!.find((s) => s.chip)!;
    const { canvas, rects } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas, { scale: 1 });
    // A band `thickness` high centred on the line's y.
    const drawn = (y: number, length: number, thickness: number): boolean =>
      rects.some((r) => Math.abs(r.y + r.h / 2 - y) < 1e-6 && Math.abs(r.w - length) < 1e-6 && Math.abs(r.h - thickness) < 1e-6);
    expect(drawn(line.baseline + mark.y, mark.length!, mark.thickness)).toBe(true);
    const inChip = chipSeg.chip!.strikes![0]!;
    expect(drawn(chipLine.baseline + inChip.y, inChip.length, inChip.thickness)).toBe(true);
  });
});
