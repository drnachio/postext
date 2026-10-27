import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { linkTargetAtPixel, pixelToSourceOffset, placeLineSegments } from './geometry.js';

// #702: a reference whose label is words is painted word by word and may
// stand on two lines. Every piece is the reference: a click on any of them
// follows the link, and the caret maps the label to the reference's place
// in the source.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const LABEL = 'close the lever so that it points backwards';
const REF = ':ref{id="step"}';
const MD = `To fit it, tighten the nut, then [${LABEL}]{#step}. Squeeze the front brake twice.\n\nPress each tyre hard with your thumb. A tyre that gives easily needs air. Finally, check that both levers are closed, as ${REF} in the section on wheels describes.`;
const config: PostextConfig = {
  page: { dpi: 96, width: pt(250), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  headings: { levels: [] },
};

type Block = VDTDocument['blocks'][number];

describe('a reference label on two lines in the Sandbox canvas (#702)', () => {
  const doc = buildDocument({ markdown: MD }, config);
  const block: Block = doc.blocks.find((b) => b.lines.some((l) => l.segments?.some((s) => s.refResourceId !== undefined)))!;
  const lines = block.lines.filter((l) => l.segments?.some((s) => s.refResourceId !== undefined));
  /** Page coordinates of the middle of the last label word on `line`. */
  const lastWordCentre = (line: Block['lines'][number]): { x: number; y: number } => {
    const placed = placeLineSegments(block, line, false, false)!;
    const word = placed.filter((p) => p.seg.refResourceId !== undefined && p.seg.kind !== 'space').pop()!;
    return { x: word.x + word.width / 2, y: line.bbox.y + line.bbox.height / 2 };
  };

  it('breaks the label over two lines', () => {
    expect(lines).toHaveLength(2);
  });

  it('folds the pieces of a line into one box that is the reference\'s one character', () => {
    const first = placeLineSegments(block, lines[0]!, false)!.filter((p) => p.seg.refResourceId !== undefined);
    expect(first).toHaveLength(1);
    expect(first[0]!.plainLen).toBe(1);
    expect(LABEL.startsWith(first[0]!.seg.text)).toBe(true);
    expect(first[0]!.seg.text).toContain(' ');
    // The pieces of the second line count no character of their own.
    const second = placeLineSegments(block, lines[1]!, false)!.filter((p) => p.seg.refResourceId !== undefined);
    expect(second).toHaveLength(1);
    expect(second[0]!.plainLen).toBe(0);
    expect(LABEL.endsWith(second[0]!.seg.text)).toBe(true);
  });

  it('a click on a piece of either line follows the link', () => {
    for (const line of lines) {
      const { x, y } = lastWordCentre(line);
      expect(linkTargetAtPixel(doc, 0, x, y)).toMatchObject({ kind: 'anchor', id: 'step' });
    }
  });

  it('the caret maps the label to the reference in the source, and the text after it to itself', () => {
    const at = MD.indexOf(REF);
    for (const line of lines) {
      const { x, y } = lastWordCentre(line);
      const offset = pixelToSourceOffset(doc, 0, x, y)!;
      expect(offset).toBeGreaterThanOrEqual(at);
      expect(offset).toBeLessThanOrEqual(at + REF.length);
    }
    // A word after the label on the second line.
    const placed = placeLineSegments(block, lines[1]!, false, false)!;
    const after = placed.find((p) => p.seg.refResourceId === undefined && p.seg.text === 'section')!;
    const offset = pixelToSourceOffset(doc, 0, after.x + 1, lines[1]!.bbox.y + lines[1]!.bbox.height / 2)!;
    expect(MD.slice(offset, offset + 'section'.length)).toBe('section');
  });
});
