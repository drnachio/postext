import { describe, expect, it } from 'vitest';
import { buildDocument, polygonBBox, type PostextConfig, type Resource, type VDTComicPage } from 'postext';
import {
  dragSplitter,
  letterboxedPanels,
  movedPanels,
  nearerEnd,
  nudgeSplitter,
  panelAt,
  percentAt,
  splitterAt,
  splitterBand,
  splitterCursor,
  splitterEndRanges,
  splitterLine,
} from './comicDrag';

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

const config: PostextConfig = { page: { sizePreset: '17x24' } };

const picture = (id: string, width: number, height: number, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `file-${id}`, format: 'png', width, height },
  ...extra,
});

function comicOf(markdown: string, resources: Resource[] = []): VDTComicPage {
  const doc = buildDocument({ markdown, resources }, config);
  return doc.pages.find((p) => p.comic)!.comic!;
}

const PAGE = `:::page{split="30 [30 | 20 | *] / *" gutter=4mm}\n::panel\n::panel\n::panel\n::panel\n:::\n`;

describe('comic splitter hit testing', () => {
  const comic = comicOf(PAGE);
  const tiers = comic.splitters.find((s) => s.path.length === 0)!;
  const col = comic.splitters.find((s) => s.path.length === 1 && s.boundary === 0)!;

  it('finds the splitter whose gutter lies under the pointer', () => {
    const mid = { x: (tiers.a.x + tiers.b.x) / 2, y: (tiers.a.y + tiers.b.y) / 2 };
    expect(splitterAt(comic, mid.x, mid.y, 1)).toBe(tiers);
    // Inside the gutter band, off the centre line.
    expect(splitterAt(comic, mid.x, mid.y + tiers.gutter / 2 - 0.5, 1)).toBe(tiers);
    // Past the gutter: a panel, unless the minimum band reaches it.
    expect(splitterAt(comic, mid.x, mid.y + tiers.gutter, 1)).toBeNull();
    expect(splitterAt(comic, mid.x, mid.y + tiers.gutter, tiers.gutter * 3)).toBe(tiers);
    const c = { x: col.a.x, y: (col.a.y + col.b.y) / 2 };
    expect(splitterAt(comic, c.x, c.y, 1)).toBe(col);
    // Where a column line ends on the tiers line, the tiers line wins.
    expect(splitterAt(comic, col.b.x, col.b.y, 8)).toBe(tiers);
  });

  it('finds the panel under the pointer, none in a gutter', () => {
    const p = comic.panels[3]!;
    expect(panelAt(comic, p.bbox.x + p.bbox.width / 2, p.bbox.y + p.bbox.height / 2)).toBe(p);
    expect(panelAt(comic, (tiers.a.x + tiers.b.x) / 2, tiers.a.y)).toBeNull();
  });

  it('shows the cursor of the way the line moves', () => {
    expect(splitterCursor(tiers)).toBe('row-resize');
    expect(splitterCursor(col)).toBe('col-resize');
    // A slanted line takes the nearer of the two.
    expect(splitterCursor({ a: { x: 0, y: 0 }, b: { x: 10, y: 30 } })).toBe('col-resize');
    expect(splitterCursor({ a: { x: 0, y: 0 }, b: { x: 30, y: 10 } })).toBe('row-resize');
    const band = splitterBand(tiers, 0);
    expect(polygonBBox(band).height).toBeCloseTo(tiers.gutter, 6);
  });
});

