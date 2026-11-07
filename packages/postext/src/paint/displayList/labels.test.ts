import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { mapPartsFixture } from '../../__tests__/composed/fixtures/mapParts.js';
import { markerPath } from './labels.js';
import { pageDisplayList } from './page.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return { width: [...s].length * (m ? Number(m[1]) : 10) * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

describe('figure labels in the display list (#1444)', () => {
  it('draws a figure\'s labels over its picture: leaders, plates, then words', () => {
    const f = mapPartsFixture('en');
    const doc = buildDocument({ markdown: f.markdown, resources: f.resources }, f.config, createMeasurementCache());
    const index = doc.pages.findIndex((p) => (p.floats ?? []).some((b) => b.resourceBlock?.labels?.length));
    expect(index).toBeGreaterThanOrEqual(0);
    const page = pageDisplayList(doc, index);
    const labels = page.items.filter((i) => i.kind === 'text' && i.role === 'label');
    const words = labels.map((i) => (i.kind === 'text' ? i.lines.map((l) => l.text).join(' ') : ''));
    expect(words).toEqual(expect.arrayContaining(['VARENIA', 'Grey Peaks', 'Lake Orla']));
    // Drawn, never read back: the semantic export carries the words.
    for (const l of labels) if (l.kind === 'text') expect(l.source?.generated).toBe(true);
    // After the picture they lie on.
    const picture = page.items.findIndex((i) => i.kind === 'image');
    expect(page.items.findIndex((i) => i.kind === 'text' && i.role === 'label')).toBeGreaterThan(picture);
  });

  it('draws a leader\'s end marks as paths', () => {
    const dot = markerPath({ kind: 'dot', x: 10, y: 10, angle: 0, sizePx: 4, color: '#000' });
    expect(dot.fill).toBe('#000');
    expect(dot.subpaths[0]![0]).toEqual({ op: 'M', x: 12, y: 10 });
    const arrow = markerPath({ kind: 'arrow', x: 10, y: 10, angle: 0, sizePx: 4, color: '#000' });
    expect(arrow.subpaths[0]).toEqual([{ op: 'M', x: 10, y: 10 }, { op: 'L', x: 6, y: 12 }, { op: 'L', x: 6, y: 8 }, { op: 'Z' }]);
    expect(markerPath({ kind: 'ring', x: 0, y: 0, angle: 0, sizePx: 4, color: '#000', widthPx: 1 }).stroke).toEqual({ color: '#000', widthPx: 1 });
  });
});
