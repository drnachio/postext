import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTBlock, VDTColumn, VDTDocument } from '../../../vdt.js';
import type { PostextConfig } from '../../../types.js';

// A block that snaps the flow to the grid under itself, set at the foot of a
// column whose foot is off the grid (notes reserved there) or whose last line
// it stands on with a bottom margin, ends at the column's foot (#716): its box
// does not reach into the notes, and the column's room never reads negative.

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

/** 300 × 400 pt page at 72 dpi (1 pt = 1 px), 12 pt grid from y = 20, a
 *  260 pt column: four eight-letter words to the line. */
const cfg = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(12), textAlign: 'left', hyphenation: { enabled: false }, firstLineIndent: pt(0) },
  footnotes: { placement: 'column', fontSize: pt(8), lineHeight: pt(10.2), spaceBetween: pt(2.2) },
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7), lineHeight: pt(9.2), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(12) }],
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
} as PostextConfig);

const words = (n: number): string => Array.from({ length: n }, () => 'abcdefgh').join(' ');
const build = (markdown: string, config: PostextConfig): VDTDocument =>
  buildDocument({ markdown }, config, createMeasurementCache());

const foot = (c: VDTColumn): number => c.bbox.y + c.bbox.height;
const boxFoot = (b: VDTBlock): number => b.bbox.y + b.bbox.height;
const textFoot = (b: VDTBlock): number => {
  const last = b.lines[b.lines.length - 1]!;
  return last.bbox.y + last.bbox.height;
};

/** Every block's box inside its column, and no column with negative room. */
function expectBoxesInsideColumns(doc: VDTDocument): void {
  for (const page of doc.pages) {
    for (const col of page.columns) {
      expect(col.availableHeight).toBeGreaterThanOrEqual(-0.01);
      for (const b of col.blocks) expect(boxFoot(b)).toBeLessThanOrEqual(foot(col) + 0.01);
    }
  }
}

describe('a snapped block at a column foot (#716)', () => {
  const colophonDoc = (bodyLines: number): string =>
    `${words(bodyLines * 4 - 2)} note.[^a]\n\n[^a]: ${words(7)}\n\n:::paragraphs{style="colophon"}\n${words(9)}\n:::`;

  it('keeps a container tail above the notes of its column for every body length', () => {
    for (const bodyLines of [18, 19, 20, 21, 22, 23, 24]) {
      const doc = build(colophonDoc(bodyLines), cfg());
      expectBoxesInsideColumns(doc);
      const area = doc.pages[0]!.footnoteAreas![0]!;
      for (const b of doc.pages[0]!.columns[0]!.blocks) expect(boxFoot(b)).toBeLessThanOrEqual(area.bbox.y + 0.01);
    }
  });

  it('ends the box at the foot when the next grid line lies under it, with the lines where they were', () => {
    // 23 body lines: the snap (344) is above the foot (350.1) and stays.
    const above = build(colophonDoc(23), cfg());
    const colA = above.pages[0]!.columns[0]!;
    const tailA = colA.blocks[colA.blocks.length - 1]!;
    expect(textFoot(tailA)).toBeCloseTo(335.6, 1);
    expect(boxFoot(tailA)).toBeCloseTo(344, 1);
    expect(colA.availableHeight).toBeCloseTo(6.1, 1);

    // 24 body lines: the text ends at 347.6, the next grid line is 356 and
    // the column's foot 350.1.
    const at = build(colophonDoc(24), cfg());
    const colB = at.pages[0]!.columns[0]!;
    const tailB = colB.blocks[colB.blocks.length - 1]!;
    expect(at.pages).toHaveLength(1);
    expect(tailB.lines).toHaveLength(3);
    expect(tailB.bbox.y).toBeCloseTo(320, 1);
    expect(textFoot(tailB)).toBeCloseTo(347.6, 1);
    expect(boxFoot(tailB)).toBeCloseTo(foot(colB), 2);
    expect(colB.availableHeight).toBeCloseTo(0, 2);
  });

  it('holds for the last item of a list with a bottom margin on the column\'s last lines', () => {
    const config = cfg({ footnotes: {}, unorderedLists: { marginBottom: pt(14) } } as Partial<PostextConfig>);
    for (const bodyLines of [24, 25, 26, 27]) {
      const doc = build(`${words(bodyLines * 4 - 2)}\n\n- ${words(3)}\n- ${words(3)}\n\n${words(30)}`, config);
      expectBoxesInsideColumns(doc);
    }
    const doc = build(`${words(26 * 4 - 2)}\n\n- ${words(3)}\n- ${words(3)}\n\n${words(30)}`, config);
    const col = doc.pages[0]!.columns[0]!;
    const item = col.blocks[col.blocks.length - 1]!;
    expect(item.type).toBe('listItem');
    expect(textFoot(item)).toBeCloseTo(371, 1);
    expect(boxFoot(item)).toBeCloseTo(380, 2);
    // The text after the list opens the next page at its head.
    expect(doc.pages[1]!.columns[0]!.blocks[0]!.bbox.y).toBeCloseTo(20, 2);
  });

  it('holds for a heading whose text opens the next column', () => {
    const config = cfg({
      footnotes: {},
      headings: { keepWithNext: false, balancing: { enabled: false }, levels: [{ level: 2, marginBottom: pt(14) }] },
    } as Partial<PostextConfig>);
    for (const bodyLines of [24, 25, 26, 27]) {
      expectBoxesInsideColumns(build(`${words(bodyLines * 4 - 2)}\n\n## Head\n\n${words(30)}`, config));
    }
    const doc = build(`${words(26 * 4 - 2)}\n\n## Head\n\n${words(30)}`, config);
    const col = doc.pages[0]!.columns[0]!;
    const head = col.blocks[col.blocks.length - 1]!;
    expect(head.type).toBe('heading');
    expect(boxFoot(head)).toBeCloseTo(380, 2);
    expect(col.availableHeight).toBeCloseTo(0, 2);
    const next = doc.pages[1]!.columns[0]!.blocks[0]!;
    expect(next.type).toBe('paragraph');
    expect(next.bbox.y).toBeCloseTo(20, 2);
  });

  it('proposes the same level cut for a closing band with notes and a container tail at a column foot', () => {
    const md = `${words(23 * 2 - 1)} note.[^a]\n\n[^a]: ${words(5)}\n\n:::paragraphs{style="colophon"}\n${words(5)}\n:::\n\n${words(11)}`;
    const two = (trailing: boolean): PostextConfig =>
      cfg({ layout: { layoutType: 'double' }, headings: { balancing: { enabled: true, trailing } } } as Partial<PostextConfig>);

    // Without the cut the tail stands at the foot of the column with notes.
    const open = build(md, two(false));
    expectBoxesInsideColumns(open);
    const first = open.pages[0]!.columns[0]!;
    expect(boxFoot(first.blocks[first.blocks.length - 1]!)).toBeCloseTo(foot(first), 2);

    // With it, both columns are cut on the 17th line, as before.
    const level = build(md, two(true));
    expect(level.pages).toHaveLength(1);
    for (const col of level.pages[0]!.columns) {
      expect(col.trailingCap).toBe(true);
      expect(foot(col)).toBeCloseTo(20 + 17 * 12, 2);
    }
    expect(level.pages[0]!.columns[0]!.blocks.map((b) => b.lines.length)).toEqual([17]);
    expect(level.pages[0]!.columns[1]!.blocks.map((b) => b.lines.length)).toEqual([6, 3, 6]);
  });
});
