// #930: single-scroll fitting treats a composed frame's blocks as what they
// are, boxes in the frame's own space, not floats of the page.

import { describe, expect, it } from 'vitest';
import { buildDocument, frameBounds } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { fitPagesToContent } from './pageGeometry.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const CONFIG: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
  pageTemplates: [{
    id: 't',
    frames: [
      { name: 'turned', width: mm(30), rotate: 90, placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(10), y: mm(40) } } },
      { name: 'small', width: mm(30), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(80), y: mm(140) } } },
    ],
  }],
} as PostextConfig;

const MARKDOWN = [
  '::::page{template="t"}',
  ':::frame{slot="turned"}',
  'Turned words set across the frame, more than one line of them for sure.',
  ':::',
  ':::frame{slot="small"}',
  'Small words in a frame whose text the ladder scaled down to half.',
  ':::',
  '::::',
].join('\n');

function snapshot(doc: VDTDocument): string {
  return JSON.stringify(doc.pages[0]!.floats!.map((f) => [f.id, f.bbox, f.lines.map((l) => [l.bbox.y, l.baseline])]));
}

describe('single-scroll fitting of a composed page (#930)', () => {
  it('leaves the blocks of every frame where the frame paints them', () => {
    const doc = buildDocument({ markdown: MARKDOWN }, CONFIG);
    const page = doc.pages[0]!;
    page.composed!.frames.find((f) => f.name === 'small')!.scale = 0.5;
    expect(page.floats!.length).toBeGreaterThan(0);
    const before = snapshot(doc);
    page.height = 200_000;
    fitPagesToContent(doc, 24);
    expect(snapshot(doc)).toBe(before);
  });

  it('measures the page by the frames’ boxes on the sheet, not by their blocks', () => {
    const doc = buildDocument({ markdown: MARKDOWN }, CONFIG);
    const page = doc.pages[0]!;
    const small = page.composed!.frames.find((f) => f.name === 'small')!;
    small.scale = 0.5;
    page.height = 200_000;
    fitPagesToContent(doc, 24);
    const bottoms = page.composed!.frames.filter((f) => !f.collapsed).map((f) => { const b = frameBounds(f); return b.y + b.height; });
    const decoration = (page.composed!.decoration?.blocks ?? []).map((b) => b.bbox.y + b.bbox.height);
    expect(page.height).toBe(Math.ceil(Math.max(...bottoms, ...decoration) + 24));
    // Every frame is inside the page that hugs them.
    for (const b of bottoms) expect(page.height).toBeGreaterThanOrEqual(b);
  });
});
