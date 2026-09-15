import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { collectColumnGaps } from '../../pipeline/columnBalancing';
import type { VDTDocument } from '../../vdt';
import type { PostextConfig } from '../../types';

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

const SENTENCE =
  'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';
const paragraph = (n: number): string => SENTENCE.repeat(n).trim();
const words = (n: number): string => Array.from({ length: n }, (_, i) => `palabra${i % 7}`).join(' ');

const NO_FORCED = new Set<number>();

/**
 * A section whose lead-in paragraph ("… son:") is followed by a list item
 * too tall to start in the room left under it, so the plain pass closes the
 * column with the colon line and the list opens the next column. `filler`
 * tunes how much room is left under the colon line.
 */
function markdown(filler: number): string {
  return [
    '# Documento de prueba',
    '',
    paragraph(3),
    '',
    '## Primera sección',
    '',
    paragraph(4),
    '',
    '### Detalle',
    '',
    words(filler),
    '',
    'Las funciones del gerente de área son:',
    '',
    `- ${paragraph(2)}`,
    `- ${paragraph(1)}`,
    '',
    paragraph(6),
    '',
    '## Segunda sección',
    '',
    paragraph(6),
    '',
    paragraph(6),
    '',
    '## Tercera sección',
    '',
    paragraph(6),
    '',
    paragraph(6),
    '',
    paragraph(6),
    '',
    '## Cuarta sección',
    '',
    paragraph(6),
    '',
    paragraph(6),
    '',
  ].join('\n');
}

function build(md: string, balancing: boolean): VDTDocument {
  const config: PostextConfig = { headings: { balancing: { enabled: balancing } } };
  return buildDocument({ markdown: md }, config, createMeasurementCache());
}

interface ColonColumn {
  pageIndex: number;
  columnIndex: number;
  contentIndex: number;
  gapLines: number;
}

/** The column the plain pass closed with the colon line, when it also left
 *  a gap under it that a heading above could absorb. Only on a page that
 *  flows on: the closing band of the document is levelled by a trailing
 *  cap, which re-cuts its columns on purpose. */
function colonColumn(doc: VDTDocument): ColonColumn | null {
  for (const gap of collectColumnGaps(doc, NO_FORCED)) {
    if (gap.pageIndex >= doc.pages.length - 1) continue;
    const col = doc.pages[gap.pageIndex]!.columns[gap.columnIndex]!;
    const last = col.blocks[col.blocks.length - 1];
    if (!last || last.type !== 'paragraph' || last.contentIndex === undefined) continue;
    const text = last.lines.map((l) => l.text).join(' ');
    if (!/:\s*$/.test(text)) continue;
    if (!gap.candidates.some((c) => c.kind === 'heading')) continue;
    return { pageIndex: gap.pageIndex, columnIndex: gap.columnIndex, contentIndex: last.contentIndex, gapLines: gap.gapLines };
  }
  return null;
}

const LONG = 60_000;

describe('column balancing keeps a colon lead-in where the plain pass put it', () => {
  it('fills the gap under the colon line instead of pushing the line to the next column', () => {
    // Find a filler length whose plain layout shows the scenario.
    let plain: VDTDocument | null = null;
    let md = '';
    let target: ColonColumn | null = null;
    for (let filler = 200; filler <= 360 && !target; filler += 10) {
      md = markdown(filler);
      plain = build(md, false);
      target = colonColumn(plain);
    }
    expect(target, 'no filler length reproduces the colon-at-column-foot scenario').not.toBeNull();
    if (!target || !plain) return;

    const balanced = build(md, true);

    // The colon line still closes the same column…
    const col = balanced.pages[target.pageIndex]!.columns[target.columnIndex]!;
    const last = col.blocks[col.blocks.length - 1];
    expect(last?.contentIndex).toBe(target.contentIndex);

    // …and the levers absorbed the gap the plain pass left under it.
    const gapAfter = collectColumnGaps(balanced, NO_FORCED)
      .find((g) => g.pageIndex === target.pageIndex && g.columnIndex === target.columnIndex);
    expect(gapAfter?.gapLines ?? 0).toBeLessThan(target.gapLines);

    // Balancing stayed local: every page holds the same content blocks.
    const blocksPerPage = (doc: VDTDocument) =>
      doc.pages.map((p) =>
        [...new Set(p.columns.flatMap((c) => c.blocks.map((b) => b.contentIndex)))].sort((a, b) => a! - b!).join(','),
      );
    expect(blocksPerPage(balanced)).toEqual(blocksPerPage(plain));
  }, LONG);
});
