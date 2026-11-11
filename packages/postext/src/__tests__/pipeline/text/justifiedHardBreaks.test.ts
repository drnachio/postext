import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { measureRichBlock } from '../../../measure/index.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../../defaults/text/bodyText.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// #1502: with `bodyText.justifyHardBreaks`, the line before a forced line
// break is justified in justified text; the paragraph's last line alone is
// set at its natural width.

// 7 px a character, whatever the font.
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

const BREAK = String.fromCharCode(0x2028);
const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (bodyText: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(0), textAlign: 'justify', fontFamily: 'Test', boldFontWeight: 700, hyphenation: { enabled: false }, ...bodyText },
});
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');

// 260 px of measure: 37 characters a line. Each kept line is a little short.
const KEPT = ['The quick brown fox jumps over the', 'lazy dog and keeps running across', 'the wide green field.'];
const MD = KEPT.join('\\\n');

describe('the measurer (#1502)', () => {
  const measure = (options: Record<string, unknown>) =>
    measureRichBlock([{ text: KEPT.join(BREAK), bold: false, italic: false }], '10px Test', '10px Test', '10px Test', '10px Test', 260, 14, options);

  it('sets the line before a break at its natural width without the option', () => {
    const { lines } = measure({ textAlign: 'justify' });
    expect(lines.map((l) => l.text.trim())).toEqual(KEPT);
    expect(lines.map((l) => l.isLastLine)).toEqual([true, true, true]);
    expect(lines[0]!.justifiedSpaceRatio).toBeUndefined();
  });

  it('justifies it with the option, the last line left short', () => {
    const { lines } = measure({ textAlign: 'justify', justifyForcedBreaks: true });
    expect(lines.map((l) => l.text.trim())).toEqual(KEPT);
    expect(lines.map((l) => l.isLastLine)).toEqual([false, false, true]);
    expect(lines.map((l) => l.hardBreak)).toEqual([true, true, undefined]);
    // 34 characters, 6 spaces: the 28 letters leave 260 - 196 px to six spaces.
    expect(lines[0]!.justifiedSpaceRatio).toBeCloseTo((260 - 28 * 7) / 6 / 7, 6);
    expect(lines[2]!.justifiedSpaceRatio).toBeUndefined();
  });

  it('counts the indent of the line the break ends', () => {
    const { lines } = measure({ textAlign: 'justify', justifyForcedBreaks: true, firstLineIndentPx: 14 });
    expect(lines[0]!.justifiedSpaceRatio).toBeCloseTo((246 - 28 * 7) / 6 / 7, 6);
    expect(lines[1]!.justifiedSpaceRatio).toBeCloseTo((260 - 28 * 7) / 5 / 7, 6);
  });

  it('leaves ragged text and a line with no space as they are', () => {
    expect(measure({ textAlign: 'left', justifyForcedBreaks: true }).lines.map((l) => l.isLastLine)).toEqual([true, true, true]);
    const one = measureRichBlock([{ text: `Word${BREAK}and the rest of it`, bold: false, italic: false }], '10px Test', '10px Test', '10px Test', '10px Test', 260, 14, { textAlign: 'justify', justifyForcedBreaks: true });
    expect(one.lines[0]!.isLastLine).toBe(true);
    expect(one.lines[0]!.hardBreak).toBe(true);
  });

  it('keeps the two settings apart in the cache key path: the same lines either way', () => {
    const off = measure({ textAlign: 'justify' });
    const on = measure({ textAlign: 'justify', justifyForcedBreaks: true });
    expect(on.lines.map((l) => l.text)).toEqual(off.lines.map((l) => l.text));
    expect(on.totalHeight).toBe(off.totalHeight);
  });
});

describe('a kept line set tight (#1502)', () => {
  // 38 characters in 37 characters of measure: the line fits with its six
  // spaces shrunk, and the breaker alone would rather send `fox` down.
  const TIGHT = 'The quick brown jumps over the lazy fox';
  const text = `${TIGHT}${BREAK}and the rest of the paragraph.`;
  const measure = (options: Record<string, unknown>) =>
    measureRichBlock([{ text, bold: false, italic: false }], '10px Test', '10px Test', '10px Test', '10px Test', 260, 14, { textAlign: 'justify', optimal: true, maxStretchRatio: 2, minShrinkRatio: 0.6, ...options });

  it('breaks before the forced break without the option', () => {
    expect(measure({}).lines.map((l) => l.text.trim())).toEqual(['The quick brown jumps over the lazy', 'fox', 'and the rest of the paragraph.']);
  });

  it('keeps the line whole with it, its spaces shrunk', () => {
    const { lines } = measure({ justifyForcedBreaks: true });
    expect(lines.map((l) => l.text.trim())).toEqual([TIGHT, 'and the rest of the paragraph.']);
    expect(lines[0]!.justifiedSpaceRatio).toBeLessThan(1);
    expect(lines[0]!.justifiedSpaceRatio).toBeGreaterThanOrEqual(0.6);
    expect(lines[0]!.isLastLine).toBe(false);
  });
});

describe('the layout (#1502)', () => {
  it('justifies kept lines when the setting is on', () => {
    const [p] = paragraphs(buildDocument({ markdown: MD }, config({ justifyHardBreaks: true })));
    expect(p!.lines!.map((l) => l.text.trim())).toEqual(KEPT);
    expect(p!.lines!.map((l) => l.isLastLine)).toEqual([false, false, true]);
    expect(p!.lines!.every((l) => !l.ragged)).toBe(true);
  });

  it('keeps them at their natural width by default', () => {
    const [p] = paragraphs(buildDocument({ markdown: MD }, config()));
    expect(p!.lines!.map((l) => l.isLastLine)).toEqual([true, true, true]);
  });

  it('sets a line too short to justify ragged', () => {
    const [p] = paragraphs(buildDocument({ markdown: `To you,\\\n${KEPT[0]} ${KEPT[1]}` }, config({ justifyHardBreaks: true })));
    const first = p!.lines![0]!;
    expect(first.text.trim()).toBe('To you,');
    expect(first.ragged).toBe(true);
    expect(first.justifiedSpaceRatio).toBeUndefined();
  });

  it('leaves ragged body text alone', () => {
    const [p] = paragraphs(buildDocument({ markdown: MD }, config({ justifyHardBreaks: true, textAlign: 'left' })));
    expect(p!.lines!.map((l) => l.isLastLine)).toEqual([true, true, true]);
  });
});

describe('the setting (#1502)', () => {
  it('resolves only when on, and is stripped when off', () => {
    expect(resolveBodyTextConfig({}).justifyHardBreaks).toBeUndefined();
    expect(resolveBodyTextConfig({ justifyHardBreaks: false }).justifyHardBreaks).toBeUndefined();
    expect(resolveBodyTextConfig({ justifyHardBreaks: true }).justifyHardBreaks).toBe(true);
    expect(stripBodyTextDefaults({ justifyHardBreaks: false })).toBeUndefined();
    expect(stripBodyTextDefaults({ justifyHardBreaks: true })).toEqual({ justifyHardBreaks: true });
  });
});
