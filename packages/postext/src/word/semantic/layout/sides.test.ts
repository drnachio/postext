// A styled section that widens the measure (#1458): an exam's cover runs
// across the sheet while the other pages keep a margin free. Its pages get
// a section of their own with the style's side margins, and its tables
// the room.

import { describe, expect, it } from 'vitest';
import { exportDocx, exportProblems, sectionsOf } from '../fixtures/harness.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });
const BASE = { layout: { layoutType: 'single' }, headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] } };
const PAGE = { width: mm(216), height: mm(279), margins: { top: mm(22), bottom: mm(24), left: mm(24), right: mm(58) } };
const MD = '# History {style="cover"}\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nCover text.\n\n:::pagebreak\n\n# Questions\n\nInner text.\n';

const margins = (sect: string): { left: number; right: number } => {
  const m = /<w:pgMar [^>]*w:right="(\d+)"[^>]*w:left="(\d+)"/.exec(sect)!;
  return { right: Number(m[1]), left: Number(m[2]) };
};

describe('semantic docx: a styled section wider than the book', () => {
  it('gives the cover its own section with the style’s side margins', async () => {
    const config = { ...BASE, page: PAGE, headingStyles: [{ id: 'cover', margins: { right: mm(24) } }] } as never;
    const e = await exportDocx(MD, { config });
    expect(exportProblems(e, [MD])).toEqual([]);
    const sects = sectionsOf(e.doc);
    expect(sects).toHaveLength(2);
    const cover = margins(sects[0]!);
    const inner = margins(sects[1]!);
    expect(cover.left).toBe(inner.left);
    // 24 mm against 58 mm.
    expect(cover.right).toBe(Math.round((24 / 25.4) * 1440));
    expect(inner.right).toBe(Math.round((58 / 25.4) * 1440));
    // The inner pages start on a new page, and no page break is left over.
    expect(sects[1]).toContain('<w:type w:val="nextPage"/>');
    expect(e.doc).not.toContain('<w:br w:type="page"/>');
  });

  it('keeps the book’s margins where the style narrows the measure', async () => {
    const config = { ...BASE, page: PAGE, headingStyles: [{ id: 'cover', margins: { right: mm(80), left: mm(40) } }] } as never;
    const e = await exportDocx(MD, { config });
    const sects = sectionsOf(e.doc);
    expect(new Set(sects.map((s) => JSON.stringify(margins(s)))).size).toBe(1);
  });

  it('leaves the plain design on one page geometry', async () => {
    const config = { ...BASE, page: PAGE, headingStyles: [{ id: 'cover', margins: { right: mm(24) } }] } as never;
    const e = await exportDocx(MD, { config, design: 'plain' });
    expect(new Set(sectionsOf(e.doc).map((s) => JSON.stringify(margins(s)))).size).toBe(1);
  });
});
