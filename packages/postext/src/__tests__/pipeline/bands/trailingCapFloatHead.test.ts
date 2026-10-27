import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTColumn, VDTDocument } from '../../../index.js';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 10 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const picture = (id: string, height: number, placement: Resource['placement']): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: 'A picture.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 1600, height },
  placement,
});

const words = 'the lake froze late that year and the ferry kept running until the first week of december when the ice closed over the middle'.split(' ');
const para = (n: number, seed: number) => `${Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(' ')}.`;

/** A story that closes on its first page: the picture heads the second and
 *  third columns, cited from the first, whose text ends above the picture's
 *  foot; `foot` adds a page-wide picture at the foot of the page, cited
 *  first, so it is on the page when the other one looks for its slot. */
const story = (foot: boolean, words: number): VDTDocument => {
  const md = `# One\n\n${foot ? 'First :ref{id="foot"}.\n\n' : ''}${para(6, 1)} See :ref{id="head"}.\n\n${para(words, 2)}\n\n# Two\n\nEnd.`;
  const config: PostextConfig = {
    page: { sizePreset: '17x24', dpi: 150 },
    layout: { layoutType: 'multiple', columnCount: 3 },
    bodyText: { fontSize: { value: 10, unit: 'pt' } },
    headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  };
  const resources = [picture('head', 1400, { position: 'top', columns: 2 }), ...(foot ? [picture('foot', 300, { position: 'bottom', span: 'page' })] : [])];
  return buildDocument({ markdown: md, resources }, config, createMeasurementCache());
};

const bottom = (c: VDTColumn): number => c.bbox.y + c.bbox.height;

describe('a closing band cut under a float that heads its empty columns (#681)', () => {
  // The cut of such a band is taken under the float: the room kept for text
  // between two float bands (three lines) is not asked for under it, where
  // no text comes. Asked for, the cap was retried a line lower three times,
  // and the band ended three lines under the picture, or was not cut.
  for (const words of [3, 8, 30]) {
    it(`ends where it ends with no float at the page's foot (${words} words)`, () => {
      const plain = story(false, words).pages[0]!;
      const doc = story(true, words);
      const page = doc.pages[0]!;
      expect(page.floats?.filter((f) => f.type === 'resource')).toHaveLength(2);
      const head = page.floats!.find((f) => f.resourceBlock?.resource.id === 'head')!;
      const foot = page.floats!.find((f) => f.resourceBlock?.resource.id === 'foot')!;
      const text = page.columns.filter((c) => c.kind !== 'span');
      expect(text[0]!.trailingCap).toBe(true);
      expect(plain.columns[0]!.trailingCap).toBe(true);
      expect(bottom(text[0]!)).toBeCloseTo(bottom(plain.columns[0]!), 1);
      // Within a line of the picture's band, and the columns under the
      // picture hold nothing.
      for (const c of text.slice(1)) {
        expect(c.blocks).toHaveLength(0);
        expect(c.bbox.height).toBeLessThanOrEqual(doc.baselineGrid + 0.5);
        expect(c.bbox.y).toBeGreaterThanOrEqual(head.bbox.y + head.bbox.height - 0.5);
      }
      // The picture at the foot stands clear of the band.
      expect(foot.bbox.y).toBeGreaterThanOrEqual(bottom(text[0]!) - 0.5);
    });
  }

  it('closes the band at its text when the story ends level with the picture\'s band (#713)', () => {
    // 60 words: the first column ends one line under the picture's band,
    // level with the columns under the picture, so no cap is proposed. The
    // band is closed where it stands: before, its columns kept their boxes
    // down to the page's foot, through the picture hugged under the text.
    const doc = story(true, 60);
    const page = doc.pages[0]!;
    const head = page.floats!.find((f) => f.resourceBlock?.resource.id === 'head')!;
    const foot = page.floats!.find((f) => f.resourceBlock?.resource.id === 'foot')!;
    const text = page.columns.filter((c) => c.kind !== 'span');
    const used = text[0]!.bbox.y + text[0]!.bbox.height - text[0]!.availableHeight;
    expect(text[0]!.trailingCap ?? false).toBe(false);
    for (const c of text) expect(bottom(c)).toBeCloseTo(used, 1);
    expect(used - (head.bbox.y + head.bbox.height)).toBeLessThanOrEqual(3 * doc.baselineGrid);
    for (const c of text.slice(1)) {
      expect(c.blocks).toHaveLength(0);
      expect(c.bbox.height).toBeLessThanOrEqual(doc.baselineGrid + 0.5);
    }
    // The picture at the foot is where it was: hugged one line under the text.
    expect(foot.bbox.y).toBeCloseTo(743.1, 0);
    expect(foot.bbox.y).toBeGreaterThanOrEqual(bottom(text[0]!) - 0.5);
    // A story two words longer takes a cap, as before.
    const longer = story(true, 62).pages[0]!.columns.filter((c) => c.kind !== 'span');
    expect(longer[0]!.trailingCap).toBe(true);
  });

  it('keeps the text room between two float bands in a column no cap cut', () => {
    // A long story: the first page flows on, and the picture at the head of
    // a column with the other at its foot leaves at least three lines.
    const md = `# One\n\nFirst :ref{id="foot"}.\n\n${para(6, 1)} See :ref{id="head"}.\n\n${Array.from({ length: 12 }, (_, i) => para(60, i)).join('\n\n')}`;
    const config: PostextConfig = {
      page: { sizePreset: '17x24', dpi: 150 },
      layout: { layoutType: 'multiple', columnCount: 3 },
      bodyText: { fontSize: { value: 10, unit: 'pt' } },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    };
    const doc = buildDocument({ markdown: md, resources: [picture('head', 1400, { position: 'top', columns: 2 }), picture('foot', 1300, { position: 'bottom', span: 'page' })] }, config, createMeasurementCache());
    for (const page of doc.pages) {
      const floats = (page.floats ?? []).filter((f) => f.type === 'resource');
      if (floats.length < 2) continue;
      for (const c of page.columns.filter((k) => k.kind !== 'span' && !k.trailingCap)) {
        const above = floats.some((f) => f.bbox.y + f.bbox.height <= c.bbox.y + 0.5 && f.bbox.x < c.bbox.x + c.bbox.width && f.bbox.x + f.bbox.width > c.bbox.x);
        const below = floats.some((f) => f.bbox.y >= c.bbox.y + c.bbox.height - 0.5 && f.bbox.x < c.bbox.x + c.bbox.width && f.bbox.x + f.bbox.width > c.bbox.x);
        if (above && below) expect(c.bbox.height).toBeGreaterThanOrEqual(3 * doc.baselineGrid - 0.5);
      }
    }
  });
});
