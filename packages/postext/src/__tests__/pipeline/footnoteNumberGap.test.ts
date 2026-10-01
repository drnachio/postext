import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTBlock, VDTLine } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env): a
// word space narrower than a letter, an en space wider than a word space.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let width = 0;
    for (const ch of s) width += ch === ' ' ? 3 : ch === '\u2002' ? 5 : 7;
    return { width };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });

const CONFIG: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  footnotes: { textAlign: 'justify' },
};

/** The stub's word space. */
const WORD_SPACE = 3;

/** The width the renderers give each segment of a line: a justified line
 *  sets every space segment alike, at `justifiedSpaceRatio` word spaces
 *  (see `canvas-backend/blockRender.ts`). */
function setWidths(line: VDTLine): number[] {
  const ratio = line.justifiedSpaceRatio;
  return (line.segments ?? []).map((s) => (s.kind === 'space' && ratio !== undefined ? ratio * WORD_SPACE : s.width));
}

/** The gap between a note's number and its first word, as set. */
function numberGap(note: VDTBlock): number {
  const line = note.lines[0]!;
  const segs = line.segments!;
  const widths = setWidths(line);
  // The number is the first segment; the gap runs to the first word.
  expect(segs[0]!.text).toMatch(/^\d+$/);
  let i = 1;
  let gap = 0;
  while (i < segs.length && !/\p{L}/u.test(segs[i]!.text)) gap += widths[i++]!;
  return gap;
}

describe('the gap after a footnote number', () => {
  it.each(['superscript', 'inline'] as const)('is as wide in a justified multi-line note as in a one-line note (%s number)', (markerPosition) => {
    const md = [
      'Una frase corta con nota.[^corta] Otra frase con otra nota.[^larga]',
      '[^corta]: Nota breve.',
      '[^larga]: Esta nota es bastante más larga que la anterior y ocupa varias líneas justificadas en la columna, de modo que sus espacios entre palabras se estiran para llenar la medida.',
    ].join('\n\n');
    const doc = buildDocument({ markdown: md }, { ...CONFIG, footnotes: { ...CONFIG.footnotes, markerPosition } }, createMeasurementCache());
    const notes = doc.blocks.filter((b) => b.footnoteNote !== undefined);
    const short = notes.find((n) => n.footnoteNote === 'corta')!;
    const long = notes.find((n) => n.footnoteNote === 'larga')!;
    expect(short.lines).toHaveLength(1);
    expect(long.lines.length).toBeGreaterThan(1);
    // The long note's first line is justified: its word spaces are not at their natural width.
    const first = long.lines[0]!;
    expect(first.isLastLine).toBe(false);
    expect(first.justifiedSpaceRatio).toBeDefined();
    expect(first.justifiedSpaceRatio).not.toBeCloseTo(1, 6);
    const shortGap = numberGap(short);
    expect(shortGap).toBeGreaterThan(0);
    expect(numberGap(long)).toBeCloseTo(shortGap, 6);
    // The en space keeps its own width, and the line never breaks after the number.
    expect(shortGap).toBe(5);
    expect(long.lines[0]!.segments!.slice(0, 3).map((s) => s.kind)).toEqual(['text', 'text', 'text']);
  });
});
