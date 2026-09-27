import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { LINE_MAX_SPACE_RATIO } from '../../pipeline/raggedLines';
import type { VDTBlock } from '../../vdt';
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

// The EF-104 repro (justification-lab): unhyphenated justified text in a
// narrow measure, once as running text and once inside a box.
const P = 'Unhyphenated justification in a narrow measure hands every shortfall to the few word spaces on the line. '
  + 'Hyphenation gives the line breaker intermediate possibilities, and the unevenness dissolves into adjustments too small to notice.';
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: mm(22), height: mm(120), margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'justify', hyphenation: { enabled: false } },
  calloutStyles: [{ id: 'n', body: { textAlign: 'justify', hyphenation: false }, padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) } }],
};
const markdown = `${P}\n\n:::callout{type="n"}\n${P}\n:::\n`;

const paragraphs = (inBox: boolean, blocks: readonly VDTBlock[]): VDTBlock[] =>
  blocks.filter((b) => b.type === 'paragraph' && (b.containerId !== undefined) === inBox);
const shape = (b: VDTBlock): string[] => b.lines.map((l) => (l.ragged ? `ragged ${l.text.trim()}` : l.text.trim()));

describe('box lines the breaker cannot fill are set ragged, as in running text (EF-104)', () => {
  it('sets no justified line of a box past 3x the normal space', () => {
    const doc = buildDocument({ markdown }, config, createMeasurementCache());
    const [body] = paragraphs(false, doc.blocks);
    const [box] = paragraphs(true, doc.blocks);
    expect(body).toBeDefined();
    expect(box).toBeDefined();
    // Non-vacuous: the running text has lines set ragged.
    expect(body!.lines.some((l) => l.ragged)).toBe(true);
    for (const l of box!.lines) {
      if (l.ragged || l.isLastLine) continue;
      expect(l.justifiedSpaceRatio ?? 0, l.text).toBeLessThanOrEqual(LINE_MAX_SPACE_RATIO);
    }
    // Same measure, same text, same breaks: the box sets its lines as the
    // running text does.
    expect(shape(box!)).toEqual(shape(body!));
  });

  it('leaves a split box with the same lines on both sides of the cut', () => {
    const tall = `${P}\n\n:::callout{type="n"}\n${P} ${P}\n:::\n`;
    const small: PostextConfig = { ...config, page: { ...config.page, height: mm(60) }, calloutStyles: [{ ...config.calloutStyles![0]!, keepTogether: false }] };
    const doc = buildDocument({ markdown: tall }, small, createMeasurementCache());
    const parts = paragraphs(true, doc.blocks);
    expect(parts.length).toBeGreaterThan(1);
    for (const b of parts) {
      for (const l of b.lines) {
        if (l.ragged || l.isLastLine) continue;
        expect(l.justifiedSpaceRatio ?? 0, l.text).toBeLessThanOrEqual(LINE_MAX_SPACE_RATIO);
      }
    }
  });
});