describe('comic splitter drag', () => {
  const comic = comicOf(PAGE);
  const tiers = comic.splitters.find((s) => s.path.length === 0)!;
  const col = comic.splitters.find((s) => s.path.length === 1 && s.boundary === 0)!;
  const grab = { x: (tiers.a.x + tiers.b.x) / 2, y: tiers.a.y };
  const down = (pct: number) => ({ x: grab.x, y: grab.y + (pct / 100) * tiers.parent.height });

  it('turns the pointer travel into percent of the parent cell', () => {
    expect(percentAt(comic, tiers, grab)).toBeCloseTo(30, 6);
    const pos = dragSplitter(comic, tiers, grab, down(12.34));
    expect(pos.start).toBeCloseTo(42.3, 6);
    expect(pos.end).toBe(pos.start);
    // The line drawn at that position.
    const line = splitterLine(comic, tiers, pos);
    expect(line.a.y).toBeCloseTo(tiers.parent.y + 0.423 * tiers.parent.height, 6);
  });

  it('clamps the line so every cell keeps 5 %', () => {
    expect(dragSplitter(comic, tiers, grab, down(90)).start).toBe(95);
    expect(dragSplitter(comic, tiers, grab, down(-90)).start).toBe(5);
    // A column line between two others.
    const ranges = splitterEndRanges(comic, col);
    expect(ranges.start).toEqual([5, 45]);
    const right = { x: col.a.x + col.parent.width, y: col.a.y };
    expect(dragSplitter(comic, col, col.a, right).start).toBe(45);
  });

  it('snaps to 5 % with Shift', () => {
    expect(dragSplitter(comic, tiers, grab, down(12.34), { snap: true }).start).toBe(40);
    expect(dragSplitter(comic, tiers, grab, down(13), { snap: true }).start).toBe(45);
  });

  it('moves only the nearer end with Alt, slanting the line', () => {
    const nearStart = { x: tiers.a.x + 5, y: tiers.a.y };
    expect(nearerEnd(tiers, nearStart)).toBe('start');
    const pos = dragSplitter(comic, tiers, nearStart, { x: nearStart.x, y: nearStart.y + 0.1 * tiers.parent.height }, { oneEnd: true });
    expect(pos).toEqual({ start: 40, end: 30 });
    const nearEnd = { x: tiers.b.x - 5, y: tiers.b.y };
    const pos2 = dragSplitter(comic, tiers, nearEnd, { x: nearEnd.x, y: nearEnd.y - 0.1 * tiers.parent.height }, { oneEnd: true });
    expect(pos2).toEqual({ start: 30, end: 20 });
  });

  it('keeps a slant when the whole line moves, inside both ends\' ranges', () => {
    const slanted = comicOf(`:::page{split="30~60 / *"}\n::panel\n::panel\n:::\n`);
    const s = slanted.splitters[0]!;
    expect([s.startPercent, s.endPercent]).toEqual([30, 60]);
    const pos = nudgeSplitter(slanted, s, { start: 30, end: 60 }, 50);
    expect(pos).toEqual({ start: 65, end: 95 });
  });

  it('counts columns from the right on a page read right to left', () => {
    const rtl = comicOf(`:::page{split="30 | *" direction=rtl}\n::panel\n::panel\n:::\n`);
    const s = rtl.splitters[0]!;
    expect(s.a.x).toBeCloseTo(s.parent.x + s.parent.width * 0.7, 6);
    const left = { x: s.a.x - 0.1 * s.parent.width, y: s.a.y };
    expect(dragSplitter(rtl, s, s.a, left).start).toBeCloseTo(40, 6);
  });
});

describe('comic splitter preview', () => {
  // A wide picture whose safe area spans its whole width: a cover crop
  // keeps it whole only in cells at least as wide as they are high.
  const resources = [picture('wide', 1000, 1000, { safeArea: { x: 0, y: 0.35, width: 1, height: 0.3 } })];
  const comic = comicOf(`:::page{split="40 / *"}\n::panel{art=wide}\n::panel\n:::\n`, resources);
  const s = comic.splitters[0]!;

  it('stretches the panels either side of the moving line', () => {
    const moved = movedPanels(comic, s, { start: 60, end: 60 });
    expect([...moved.keys()]).toEqual([0, 1]);
    const top = polygonBBox(moved.get(0)!);
    const bottom = polygonBBox(moved.get(1)!);
    const old0 = comic.panels[0]!.bbox;
    expect(top.y).toBeCloseTo(old0.y, 6);
    expect(top.height).toBeGreaterThan(old0.height * 1.4);
    expect(bottom.y + bottom.height).toBeCloseTo(comic.panels[1]!.bbox.y + comic.panels[1]!.bbox.height, 6);
    expect(bottom.height).toBeLessThan(comic.panels[1]!.bbox.height);
  });

  it('flags a panel whose art would letterbox', () => {
    expect(letterboxedPanels(comic, movedPanels(comic, s, { start: 45, end: 45 }), resources)).toEqual([]);
    expect(letterboxedPanels(comic, movedPanels(comic, s, { start: 85, end: 85 }), resources)).toEqual([0]);
    // No resources at hand: nothing to tell.
    expect(letterboxedPanels(comic, movedPanels(comic, s, { start: 85, end: 85 }), null)).toEqual([]);
  });
});
