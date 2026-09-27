import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env).
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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const fig: Resource = {
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'A figure.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 400, height: 200 },
  placement: { position: 'top' },
};

/** The riso-zine page (EF-158): 100 × 120 mm, one column, 9/13 pt. */
const config = (paragraphSpacing: boolean, stretchAfterFloats?: boolean): PostextConfig => ({
  page: { width: mm(100), height: mm(120), dpi: 150, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'serif', fontSize: pt(9), lineHeight: pt(13), textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing },
  ...(stretchAfterFloats === undefined ? {} : { headings: { balancing: { stretchAfterFloats } } }),
});

const words = (n: number, w: string) => Array.from({ length: n }, (_, i) => `${w} ${i}`).join(' ');
/** The citing paragraph, one that splits across pages 1 and 2 (`long`
 *  words), and one that goes on to page 3. */
const build = (long: number, cfg: PostextConfig): VDTDocument =>
  buildDocument({
    markdown: [`Cited here :ref{id="f"}. ${words(40, 'alpha')}`, words(long, 'beta'), words(100, 'gamma')].join('\n\n'),
    resources: [fig],
  }, cfg, createMeasurementCache());

/** Page 2's column and its first block: the rest of the split paragraph. */
const pageTwo = (doc: VDTDocument) => {
  const page = doc.pages[1]!;
  const col = page.columns[0]!;
  return { page, col, first: col.blocks[0]! };
};

describe('the rest of a split paragraph under a top float (EF-158: column balancing, by design)', () => {
  it('takes the room balancing leaves under the figure, and stays at the column head without it', () => {
    let levered = 0;
    for (const [spacing, long] of [[true, 170], [true, 185], [false, 175], [false, 180]] as const) {
      const on = pageTwo(build(long, config(spacing)));
      expect(on.page.floats?.length, `${spacing}/${long}`).toBe(1);
      expect(on.first.id, `${spacing}/${long}`).toMatch(/-cont-/);
      // Page 2 flows on to page 3: its column is balanced, and the line the
      // widow rule left at its foot goes under the figure — with paragraph
      // spacing or without it.
      expect(on.first.balancing?.levers, `${spacing}/${long}`).toContain('afterFloat');
      expect(on.first.bbox.y - on.col.bbox.y).toBeCloseTo(on.first.balancing!.spaceAbove, 1);
      levered++;
      // `stretchAfterFloats: false` keeps the text right under the figure.
      const off = pageTwo(build(long, config(spacing, false)));
      expect(off.first.balancing, `${spacing}/${long}`).toBeUndefined();
      expect(off.first.bbox.y).toBeCloseTo(off.col.bbox.y, 1);
    }
    expect(levered).toBe(4);
  });
});
