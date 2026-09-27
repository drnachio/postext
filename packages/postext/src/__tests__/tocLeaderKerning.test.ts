import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { dimensionToPx } from '../units';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTLineSegment } from '../vdt';

// EF-148: the contents leader was sized from one dot (`n = room / width of
// '.'`) and painted as `'.'.repeat(n)`. A face that kerns full stops apart
// (Public Sans 700: 6.74 px for one dot, 7.58 px a dot in a run of 30) sets
// that run wider than the room, so the dots ran from the title into the
// page number and the rows stopped ending on one line.

/** 7 px a character, and 3 px more between two full stops in a row: the
 *  face spaces a run of dots apart. */
class KerningCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = s.length * 7;
    for (let i = 1; i < s.length; i++) if (s[i] === '.' && s[i - 1] === '.') w += 3;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): KerningCtx {
    return new KerningCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

const config: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(400),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  layout: { layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false, parity: 'any' } }] },
  headingStyles: [{ id: 'front', numbered: false }],
  toc: { levels: [{ level: 1 }, { level: 2 }] },
};

const markdown = [
  '# Contents {style="front" toc="false"}',
  ':::toc',
  '# One',
  'Some text.',
  '## A',
  'Some text.',
  '## Bb',
  'Some text.',
  '## A much longer section title',
  'Some text.',
].join('\n\n');

const width = (segs: readonly VDTLineSegment[]) => segs.reduce((s, seg) => s + seg.width, 0);

describe('EF-148: a contents leader in a face that kerns its dots', () => {
  const doc = buildDocument({ markdown }, config);
  const col = doc.pages[0]!.columns[0]!;
  const rows = doc.blocks.filter((b: VDTBlock) => b.contentIndex !== undefined && b.pageIndex === 0 && b.type !== 'heading' && b.tocEntry);
  const lastLines = rows.map((b) => b.lines[b.lines.length - 1]!);

  it('lists every entry', () => {
    expect(rows).toHaveLength(4);
  });

  it('keeps every row inside the column: the page number ends at its right edge', () => {
    for (const line of lastLines) {
      expect(line.bbox.x + width(line.segments!)).toBeCloseTo(col.bbox.x + col.bbox.width, 3);
    }
  });

  it('ends the dots of every row on one line, at least the leader gap after the title', () => {
    const ends: number[] = [];
    for (const [i, line] of lastLines.entries()) {
      const segs = line.segments!;
      const dotsAt = segs.findIndex((s) => s.kind === 'text' && /^\.+$/.test(s.text));
      expect(dotsAt).toBeGreaterThan(0);
      const before = segs.slice(0, dotsAt);
      const lead = before.at(-1)!;
      expect(lead.kind).toBe('space');
      const level = rows[i]!.type === 'listItem' || i === 0 ? doc.config.toc.levels[0]! : doc.config.toc.levels[1]!;
      const fontPx = dimensionToPx(level.fontSize, doc.config.page.dpi);
      const gap = dimensionToPx(doc.config.toc.leader.gap, doc.config.page.dpi, fontPx);
      expect(lead.width).toBeGreaterThanOrEqual(gap - 0.01);
      ends.push(line.bbox.x + width(before) + segs[dotsAt]!.width);
    }
    for (const end of ends) expect(end).toBeCloseTo(ends[0]!, 3);
  });
});
