import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import type { PostextConfig } from '../types';
import type { VDTBlock } from '../vdt';

// #401: a contents number wider than the number column (an Arabic chapter
// label `الفصل {1:ordinal}`, a `Chapter {1}`) was right-aligned in a 2 em
// column and printed over the title. The column now takes the widest
// number of the level when that is wider; numbers that fit change nothing.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
function config(template: string, extra: Partial<PostextConfig> = {}): PostextConfig {
  return {
    page: { dpi: 72, width: pt(360), height: pt(400), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
    layout: { layoutType: 'single' },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false }, numberingTemplate: template }, { level: 2, numberingTemplate: '{1}.{2}' }] },
    headingStyles: [{ id: 'front', numbered: false, toc: false }],
    toc: { levels: [{ level: 1, fontSize: pt(10), numberFontSize: pt(10) }, { level: 2, fontSize: pt(10), numberFontSize: pt(10), numberWidth: pt(30) }] },
    ...extra,
  };
}
const chapters = (titles: string[]) => ['# Contents {style="front"}', ':::toc', ...titles.flatMap((t) => [`# ${t}`, 'Text.', '## Sub', 'Text.'])].join('\n\n');
/** Contents rows with a number; level 2's are `1.1`, `2.1`… */
const entries = (blocks: VDTBlock[], level: number) =>
  blocks.filter((b) => b.tocEntry !== undefined && b.bulletText && /[.٫]/.test(b.bulletText) === (level === 2));

describe('#401: contents number column', () => {
  it('widens to the widest label of the level, every title starting at one place', () => {
    const doc = buildDocument({ markdown: chapters(['One', 'Two']) }, config('Chapter {1}'));
    const rows = entries(doc.blocks, 1);
    expect(rows.map((b) => b.bulletText)).toEqual(['Chapter 1', 'Chapter 2']);
    // 'Chapter 1' is 63 px; the column (20 px, 2 em) becomes 63 px and the
    // title starts after it and the 0.5 em gap.
    for (const b of rows) {
      const titleX = b.lines[0]!.bbox.x;
      expect(titleX - b.bbox.x).toBeCloseTo(63 + 5, 6);
      expect(b.bulletOffsetX! + 63).toBeLessThanOrEqual(titleX - 5 + 1e-6);
    }
    // The other level keeps its own column.
    const subs = entries(doc.blocks, 2);
    expect(subs[0]!.lines[0]!.bbox.x - subs[0]!.bbox.x).toBeCloseTo(30 + 5, 6);
  });

  it('leaves numbers that fit as they were', () => {
    const doc = buildDocument({ markdown: chapters(['One', 'Two']) }, config('{1}'));
    for (const b of entries(doc.blocks, 1)) expect(b.lines[0]!.bbox.x - b.bbox.x).toBeCloseTo(20 + 5, 6);
  });

  it('sets the Arabic chapter labels clear of their titles', () => {
    const doc = buildDocument({ markdown: chapters(['البداية', 'النهاية']) }, config('الفصل {1:ordinal}', { locale: 'ar' }));
    const rows = entries(doc.blocks, 1);
    expect(rows.map((b) => b.bulletText)).toEqual(['الفصل الأول', 'الفصل الثاني']);
    const widest = 'الفصل الثاني'.length * 7;
    for (const b of rows) {
      // The VDT is in the flow's frame (the page is mirrored when it is
      // painted): the label right-aligned in its column, the title after it.
      const line = b.lines[0]!;
      expect(line.bbox.x - b.bbox.x).toBeCloseTo(widest + 5, 6);
      expect(b.bulletOffsetX! + b.bulletText!.length * 7).toBeCloseTo(b.bbox.x + widest, 6);
    }
  });
});
